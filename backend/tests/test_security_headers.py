"""SecurityHeadersMiddleware(응답 헤더 + HTTPS 강제 리다이렉트) 단위 테스트. 실제 라이브
서버 재기동 없이도 production 시나리오(force_https=True)를 검증할 수 있도록, 미들웨어만
붙인 최소 ASGI 앱을 여기서 직접 띄운다(TestClient는 실제 소켓을 열지 않고 ASGI 프로토콜
자체를 호출하므로 uvicorn 재시작 없이도 프로덕션 모드 분기를 확인할 수 있다)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI
from fastapi.testclient import TestClient

from security_headers import SecurityHeadersMiddleware


def _make_client(force_https: bool) -> TestClient:
    app = FastAPI()

    @app.get("/ping")
    def ping():
        return {"ok": True}

    app.add_middleware(SecurityHeadersMiddleware, force_https=force_https)
    # follow_redirects=False로 둬야 308 리다이렉트 자체를 검사할 수 있다(따라가 버리면
    # 항상 최종 200만 보게 된다).
    return TestClient(app, base_url="http://testserver", follow_redirects=False)


def test_security_headers_present_regardless_of_https_mode():
    client = _make_client(force_https=False)
    res = client.get("/ping")
    assert res.status_code == 200
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["x-frame-options"] == "DENY"
    assert res.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "default-src 'none'" in res.headers["content-security-policy"]


def test_development_mode_never_redirects_even_over_http():
    client = _make_client(force_https=False)
    res = client.get("/ping")
    assert res.status_code == 200
    # HTTP 요청에는 HSTS를 보내지 않는다(브라우저도 어차피 HTTP 응답의 HSTS는 무시하고,
    # localhost 개발 환경에 "이 호스트는 항상 HTTPS로만" 규칙이 잘못 학습되는 걸 막는다).
    assert "strict-transport-security" not in res.headers


def test_production_mode_redirects_plain_http_to_https():
    client = _make_client(force_https=True)
    res = client.get("/ping")
    assert res.status_code == 308
    assert res.headers["location"].startswith("https://")


def test_production_mode_trusts_x_forwarded_proto_https_and_skips_redirect():
    # 리버스 프록시가 TLS를 종료하고 내부적으로는 http로 전달하는 흔한 구조 - 이 헤더가
    # 있으면 이미 안전한 연결로 간주해 리다이렉트 루프를 만들지 않는다.
    client = _make_client(force_https=True)
    res = client.get("/ping", headers={"x-forwarded-proto": "https"})
    assert res.status_code == 200
    assert res.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"


def test_production_mode_still_redirects_when_forwarded_proto_says_http():
    client = _make_client(force_https=True)
    res = client.get("/ping", headers={"x-forwarded-proto": "http"})
    assert res.status_code == 308
