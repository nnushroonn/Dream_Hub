"use client";

import { useState } from "react";

import { updateGalaxyVisibility } from "@/api/auth";
import { useAuthStore } from "@/store/useAuthStore";

// 커뮤니티 닉네임 호버 카드(무의식 은하 프로필) 공개 스위치. 기본은 비공개(false) - 켜는
// 순간부터만 다른 유저가 씨앗 비율/뱃지 집계를 볼 수 있다(원문 텍스트는 절대 노출되지 않음).
export default function GalaxyVisibilityToggle() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const [isSaving, setIsSaving] = useState(false);

  if (!user) return null;

  const isPublic = user.is_galaxy_public ?? false;

  const handleToggle = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const updated = await updateGalaxyVisibility(!isPublic);
      updateUser(updated);
    } catch {
      // 실패해도 조용히 무시 - 다시 누르면 재시도된다
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-400">
      <span>{isPublic ? "🌌 은하계 공개 중" : "🔒 은하계 비공개"}</span>
      <button
        type="button"
        role="switch"
        aria-checked={isPublic}
        onClick={handleToggle}
        disabled={isSaving}
        className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-60 ${
          isPublic ? "bg-violet-500" : "bg-white/15"
        }`}
      >
        <span
          className={`ml-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-200 ${
            isPublic ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}
