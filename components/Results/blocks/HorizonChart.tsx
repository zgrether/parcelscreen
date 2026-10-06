/**
 * The horizon profile and the December sun's path (proto L1475–1482): a 360 × 100 SVG, x = azimuth° from
 * north, y = altitude° × 3 from the bottom. viewBox-based, so the print variant can give it a physical size.
 */
import type { HorizonChart as Chart } from "@/lib/report/sun";

export function HorizonChart({ chart }: { chart: Chart }) {
  const { width: W, height: H } = chart;
  return (
    <svg
      className="horizon"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-label="Horizon profile and December sun path"
      role="img"
    >
      <path d={chart.skyline} fill="#dfe3da" stroke="#4a5650" strokeWidth={1} />
      {chart.sunPath && <path d={chart.sunPath} fill="none" stroke="#9a6a12" strokeWidth={2} />}
      <line x1={180} y1={0} x2={180} y2={H} stroke="#c3c9bf" strokeDasharray="2 3" />
      {chart.labels.map((l) => (
        <text
          key={l.text}
          x={l.x === 0 ? 3 : l.x}
          y={12}
          fontSize={10}
          fill="#4a5650"
          textAnchor={l.x === 0 ? "start" : "middle"}
        >
          {l.text}
        </text>
      ))}
    </svg>
  );
}
