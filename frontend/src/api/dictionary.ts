import api from "./axios";

// 꿈 기록소(dream.ts)와는 완전히 별개의 API 모듈. 꿈해몽 사전 검색 결과는
// 매 요청마다 백엔드가 Claude로 실시간 생성하며, 어떤 정적 더미 데이터도 갖지 않는다.

export interface DictionaryEntry {
  keyword: string;
  summary: string;
  traditional_meaning: string;
  psychological_meaning: string;
  related_keywords: string[];
}

export async function searchDictionary(keyword: string): Promise<DictionaryEntry> {
  const { data } = await api.post<DictionaryEntry>("/api/dictionary/search", { keyword });
  return data;
}

export interface TrendingKeyword {
  keyword: string;
  count: number;
}

export async function getTrendingKeywords(): Promise<TrendingKeyword[]> {
  const { data } = await api.get<TrendingKeyword[]>("/api/dictionary/trending");
  return data;
}

export interface RecentDreamTitle {
  title: string;
  emotion: string;
  dream_date: string;
}

export async function getRecentPublicDreams(): Promise<RecentDreamTitle[]> {
  const { data } = await api.get<RecentDreamTitle[]>("/api/dictionary/recent-dreams");
  return data;
}
