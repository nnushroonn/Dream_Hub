interface MoonIconProps {
  /** 조명률 0~100 (%) */
  illumination: number;
  /** 차오르는 중이면 true(오른쪽이 빛남), 기우는 중이면 false(왼쪽이 빛남) */
  isWaxing: boolean;
  size?: number;
  className?: string;
}

/**
 * 8단계 이모지로는 표현하지 못하는 정확한 조명률을 실시간으로 반영하는 달 모양 SVG.
 * 원 안에 두 개의 호(외곽 반원 + 경계선 타원)로 이루어진 조각(lune)을 그려 밝은 면을 표현한다.
 * - illumination이 0~50%일 때는 경계선이 외곽과 같은 방향으로 휘어 초승달/그믐달 모양(crescent)이 되고,
 * - 50~100%일 때는 경계선이 반대 방향으로 휘어 차오르는 달/기우는 달 모양(gibbous)이 된다.
 */
export default function MoonIcon({ illumination, isWaxing, size = 40, className }: MoonIconProps) {
  const r = 48;
  const cx = 50;
  const cy = 50;

  // illum=0 -> 1 (초승/그믐, 외곽과 같은 방향), illum=50 -> 0 (반달, 직선), illum=100 -> -1 (보름, 반대 방향)
  const cosTheta = 1 - illumination / 50;
  const rx = Math.abs(r * cosTheta);
  const terminatorSweep = cosTheta > 0 ? 0 : 1;

  // 기준(오른쪽이 빛나는 = 차오르는 달) 모양의 밝은 면 경로.
  const litPath = `M ${cx},${cy - r} A ${r},${r} 0 0 1 ${cx},${cy + r} A ${rx},${r} 0 0 ${terminatorSweep} ${cx},${cy - r} Z`;

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden="true">
      {/* 어두운 면 (전체 원) */}
      <circle cx={cx} cy={cy} r={r} fill="#1e1b3a" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
      {/* 밝은 면: 기우는 달이면 좌우 반전 */}
      <g transform={isWaxing ? undefined : `translate(100,0) scale(-1,1)`}>
        <path d={litPath} fill="#F5E9D3" />
      </g>
    </svg>
  );
}
