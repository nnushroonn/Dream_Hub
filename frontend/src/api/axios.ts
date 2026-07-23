import axios from "axios";

import { useAuthStore } from "@/store/useAuthStore";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      // 토큰이 만료/무효화된 요청이 하나라도 401을 받으면, 화면(zustand)이 "로그인됨"으로
      // 착각한 채 남아있지 않도록 인증 상태 전체를 함께 로그아웃시킨다. 이걸 빠뜨리면
      // localStorage의 accessToken만 사라지고 useAuthStore.isAuthenticated는 그대로 true라,
      // 저장 버튼은 계속 활성화된 채로 매 요청이 "Not authenticated"로 조용히 실패한다.
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export default api;
