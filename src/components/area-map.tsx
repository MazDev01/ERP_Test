"use client";

/*
 * แผนที่ที่ทำงานพร้อมวงกลมพื้นที่เข้างาน
 * ป้ายบอก "ขนาดทั้งวง" (เส้นผ่านศูนย์กลาง) ตามที่ผู้ใช้ตั้ง — ที่ทำงานอยู่ตรงกลาง
 *
 * ไม่ใช้ iframe ของ OpenStreetMap เพราะคุมระดับซูมไม่ได้ วงกลมที่วาดทับจะไม่ตรงกับระยะจริง
 * วาดเองจากภาพ tile (Web Mercator) — รู้ระดับซูม จึงรู้ว่ากี่เมตรต่อพิกเซล วงกลมจึงตรงระยะจริง
 * คลิกบนแผนที่เพื่อย้ายจุดกลางได้ (onPick)
 *
 * ไม่มีไลบรารีแผนที่ในโปรเจกต์ และงานนี้ต้องการแค่ภาพนิ่งหนึ่งจุดกับหนึ่งวง ไม่คุ้มเพิ่ม dependency
 */

import { useEffect, useRef, useState } from "react";

const TILE = 256;
const EARTH = 156543.03392; // เมตรต่อพิกเซลที่ศูนย์สูตร ระดับซูม 0
const MIN_Z = 3;
const MAX_Z = 19;

function metersPerPixel(lat: number, z: number) {
  return (EARTH * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}

/** พิกัด → พิกเซลบนแผนที่โลกที่ระดับซูม z */
function project(lat: number, lng: number, z: number) {
  const n = TILE * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * n,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n,
  };
}

/** พิกเซลบนแผนที่โลก → พิกัด */
function unproject(x: number, y: number, z: number) {
  const n = TILE * 2 ** z;
  const lng = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return { lat, lng };
}

/** ซูมที่ใหญ่ที่สุดที่วงกลมยังอยู่ในกรอบ (กินราว 70% ของด้านที่สั้นกว่า) */
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
  /* ปรับซูมเพิ่ม/ลดจากระดับที่พอดีวง — เปลี่ยนรัศมีแล้วกลับมาพอดีวงใหม่ */
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
  /* มุมซ้ายบนของกรอบ ในพิกเซลของแผนที่โลก */
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
  /* ขนาดทั้งวงที่ผู้ใช้ตั้ง */
  const across = Math.round(radius * 2);

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
      aria-label={`แผนที่ที่ทำงาน พื้นที่ทั้งวง ${radius * 2} เมตร`}
    >
      {tiles.map((t) => (
        // eslint-disable-next-line @next/next/no-img-element -- ภาพ tile ภายนอกขนาดคงที่ ไม่ต้องผ่าน next/image
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
          {/* เส้นผ่านศูนย์กลางจากขอบถึงขอบ พร้อมป้ายขนาดทั้งวง */}
          <line x1={w / 2 - rPx} y1={h / 2} x2={w / 2 + rPx} y2={h / 2} stroke="#db0000" strokeWidth={1.5} strokeDasharray="4 3" />
          {/* ป้ายไว้ใต้หมุด วงเล็กจนป้ายล้นวง ย้ายไปไว้ใต้ขอบวง */}
          <g transform={`translate(${w / 2}, ${rPx < 40 ? h / 2 + rPx + 16 : h / 2 + 20})`}>
            <rect x={-34} y={-10} width={68} height={18} rx={9} fill="#fff" stroke="#db0000" strokeWidth={1} />
            <text textAnchor="middle" y={3.5} fontSize={11} fontWeight={600} fill="#db0000">
              {across >= 1000 ? `${(across / 1000).toFixed(across % 1000 ? 1 : 0)} กม.` : `${across} ม.`}
            </text>
          </g>
          {/* หมุดที่ทำงาน */}
          <circle cx={w / 2} cy={h / 2} r={6} fill="#db0000" stroke="#fff" strokeWidth={2.5} />
        </svg>
      )}

      <div
        className="absolute top-2 right-2 flex flex-col overflow-hidden rounded-[8px] border border-border shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" aria-label="ซูมเข้า" className={zoomBtn} disabled={z >= MAX_Z} onClick={() => setShift({ radius, by: by + 1 })}>
          +
        </button>
        <button type="button" aria-label="ซูมออก" className={`${zoomBtn} border-t border-border`} disabled={z <= MIN_Z} onClick={() => setShift({ radius, by: by - 1 })}>
          −
        </button>
      </div>

      <span className="pointer-events-none absolute right-0 bottom-0 bg-white/80 px-1.5 py-0.5 text-[10px] text-[#333]">
        © OpenStreetMap contributors
      </span>
      {onPick && (
        <span className="pointer-events-none absolute bottom-0 left-0 bg-white/85 px-2 py-0.5 text-[11px] text-[#333]">
          คลิกบนแผนที่เพื่อย้ายจุดกลาง
        </span>
      )}
    </div>
  );
}
