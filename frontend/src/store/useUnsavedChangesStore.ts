import { create } from "zustand";

// 꿈 기록소처럼 여러 단계에 걸쳐 입력하는 폼이 화면에 떠 있는 동안, 헤더 내비게이션이
// 그 사실을 알 수 있도록 하는 전역 플래그. 컴포넌트 트리가 서로 다른 페이지(NavBar와
// 실제 입력 폼)라 props로 못 내려주니 여기서 공유한다. persist하지 않는다 - 탭을 새로
// 열면 당연히 초기화되어야 하는 세션 한정 상태다.
export const DEFAULT_UNSAVED_CHANGES_MESSAGE =
  "지금 페이지를 벗어나면 작성 중인 무의식 기록이 사라집니다. 정말 이동하시겠습니까?";

interface UnsavedChangesState {
  isDirty: boolean;
  // 가드 모달에 띄울 문구 - 일반 작성 중 이탈과 "AI 해몽 리포트 미저장" 같은 더 급한 경고를
  // 문맥에 맞게 구분해서 보여주기 위해 호출부가 선택적으로 지정할 수 있다.
  message: string;
  setDirty: (dirty: boolean, message?: string) => void;
}

export const useUnsavedChangesStore = create<UnsavedChangesState>((set) => ({
  isDirty: false,
  message: DEFAULT_UNSAVED_CHANGES_MESSAGE,
  setDirty: (dirty, message) =>
    set({ isDirty: dirty, message: dirty ? (message ?? DEFAULT_UNSAVED_CHANGES_MESSAGE) : DEFAULT_UNSAVED_CHANGES_MESSAGE }),
}));
