const GUIDE_ITEMS = [
  { emoji: "👤", label: "인물", text: "누가 나왔는지 구체적으로 적어주세요." },
  { emoji: "📍", label: "장소", text: "꿈의 장소와 배경을 묘사해 주세요." },
  { emoji: "🎬", label: "사건", text: "꿈 속에서 벌어진 사건을 순서대로 적어주세요." },
  { emoji: "🔮", label: "상징", text: "꿈에 나타난 상징적인 요소들을 빠짐없이 적어주세요." },
  { emoji: "❤️", label: "감정", text: "꿈 속에서 & 꿈에서 깬 뒤의 감정 상태를 표현해 주세요." },
];

// ⚡ 빠른 기록 입력창 바로 위에서, 5대 핵심 요소(인물/장소/사건/상징/감정)를 한 번에 보여주는 정적 가이드 패널.
export default function DreamGuidePanel() {
  return (
    <div className="mb-4 rounded-xl border border-purple-500/15 bg-purple-950/10 p-4">
      <div className="space-y-2">
        {GUIDE_ITEMS.map((item) => (
          <p key={item.label} className="flex items-start gap-2 text-sm text-slate-300">
            <span>{item.emoji}</span>
            <span>
              <span className="font-semibold text-purple-300">{item.label}:</span> {item.text}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}
