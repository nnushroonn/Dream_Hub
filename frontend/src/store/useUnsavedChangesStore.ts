import { create } from "zustand";

// 꿈 기록소처럼 여러 단계에 걸쳐 입력하는 폼이 화면에 떠 있는 동안, 헤더 내비게이션이
// 그 사실을 알 수 있도록 하는 전역 플래그. 컴포넌트 트리가 서로 다른 페이지(NavBar와
// 실제 입력 폼)라 props로 못 내려주니 여기서 공유한다. persist하지 않는다 - 탭을 새로
// 열면 당연히 초기화되어야 하는 세션 한정 상태다.
interface UnsavedChangesState {
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;
}

export const useUnsavedChangesStore = create<UnsavedChangesState>((set) => ({
  isDirty: false,
  setDirty: (dirty) => set({ isDirty: dirty }),
}));
