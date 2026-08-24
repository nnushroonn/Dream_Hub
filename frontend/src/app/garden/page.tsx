"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronDown, Droplet, Pin, Sprout, User } from "lucide-react";

import { getAuthErrorMessage } from "@/api/auth";
import {
  buildDreamOriginalContent,
  getMyGarden,
  getPublicGarden,
  giveDew,
  pinGardenFlower,
  unpinGardenFlower,
  type DreamEntryRecord,
  type GardenBloomEntry,
  type GardenProfile,
  type GardenSpecimen,
} from "@/api/dream";
import CompendiumModal from "@/components/CompendiumModal";
import SeedCompendiumModal from "@/components/SeedCompendiumModal";
import FlowerDetailModal from "@/components/FlowerDetailModal";
import FlowerIcon from "@/components/FlowerIcon";
import GardenHelpModal from "@/components/GardenHelpModal";
import HelpButton from "@/components/HelpButton";
import LegendaryRibbon from "@/components/LegendaryRibbon";
import NavBar from "@/components/NavBar";
import PreviewGateway from "@/components/PreviewGateway";
import SeedIcon from "@/components/SeedIcon";
import { getSeedDefinition } from "@/lib/dreamSeeds";
import { colorForGenus, GENERAL_SPECIES_TOTAL, LEGENDARY_TOTAL } from "@/lib/flowerTaxonomy";
import { CHALLENGER_TIER_INDEX, tierColor } from "@/lib/levels";
import { moodBucketForEmoji, type MoodOption } from "@/lib/moodBucket";
import { useAuthStore } from "@/store/useAuthStore";
import { useSavedDreamsStore } from "@/store/useSavedDreamsStore";

// 감정 버킷(길몽/보통/흉몽) -> 꽃 색상/모양. 세밀한 감정별 색상표 대신 캘린더 도트 등
// 이 앱 전반에서 이미 쓰는 3버킷 분류를 그대로 재사용한다 - 새 축을 하나 더 만들지 않기 위함.
const MOOD_BLOOM_STYLE: Record<MoodOption["bucket"], { color: string; flower: string; sparkle: boolean }> = {
  good: { color: "#FBBF24", flower: "🌼", sparkle: true },
  neutral: { color: "#A78BFA", flower: "🌸", sparkle: false },
  nightmare: { color: "#F43F5E", flower: "🥀", sparkle: false },
};

// 정원이 비어있을 때도 "자라날 자리"가 있다는 느낌을 주기 위해 채워 넣는 빈 화분 최소 개수.
const MIN_EMPTY_POTS = 6;

function formatBloomDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

// 나만의 일기장(useSavedDreamsStore)에 이미 올라와 있는, 내 소유 기록만 상세 모달로 열어준다 -
// 타인의 정원에서는 전시된 식물(종류/날짜/제목)까지만 보여주고, 원문/해몽 같은 사적인 내용은
// 절대 노출하지 않는다(이 프로젝트 전반의 "커뮤니티 응답에 user_id/원문을 노출하지 않는다"
// 원칙과 같은 결의 프라이버시 경계다).
function useOwnEntryLookup(bloom: GardenBloomEntry | null): DreamEntryRecord | null {
  const allEntries = useSavedDreamsStore((state) => state.entries);
  if (!bloom || bloom.dream_entry_id === null) return null;
  return allEntries.find((entry) => entry.id === bloom.dream_entry_id) ?? null;
}

interface BloomTileProps {
  bloom: GardenBloomEntry;
  onClick: () => void;
  // 상세 모달에서 태그를 눌러 필터를 걸면, 그 태그가 없는 꽃은 흐리게 가라앉힌다(그리드에서
  // 완전히 사라지게 하지 않는 이유는 "정원 전체는 그대로 있다"는 감각을 지키기 위함).
  dimmed?: boolean;
}

