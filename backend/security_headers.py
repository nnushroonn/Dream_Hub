"""보안 응답 헤더 미들웨어 - 이 백엔드는 페이지를 그리는 서버가 아니라 순수 JSON API지만
(실제 CSP/X-Frame-Options 등의 효력은 프론트엔드 쪽 정적 배포 헤더(frontend/public/_headers)
가 주로 담당한다), 방어 심층화 차원에서 여기도 최소한의 헤더를 둔다 - 예를 들어 /health나
에러 페이지가 실수로 HTML을 반환하는 경우, 혹은 이 API가 브라우저에서 직접 열리는 경우까지
대비한다.

HTTPS 강제 리다이렉트는 "production" 환경에서만 켠다 - 로컬 개발(http://localhost)에서
강제로 걸면 개발 자체가 막히고, 리버스 프록시가 TLS를 종료하고 내부적으로는 http로 백엔드에
전달하는 흔한 배포 구조에서는 X-Forwarded-Proto 헤더를 먼저 신뢰해 무한 리다이렉트를
피한다(프록시가 이 헤더를 안 보내는 특이 구조라면 이 로직을 다시 맞춰야 한다 - 코드만으로는
실제 배포 토폴로지를 알 수 없어 이 전제를 명시해 둔다)."""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import RedirectResponse, Response

# 순수 JSON API용 최소 CSP - 페이지를 그리지 않으므로 스크립트/스타일 등을 아예 다 막아도
# 정상 기능에 영향이 없다. 그래도 이 응답이 어쩌다 브라우저에서 직접 렌더링될 경우(예: 원시
# HTML 에러 페이지)를 대비해 최대한 좁게 잡는다.
_API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, *, force_https: bool) -> None:
        super().__init__(app)
        self.force_https = force_https

    async def dispatch(self, request: Request, call_next) -> Response:
        if self.force_https and not self._is_secure(request):
            https_url = request.url.replace(scheme="https")
            return RedirectResponse(url=str(https_url), status_code=308)

        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = _API_CSP
        # HSTS는 HTTPS 응답에서만 의미가 있고(브라우저도 HTTP 응답의 HSTS 헤더는 무시한다),
        # 로컬 개발(HTTP)에는 아예 안 보내 "다음부터 이 호스트는 HTTPS로만" 같은 규칙이
        # localhost에 잘못 학습되는 일을 막는다.
        if self._is_secure(request):
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    @staticmethod
    def _is_secure(request: Request) -> bool:
        forwarded_proto = request.headers.get("x-forwarded-proto")
        if forwarded_proto:
            return forwarded_proto.split(",")[0].strip().lower() == "https"
        return request.url.scheme == "https"
