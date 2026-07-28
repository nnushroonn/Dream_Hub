"use client";

import { motion } from "framer-motion";

interface VoteButtonsProps {
  myVote: "up" | "down" | null;
  upvoteCount: number;
  downvoteCount: number;
  onVote: (voteType: "up" | "down") => void;
}

// 디시인사이드 스타일 👍 좋아요 / 👎 싫어요 투표 버튼 쌍. 유저는 둘 중 하나의 상태만 가질 수 있고
// (반대 버튼을 누르면 전환, 같은 버튼을 다시 누르면 취소), 숫자가 바뀔 때마다 새 motion.span이
// initial scale 1.5 → 1로 마운트되며 통통 튀는 스프링 애니메이션을 준다.
export default function VoteButtons({ myVote, upvoteCount, downvoteCount, onVote }: VoteButtonsProps) {
  return (
    <div className="flex flex-row items-center justify-center gap-4">
      <button
        type="button"
        onClick={() => onVote("up")}
        className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
          myVote === "up"
            ? "border-purple-500 bg-purple-600 text-white"
            : "border-white/10 bg-white/5 text-slate-300 hover:border-purple-400/40 hover:text-slate-100"
        }`}
      >
        <span>👍</span>
        <motion.span
          key={`up-${upvoteCount}`}
          initial={{ scale: 1.5 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 15 }}
        >
          {upvoteCount}
        </motion.span>
      </button>
      <button
        type="button"
        onClick={() => onVote("down")}
        className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
          myVote === "down"
            ? "border-slate-500 bg-slate-700 text-slate-300"
            : "border-white/10 bg-white/5 text-slate-300 hover:border-slate-400/40 hover:text-slate-100"
        }`}
      >
        <span>👎</span>
        <motion.span
          key={`down-${downvoteCount}`}
          initial={{ scale: 1.5 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 15 }}
        >
          {downvoteCount}
        </motion.span>
      </button>
    </div>
  );
}
