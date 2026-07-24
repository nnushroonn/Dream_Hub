"use client";

import { useEffect, useState } from "react";

import { checkNicknameAvailability, updateNickname } from "@/api/auth";
import { randomPersonaNickname } from "@/lib/personaNickname";
import { useAuthStore } from "@/store/useAuthStore";

type NicknameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 20;
const NICKNAME_CHECK_DEBOUNCE_MS = 400;

// 마이페이지 상단에 놓는 인라인 닉네임 수정기. 저장에 성공하면 useAuthStore.updateUser로
// 전역 유저 상태를 갱신해, 이 페이지뿐 아니라 헤더(NavBar)의 닉네임 표시도 즉시 동기화된다.
export default function NicknameEditor() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<NicknameStatus>("idle");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing || !user) return;
    const trimmed = draft.trim();
    // 원래 닉네임을 그대로 다시 입력한 경우 자기 자신과 중복 비교를 할 필요가 없다.
    if (!trimmed || trimmed === user.nickname) {
      setStatus("idle");
      return;
    }
    if (trimmed.length < NICKNAME_MIN_LENGTH || trimmed.length > NICKNAME_MAX_LENGTH) {
      setStatus("invalid");
      return;
    }
    setStatus("checking");
    const timer = window.setTimeout(() => {
      checkNicknameAvailability(trimmed)
        .then((available) => setStatus(available ? "available" : "taken"))
        .catch(() => setStatus("idle"));
    }, NICKNAME_CHECK_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, isEditing, user]);

  if (!user) {
    return <p className="text-center text-xs text-slate-400">로그인이 필요해요.</p>;
  }

  const startEditing = () => {
    setDraft(user.nickname);
    setStatus("idle");
    setError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setDraft(user.nickname);
    setStatus("idle");
    setError(null);
  };

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed || isSaving) return;
    if (trimmed !== user.nickname && status !== "available") return;

    setError(null);
    setIsSaving(true);
    try {
      const updated = await updateNickname(trimmed);
      updateUser(updated);
      setIsEditing(false);
    } catch {
      setError("닉네임 변경에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  const helperClass =
    status === "available" ? "text-emerald-400" : status === "taken" || status === "invalid" ? "text-rose-400" : "text-slate-500";

  const helperText = (() => {
    const length = draft.trim().length;
    switch (status) {
      case "checking":
        return "확인 중...";
      case "available":
        return "✓ 사용할 수 있는 닉네임이에요";
      case "taken":
        return "이미 사용 중인 닉네임이에요";
      case "invalid":
        return `닉네임은 ${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자로 입력해 주세요 (${length}자)`;
      default:
        return "";
    }
  })();

  const canSave = draft.trim() !== "" && (draft.trim() === user.nickname || status === "available");

  return (
    <div>
      <p className="text-xs text-indigo-300/70">🌙 꿈 페르소나</p>

      {!isEditing ? (
        <div className="mt-1.5 flex items-center gap-2.5 transition-all duration-200">
          <span className="text-lg font-semibold text-white">{user.nickname}</span>
          <button
            type="button"
            onClick={startEditing}
            className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:border-violet-400/40 hover:text-violet-200"
          >
            ✏️ 수정
          </button>
        </div>
      ) : (
        <div className="mt-1.5 transition-all duration-200">
          <div className="flex items-center gap-2">
            <input
              type="text"
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={NICKNAME_MAX_LENGTH}
              className="min-w-0 flex-1 rounded-lg border border-purple-500 bg-white/[0.05] px-3 py-1 text-white focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setDraft(randomPersonaNickname())}
              aria-label="랜덤 닉네임 생성"
              title="랜덤 닉네임 생성"
              className="shrink-0 rounded-lg bg-purple-600/20 px-3 py-1 text-base text-purple-300 transition-colors hover:bg-purple-600/40"
            >
              🎲
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || isSaving}
              className="shrink-0 rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-3 py-1 text-xs font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "저장 중..." : "완료"}
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              disabled={isSaving}
              className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400 transition-colors hover:text-slate-200"
            >
              취소
            </button>
          </div>
          {(helperText || error) && (
            <p className={`mt-1 text-xs transition-colors duration-200 ${error ? "text-rose-400" : helperClass}`}>
              {error || helperText}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
