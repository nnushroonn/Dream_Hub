"use client";

import { Check, Flower2, MoonStar, Sparkles, Sprout } from "lucide-react";

export type GrowthNodeStatus = "done" | "in_progress" | "pending";

interface GrowthTimelineProps {
  seedStatus: GrowthNodeStatus;
  sleepStatus: GrowthNodeStatus;
  bloomStatus: GrowthNodeStatus;
  flowerStatus: GrowthNodeStatus;
  // 씨앗 심기(1번) 노드 클릭 - 아래 감정일기 섹션으로 스크롤한다.
  onScrollToDiary: () => void;
  // 개화(3번) 노드 클릭 - 꿈일기 원문 섹션으로 스크롤한다.
  onScrollToBloom: () => void;
  // 꽃(4번) 노드 클릭 - AI 해몽 섹션으로 스크롤한다.
  onScrollToFlower: () => void;
}

interface NodeConfig {
  key: string;
  icon: typeof Sprout;
  title: string;
  status: GrowthNodeStatus;
  onClick: (() => void) | null;
}

// 상태 3종의 시각 언어 - 색은 오직 "지금 상태"만 나타내고, 어떤 단계인지는 항상 아이콘이
// 맡는다(완료해도 체크 배지만 덧붙일 뿐 원래 단계 아이콘은 그대로 보인다). 다크 네이비/퍼플
// 배경 위에서도 충분한 명암비가 나오도록 각 색상 채도를 일부러 높여 뒀다.
// journal 상세 화면의 왼쪽 지하철 노선도식 진행선(StageRow)도 이 스타일 맵을 그대로
// 가져다 써서, 위 축약형 스테퍼와 아래 본문 진행선이 항상 같은 아이콘/색상 언어를 쓴다.
export const STATUS_STYLES: Record<
  GrowthNodeStatus,
  {
    ring: string;
    // ring을 border/bg로 쪼갠 버전 - journal 상세 화면의 세로 진행선(StageRow) 마커는 뒤로
    // 지나가는 그라데이션 선을 가리기 위해 배경을 "불투명 배킹 + 반투명 틴트" 두 겹으로
    // 쌓아야 해서, 이 축약형 스테퍼처럼 border+bg를 한 번에 못 쓴다. 여기 두 필드로 쪼개
    // 두면 두 화면이 항상 같은 색상값을 쓰면서도 각자 필요한 방식으로 조합할 수 있다.
    borderClass: string;
    bgClass: string;
    icon: string;
    title: string;
    subtitle: string;
    connector: string;
  }
> = {
  done: {
    ring: "border-emerald-400/70 bg-emerald-500/15",
    borderClass: "border-emerald-400/70",
    bgClass: "bg-emerald-500/15",
    icon: "text-emerald-300",
    title: "text-emerald-100",
    subtitle: "text-emerald-400/70",
    connector: "bg-emerald-400/40",
  },
  in_progress: {
    ring: "border-sky-400/70 bg-sky-500/15",
    borderClass: "border-sky-400/70",
    bgClass: "bg-sky-500/15",
    icon: "text-sky-300",
    title: "text-sky-100",
    subtitle: "text-sky-400/70",
    connector: "bg-sky-400/30",
  },
  pending: {
    ring: "border-dashed border-slate-600 bg-white/[0.02]",
    borderClass: "border-dashed border-slate-600",
    bgClass: "bg-white/[0.02]",
    icon: "text-slate-500",
    title: "text-slate-500",
    subtitle: "text-slate-600",
    connector: "bg-white/10",
  },
};

