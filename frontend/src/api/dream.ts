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

export async function getBestFeed(limit: number): Promise<BestFeedEntry[]> {
  const { data } = await api.get<{ dreams: BestFeedEntry[] }>("/api/home/best-dreams", { params: { limit } });
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
  // 꿈 내용과는 별개로, 공유할 때 덧붙인 한마디(질문/자랑거리 등). is_public=false면 의미 없음.
  share_caption: string | null;
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
  share_caption?: string | null;
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
  options: { isPublic: boolean; isAnonymous: boolean; shareWithAiAnalysis: boolean; shareCaption?: string }
): Promise<DreamEntryRecord> {
  return updateDream(entry.id, {
    dream_date: entry.dream_date,
    title: entry.title,
    emotion: entry.emotion,
    summary: entry.summary,
    is_public: options.isPublic,
    is_anonymous: options.isAnonymous,
    share_with_ai_analysis: options.shareWithAiAnalysis,
    share_caption: options.shareCaption ?? entry.share_caption,
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
  upvote_count: number;
  downvote_count: number;
  my_vote: "up" | "down" | null;
  is_anonymous: boolean;
  author_display_name: string | null;
  share_with_ai_analysis: boolean;
  share_caption: string | null;
  // summary는 목록용 90자 요약이라 "…"로 잘려 있다 - 카드에서 원문을 끝까지(펼치기로) 보여주려면
  // 이 survey로 buildDreamOriginalContent를 다시 돌려야 한다.
  survey: DreamSurvey;
  comment_count: number;
  ai_report: DreamFeedAiReport | null;
}

export interface VoteResult {
  my_vote: "up" | "down" | null;
  upvote_count: number;
  downvote_count: number;
}

export async function getDreamFeed(): Promise<DreamFeedEntry[]> {
  const { data } = await api.get<DreamFeedEntry[]>("/api/community/dream-feed");
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
  comment_count: number;
  created_at: string;
  // 내가 쓴 글인지 - 수정/삭제 버튼 노출 여부 판단용. 실제 권한 체크는 서버가 다시 한다.
  is_mine: boolean;
}

export async function getCommunityPosts(): Promise<CommunityPost[]> {
  const { data } = await api.get<CommunityPost[]>("/api/community/posts");
  return data;
}

// 리스트에서 제목을 눌러 들어오는 상세 페이지용 단건 조회 - 로그인 없이도 조회 가능.
export async function getCommunityPost(postId: number): Promise<CommunityPost> {
  const { data } = await api.get<CommunityPost>(`/api/community/posts/${postId}`);
  return data;
}

export async function createCommunityPost(title: string, content: string, isAnonymous: boolean): Promise<CommunityPost> {
  const { data } = await api.post<CommunityPost>("/api/community/posts", { title, content, is_anonymous: isAnonymous });
  return data;
}

// 게시 후 10분이 지나면 서버가 403으로 거절한다 - 프론트는 POST_EDIT_WINDOW_MS로 버튼 자체를 미리 숨긴다.
export const POST_EDIT_WINDOW_MS = 10 * 60 * 1000;

export async function updateCommunityPost(
  postId: number,
  title: string,
  content: string,
  isAnonymous: boolean
): Promise<CommunityPost> {
  const { data } = await api.put<CommunityPost>(`/api/community/posts/${postId}`, {
    title,
    content,
    is_anonymous: isAnonymous,
  });
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
export interface CommunityComment {
  id: number;
  content: string;
  is_anonymous: boolean;
  author_display_name: string | null;
  created_at: string;
  // 내가 쓴 댓글인지 - 수정/삭제 버튼 노출 여부 판단용. 실제 권한 체크는 서버가 다시 한다.
  is_mine: boolean;
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
  isAnonymous: boolean
): Promise<CommunityComment> {
  const { data } = await api.post<CommunityComment>(`/api/community/dream-feed/${dreamId}/comments`, {
    content,
    is_anonymous: isAnonymous,
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

