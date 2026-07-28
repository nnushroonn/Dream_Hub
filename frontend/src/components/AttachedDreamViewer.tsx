"use client";

import { useRouter } from "next/navigation";

import { buildDreamOriginalContent, type DreamSurvey } from "@/api/dream";
import DreamOriginalQuote from "@/components/DreamOriginalQuote";

interface AttachedDreamViewerProps {
  id: number;
  survey: DreamSurvey;
  summary: string;
  tags: string[];
}

// 커뮤니티 상세 뷰에 임베드되는 첨부 꿈 데이터 - 정보 과부하를 막기 위해 원문/한 줄 요약/태그만
// 콤팩트하게 보여주고, 장문 해몽·전문가 시선·행운 정보·상담 리포트 같은 깊은 내용은 전용 페이지
// (/dream-archive)로 옮겨 "더 보고 싶은 사람만" 이동하도록 한다.
export default function AttachedDreamViewer({ id, survey, summary, tags }: AttachedDreamViewerProps) {
  const router = useRouter();

  return (
    <div className="mt-4 rounded-xl border border-purple-500/30 bg-white/5 p-4">
      <p className="mb-3 text-xs font-medium tracking-wide text-purple-300/80">🌙 첨부된 꿈 기록</p>

      <DreamOriginalQuote content={buildDreamOriginalContent(survey)} />

      {summary.trim() && <p className="text-base font-bold text-purple-300 mb-2">{summary}</p>}

      {tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-x-2 gap-y-1">
          {tags.map((tag) => (
            <span key={tag} className="text-xs text-violet-300/70">
              {tag.startsWith("#") ? tag : `#${tag}`}
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => router.push(`/dream-archive?id=${id}`)}
        className="w-full py-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 rounded-lg text-sm font-semibold transition-colors"
      >
        🔮 전체 해몽 결과 확인하기
      </button>
    </div>
  );
}