// 하루의 성장 여정 - 씨앗 심기(감정일기) -> 씨앗 발아(수면, 자동) -> 개화(꿈일기) -> 꽃(AI 해몽).
// 항상 아이콘 4개짜리 축약형 스테퍼만 보여준다 - 단계별 실제 내용(카드/캐러셀/리포트)은
// journal 상세 화면의 지하철 노선도식 진행선(StageRow)이 맡고, 그 전체를 펼치는 "단계별로
// 자세히 보기" 토글도 그쪽(journal/page.tsx)에 있다. 예전엔 이 컴포넌트가 자체적으로 또
// 다른 "펼치기" 토글(제목/부제/한 줄 설명만 있는 TimelineNode 아코디언)을 갖고 있었는데,
// 실제 콘텐츠가 없는 반쪽짜리 미리보기라 아래 진짜 진행선과 정보가 겹치고 토글이 두 개로
// 헷갈렸다 - 이제 이 컴포넌트는 순수하게 "지금 상태를 한눈에 보여주는 스테퍼"만 맡는다.
// 예전엔 이 스테퍼 바로 아래 자체 "🌱 씨앗 심기" CTA도 갖고 있었는데, 호출부(journal/page.tsx)
// 최상단에 있던 또 다른 CTA와 사실상 같은 폼으로 이어져 진입점이 두 개로 나뉘어 있었다 -
// 진행 단계에 따라 문구가 바뀌는 하나의 CTA(primaryCta)로 통합하며 이 자리에서는 제거했다.
export default function GrowthTimeline({
  seedStatus,
  sleepStatus,
  bloomStatus,
  flowerStatus,
  onScrollToDiary,
  onScrollToBloom,
  onScrollToFlower,
}: GrowthTimelineProps) {
  const nodes: NodeConfig[] = [
    { key: "seed", icon: Sprout, title: "씨앗 심기", status: seedStatus, onClick: onScrollToDiary },
    { key: "sleep", icon: MoonStar, title: "씨앗 발아", status: sleepStatus, onClick: null },
    { key: "bloom", icon: Flower2, title: "개화", status: bloomStatus, onClick: onScrollToBloom },
    { key: "flower", icon: Sparkles, title: "꽃", status: flowerStatus, onClick: onScrollToFlower },
  ];
  // 아직 시작하지 않은 단계 중 가장 앞선(=다음에 해야 할) 노드에만 은은한 확대/축소 펄스를
  // 줘서 시선을 유도한다 - 빈 상태(오늘 아무것도 안 한 날)에서 "뭘 먼저 해야 하지"를 바로
  // 알려주기 위함. 대기 단계가 없으면(전부 완료/진행중) 아무 데도 펄스가 붙지 않는다.
  const firstPendingKey = nodes.find((node) => node.status === "pending")?.key ?? null;

  return (
    <div className="mx-auto w-full max-w-md">
      {/* 항상 보이는 축약형 가로 스테퍼 - 화면 크기와 무관하게 기본으로 보여준다. 아이콘+
          라벨을 세로로 쌓은 열(items-start 기준)이라 라벨이 정상적인 문서 흐름 안에 있고,
          연결선만 아이콘 중심 높이(h-11의 절반, 22px)로 따로 내려서 아이콘끼리 잇는다. */}
      <div className="flex items-start justify-center gap-1">
        {nodes.map((node, index) => {
          const style = STATUS_STYLES[node.status];
          const Icon = node.icon;
          return (
            <div key={node.key} className="flex items-start">
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={node.onClick ?? undefined}
                  disabled={!node.onClick}
                  title={`${node.title} · ${node.status === "done" ? "완료" : node.status === "in_progress" ? "자동 진행 중" : "대기"}`}
                  aria-label={node.title}
                  className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${style.ring} ${
                    node.onClick ? "cursor-pointer" : "cursor-default"
                  } ${node.status === "in_progress" ? "animate-pulse" : ""} ${
                    node.key === firstPendingKey ? "animate-gentle-pulse motion-reduce:animate-none" : ""
                  }`}
                >
                  <Icon className={`h-5 w-5 ${style.icon}`} />
                  {node.status === "done" && (
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#030712]">
                      <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                    </span>
                  )}
                </button>
                {/* 클릭하기 전에도 구조를 짐작할 수 있도록 아이콘 아래 작은 라벨을 붙인다. */}
                <span className="whitespace-nowrap text-[11px] text-slate-500">{node.title}</span>
              </div>
              {index < nodes.length - 1 && <div className={`mt-[22px] h-px w-4 ${STATUS_STYLES[node.status].connector}`} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
