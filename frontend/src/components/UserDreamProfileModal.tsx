"use client";

import { useState } from "react";
import Link from "next/link";

import { getGalaxyProfile, type GalaxyProfile } from "@/api/dream";
import { getSeedDefinition } from "@/lib/dreamSeeds";

const BADGE_META: Record<string, { emoji: string; label: string }> = {
  FIRST_LUCID: { emoji: "🌌", label: "첫 자각몽 성공" },
  DREAM_MASTER: { emoji: "🔮", label: "해몽 마스터" },
  COMMUNITY_STAR: { emoji: "💬", label: "커뮤니티 소통왕" },
};

interface UserDreamProfileModalProps {
  nickname: string;
  children: React.ReactNode;
}

// 커뮤니티 닉네임 호버/클릭 시 뜨는 미니 프로필 카드. 대상 유저가 마이페이지에서
// is_galaxy_public을 켜둔 경우에만 씨앗 비율/뱃지 집계가 보이고, 그 외엔 잠금 템플릿만
// 렌더링한다 - 원문 텍스트는 API 응답 자체에 절대 담기지 않는다.
export default function UserDreamProfileModal({ nickname, children }: UserDreamProfileModalProps) {
  const [profile, setProfile] = useState<GalaxyProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const loadProfile = () => {
    if (hasFetched || isLoading) return;
    setIsLoading(true);
    getGalaxyProfile(nickname)
      .then((data) => {
        setProfile(data);
        setHasFetched(true);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  return (
    <span
      className="group relative inline-block"
      onMouseEnter={loadProfile}
      onClick={(event) => {
        event.stopPropagation();
        loadProfile();
      }}
    >
      {children}

      {/* 이 카드가 호출부(커뮤니티 목록의 <p> 안)에 인라인으로 박히는 경우가 있어, 여기서는
          <p>가 아니라 전부 <div>/<span>만 쓴다 - <p> 안에 <p>가 들어가면 하이드레이션 에러가 난다. */}
      <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-[320px] rounded-2xl border border-purple-500/30 bg-slate-950/90 p-4 opacity-0 shadow-[0_0_30px_rgba(0,0,0,0.5)] backdrop-blur-lg transition-opacity duration-200 group-hover:opacity-100">
        <div className="text-xs font-semibold text-purple-200">🌌 {nickname}의 무의식 은하</div>

        {isLoading && <div className="mt-4 text-xs text-slate-500">불러오는 중...</div>}

        {!isLoading && profile && !profile.is_public && (
          <div className="mt-2 flex flex-col items-center py-5 text-center">
            <span className="text-2xl">🔒</span>
            <div className="mt-2 text-xs leading-relaxed text-slate-400">아직 공개되지 않은 은하계예요.</div>
          </div>
        )}

        {!isLoading && profile?.is_public && (
          <div className="mt-3">
            <div className="flex h-2 overflow-hidden rounded-full bg-white/10">
              {(profile.seed_ratios ?? [])
                .filter((item) => item.ratio > 0)
                .map((item) => (
                  <div
                    key={item.seed}
                    style={{ width: `${item.ratio * 100}%`, backgroundColor: getSeedDefinition(item.seed).colors[0] }}
                  />
                ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
              {(profile.seed_ratios ?? []).map((item) => (
                <span key={item.seed} className="text-[10px] text-slate-400">
                  {getSeedDefinition(item.seed).label} {Math.round(item.ratio * 100)}%
                </span>
              ))}
            </div>

            {profile.badge_ids && profile.badge_ids.length > 0 && (
              <div className="mt-3 flex gap-2 border-t border-white/10 pt-3">
                {profile.badge_ids.map((code) => {
                  const meta = BADGE_META[code];
                  if (!meta) return null;
                  return (
                    <span key={code} title={meta.label} className="text-lg">
                      {meta.emoji}
                    </span>
                  );
                })}
              </div>
            )}

            {/* 이 카드는 hover로도 열려 pointer-events-none 상태일 수 있다 - 클릭 가능한 링크가
                생기는 순간부터는 실제로 클릭할 수 있도록 이 블록만 다시 이벤트를 받게 한다. */}
            <div className="pointer-events-auto mt-3 border-t border-white/10 pt-3 text-center">
              <Link
                href={`/garden?nickname=${encodeURIComponent(nickname)}`}
                onClick={(event) => event.stopPropagation()}
                className="text-[11px] text-emerald-300/80 transition-colors hover:text-emerald-200"
              >
                🌱 정원 방문하기
              </Link>
            </div>
          </div>
        )}
      </div>
    </span>
  );
}
