"use client";

import { createPortal } from "react-dom";
import { Pin, PinOff, Share2, Sparkles, X } from "lucide-react";

import type { GardenBloomEntry } from "@/api/dream";
import FlowerIcon from "@/components/FlowerIcon";
import { getSeedDefinition } from "@/lib/dreamSeeds";
import { rarityLabel, rarityStars, type RarityTier } from "@/lib/flowerRarity";
import { auraGlowShadow, colorForGenus, flowerLanguageFor, MOOD_AURA, speciesDescriptionFor } from "@/lib/flowerTaxonomy";
import { moodBucketForEmoji } from "@/lib/moodBucket";

function formatBloomDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

interface FlowerDetailModalProps {
  bloom: GardenBloomEntry;
  dexNumber: number;
  generalDiscovered: number;
  generalTotal: number;
  legendaryDiscovered: number;
  legendaryTotal: number;
  isPinned: boolean;
  isPinning: boolean;
  onTogglePin: () => void;
  onViewDiary: () => void;
  onShare: () => void;
  onTagClick: (tag: string) => void;
  onClose: () => void;
}

// 정원에서 꽃을 클릭했을 때 뜨는 "전시/소유" 감성의 상세 관찰 모달 - 도감 번호/희귀도/꽃말/
// 태그/고정·공유 액션/수집 진행도를 한 화면에 모은다. 실제 일기장 이동은 이 모달 안
// "일기 원문 보기" 버튼을 눌러야만 일어난다(정원 그리드 클릭만으로는 더 이상 페이지가
// 바뀌지 않는다) - 자기 정원의, 이미 개화한 꽃에서만 열린다(프라이버시 상 남의 정원은
// 기존의 가벼운 전시용 모달을 그대로 쓴다).
export default function FlowerDetailModal({
  bloom,
  dexNumber,
  generalDiscovered,
  generalTotal,
  legendaryDiscovered,
  legendaryTotal,
  isPinned,
  isPinning,
  onTogglePin,
  onViewDiary,
  onShare,
  onTagClick,
  onClose,
}: FlowerDetailModalProps) {
  const bucket = bloom.emotion ? moodBucketForEmoji(bloom.emotion) : "neutral";
  const tone = MOOD_AURA[bucket];
  // 전설은 항상 최고 등급, 일반 종은 백엔드가 전체 유저 빈도로 계산해 준 값을 그대로 쓴다.
  // rarity가 아직 없는 경우(도감 체계 도입 전 옛 기록 등)엔 점수를 매기는 대신 무조건
  // 가장 흔한 등급(★☆☆)을 기본값으로 삼는다 - "데이터가 부족하면 3성"이 되는 쪽이 훨씬
  // 어색하기 때문이다.
  const rarity: RarityTier = bloom.is_legendary ? 3 : (bloom.rarity ?? 1);
  const [genusPrimary] = colorForGenus(bloom.genus);
  // AI 해몽 리포트 원문(=일기 원문 보기에서 보게 될 내용)과 절대 겹치지 않도록, 리포트를
  // 요약하는 대신 속(genus)별로 미리 지어 둔 시적 한 줄을 쓴다.
  const flowerLanguage = flowerLanguageFor(bloom);
  const displayName = bloom.flower_name ?? getSeedDefinition(bloom.seed_type).flowerName;
  // 이 모달은 항상 "이미 소장한(개화한)" 꽃에서만 열린다 - 그래서 별도의 소장 여부 분기 없이
  // 바로 정확한 설명을 보여줘도 된다. 일반 종은 실제 genus/archetype으로, 전설의 꽃은 실제
  // 언락 조건으로 조합된다(도감 미발견 실루엣의 은유적 hint와는 다른 소스 - speciesDescriptionFor
  // 참고). genus/archetype이 없는 옛 기록이면 null이라 섹션 자체가 생략된다.
  const speciesDescription = speciesDescriptionFor(bloom, displayName);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 py-8 backdrop-blur-md" onClick={onClose}>
      {/* 전설의 꽃이라고 무조건 금색이 아니다 - 테두리/글로우는 이 꽃의 실제 길흉(tone.color)을
          따르고, 전설은 그 색을 최대 강도로 강조할 뿐이다. */}
      <div
        className={`relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border bg-slate-950 p-7 shadow-[0_0_70px_rgba(0,0,0,0.5)] ${
          bloom.is_legendary ? "" : "border-white/10"
        }`}
        style={bloom.is_legendary ? { borderColor: `${tone.color}80` } : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        {/* 우측 상단 닫기 - 하단 전체 폭 버튼 대신 이걸 하나만 남긴다. 배경 클릭으로도 닫힌다. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white/5 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {/* 상단: 도감 번호 + 희귀도 (전설의 꽃은 금빛 테두리로 한 번 더 구분한다) */}
        <div className="flex items-center justify-between pr-8">
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] text-slate-400">
            도감 No.{String(dexNumber).padStart(3, "0")}
          </span>
          <span
            title={`희귀도: ${rarityLabel(rarity)}`}
            className={`rounded-full border px-2.5 py-1 text-xs tracking-wide ${
              bloom.is_legendary
                ? "border-amber-300/60 bg-amber-400/15 text-amber-200"
                : "border-amber-400/30 bg-amber-500/10 text-amber-300"
            }`}
          >
            {rarityStars(rarity)}
          </span>
        </div>

        {bloom.is_legendary && (
          <p className="mt-2 flex items-center justify-center gap-1 text-[11px] font-medium text-amber-300">
            <Sparkles className="h-3 w-3" /> 전설의 꽃
          </p>
        )}
        {bloom.is_first_discovery && (
          <p className="mt-1 text-center text-[11px] text-emerald-300/80">✨ 이 종을 처음 발견했어요</p>
        )}
        {/* 성장 배지 - 종/희귀도 표시(위 도감 번호/별점 배지, 전설 리본)와는 완전히 다른
            색(하늘색)과 자리를 써서 혼동을 피한다. 종/희귀도 계산에는 관여하지 않는다. */}
        {bloom.growth_badge && (
          <p className="mt-1 text-center text-[11px] text-sky-300/80">🌈 성장의 반짝임 · 오늘, 마음이 스스로를 다독였네요</p>
        )}

        {/* 중앙: 확대된 꽃 - 종(species) 고유 아이콘을 쓰고, 흉몽은 어두운 톤으로 구분한다.
            반짝임 장식은 길몽(good)일 때만, 희귀도에 따라 강도가 달라지는 단일 원형 글로우로
            표현한다 - 1성은 장식 없음, 2성은 은은한 글로우, 3성(전설은 항상 3성 취급)은
            글로우 + 미세한 입자 애니메이션까지 더한다. 실제 opacity 애니메이션(globals.css의
            flower-glow, 3초 주기)이라 정적 아이콘이 아니고, prefers-reduced-motion이면 꺼진다. */}
        <div className="relative mt-5 flex items-center justify-center py-4">
          {bucket === "good" && rarity >= 2 && (
            <span
              aria-hidden
              className="pointer-events-none absolute h-32 w-32 rounded-full animate-flower-glow motion-reduce:animate-none"
              style={{
                boxShadow:
                  rarity === 3
                    ? `0 0 24px 8px ${genusPrimary}55, 0 0 48px 18px ${genusPrimary}25`
                    : `0 0 16px 4px ${genusPrimary}40`,
              }}
            />
          )}
          {bucket === "good" && rarity === 3 && (
            <>
              <span className="pointer-events-none absolute -left-1 top-3 h-1.5 w-1.5 rounded-full bg-amber-200 animate-flower-glow motion-reduce:animate-none [animation-delay:0.5s]" />
              <span className="pointer-events-none absolute right-0 bottom-4 h-1.5 w-1.5 rounded-full bg-amber-200 animate-flower-glow motion-reduce:animate-none [animation-delay:1s]" />
              <span className="pointer-events-none absolute right-8 -top-1 h-1.5 w-1.5 rounded-full bg-amber-200 animate-flower-glow motion-reduce:animate-none [animation-delay:1.5s]" />
            </>
          )}
          <span
            className={`relative flex h-28 w-28 items-center justify-center rounded-full text-6xl transition-all ${
              bucket === "nightmare" ? "grayscale-[0.35] brightness-75" : ""
            }`}
            style={{
              backgroundColor: `${genusPrimary}22`,
              boxShadow: auraGlowShadow(tone.color, bloom.is_legendary ? 3 : 2),
              border: bloom.is_legendary ? `2px solid ${tone.color}99` : undefined,
            }}
          >
            <FlowerIcon
              archetype={bloom.archetype}
              genus={bloom.genus}
              speciesName={bloom.species_name}
              isLegendary={bloom.is_legendary}
              sizePx={72}
            />
            {bloom.growth_badge && (
              <span className="absolute -bottom-1 -left-1 text-sm" aria-hidden>
                🌈
              </span>
            )}
          </span>
        </div>

        {/* 이름 + 개화 날짜 (명패 스타일) */}
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center">
          <p className="text-base font-semibold text-white">{displayName}</p>
          {bloom.archetype && !bloom.is_legendary && <p className="mt-0.5 text-[10px] text-slate-500">{bloom.archetype}</p>}
          <p className="mt-0.5 text-[11px] text-slate-500">{formatBloomDate(bloom.bloomed_at)}에 개화</p>
        </div>

        {/* 감정 태그 + 길몽/흉몽 태그 */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
          <span
            className="rounded-full border px-2.5 py-1 text-[11px]"
            style={{ borderColor: `${tone.color}50`, color: tone.color, backgroundColor: `${tone.color}15` }}
          >
            {tone.label}
          </span>
          {bloom.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTagClick(tag)}
              title={`#${tag.replace(/^#/, "")} 태그로 다른 꽃 찾아보기`}
              className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2.5 py-1 text-[11px] text-purple-200 transition-colors hover:bg-purple-500/20"
            >
              {tag.startsWith("#") ? tag : `#${tag}`}
            </button>
          ))}
        </div>

        {/* 이 꽃에 대하여 - "종" 자체의 일반적인 특성 설명. 같은 종/조건이면 누가 보든 항상
            같은 문구라, 그날 그 사용자의 개인화된 해석인 아래 "꽃말"과 헷갈리지 않도록
            아이콘(📖 vs 🌷)·배경 톤(옅은 초록 vs 중립 회색)·폰트(sans vs serif)를 모두
            다르게 뒀다. */}
        {speciesDescription && (
          <div className="mt-4 rounded-2xl border border-emerald-400/10 bg-emerald-500/[0.03] p-4">
            <p className="text-[11px] uppercase tracking-wide text-emerald-400/60">📖 이 꽃에 대하여</p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{speciesDescription}</p>
          </div>
        )}

        {/* 꽃말 - "일기 원문 보기"에서 보게 될 AI 해몽 리포트와는 다른, 속(genus)별 짧은 한 줄.
            그날 그 사용자만의 개인화된 해석이라 위 종 설명과 달리 매번 같은 종이라도 톤이
            같다(genus 기준) - 대신 서체(font-serif)로 "시적인 한 줄"이라는 결을 구분한다. */}
        <div className="mt-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">🌷 꽃말</p>
          <p className="mt-1.5 font-serif text-sm leading-relaxed text-slate-300">{flowerLanguage}</p>
        </div>

        {/* 하단 액션 3개 */}
        <div className="mt-6 space-y-2">
          <button
            type="button"
            onClick={onViewDiary}
            className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5"
          >
            📖 일기 원문 보기
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onTogglePin}
              disabled={isPinning}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isPinned
                  ? "border-amber-400/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15"
                  : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-slate-200"
              }`}
            >
              {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              {isPinned ? "고정 해제" : "정원에 고정"}
            </button>
            <button
              type="button"
              onClick={onShare}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-xs font-medium text-slate-400 transition-colors hover:border-white/20 hover:text-slate-200"
            >
              <Share2 className="h-3.5 w-3.5" />
              공유하기
            </button>
          </div>
        </div>

        {/* 최하단: 도감 수집 진행도 - 일반/전설을 나눠서 보여준다. */}
        <p className="mt-5 text-center text-[11px] text-slate-400">
          🌿 일반 {generalDiscovered}/{generalTotal} · ✨ 전설 {legendaryDiscovered}/{legendaryTotal}
        </p>
      </div>
    </div>,
    document.body
  );
}
