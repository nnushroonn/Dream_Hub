"""AI 비용 절감을 위한 일일 사용량 한도(AI 해몽 daily cap + 꿈사전 daily cap) 순수 로직
단위 테스트. test_auth_security.py와 동일한 이유로 이 프로젝트에는 아직 테스트용 DB/Redis
픽스처가 없어, 실제 Redis 대신 그 파일과 동일한 인메모리 FakeRedis 대역을 쓴다. 라이브
회귀 검증(실제 429 응답, 캐시 히트 시 카운트 미소비, scenario-detail 프롬프트 캐싱 적중)은
기존 관례대로 띄운 서버에 대한 curl로 별도 확인한다."""

import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException

from routers.ai_interpretation import (
    AI_INTERPRET_ANON_DAILY_LIMIT,
    AI_INTERPRET_ANON_LIMIT,
    AI_INTERPRET_USER_DAILY_LIMIT,
    AI_INTERPRET_USER_LIMIT,
    _enforce_ai_interpret_rate_limit,
)
from routers.dictionary import DICTIONARY_DAILY_LIMIT, _enforce_dictionary_daily_limit


class FakeRedis:
    """routers.auth의 _rate_limit_exceeded/_record_rate_limit_attempt가 쓰는 get/incr/expire
    3개 메서드만 구현한 인메모리 대역 (test_auth_security.py의 FakeRedis와 동일). TTL은 실제로
    만료시키지 않는다 - 이 파일의 테스트는 "만료됐을 때" 동작이 아니라 한도 자체를 검증한다."""

    def __init__(self) -> None:
        self._store: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self._store.get(key)

    def incr(self, key: str) -> int:
        current = int(self._store.get(key, "0")) + 1
        self._store[key] = str(current)
        return current

    def expire(self, key: str, seconds: int) -> None:
        pass


def _fake_request(ip: str = "203.0.113.10") -> SimpleNamespace:
    return SimpleNamespace(client=SimpleNamespace(host=ip))


class FakeUser:
    def __init__(self, user_id: int) -> None:
        self.id = user_id


# --- 1. AI 해몽 일일 한도 (기존 10분 버스트 한도 옆에 병렬로 얹은 86400초 창) ---


def test_ai_interpret_daily_limit_blocks_logged_in_user_after_limit():
    redis_client = FakeRedis()
    user = FakeUser(1)
    request = _fake_request()

    for _ in range(AI_INTERPRET_USER_DAILY_LIMIT):
        _enforce_ai_interpret_rate_limit(redis_client, user, request)  # 한도 내에서는 통과해야 한다

    try:
        _enforce_ai_interpret_rate_limit(redis_client, user, request)
        assert False, f"로그인 사용자는 하루 {AI_INTERPRET_USER_DAILY_LIMIT}회를 넘기면 429여야 한다"
    except HTTPException as exc:
        assert exc.status_code == 429


def test_ai_interpret_daily_limit_blocks_anon_after_limit():
    redis_client = FakeRedis()
    request = _fake_request("198.51.100.20")

    for _ in range(AI_INTERPRET_ANON_DAILY_LIMIT):
        _enforce_ai_interpret_rate_limit(redis_client, None, request)

    try:
        _enforce_ai_interpret_rate_limit(redis_client, None, request)
        assert False, f"익명은 하루 {AI_INTERPRET_ANON_DAILY_LIMIT}회를 넘기면 429여야 한다"
    except HTTPException as exc:
        assert exc.status_code == 429


def test_ai_interpret_daily_limit_is_stricter_than_burst_limit():
    # 확정된 수치 관계: 일일 한도가 버스트 한도보다 낮아야 실질적인 상한으로 작동한다
    # (그렇지 않으면 10분 버스트가 먼저 걸려 일일 한도가 죽은 코드가 된다).
    assert AI_INTERPRET_USER_DAILY_LIMIT < AI_INTERPRET_USER_LIMIT
    assert AI_INTERPRET_ANON_DAILY_LIMIT < AI_INTERPRET_ANON_LIMIT


