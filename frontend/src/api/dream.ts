import api from "./axios";
import type { SeedType } from "@/lib/dreamSeeds";
import type { AuthorBadge } from "@/lib/levels";

// 아래 타입/함수들은 backend/routers의 더미 엔드포인트 응답 형태를 그대로 반영한 것으로,
// 실제 기능 구현 시 백엔드 스키마 확정에 맞춰 갱신한다.

export interface MoonPhase {
  date: string;
  phase_name: string;
  is_waxing: boolean;
  illumination: number;
  luck_percent: number;
  message: string;
  summary: string;
  description: string;
  lucky_item: string;
  lucky_item_emoji: string;
  lucky_color: string;
  lucky_color_hex: string;
  lucky_item_reason: string;
  lucky_color_reason: string;
}

export async function getMoonPhase(): Promise<MoonPhase> {
  const { data } = await api.get<MoonPhase>("/api/home/moon-phase");
  return data;
}

// 실시간 트렌드 키워드: 꿈 기록소(공개 글 제목)와 꿈해몽 사전(검색 횟수)을 합산한 실제 집계
// (routers/trends.py). 더미 이모지는 없다 - 홈 화면이 순수하게 keyword/count만으로 렌더링한다.
export interface Trend {
  keyword: string;
  count: number;
}

export interface LiveTickerEntry {
  id: number;
  keyword: string;
}

export async function getLiveTicker(): Promise<LiveTickerEntry[]> {
  const { data } = await api.get<{ entries: LiveTickerEntry[] }>("/api/home/live-ticker");
  return data.entries;
}

export async function getExplorerCount(): Promise<number> {
  const { data } = await api.get<{ count: number }>("/api/home/explorer-count");
  return data.count;
}

export type DreamMood = "good" | "neutral" | "nightmare";

// 베스트 피드: 최근 168시간 내 좋아요 1개 이상 받은 공개 꿈을 상대 랭킹(좋아요→조회수→최신순)으로
// 뽑은 실제 데이터. limit만 다르게 줘서 홈 화면(Top 3)과 커뮤니티 사이드바(Top 5)가 재사용한다.
export interface BestFeedEntry {
  id: number;
  title: string;
  emotion: string;
  upvote_count: number;
}

export async function getTrends(): Promise<Trend[]> {
  const { data } = await api.get<Trend[]>("/api/trends/keywords");
  return data;
}

// 인기 검색어 일간/주간 랭킹 보드(홈 우측): 위 getTrends와 별개로, 사전 검색 로그만 대상으로
// KST 자정마다 도는 야간 배치가 daily_keywords 테이블에 순위/변동폭까지 미리 계산해 적재해둔
// 값을 그대로 읽어온다(routers/trends.py). change/rank_delta는 직전 배치 대비 순위 변동.
export type SearchTrendChange = "up" | "down" | "new" | "same";
export type SearchTrendPeriod = "daily" | "weekly";

export interface SearchTrendRankingItem {
  rank: number;
  keyword: string;
  count: number;
  change: SearchTrendChange;
  rank_delta: number;
}

export async function getSearchTrendRanking(period: SearchTrendPeriod = "daily"): Promise<SearchTrendRankingItem[]> {
  const { data } = await api.get<SearchTrendRankingItem[]>("/api/trends/search-ranking", { params: { period } });
  return data;
}

export async function getBestFeed(limit: number): Promise<BestFeedEntry[]> {
  const { data } = await api.get<{ dreams: BestFeedEntry[] }>("/api/home/best-dreams", { params: { limit } });
  return data.dreams;
}

// 커뮤니티 사이드바 "🏆 실시간 인기 글" - 꿈 게시판/자유 게시판 인기글을 하나로 묶은 랭킹.
// getBestFeed와 동일한 최근 기간·최소 좋아요 기준을 쓰지만, DreamEntry만이 아니라
// CommunityPost도 함께 랭킹에 올린다.
export interface BestPostEntry {
  id: number;
  title: string;
  category: "DREAM" | "FREE";
  upvote_count: number;
  view_count: number;
  comment_count: number;
}

export async function getBestPosts(limit: number): Promise<BestPostEntry[]> {
  const { data } = await api.get<{ posts: BestPostEntry[] }>("/api/home/best-posts", { params: { limit } });
  return data.posts;
}

// 자각의 정도 - 기존 단순 on/off 토글(is_lucid)을 대신한다. control_level은 lucid_level이
// "momentary"/"full"일 때만 의미가 있고, "none"이면 항상 null이다.
export type LucidLevel = "none" | "momentary" | "full";
export type ControlLevel = "director" | "observer" | "lost_control";

