import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { AuthUser } from "@/api/auth";

const ACCESS_TOKEN_KEY = "accessToken";

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
  /** 닉네임 변경처럼, 로그인 상태는 그대로 두고 유저 정보 일부만 갱신할 때 쓴다.
   * 여기서 갱신하면 이 상태를 구독하는 헤더/마이페이지 등이 즉시 동기화된다. */
  updateUser: (user: AuthUser) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (user, token) => {
        localStorage.setItem(ACCESS_TOKEN_KEY, token);
        set({ user, token, isAuthenticated: true });
      },
      logout: () => {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        set({ user: null, token: null, isAuthenticated: false });
      },
      updateUser: (user) => set({ user }),
    }),
    { name: "auth-storage" }
  )
);