def test_ai_interpret_daily_counter_is_scoped_per_user():
    redis_client = FakeRedis()
    user_a = FakeUser(1)
    user_b = FakeUser(2)
    request = _fake_request()

    for _ in range(AI_INTERPRET_USER_DAILY_LIMIT):
        _enforce_ai_interpret_rate_limit(redis_client, user_a, request)

    # user_a는 오늘 한도를 다 썼지만 user_b는 완전히 별개의 카운터라 영향받지 않아야 한다.
    _enforce_ai_interpret_rate_limit(redis_client, user_b, request)  # 예외 없이 통과해야 한다


def test_ai_interpret_daily_counter_shared_across_normal_and_quick_endpoints():
    # dream-interpretation과 dream-interpretation-quick 둘 다 이 헬퍼 하나만 거치므로,
    # 두 엔드포인트를 번갈아 호출해도 같은 카운터를 공유해야 한다(우회 방지).
    redis_client = FakeRedis()
    user = FakeUser(7)
    request = _fake_request()

    for _ in range(AI_INTERPRET_USER_DAILY_LIMIT):
        _enforce_ai_interpret_rate_limit(redis_client, user, request)

    try:
        _enforce_ai_interpret_rate_limit(redis_client, user, request)
        assert False, "일일 한도를 다 쓴 뒤에는 quick 엔드포인트로 갈아타도 막혀야 한다"
    except HTTPException as exc:
        assert exc.status_code == 429


# --- 2. 꿈사전 일일 한도 (캐시 미스 시점에서만 호출된다는 전제 - 이 파일은 그 전제 하의
# 카운터 로직만 검증하고, "캐시 히트 시 실제로 이 함수가 호출되지 않는지"는 dictionary.py의
# 라우트 코드 자체(캐시 미스 분기 안에서만 호출)로 보장된다) ---


def test_dictionary_daily_limit_blocks_after_limit():
    redis_client = FakeRedis()
    request = _fake_request("192.0.2.50")

    for _ in range(DICTIONARY_DAILY_LIMIT):
        _enforce_dictionary_daily_limit(redis_client, request)  # 한도 내에서는 통과해야 한다

    try:
        _enforce_dictionary_daily_limit(redis_client, request)
        assert False, f"IP당 하루 {DICTIONARY_DAILY_LIMIT}회를 넘기면 429여야 한다"
    except HTTPException as exc:
        assert exc.status_code == 429


def test_dictionary_daily_limit_counter_shared_across_endpoints():
    # search/parse-query/scenarios/scenario-detail 4개 엔드포인트가 모두 이 함수 하나만
    # 거치므로, 어느 엔드포인트에서 호출하든 같은 IP 카운터를 공유해야 한다(엔드포인트를
    # 갈아타 사실상 4배로 한도를 우회하는 것을 막기 위함).
    redis_client = FakeRedis()
    request = _fake_request("192.0.2.51")

    for _ in range(DICTIONARY_DAILY_LIMIT):
        _enforce_dictionary_daily_limit(redis_client, request)

    try:
        _enforce_dictionary_daily_limit(redis_client, request)
        assert False, "4개 엔드포인트가 공유하는 카운터라 한도 소진 후에는 어느 쪽을 불러도 막혀야 한다"
    except HTTPException as exc:
        assert exc.status_code == 429


def test_dictionary_daily_limit_is_scoped_per_ip():
    redis_client = FakeRedis()
    request_a = _fake_request("192.0.2.60")
    request_b = _fake_request("192.0.2.61")

    for _ in range(DICTIONARY_DAILY_LIMIT):
        _enforce_dictionary_daily_limit(redis_client, request_a)

    # IP가 다르면 완전히 별개의 카운터라 영향을 주지 않아야 한다.
    _enforce_dictionary_daily_limit(redis_client, request_b)  # 예외 없이 통과해야 한다
