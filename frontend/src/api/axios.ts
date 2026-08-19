import axios from "axios";

import { useAuthStore } from "@/store/useAuthStore";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// CSRF 쿠키/헤더 이름 - backend/database.py의 Settings.csrf_cookie_name/csrf_header_name과
// 반드시 같은 문자열을 유지해야 한다(서버 설정을 프론트가 가져다 쓸 수 없어 양쪽에 각각
// 리터럴로 박아 둔 값이다 - 한쪽만 바꾸면 더블 서브밋 비교가 항상 실패한다).
const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "X-CSRF-Token";

export const api = axios.create({
  baseURL: API_BASE_URL,
  // httpOnly 인증 쿠키(+ CSRF 쿠키)가 프론트/백엔드 다른 origin(포트만 다른 로컬 개발
  // 포함) 간 요청에도 자동으로 실리게 한다 - 이게 없으면 브라우저가 교차 origin 요청에
  // 쿠키를 아예 첨부하지 않는다.
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

function readCsrfCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// 더블 서브밋 쿠키 패턴의 "제출" 쪽 - 로그인 시 서버가 심어 둔(httpOnly 아닌) CSRF 쿠키
// 값을 읽어 매 요청 헤더에 그대로 실어 보낸다. 백엔드 CsrfProtectionMiddleware가 상태 변경
// 요청(POST/PUT/PATCH/DELETE)마다 이 헤더 값과 쿠키 값이 일치하는지 검사한다 - 비로그인
// 상태(쿠키 자체가 없음)에서는 그냥 헤더를 안 붙이고 넘어간다(로그인/가입처럼 CSRF 대상이
// 아닌 요청들).
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const csrfToken = readCsrfCookie();
    if (csrfToken) {
      config.headers[CSRF_HEADER_NAME] = csrfToken;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      // 쿠키가 만료/무효화된 요청이 하나라도 401을 받으면, 화면(zustand)이 "로그인됨"으로
      // 착각한 채 남아있지 않도록 인증 상태 전체를 함께 로그아웃시킨다 - 여기서는 서버
      // 쿠키를 다시 지우러 갈 필요는 없다(이미 무효라 401이 난 것이므로), 클라이언트가
      // 들고 있던 user/isAuthenticated 상태만 정리하면 된다.
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export default api;
