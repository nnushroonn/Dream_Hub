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
    }),
    { name: "auth-storage" }
  )
);