export interface DreamSurvey {
  title: string;
  brightness: string;
  space_depth: string;
  space_detail: string;
  identity_factor: string;
  target_detail: string;
  action_physics: string;
  action_detail: string;
  reality_link: string;
  reality_detail: string;
  vividness: number;
  lucid_level: LucidLevel;
  control_level: ControlLevel | null;
  final_memo: string;
  // 씨앗 심기(감정일기) "마음 기록장" 깊이 모드 전용 - 간단 모드/꿈일기는 journal_mode가
  // 항상 "simple"이고 나머지 필드는 비워 둔다. 백엔드 DreamSurveyInput과 필드를 맞춘다.
  journal_mode?: "simple" | "guided";
  initial_emotion?: string | null;
  // 실제로 어느 대분류 아코디언에서 골랐는지 - "고통스러운"/"구역질나는"처럼 같은 단어가
  // 여러 대분류에 겹칠 때 이 힌트로 정확한 분위기 색/속(genus)을 되살린다. 백엔드
  // DreamSurveyInput과 필드를 맞춘다.
  initial_emotion_category?: string | null;
  trigger_event?: string | null;
  desire?: string | null;
  message_to_other?: string | null;
  desired_message?: string | null;
  self_compassion?: string | null;
  closing_emotion?: string | null;
  closing_emotion_category?: string | null;
}

export interface DreamEntryInput {
  date: string;
  emotion: string;
  is_public: boolean;
  survey: DreamSurvey;
}

const ONE_LINE_SUMMARY_MAX_LENGTH = 90;

// 목록 화면용 한 줄 요약을 AI 재호출 없이 만든다. Step 1~4(배경/공간/대상/행동)에서 고른 칩은
// 이미 완결된 구어체 문장이라 이어 붙이기만 해도 자연스럽다. 칩 선택 없이 자유 서술만 남긴
// ⚡ 빠른 기록 모드에서는 그 서술(action_detail) 또는 제목으로 대체한다.
export function buildDreamOneLineSummary(survey: DreamSurvey): string {
  const chipParts = [survey.brightness, survey.space_depth, survey.identity_factor, survey.action_physics]
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const raw = chipParts.length > 0 ? chipParts.join(" · ") : survey.action_detail.trim() || survey.title.trim();

  if (raw.length <= ONE_LINE_SUMMARY_MAX_LENGTH) return raw;
  return `${raw.slice(0, ONE_LINE_SUMMARY_MAX_LENGTH - 1).trimEnd()}…`;
}

// 해몽 결과 위에 인용구로 보여줄 "꿈 원문". 칩 선택(브라이트니스 등)은 유저가 직접 쓴 글이 아니라
// 골라 누른 보기라 제외하고, 실제로 타이핑한 주관식 서술만 순서대로 이어 붙인다. ⚡ 빠른 기록은
// action_detail 하나가 곧 원문 전체다.
export function buildDreamOriginalContent(survey: DreamSurvey): string {
  const writtenParts = [
    survey.space_detail,
    survey.target_detail,
    survey.action_detail,
    survey.reality_detail,
    survey.final_memo,
  ]
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return writtenParts.length > 0 ? writtenParts.join(" ") : survey.title.trim();
}

// 기존 해몽 리포트(description/expert_insight 등)와는 별개로 함께 내려오는 4단계 상담 리포트.
// 공감형 심리 상담가 + 정신분석학자(프로이트/융) + 행동 분석가, 세 관점을 매번 전부 채운다.
export interface CounselingReport {
  empathy: string;
  unconscious_stage: string;
  reality_check: string;
  action_plan: string;
}

export interface AiInterpretation {
  tags: string[];
  description: string;
  // 모든 학파를 나열하지 않고, 이 꿈의 핵심 주제와 가장 찰떡궁합인 전문가 1~2명만 동적으로 선택된다.
  selected_expert: string;
  expert_badge: string;
  expert_insight: string;
  lucky_item: string;
  lucky_item_reason: string;
  lucky_number: number;
  lucky_number_reason: string;
  // 이 기능 이전에 저장된 기록은 값이 없을 수 있다 - 렌더링 전 항상 존재를 확인한다.
  counseling_report?: CounselingReport;
  // 유저가 감정 태그를 직접 고르지 않고 저장할 때 쓰는 AI 추론 폴백 - MOOD_OPTIONS 이모지 중 하나.
  inferred_mood_emoji?: string;
}

export async function requestAiInterpretation(payload: DreamEntryInput): Promise<AiInterpretation> {
  const { data } = await api.post<AiInterpretation>("/api/dream-interpretation", payload);
  return data;
}

// ⚡ 30초 미니멀 빠른 기록: 7단계 문답 없이 자유 서술 한 편만 보내 AI 해몽을 받는다. date를
// 함께 보내면(취침일 기준) 서버가 같은 날짜의 감정일기를 직접 조회해 해몽 맥락에 반영한다 -
// 정밀 모드(requestAiInterpretation)와 같은 서버 조회 방식이라 프론트는 조회 로직 없이
// 날짜만 실어 보내면 된다.
export async function requestQuickAiInterpretation(
  title: string,
  rawText: string,
  date?: string,
  signal?: AbortSignal
): Promise<AiInterpretation> {
  const { data } = await api.post<AiInterpretation>(
    "/api/dream-interpretation-quick",
    { title, raw_text: rawText, date },
    { signal }
  );
  return data;
}

