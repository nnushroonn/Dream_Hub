import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { DreamMood } from "@/api/dream";

export interface SavedDream {
  /** YYYY-MM-DD */
  date: string;
  mood: DreamMood;
  title: string;
}

interface SavedDreamsState {
  entries: SavedDream[];
  addEntry: (entry: SavedDream) => void;
}

// 백엔드에 실제 유저별 꿈 기록 저장소가 아직 없어, 로컬 스토리지에 영속화한 실제 기록을
// "savedDreams"로 취급한다. 꿈 별자리 캘린더와 출석 스트릭은 모두 이 배열에서 파생된다.
export const useSavedDreamsStore = create<SavedDreamsState>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (entry) =>
        set((state) => ({
          // 같은 날짜에 이미 기록이 있으면 최신 기록으로 대체한다.
          entries: [...state.entries.filter((e) => e.date !== entry.date), entry],
        })),
    }),
    { name: "saved-dreams-storage" }
  )
);
