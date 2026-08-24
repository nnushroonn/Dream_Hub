"use client";

import { useLayoutEffect, useRef, useState } from "react";

interface ExpandableTextProps {
  children: string;
  // 텍스트 자체의 타이포그래피(폰트/크기/줄간격/색)는 호출부마다 다르므로 그대로 전달받는다 -
  // 이 컴포넌트는 "몇 줄까지 보일지 + 더보기 버튼"만 담당한다.
  className?: string;
  // 카드가 깔리는 배경색에 맞춰 페이드 그라데이션 시작색을 맞춘다 - 기본값은 이 페이지의
  // 일기/꿈 카드가 공통으로 쓰는 짙은 남색 계열과 가장 가깝다.
  fadeFromClassName?: string;
  // "더보기"/"접기"를 누를 때마다 알려준다 - 예를 들어 AI 해몽 리포트의 "더보기"를 누르면
  // 그 아래 하위 관점(전문가 시선/행운/마음 읽기)까지 한 번에 펼치고 싶은 경우처럼, 이
  // 컴포넌트 바깥의 다른 UI가 확장 여부에 반응해야 할 때만 넘겨주면 된다.
  onToggle?: (expanded: boolean) => void;
}

// 감정일기 본문/AI 해몽 리포트 설명처럼 길어질 수 있는 본문을 기본 4줄로 접어두고, 실제로
// 넘치는 경우에만 그라데이션 페이드 + "더보기" 버튼을 보여준다. 4줄 안에 다 들어가는 짧은
// 글은 버튼 자체를 렌더링하지 않는다 - line-clamp만으로는 "진짜 잘렸는지" 알 수 없어
// scrollHeight/clientHeight를 직접 재서 판단한다.
export default function ExpandableText({ children, className, fadeFromClassName = "from-[#050509]", onToggle }: ExpandableTextProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const textRef = useRef<HTMLParagraphElement | null>(null);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    setIsOverflowing(el.scrollHeight - el.clientHeight > 1);
  }, [children]);

  return (
    <div className="relative">
      <p ref={textRef} className={`${className ?? ""} ${!isExpanded ? "line-clamp-4" : ""}`}>
        {children}
      </p>
      {!isExpanded && isOverflowing && (
        <div className={`pointer-events-none absolute inset-x-0 bottom-6 h-9 bg-gradient-to-t ${fadeFromClassName} to-transparent`} />
      )}
      {isOverflowing && (
        <button
          type="button"
          onClick={() =>
            setIsExpanded((prev) => {
              const next = !prev;
              onToggle?.(next);
              return next;
            })
          }
          className="relative -my-3.5 mt-1.5 py-3.5 text-xs font-medium text-violet-300/80 transition-colors hover:text-violet-200"
        >
          {isExpanded ? "접기 ▴" : "더보기 ▾"}
        </button>
      )}
    </div>
  );
}
