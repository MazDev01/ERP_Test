"use client";

/*
 * ช่องเวลาแบบ 24 ชั่วโมง (ชช:นน) — ใช้แทน input[type=time] ทุกที่ (ผู้ใช้สั่ง 13 ต.ค. 2569)
 * ช่องเวลาของเบราว์เซอร์แสดงตามภาษาของเครื่อง เครื่องภาษาอังกฤษจะเห็น 09:00 AM / 06:00 PM
 * ตรงนี้แสดงและรับ 24 ชั่วโมงเสมอ ไม่ขึ้นกับเครื่อง
 *
 * พิมพ์ตัวเลขแล้วใส่ ":" ให้เอง ("930" → 9:30 → ออกจากช่องได้ 09:30)
 * ออกจากช่องแล้วตรวจ 00–23 / 00–59 — ผิดรูปย้อนกลับเป็นค่าเดิม · ว่างได้
 * step (วินาที แบบเดียวกับ input[type=time]) ปัดให้ลงช่วงตอนออกจากช่อง และเป็นช่วงของรายการเวลา
 * กดไอคอนนาฬิกาเปิดรายการเวลาให้เลือกเร็ว · กดนอกรายการหรือ Esc ปิด
 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ClockIcon } from "./icons";

const pad = (n: number) => String(n).padStart(2, "0");

/** แปลงข้อความที่พิมพ์เป็น "HH:MM" — คืน null ถ้าไม่ใช่เวลาที่ถูกต้อง */
function parseTime(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let h: string;
  let m: string;
  if (s.includes(":")) {
    [h, m = "0"] = s.split(":");
    if (!h) return null;
  } else {
    if (s.length <= 2) [h, m] = [s, "0"];
    else if (s.length === 3) [h, m] = [s.slice(0, 1), s.slice(1)];
    else [h, m] = [s.slice(0, 2), s.slice(2, 4)];
  }
  if (!/^\d{1,2}$/.test(h) || !/^\d{1,2}$/.test(m || "0")) return null;
  const hh = Number(h);
  const mm = Number(m || "0");
  if (hh > 23 || mm > 59) return null;
  return `${pad(hh)}:${pad(mm)}`;
}

