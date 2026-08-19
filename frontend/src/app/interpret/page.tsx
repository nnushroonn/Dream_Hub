"use client";

import { useRouter } from "next/navigation";

import NavBar from "@/components/NavBar";
import QuickInterpretModal from "@/components/QuickInterpretModal";

// GNB "🔮 AI 해몽" 전용 페이지 - 기존에는 QuickInterpretModal이 어느 화면에서든 곧바로 뜨는
// 팝업이었는데, 일기장의 꿈 기록 흐름과 동일한 이유로(해몽은 몰입이 필요한 작업) 독립 페이지로
// 옮겼다. 내부 로직(빠른/정밀 해몽, 결과, opt-in으로 일기장에 담기)은 QuickInterpretModal이
// 그대로 담당하고, variant="page"로 바깥 레이아웃만 바꿔 끼운다. 로그인 없이도 해몽 자체는
// 받아볼 수 있는 기능이라 다른 새 페이지들과 달리 로그인 게이트를 걸지 않는다.
export default function InterpretPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100">
      <NavBar />
      <QuickInterpretModal variant="page" onClose={() => router.push("/")} />
    </div>
  );
}