// 아래는 로그인한 유저 소유의 꿈 기록 CRUD. 미리보기용 해몽 요청(위)과 달리 로그인이 필요하다.

// 무의식 광장 "꽃" 콘텐츠 타입 - 공유 시점에 정원 꽃(DreamSeed)의 이름/희귀도/도감 번호를
// 스냅샷으로 굳혀 둔 것. rarity가 이후 다른 유저들의 개화 빈도에 따라 계속 바뀌는 값이라,
// 실시간 조인 대신 공유 당시 값을 그대로 고정한다 - genus/archetype/is_legendary는 프론트의
// FlowerIcon(@/components/FlowerIcon)/flowerLanguageFor(flowerTaxonomy.ts)에 그대로 넘길 수 있는 모양이다.
export interface AttachedFlower {
  seed_id: number;
  species_name: string;
  flower_name: string;
  genus: string | null;
  // 파라메트릭 SVG 아이콘(FlowerIcon)이 원형(모양) 결정에 쓴다 - 이 필드 도입 전에 공유된
  // 스냅샷은 없을 수 있어 optional이다(그때는 기본 실루엣으로 대체된다).
  archetype: string | null;
  is_legendary: boolean;
  legendary_key: string | null;
  rarity: 1 | 2 | 3;
  dex_number: number;
}

// 감정일기/꿈일기 실제 타입 - AI 해몽(interpretation) 유무로 유추하지 않는다. 꿈해몽 사전
// 연계 저장처럼 해몽 없이 저장되는 진짜 꿈일기가 있어, 기록을 만드는 화면이 항상 명시적으로
// 정해 보낸다. 커뮤니티 글쓰기 탭 필터링/꿈 통계 집계 모두 이 필드만 본다.
export type DreamEntryType = "emotion" | "dream";

export interface DreamEntryRecord {
  id: number;
  dream_date: string;
  title: string;
  entry_type: DreamEntryType;
  // 커뮤니티(무의식 광장)에서만 쓰는 별도 제목 - 공유 화면/공개 글 수정에서 고친 제목이 여기
  // 담긴다. title(나만의 일기장/정원 원본 제목)은 절대 건드리지 않는다. 커스터마이즈한 적
  // 없으면 null - 이때 커뮤니티 화면도 title을 그대로 보여준다. dreamDisplayTitle()로 읽는다.
  public_title: string | null;
  emotion: string;
  summary: string;
  is_public: boolean;
  is_anonymous: boolean;
  share_with_ai_analysis: boolean;
  // 꿈 내용과는 별개로, 공유할 때 덧붙인 한마디(질문/자랑거리 등). is_public=false면 의미 없음.
  share_caption: string | null;
  // 현실 일기 전용 사진 첨부(base64 data URL) - 꿈 기록에는 쓰지 않는다.
  photo_url: string | null;
  // 자각 여부(뱃지/통계 등 레거시 boolean 용도) - lucid_level이 "none"이 아니면 항상 true.
  is_lucid: boolean;
  lucid_level: LucidLevel;
  control_level: ControlLevel | null;
  survey: DreamSurvey;
  // 무의식 광장 "직접 쓰기" 모드에서 AI 해몽을 건너뛰고 게시했으면 null.
  interpretation: AiInterpretation | null;
  // "꽃" 콘텐츠 타입일 때만 채워진다 - 있으면 이 행은 실제 꿈 기록이 아니라 정원 꽃 공유 글이다.
  attached_flower: AttachedFlower | null;
  // 글쓰기 화면에서 유저가 직접 입력한 태그(최대 5개) - AI가 interpretation 안에 자동으로
  // 붙여주던 태그를 대신해, 커뮤니티 노출/필터링은 이제 이 필드만 쓴다.
  tags: string[];
  created_at: string;
  updated_at: string;
  // 익명이면 null(프론트가 "익명의 탐험가"로 표시).
  author_display_name: string | null;
  author_badge: AuthorBadge | null;
  // 내가 쓴 꿈인지 - 자유 광장과 동일하게 수정/삭제 버튼 노출 여부 판단용. 실제 권한 체크는
  // 서버(PUT/DELETE /api/dreams/{id})가 다시 한다. 소유자 전용 CRUD 응답은 항상 true.
  is_mine: boolean;
  // 공개 상세 조회(getPublicDream)에서만 실제 값이 채워진다. 그 외(listDreams 등 내 소유 CRUD
  // 응답)에서는 서버가 기본값(0/null)을 그대로 내려준다.
  upvote_count: number;
  downvote_count: number;
  my_vote: "up" | "down" | null;
  // 공개 상세 조회(getPublicDream)에서만 실제 값이 채워진다.
  view_count: number;
  // 이 기록의 생성으로 어젯밤 심어둔 씨앗이 개화했다면 그 씨앗 종류(createDream 응답에서만
  // 실제로 채워진다 - 목록 조회/수정 응답은 항상 null). 저널 타임라인이 이 값으로 "방금 이
  // 카드가 개화했다"는 걸 판단한다.
  bloomed_seed_type: SeedType | null;
}

