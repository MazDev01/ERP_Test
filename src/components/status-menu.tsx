"use client";

/*
 * ป้ายสถานะที่กดแล้วเป็นดรอปดาวน์เปลี่ยนสถานะ — ใช้ร่วมทุกหน้าของฝ่ายขาย
 * ตัวเลือกที่เปลี่ยนจากสถานะปัจจุบันไม่ได้ยังแสดงอยู่ แต่กดไม่ได้และบอกเหตุผล
 * รายการเมนู portal ไป body เพราะตารางมี overflow และการ์ดมี backdrop-filter (ดู erp-maz-overlay-portal)
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "./icons";

export type StatusOption<S extends string> = {
  value: S;
  cls: string;
  /** เหตุผลที่เลือกไม่ได้ — ว่างคือเลือกได้ */
  blocked?: string;
};

export function StatusMenu<S extends string>({
  current,
  options,
  onPick,
}: {
  current: S;
  options: StatusOption<S>[];
  onPick: (value: S) => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const cls = options.find((o) => o.value === current)?.cls ?? "";
  const movable = options.some((o) => o.value !== current && !o.blocked);

  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [at]);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (at) return setAt(null);
    const r = btn.current!.getBoundingClientRect();
    setAt({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 268)) });
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={Boolean(at)}
        aria-label={`สถานะ ${current} — กดเพื่อเปลี่ยน`}
        onClick={toggle}
        className={`tag ${cls} cursor-pointer gap-1 transition hover:brightness-95`}
      >
        <i />
        {current}
        <ChevronDownIcon className="size-3" strokeWidth={2.6} />
      </button>

      {at &&
        createPortal(
          <div
            role="menu"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-[80] w-[260px] rounded-xl border border-border bg-[var(--card-solid)] p-1.5 shadow-lg"
            style={{ top: at.top, left: at.left }}
          >
            <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold text-muted-foreground">เปลี่ยนสถานะ</p>
            {options.map((o) => {
              const now = o.value === current;
              const off = !now && Boolean(o.blocked);
              return (
                <button
                  key={o.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={now}
                  disabled={off}
                  onClick={() => {
                    setAt(null);
                    if (!now) onPick(o.value);
                  }}
                  className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left enabled:hover:bg-muted disabled:cursor-not-allowed"
                >
                  <span className="flex w-full items-center gap-2">
                    <span className={`tag ${o.cls} ${off ? "opacity-45" : ""}`}>
                      <i />
                      {o.value}
                    </span>
                    {now && <span className="ml-auto text-[11px] text-muted-foreground">ปัจจุบัน</span>}
                  </span>
                  {off && <span className="text-[11px] leading-snug text-muted-foreground">{o.blocked}</span>}
                </button>
              );
            })}
            {!movable && (
              <p className="px-2.5 pt-1 pb-1 text-[11px] text-muted-foreground">
                สถานะนี้เปลี่ยนต่อจากตรงนี้ไม่ได้
              </p>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
