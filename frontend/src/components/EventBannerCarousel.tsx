"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export interface CarouselSlide {
  id: string;
  href: string;
  title: string;
  subtitle: string;
  gradientClassName: string;
  emoji: string;
}

interface EventBannerCarouselProps {
  slides: CarouselSlide[];
  autoPlayIntervalMs?: number;
}

const DEFAULT_AUTOPLAY_INTERVAL_MS = 5000;

// 좌측 인피드 가로 배너(Slot B) 자리를 대체하는 자체 콘텐츠 프로모션 캐러셀. slides prop만 갈아
// 끼우면 되는 순수 렌더러라, 추후 이 자리에 외부 광고 스크립트(SDK)를 붙일 때도 이 컴포넌트를
// 통째로 교체하기만 하면 되고 page.tsx 쪽 레이아웃은 건드릴 필요가 없다.
export default function EventBannerCarousel({
  slides,
  autoPlayIntervalMs = DEFAULT_AUTOPLAY_INTERVAL_MS,
}: EventBannerCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  // 터치로는 hover가 아예 발생하지 않아 자동재생을 멈출 방법도, 넘길 방법도 없던 문제
  // (모바일 반응형 감사 🟡 항목) - 스와이프 제스처로 직접 넘길 수 있게 한다.
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    if (isPaused || slides.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, autoPlayIntervalMs);
    return () => clearInterval(interval);
  }, [isPaused, slides.length, autoPlayIntervalMs]);

  if (slides.length === 0) return null;

  const goToRelative = (delta: number) => {
    setActiveIndex((prev) => (prev + delta + slides.length) % slides.length);
  };

  const SWIPE_THRESHOLD_PX = 40;

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = event.touches[0].clientX;
    setIsPaused(true);
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    setIsPaused(false);
    if (startX === null || slides.length <= 1) return;
    const deltaX = event.changedTouches[0].clientX - startX;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return;
    goToRelative(deltaX < 0 ? 1 : -1);
  };

  return (
    <div
      role="complementary"
      aria-label="프로모션 배너"
      className="relative h-[90px] w-full overflow-hidden rounded-2xl border border-white/[0.08]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {slides.map((slide, index) => (
        <Link
          key={slide.id}
          href={slide.href}
          aria-hidden={index !== activeIndex}
          tabIndex={index === activeIndex ? 0 : -1}
          className={`absolute inset-0 flex items-center gap-4 px-6 transition-opacity duration-700 ${slide.gradientClassName} ${
            index === activeIndex ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <span className="text-3xl">{slide.emoji}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{slide.title}</p>
            <p className="truncate text-xs text-white/70">{slide.subtitle}</p>
          </div>
        </Link>
      ))}

      {slides.length > 1 && (
        <div className="absolute bottom-0 right-1 flex">
          {/* 점 자체는 여전히 작지만(배너 톤과의 균형), 버튼의 실제 터치 영역은 패딩으로
              넓혀 둔다(모바일 반응형 감사 🟡 항목: 6×6px라 손가락으로 사실상 못 눌렀음). */}
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              aria-label={`${index + 1}번째 배너로 이동`}
              onClick={() => setActiveIndex(index)}
              className="flex items-center justify-center p-2.5"
            >
              <span
                className={`h-2 rounded-full transition-all ${
                  index === activeIndex ? "w-5 bg-white" : "w-2 bg-white/40"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
