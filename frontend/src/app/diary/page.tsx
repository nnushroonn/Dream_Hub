"use client";

import { useEffect, useState } from "react";

import { getDiaryEntries, interpretDreamEntry, type DiaryEntry, type DreamInterpretation } from "@/api/dream";
import NavBar from "@/components/NavBar";

const EMOTIONS = ["😊", "😨", "😢", "😴", "😡", "😌"];

export default function DiaryPage() {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);

  // 꿈 작성 폼 상태 (감정 / 내용 / 공개여부)
  const [emotion, setEmotion] = useState(EMOTIONS[0]);
  const [content, setContent] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  // AI 해몽 모달 상태
  const [interpretation, setInterpretation] = useState<DreamInterpretation | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    getDiaryEntries().then(setEntries).catch(() => {});
  }, []);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // TODO: 실제 구현 시 POST /diary/entries 로 { content, emotion, is_public } 전송 후 목록 갱신
    setContent("");
  };

  const openInterpretation = async (entryId: number) => {
    // TODO: 실제 구현 시 AI 해몽 API(LLM 연동) 응답으로 대체
    const result = await interpretDreamEntry(entryId);
    setInterpretation(result);
    setIsModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0518] via-[#170b2e] to-black text-indigo-50">
      <NavBar />

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold">꿈 기록소</h1>
        <p className="mt-1 text-sm text-indigo-300/70">오늘 꾼 꿈을 기록하고 AI 해몽을 받아보세요.</p>

        {/* 꿈 작성 폼: 감정 / 내용 / 공개여부 */}
        <form
          onSubmit={handleSubmit}
          className="mt-8 rounded-2xl border border-indigo-900/60 bg-indigo-950/40 p-6"
        >
          <div className="flex gap-2">
            {EMOTIONS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setEmotion(item)}
                className={`rounded-full px-3 py-2 text-lg transition-transform ${
                  emotion === item ? "scale-110 bg-violet-600/40" : "hover:scale-105"
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="어떤 꿈을 꾸셨나요?"
            rows={4}
            className="mt-4 w-full rounded-xl border border-indigo-800 bg-black/30 p-3 text-sm text-indigo-50 placeholder:text-indigo-400/50 focus:border-violet-500 focus:outline-none"
          />

          <div className="mt-4 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-indigo-300">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(event) => setIsPublic(event.target.checked)}
                className="accent-violet-500"
              />
              커뮤니티에 공개하기
            </label>
            <button
              type="submit"
              className="rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-5 py-2 text-sm font-medium text-white"
            >
              꿈 기록하기
            </button>
          </div>
        </form>

        {/* 내 꿈 기록 목록 */}
        <div className="mt-10 space-y-4">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-indigo-900/60 bg-indigo-950/30 p-5">
              <div className="flex items-center justify-between text-sm text-indigo-400">
                <span>
                  {entry.emotion} {entry.is_lucid && <span className="ml-1 text-violet-300">#자각몽</span>}
                </span>
                <span>{entry.is_public ? "공개" : "비공개"}</span>
              </div>
              <p className="mt-2 text-indigo-100">{entry.content}</p>
              <button
                type="button"
                onClick={() => openInterpretation(entry.id)}
                className="mt-3 text-sm text-violet-300 hover:text-violet-200"
              >
                AI 해몽 보기 →
              </button>
            </div>
          ))}
        </div>
      </main>

      {/* AI 해몽 모달 */}
      {isModalOpen && interpretation && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-violet-800/60 bg-[#140a29] p-6">
            <h2 className="text-lg font-semibold text-violet-200">🔮 AI 해몽 결과</h2>
            <p className="mt-3 text-sm text-indigo-100">{interpretation.meaning}</p>

            <div className="mt-4">
              <p className="text-xs text-indigo-400">상징 키워드</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {interpretation.symbols.map((symbol) => (
                  <span key={symbol} className="rounded-full bg-violet-900/40 px-3 py-1 text-xs text-violet-200">
                    {symbol}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-amber-900/20 p-3 text-sm text-amber-200">
              🍀 {interpretation.lucky_element}
            </div>

            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="mt-5 w-full rounded-full border border-indigo-700 py-2 text-sm text-indigo-200 hover:bg-indigo-900/40"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
