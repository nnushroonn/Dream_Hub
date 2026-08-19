import { api } from "@/api/axios";
import type { DreamRecallStatus, SeedStatus, SeedType } from "@/lib/dreamSeeds";

export interface DreamSeedRecord {
  id: number;
  seed_type: SeedType;
  status: SeedStatus;
  dream_recall_status: DreamRecallStatus;
  planted_at: string;
  bloomed_dream_entry_id: number | null;
}

// 내가 심어온 씨앗 전체 이력 - 마이페이지 은하계 대시보드가 종류별 통계를 직접 집계할 때 쓴다.
export async function getMySeeds(): Promise<DreamSeedRecord[]> {
  const { data } = await api.get<DreamSeedRecord[]>("/api/seeds");
  return data;
}

// 오늘 밤 씨앗을 심는다(또는 이미 심어둔 종류를 갈아끼운다) - 하룻밤에 씨앗은 하나만 존재한다.
export async function plantSeed(seedType: SeedType): Promise<DreamSeedRecord> {
  const { data } = await api.post<DreamSeedRecord>("/api/seeds", { seed_type: seedType });
  return data;
}

// 오늘 밤 이미 심어둔 씨앗이 있으면 그대로 돌려준다(없으면 null).
export async function getTonightSeed(): Promise<DreamSeedRecord | null> {
  const { data } = await api.get<DreamSeedRecord | null>("/api/seeds/today");
  return data;
}

// 아직 확인하지 않은 "어젯밤 심은 씨앗"이 있으면 돌려준다 - 아침 웰컴 모달 트리거와
// AI 해몽 결과 화면의 개화 미리보기가 함께 쓰는 단일 소스.
export async function getPendingSeedCheck(): Promise<DreamSeedRecord | null> {
  const { data } = await api.get<DreamSeedRecord | null>("/api/seeds/pending-check");
  return data;
}

// 다음날 꿈이 전혀 기억나지 않을 때 - "아직 안 씀"과 구분되는 명시적 선택. 씨앗의 status는
// 그대로 PLANTED로 남아(백엔드가 이후 RESTING 자동 전환을 건너뛴다) 나중에 다시 방문해
// 꿈일기를 쓰면 기간 제한 없이 정상적으로 개화할 수 있다.
export async function markDreamForgotten(plantedAt: string): Promise<DreamSeedRecord> {
  const { data } = await api.post<DreamSeedRecord>("/api/seeds/mark-dream-forgotten", { planted_at: plantedAt });
  return data;
}
