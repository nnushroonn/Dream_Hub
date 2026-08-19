"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Lock } from "lucide-react";

import { getMySeeds } from "@/api/seeds";
import { getAuthErrorMessage } from "@/api/auth";
import SeedIcon from "@/components/SeedIcon";
import { getSeedDefinition, SEED_DEFINITION_LIST, type SeedType } from "@/lib/dreamSeeds";
import { EMOTION_CATEGORY_TO_GENUS } from "@/lib/emotionWordbook";

interface SeedCompendiumModalProps {
  onClose: () => void;
}

// 정원 씨앗 도감 - 감정 대분류 7종을 항상 전부 보여주되(포켓몬 도감처럼 칸 자체는 항상
// 보이고), 실제로 한 번이라도 심어본 적 있는지는 GET /api/seeds(내 씨앗 전체 이력)를 직접
// 집계해서만 판정한다 - 더미/추측 데이터는 쓰지 않는다.
export default function SeedCompendiumModal({ onClose }: SeedCompendiumModalProps) {
  const [counts, setCounts] = useState<Map<SeedType, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SeedType | null>(null);

  useEffect(() => {
    getMySeeds()
      .then((seeds) => {
        const map = new Map<SeedType, number>();
        for (const seed of seeds) {
          map.set(seed.seed_type, (map.get(seed.seed_type) ?? 0) + 1);
        }
        setCounts(map);
      })
      .catch((err) => setError(getAuthErrorMessage(err)));
  }, []);

  const selectedDef = selected ? getSeedDefinition(selected) : null;
  const selectedCount = selected && counts ? (counts.get(selected) ?? 0) : 0;
  const selectedGenus = selected ? EMOTION_CATEGORY_TO_GENUS[selected] : null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 py-8 backdrop-blur-md" onClick={onClose}>
      <div
        className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 p-7 shadow-[0_0_70px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-5 top-5 text-slate-400 transition-colors hover:text-white"
        >
          ✕
        </button>

        <p className="text-center text-xs tracking-widest text-purple-300/70 uppercase">Seed Compendium</p>
        <h2 className="mt-1.5 text-center text-lg font-semibold text-white">🌱 씨앗 도감</h2>

        {error && <p className="mt-4 text-center text-xs text-red-300">{error}</p>}
        {!counts && !error && <p className="mt-8 text-center text-xs text-slate-500">불러오는 중...</p>}

        {counts && (
          <>
            <p className="mt-1 text-center text-[11px] text-slate-500">
              심어본 감정 {[...counts.values()].filter((c) => c > 0).length}/{SEED_DEFINITION_LIST.length}
            </p>

            <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {SEED_DEFINITION_LIST.map((def) => {
                const count = counts.get(def.type) ?? 0;
                const discovered = count > 0;
                const isSelected = selected === def.type;
                return (
                  <button
                    key={def.type}
                    type="button"
                    onClick={() => setSelected(isSelected ? null : def.type)}
                    className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center transition-all ${
                      discovered
                        ? "border-white/10 bg-white/[0.03] hover:border-purple-400/30"
                        : "border-dashed border-white/10 bg-white/[0.015] opacity-60 hover:opacity-90"
                    } ${isSelected ? "border-purple-400/60 bg-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.25)]" : ""}`}
                  >
                    <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.03]">
                      <SeedIcon category={def.type} locked={!discovered} sizePx={30} />
                      {!discovered && (
                        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 ring-1 ring-white/10">
                          <Lock className="h-2.5 w-2.5 text-slate-500" />
                        </span>
                      )}
                    </span>
                    <span className={`text-[11px] font-medium ${discovered ? "text-slate-200" : "text-slate-400"}`}>
                      {discovered ? def.label : "미발견"}
                    </span>
                    {discovered && <span className="text-[10px] text-purple-300/70">{count}회</span>}
                  </button>
                );
              })}
            </div>

            {/* 상세 정보 - 칸을 탭하면 아래에 펼쳐진다. 잠긴 칸도 눌러볼 수 있다(감정 종류
                자체는 비밀이 아니라, "심어본 적 있는지"만 다를 뿐이라서). */}
            {selectedDef && (
              <div className="mt-5 flex items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <span
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${selectedDef.colors[0]}22` }}
                >
                  <SeedIcon category={selectedDef.type} locked={selectedCount === 0} sizePx={34} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{selectedDef.label}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{selectedDef.meaning}</p>
                  <p className="mt-1.5 text-[10px] text-slate-500">
                    {selectedCount > 0 ? `${selectedCount}번 심었어요 · 대응하는 꽃의 속(genus) ${selectedGenus}` : "아직 심어본 적 없어요"}
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
