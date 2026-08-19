// 전설의 꽃 카드 모서리에 붙는 작은 리본 배지 - 도감 모달과 정원 메인 그리드 양쪽에서 공유해,
// "이 카드는 전설의 정원 소속"이라는 신호를 일반 카드와 뚜렷이 구분되게 준다. 부모가 이미
// relative여야 절대 위치가 카드 기준으로 잡힌다.
export default function LegendaryRibbon() {
  return (
    <span className="absolute -right-1.5 -top-1.5 z-10 rounded-full border border-amber-300/70 bg-gradient-to-r from-amber-400 to-yellow-300 px-1.5 py-0.5 text-[8px] font-bold text-amber-950 shadow-[0_0_8px_rgba(251,191,36,0.55)]">
      전설
    </span>
  );
}
