import type { CSSProperties } from "react";
import { User, VenetianMask } from "lucide-react";

import { CHALLENGER_TIER_INDEX, tierColor, type AuthorBadge as AuthorBadgeData } from "@/lib/levels";

interface AuthorBadgeProps {
  isAnonymous: boolean;
  /** 익명이면 null - 그 경우 "익명의 탐험가" 등 표시용 텍스트를 이 컴포넌트가 대신 채운다. */
  displayName: string | null;
  /** 익명이거나 아직 로딩 전이면 null - 레벨 뱃지/링을 렌더링하지 않는다. */
  badge: AuthorBadgeData | null;
  size?: "sm" | "md";
}

const AVATAR_SIZE_CLASS = { sm: "h-6 w-6", md: "h-8 w-8" } as const;
const ICON_SIZE_CLASS = { sm: "h-3 w-3", md: "h-3.5 w-3.5" } as const;

// 커뮤니티 게시글 목록/상세, 댓글 목록에서 작성자 표시를 통일하는 공통 컴포넌트 - 아바타
// 테두리 색(레벨 티어별)과 "Lv.N 칭호" 미니 뱃지를 함께 그린다. 익명 글쓴이는 신원 노출
// 원칙상 뱃지 없이 무채색 아이콘 + "익명의 탐험가"만 보여준다.
export default function AuthorBadge({ isAnonymous, displayName, badge, size = "sm" }: AuthorBadgeProps) {
  const avatarSize = AVATAR_SIZE_CLASS[size];
  const iconSize = ICON_SIZE_CLASS[size];

  if (isAnonymous || !badge) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`flex ${avatarSize} shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-500`}
        >
          <VenetianMask className={iconSize} strokeWidth={1.5} />
        </span>
        <span className="text-slate-400">{displayName ?? "익명의 탐험가"}</span>
      </span>
    );
  }

  const isChallenger = badge.tier_index >= CHALLENGER_TIER_INDEX;
  const color = tierColor(badge.tier_index);
  const ringStyle: CSSProperties = isChallenger
    ? {}
    : ({ "--tw-ring-color": color } as CSSProperties);

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`flex ${avatarSize} shrink-0 items-center justify-center rounded-full ${
          isChallenger ? "" : "bg-slate-800 text-slate-300 ring-1 ring-offset-1 ring-offset-slate-950"
        }`}
        style={
          isChallenger
            ? {
                padding: 2,
                backgroundImage: "linear-gradient(135deg, #FFD700, #3B82F6)",
                boxShadow: "0 0 10px rgba(255,215,0,0.45), 0 0 16px rgba(59,130,246,0.3)",
              }
            : ringStyle
        }
      >
        <span
          className={`flex h-full w-full items-center justify-center rounded-full ${
            isChallenger ? "bg-slate-900 text-slate-200" : ""
          }`}
        >
          <User className={iconSize} strokeWidth={1.5} />
        </span>
      </span>
      <span className="text-slate-200">{displayName}</span>
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-purple-500/10 px-1.5 py-0.5 text-[10px] leading-none">
        <span className="font-semibold text-purple-300">Lv.{badge.level}</span>
        <span className="text-purple-300/60">{badge.tier_title}</span>
      </span>
    </span>
  );
}