export interface DreamEntryPayload {
  dream_date: string;
  title: string;
  entry_type: DreamEntryType;
  // 커뮤니티 전용 제목 오버라이드 - 공유/공개 글 수정 화면에서만 보낸다. 일반 일기 저장은 이
  // 필드를 아예 넣지 않아야 기존 커스텀 공개 제목이 조용히 지워지지 않는다.
  public_title?: string | null;
  emotion: string;
  summary: string;
  is_public: boolean;
  is_anonymous: boolean;
  share_with_ai_analysis: boolean;
  share_caption?: string | null;
  photo_url?: string | null;
  survey: DreamSurvey;
  interpretation?: AiInterpretation | null;
  tags?: string[];
  // "꽃" 콘텐츠 타입 전용 - 공유할 내 정원 꽃(GardenBloomEntry.id, 곧 DreamSeed.id)을 지정하면
  // 서버가 이름/희귀도/도감 번호 스냅샷을 만들어 attached_flower에 저장한다. createDream에서만
  // 의미가 있다.
  attached_flower_seed_id?: number | null;
  // "quick_interpret"이면 감정일기->수면->꿈일기(4단계 정식 루틴) 없이 상단 "AI 해몽" 버튼으로
  // 곧장 받은 결과라는 뜻 - 서버가 정원의 꽃 대신 "표본"으로 남긴다. 일기장의 꿈 기록 모달은
  // 정식 루틴이라 생략하면 서버 기본값("normal")이 적용된다.
  origin?: "normal" | "quick_interpret";
}

// 커뮤니티(무의식 광장) 화면에서 보여줄 제목. public_title을 커스터마이즈했으면 그걸, 아니면
// 원본 title을 그대로 쓴다. 일기장/정원 등 사적인 화면에서는 절대 쓰지 말고 entry.title을 직접 읽을 것.
export function dreamDisplayTitle(entry: Pick<DreamEntryRecord, "title" | "public_title">): string {
  return entry.public_title?.trim() || entry.title;
}

export async function listDreams(): Promise<DreamEntryRecord[]> {
  const { data } = await api.get<DreamEntryRecord[]>("/api/dreams");
  return data;
}

// 커뮤니티 상세 페이지용 익명 공개 조회. 로그인 불필요 - PUBLIC 상태가 아니거나 없는 글이면
// 404를 던진다 (호출부에서 "글을 찾을 수 없어요" 상태로 처리).
export async function getPublicDream(id: number): Promise<DreamEntryRecord> {
  const { data } = await api.get<DreamEntryRecord>(`/api/dreams/public/${id}`);
  return data;
}

export async function createDream(payload: DreamEntryPayload): Promise<DreamEntryRecord> {
  const { data } = await api.post<DreamEntryRecord>("/api/dreams", payload);
  return data;
}

export async function updateDream(id: number, payload: DreamEntryPayload): Promise<DreamEntryRecord> {
  const { data } = await api.put<DreamEntryRecord>(`/api/dreams/${id}`, payload);
  return data;
}

export async function deleteDream(id: number): Promise<void> {
  await api.delete(`/api/dreams/${id}`);
}

// 해몽 없이 저장된 기록(나만의 일기장 등)에 사후적으로 AI 해몽을 붙인다.
// 이미 해몽이 있으면 서버가 400으로 거절한다.
export async function requestPostInterpretation(id: number): Promise<DreamEntryRecord> {
  const { data } = await api.post<DreamEntryRecord>(`/api/dreams/${id}/interpretation`);
  return data;
}

// 이미 저장된 기록의 공개 범위만 바꾼다 (AI 재분석 없음) - survey/interpretation은 그대로 재사용하고
// is_public/is_anonymous/share_with_ai_analysis만 교체해 updateDream을 호출한다. 꿈 기록소 상세 보기와
// 커뮤니티 페이지의 "내 꿈 공유하기" 둘 다 이 함수 하나를 공유한다.
export async function setDreamVisibility(
  entry: DreamEntryRecord,
  options: {
    isPublic: boolean;
    isAnonymous: boolean;
    shareWithAiAnalysis: boolean;
    shareCaption?: string;
    // 커뮤니티 화면에만 노출되는 제목을 공유 시점에 바꿀 수 있게 한다 - 생략하면 기존 public_title
    // 유지. title(일기장 원본)은 이 함수가 절대 건드리지 않는다.
    publicTitle?: string;
    // 글쓰기 화면에서 직접 입력한 태그를 함께 바꿀 때만 넘긴다 - 생략하면 기존 태그를 그대로 유지한다.
    tags?: string[];
  }
): Promise<DreamEntryRecord> {
  return updateDream(entry.id, {
    dream_date: entry.dream_date,
    title: entry.title,
    entry_type: entry.entry_type,
    public_title:
      options.publicTitle !== undefined ? options.publicTitle.trim() || null : entry.public_title,
    emotion: entry.emotion,
    summary: entry.summary,
    is_public: options.isPublic,
    is_anonymous: options.isAnonymous,
    share_with_ai_analysis: options.shareWithAiAnalysis,
    share_caption: options.shareCaption ?? entry.share_caption,
    photo_url: entry.photo_url,
    survey: entry.survey,
    interpretation: entry.interpretation,
    tags: options.tags ?? entry.tags,
  });
}

