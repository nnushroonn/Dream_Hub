import api from "./axios";

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

export interface BestDream {
  id: number;
  title: string;
  content: string;
  emotion: string;
  empathy_count: number;
  author: string;
}

export async function getTrends(): Promise<Trend[]> {
  const { data } = await api.get<Trend[]>("/api/trends/keywords");
  return data;
}

export async function getBestDreams(): Promise<BestDream[]> {
  const { data } = await api.get<{ dreams: BestDream[] }>("/api/home/best-dreams");
  return data.dreams;
}

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
  is_lucid: boolean;
  final_memo: string;
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
}

export async function requestAiInterpretation(payload: DreamEntryInput): Promise<AiInterpretation> {
  const { data } = await api.post<AiInterpretation>("/api/dream-interpretation", payload);
  return data;
}

// ⚡ 10초 미니멀 빠른 기록: 7단계 문답 없이 자유 서술 한 편만 보내 AI 해몽을 받는다.
export async function requestQuickAiInterpretation(title: string, rawText: string): Promise<AiInterpretation> {
  const { data } = await api.post<AiInterpretation>("/api/dream-interpretation-quick", {
    title,
    raw_text: rawText,
  });
  return data;
}

// 아래는 로그인한 유저 소유의 꿈 기록 CRUD. 미리보기용 해몽 요청(위)과 달리 로그인이 필요하다.

export interface DreamEntryRecord {
  id: number;
  dream_date: string;
  title: string;
  emotion: string;
  summary: string;
  is_public: boolean;
  is_anonymous: boolean;
  share_with_ai_analysis: boolean;
  is_lucid: boolean;
  survey: DreamSurvey;
  interpretation: AiInterpretation;
  created_at: string;
  updated_at: string;
}

export interface DreamEntryPayload {
  dream_date: string;
  title: string;
  emotion: string;
  summary: string;
  is_public: boolean;
  is_anonymous: boolean;
  share_with_ai_analysis: boolean;
  survey: DreamSurvey;
  interpretation: AiInterpretation;
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

// 이미 저장된 기록의 공개 범위만 바꾼다 (AI 재분석 없음) - survey/interpretation은 그대로 재사용하고
// is_public/is_anonymous/share_with_ai_analysis만 교체해 updateDream을 호출한다. 꿈 기록소 상세 보기와
// 커뮤니티 페이지의 "내 꿈 공유하기" 둘 다 이 함수 하나를 공유한다.
export async function setDreamVisibility(
  entry: DreamEntryRecord,
  options: { isPublic: boolean; isAnonymous: boolean; shareWithAiAnalysis: boolean }
): Promise<DreamEntryRecord> {
  return updateDream(entry.id, {
    dream_date: entry.dream_date,
    title: entry.title,
    emotion: entry.emotion,
    summary: entry.summary,
    is_public: options.isPublic,
    is_anonymous: options.isAnonymous,
    share_with_ai_analysis: options.shareWithAiAnalysis,
    survey: entry.survey,
    interpretation: entry.interpretation,
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
  empathy_count: number;
  is_liked_by_me: boolean;
  is_anonymous: boolean;
  author_display_name: string | null;
  share_with_ai_analysis: boolean;
  ai_report: DreamFeedAiReport | null;
}

export interface EmpathyResult {
  is_liked_by_me: boolean;
  empathy_count: number;
}

export async function getDreamFeed(): Promise<DreamFeedEntry[]> {
  const { data } = await api.get<DreamFeedEntry[]>("/api/community/dream-feed");
  return data;
}

export async function toggleDreamEmpathy(dreamId: number): Promise<EmpathyResult> {
  const { data } = await api.post<EmpathyResult>(`/api/community/dream-feed/${dreamId}/empathy`);
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
  content: string;
  empathy_count: number;
  is_liked_by_me: boolean;
  is_anonymous: boolean;
  author_display_name: string | null;
  comment_count: number;
  created_at: string;
}

export async function getCommunityPosts(): Promise<CommunityPost[]> {
  const { data } = await api.get<CommunityPost[]>("/api/community/posts");
  return data;
}

export async function createCommunityPost(content: string, isAnonymous: boolean): Promise<CommunityPost> {
  const { data } = await api.post<CommunityPost>("/api/community/posts", { content, is_anonymous: isAnonymous });
  return data;
}

export async function togglePostEmpathy(postId: number): Promise<EmpathyResult> {
  const { data } = await api.post<EmpathyResult>(`/api/community/posts/${postId}/empathy`);
  return data;
}

// 마이페이지 '💬 내가 쓴 자유글' 탭 - 로그인한 본인이 작성한 자유 광장 글 전체.
export async function getMyPosts(): Promise<CommunityPost[]> {
  const { data } = await api.get<CommunityPost[]>("/api/community/my-posts");
  return data;
}

// 💬 자유 광장 게시글 댓글. 게시글과 동일한 아이덴티티 선택(익명/닉네임)을 댓글 단위로도 고를 수 있다.
export interface CommunityComment {
  id: number;
  content: string;
  is_anonymous: boolean;
  author_display_name: string | null;
  created_at: string;
}

export async function getPostComments(postId: number): Promise<CommunityComment[]> {
  const { data } = await api.get<CommunityComment[]>(`/api/community/posts/${postId}/comments`);
  return data;
}

export async function createPostComment(
  postId: number,
  content: string,
  isAnonymous: boolean
): Promise<CommunityComment> {
  const { data } = await api.post<CommunityComment>(`/api/community/posts/${postId}/comments`, {
    content,
    is_anonymous: isAnonymous,
  });
  return data;
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

