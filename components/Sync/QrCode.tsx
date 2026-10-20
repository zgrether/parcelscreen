/**
 * A QR code as an SVG path (step 5): the join link `<origin>/link#<code>`, for the other device's camera. Drawn from
 * qrcode-generator's modules (no dependencies of its own), with a four-module quiet zone, black on white whatever the
 * theme, so every camera reads it.
 */
import qrcode from "qrcode-generator";

export function QrCode({ text, size = 240, label }: { text: string; size?: number; label: string }) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  let d = "";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  const side = n + quiet * 2;
  return (
    <svg
      className="qr-code"
      width={size}
      height={size}
      viewBox={`0 0 ${side} ${side}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={side} height={side} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
