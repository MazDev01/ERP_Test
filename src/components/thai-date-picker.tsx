"use client";

/*
 * ตัวเลือกวันที่แบบไทย — ใช้ร่วมทุกช่องวันที่ของหน้า PM และ HR
 * (ตารางงาน จัดคิวงาน งานเข้าใหม่ โฆษณา ข้อมูลพนักงาน คำนวณเงินเดือน)
 *
 * ทำเองแทน input[type=date] เพราะช่องวันที่ของเบราว์เซอร์แสดงตามภาษาของเครื่อง
 * เครื่องที่ตั้งเป็นอังกฤษจะเห็นเดือนอังกฤษและปี ค.ศ. ทั้งที่ทั้งระบบใช้ พ.ศ.
 * ตรงนี้แสดงเป็นวัน/เดือน/ปี พ.ศ. เสมอ ไม่ขึ้นกับเครื่อง
 *
 * min/max ปิดปุ่มวันนอกกรอบตั้งแต่แรก ไม่ต้องมาเตือนทีหลัง
 * วันนอกกรอบยังแสดงอยู่แต่ขีดฆ่า เพื่อให้เห็นว่ากรอบจบตรงไหน ไม่ใช่ปฏิทินขาดหายไปเฉย ๆ
 *
 * ตารางเต็ม 6 สัปดาห์ วันของเดือนข้างเคียงกดเลือกได้เลย (ตามต้นแบบ apply_thaidate.py)
 * เลือกเดือน/ปีแบบกดไล่ลง (ผู้ใช้สั่ง 18 ก.ย. 2569 "เลือกวัน เดือน ปี ให้ง่าย")
 *   กดชื่อเดือนที่หัว → ตารางเลือกเดือน 12 ช่อง · กดปีที่หัว → ตารางเลือกปีทีละ 12 ปี
 * ตัวปฏิทิน (CalendarPanel) แยกออกมาให้กล่องใบลา/โอทีใช้ร่วม จะได้เลือกแบบเดียวกันทั้งระบบ
 * วันนี้มีกรอบบอกเสมอ · แถบล่างมี "วันนี้" และ "ล้าง" (ล้างเฉพาะช่องที่ว่างได้ ส่ง clearable)
 *
 * การเปิด/ปิดคุมจากภายนอก (open + onToggle) เพราะฟอร์มหนึ่งมีหลายช่อง
 * และต้องเปิดได้ทีละอันเท่านั้น ไม่งั้นปฏิทินจะซ้อนทับกัน · กด Esc ปิดได้
 */

import { holidays } from "@/lib/holidays";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { thaiDate, toIsoDate, todayIso } from "@/lib/format";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";

