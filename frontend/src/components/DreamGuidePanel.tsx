const GUIDE_ITEMS = [
  { emoji: "👤", label: "인물", text: "꿈에 등장한 사람이나 존재를 자세히 적어주세요." },
  { emoji: "📍", label: "장소", text: "꿈이 펼쳐진 장소와 주변 분위기를 묘사해 주세요." },
  { emoji: "🎬", label: "사건", text: "꿈에서 일어난 일을 기억나는 순서대로 적어주세요." },
  { emoji: "🔮", label: "상징", text: "꿈속에서 인상 깊었던 상징이나 특별한 요소를 모두 적어주세요." },
  { emoji: "❤️", label: "감정", text: "꿈을 꾸는 동안 느낀 감정과, 잠에서 깬 뒤 남아 있던 감정을 각각 표현해 주세요." },
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
