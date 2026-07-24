"use client";

// 아이덴티티 선택 시스템: 커뮤니티에 공개될 때 닉네임으로 낼지 익명으로 낼지 고르는 세그먼트
// 탭 + 실시간 미리보기. 자유 광장 글쓰기 폼과 꿈 기록소의 공개 범위 설정, 두 곳에서 함께 쓴다.
interface IdentitySwitchProps {
  isAnonymous: boolean;
  onChange: (isAnonymous: boolean) => void;
  /** 닉네임 모드 미리보기에 표시할 표시용 닉네임 (아직 별도 프로필 기능이 없어 이메일 앞부분을 쓴다) */
  nickname: string;
}

export default function IdentitySwitch({ isAnonymous, onChange, nickname }: IdentitySwitchProps) {
  return (
    <div>
      <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ${
            !isAnonymous
              ? "bg-violet-500/30 text-white shadow-[0_0_10px_rgba(167,139,250,0.3)]"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          👤 내 닉네임으로
        </button>
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ${
            isAnonymous
              ? "bg-violet-500/30 text-white shadow-[0_0_10px_rgba(167,139,250,0.3)]"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          🎭 익명의 탐험가로
        </button>
      </div>

      {/* 작성자 프로필 미리보기: 스위치를 바꾸는 즉시 동기화된다 */}
      <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5">
        {isAnonymous ? (
          <>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-sm text-violet-300 shadow-[0_0_10px_rgba(167,139,250,0.35)]">
              🎭
            </span>
            <span className="text-sm text-violet-200">익명의 탐험가</span>
          </>
        ) : (
          <>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-sm text-indigo-200">
              👤
            </span>
            <span className="text-sm text-white">{nickname}</span>
          </>
        )}
      </div>
    </div>
  );
}
