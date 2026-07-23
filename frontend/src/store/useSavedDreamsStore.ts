import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { DreamEntryRecord } from "@/api/dream";

interface SavedDreamsState {
  entries: DreamEntryRecord[];
  setEntries: (entries: DreamEntryRecord[]) => void;
  upsertEntry: (entry: DreamEntryRecord) => void;
  removeEntry: (id: number) => void;
}

// 백엔드 /api/dreams가 진실 공급원이다. 이 스토어는 로그인한 유저의 꿈 기록을 그대로
// 미러링해 두는 캐시로, 꿈 별자리 캘린더와 출석 스트릭은 모두 이 배열에서 파생된다.
export const useSavedDreamsStore = create<SavedDreamsState>()(
  persist(
    (set) => ({
      entries: [],
      setEntries: (entries) => set({ entries }),
      upsertEntry: (entry) =>
        set((state) => {
          const index = state.entries.findIndex((e) => e.id === entry.id);
          if (index === -1) return { entries: [...state.entries, entry] };
          const next = [...state.entries];
          next[index] = entry;
          return { entries: next };
        }),
      removeEntry: (id) =>
        set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),
    }),
    // 이전 버전(date/mood/title 로컬 전용 구조)과 스키마가 완전히 달라져 이름을 바꿨다 -
    // 예전 형태의 캐시가 남아 있어도 무시하고 새로 시작한다.
    { name: "saved-dreams-storage-v2" }
  )
);
