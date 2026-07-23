import type { DreamMood } from "./dream";
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

export async function searchDictionary(keyword: string, record: boolean = true): Promise<DictionaryEntry> {
  const { data } = await api.post<DictionaryEntry>("/api/dictionary/search", { keyword, record });
  return data;
}

export interface DreamScenario {
  title: string;
  mood: DreamMood;
}

export async function getDictionaryScenarios(keyword: string): Promise<DreamScenario[]> {
  const { data } = await api.post<{ keyword: string; scenarios: DreamScenario[] }>("/api/dictionary/scenarios", {
    keyword,
  });
  return data.scenarios;
}

export interface ScenarioDetail {
  title: string;
  mood: DreamMood;
  interpretation: string;
  advice: string;
}

export async function getScenarioDetail(keyword: string, scenarioTitle: string): Promise<ScenarioDetail> {
  const { data } = await api.post<ScenarioDetail>("/api/dictionary/scenario-detail", {
    keyword,
    scenario_title: scenarioTitle,
  });
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
