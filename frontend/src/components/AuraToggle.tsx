"use client";

import { useState } from "react";

import { updateAuraPreference, type AuraPreference } from "@/api/auth";
import { useAuthStore } from "@/store/useAuthStore";

const AURA_OPTIONS: { value: AuraPreference; label: string; emoji: string; ringClass: string }[] = [
  { value: "good", label: "길몽 위주", emoji: "🌕", ringClass: "border-amber-400/70 shadow-[0_0_28px_rgba(251,191,36,0.45)]" },
  {
    value: "lucid",
    label: "자각몽 위주",
    emoji: "✨",
    ringClass: "border-violet-400/70 shadow-[0_0_28px_rgba(167,139,250,0.45)]",
  },
  { value: "calm", label: "평온 위주", emoji: "🌊", ringClass: "border-sky-400/70 shadow-[0_0_28px_rgba(56,189,248,0.45)]" },
];

// 꿈 페르소나 아바타 오라 커스텀 - 유저가 자주 꾸는 꿈 종류를 직접 골라 프로필 외곽선/오라
// 색상을 바꾼다. 실제 프로필 이미지 업로드 기능은 없어 오라 글로우로 시각적 정체성을 표현한다.
export default function AuraToggle() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const [isSaving, setIsSaving] = useState(false);

  if (!user) return null;

  const active = AURA_OPTIONS.find((option) => option.value === user.aura_preference);

  const handleSelect = async (value: AuraPreference) => {
    if (isSaving || user.aura_preference === value) return;
    setIsSaving(true);
    try {
      const updated = await updateAuraPreference(value);
      updateUser(updated);
    } catch {
      // 실패해도 조용히 무시 - 다시 클릭하면 재시도된다
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div
        className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 bg-white/5 text-2xl transition-all duration-300 ${
          active ? active.ringClass : "border-white/10"
        }`}
      >
        {active ? active.emoji : "🌙"}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {AURA_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => handleSelect(option.value)}
            disabled={isSaving}
            className={`rounded-full border px-3 py-3.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              user.aura_preference === option.value
                ? "border-violet-400/60 bg-violet-500/20 text-violet-200"
                : "border-white/10 bg-white/5 text-slate-400 hover:border-violet-400/30 hover:text-slate-200"
            }`}
          >
            {option.emoji} {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
