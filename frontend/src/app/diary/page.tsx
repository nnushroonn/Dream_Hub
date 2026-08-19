"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// 구 "꿈 기록소" - 이제 /journal(나만의 일기장)이 일기 작성/씨앗 심기/AI 해몽 기록을 전부
// 흡수한 단일 페이지다. 이 프로젝트는 정적 export(output: "export")라 next.config의
// redirects()가 동작하지 않으므로(서버가 없다), 옛 북마크/링크가 404를 보지 않도록 이 자리에
// 클라이언트 리다이렉트 스텁만 남겨 둔다 - 넘어온 쿼리 파라미터(quickText/title/mood/...)는
// 그대로 들고 가 /journal이 이어서 처리한다.
export default function LegacyDiaryRedirect() {
  const router = useRouter();

  useEffect(() => {
    const query = window.location.search;
    router.replace(`/journal${query}`);
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#030712] text-sm text-slate-500">
      나만의 일기장으로 이동하는 중...
    </div>
  );
}
