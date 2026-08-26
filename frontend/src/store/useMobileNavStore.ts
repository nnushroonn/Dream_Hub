import { create } from "zustand";

// NavBar의 모바일 햄버거 드로어 열림 상태 - 원래는 NavBar 로컬 state였지만, 온보딩 투어가
// 모바일에서 드로어 안의 항목(일기장/AI 해몽/사전/커뮤니티)을 스포트라이트하려면 투어
// 컨트롤러(NavBar 바깥)가 이 상태를 직접 열고 닫을 수 있어야 해서 스토어로 옮겼다.
interface MobileNavState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useMobileNavStore = create<MobileNavState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));
