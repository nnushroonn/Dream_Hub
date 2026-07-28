import { useEffect, useRef } from "react";

// 값이 바뀔 때마다 textarea의 실제 콘텐츠 높이(scrollHeight)에 맞춰 style.height를 다시
// 계산한다 - 내부 스크롤 대신 입력창 자체가 자연스럽게 늘어나 보이게 하기 위함이다.
// height를 "auto"로 먼저 되돌려야 글자를 지울 때도(scrollHeight가 줄어들 때도) 정확히
// 다시 줄어든다 - 그냥 늘어나기만 하고 안 줄어드는 흔한 버그를 여기서 피한다.
export function useAutoResizeTextarea(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return ref;
}
