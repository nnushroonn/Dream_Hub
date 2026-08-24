"use client";

import { useEffect, useState } from "react";

import { getStoredCookieConsent, setStoredCookieConsent } from "@/lib/cookieConsent";

// 최초 방문 유저에게만 뜨는 쿠키 동의 배너 - 애드센스의 맞춤형 광고 쿠키 사용 고지 요건 대응.
// 로컬스토리지에 동의/거부 여부를 남겨, 한 번 응답하면 다시 뜨지 않는다. 거부를 선택해도
// 광고 자체는 계속 뜬다 - AdsenseScript가 이를 감지해 "비맞춤형 광고" 모드로만 전환한다
// (추적 쿠키 없이 문맥 기반으로 광고를 계속 내보내는 애드센스 공식 옵션).
export default function CookieConsentBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // localStorage는 브라우저 전용 외부 시스템이라 마운트 이후 effect에서만 읽을 수 있다
    // (렌더 중에 읽으면 정적 export 빌드 시점 HTML과 하이드레이션 시점이 어긋난다).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage(외부 시스템) 조회 결과에 반응
    if (!getStoredCookieConsent()) setIsVisible(true);
  }, []);

  const respond = (status: "accepted" | "declined") => {
    setStoredCookieConsent(status);
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[200] border-t border-white/10 bg-slate-950/95 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
      {/* 모바일 뷰포트(390px 기준)에서는 텍스트+버튼이 세로로 쌓이며 데스크톱보다 오히려 더 큰
          높이를 차지해 하단 콘텐츠를 가리는 문제가 있었다 - text-xs/좁은 padding으로 줄바꿈
          줄 수를 줄여 겹치는 영역을 최소화한다(모바일 반응형 감사 🔴 항목). */}
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2.5 sm:flex-row sm:gap-3">
        <p className="text-xs leading-relaxed text-slate-300 sm:text-sm">
          Dream Hub는 맞춤형 콘텐츠와 광고 제공을 위해 쿠키를 사용합니다. 계속 이용하시면 쿠키 사용에 동의하는
          것으로 간주됩니다.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => respond("declined")}
            className="rounded-full border border-white/10 px-5 py-3 text-sm text-slate-300 transition-colors hover:border-white/30 hover:text-white"
          >
            거부
          </button>
          <button
            type="button"
            onClick={() => respond("accepted")}
            className="rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-6 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
          >
            동의
          </button>
        </div>
      </div>
    </div>
  );
}
