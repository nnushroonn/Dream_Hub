"""더블 서브밋 쿠키(double-submit cookie) 패턴으로 CSRF를 방어한다.

**왜 이 방식을 골랐는지**: 커스텀 헤더 존재 여부만 확인하는 더 단순한 방식("브라우저는
교차 사이트 요청에 임의 헤더를 못 붙이니, 헤더가 있다는 사실 자체가 same-origin 증거")도
이 프로젝트의 엄격한 CORS 설정(와일드카드 아닌 명시적 origin + allow_credentials=True)
위에서는 사실상 동작한다. 하지만 그 방식은 "CORS 설정이 앞으로도 계속 올바르게 유지된다"는
가정에만 기대는 단일 방어선이다 - 이 프로젝트는 애초에 이번 감사 과정에서 보안 설정 실수를
몇 차례 발견하고 고쳐 온 이력이 있어(예: 시크릿 placeholder 기본값, 브루트포스 방어 부재),
CORS 설정 하나가 나중에 실수로 느슨해지더라도(예: 새 라우터 추가 중 무심코 origin을
넓히는 실수) 별도로 여전히 막아주는 방어선을 하나 더 두는 쪽을 선택했다. 더블 서브밋
패턴은 "쿠키 값과 헤더 값이 실제로 일치하는가"라는 자체적인 비밀(랜덤 CSRF 토큰)을
검증하므로, CORS 설정과 독립적으로 성립한다.

**검사 대상**: 이미 로그인된(access_token 쿠키가 있는) 요청의 상태 변경 메서드(POST/PUT/
PATCH/DELETE)만 검사한다. 로그인/가입/비밀번호 찾기처럼 아직 세션이 없는 진입점은 애초에
탈취할 "기존 세션"이 없어 CSRF의 대상이 아니다(그 요청들 자체의 정당성은 비밀번호/재설정
토큰 검증이 이미 담당한다) - 그래서 여기서는 경로를 일일이 예외 처리하는 대신 "access_token
쿠키가 실려 있는가"만 게이트로 쓴다."""

from __future__ import annotations

import secrets

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class CsrfProtectionMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app,
        *,
        access_token_cookie_name: str,
        csrf_cookie_name: str,
        csrf_header_name: str,
    ) -> None:
        super().__init__(app)
        self.access_token_cookie_name = access_token_cookie_name
        self.csrf_cookie_name = csrf_cookie_name
        self.csrf_header_name = csrf_header_name

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method in _MUTATING_METHODS and self.access_token_cookie_name in request.cookies:
            csrf_cookie = request.cookies.get(self.csrf_cookie_name)
            csrf_header = request.headers.get(self.csrf_header_name)
            # secrets.compare_digest로 상수 시간 비교한다 - 문자열을 == 로 비교하면 처음 몇
            # 글자가 다를수록 더 빨리 리턴되는 타이밍 차이가 이론상 토큰을 한 글자씩 추측하는
            # 데 악용될 수 있다.
            if not csrf_cookie or not csrf_header or not secrets.compare_digest(csrf_cookie, csrf_header):
                return JSONResponse({"detail": "CSRF 토큰이 유효하지 않습니다."}, status_code=403)
        return await call_next(request)
