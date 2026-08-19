"use client";

import { useEffect, useRef } from "react";

interface AdUnitProps {
  // 애드센스 대시보드에서 발급받은 광고 단위 슬롯 ID(data-ad-slot).
  slot: string;
  format?: string;
  // 반응형 광고(대부분의 디스플레이 단위)는 true, 고정 크기 단위만 쓸 때는 false.
  fullWidthResponsive?: boolean;
  className?: string;
  // 광고가 아직 안 뜬 동안/안 뜬 채로 남을 때 자리 붕괴를 막는 최소 높이 - 실제로 채워지면
  // 애드센스가 내부 iframe 크기로 이 자리를 알아서 채우고, 못 채우면(광고 없음/차단/네트워크
  // 지연) 이 자리만 조용히 남는다.
  minHeight?: number;
}

// 재사용 가능한 광고 단위 - AdsenseScript(계정 스크립트 로드 + NPA 플래그)와 짝을 이룬다.
// 슬롯을 실제로 렌더링하는 곳은 이 컴포넌트 하나뿐이라, "광고 영역이 로딩 중/실패 시에도
// 레이아웃이 안 무너진다"는 보장을 여기 한 곳에서만 지키면 페이지 전체가 안전해진다.
export default function AdUnit({ slot, format = "auto", fullWidthResponsive = true, className, minHeight = 100 }: AdUnitProps) {
  const insRef = useRef<HTMLModElement>(null);
  // 광고가 실제로 채워졌는지 여부와 무관하게 최소 높이를 계속 유지한다 - "채워짐"을 감지해
  // 자리를 줄이는 최적화는 하지 않는다(오히려 그 순간 주변 레이아웃이 들썩이는 원인이 된다).
  // ref로만 "이미 요청했는지"를 추적한다 - state로 두면 리렌더를 한 번 더 트리거할 뿐 아니라
  // React 개발 모드의 effect 이중 실행(StrictMode)에서 같은 슬롯에 push를 두 번 보낼 수 있다.
  const hasRequestedRef = useRef(false);

  useEffect(() => {
    if (hasRequestedRef.current) return;
    hasRequestedRef.current = true;
    try {
      const w = window as typeof window & { adsbygoogle?: Record<string, unknown>[] };
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({});
    } catch {
      // 광고 차단 확장 프로그램 등으로 adsbygoogle 자체가 없거나 push가 실패해도, 아래
      // placeholder 높이가 이미 자리를 잡고 있어 레이아웃은 그대로 안정적으로 유지된다.
    }
  }, []);

  return (
    <div className={className} style={{ minHeight }}>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: "block", minHeight }}
        data-ad-client={process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={fullWidthResponsive ? "true" : "false"}
      />
    </div>
  );
}