// 🔮 무의식 피드: 꿈 기록소에서 실제로 "공개"로 저장한 진짜 DreamEntry 목록 (더미 아님).
export interface DreamFeedAiReport {
  description: string;
  selected_expert: string;
  expert_badge: string;
  expert_insight: string;
}

export interface DreamFeedEntry {
  id: number;
  title: string;
  emotion: string;
  summary: string;
  tags: string[];
  dream_date: string;
  // dream_date는 유저가 고르는 "꿈을 꾼 날짜"라 과거로 소급될 수 있어, 게시 후 10분 수정
  // 제한(POST_EDIT_WINDOW_MS) 판단에는 실제 게시 시각인 이 필드를 대신 쓴다.
  created_at: string;
  upvote_count: number;
  downvote_count: number;
  my_vote: "up" | "down" | null;
  is_anonymous: boolean;
  author_display_name: string | null;
  author_badge: AuthorBadge | null;
  share_with_ai_analysis: boolean;
  share_caption: string | null;
  // summary는 목록용 90자 요약이라 "…"로 잘려 있다 - 카드에서 원문을 끝까지(펼치기로) 보여주려면
  // 이 survey로 buildDreamOriginalContent를 다시 돌려야 한다.
  survey: DreamSurvey;
  comment_count: number;
  view_count: number;
  // 내가 쓴 꿈인지 - 자유 광장과 동일하게 수정/삭제 버튼 노출 여부 판단용. 실제 권한 체크는
  // 서버(PUT/DELETE /api/dreams/{id})가 다시 한다.
  is_mine: boolean;
  ai_report: DreamFeedAiReport | null;
  attached_flower: AttachedFlower | null;
}

export interface VoteResult {
  my_vote: "up" | "down" | null;
  upvote_count: number;
  downvote_count: number;
}

// 무의식 피드 목록 - 자유 광장(getCommunityPosts)과 동일한 페이지네이션/검색/정렬/기간
// 파라미터를 그대로 지원한다(꿈 게시판/자유 게시판 상단 필터 UI 통일).
export interface DreamFeedListResponse {
  items: DreamFeedEntry[];
  total_count: number;
  total_pages: number;
  page: number;
}

export interface DreamFeedListParams {
  page?: number;
  limit?: number;
  searchType?: CommunitySearchType;
  keyword?: string;
  sort?: CommunitySort;
  period?: CommunityPeriod;
}

export async function getDreamFeed(params: DreamFeedListParams = {}): Promise<DreamFeedListResponse> {
  const { page = 1, limit = 10, searchType, keyword, sort, period } = params;
  const { data } = await api.get<DreamFeedListResponse>("/api/community/dream-feed", {
    params: {
      page,
      limit,
      search_type: searchType,
      keyword: keyword?.trim() ? keyword.trim() : undefined,
      sort,
      period,
    },
  });
  return data;
}

export async function voteOnDream(dreamId: number, voteType: "up" | "down"): Promise<VoteResult> {
  const { data } = await api.post<VoteResult>(`/api/community/dream-feed/${dreamId}/vote`, { vote_type: voteType });
  return data;
}

// 마이페이지 '❤️ 공감한 꿈' 탭 - 내가 공감 누른, 지금도 공개 상태인 실제 꿈 기록.
export async function getMyLikedDreams(): Promise<DreamFeedEntry[]> {
  const { data } = await api.get<DreamFeedEntry[]>("/api/community/my-liked-dreams");
  return data;
}

// 💬 자유 광장: 꿈과 무관한 자유 게시글.
export interface CommunityPost {
  id: number;
  title: string;
  content: string;
  upvote_count: number;
  downvote_count: number;
  my_vote: "up" | "down" | null;
  is_anonymous: boolean;
  author_display_name: string | null;
  author_badge: AuthorBadge | null;
  comment_count: number;
  created_at: string;
  // 글쓰기에서 첨부한 이미지들의 R2 공개 URL 목록(최대 3장, 순서대로 노출).
  image_urls: string[];
  // ?template=galaxy 글쓰기에서 고른 주파수 태그(rest/growth/healing/adventure) - 커뮤니티
  // 헤더의 주파수 필터는 오직 이 필드만 조회한다. 일반 자유 글은 빈 배열.
  public_tags: string[];
  // 상세 조회(getCommunityPost)에서만 어뷰징 방지를 거쳐 증가한다.
  view_count: number;
  // 내가 쓴 글인지 - 수정/삭제 버튼 노출 여부 판단용. 실제 권한 체크는 서버가 다시 한다.
  is_mine: boolean;
}

export interface CommunityPostListResponse {
  items: CommunityPost[];
  total_count: number;
  total_pages: number;
  page: number;
}

