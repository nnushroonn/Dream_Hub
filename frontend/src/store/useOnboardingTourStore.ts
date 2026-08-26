import { create } from "zustand";

// 저널/정원 등 다른 페이지의 "도움말" 버튼에서 "전체 둘러보기 다시 보기"를 눌렀을 때 쓰는
// 최소 상태 - 투어 자체는 홈 화면(OnboardingTour.tsx)에만 있어서, 다른 페이지에서는 홈으로
// 이동만 시키고 이 플래그를 남겨 둔다. 구글 OAuth 리다이렉트와 달리 next/link 클라이언트
// 사이드 네비게이션이라 메모리(zustand) 값이 페이지 이동 중에도 그대로 유지된다.
interface OnboardingTourState {
  manualStartRequested: boolean;
  requestManualStart: () => void;
  consumeManualStart: () => void;
}

export const useOnboardingTourStore = create<OnboardingTourState>((set) => ({
  manualStartRequested: false,
  requestManualStart: () => set({ manualStartRequested: true }),
  consumeManualStart: () => set({ manualStartRequested: false }),
}));
