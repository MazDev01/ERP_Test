"use client";

import { useHydrated } from "@/lib/pwa";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RotateIcon } from "./icons";

/** ขนาดรูปที่บันทึกจริง (สี่เหลี่ยมจัตุรัส) */
const OUTPUT_SIZE = 512;
/** ขนาดกรอบครอปบนหน้าจอ — คงที่เพื่อให้คำนวณตรงกับตอนวาดลง canvas */
const VIEWPORT = 264;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

/**
 * ครอปรูปโปรไฟล์แบบเลื่อน-ซูม-หมุน
 * แสดงกรอบวงกลมทับรูป ส่วนที่อยู่ในวงกลมคือส่วนที่จะถูกบันทึก
 */
export function PhotoCropper({
  src,
  onCancel,
  onDone,
}: {
  src: string;
  onCancel: () => void;
  onDone: (dataUrl: string) => void;
}) {
  /* เปิดกล่องได้หลัง hydrate เท่านั้น — ถ้าใช้ typeof document เซิร์ฟเวอร์จะวาดว่าง แต่เบราว์เซอร์วาดกล่อง
     ตอนที่กล่องเปิดมาตั้งแต่แรก (เช่นลิงก์ ?new=1) React จะฟ้อง hydration ไม่ตรงกัน */
  const hydrated = useHydrated();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );

  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);

  // โหลดรูปเพื่อรู้ขนาดจริง — ต้องรู้ก่อนถึงจะคำนวณ scale ได้
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = src;
  }, [src]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const baseScale = natural
    ? Math.max(VIEWPORT / natural.w, VIEWPORT / natural.h)
    : 1;
  const scale = baseScale * zoom;

  /** ระยะที่เลื่อนได้มากสุด เพื่อไม่ให้มีขอบว่างโผล่ในกรอบ */
  function clamp(next: { x: number; y: number }) {
    if (!natural) return next;
    const swapped = rotation % 180 !== 0;
    const w = (swapped ? natural.h : natural.w) * scale;
    const h = (swapped ? natural.w : natural.h) * scale;
    const maxX = Math.max(0, (w - VIEWPORT) / 2);
    const maxY = Math.max(0, (h - VIEWPORT) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    setOffset(
      clamp({
        x: drag.ox + (e.clientX - drag.x),
        y: drag.oy + (e.clientY - drag.y),
      }),
    );
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  function confirm() {
    const img = imgRef.current;
    if (!img || !natural) return;
    setBusy(true);

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // วาดด้วยเรขาคณิตชุดเดียวกับที่แสดงบนหน้าจอ ย่อ/ขยายตามอัตราส่วนของ canvas
    const ratio = OUTPUT_SIZE / VIEWPORT;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    ctx.translate(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2);
    ctx.scale(ratio, ratio);
    ctx.translate(offset.x, offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(img, -natural.w / 2, -natural.h / 2);

    onDone(canvas.toDataURL("image/jpeg", 0.9));
  }

  if (!hydrated) return null;

  /* ยิงออกไปที่ body — กล่องครอบที่มี backdrop-filter จะกลายเป็นกรอบอ้างอิงของ fixed */
  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/80 p-4">
      <p className="py-3 text-center font-semibold text-white">ปรับรูปโปรไฟล์</p>

      {/* พื้นที่ครอป */}
      <div className="flex flex-1 items-center justify-center">
        <div
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative max-w-full cursor-grab touch-none overflow-hidden rounded-full bg-neutral-900 ring-4 ring-white/80 active:cursor-grabbing"
        >
          {natural && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute top-1/2 left-1/2 max-w-none origin-center select-none"
              style={{
                width: natural.w,
                height: natural.h,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${scale})`,
              }}
            />
          )}
        </div>
      </div>

      {/* ตัวควบคุม */}
      <div className="mx-auto w-full max-w-sm space-y-4 pb-2">
        <div className="flex items-center gap-3">
          <span className="text-sm text-white/70">ย่อ</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => {
              setZoom(Number(e.target.value));
              setOffset((o) => clamp(o));
            }}
            aria-label="ซูมรูป"
            className="h-1.5 flex-1 accent-[var(--brand-500)]"
          />
          <span className="text-sm text-white/70">ขยาย</span>
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => {
              setRotation((r) => (r + 90) % 360);
              setOffset({ x: 0, y: 0 });
            }}
            className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/25"
          >
            <RotateIcon className="size-4" />
            หมุน 90°
          </button>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="h-12 flex-1 rounded-full bg-white/15 font-semibold text-white transition-colors hover:bg-white/25"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!natural || busy}
            className="h-12 flex-1 rounded-full bg-primary font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            ใช้รูปนี้
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
