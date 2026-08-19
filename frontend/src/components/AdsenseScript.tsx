"use client";

import { useEffect } from "react";
import Script from "next/script";

import { COOKIE_CONSENT_CHANGED_EVENT, getStoredCookieConsent } from "@/lib/cookieConsent";

interface AdsenseScriptProps {
  clientId: string;
}

type AdsbygoogleQueue = Record<string, unknown>[] & { requestNonPersonalizedAds?: 0 | 1 };

function adsbygoogleQueue(): AdsbygoogleQueue {
  const w = window as typeof window & { adsbygoogle?: AdsbygoogleQueue };
  w.adsbygoogle = w.adsbygoogle || ([] as AdsbygoogleQueue);
  return w.adsbygoogle;
}

// "거부"는 맞춤형(개인화) 광고에 쓰이는 추적 쿠키에 대한 거부일 뿐, 광고 자체를 막을 이유는
// 아니다 - 애드센스는 쿠키 없이 문맥(페이지 콘텐츠) 기반으로만 판단하는 "비맞춤형 광고"를
// 정식으로 지원한다(requestNonPersonalizedAds=1). NPA 플래그의 초기값은 하이드레이션 이전에
// 실행되는 beforeInteractive 인라인 스크립트(app/layout.tsx)가 이미 세팅해 둔다 - Next.js
// App Router에서 beforeInteractive는 반드시 루트 레이아웃 파일 안에 있어야 보장되므로 여기
// 자식 컴포넌트에는 두지 않는다. 이 컴포넌트는 (1) 본 스크립트 로드와 (2) 같은 탭에서
// 동의/거부를 나중에 바꿨을 때 그 이후 광고 요청에 반영되도록 재동기화만 담당한다.
export default function AdsenseScript({ clientId }: AdsenseScriptProps) {
  useEffect(() => {
    const syncNonPersonalizedFlag = () => {
      adsbygoogleQueue().requestNonPersonalizedAds = getStoredCookieConsent() === "accepted" ? 0 : 1;
    };
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, syncNonPersonalizedFlag);
    return () => window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, syncNonPersonalizedFlag);
  }, []);

  return (
    <Script
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`}
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  );
}
