import type { DreamMood } from "./dream";
import api from "./axios";

// 꿈 기록소(dream.ts)와는 완전히 별개의 API 모듈. 꿈해몽 사전 검색 결과는
// 매 요청마다 백엔드가 Claude로 실시간 생성하며, 어떤 정적 더미 데이터도 갖지 않는다.

export interface DictionaryEntry {
  keyword: string;
  summary: string;
  traditional_meaning: string;
  psychological_meaning: string;
  // 모든 학파를 나열하지 않고, 이 검색어의 핵심 주제와 가장 찰떡궁합인 전문가 1~2명만 동적으로 선택된다.
  selected_expert: string;
  expert_badge: string;
  expert_insight: string;
  related_keywords: string[];
}

export async function searchDictionary(keyword: string, record: boolean = true): Promise<DictionaryEntry> {
  const { data } = await api.post<DictionaryEntry>("/api/dictionary/search", { keyword, record });
  return data;
}

// 문장/구절 검색("뱀한테 물리는 꿈을 꿨어요")에서 대표 상징 키워드와 상황 맥락을 분리한다.
export interface ParsedQuery {
  keyword: string;
  context: string;
}

export async function parseSearchQuery(query: string, record: boolean = true): Promise<ParsedQuery> {
  const { data } = await api.post<ParsedQuery>("/api/dictionary/parse-query", { query, record });
  return data;
}

export interface DreamScenario {
  title: string;
  mood: DreamMood;
  // 문장 검색의 맥락과 가장 가까운 시나리오 하나에만 true - 리스트 최상단 하이라이트에 쓰인다.
  is_best_match: boolean;
}

export async function getDictionaryScenarios(keyword: string, context: string = ""): Promise<DreamScenario[]> {
  const { data } = await api.post<{ keyword: string; scenarios: DreamScenario[] }>("/api/dictionary/scenarios", {
    keyword,
    context,
  });
  return data.scenarios;
}

export interface ScenarioDetail {
  title: string;
  mood: DreamMood;
  interpretation: string;
  selected_expert: string;
  expert_badge: string;
  expert_insight: string;
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