const DW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const MON_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function monthOf(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function ThaiDatePicker({
  value,
  min,
  max,
  open,
  label,
  placeholder = "เลือกวันที่",
  variant = "field",
  clearable = false,
  disabled = false,
  invalid = false,
  id,
  className = "",
  onToggle,
  onPick,
}: {
  value: string;
  min?: string;
  max?: string;
  open: boolean;
  label: string;
  placeholder?: string;
  /** field = ช่องกรอกเต็มความกว้าง · chip = ปุ่มพอดีข้อความ ไว้วางเรียงกันในแถวเดียว */
  variant?: "field" | "chip";
  /** ช่องนี้ปล่อยว่างได้ — แสดงปุ่ม "ล้าง" แล้วส่งค่าว่างกลับไป */
  clearable?: boolean;
  disabled?: boolean;
  /** กรอบแดง — ช่องที่ต้องกรอกแต่ยังว่าง */
  invalid?: boolean;
  /** ให้ label ภายนอกผูกกับปุ่มได้ */
  id?: string;
  /** คลาสเพิ่มของปุ่ม เช่นความสูงในตาราง */
  className?: string;
  onToggle: () => void;
  onPick: (iso: string) => void;
}) {

  /*
   * ปฏิทินลอยบน body แทนการวางซ้อนในกล่อง — อยู่ในตารางที่เลื่อนได้หรือกล่องที่ตัดขอบก็ไม่โดนตัด
   * วางใต้ปุ่ม ถ้าที่ว่างด้านล่างไม่พอก็พลิกขึ้นบน · เลื่อนหน้าหรือย่อขยายจอแล้วตามปุ่มไปด้วย
   */
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const h = 340;
      const up = window.innerHeight - r.bottom < h + 12 && r.top > h + 12;
      setPos({
        top: up ? r.top - h - 5 : r.bottom + 5,
        left: Math.max(8, Math.min(r.left, window.innerWidth - 270)),
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

  return (
    /* หยุดการกดไว้ที่ตัวเอง ฟอร์มจะได้ไม่ปิดตัวเลือกทันทีที่กดเลื่อนเดือน */
    <div
      className="relative"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        /* Esc ปิดแค่ปฏิทิน ไม่ปิดกล่องที่ครอบอยู่ทั้งกล่อง */
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          onToggle();
        }
      }}
    >
      <button
        ref={btnRef}
        id={id}
        type="button"
        aria-label={label}
        aria-expanded={open}
        disabled={disabled}
        /* ปฏิทินสร้างใหม่ทุกครั้งที่เปิด จึงเริ่มที่เดือนของวันที่เลือกไว้เสมอ */
        onClick={onToggle}
        className={
          variant === "chip"
            ? `inline-flex h-[34px] items-center gap-2 rounded-[9px] border px-[13px] text-[12.5px] font-semibold whitespace-nowrap ${
                open
                  ? "border-primary bg-card text-primary"
                  : "border-border bg-muted/40 hover:border-primary hover:text-primary"
              }`
            : `field-control flex items-center justify-between gap-2 text-left font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
                invalid ? "border-destructive bg-[var(--destructive-soft)]" : ""
              } ${className}`
        }
      >
        <span className={`truncate ${value ? "" : "text-muted-foreground"}`}>
          {value ? thaiDate(value) : placeholder}
        </span>
        <CalendarIcon className="size-[13px] flex-none text-muted-foreground" strokeWidth={2} />
      </button>

      {open && pos && !disabled && createPortal(
        <div
          data-thai-date-pop
          className="fixed z-[120] w-[262px] rounded-[14px] border border-border bg-card p-[11px] shadow-[0_22px_46px_-20px_rgba(40,25,60,.42)]"
          style={{ top: pos.top, left: pos.left }}
        >
          <CalendarPanel value={value} min={min} max={max} clearable={clearable} onPick={onPick} />
        </div>,
        document.body,
      )}
    </div>
  );
}

/**
 * ช่องวันที่แบบไทยที่เปิด/ปิดปฏิทินเอง — ใช้แทน input[type=date] ได้ตรง ๆ
 * กดนอกช่องหรือนอกปฏิทินแล้วปิดเอง
 */
