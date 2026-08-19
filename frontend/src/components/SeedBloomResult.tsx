import { getSeedDefinition, type SeedType } from "@/lib/dreamSeeds";

interface SeedBloomResultProps {
  seedType: SeedType;
}

// AI 해몽 결과 하단에 붙는 개화 미리보기 - 어젯밤 심은 씨앗이 실제로 개화(BLOOMING)로
// 전환되는 건 저장 시점에 백엔드(create_dream)가 처리하지만, 유저가 결과를 검토하는 이
// 시점에 미리 "이 기록을 저장하면 이 꽃이 핀다"를 보여줘 밤-아침 리추얼의 보상을 체감하게 한다.
export default function SeedBloomResult({ seedType }: SeedBloomResultProps) {
  const definition = getSeedDefinition(seedType);
  const [primary, secondary] = definition.colors;

  return (
    <div
      className="mt-6 rounded-2xl border p-5 text-center"
      style={{
        borderColor: `${primary}55`,
        background: `linear-gradient(135deg, ${primary}22, ${secondary}22)`,
      }}
    >
      <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: secondary }}>
        Seed Bloomed
      </p>
      <p className="mt-2 text-3xl">🌸</p>
      <h4 className="mt-1 text-lg font-semibold text-white">{definition.flowerName}</h4>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
        어젯밤 심은 <span className="font-medium text-white">{definition.label}</span> 씨앗이 개화했어요 —{" "}
        {definition.meaning}
      </p>
    </div>
  );
}
