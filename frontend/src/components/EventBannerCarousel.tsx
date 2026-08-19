"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (isPaused || slides.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, autoPlayIntervalMs);
    return () => clearInterval(interval);
  }, [isPaused, slides.length, autoPlayIntervalMs]);

  if (slides.length === 0) return null;

  return (
    <div
      role="complementary"
      aria-label="프로모션 배너"
      className="relative h-[90px] w-full overflow-hidden rounded-2xl border border-white/[0.08]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
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
        <div className="absolute bottom-2 right-3 flex gap-1.5">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              aria-label={`${index + 1}번째 배너로 이동`}
              onClick={() => setActiveIndex(index)}
              className={`h-1.5 rounded-full transition-all ${
                index === activeIndex ? "w-4 bg-white" : "w-1.5 bg-white/40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
