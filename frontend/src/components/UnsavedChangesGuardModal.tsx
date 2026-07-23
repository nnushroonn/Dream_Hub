"use client";

interface UnsavedChangesGuardModalProps {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
}

// 작성 중인 폼이 있는 상태로 헤더 메뉴 등 앱 내부 링크를 클릭했을 때 뜨는 커스텀 이탈 방지 모달.
// "이동하기"를 눌러도 실시간 자동 임시 저장 초안은 그대로 남아있다 - 다음에 돌아오면 복원할 수 있다.
export default function UnsavedChangesGuardModal({ open, onStay, onLeave }: UnsavedChangesGuardModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onStay} />

      <div className="relative w-full max-w-sm rounded-3xl border border-amber-400/30 bg-white/10 p-7 text-center shadow-[0_0_60px_rgba(251,191,36,0.2)] backdrop-blur-2xl">
        <p className="text-lg font-semibold text-white">⚠️ 작성 중인 꿈일기가 있습니다</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          지금 페이지를 벗어나면 작성 중인 무의식 기록이 사라집니다. 정말 이동하시겠습니까?
        </p>

        <div className="mt-6 flex gap-2.5">
          <button
            type="button"
            onClick={onStay}
            className="flex-1 rounded-full border border-violet-400/40 bg-violet-500/15 px-5 py-2.5 text-sm font-semibold text-violet-100 transition-transform hover:-translate-y-0.5"
          >
            이어서 작성하기
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="flex-1 rounded-full border border-white/10 px-5 py-2.5 text-sm text-slate-300 transition-colors hover:border-red-400/40 hover:text-red-200"
          >
            이동하기
          </button>
        </div>
      </div>
    </div>
  );
}