export function DateField({
  value,
  onChange,
  label,
  min,
  max,
  placeholder,
  clearable,
  disabled,
  invalid,
  id,
  className,
  variant,
}: {
  value: string;
  onChange: (iso: string) => void;
  label: string;
  min?: string;
  max?: string;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
  variant?: "field" | "chip";
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element;
      if (box.current?.contains(t) || t.closest?.("[data-thai-date-pop]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <span ref={box} className="block">
      <ThaiDatePicker
        value={value}
        min={min}
        max={max}
        open={open}
        label={label}
        placeholder={placeholder}
        clearable={clearable}
        disabled={disabled}
        invalid={invalid}
        id={id}
        className={className}
        variant={variant}
        onToggle={() => setOpen((v) => !v)}
        onPick={(iso) => {
          onChange(iso);
          setOpen(false);
        }}
      />
    </span>
  );
}

const MON_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/**
 * ตัวปฏิทินเลือกวันที่ — สามชั้น วัน → เดือน → ปี
 * กดหัวปฏิทินเพื่อขึ้นไปเลือกเดือนหรือปี เลือกแล้วลงกลับมาที่วันให้เอง
 * offDay = วันที่อยากให้เป็นสีแดง (ค่าตั้งต้นคือวันหยุดบริษัท)
 */
export function CalendarPanel({
  value,
  min,
  max,
  clearable = false,
  offDay,
  onPick,
}: {
  value: string;
  min?: string;
  max?: string;
  clearable?: boolean;
  offDay?: (iso: string) => boolean;
  onPick: (iso: string) => void;
}) {
  const today = todayIso();
  const [view, setView] = useState(() => monthOf(value || min || today));
  const [mode, setMode] = useState<"day" | "month" | "year">("day");
  const y = view.getFullYear();
  const m = view.getMonth();
  const lead = new Date(y, m, 1).getDay();
  const outside = (iso: string) => Boolean(min && iso < min) || Boolean(max && iso > max);
  const monthOut = (yy: number, mm: number) =>
    Boolean(min && toIsoDate(new Date(yy, mm + 1, 0)) < min) ||
    Boolean(max && toIsoDate(new Date(yy, mm, 1)) > max);
  const yearOut = (yy: number) => Boolean(min && `${yy}-12-31` < min) || Boolean(max && `${yy}-01-01` > max);
  const decade = Math.floor(y / 12) * 12;
  const selY = value ? Number(value.slice(0, 4)) : null;
  const selM = value ? Number(value.slice(5, 7)) - 1 : null;
  const ty = Number(today.slice(0, 4));
  const tm = Number(today.slice(5, 7)) - 1;

  function step(n: number) {
    if (mode === "day") setView(new Date(y, m + n, 1));
    else if (mode === "month") setView(new Date(y + n, m, 1));
    else setView(new Date(y + n * 12, m, 1));
  }

  const cell = (on: boolean, now: boolean, out: boolean) =>
    `num rounded-[9px] text-[12.5px] ${
      on
        ? "bg-primary font-bold text-primary-foreground"
        : out
          ? "cursor-not-allowed opacity-30"
          : `hover:bg-muted ${now ? "font-bold text-primary ring-[1.5px] ring-primary ring-inset" : ""}`
    }`;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          className="iconbtn glass-thin"
          style={{ width: 28, height: 28 }}
          aria-label={mode === "day" ? "เดือนก่อนหน้า" : mode === "month" ? "ปีก่อนหน้า" : "ช่วงปีก่อนหน้า"}
          onClick={() => step(-1)}
        >
          <ChevronLeftIcon className="size-[13px]" strokeWidth={2.4} />
        </button>
        <span className="flex items-center gap-0.5 text-[13.5px] font-bold">
          {mode === "day" && (
            <button
              type="button"
              aria-label="เลือกเดือน"
              className="rounded-[7px] px-1.5 py-0.5 hover:bg-muted"
              onClick={() => setMode("month")}
            >
              {MON_FULL[m]}
            </button>
          )}
          {mode !== "year" ? (
            <button
              type="button"
              aria-label="เลือกปี"
              className="num rounded-[7px] px-1.5 py-0.5 hover:bg-muted"
              onClick={() => setMode("year")}
            >
              {y + 543}
            </button>
          ) : (
            <span className="num px-1.5">
              {decade + 543} – {decade + 11 + 543}
            </span>
          )}
        </span>
        <button
          type="button"
          className="iconbtn glass-thin"
          style={{ width: 28, height: 28 }}
          aria-label={mode === "day" ? "เดือนถัดไป" : mode === "month" ? "ปีถัดไป" : "ช่วงปีถัดไป"}
          onClick={() => step(1)}
        >
          <ChevronRightIcon className="size-[13px]" strokeWidth={2.4} />
        </button>
      </div>

      {mode === "day" && (
        <div className="grid grid-cols-7 gap-0.5">
          {DW.map((d) => (
            <span key={d} className="py-[3px] text-center text-[10px] font-bold text-muted-foreground">
              {d}
            </span>
          ))}
          {Array.from({ length: 42 }, (_, i) => {
            const d = new Date(y, m, 1 - lead + i);
            const iso = toIsoDate(d);
            const on = iso === value;
            const out = outside(iso);
            const other = d.getMonth() !== m;
            const now = iso === today;
            const weekend = d.getDay() === 0 || d.getDay() === 6;
            /* วันหยุดบริษัทจากหน้าผู้ดูแลระบบ — ตัวเลขสีแดง ชี้ค้างเห็นชื่อวันหยุด */
            const holiday = holidays()[iso];
            const red = offDay ? offDay(iso) : Boolean(holiday);
            return (
              <button
                key={iso}
                type="button"
                disabled={out}
                aria-pressed={on}
                aria-label={holiday ? `${thaiDate(iso)} ${holiday}` : thaiDate(iso)}
                title={out ? "นอกกรอบที่เลือกได้" : holiday ? holiday : now ? "วันนี้" : undefined}
                onClick={() => onPick(iso)}
                className={`h-[31px] ${cell(on, now, out)} ${out ? "line-through" : ""} ${
                  !on && !out && !now && red && !other ? "font-semibold text-destructive" : ""
                } ${!on && !now && !red && (weekend || other) ? "text-muted-foreground" : ""} ${
                  other && !on ? "opacity-50" : ""
                }`}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      )}

      {mode === "month" && (
        <div className="grid grid-cols-3 gap-1.5 py-1">
          {MON_SHORT.map((label, mm) => {
            const out = monthOut(y, mm);
            return (
              <button
                key={label}
                type="button"
                disabled={out}
                aria-label={`${MON_FULL[mm]} ${y + 543}`}
                onClick={() => {
                  setView(new Date(y, mm, 1));
                  setMode("day");
                }}
                className={`h-[40px] ${cell(selY === y && selM === mm, ty === y && tm === mm, out)}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {mode === "year" && (
        <div className="grid grid-cols-3 gap-1.5 py-1">
          {Array.from({ length: 12 }, (_, i) => decade + i).map((yy) => {
            const out = yearOut(yy);
            return (
              <button
                key={yy}
                type="button"
                disabled={out}
                onClick={() => {
                  setView(new Date(yy, m, 1));
                  setMode("month");
                }}
                className={`h-[40px] ${cell(selY === yy, ty === yy, out)}`}
              >
                {yy + 543}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        <button
          type="button"
          disabled={outside(today)}
          title={outside(today) ? "วันนี้อยู่นอกกรอบที่เลือกได้" : undefined}
          onClick={() => onPick(today)}
          className="rounded-[7px] px-1.5 py-1 text-xs font-semibold text-primary hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          วันนี้
        </button>
        {mode !== "day" ? (
          <button
            type="button"
            onClick={() => setMode("day")}
            className="rounded-[7px] px-1.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted"
          >
            กลับไปเลือกวัน
          </button>
        ) : (
          clearable && (
            <button
              type="button"
              disabled={!value}
              onClick={() => onPick("")}
              className="rounded-[7px] px-1.5 py-1 text-xs font-semibold text-primary hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              ล้าง
            </button>
          )
        )}
      </div>
    </div>
  );
}

/**
 * ช่องเลือกรอบเดือน (yyyy-mm) แบบไทย — แทน input[type=month] ที่แสดงตามภาษาของเครื่อง
 * กดแล้วเด้งตาราง 12 เดือน ‹ › เลื่อนปี · ปีเป็น พ.ศ. เสมอ
 */
export function MonthField({
  value,
  onChange,
  label,
  id,
}: {
  value: string;
  onChange: (ym: string) => void;
  label: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number((value || todayIso()).slice(0, 4)));
  const box = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const today = todayIso().slice(0, 7);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element;
      if (box.current?.contains(t) || t.closest?.("[data-thai-date-pop]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const h = 230;
    const up = window.innerHeight - r.bottom < h + 12 && r.top > h + 12;
    setPos({ top: up ? r.top - h - 5 : r.bottom + 5, left: Math.max(8, Math.min(r.left, window.innerWidth - 270)) });
  }, [open]);

  const [vy, vm] = value ? [Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1] : [0, -1];

  return (
    <span ref={box} className="block" onKeyDown={(e) => e.key === "Escape" && open && (e.stopPropagation(), setOpen(false))}>
      <button
        ref={btn}
        id={id}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => {
          setYear(Number((value || todayIso()).slice(0, 4)));
          setOpen((v) => !v);
        }}
        className="field-control flex items-center justify-between gap-2 text-left font-semibold"
      >
        <span className={value ? "" : "text-muted-foreground"}>{value ? `${MON_FULL[vm]} ${vy + 543}` : "เลือกเดือน"}</span>
        <CalendarIcon className="size-[13px] flex-none text-muted-foreground" strokeWidth={2} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            data-thai-date-pop
            className="fixed z-[120] w-[262px] rounded-[14px] border border-border bg-card p-[11px] shadow-[0_22px_46px_-20px_rgba(40,25,60,.42)]"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <button type="button" className="iconbtn glass-thin" style={{ width: 28, height: 28 }} aria-label="ปีก่อนหน้า" onClick={() => setYear(year - 1)}>
                <ChevronLeftIcon className="size-[13px]" strokeWidth={2.4} />
              </button>
              <b className="num text-[13.5px]">{year + 543}</b>
              <button type="button" className="iconbtn glass-thin" style={{ width: 28, height: 28 }} aria-label="ปีถัดไป" onClick={() => setYear(year + 1)}>
                <ChevronRightIcon className="size-[13px]" strokeWidth={2.4} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {MON_SHORT.map((m, i) => {
                const ym = `${year}-${String(i + 1).padStart(2, "0")}`;
                const on = vy === year && vm === i;
                return (
                  <button
                    key={m}
                    type="button"
                    aria-label={`${MON_FULL[i]} ${year + 543}`}
                    onClick={() => {
                      onChange(ym);
                      setOpen(false);
                    }}
                    className={`num h-[40px] rounded-[9px] text-[12.5px] ${
                      on
                        ? "bg-primary font-bold text-primary-foreground"
                        : `hover:bg-muted ${ym === today ? "font-bold text-primary ring-[1.5px] ring-primary ring-inset" : ""}`
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}

