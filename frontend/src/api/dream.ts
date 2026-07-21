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

export interface DiaryEntry {
  id: number;
  content: string;
  emotion: string;
  is_public: boolean;
  is_lucid: boolean;
  created_at: string;
}

export async function getDiaryEntries(): Promise<DiaryEntry[]> {
  const { data } = await api.get<{ entries: DiaryEntry[] }>("/diary/entries");
  return data.entries;
}

export interface DreamInterpretation {
  entry_id: number;
  meaning: string;
  symbols: string[];
  lucky_element: string;
}

export async function interpretDreamEntry(entryId: number): Promise<DreamInterpretation> {
  const { data } = await api.post<DreamInterpretation>(`/diary/entries/${entryId}/interpret`);
  return data;
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
