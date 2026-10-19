"use client";

/*
 * เนเธเธเธ—เธตเนเธ—เธตเนเธ—เธณเธเธฒเธเธเธฃเนเธญเธกเธงเธเธเธฅเธกเธเธทเนเธเธ—เธตเนเน€เธเนเธฒเธเธฒเธ
 * เธเนเธฒเธขเธเธญเธ "เธเธเธฒเธ”เธ—เธฑเนเธเธงเธ" (เน€เธชเนเธเธเนเธฒเธเธจเธนเธเธขเนเธเธฅเธฒเธ) เธ•เธฒเธกเธ—เธตเนเธเธนเนเนเธเนเธ•เธฑเนเธ โ€” เธ—เธตเนเธ—เธณเธเธฒเธเธญเธขเธนเนเธ•เธฃเธเธเธฅเธฒเธ
 *
 * เนเธกเนเนเธเน iframe เธเธญเธ OpenStreetMap เน€เธเธฃเธฒเธฐเธเธธเธกเธฃเธฐเธ”เธฑเธเธเธนเธกเนเธกเนเนเธ”เน เธงเธเธเธฅเธกเธ—เธตเนเธงเธฒเธ”เธ—เธฑเธเธเธฐเนเธกเนเธ•เธฃเธเธเธฑเธเธฃเธฐเธขเธฐเธเธฃเธดเธ
 * เธงเธฒเธ”เน€เธญเธเธเธฒเธเธ เธฒเธ tile (Web Mercator) โ€” เธฃเธนเนเธฃเธฐเธ”เธฑเธเธเธนเธก เธเธถเธเธฃเธนเนเธงเนเธฒเธเธตเนเน€เธกเธ•เธฃเธ•เนเธญเธเธดเธเน€เธเธฅ เธงเธเธเธฅเธกเธเธถเธเธ•เธฃเธเธฃเธฐเธขเธฐเธเธฃเธดเธ
 * เธเธฅเธดเธเธเธเนเธเธเธ—เธตเนเน€เธเธทเนเธญเธขเนเธฒเธขเธเธธเธ”เธเธฅเธฒเธเนเธ”เน (onPick)
 *
 * เนเธกเนเธกเธตเนเธฅเธเธฃเธฒเธฃเธตเนเธเธเธ—เธตเนเนเธเนเธเธฃเน€เธเธเธ•เน เนเธฅเธฐเธเธฒเธเธเธตเนเธ•เนเธญเธเธเธฒเธฃเนเธเนเธ เธฒเธเธเธดเนเธเธซเธเธถเนเธเธเธธเธ”เธเธฑเธเธซเธเธถเนเธเธงเธ เนเธกเนเธเธธเนเธกเน€เธเธดเนเธก dependency
 */

import { useEffect, useRef, useState } from "react";

const TILE = 256;
const EARTH = 156543.03392; // เน€เธกเธ•เธฃเธ•เนเธญเธเธดเธเน€เธเธฅเธ—เธตเนเธจเธนเธเธขเนเธชเธนเธ•เธฃ เธฃเธฐเธ”เธฑเธเธเธนเธก 0
const MIN_Z = 3;
const MAX_Z = 19;

function metersPerPixel(lat: number, z: number) {
  return (EARTH * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}

/** เธเธดเธเธฑเธ” โ’ เธเธดเธเน€เธเธฅเธเธเนเธเธเธ—เธตเนเนเธฅเธเธ—เธตเนเธฃเธฐเธ”เธฑเธเธเธนเธก z */
function project(lat: number, lng: number, z: number) {
  const n = TILE * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * n,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n,
  };
}

/** เธเธดเธเน€เธเธฅเธเธเนเธเธเธ—เธตเนเนเธฅเธ โ’ เธเธดเธเธฑเธ” */
function unproject(x: number, y: number, z: number) {
  const n = TILE * 2 ** z;
  const lng = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return { lat, lng };
}

/** เธเธนเธกเธ—เธตเนเนเธซเธเนเธ—เธตเนเธชเธธเธ”เธ—เธตเนเธงเธเธเธฅเธกเธขเธฑเธเธญเธขเธนเนเนเธเธเธฃเธญเธ (เธเธดเธเธฃเธฒเธง 70% เธเธญเธเธ”เนเธฒเธเธ—เธตเนเธชเธฑเนเธเธเธงเนเธฒ) */
function fitZoom(lat: number, radius: number, w: number, h: number) {
  const room = Math.min(w, h) * 0.7;
  for (let z = MAX_Z; z >= MIN_Z; z--) {
    if ((2 * radius) / metersPerPixel(lat, z) <= room) return z;
  }
  return MIN_Z;
}