export type CommunitySearchType = "all" | "title" | "hashtag" | "author";
export type CommunitySort = "latest" | "likes" | "views";
export type CommunityPeriod = "weekly" | "monthly" | "all";

export interface CommunityPostListParams {
  page?: number;
  limit?: number;
  searchType?: CommunitySearchType;
  keyword?: string;
  sort?: CommunitySort;
  period?: CommunityPeriod;
}

export async function getCommunityPosts(params: CommunityPostListParams = {}): Promise<CommunityPostListResponse> {
  const { page = 1, limit = 10, searchType, keyword, sort, period } = params;
  const { data } = await api.get<CommunityPostListResponse>("/api/community/posts", {
    params: {
      page,
      limit,
      search_type: searchType,
      keyword: keyword?.trim() ? keyword.trim() : undefined,
      sort,
      period,
    },
  });
  return data;
}

// 커뮤니티 상단 태그 필터 바 - 최근 7일간 가장 많이 쓰인 해시태그 Top 8을 서버가 집계해서 준다.
export interface TagCount {
  tag: string;
  count: number;
}

export interface TopCommunityTagsParams {
  // 0이면 기간 제한 없이(전체 기간) 집계한다 - "+ 태그 더보기" 전체 목록 모달이 쓴다.
  days?: number;
  limit?: number;
  // 자유 광장(board, 기본값)/꿈 게시판(dream) 중 어느 태그를 집계할지 - 서로 다른 컬럼(source)이다.
  source?: "board" | "dream";
}

export async function getTopCommunityTags(params: TopCommunityTagsParams = {}): Promise<TagCount[]> {
  const { data } = await api.get<TagCount[]>("/api/community/tags/top", { params });
  return data;
}

// 리스트에서 제목을 눌러 들어오는 상세 페이지용 단건 조회 - 로그인 없이도 조회 가능.
export async function getCommunityPost(postId: number): Promise<CommunityPost> {
  const { data } = await api.get<CommunityPost>(`/api/community/posts/${postId}`);
  return data;
}

// 글쓰기에서 이미지를 고르는 즉시 하나씩 업로드해 R2 공개 URL을 받는다 - 게시 시점에는
// 이미 업로드된 URL 목록만 createCommunityPost로 함께 보낸다.
export async function uploadCommunityImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<{ url: string }>("/api/community/images", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.url;
}

export async function createCommunityPost(
  title: string,
  content: string,
  isAnonymous: boolean,
  imageUrls: string[] = [],
  publicTags: string[] = []
): Promise<CommunityPost> {
  const { data } = await api.post<CommunityPost>("/api/community/posts", {
    title,
    content,
    is_anonymous: isAnonymous,
    image_urls: imageUrls,
    public_tags: publicTags,
  });
  return data;
}

// 게시 후 10분이 지나면 서버가 403으로 거절한다 - 프론트는 POST_EDIT_WINDOW_MS로 버튼 자체를 미리 숨긴다.
export const POST_EDIT_WINDOW_MS = 10 * 60 * 1000;

export async function updateCommunityPost(
  postId: number,
  title: string,
  content: string,
  isAnonymous: boolean,
  publicTags: string[] = []
): Promise<CommunityPost> {
  const { data } = await api.put<CommunityPost>(`/api/community/posts/${postId}`, {
    title,
    content,
    is_anonymous: isAnonymous,
    public_tags: publicTags,
  });
  return data;
}

// 🌌 무의식 은하 프로필 - 커뮤니티 닉네임 호버 카드용. is_public이 false면 다른 필드는
// 항상 null(원문/개수 등 어떤 개인 데이터도 응답에 섞이지 않는다).
export interface GalaxySeedRatio {
  seed: SeedType;
  ratio: number;
}

export interface GalaxyProfile {
  is_public: boolean;
  seed_ratios: GalaxySeedRatio[] | null;
  badge_ids: string[] | null;
}

export async function getGalaxyProfile(nickname: string): Promise<GalaxyProfile> {
  const { data } = await api.get<GalaxyProfile>(`/api/community/profiles/${encodeURIComponent(nickname)}/galaxy`);
  return data;
}

export async function deleteCommunityPost(postId: number): Promise<void> {
  await api.delete(`/api/community/posts/${postId}`);
}

export async function voteOnPost(postId: number, voteType: "up" | "down"): Promise<VoteResult> {
  const { data } = await api.post<VoteResult>(`/api/community/posts/${postId}/vote`, { vote_type: voteType });
  return data;
}

// 마이페이지 '💬 내가 쓴 자유글' 탭 - 로그인한 본인이 작성한 자유 광장 글 전체.
export async function getMyPosts(): Promise<CommunityPost[]> {
  const { data } = await api.get<CommunityPost[]>("/api/community/my-posts");
  return data;
}

