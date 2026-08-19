// hex 색을 다른 hex 쪽으로 t만큼(0~1) 섞는다 - 렌더링 시점에 하이라이트/그림자 톤을
// 파생시킬 때 쓴다. FlowerIcon과 SeedIcon이 같은 시각 언어(채움+하이라이트+글린트)를
// 공유하기 위해 이 계산을 여기 한 곳에 둔다.
export function mixHex(hex: string, target: string, t: number): string {
  const c1 = hex.replace("#", "");
  const c2 = target.replace("#", "");
  const r1 = parseInt(c1.substring(0, 2), 16), g1 = parseInt(c1.substring(2, 4), 16), b1 = parseInt(c1.substring(4, 6), 16);
  const r2 = parseInt(c2.substring(0, 2), 16), g2 = parseInt(c2.substring(2, 4), 16), b2 = parseInt(c2.substring(4, 6), 16);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(mix(r1, r2))}${toHex(mix(g1, g2))}${toHex(mix(b1, b2))}`;
}

export function lighten(hex: string, t: number): string {
  return mixHex(hex, "#ffffff", t);
}

export function darken(hex: string, t: number): string {
  return mixHex(hex, "#0f0a1a", t);
}
