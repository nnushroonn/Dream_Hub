"""계정 보안 강화(로그인 브루트포스 방어/시크릿 fail-fast/비밀번호 재설정 1회성) 순수 로직
단위 테스트. 이 프로젝트에는 아직 테스트용 DB/Redis 픽스처가 없다(test_dream_recall_status.py
상단 주석 참고) - 그래서 실제 Redis 대신 이 파일 안에서만 쓰는 가벼운 인메모리 대역
(FakeRedis)으로 rate limiting 헬퍼와 SET NX 기반 1회성 토큰 로직을 검증한다. 로그인/가입/
재설정 엔드포인트 자체(DB 커밋이 필요한 흐름)는 기존 관례대로 띄운 서버에 대한 라이브
회귀 테스트로 확인한다."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import Settings, _validate_secrets
from routers import auth as auth_module
from routers.auth import (
    FORGOT_PASSWORD_LIMIT,
    LOGIN_FAILURE_LIMIT,
    REGISTER_ATTEMPT_LIMIT,
    _cookie_samesite,
    _cookie_secure,
    _forgot_password_key,
    _login_failure_key,
    _rate_limit_exceeded,
    _record_rate_limit_attempt,
    _register_attempt_key,
)


class FakeRedis:
    """routers.auth가 실제로 쓰는 4개 메서드(get/incr/expire/set)만 구현한 인메모리 대역.
    TTL은 실제로 만료시키지 않고 값만 저장한다 - 이 파일의 테스트는 "만료됐을 때" 동작이
    아니라 "카운트/1회성 로직 자체"만 검증하므로 충분하다."""

    def __init__(self) -> None:
        self._store: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self._store.get(key)

    def incr(self, key: str) -> int:
        current = int(self._store.get(key, "0")) + 1
        self._store[key] = str(current)
        return current

    def expire(self, key: str, seconds: int) -> None:
        pass  # TTL 자체는 이 테스트 범위 밖 - 값 저장 여부만 중요하다.

    def set(self, key: str, value: str, nx: bool = False, ex: int | None = None) -> bool:
        if nx and key in self._store:
            return False
        self._store[key] = value
        return True

    def delete(self, key: str) -> None:
        self._store.pop(key, None)


# --- 1. 로그인 브루트포스 방어 ---


def test_login_lockout_triggers_after_limit_failures():
    redis_client = FakeRedis()
    key = _login_failure_key("attacker@example.com")

    for _ in range(LOGIN_FAILURE_LIMIT):
        assert not _rate_limit_exceeded(redis_client, key, LOGIN_FAILURE_LIMIT)
        _record_rate_limit_attempt(redis_client, key, 600)

    # LOGIN_FAILURE_LIMIT번째 실패까지 기록된 뒤에는 다음 시도가 곧바로 막혀야 한다.
    assert _rate_limit_exceeded(redis_client, key, LOGIN_FAILURE_LIMIT)


def test_login_lockout_is_scoped_per_email():
    redis_client = FakeRedis()
    victim_key = _login_failure_key("victim@example.com")
    other_key = _login_failure_key("other@example.com")

    for _ in range(LOGIN_FAILURE_LIMIT):
        _record_rate_limit_attempt(redis_client, victim_key, 600)

    assert _rate_limit_exceeded(redis_client, victim_key, LOGIN_FAILURE_LIMIT)
    # 이메일이 다르면 완전히 별개의 카운터라 영향을 주지 않는다.
    assert not _rate_limit_exceeded(redis_client, other_key, LOGIN_FAILURE_LIMIT)


def test_login_failure_key_normalizes_case_and_whitespace():
    # 이메일 대소문자/공백만 다른 시도를 서로 다른 계정으로 취급하면 잠금을 쉽게 우회당한다.
    assert _login_failure_key("User@Example.com") == _login_failure_key(" user@example.com ")


# --- 2. 회원가입 이메일 열거 완화 (IP 기준 rate limit) ---


def test_register_rate_limit_triggers_after_limit_attempts():
    redis_client = FakeRedis()
    key = _register_attempt_key("203.0.113.5")

    for _ in range(REGISTER_ATTEMPT_LIMIT):
        assert not _rate_limit_exceeded(redis_client, key, REGISTER_ATTEMPT_LIMIT)
        _record_rate_limit_attempt(redis_client, key, 600)

    assert _rate_limit_exceeded(redis_client, key, REGISTER_ATTEMPT_LIMIT)


# --- 3. 비밀번호 재설정 요청 남용 방지 ---


def test_forgot_password_rate_limit_triggers_after_limit_requests():
    redis_client = FakeRedis()
    key = _forgot_password_key("target@example.com")

    for _ in range(FORGOT_PASSWORD_LIMIT):
        assert not _rate_limit_exceeded(redis_client, key, FORGOT_PASSWORD_LIMIT)
        _record_rate_limit_attempt(redis_client, key, 600)

    assert _rate_limit_exceeded(redis_client, key, FORGOT_PASSWORD_LIMIT)


# --- 4. 비밀번호 재설정 토큰 1회성 (SET NX 패턴) ---


def test_password_reset_token_single_use_via_set_nx():
    redis_client = FakeRedis()
    used_key = "auth:pwreset_used:some-jti"

    # 첫 사용 - 성공(원자적으로 "사용됨"으로 표시).
    first = redis_client.set(used_key, "1", nx=True, ex=3600)
    assert first is True

    # 같은 jti로 재사용 시도 - 이미 표시돼 있으므로 실패해야 한다(1회성 보장).
    second = redis_client.set(used_key, "1", nx=True, ex=3600)
    assert second is False


def test_password_reset_different_tokens_are_independent():
    redis_client = FakeRedis()
    assert redis_client.set("auth:pwreset_used:jti-a", "1", nx=True, ex=3600) is True
    # 서로 다른 토큰(jti)은 완전히 독립된 키라 하나를 썼다고 다른 하나가 막히지 않는다.
    assert redis_client.set("auth:pwreset_used:jti-b", "1", nx=True, ex=3600) is True


# --- 5. 시크릿 placeholder fail-fast ---


def test_settings_placeholder_secret_only_warns_in_development(caplog):
    settings = Settings(environment="development", jwt_secret_key="change-this-to-a-long-random-secret")
    _validate_secrets(settings)  # 예외 없이 통과해야 한다(경고만).


def test_settings_placeholder_jwt_secret_blocks_production_startup():
    settings = Settings(
        environment="production",
        jwt_secret_key="change-this-to-a-long-random-secret",
        session_secret_key="a-real-random-session-secret-value",
    )
    try:
        _validate_secrets(settings)
        assert False, "production + placeholder jwt_secret_key는 RuntimeError를 던져야 한다"
    except RuntimeError:
        pass


def test_settings_placeholder_session_secret_blocks_production_startup():
    settings = Settings(
        environment="production",
        jwt_secret_key="a-real-random-jwt-secret-value",
        session_secret_key="change-this-session-secret",
    )
    try:
        _validate_secrets(settings)
        assert False, "production + placeholder session_secret_key는 RuntimeError를 던져야 한다"
    except RuntimeError:
        pass


def test_settings_real_secrets_start_fine_in_production():
    settings = Settings(
        environment="production",
        jwt_secret_key="a-real-random-jwt-secret-value",
        session_secret_key="a-real-random-session-secret-value",
    )
    _validate_secrets(settings)  # 예외 없이 통과해야 한다.


def test_settings_environment_check_is_case_insensitive():
    settings = Settings(environment="PRODUCTION", jwt_secret_key="change-this-to-a-long-random-secret")
    try:
        _validate_secrets(settings)
        assert False, "'PRODUCTION'(대문자)도 production으로 취급해야 한다"
    except RuntimeError:
        pass


# --- 6. 프로덕션 크로스도메인 인증 쿠키(SameSite=None + Secure) ---
# 프론트(Cloudflare Pages)와 백엔드(Render)가 서로 다른 등록 도메인이라 "lax"로는
# AuthHydrator가 로드마다 보내는 GET /auth/me 같은 교차 사이트 fetch에 쿠키가 실리지
# 않아, 구글 로그인 리다이렉트는 성공해도 로그인 상태가 반영되지 않는 버그가 있었다
# (Lax는 최상위 내비게이션에만 쿠키를 허용한다). auth_module.settings는 lru_cache로
# 캐시된 전역 싱글턴이라, 각 테스트가 environment를 바꾼 뒤 반드시 원래 값으로 되돌려
# 다른 테스트에 영향을 주지 않게 한다.


def test_cookie_samesite_is_none_in_production():
    original = auth_module.settings.environment
    try:
        auth_module.settings.environment = "production"
        assert _cookie_secure() is True
        assert _cookie_samesite() == "none"
    finally:
        auth_module.settings.environment = original


def test_cookie_samesite_is_lax_in_development():
    original = auth_module.settings.environment
    try:
        auth_module.settings.environment = "development"
        assert _cookie_secure() is False
        assert _cookie_samesite() == "lax"
    finally:
        auth_module.settings.environment = original


def test_cookie_samesite_none_always_paired_with_secure():
    # SameSite=None인데 Secure가 아니면 브라우저가 쿠키 자체를 버린다 - 두 판정이 절대
    # 어긋나면 안 된다(samesite="none" and not secure인 조합은 있어서는 안 된다).
    for env in ("development", "production", "PRODUCTION", "staging"):
        original = auth_module.settings.environment
        try:
            auth_module.settings.environment = env
            if _cookie_samesite() == "none":
                assert _cookie_secure() is True, f"env={env}: SameSite=None인데 Secure=False"
        finally:
            auth_module.settings.environment = original
