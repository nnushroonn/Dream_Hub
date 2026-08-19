"use client";

import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";

import { getMyCompendium, type CompendiumEntry, type CompendiumResponse } from "@/api/dream";
import { getAuthErrorMessage } from "@/api/auth";
import FlowerIcon from "@/components/FlowerIcon";
import LegendaryRibbon from "@/components/LegendaryRibbon";
import { auraGlowShadow, MOOD_AURA } from "@/lib/flowerTaxonomy";
import { moodBucketForEmoji } from "@/lib/moodBucket";

interface CompendiumModalProps {
  onClose: () => void;
}

function GeneralSlot({ entry }: { entry: CompendiumEntry }) {
  if (!entry.discovered) {
    // 실루엣 - 어떤 원형인지(관계/재회형 등)는 보여주되, 정확한 종 이름/이미지는 절대
    // 노출하지 않는다. 아직 만나보지 못한 종이라는 느낌만 준다.
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-3 text-center opacity-60">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.03] text-lg text-slate-600">?</span>
        <span className="text-[10px] text-slate-400">미발견</span>
      </div>
    );
  }
  // 연결된 꿈 기록이 없으면(emotion=null) "보통" 톤으로 대체 - FlowerDetailModal과 동일한 기본값.
  const bucket = entry.emotion ? moodBucketForEmoji(entry.emotion) : "neutral";
  const tone = MOOD_AURA[bucket];
  return (
    <div
      title={`${entry.example_name ?? entry.species_name} · ${entry.count}회 개화 · ${tone.label}`}
      className="flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center"
      style={{ borderColor: `${tone.color}45`, backgroundColor: `${tone.color}0d`, boxShadow: auraGlowShadow(tone.color, 1) }}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-purple-500/10">
        <FlowerIcon archetype={entry.archetype} genus={entry.genus} speciesName={entry.species_name} sizePx={28} />
      </span>
      <span className="line-clamp-1 text-[11px] font-medium text-slate-200">{entry.species_name}</span>
      <span className="text-[10px] text-amber-300/80">{"★".repeat(entry.rarity ?? 1)}</span>
    </div>
  );
}

