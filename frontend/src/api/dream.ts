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

export interface DreamCalendarDay {
  date: string;
  mood: DreamMood;
  summary: string;
}

export interface DreamCalendar {
  month: string;
  days_in_month: number;
  days: DreamCalendarDay[];
}

export async function getDreamCalendar(): Promise<DreamCalendar> {
  const { data } = await api.get<DreamCalendar>("/api/home/dream-calendar");
  return data;
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

export interface DiaryCalendarDay {
  date: string;
  mood: DreamMood;
  title: string;
}

export interface DiaryCalendar {
  month: string;
  days_in_month: number;
  days: DiaryCalendarDay[];
}

export async function getDiaryCalendar(): Promise<DiaryCalendar> {
  const { data } = await api.get<DiaryCalendar>("/diary/calendar");
  return data;
}

export interface DiaryStreak {
  streak_days: number;
  checked_in_today: boolean;
}

export async function getDiaryStreak(): Promise<DiaryStreak> {
  const { data } = await api.get<DiaryStreak>("/diary/streak");
  return data;
}

export interface DreamEntryInput {
  date: string;
  emotion: string;
  content: string;
  is_public: boolean;
}

export interface AiInterpretation {
  keywords: string[];
  meaning: string;
  lucky_item: string;
  lucky_number: number;
}

export async function requestAiInterpretation(payload: DreamEntryInput): Promise<AiInterpretation> {
  const { data } = await api.post<AiInterpretation>("/diary/interpret", payload);
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
