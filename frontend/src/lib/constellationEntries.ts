import type { DreamEntryRecord } from "@/api/dream";
import type { ConstellationEntry } from "@/components/ConstellationCalendar";
import { moodBucketForEmoji } from "@/lib/moodBucket";

/**
 * 실제 저장된 꿈 기록(DreamEntryRecord[])을 "YYYY-MM" 월 안에서 일자별로 묶는다.
 * 하루에 여러 개의 꿈을 기록할 수 있어 값은 배열이며, entries가 이미 백엔드에서
 * (날짜desc, 작성순asc)로 정렬되어 오므로 같은 날짜 안의 작성 순서도 그대로 유지된다.
 * 홈 화면 미니 위젯과 꿈 기록소 캘린더가 이 함수를 공유해 렌더링 로직이 갈라지지 않게 한다.
 *
 * entries에는 감정일기(꿈일기가 아닌 일반 일기, entry_type==="emotion")도 함께 섞여 들어온다 -
 * 별자리 캘린더는 실제 꿈일기(entry_type==="dream")만 노드로 그려야 하므로 여기서 반드시
 * 걸러낸다. AI 해몽 유무로 걸러내지 않는다 - 꿈해몽 사전 연계 저장처럼 해몽 없이 저장되는
 * 진짜 꿈일기도 있고, mood(길몽/보통/악몽)는 애초에 interpretation이 아니라 emotion에서
 * 나온다. 감정일기의 emotion은 그날의 기분 체크인일 뿐 길몽/보통/악몽 판정과 무관하다.
 */
export function buildDayEntryMap(entries: DreamEntryRecord[], monthKey: string): Map<number, ConstellationEntry[]> {
  const map = new Map<number, ConstellationEntry[]>();
  for (const entry of entries) {
    if (entry.entry_type !== "dream") continue;
    if (!entry.dream_date.startsWith(monthKey)) continue;
    const day = Number(entry.dream_date.slice(-2));
    const summary: ConstellationEntry = {
      id: entry.id,
      mood: moodBucketForEmoji(entry.emotion),
      date: entry.dream_date,
      tooltip: entry.title,
      emoji: entry.emotion,
      createdAt: entry.created_at,
    };
    const existing = map.get(day);
    if (existing) existing.push(summary);
    else map.set(day, [summary]);
  }
  return map;
}
