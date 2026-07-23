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

export interface Trend {
  keyword: string;
  count: number;
  emoji: string;
}

export interface LiveTickerEntry {
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
  const { data } = await api.get<{ trends: Trend[] }>("/api/home/trends");
  return data.trends;
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
}

export async function requestAiInterpretation(payload: DreamEntryInput): Promise<AiInterpretation> {
  const { data } = await api.post<AiInterpretation>("/api/dream-interpretation", payload);
  return data;
}

// ⚡ 10초 미니멀 빠른 기록: 6단계 문답 없이 자유 서술 한 편만 보내 AI 해몽을 받는다.
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
  is_public: boolean;
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
  is_public: boolean;
  survey: DreamSurvey;
  interpretation: AiInterpretation;
}

export async function listDreams(): Promise<DreamEntryRecord[]> {
  const { data } = await api.get<DreamEntryRecord[]>("/api/dreams");
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

export interface CommunityEntry {
  id: number;
  author_email: string;
  content: string;
  emotion: string;
  keywords: string[];
  empathy_count: number;
  is_liked_by_me: boolean;
}

export async function getCommunityFeed(): Promise<CommunityEntry[]> {
  const { data } = await api.get<{ entries: CommunityEntry[] }>("/community/feed");
  return data.entries;
}

export async function getCommunityKeywords(): Promise<string[]> {
  const { data } = await api.get<{ keywords: string[] }>("/community/keywords");
  return data.keywords;
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

export interface Badges {
  earned: string[];
  available: string[];
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

export async function getBadges(): Promise<Badges> {
  const { data } = await api.get<Badges>("/mypage/badges");
  return data;
}
