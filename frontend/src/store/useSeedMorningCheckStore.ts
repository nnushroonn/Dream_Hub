import { create } from "zustand";

// SeedMorningCheckModal의 표시 여부를 그대로 미러링만 하는 스토어 - 그 컴포넌트의 실제
// 열림/닫힘 판단(pendingSeed 유무, "괜찮아요" 상태 전환 등)은 여전히 컴포넌트 로컬 상태가
// 담당한다. 온보딩 투어(OnboardingTour.tsx)가 "지금 다른 모달이 떠 있는가"를 외부에서
// 읽을 방법이 필요해서, 그 값 하나만 추가로 여기에 반영해 둔다.
interface SeedMorningCheckState {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
}

export const useSeedMorningCheckStore = create<SeedMorningCheckState>((set) => ({
  isOpen: false,
  setOpen: (isOpen) => set({ isOpen }),
}));
