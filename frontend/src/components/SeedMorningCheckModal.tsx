"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { getPendingSeedCheck, markDreamForgotten, type DreamSeedRecord } from "@/api/seeds";
import { getSeedDefinition } from "@/lib/dreamSeeds";
import { useAuthStore } from "@/store/useAuthStore";

// NavBar는 페이지마다 새로 마운트되는 컴포넌트라(공유 레이아웃이 아니라 각 page.tsx가 직접
// <NavBar />를 그린다), 매 페이지 이동마다 아침 체크를 다시 띄우면 안 된다 - 오늘 하루
// 한 번 닫으면(또는 기록하러 이동하면) 그 이후로는 새로고침해도 다시 뜨지 않게 날짜로 가드한다.
const DISMISSED_KEY = "dreamhub_seed_check_dismissed_date";

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

// 씨앗 라이프사이클의 아침 파트 - 다음 날 접속 시 "어젯밤 심은 씨앗을 확인해보세요" 웰컴
// 모달을 띄우고, 자연스럽게 오늘의 AI 꿈 기록으로 이어지도록 유도한다.
export default function SeedMorningCheckModal() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const router = useRouter();
  const [pendingSeed, setPendingSeed] = useState<DreamSeedRecord | null>(null);
  // "꿈이 기억나지 않아요"를 눌렀는지 - 그 즉시 모달을 닫아버리면 "괜찮다"는 위로를 전달할
  // 틈이 없어, 대신 모달 내용을 위로 문구 + 기억력 팁으로 갈아끼운 뒤 유저가 직접 닫게 한다.
  const [isForgotten, setIsForgotten] = useState(false);
  const [isSubmittingForget, setIsSubmittingForget] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (window.localStorage.getItem(DISMISSED_KEY) === todayDateString()) return;
    getPendingSeedCheck()
      .then(setPendingSeed)
      .catch(() => {});
  }, [isAuthenticated]);

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, todayDateString());
    setPendingSeed(null);
  };

  const goRecordDream = () => {
    window.localStorage.setItem(DISMISSED_KEY, todayDateString());
    router.push("/journal?openRecord=1");
  };

  const forgetDream = async () => {
    if (!pendingSeed || isSubmittingForget) return;
    setIsSubmittingForget(true);
    try {
      await markDreamForgotten(pendingSeed.planted_at);
      // 오늘 다시 뜨지 않게 같은 날짜 가드를 남겨 두되, pendingSeed 자체는 지우지 않는다 -
      // 지금 화면에 위로 문구를 보여줘야 하므로.
      window.localStorage.setItem(DISMISSED_KEY, todayDateString());
      setIsForgotten(true);
    } catch {
      // 실패해도 조용히 무시한다 - 버튼이 그대로 남아있어 다시 누르면 그만이다.
    } finally {
      setIsSubmittingForget(false);
    }
  };

  if (!pendingSeed) return null;
  const definition = getSeedDefinition(pendingSeed.seed_type);

  // NavBar 안에서 렌더링되는데, NavBar가 sticky + z-index로 자체 스태킹 컨텍스트를 만들어서
  // 그 안의 fixed 모달은 z-index를 아무리 올려도 다른 요소에 가리거나 잘릴 수 있다(LoginModal과
  // 동일한 이유) - document.body에 직접 포탈로 꽂아 그 제약을 완전히 벗어난다.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md">
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-3xl border border-purple-500/30 bg-slate-950 p-7 text-center shadow-[0_0_50px_rgba(139,92,246,0.3)]">
        {isForgotten ? (
          // 꿈을 기억 못 하는 건 실패가 아니라 흔한 결과라는 톤 - journal/page.tsx의 개화 CTA
          // 카드가 같은 상태일 때 보여주는 위로 문구/팁과 문구를 맞췄다.
          <>
            <p className="text-xs tracking-widest text-slate-500 uppercase">Morning Check</p>
            <h2 className="mt-2 text-lg font-semibold text-white">🌫️ 괜찮아요</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              모든 꿈이 기억나는 건 아니에요.
              <br />
              오늘 심은 씨앗은 그대로 남아있어요.
            </p>
            <ul className="mt-4 space-y-1 text-left text-xs leading-relaxed text-slate-500">
              <li>💡 눈뜨자마자 떠오르는 조각이라도 바로 메모해보세요</li>
              <li>💡 머리맡에 메모장을 두면 도움이 돼요</li>
            </ul>
            <button
              type="button"
              onClick={() => setPendingSeed(null)}
              className="mt-6 w-full rounded-xl bg-white/[0.06] px-6 py-3 text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.1] hover:text-white"
            >
              닫기
            </button>
          </>
        ) : (
          <>
            <p className="text-xs tracking-widest text-indigo-300/70 uppercase">Morning Check</p>
            <h2 className="mt-2 text-lg font-semibold text-white">🌱 어젯밤 심은 씨앗의 상태를 확인해 보세요</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              어젯밤 심은 <span className="font-semibold text-purple-200">{definition.label}</span> 씨앗이 기다리고
              있어요. 오늘의 꿈을 기록하면 어떤 모습으로 피어날지 확인할 수 있어요.
            </p>
            <div className="mt-6 flex items-center gap-2">
              <button
                type="button"
                onClick={dismiss}
                className="px-4 py-2 text-sm text-slate-500 transition-colors hover:text-slate-300"
              >
                나중에
              </button>
              <button
                type="button"
                onClick={goRecordDream}
                className="flex-1 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-3 font-medium text-white shadow-lg transition-transform hover:from-purple-500 hover:to-indigo-500 active:scale-95"
              >
                ✨ 오늘의 꿈 기록하기
              </button>
            </div>
            {/* 꿈이 기억나지 않을 때의 탈출구 - "나중에"(단순 미루기)와는 달리 명시적으로
                기록하고, 그 결과 이후로는 이 씨앗에 대해 더 이상 재촉하지 않는다. */}
            <button
              type="button"
              onClick={forgetDream}
              disabled={isSubmittingForget}
              className="mt-3 text-xs text-slate-400 underline-offset-4 transition-colors hover:text-slate-300 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              🌫️ 꿈이 기억나지 않아요
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
