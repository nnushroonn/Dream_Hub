"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import DreamRecordModal from "@/components/DreamRecordModal";
import NavBar from "@/components/NavBar";
import PreviewGateway from "@/components/PreviewGateway";
import { useAuthStore } from "@/store/useAuthStore";
import { useSavedDreamsStore } from "@/store/useSavedDreamsStore";

// 일기장(/journal)의 "이 날의 꿈 기록하기"/"어젯밤 꿈 기록하기" 전용 페이지 - 기존에는
// DreamRecordModal이 팝업으로만 떴는데, 꿈 기록+AI 해몽처럼 시간이 걸리고 몰입이 필요한
// 작업을 작은 팝업 안에 가두지 않기 위해 독립된 페이지로 옮겼다. 모달 내부 로직(빠른/정밀
// 기록, 초안 복구, AI 해몽, 저장)은 DreamRecordModal이 그대로 담당하고, 이 페이지는
// variant="page"로 바깥 레이아웃(오버레이 없음)만 바꿔 끼운다. 정적 export라 동적 세그먼트를
// 못 써 ?date=로 대상 날짜를 넘긴다(다른 화면들과 동일한 관례).
export default function JournalRecordPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const upsertEntry = useSavedDreamsStore((state) => state.upsertEntry);
  const [initialDate, setInitialDate] = useState<string | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get("date");
    if (dateParam) setInitialDate(dateParam);
  }, []);

  const goBackToJournal = (targetDate?: string, justSavedEntryId?: number) => {
    const params = new URLSearchParams();
    if (targetDate) params.set("date", targetDate);
    if (justSavedEntryId) params.set("justSaved", String(justSavedEntryId));
    const query = params.toString();
    router.push(query ? `/journal?${query}` : "/journal");
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#030712] text-slate-100">
        <NavBar />
        <div className="mx-auto max-w-2xl px-6 py-12">
          <PreviewGateway
            title="꿈을 기록하기 전에 로그인해 주세요"
            subtitle="로그인하면 지난밤의 꿈을 기록하고 AI 해몽을 받아볼 수 있어요."
            ctaLabel="🔮 로그인하고 꿈 기록하기"
            triggerSource="journal"
          />
        </div>
      </div>
    );
  }

  // 집중 모드 - 꿈 기록(간단/정밀 7단계 DreamWizard) 작성 중에는 내비게이션 바까지 걷어내
  // 다른 페이지 요소가 전혀 안 보이게 한다. 나가기(×)/이탈 방지 확인/저장 완료 후 흐름은
  // DreamRecordModal이 이미 자체적으로 갖고 있다(requestClose의 미저장 확인, 결과 화면을
  // 보여준 뒤에만 onSaved/onClose 호출) - 여기서는 그 바깥 레이아웃만 전체 화면으로 바꿔 끼운다.
  return (
    <div className="min-h-screen bg-[#030712] text-slate-100">
      <DreamRecordModal
        variant="page"
        initialDate={initialDate}
        onClose={() => goBackToJournal(initialDate)}
        onSaved={(entry) => {
          upsertEntry(entry);
          goBackToJournal(entry.dream_date, entry.id);
        }}
      />
    </div>
  );
}
