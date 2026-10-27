import type { Measurement } from "@/lib/okr";

const WIDTH = 600;
const HEIGHT = 120;
const PAD_X = 44;
const PAD_Y = 14;

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

// 数値の記録の推移。目標値を点線で引く（開始値・目標値・記録の範囲で縦軸を決める）
export function MetricChart({
  measurements,
  startValue,
  targetValue,
  unit,
}: {
  measurements: Measurement[];
  startValue: number;
  targetValue: number;
  unit: string;
}) {
  if (measurements.length === 0) {
    return <p className="text-sm text-muted-foreground">まだ記録がありません。下から記録してください。</p>;
  }
  const values = [startValue, targetValue, ...measurements.map((m) => m.value)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const y = (v: number) => PAD_Y + ((max - v) / range) * (HEIGHT - PAD_Y * 2);
  const x = (i: number) =>
    measurements.length === 1 ? WIDTH / 2 : PAD_X + (i / (measurements.length - 1)) * (WIDTH - PAD_X - 10);
  const points = measurements.map((m, i) => `${x(i)},${y(m.value)}`).join(" ");
  const first = measurements[0];
  const last = measurements[measurements.length - 1];

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT + 16}`}
      className="h-auto w-full"
      role="img"
      aria-label={`${first.measuredOn} の ${format(first.value)}${unit} から ${last.measuredOn} の ${format(last.value)}${unit} までの推移。目標は ${format(targetValue)}${unit}`}
    >
      <line x1={PAD_X} x2={WIDTH} y1={y(targetValue)} y2={y(targetValue)} className="stroke-green-600" strokeDasharray="4 4" />
      <text x={0} y={y(targetValue) + 4} className="fill-muted-foreground text-[11px]">
        {format(targetValue)}
      </text>
      <text x={0} y={y(startValue) + 4} className="fill-muted-foreground text-[11px]">
        {format(startValue)}
      </text>
      <polyline points={points} fill="none" className="stroke-primary" strokeWidth={2} />
      {measurements.map((m, i) => (
        <circle key={m.measuredOn} cx={x(i)} cy={y(m.value)} r={3} className="fill-primary" />
      ))}
      <text x={PAD_X} y={HEIGHT + 12} className="fill-muted-foreground text-[11px]">
        {first.measuredOn.slice(5).replace("-", "/")}
      </text>
      <text x={WIDTH} y={HEIGHT + 12} textAnchor="end" className="fill-muted-foreground text-[11px]">
        {last.measuredOn.slice(5).replace("-", "/")}
      </text>
    </svg>
  );
}