export function AreaMap({
  lat,
  lng,
  radius,
  onPick,
  className = "",
}: {
  lat: number;
  lng: number;
  radius: number;
  onPick?: (lat: number, lng: number) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  /* เธเธฃเธฑเธเธเธนเธกเน€เธเธดเนเธก/เธฅเธ”เธเธฒเธเธฃเธฐเธ”เธฑเธเธ—เธตเนเธเธญเธ”เธตเธงเธ โ€” เน€เธเธฅเธตเนเธขเธเธฃเธฑเธจเธกเธตเนเธฅเนเธงเธเธฅเธฑเธเธกเธฒเธเธญเธ”เธตเธงเธเนเธซเธกเน */
  const [shift, setShift] = useState({ radius, by: 0 });
  const by = shift.radius === radius ? shift.by : 0;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = size;
  const ready = w > 0 && h > 0 && Number.isFinite(lat) && Number.isFinite(lng);
  const z = ready ? Math.min(MAX_Z, Math.max(MIN_Z, fitZoom(lat, radius, w, h) + by)) : MIN_Z;
  const c = project(lat, lng, z);
  /* เธกเธธเธกเธเนเธฒเธขเธเธเธเธญเธเธเธฃเธญเธ เนเธเธเธดเธเน€เธเธฅเธเธญเธเนเธเธเธ—เธตเนเนเธฅเธ */
  const left = c.x - w / 2;
  const top = c.y - h / 2;
  const count = 2 ** z;

  const tiles: { key: string; x: number; y: number; src: string }[] = [];
  if (ready) {
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + h) / TILE); ty++) {
      if (ty < 0 || ty >= count) continue;
      for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + w) / TILE); tx++) {
        const wrap = ((tx % count) + count) % count;
        tiles.push({
          key: `${z}-${tx}-${ty}`,
          x: tx * TILE - left,
          y: ty * TILE - top,
          src: `https://tile.openstreetmap.org/${z}/${wrap}/${ty}.png`,
        });
      }
    }
  }
  const rPx = ready ? radius / metersPerPixel(lat, z) : 0;
  /* เธเนเธฒเธขเธเธญเธเธฃเธฑเธจเธกเธตเธ•เธฃเธเธเธฑเธเธ—เธตเนเธ•เธฑเนเธเนเธงเน เนเธกเนเนเธเนเธเธเธฒเธ”เธ—เธฑเนเธเธงเธ (เธเธนเนเนเธเนเธชเธฑเนเธ 16 เธ•.เธ. 2569) */
  const across = Math.round(radius);

  function pick(e: React.MouseEvent<HTMLDivElement>) {
    if (!onPick || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const p = unproject(left + (e.clientX - r.left), top + (e.clientY - r.top), z);
    onPick(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)));
  }

  const zoomBtn = "grid size-8 place-items-center bg-white text-[18px] leading-none text-foreground hover:bg-muted disabled:opacity-40";

  return (
    <div
      ref={box}
      onClick={pick}
      className={`relative overflow-hidden bg-[#e8e4dc] ${onPick ? "cursor-crosshair" : ""} ${className}`}
      role="img"
      aria-label={`เนเธเธเธ—เธตเนเธ—เธตเนเธ—เธณเธเธฒเธ เธฃเธฑเธจเธกเธต ${Math.round(radius)} เน€เธกเธ•เธฃ`}
    >
      {tiles.map((t) => (
        // eslint-disable-next-line @next/next/no-img-element -- เธ เธฒเธ tile เธ เธฒเธขเธเธญเธเธเธเธฒเธ”เธเธเธ—เธตเน เนเธกเนเธ•เนเธญเธเธเนเธฒเธ next/image
        <img
          key={t.key}
          src={t.src}
          alt=""
          draggable={false}
          className="pointer-events-none absolute max-w-none select-none"
          style={{ left: t.x, top: t.y, width: TILE, height: TILE }}
        />
      ))}

      {ready && (
        <svg className="pointer-events-none absolute inset-0" width={w} height={h} aria-hidden="true">
          <circle
            cx={w / 2}
            cy={h / 2}
            r={rPx}
            fill="rgba(219,0,0,.14)"
            stroke="#db0000"
            strokeWidth={2}
          />
          {/* เน€เธชเนเธเธฃเธฑเธจเธกเธตเธเธฒเธเธซเธกเธธเธ”เธ–เธถเธเธเธญเธเธงเธ เธเธฃเนเธญเธกเธเนเธฒเธขเธฃเธฑเธจเธกเธต */}
          <line x1={w / 2} y1={h / 2} x2={w / 2 + rPx} y2={h / 2} stroke="#db0000" strokeWidth={1.5} strokeDasharray="4 3" />
          {/* เธเนเธฒเธขเนเธงเนเนเธ•เนเธซเธกเธธเธ” เธงเธเน€เธฅเนเธเธเธเธเนเธฒเธขเธฅเนเธเธงเธ เธขเนเธฒเธขเนเธเนเธงเนเนเธ•เนเธเธญเธเธงเธ */}
          <g transform={`translate(${w / 2}, ${rPx < 40 ? h / 2 + rPx + 16 : h / 2 + 20})`}>
            <rect x={-34} y={-10} width={68} height={18} rx={9} fill="#fff" stroke="#db0000" strokeWidth={1} />
            <text textAnchor="middle" y={3.5} fontSize={11} fontWeight={600} fill="#db0000">
              {across >= 1000 ? `${(across / 1000).toFixed(across % 1000 ? 1 : 0)} เธเธก.` : `${across} เธก.`}
            </text>
          </g>
          {/* เธซเธกเธธเธ”เธ—เธตเนเธ—เธณเธเธฒเธ */}
          <circle cx={w / 2} cy={h / 2} r={6} fill="#db0000" stroke="#fff" strokeWidth={2.5} />
        </svg>
      )}

      <div
        className="absolute top-2 right-2 flex flex-col overflow-hidden rounded-[8px] border border-border shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" aria-label="เธเธนเธกเน€เธเนเธฒ" className={zoomBtn} disabled={z >= MAX_Z} onClick={() => setShift({ radius, by: by + 1 })}>
          +
        </button>
        <button type="button" aria-label="เธเธนเธกเธญเธญเธ" className={`${zoomBtn} border-t border-border`} disabled={z <= MIN_Z} onClick={() => setShift({ radius, by: by - 1 })}>
          โ’
        </button>
      </div>

      <span className="pointer-events-none absolute right-0 bottom-0 bg-white/80 px-1.5 py-0.5 text-[10px] text-[#333]">
        ยฉ OpenStreetMap contributors
      </span>
    </div>
  );
}