/** จัดรูปข้อความระหว่างพิมพ์ — เก็บแค่ตัวเลข ใส่ ":" ให้เอง */
function shapeDraft(raw: string): string {
  const cleaned = raw.replace(/[^\d:]/g, "");
  if (cleaned.includes(":")) {
    const [h, ...rest] = cleaned.split(":");
    return `${h.slice(0, 2)}:${rest.join("").slice(0, 2)}`;
  }
  const d = cleaned.slice(0, 4);
  if (d.length <= 2) return d;
  if (d.length === 3) return `${d[0]}:${d.slice(1)}`;
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

/** ปัดเวลาให้ลงช่วง step นาที (ไม่เกิน 23:59) */
function roundTo(hhmm: string, stepMin: number): string {
  if (stepMin <= 1) return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min(Math.round((h * 60 + m) / stepMin) * stepMin, 23 * 60 + 59);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** หน้าตาเดียวกับ Input ของ ./ui — สำหรับหน้าที่เดิมใช้ <Input type="time"> */
export const UI_TIME_CLS =
  "num h-9 w-full rounded-[10px] border border-border bg-white px-3 text-sm outline-none transition hover:border-[#d4d4d4] focus:border-ring placeholder:text-muted-foreground";

export type Time24InputProps = {
  value: string;
  /** รับค่า "HH:MM" หรือ "" */
  onValueChange?: (v: string) => void;
  /** แบบเดียวกับ input เดิม — ใช้ e.target.value ได้ตรง ๆ */
  onChange?: (e: { target: { value: string } }) => void;
  /** วินาที แบบ input[type=time] เช่น 900 = ทีละ 15 นาที */
  step?: number;
  className?: string;
  /** คลาสของกรอบนอก — ความกว้างของช่องในตาราง */
  wrapperClassName?: string;
  style?: CSSProperties;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  placeholder?: string;
};

export function Time24Input({
  value,
  onValueChange,
  onChange,
  step,
  className = "field-control num",
  wrapperClassName = "w-full",
  style,
  disabled = false,
  id,
  "aria-label": ariaLabel,
  placeholder = "--:--",
}: Time24InputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const stepMin = step && step >= 60 ? Math.round(step / 60) : 0;
  const listStep = stepMin || 15;

  const emit = (v: string) => {
    if (v === value) return;
    onValueChange?.(v);
    onChange?.({ target: { value: v } });
  };

  const commit = () => {
    if (draft === null) return;
    const t = draft.trim();
    if (!t) emit("");
    else {
      const p = parseTime(t);
      if (p) emit(stepMin ? roundTo(p, stepMin) : p);
    }
    setDraft(null);
  };

  /* รายการเวลาลอยบน body ใต้ช่อง — พื้นที่ล่างไม่พอก็พลิกขึ้นบน */
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (!r) return;
      const h = 240;
      const width = Math.max(r.width, 110);
      const up = window.innerHeight - r.bottom < h + 12 && r.top > h + 12;
      setPos({
        top: up ? r.top - h - 4 : r.bottom + 4,
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
        width,
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  /* กดนอกช่อง/นอกรายการ หรือ Esc แล้วปิด */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (boxRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    /* capture — ปิดแค่รายการ ไม่ให้ Esc ไปปิดกล่องที่ครอบอยู่ */
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  /* เลื่อนรายการไปที่เวลาที่เลือก (หรือใกล้สุด) ตอนเปิด */
  useEffect(() => {
    if (!open || !pos) return;
    const el = popRef.current?.querySelector<HTMLElement>("[data-near]");
    el?.scrollIntoView({ block: "center" });
  }, [open, pos]);

  const times: string[] = [];
  for (let t = 0; t < 24 * 60; t += listStep) times.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
  const cur = parseTime(value);
  const curMin = cur ? Number(cur.slice(0, 2)) * 60 + Number(cur.slice(3)) : 9 * 60;
  const near = times.reduce((best, t) => {
    const m = Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    const b = Number(best.slice(0, 2)) * 60 + Number(best.slice(3));
    return Math.abs(m - curMin) < Math.abs(b - curMin) ? t : best;
  }, times[0]);

  return (
    <div ref={boxRef} className={`relative ${wrapperClassName}`}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        id={id}
        aria-label={ariaLabel}
        placeholder={placeholder}
        disabled={disabled}
        value={draft ?? value}
        maxLength={5}
        onFocus={() => setDraft(value)}
        onChange={(e) => {
          const d = shapeDraft(e.target.value);
          setDraft(d);
          /* ครบ ชช:นน และถูกต้อง ส่งค่าทันที ตัวเลขที่คำนวณจากเวลาจะได้ขยับตาม */
          if (/^\d{2}:\d{2}$/.test(d)) {
            const p = parseTime(d);
            if (p) emit(p);
          }
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        className={className}
        /* เว้นที่ขวาให้ไอคอนนาฬิกา — ใส่ใน style เพราะ .field-control อยู่นอก @layer ชนะคลาส Tailwind */
        style={{ ...style, paddingRight: 30 }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="เลือกเวลา"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="absolute top-1/2 right-[9px] -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ClockIcon className="size-[14px]" strokeWidth={2} />
      </button>

      {open && pos && !disabled && createPortal(
        <div
          ref={popRef}
          role="listbox"
          aria-label={ariaLabel ? `${ariaLabel} — เลือกเวลา` : "เลือกเวลา"}
          /* หยุดการกดไว้ที่รายการ กล่องที่ครอบอยู่จะได้ไม่ปิดตาม */
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="fixed z-[130] h-[240px] overflow-y-auto rounded-[10px] border border-border bg-card p-1 shadow-[0_22px_46px_-20px_rgba(40,25,60,.42)]"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          {times.map((t) => (
            <button
              key={t}
              type="button"
              role="option"
              aria-selected={t === cur}
              data-near={t === near ? "" : undefined}
              onClick={() => {
                emit(t);
                setDraft(null);
                setOpen(false);
              }}
              className={`num block w-full rounded-[7px] px-2.5 py-1.5 text-left text-[13px] ${
                t === cur ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