function BloomTile({ bloom, onClick, dimmed }: BloomTileProps) {
  const definition = getSeedDefinition(bloom.seed_type);

  // 아직 개화 전(새싹) - 감정 기록이 없어 색을 정할 수 없으니, 그저 자라나는 중이라는
  // 신호만 조용한 초록으로 준다. 만개한 꽃과는 형태부터 다르게 그려 한눈에 구분되게 한다.
  if (bloom.stage === "seed") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`group flex flex-col items-center gap-2 rounded-2xl border border-dashed border-emerald-500/20 bg-emerald-500/[0.03] p-4 text-center transition-all hover:-translate-y-1 hover:border-emerald-400/30 hover:bg-emerald-500/[0.06] ${
          dimmed ? "opacity-30" : ""
        }`}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-xl transition-transform group-hover:scale-105">
          🌱
        </span>
        <span className="text-xs font-semibold text-emerald-200/70">새싹</span>
        <span className="text-[10px] text-slate-500">{formatBloomDate(bloom.bloomed_at)}</span>
        <span className="text-[10px] text-slate-400">꿈을 기다리는 중</span>
      </button>
    );
  }

  // "꿈이 기억나지 않아요"를 명시적으로 선택한 날 - 정식 꽃(30여 종 분류) 대신 옅은 안개
  // 톤의 "새싹 표본"으로 남는다. 새싹(seed) 타일과 형태는 비슷하게 두되(둘 다 아직 정식
  // 개화는 아니므로) 색과 문구로 "포기가 아니라 자연스러운 결과"라는 톤을 준다. 도감/컬렉션
  // 카운트에는 포함되지 않는다(species_name이 끝내 채워지지 않아 백엔드 집계 쿼리에서
  // 자연히 제외된다).
  if (bloom.stage === "forgotten") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`group flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-500/20 bg-slate-500/[0.03] p-4 text-center transition-all hover:-translate-y-1 hover:border-slate-400/30 hover:bg-slate-500/[0.06] ${
          dimmed ? "opacity-30" : ""
        }`}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-500/10 text-xl transition-transform group-hover:scale-105">
          🌫️
        </span>
        <span className="text-xs font-semibold text-slate-400">새싹 표본</span>
        <span className="text-[10px] text-slate-500">{formatBloomDate(bloom.bloomed_at)}</span>
        <span className="text-[10px] text-slate-400">꿈은 기억나지 않았어요</span>
      </button>
    );
  }

  // 만개 - 파라메트릭 SVG 아이콘(FlowerIcon)이 원형(archetype)+속(genus)으로 모양/색을
  // 결정한다. 둘 다 없는 옛 기록(도감 도입 전 개화)은 FlowerIcon 자체가 기본 실루엣으로
  // 대체해 준다 - 더 이상 감정/바람 씨앗 기반 이모지 폴백이 필요 없다. 길몽/흉몽 톤(스파클
  // vs 그림자)은 종과 별개로 항상 감정에서만 정해진다.
  const mood = bloom.emotion ? MOOD_BLOOM_STYLE[moodBucketForEmoji(bloom.emotion)] : null;
  const [genusPrimary] = colorForGenus(bloom.genus);
  const primary = bloom.genus ? genusPrimary : (mood?.color ?? definition.colors[0]);
  const isNightmare = bloom.emotion ? moodBucketForEmoji(bloom.emotion) === "nightmare" : false;
  const displayName = bloom.flower_name ?? definition.flowerName;

  const cardContent = (
    <>
      {bloom.is_legendary && <LegendaryRibbon />}
      <span
        className={`relative flex items-center justify-center rounded-full transition-transform group-hover:scale-105 ${
          bloom.is_legendary ? "h-16 w-16 ring-2 ring-amber-300/50" : "h-14 w-14"
        } ${isNightmare ? "grayscale-[0.35] brightness-75" : ""}`}
        style={{ backgroundColor: `${primary}22`, boxShadow: `0 0 18px ${primary}40` }}
      >
        <FlowerIcon
          archetype={bloom.archetype}
          genus={bloom.genus}
          speciesName={bloom.species_name}
          isLegendary={bloom.is_legendary}
          sizePx={bloom.is_legendary ? 44 : 38}
        />
        {(mood?.sparkle || bloom.is_legendary) && <span className="absolute -right-1 -top-1 text-xs">✨</span>}
        {/* 성장 배지 - 종/희귀도 표시(오른쪽 위 ✨/금빛 테두리)와 헷갈리지 않도록 반대쪽
            모서리에 다른 아이콘으로 둔다. 종/희귀도 계산과는 완전히 무관한 별도 표시다. */}
        {bloom.growth_badge && (
          <span className="absolute -bottom-1 -left-1 text-xs" title="성장의 반짝임 · 오늘, 마음이 스스로를 다독였네요">
            🌈
          </span>
        )}
      </span>
      <span className="line-clamp-1 text-xs font-semibold text-slate-200">{displayName}</span>
      <span className="text-[10px] text-slate-500">{formatBloomDate(bloom.bloomed_at)}</span>
      {bloom.dream_title && <span className="line-clamp-1 text-[10px] text-slate-400">{bloom.dream_title}</span>}
    </>
  );

  if (bloom.is_legendary) {
    // 아우라(아이콘 배경)는 그날의 실제 길흉을 따르는 반면, 테두리는 길흉과 무관하게 항상
    // 금빛 그라데이션 링으로 고정한다 - 길몽(호박색 아우라)인 전설과 일반 카드가 똑같은
    // 단색 호박 테두리로 헷갈리지 않도록, 전설은 항상 이 그라데이션 하나로만 신호를 준다.
    return (
      <button
        type="button"
        onClick={onClick}
        className={`group relative rounded-2xl p-[2.5px] text-center transition-all hover:-translate-y-1 ${dimmed ? "opacity-30" : ""}`}
        style={{ background: "linear-gradient(135deg, #FEF3C7 0%, #F59E0B 40%, #FDE047 70%, #FEF3C7 100%)" }}
      >
        <div className="flex flex-col items-center gap-2 rounded-[calc(1rem-2.5px)] bg-amber-500/[0.05] p-5">{cardContent}</div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col items-center gap-2 rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-center transition-all hover:-translate-y-1 hover:border-white/10 hover:bg-white/[0.04] ${
        dimmed ? "opacity-30" : ""
      }`}
    >
      {cardContent}
    </button>
  );
}

// 아직 아무것도 심어본 적 없는 빈 자리 - 정원 그리드가 항상 최소 개수만큼의 칸을 보여주기
// 위한 채움용이다. 예전엔 카드 전체에 opacity-40을 걸어서 안 그래도 어두운 slate-600 글씨가
// 배경과 거의 구분이 안 될 만큼 흐려졌다 - 아이콘만 옅게 하고, 글씨는 실제로 읽히는 밝기로
// 분리했다. 아이콘은 씨앗 도감의 "미완료" 표현(SeedIcon category=null)과 같은 걸 재사용해,
// "여기엔 아직 아무 감정도 심지 않았다"는 같은 시각 언어로 통일한다.
function EmptyPot() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.03] opacity-50">
        <SeedIcon category={null} sizePx={32} />
      </span>
      <span className="text-[10px] text-slate-500">빈 화분</span>
    </div>
  );
}

interface AmbientStar {
  left: string;
  top: string;
  size: string;
  opacity: string;
  delay: string;
  duration: string;
}

function generateAmbientStars(count: number): AmbientStar[] {
  return Array.from({ length: count }, () => ({
    left: `${(Math.random() * 100).toFixed(2)}%`,
    top: `${(Math.random() * 100).toFixed(2)}%`,
    size: `${(1 + Math.random()).toFixed(2)}px`,
    opacity: (0.15 + Math.random() * 0.55).toFixed(2),
    delay: `${(Math.random() * 4).toFixed(2)}s`,
    duration: `${(3 + Math.random() * 2).toFixed(2)}s`,
  }));
}

// 전설의 정원 섹션 배경 - 꿈 별자리 캘린더(ConstellationCalendar)와 같은 흩뿌린 반짝이는 별
// 텍스처를 재사용해 브랜드 일관성을 준다. 이 페이지는 로그인 유저의 정원을 그리는 클라이언트
// 전용 렌더라 Math.random()을 그대로 써도 하이드레이션 불일치 걱정이 없다(정원 데이터 자체가
// fetch 이후에만 채워져, 이 배경도 최초 페인트 이후에만 그려진다). 카드 개수가 유저마다
// 들쭉날쭉(같은 전설을 여러 번 피운 경우 6개를 넘을 수도 있다)해서 별자리 연결선(고정 좌표
// 매핑)은 넣지 않고, 개수와 무관한 별 텍스처만 얹는다.
function LegendaryAmbientBackground() {
  const [stars] = useState(() => generateAmbientStars(24));
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
    </div>
  );
}

// AI 해몽 빠른 진입(감정일기/수면 단계 없이 상단 "AI 해몽" 버튼)의 산출물 - 유리병 속 빛
// 입자로 표현해, 정식 루틴을 거친 꽃(BloomTile)과 형태부터 확실히 구분되게 한다. 30종
// 분류를 따르지 않으므로 색은 항상 같은 시안 톤이고, 이름도 "표본 No.X"로 고정이다.
function SpecimenTile({ specimen }: { specimen: GardenSpecimen }) {
  return (
    <div
      title={specimen.dream_title ?? undefined}
      className="flex flex-col items-center gap-2 rounded-2xl border border-cyan-400/15 bg-cyan-500/[0.03] p-4 text-center"
    >
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full text-2xl"
        style={{ backgroundColor: "rgba(34,211,238,0.1)", boxShadow: "0 0 16px rgba(34,211,238,0.25)" }}
      >
        🧪
      </span>
      <span className="line-clamp-1 text-xs font-semibold text-cyan-100">{specimen.name}</span>
      {specimen.emotion && <span className="text-sm">{specimen.emotion}</span>}
      {specimen.tags.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1">
          {specimen.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] text-cyan-300"
            >
              {tag.startsWith("#") ? tag : `#${tag}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface BloomDetailModalProps {
  bloom: GardenBloomEntry;
  entry: DreamEntryRecord | null;
  onClose: () => void;
}

function BloomDetailModal({ bloom, entry, onClose }: BloomDetailModalProps) {
  const definition = getSeedDefinition(bloom.seed_type);
  const isSeedStage = bloom.stage === "seed";
  const isForgottenStage = bloom.stage === "forgotten";
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-center text-xs tracking-widest text-emerald-300/70 uppercase">
          {formatBloomDate(bloom.bloomed_at)}
        </p>
        <h2 className="mt-1.5 text-center text-lg font-semibold text-white">
          {isForgottenStage ? "🌫️ 새싹 표본" : isSeedStage ? "🌱 새싹" : `🌸 ${definition.flowerName}`}
        </h2>
        <p className="mt-1 text-center text-xs text-slate-500">
          {isForgottenStage
            ? "이 날은 씨앗을 심었지만 꿈은 기억나지 않았어요."
            : isSeedStage
              ? "아직 꿈으로 피어나지 않았어요."
              : definition.meaning}
        </p>

        {isForgottenStage ? (
          <>
            <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">
              괜찮아요, 모든 꿈이 기억나는 건 아니에요.
              <br />
              이 날 심은 씨앗은 이렇게 그대로 남아있어요.
            </p>
            <ul className="mt-4 space-y-1 text-left text-[11px] leading-relaxed text-slate-400">
              <li>💡 눈뜨자마자 떠오르는 조각이라도 바로 메모해보세요</li>
              <li>💡 머리맡에 메모장을 두면 도움이 돼요</li>
            </ul>
          </>
        ) : isSeedStage ? (
          <p className="mt-5 text-center text-xs text-slate-500">아직 개화하지 않아 보여드릴 기록이 없어요.</p>
        ) : entry ? (
          <div className="mt-5 space-y-4 text-left">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-amber-400/70">☀️ 그날의 현실</p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-300">
                {buildDreamOriginalContent(entry.survey)}
              </p>
            </div>
            {entry.interpretation && (
              <div className="border-l-2 border-l-purple-500/50 bg-purple-950/10 py-1 pl-4">
                <p className="text-[11px] uppercase tracking-wide text-purple-400/70">🌙 AI 해몽</p>
                <p className="mt-1 font-serif text-sm leading-loose text-slate-300/90">{entry.interpretation.description}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-5 text-center text-xs text-slate-500">
            {bloom.dream_title ?? "이 정원의 주인만 볼 수 있는 기록이에요."}
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl border border-slate-700 py-2.5 text-sm text-slate-300 transition-colors hover:bg-slate-800/40"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

// 무의식의 정원 - 마이페이지를 대체하는, 개화까지 끝난 씨앗(식물)을 모아 전시하는 페이지.
// 정적 export(동적 라우트 세그먼트 불가) 프로젝트라 다른 유저 방문은 ?nickname=으로 넘긴다 -
// 파라미터가 없으면 로그인한 내 정원, 있으면 그 닉네임의 공개 정원(비공개면 차단 안내).
export default function GardenPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const [targetNickname, setTargetNickname] = useState<string | null>(null);
  const [hasParsedQuery, setHasParsedQuery] = useState(false);
  // 일기장 요약 카드의 꽃 안내 줄("~이(가) 피었어요")에서 ?bloom=<seedId>로 곧장 들어오면
  // 그 꽃의 상세 관찰 모달을 자동으로 연다 - 내 정원일 때만, 최초 1회만 연다(모달을 닫은 뒤
  // profile이 다시 갱신돼도 재오픈되지 않도록 ref로 막는다).
  const [openBloomId, setOpenBloomId] = useState<number | null>(null);
  const hasAutoOpenedBloomRef = useRef(false);

  useEffect(() => {
    // window.location은 정적 export 빌드(prerender) 시점엔 존재하지 않아 렌더 중에는
    // 읽을 수 없다 - 마운트 이후 effect에서만 쿼리스트링을 파싱할 수 있다.
    const params = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window.location(외부 시스템) 파싱 결과에 반응
    setTargetNickname(params.get("nickname"));
    const bloomParam = params.get("bloom");
    setOpenBloomId(bloomParam ? Number(bloomParam) : null);
    setHasParsedQuery(true);
  }, []);

  const [profile, setProfile] = useState<GardenProfile | null>(null);
  // 실제로 조회가 필요한 조합(targetNickname이 있거나, 내 정원이면 로그인 상태)일 때만
  // "로딩 중"이고, 그 조합을 이미 불러왔는지는 loadedKey로 추적한다 - loadGarden 안에서
  // 별도로 isLoading을 동기 setState할 필요가 없어진다.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dewMessage, setDewMessage] = useState<string | null>(null);
  const [isGivingDew, setIsGivingDew] = useState(false);
  // 남의 정원에서 만개한 꽃을 눌렀을 때만 쓰는 가벼운 전시용 모달(원문 비공개).
  const [selectedBloom, setSelectedBloom] = useState<GardenBloomEntry | null>(null);
  const selectedEntry = useOwnEntryLookup(selectedBloom);
  // 내 정원에서 만개한 꽃을 눌렀을 때 여는 상세 관찰 모달(도감 번호/희귀도/꽃말/고정/공유).
  const [observedBloom, setObservedBloom] = useState<GardenBloomEntry | null>(null);
  const [isPinning, setIsPinning] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  // 상세 모달에서 태그를 눌러 필터가 걸린 상태 - 정원 그리드에서 같은 태그가 없는 꽃은 흐리게 가라앉는다.
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  // "도감 보기" 버튼/모달 열림 상태 - 도감 수집 진행도 카운터 자체는 별도 API 응답을 기다리지
  // 않고 이미 로드된 profile.blooms에서 바로 집계한다(아래 myGeneralSpeciesCount 참고) -
  // 그래야 방금 조회 중인 꽃이 항상 카운트에 반영된다. CompendiumModal(전체 30종 실루엣 화면)은
  // 미발견 슬롯까지 그려야 해서 여전히 자기 안에서 /compendium을 따로 불러온다.
  const [isCompendiumOpen, setIsCompendiumOpen] = useState(false);
  // "씨앗 도감 보기" 모달 열림 상태 - 감정 7종 기준, SeedCompendiumModal이 자기 안에서
  // GET /api/seeds(내 씨앗 전체 이력)를 직접 불러와 집계한다.
  const [isSeedCompendiumOpen, setIsSeedCompendiumOpen] = useState(false);
  // "?" 도움말 모달 - 정원/꽃 시스템이 대략 어떻게 돌아가는지만 알려주고, 정확한 속-종
  // 매핑 공식이나 전설의 꽃 언락 조건은 노출하지 않는다(스포일러 방지).
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  // "떠돌이 표본" 섹션 - 꽃 그리드와 시각적으로 분리하기 위해 기본은 접어 두고, 궁금하면
  // 펼쳐보게 한다.
  const [isSpecimenSectionOpen, setIsSpecimenSectionOpen] = useState(false);

  const loadKey = `${hasParsedQuery}:${targetNickname ?? ""}:${isAuthenticated}`;
  // targetNickname이 있으면 항상 조회하고, 없으면(내 정원) 로그인 상태에서만 조회한다 -
  // 조회 자체가 필요 없는 조합에서는 loadedKey를 신경 쓸 필요 없이 바로 false다.
  const isLoading = hasParsedQuery && (!!targetNickname || isAuthenticated) && loadedKey !== loadKey;

  const loadGarden = useCallback(() => {
    if (!hasParsedQuery) return;
    if (targetNickname) {
      getPublicGarden(targetNickname)
        .then(setProfile)
        .catch((error) => setLoadError(getAuthErrorMessage(error)))
        .finally(() => setLoadedKey(loadKey));
      return;
    }
    if (!isAuthenticated) return;
    getMyGarden()
      .then(setProfile)
      .catch((error) => setLoadError(getAuthErrorMessage(error)))
      .finally(() => setLoadedKey(loadKey));
  }, [hasParsedQuery, targetNickname, isAuthenticated, loadKey]);

  useEffect(() => {
    loadGarden();
  }, [loadGarden]);

  // profile이 도착한 뒤 "최초 1회만" 모달을 자동으로 여는 명령형 동작이라(ref로 재오픈을
  // 막는 것 자체가 "이번 세션에서 이미 열었는가"라는 순수 함수로 표현할 수 없는 이력),
  // 파생 상태로 대체할 수 없다.
  useEffect(() => {
    if (hasAutoOpenedBloomRef.current || !profile || !profile.is_owner || openBloomId === null) return;
    const bloom = profile.blooms.find((entry) => entry.id === openBloomId && entry.stage === "bloom");
    if (bloom) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- profile 도착 후 1회성 자동 오픈(ref로 재실행 방지), 파생 불가
      setObservedBloom(bloom);
      hasAutoOpenedBloomRef.current = true;
    }
  }, [profile, openBloomId]);

  const handleGiveDew = async () => {
    if (!targetNickname || isGivingDew) return;
    setIsGivingDew(true);
    setDewMessage(null);
    try {
      await giveDew(targetNickname);
      setDewMessage("💧 이 정원에 이슬을 주었어요.");
      loadGarden();
    } catch (error) {
      setDewMessage(getAuthErrorMessage(error));
    } finally {
      setIsGivingDew(false);
    }
  };

  // 상세 관찰 모달의 "정원에 고정" 토글 - 내 소유의 이미 개화한 꽃에서만 연다.
  const handleTogglePin = async () => {
    if (!observedBloom || isPinning) return;
    setIsPinning(true);
    setPinError(null);
    try {
      const isCurrentlyPinned = profile?.pinned_seed_id === observedBloom.id;
      const updated = isCurrentlyPinned ? await unpinGardenFlower() : await pinGardenFlower(observedBloom.id);
      setProfile(updated);
    } catch (error) {
      setPinError(getAuthErrorMessage(error));
    } finally {
      setIsPinning(false);
    }
  };

  if (!hasParsedQuery || isLoading) {
    return (
      <div className="min-h-screen bg-[#030712] text-slate-100">
        <NavBar />
        <main className="mx-auto max-w-5xl px-6 py-12 text-center text-sm text-slate-500">불러오는 중...</main>
      </div>
    );
  }

  if (!targetNickname && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#030712] text-slate-100">
        <NavBar />
        <main className="mx-auto max-w-5xl px-6 py-12">
          <h1 className="text-xl font-semibold text-white">🌌 무의식의 정원</h1>
          <div className="mt-6">
            <PreviewGateway
              title="당신만의 정원을 가꿔보세요"
              subtitle="로그인하면 밤마다 심은 씨앗이 피워낸 식물들을 모아보고, 다른 이의 정원에도 방문할 수 있어요."
              ctaLabel="🔒 로그인하고 정원 가꾸기"
              triggerSource="garden"
            />
          </div>
        </main>
      </div>
    );
  }

  if (loadError || !profile) {
    return (
      <div className="min-h-screen bg-[#030712] text-slate-100">
        <NavBar />
        <main className="mx-auto max-w-5xl px-6 py-12 text-center text-sm text-slate-500">
          {loadError ?? "정원을 찾을 수 없어요."}
        </main>
      </div>
    );
  }

  if (!profile.is_public) {
    return (
      <div className="min-h-screen bg-[#030712] text-slate-100">
        <NavBar />
        <main className="mx-auto flex max-w-5xl flex-col items-center px-6 py-24 text-center">
          <span className="text-4xl">🔒</span>
          <p className="mt-4 text-sm text-slate-400">비공개된 무의식 은하입니다</p>
        </main>
      </div>
    );
  }

  const badge = profile.badge;
  const isChallenger = badge ? badge.tier_index >= CHALLENGER_TIER_INDEX : false;
  const borderColor = badge ? tierColor(badge.tier_index) : "#334155";
  const borderStyle: CSSProperties = isChallenger
    ? { border: "2px solid transparent", backgroundImage: "linear-gradient(135deg, #FFD700, #3B82F6)" }
    : { border: `2px solid ${borderColor}`, boxShadow: `0 0 20px ${borderColor}40` };

  const emptyPotCount = Math.max(0, MIN_EMPTY_POTS - profile.blooms.length);

  // 도감 번호(이 정원 주인이 몇 번째로 이 꽃을 피웠는지, 개화일 오름차순) + 수집 진행도(몇
  // 종류의 씨앗을 개화시켜 봤는지) - 새싹 단계는 아직 "수집"된 게 아니라 집계에서 뺀다.
  const bloomedSorted = [...profile.blooms]
    .filter((entry) => entry.stage === "bloom")
    .sort((a, b) => a.bloomed_at.localeCompare(b.bloomed_at));
  const dexNumberByBloomId = new Map(bloomedSorted.map((entry, index) => [entry.id, index + 1] as const));
  const pinnedBloom = profile.blooms.find((entry) => entry.id === profile.pinned_seed_id) ?? null;

  // 상세 모달 하단의 "일반 X/24 · 전설 Y/6" 카운터는 별도 /compendium 호출 대신 이미 로드된
  // profile.blooms에서 직접 집계한다 - 지금 보고 있는 꽃이 항상 이 카운트에 포함되도록
  // 하기 위함이다(별도 API 호출은 타이밍이 어긋나거나 실패하면 방금 소장한 꽃이 카운트에
  // 안 잡히는 채로 조용히 0으로 보일 수 있다). "도감 보기" 전체 30종 화면은 미발견 슬롯까지
  // 그려야 해서 여전히 /compendium을 그대로 쓴다.
  const myGeneralSpeciesCount = new Set(
    bloomedSorted.filter((entry) => !entry.is_legendary && entry.species_name).map((entry) => entry.species_name)
  ).size;
  const myLegendaryCount = new Set(
    bloomedSorted.filter((entry) => entry.is_legendary && entry.legendary_key).map((entry) => entry.legendary_key)
  ).size;

  // 정원 메인 그리드도 도감 모달과 같은 원칙으로 "전설의 정원"을 항상 먼저, "일반 정원"을 그
  // 아래에 별도 섹션으로 보여준다 - 두 목록 모두 profile.blooms가 이미 정렬해 둔 순서
  // (개화일 최신순)를 그대로 유지하고, 카테고리만으로 나눈다. 아직 개화 전(새싹)은 어떤
  // 종이 될지 알 수 없어 일반 정원 쪽에 함께 둔다.
  const legendaryBlooms = profile.blooms.filter((entry) => entry.stage === "bloom" && entry.is_legendary);
  const generalAndSeedBlooms = profile.blooms.filter((entry) => !(entry.stage === "bloom" && entry.is_legendary));

  // 내 정원에서 만개한 꽃을 누르면 상세 관찰 모달을 연다(더 이상 곧장 페이지가 넘어가지
  // 않는다 - 실제 이동은 모달 안 "일기 원문 보기"를 눌러야만 일어난다). 아직 개화 전(새싹)
  // 이면 관찰할 실체가 없으니 그날을 기록하러 곧장 넘어간다. 남의 정원에서는 프라이버시상
  // 기존의 가벼운 전시용 모달만 띄운다.
  const handleBloomClick = (bloom: GardenBloomEntry) => {
    if (profile.is_owner) {
      if (bloom.stage === "bloom") {
        setObservedBloom(bloom);
      } else {
        router.push(`/journal?date=${encodeURIComponent(bloom.bloomed_at)}`);
      }
      return;
    }
    setSelectedBloom(bloom);
  };

  const handleViewDiary = () => {
    if (!observedBloom) return;
    router.push(`/journal?date=${encodeURIComponent(observedBloom.bloomed_at)}`);
  };

  // 무의식 광장 글쓰기의 "꽃" 탭으로 곧장 이 꽃을 미리 선택해 둔 채 넘긴다 - 연결된 꿈 기록이
  // 아니라 이 꽃(DreamSeed) 자체를 공유하는 것이라 dreamId가 아닌 seedId를 넘긴다.
  const handleShare = () => {
    if (!observedBloom) return;
    router.push(`/community/write?type=dream&contentType=flower&seedId=${observedBloom.id}`);
  };

  const handleTagClickFromModal = (tag: string) => {
    setTagFilter(tag);
    setObservedBloom(null);
  };

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100">
      <NavBar />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-col items-center text-center">
          <span
            className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-900 p-1"
            style={borderStyle}
          >
            <span className="flex h-full w-full items-center justify-center rounded-full bg-slate-900">
              <User className="h-8 w-8 text-slate-300" strokeWidth={1.5} />
            </span>
          </span>
          <h1 className="mt-4 text-xl font-semibold text-white">{profile.nickname}의 정원</h1>
          {badge && (
            <p className="mt-1 text-sm" style={{ color: borderColor }}>
              Lv.{badge.level} | {badge.tier_title}
            </p>
          )}
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Sprout className="h-3.5 w-3.5" /> 총 개화한 식물 {profile.total_bloom_count}개
          </p>

          {profile.is_owner && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCompendiumOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-3.5 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/15"
              >
                <BookOpen className="h-3.5 w-3.5" />
                도감 보기 · 일반 {myGeneralSpeciesCount}/{GENERAL_SPECIES_TOTAL} · 전설 {myLegendaryCount}/{LEGENDARY_TOTAL}
              </button>
              <button
                type="button"
                onClick={() => setIsSeedCompendiumOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/30 bg-purple-500/10 px-4 py-3.5 text-xs font-medium text-purple-200 transition-colors hover:bg-purple-500/15"
              >
                🌱 씨앗 도감 보기
              </button>
              <HelpButton
                onClick={() => setIsHelpOpen(true)}
                label="정원은 어떻게 자라나요"
                firstVisitStorageKey="garden_help_hint_shown_v1"
              />
            </div>
          )}

          {!profile.is_owner && (
            <div className="mt-5">
              <button
                type="button"
                onClick={handleGiveDew}
                disabled={isGivingDew || profile.already_gave_dew_today || !isAuthenticated}
                className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-5 py-2.5 text-sm font-medium text-sky-200 transition-all hover:border-sky-400/60 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Droplet className="h-4 w-4" />
                {profile.already_gave_dew_today ? "오늘은 이미 이슬을 주었어요" : "이슬 주기"}
              </button>
              {dewMessage && <p className="mt-2 text-xs text-slate-400">{dewMessage}</p>}
            </div>
          )}
        </div>

        {/* 대표 꽃 - 이 정원 주인이 직접 고정해 둔 꽃 하나만 프로필 바로 아래, 정원 전체보다
            먼저 보여준다. 고정한 적 없으면 이 구역 자체가 없다. */}
        {pinnedBloom && (
          <button
            type="button"
            onClick={() => handleBloomClick(pinnedBloom)}
            className="mx-auto mt-8 flex max-w-xs flex-col items-center gap-2 rounded-2xl border border-amber-400/20 bg-amber-500/[0.04] px-6 py-5 text-center transition-all hover:-translate-y-0.5 hover:border-amber-400/40"
          >
            <span className="inline-flex items-center gap-1 text-[10px] font-medium tracking-wide text-amber-300/80">
              <Pin className="h-3 w-3" /> 대표 꽃
            </span>
            <span
              className="flex h-16 w-16 items-center justify-center rounded-full"
              style={{
                backgroundColor: `${colorForGenus(pinnedBloom.genus)[0]}22`,
                boxShadow: `0 0 20px ${colorForGenus(pinnedBloom.genus)[0]}40`,
              }}
            >
              <FlowerIcon
                archetype={pinnedBloom.archetype}
                genus={pinnedBloom.genus}
                speciesName={pinnedBloom.species_name}
                isLegendary={pinnedBloom.is_legendary}
                sizePx={44}
              />
            </span>
            <span className="text-sm font-semibold text-slate-100">
              {pinnedBloom.flower_name ?? getSeedDefinition(pinnedBloom.seed_type).flowerName}
            </span>
            <span className="text-[11px] text-slate-500">{formatBloomDate(pinnedBloom.bloomed_at)}</span>
          </button>
        )}

        {/* 전설의 정원 - 항상 일반 정원보다 먼저 보여주는 별도 섹션. 도감 모달과 같은 원칙
            (섹션 헤더 좌측 정렬 + 카운터, 별 텍스처 배경, 전설 카드 전용 스타일)을 따른다. */}
        {legendaryBlooms.length > 0 && (
          <section className="mt-10">
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-amber-300/90">
              🌟 전설의 정원 · {myLegendaryCount}/{LEGENDARY_TOTAL}
            </p>
            <div className="relative mt-3 overflow-hidden rounded-2xl border border-amber-400/10 bg-gradient-to-b from-amber-500/[0.05] to-transparent p-4">
              <LegendaryAmbientBackground />
              <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {legendaryBlooms.map((bloom) => (
                  <BloomTile
                    key={bloom.id}
                    bloom={bloom}
                    onClick={() => handleBloomClick(bloom)}
                    dimmed={tagFilter !== null && !bloom.tags.includes(tagFilter)}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 일반 정원 - 전설 섹션과 충분한 여백 + 옅은 구분선으로 갈라 두 구역이 섞여 보이지
            않게 한다. 새싹(아직 개화 전)도 이 섹션에 함께 둔다. */}
        <section className={legendaryBlooms.length > 0 ? "mt-8 border-t border-white/5 pt-6" : "mt-10"}>
          <p className="text-xs font-semibold tracking-wide text-slate-300">
            🌱 일반 정원 · {myGeneralSpeciesCount}/{GENERAL_SPECIES_TOTAL}
          </p>

          {profile.blooms.length > 0 && (
            <p className="mt-3 flex items-center gap-4 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">🌱 새싹 · 꿈을 기다리는 중</span>
              <span className="inline-flex items-center gap-1.5">🌸 만개 · 그날의 감정으로 피어난 꽃</span>
            </p>
          )}

          {/* 상세 모달에서 태그를 눌러 필터가 걸린 상태 - 무엇으로 걸러졌는지와 해제 방법을 항상 보여준다. */}
          {tagFilter && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setTagFilter(null)}
                className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/30 bg-purple-500/10 px-3 py-1 text-[11px] text-purple-200 transition-colors hover:bg-purple-500/20"
              >
                #{tagFilter.replace(/^#/, "")} 태그로 걸러보는 중 · 해제하려면 클릭 ✕
              </button>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {generalAndSeedBlooms.map((bloom) => (
              <BloomTile
                key={bloom.id}
                bloom={bloom}
                onClick={() => handleBloomClick(bloom)}
                dimmed={tagFilter !== null && !bloom.tags.includes(tagFilter)}
              />
            ))}
            {Array.from({ length: emptyPotCount }, (_, i) => (
              <EmptyPot key={i} />
            ))}
          </div>
        </section>

        {/* 떠돌이 표본 - 씨앗 심기->발아->개화의 정식 루틴을 거치지 않고, AI 해몽 빠른 진입으로
            받은 결과물이다. 꽃 그리드와 뒤섞이지 않도록 접을 수 있는 별도 섹션으로 분리하고,
            도감 완성률 카운터에도 포함하지 않는다(별도로 "표본 Z개 수집"만 표시한다). */}
        {profile.is_owner && profile.specimen_count > 0 && (
          <div className="mt-10 border-t border-white/5 pt-8">
            <button
              type="button"
              onClick={() => setIsSpecimenSectionOpen((prev) => !prev)}
              className="mx-auto flex items-center gap-1.5 text-xs font-medium text-cyan-300/80 transition-colors hover:text-cyan-200"
            >
              🧪 떠돌이 표본 · {profile.specimen_count}개 수집
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isSpecimenSectionOpen ? "rotate-180" : ""}`} />
            </button>
            <p className="mt-1 text-center text-[11px] text-slate-400">
              감정일기·수면 단계 없이 AI 해몽만 곧장 받은 결과예요. 정식 루틴을 거친 꽃과는 따로 모아둬요.
            </p>
            {isSpecimenSectionOpen && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {profile.specimens.map((specimen) => (
                  <SpecimenTile key={specimen.id} specimen={specimen} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {selectedBloom && (
        <BloomDetailModal bloom={selectedBloom} entry={selectedEntry} onClose={() => setSelectedBloom(null)} />
      )}

      {observedBloom && (
        <FlowerDetailModal
          bloom={observedBloom}
          dexNumber={dexNumberByBloomId.get(observedBloom.id) ?? 0}
          generalDiscovered={myGeneralSpeciesCount}
          generalTotal={GENERAL_SPECIES_TOTAL}
          legendaryDiscovered={myLegendaryCount}
          legendaryTotal={LEGENDARY_TOTAL}
          isPinned={profile.pinned_seed_id === observedBloom.id}
          isPinning={isPinning}
          onTogglePin={handleTogglePin}
          onViewDiary={handleViewDiary}
          onShare={handleShare}
          onTagClick={handleTagClickFromModal}
          onClose={() => {
            setObservedBloom(null);
            setPinError(null);
          }}
        />
      )}
      {pinError && (
        <div className="pointer-events-none fixed inset-x-0 bottom-8 z-[110] flex justify-center px-4">
          <p className="pointer-events-auto rounded-full border border-red-400/30 bg-slate-950/95 px-4 py-2 text-xs text-red-300 shadow-xl backdrop-blur-md">
            {pinError}
          </p>
        </div>
      )}
      {isCompendiumOpen && <CompendiumModal onClose={() => setIsCompendiumOpen(false)} />}
      {isSeedCompendiumOpen && <SeedCompendiumModal onClose={() => setIsSeedCompendiumOpen(false)} />}
      {isHelpOpen && <GardenHelpModal onClose={() => setIsHelpOpen(false)} />}
    </div>
  );
}