// 💬 자유 광장 게시글 댓글. 게시글과 동일한 아이덴티티 선택(익명/닉네임)을 댓글 단위로도 고를 수 있다.
// 티키타카를 위한 1-Depth 답글: parent_id가 있으면 답글이고, 답글에는 다시 답글을 달 수 없다.
export interface CommunityComment {
  id: number;
  content: string;
  is_anonymous: boolean;
  author_display_name: string | null;
  author_badge: AuthorBadge | null;
  created_at: string;
  // 내가 쓴 댓글인지 - 수정/삭제 버튼 노출 여부 판단용. 실제 권한 체크는 서버가 다시 한다.
  is_mine: boolean;
  parent_id: number | null;
  // 게시물(글/꿈 기록) 작성자 본인이 남긴 댓글인지 - "글쓴이" 뱃지 노출용.
  is_post_author: boolean;
  // 익명 댓글이면 이 게시물 안에서 몇 번째 익명 유저인지(1부터) - "익명2"처럼 표시한다.
  // 글쓴이 본인의 익명 댓글/실명 댓글은 항상 null.
  anonymous_index: number | null;
}

export async function getPostComments(postId: number): Promise<CommunityComment[]> {
  const { data } = await api.get<CommunityComment[]>(`/api/community/posts/${postId}/comments`);
  return data;
}

export async function createPostComment(
  postId: number,
  content: string,
  isAnonymous: boolean,
  parentId?: number | null
): Promise<CommunityComment> {
  const { data } = await api.post<CommunityComment>(`/api/community/posts/${postId}/comments`, {
    content,
    is_anonymous: isAnonymous,
    parent_id: parentId ?? null,
  });
  return data;
}

export async function updatePostComment(
  postId: number,
  commentId: number,
  content: string,
  isAnonymous: boolean
): Promise<CommunityComment> {
  const { data } = await api.put<CommunityComment>(`/api/community/posts/${postId}/comments/${commentId}`, {
    content,
    is_anonymous: isAnonymous,
  });
  return data;
}

export async function deletePostComment(postId: number, commentId: number): Promise<void> {
  await api.delete(`/api/community/posts/${postId}/comments/${commentId}`);
}

// 🔮 무의식 피드에 공개된 꿈 기록 댓글. 응답 구조는 자유 광장 댓글(CommunityComment)과 동일해
// 그대로 재사용한다 - 공감(❤️)만으로는 부족한, 유저끼리 실제로 이야기를 나누는 자리다.
export async function getDreamComments(dreamId: number): Promise<CommunityComment[]> {
  const { data } = await api.get<CommunityComment[]>(`/api/community/dream-feed/${dreamId}/comments`);
  return data;
}

export async function createDreamComment(
  dreamId: number,
  content: string,
  isAnonymous: boolean,
  parentId?: number | null
): Promise<CommunityComment> {
  const { data } = await api.post<CommunityComment>(`/api/community/dream-feed/${dreamId}/comments`, {
    content,
    is_anonymous: isAnonymous,
    parent_id: parentId ?? null,
  });
  return data;
}

export async function updateDreamComment(
  dreamId: number,
  commentId: number,
  content: string,
  isAnonymous: boolean
): Promise<CommunityComment> {
  const { data } = await api.put<CommunityComment>(`/api/community/dream-feed/${dreamId}/comments/${commentId}`, {
    content,
    is_anonymous: isAnonymous,
  });
  return data;
}

export async function deleteDreamComment(dreamId: number, commentId: number): Promise<void> {
  await api.delete(`/api/community/dream-feed/${dreamId}/comments/${commentId}`);
}

export interface CalendarDay {
  date: string;
  emotion: string | null;
}

export interface UnconsciousStats {
  top_keywords: { keyword: string; count: number }[];
  emotion_distribution: Record<string, number>;
  lucid_dream_ratio: number;
}

export interface ScrapEntry {
  id: number;
  content: string;
  emotion: string;
  scrapped_at: string;
}

export async function getCalendar(): Promise<CalendarDay[]> {
  const { data } = await api.get<{ days: CalendarDay[] }>("/mypage/calendar");
  return data.days;
}

export async function getUnconsciousStats(): Promise<UnconsciousStats> {
  const { data } = await api.get<UnconsciousStats>("/mypage/stats");
  return data;
}

export async function getScrapbook(): Promise<ScrapEntry[]> {
  const { data } = await api.get<{ entries: ScrapEntry[] }>("/mypage/scrapbook");
  return data.entries;
}

