"use client";

interface UnsavedChangesGuardModalProps {
  open: boolean;
  message: string;
  onStay: () => void;
  onLeave: () => void;
}

// 작성 중인 폼이 있는 상태로 헤더 메뉴 등 앱 내부 링크를 클릭했을 때 뜨는 커스텀 이탈 방지 모달.
// "이동하기"를 눌러도 실시간 자동 임시 저장 초안은 그대로 남아있다 - 다음에 돌아오면 복원할 수 있다.
export default function UnsavedChangesGuardModal({ open, message, onStay, onLeave }: UnsavedChangesGuardModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex h-screen w-screen items-center justify-center bg-black/70 backdrop-blur-md"
      onClick={onStay}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-purple-500/20 bg-[#0d0e12] p-6 text-center shadow-[0_0_60px_rgba(139,92,246,0.25)]"
      >
        <p className="text-lg font-semibold text-white">⚠️ 작성 중인 내용이 있습니다</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{message}</p>

        <div className="mt-6 flex gap-2.5">
          <button
            type="button"
            onClick={onStay}
            className="flex-1 rounded-full border border-violet-400/40 bg-violet-500/15 px-5 py-2.5 text-sm font-semibold text-violet-100 transition-transform hover:-translate-y-0.5"
          >
            이어서 작성하기
          </button>
          {/* 보조 액션 - 주 액션(보라)과 겹치지 않는 무채색 회색 톤으로 위계를 분리한다. */}
          <button
            type="button"
            onClick={onLeave}
            className="flex-1 rounded-full border border-slate-700 bg-slate-800/50 px-5 py-2.5 text-sm text-slate-300 transition-colors hover:border-red-400/40 hover:text-red-200"
          >
            이동하기
          </button>
        </div>
      </div>
    </div>
  );
}
