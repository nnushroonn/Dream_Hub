import { create } from "zustand";

import type { AuthUser } from "@/api/auth";

// httpOnly 쿠키로 전환하며 localStorage 영속화(zustand persist)를 완전히 뺐다 - 예전엔
// 토큰(+user)을 "auth-storage" 키로 localStorage에 통째로 저장해 새로고침 시 즉시
// 복원했지만, 이제 진짜 인증 상태(access_token)는 JS가 읽을 수 없는 httpOnly 쿠키에만
// 있다. 그 쿠키를 client가 캐시해 봐야 의미가 없고(어차피 값을 못 읽는다), user 객체만
// 따로 캐싱하면 "쿠키는 이미 만료됐는데 화면엔 로그인된 것처럼 보이는" 상태가 새로고침
// 직후 잠깐 나타날 수 있어 오히려 헷갈린다 - 그래서 이 스토어는 항상 메모리에만 있고,
// 앱이 로드될 때마다 components/AuthHydrator.tsx가 GET /auth/me를 호출해 실제 서버 상태로
// 다시 채운다. 그 확인이 끝나기 전까지 isAuthenticated는 항상 false다(로그인 여부를 아직
// 모르는 상태와 "확인 완료, 비로그인"을 구분하지 않는다 - 짧은 깜빡임은 있을 수 있지만
// 현재 화면 구성에서는 감수할 만한 수준이라 별도 로딩 상태를 추가하지 않았다).
interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
  updateUser: (user: AuthUser) => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  login: (user) => set({ user, isAuthenticated: true }),
  logout: () => set({ user: null, isAuthenticated: false }),
  updateUser: (user) => set({ user }),
}));