// 🌱 무의식의 정원 - 개화까지 끝난 씨앗(식물) 컬렉션 + 소셜 방문/이슬 주기.
export interface GardenBloomEntry {
  id: number;
  seed_type: SeedType;
  // 이 개화가 귀속되는 날짜 - 씨앗을 심은 날(=정원 카드의 날짜)이지, 꿈을 기록한 날이 아니다.
  bloomed_at: string;
  dream_entry_id: number | null;
  dream_title: string | null;
  // 그날 꿈 일기의 감정 기록 - 꽃 색상을 여기서 정한다. 아직 개화 전(seed 단계)이면 null.
  emotion: string | null;
  // "seed"(심었지만 아직 개화 전 - 새싹) / "bloom"(개화 완료 - 만개) / "forgotten"("꿈이
  // 기억나지 않아요"를 명시적으로 선택 - 정식 꽃 대신 새싹 표본으로 표시)
  stage: "seed" | "bloom" | "forgotten";
  // AI가 붙인 원본 태그("#전연인" 등) - 상세 관찰 모달의 태그 표시/희귀도 산정에 쓴다.
  tags: string[];
  // --- 꽃 도감 분류(속x종x변종) - 개화 단계에서만 채워진다. 이 필드가 도입되기 전에
  // 개화한 옛 기록은 전부 null일 수 있다(프론트가 seed_type 기반으로 대체 표시한다). ---
  genus: string | null;
  archetype: string | null;
  species_name: string | null;
  flower_name: string | null;
  is_legendary: boolean;
  legendary_key: string | null;
  rarity: 1 | 2 | 3 | null;
  is_first_discovery: boolean;
  // "성장의 반짝임" 배지 - 마음 기록장(깊이 모드)에서 부정 감정으로 시작해 긍정 감정으로
  // 마무리한 날에만 true. species_name/rarity와는 무관한 별도 표시라 종/희귀도 판정에는
  // 전혀 영향을 주지 않는다.
  growth_badge: boolean;
}

// "떠돌이 표본" - AI 해몽 빠른 진입(정식 루틴 미완료)의 산출물. 30종 꽃 분류를 따르지 않고
// 유저별 순번만 매긴 "표본 No.X"로 남는다. 도감 완성률 집계와 완전히 분리된 컬렉션이다.
export interface GardenSpecimen {
  id: number;
  sequence_number: number;
  name: string;
  emotion: string | null;
  tags: string[];
  dream_entry_id: number | null;
  dream_title: string | null;
  created_at: string;
}

export interface GardenProfile {
  is_public: boolean;
  nickname: string | null;
  badge: AuthorBadge | null;
  total_bloom_count: number;
  blooms: GardenBloomEntry[];
  is_owner: boolean;
  already_gave_dew_today: boolean;
  // 이 정원 주인이 대표로 고정한 꽃(GardenBloomEntry.id) - 없으면 null.
  pinned_seed_id: number | null;
  // 소유자 본인에게만 채워진다(타인 정원 조회 시 항상 빈 배열/0).
  specimens: GardenSpecimen[];
  specimen_count: number;
}

export async function getMyGarden(): Promise<GardenProfile> {
  const { data } = await api.get<GardenProfile>("/api/garden/me");
  return data;
}

// 비공개 정원이면 is_public:false만 채워진 응답이 온다 - 나머지 필드는 프론트에서도
// 절대 신뢰하지 말고 "비공개된 무의식 은하입니다" 안내만 보여줘야 한다.
export async function getPublicGarden(nickname: string): Promise<GardenProfile> {
  const { data } = await api.get<GardenProfile>(`/api/garden/${encodeURIComponent(nickname)}`);
  return data;
}

// 하루 한 번, (나, 상대) 조합으로만 성공한다 - 이미 줬으면 서버가 409를 던진다.
export async function giveDew(nickname: string): Promise<void> {
  await api.post(`/api/garden/${encodeURIComponent(nickname)}/dew`);
}

// 정원 대표 꽃 고정/해제 - 내 소유의 이미 개화한 씨앗만 고정할 수 있다.
export async function pinGardenFlower(seedId: number): Promise<GardenProfile> {
  const { data } = await api.post<GardenProfile>(`/api/garden/pin/${seedId}`);
  return data;
}

export async function unpinGardenFlower(): Promise<GardenProfile> {
  const { data } = await api.delete<GardenProfile>("/api/garden/pin");
  return data;
}

// 🌸 꽃 도감 - 일반 24종(8원형 x 3종) + 전설 6종 = 30종. 미발견 항목은 species_name/
// example_name이 항상 null(실루엣) - 절대 이름을 미리 알 수 없다.
export interface CompendiumEntry {
  slot_id: string;
  category: "general" | "legendary";
  archetype: string | null;
  discovered: boolean;
  species_name: string | null;
  example_name: string | null;
  // 파라메트릭 SVG 아이콘(FlowerIcon)의 색상 결정에 쓴다 - 대표 개체(가장 먼저 발견한 것)의
  // 속. discovered=false면 항상 null.
  genus: string | null;
  rarity: 1 | 2 | 3 | null;
  first_bloomed_at: string | null;
  count: number;
  hint: string | null;
  // 대표 개체가 개화할 때 연결된 실제 꿈 기록의 감정 - moodBucketForEmoji로 길몽/보통/흉몽
  // 아우라 색을 정하는 데 쓴다. 연결된 꿈 기록이 없으면 null(프론트는 "보통" 톤으로 대체).
  emotion: string | null;
}

export interface CompendiumResponse {
  general_discovered: number;
  general_total: number;
  legendary_discovered: number;
  legendary_total: number;
  entries: CompendiumEntry[];
}

export async function getMyCompendium(): Promise<CompendiumResponse> {
  const { data } = await api.get<CompendiumResponse>("/api/garden/compendium");
  return data;
}

