import { create } from "zustand";

export type LoginModalTriggerSource = "diary" | "calendar" | "result" | "community" | "mypage" | "journal" | "save";

interface LoginModalState {
  isOpen: boolean;
  // 로그인 완료 즉시(이메일/비밀번호 - 페이지 이동 없이) 이어서 실행할 콜백.
  onSuccess: (() => void) | null;
  // 구글 OAuth처럼 전체 페이지 리다이렉트를 거치는 경로를 위한 목적지 - 구글 버튼을 누르는
  // 순간 pendingRedirect(localStorage)에 실어 보내고, 홈으로 돌아왔을 때 그리로 이어간다.
  redirectPath: string | null;
  // 유저가 어떤 진입점에서 모달을 열었는지 - 모달 헤더 카피를 그 맥락에 맞게 바꾸는 데 쓰인다.
  triggerSource: LoginModalTriggerSource | null;
  open: (options?: { onSuccess?: () => void; redirectPath?: string; triggerSource?: LoginModalTriggerSource }) => void;
  close: () => void;
}

export const useLoginModalStore = create<LoginModalState>((set) => ({
  isOpen: false,
  onSuccess: null,
  redirectPath: null,
  triggerSource: null,
  open: (options) =>
    set({
      isOpen: true,
      onSuccess: options?.onSuccess ?? null,
      redirectPath: options?.redirectPath ?? null,
      triggerSource: options?.triggerSource ?? null,
    }),
  close: () => set({ isOpen: false, onSuccess: null, redirectPath: null, triggerSource: null }),
}));