function LegendarySlot({ entry }: { entry: CompendiumEntry }) {
  // 은유적 힌트는 처음부터 보여주지 않는다 - 마우스를 올리거나(데스크톱) 탭하면(모바일)
  // 그때만 드러나는 작은 발견의 재미로 남겨둔다. 정확한 언락 조건이 아니라 분위기만
  // 암시하는 문구라, 실수로 두 번 탭해 다시 숨겨져도 잃을 게 없다.
  const [isHintRevealed, setIsHintRevealed] = useState(false);
  if (!entry.discovered) {
    return (
      <button
        type="button"
        onClick={() => setIsHintRevealed((prev) => !prev)}
        // 일반 카드보다 두꺼운 테두리(border-2)와 넉넉한 패딩(p-5)으로 미발견 상태에서도
        // "이 칸은 특별하다"는 느낌을 유지한다.
        className="group relative flex flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-amber-400/20 bg-amber-500/[0.02] p-5 text-center opacity-70 transition-opacity hover:opacity-100"
      >
        <LegendaryRibbon />
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.02] text-xl text-slate-600">???</span>
        <p
          className={`text-[10px] leading-relaxed text-slate-500 transition-opacity duration-300 ${
            isHintRevealed ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          {entry.hint}
        </p>
      </button>
    );
  }
  // 전설이라고 무조건 금색이 아니다 - 아우라(카드 안쪽 배경/아이콘 글로우)는 이 꽃의 실제
  // 길흉을 따르고, 전설은 그 색을 최대 강도(3)로 강조할 뿐이다(흉몽 전설이면 보라색 아우라 +
  // 전설 전용 강조). 다만 길몽(아우라=호박색)인 전설과 일반 종의 테두리가 똑같은 단색
  // 호박색이라 구분이 잘 안 됐다 - 테두리는 아우라 색과 무관하게 항상 금빛 그라데이션 링으로
  // 고정해, 길흉과 상관없이 "이건 전설이다"가 한눈에 갈리게 한다.
  const bucket = entry.emotion ? moodBucketForEmoji(entry.emotion) : "neutral";
  const tone = MOOD_AURA[bucket];
  return (
    <div
      title={`${entry.count}회 개화 · ${tone.label}`}
      className="relative rounded-2xl p-[2.5px]"
      style={{ background: "linear-gradient(135deg, #FEF3C7 0%, #F59E0B 40%, #FDE047 70%, #FEF3C7 100%)" }}
    >
      <LegendaryRibbon />
      <div
        className="flex flex-col items-center gap-1.5 rounded-[calc(1rem-2.5px)] p-5 text-center"
        style={{ backgroundColor: `${tone.color}14`, boxShadow: auraGlowShadow(tone.color, 3) }}
      >
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: `${tone.color}25`, boxShadow: `inset 0 0 0 2px ${tone.color}80` }}
        >
          <FlowerIcon archetype={entry.archetype} genus={entry.genus} speciesName={entry.species_name} isLegendary sizePx={36} />
        </span>
        {/* 종 이름은 전설다움을 위해 계속 금빛으로 남긴다 - 이건 "희귀도/정체성" 표시라
            길흉(아우라)과는 다른 축이다. */}
        <span className="text-xs font-semibold text-amber-100">{entry.species_name}</span>
        <span className="text-[10px] text-amber-300/80">★★★</span>
      </div>
    </div>
  );
}

// 전설 카드 6개를 별자리처럼 은은하게 이어주는 배경 - 꿈 별자리 캘린더(ConstellationCalendar)와
// 같은 시각 언어(흩뿌린 반짝이는 별 + 얇은 연결선)를 재사용해 브랜드 일관성을 준다. 이 모달은
// 유저가 "도감 보기"를 눌렀을 때만(항상 클라이언트에서, 하이드레이션 이후) 뜨므로 서버/클라이언트
// 렌더가 어긋날 걱정 없이 Math.random()을 그대로 써도 안전하다.
const LEGENDARY_STAR_COUNT = 18;

interface LegendaryStar {
  left: string;
  top: string;
  size: string;
  opacity: string;
  delay: string;
  duration: string;
}

function generateLegendaryStars(): LegendaryStar[] {
  return Array.from({ length: LEGENDARY_STAR_COUNT }, () => ({
    left: `${(Math.random() * 100).toFixed(2)}%`,
    top: `${(Math.random() * 100).toFixed(2)}%`,
    size: `${(1 + Math.random()).toFixed(2)}px`,
    opacity: (0.15 + Math.random() * 0.55).toFixed(2),
    delay: `${(Math.random() * 4).toFixed(2)}s`,
    duration: `${(3 + Math.random() * 2).toFixed(2)}s`,
  }));
}

// 카드 중심 좌표를 퍼센트 근사치(그리드 칸 위치만으로 계산)로 구했더니, 배경 SVG가
// inset-0으로 덮는 박스(패딩 바깥 경계)와 실제 카드가 놓이는 박스(패딩 안쪽, gap만큼 더
// 좁아진 영역)가 서로 달라 좌표가 카드 중심과 어긋나며 선이 무작위로 가로지르는 것처럼
// 보였다 - 근사 대신 실제 DOM에서 각 카드의 렌더된 중심 좌표를 getBoundingClientRect로
// 재서 그리므로, 패딩/gap/컨테이너 종횡비와 무관하게 항상 카드 중심을 정확히 지난다.
function useConstellationPath(
  stageRef: RefObject<HTMLDivElement | null>,
  cardRefs: MutableRefObject<(HTMLDivElement | null)[]>,
  cardCount: number
): string {
  const [path, setPath] = useState("");

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const recompute = () => {
      const stageRect = stage.getBoundingClientRect();
      const points = cardRefs.current
        .slice(0, cardCount)
        .filter((el): el is HTMLDivElement => el !== null)
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2 - stageRect.left,
            y: rect.top + rect.height / 2 - stageRect.top,
          };
        });
      if (points.length < 2) {
        setPath("");
        return;
      }
      // 순서대로(카드가 그리드에 배치된 순서, 왼쪽 위 -> 오른쪽 아래) 단순 직선으로만 잇는다 -
      // 모든 점을 서로 잇는 완전 그래프가 아니라 인접한 점끼리만 하나의 경로로 이어야
      // 교차가 생기지 않는다.
      setPath(points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "));
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stageRef, cardRefs, cardCount]);

  return path;
}

function LegendaryConstellationBackground({
  stageRef,
  cardRefs,
  cardCount,
}: {
  stageRef: RefObject<HTMLDivElement | null>;
  cardRefs: MutableRefObject<(HTMLDivElement | null)[]>;
  cardCount: number;
}) {
  // 마운트 시 한 번만 뽑아 리렌더마다 별자리가 흔들리지 않게 한다.
  const [stars] = useState(generateLegendaryStars);
  const path = useConstellationPath(stageRef, cardRefs, cardCount);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
      {stars.map((star, index) => (
        <span
          key={index}
          className="absolute animate-star-twinkle rounded-full bg-white motion-reduce:animate-none"
          style={{
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
            animationDelay: star.delay,
            animationDuration: star.duration,
          }}
        />
      ))}
      {/* 장식용 연결선 - 카드 클릭/호버 등 상호작용에는 전혀 관여하지 않는다. 실제 px 좌표라
          viewBox 스케일링이 필요 없다. */}
      {path && (
        <svg className="absolute inset-0 h-full w-full overflow-visible">
          <path
            d={path}
            fill="none"
            stroke="rgba(251,191,36,0.35)"
            strokeWidth="1"
            style={{ filter: "drop-shadow(0 0 2px rgba(251,191,36,0.4))" }}
          />
        </svg>
      )}
    </div>
  );
}

// 무의식의 정원 도감 - 일반 24종(8원형 x 3종)과 전설 6종을 두 섹션으로 나눠 보여준다.
// 미발견 항목은 실루엣(일반) / "???" + 은유적 힌트(전설)로만 표시해, 정확한 이름과 언락
// 조건은 절대 미리 새어나가지 않는다.
export default function CompendiumModal({ onClose }: CompendiumModalProps) {
  const [data, setData] = useState<CompendiumResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyCompendium()
      .then(setData)
      .catch((err) => setError(getAuthErrorMessage(err)));
  }, []);

  const generalByArchetype = new Map<string, CompendiumEntry[]>();
  if (data) {
    for (const entry of data.entries) {
      if (entry.category !== "general") continue;
      const key = entry.archetype ?? "";
      const list = generalByArchetype.get(key) ?? [];
      list.push(entry);
      generalByArchetype.set(key, list);
    }
  }
  const legendaryEntries = data?.entries.filter((entry) => entry.category === "legendary") ?? [];
  const legendaryStageRef = useRef<HTMLDivElement | null>(null);
  const legendaryCardRefs = useRef<(HTMLDivElement | null)[]>([]);

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

        <p className="text-center text-xs tracking-widest text-emerald-300/70 uppercase">Flower Compendium</p>
        <h2 className="mt-1.5 text-center text-lg font-semibold text-white">🌿 꽃 도감</h2>

        {error && <p className="mt-4 text-center text-xs text-red-300">{error}</p>}
        {!data && !error && <p className="mt-8 text-center text-xs text-slate-500">불러오는 중...</p>}

        {data && (
          <>
            {/* 전설의 정원을 항상 먼저 보여준다 - 일반 종과 뒤섞이지 않도록 완전히 분리된
                섹션이고, 배경에 별자리 캘린더와 같은 별 텍스처+연결선을 깔아 "특별한 구역"임을
                한눈에 알 수 있게 한다. */}
            <section className="mt-6">
              <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-amber-300/90">
                <Sparkles className="h-3.5 w-3.5" /> 전설의 정원 · {data.legendary_discovered}/{data.legendary_total}
              </p>
              <div
                ref={legendaryStageRef}
                className="relative mt-3 overflow-hidden rounded-2xl border border-amber-400/10 bg-gradient-to-b from-amber-500/[0.05] to-transparent p-3"
              >
                <LegendaryConstellationBackground
                  stageRef={legendaryStageRef}
                  cardRefs={legendaryCardRefs}
                  cardCount={legendaryEntries.length}
                />
                <div className="relative grid grid-cols-3 gap-3">
                  {legendaryEntries.map((entry, index) => (
                    <div key={entry.slot_id} ref={(el) => { legendaryCardRefs.current[index] = el; }}>
                      <LegendarySlot entry={entry} />
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* 일반 정원 - 전설 섹션과 충분한 여백 + 옅은 구분선으로 갈라, 두 구역이 절대
                섞여 보이지 않게 한다. */}
            <section className="mt-8 border-t border-white/10 pt-6">
              <p className="text-xs font-semibold tracking-wide text-slate-300">
                🌱 일반 정원 · {data.general_discovered}/{data.general_total}
              </p>
              <div className="mt-4 space-y-5">
                {[...generalByArchetype.entries()].map(([archetype, entries]) => (
                  <div key={archetype}>
                    <p className="text-[11px] font-medium tracking-wide text-slate-500">{archetype}</p>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {entries.map((entry) => (
                        <GeneralSlot key={entry.slot_id} entry={entry} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
