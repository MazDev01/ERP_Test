"use client";

/*
 * แถบขั้นตอนของรอบเงินเดือน (ตามต้นแบบ dose-erp-maz/hr-payroll.html — .steps)
 *
 * สี่หน้านี้เดินต่อกันเป็นสาย ตรวจเวลา → คำนวณเงินเดือน → ออกสลิป → ประวัติรอบจ่าย
 * เมนูข้างจึงมีรายการเดียวคือ "รอบเงินเดือน" แล้วข้ามขั้นด้วยแถบนี้
 * เดือนที่เลือกส่งต่อกันทาง ?m= จะได้ไม่ต้องเลือกเดือนใหม่ทุกครั้งที่ข้ามขั้น
 * กลุ่มที่ดูอยู่ส่งต่อกันทาง ?g=month|daily — คือเมนูย่อย "พนักงาน" | "ทดลองงาน" ของ "รอบเงินเดือน"
 *   แต่ละหน้าแสดงเฉพาะกลุ่มนั้น ไม่มีแท็บสลับกลุ่มในหน้าแล้ว (ผู้ใช้สั่ง 5 ต.ค. 2569)
 *
 * ไฟล์นี้รวมชิ้นส่วนมือถือที่สี่หน้าใช้ร่วมกันด้วย (ต้นแบบ hr-*.html ชุด m-pay-*)
 * หัวหน้าที่มีชื่อเดือน + ปุ่มปฏิทิน · แผ่นปฏิทินเลือกรอบ · สี่เหลี่ยมเลือกกลุ่ม · การ์ดรายคน
 * ทั้งหมดแสดงเฉพาะจอแคบกว่า md (สไตล์อยู่ที่ styles/mobile/hr-pay.css) จอคอมเหมือนเดิมทุกอย่าง
 */

import "@/styles/mobile/hr-pay.css";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { thaiMonth } from "@/lib/format";
import { hrCycle, type Cycle } from "@/lib/hr-data";
import { CalendarIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { DateField } from "./thai-date-picker";

const STEPS = [
  { href: "/hr/timesheet", label: "สรุปเวลาทำงาน" },
  { href: "/hr/payroll", label: "คำนวณเงินเดือน" },
  { href: "/hr/payslip", label: "ออกสลิปเงินเดือน" },
  /* ชื่อขั้นเต็ม "ประวัติรอบจ่าย" (ผู้ใช้สั่ง 6 ต.ค. 2569) */
  { href: "/hr/cycles", label: "ประวัติรอบจ่าย" },
];

/** กลุ่มที่เปิดอยู่ — ค่าของ ?g= (ต้นแบบเดิมใช้ #month / #daily เฉพาะมือถือ) */
export type PayKey = "month" | "daily";

/**
 * ที่อยู่ของขั้นในรอบเงินเดือน พร้อมกลุ่มและเดือน — ลิงก์ข้ามขั้นทุกอันสร้างจากตรงนี้ กลุ่มจะได้ไม่หลุด
 * กลุ่มทดลองงานส่งช่วงวันของรอบจ่ายรายวันทาง ?r=จาก~ถึง แทน ?m= (ผู้ใช้สั่ง 6 ต.ค. 2569)
 */
export function payHref(path: string, group: PayKey = "month", month?: string | null, range?: Cycle | null) {
  if (group === "daily" && range) return `${path}?g=daily&r=${range.from}~${range.to}`;
  return `${path}?g=${group}${month ? `&m=${month}` : ""}`;
}

/**
 * ขั้นตอนบนมือถือ — ชิปเลื่อนข้างได้ (hr-pay.css .hp-steps) จอกว้างใช้ HrStepTabs ที่หัวแผงตารางแทน
 */
export function HrSteps({
  month,
  range,
  group,
  className = "",
}: {
  month?: string;
  /** ช่วงวันของรอบจ่ายรายวัน (กลุ่มทดลองงาน) */
  range?: Cycle | null;
  /** กลุ่มที่เปิดอยู่ ต่อท้ายลิงก์เป็น ?g= ข้ามขั้นแล้วยังอยู่กลุ่มเดิม */
  group: PayKey;
  className?: string;
}) {
  const here = usePathname();
  return (
    <nav
      aria-label="ขั้นตอนของรอบเงินเดือน"
      className={`hp-steps flex w-fit max-w-full overflow-x-auto rounded-[12px] border border-border bg-muted/50 ${className}`}
    >
      {STEPS.map((s) => {
        const on = here === s.href;
        return (
          <Link
            key={s.href}
            href={payHref(s.href, group, month, range)}
            aria-current={on ? "page" : undefined}
            className={`flex h-11 flex-none items-center px-4 text-[14px] font-semibold whitespace-nowrap transition-colors sm:px-6 ${
              on ? "on bg-card text-primary" : "text-muted-foreground hover:text-primary"
            } ${s.href === "/hr/timesheet" ? "" : "border-l border-border"}`}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * ขั้นตอนเป็นแท็บขีดเส้นใต้ที่หัวแผงตาราง แบบเดียวกับแท็บหน้าตั้งค่า (ผู้ใช้สั่ง 6 ต.ค. 2569)
 * วางเป็นลูกตัวแรกของ .strip ใน section.panel · มือถือซ่อน (.hp-page .strip .tabs) ใช้ HrSteps แทน
 */
export function HrStepTabs({
  month,
  range,
  group,
}: {
  month?: string;
  range?: Cycle | null;
  group: PayKey;
}) {
  const here = usePathname();
  return (
    <nav className="tabs hp-tabs" aria-label="ขั้นตอนของรอบเงินเดือน">
      {STEPS.map((s) => {
        const on = here === s.href;
        return (
          <Link
            key={s.href}
            href={payHref(s.href, group, month, range)}
            aria-current={on ? "page" : undefined}
            className={on ? "on" : ""}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * ช่วงวันที่ส่งมาทาง ?r=จาก~ถึง (กลุ่มทดลองงาน) — รูปแบบไม่ถูกคืน null
 * หน้าที่เรียกต้องมี Suspense คร่อมที่ page.tsx เพราะ useSearchParams
 */
export function useUrlRange(): Cycle | null {
  const r = useSearchParams().get("r") ?? "";
  const m = /^(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$/.exec(r);
  if (!m) return null;
  return m[1] <= m[2] ? { from: m[1], to: m[2] } : { from: m[2], to: m[1] };
}

/**
 * ตัวเลือกช่วงวันของรอบจ่ายรายวัน (เริ่มต้น – สิ้นสุด) (ผู้ใช้สั่ง 6 ต.ค. 2569)
 * วันเดียวก็ได้ หลายวันก็ได้ · เลือกกลับด้านสลับให้เอง · max = วันสุดท้ายที่เลือกได้ (ปกติคือวันนี้)
 */
export function DayRangePicker({
  value,
  max,
  onChange,
}: {
  value: Cycle;
  max?: string;
  onChange: (c: Cycle) => void;
}) {
  const set = (from: string, to: string) => onChange(from > to ? { from: to, to: from } : { from, to });
  return (
    <div className="hp-range flex flex-wrap items-center gap-2">
      <span className="text-[12.5px] font-semibold text-muted-foreground">เริ่มต้น</span>
      <DateField
        variant="chip"
        label="วันที่เริ่มต้นของรอบจ่าย"
        value={value.from}
        max={max}
        onChange={(d) => d && set(d, value.to)}
      />
      <span aria-hidden className="text-muted-foreground">
        –
      </span>
      <span className="text-[12.5px] font-semibold text-muted-foreground">สิ้นสุด</span>
      <DateField
        variant="chip"
        label="วันที่สิ้นสุดของรอบจ่าย"
        value={value.to}
        max={max}
        onChange={(d) => d && set(value.from, d)}
      />
    </div>
  );
}

/**
 * เดือนที่ส่งมาทาง ?m= จากขั้นก่อนหน้า (ต้นแบบ urlMonth) — คืนค่าเฉพาะเดือนที่มีรอบจริง ไม่งั้นคืน ""
 * หน้าที่เรียกต้องมี Suspense คร่อมที่ page.tsx เพราะ useSearchParams
 */
export function useUrlMonth(months: string[]) {
  const m = useSearchParams().get("m") ?? "";
  return /^\d{4}-\d{2}$/.test(m) && months.includes(m) ? m : "";
}

// ─── มือถือ: เลือกกลุ่มก่อนเข้ารายการ ───────────────────────────────

/**
 * กลุ่มที่เปิดอยู่ อ่านจาก ?g= ทุกขนาดจอ (ผู้ใช้สั่ง 5 ต.ค. 2569 แยกเป็นเมนูย่อย "พนักงาน" | "ทดลองงาน")
 * group  — กลุ่มที่ใช้แสดงข้อมูล ไม่มี ?g= ถือเป็นรายเดือน
 * picked — ค่าใน URL จริง · null = มือถือขึ้นสี่เหลี่ยมเลือกกลุ่ม (ต้นแบบ m-pay-pick) เช่น เข้าจากแถบล่าง
 *          จอคอมไม่มีสี่เหลี่ยม (hr-pay.css) จึงเห็นกลุ่มรายเดือนตามปกติ
 * หน้าที่เรียกต้องมี Suspense คร่อมที่ page.tsx เพราะ useSearchParams
 */
export function usePayGroup(): {
  group: PayKey;
  picked: PayKey | null;
  open: (k: PayKey) => void;
  home: () => void;
} {
  const q = useSearchParams();
  const here = usePathname();
  const router = useRouter();
  const raw = q.get("g");
  const picked: PayKey | null = raw === "month" || raw === "daily" ? raw : null;
  const to = (k: PayKey | null) => {
    const p = new URLSearchParams(q.toString());
    if (k) p.set("g", k);
    else p.delete("g");
    const s = p.toString();
    return s ? `${here}?${s}` : here;
  };
  return {
    group: picked ?? "month",
    picked,
    open(k) {
      router.push(to(k));
      window.scrollTo(0, 0);
    },
    home() {
      router.replace(to(null));
    },
  };
}

/** สี่เหลี่ยมใหญ่สองช่อง "พนักงาน" | "ทดลองงาน" เต็มความสูงจอ (ต้นแบบ m-pay-tiles) */
export function PayTiles({ onOpen }: { onOpen: (k: PayKey) => void }) {
  return (
    <div className="hp-tiles" role="list">
      <button type="button" role="listitem" className="hp-tile" onClick={() => onOpen("month")}>
        <b>พนักงานทั่วไป</b>
      </button>
      <button type="button" role="listitem" className="hp-tile" onClick={() => onOpen("daily")}>
        <b>ทดลองงาน</b>
      </button>
    </div>
  );
}

/**
 * หัวของหน้าบนมือถือ (ต้นแบบ m-pay-head) — ชื่อเดือนอยู่กลาง ปุ่มปฏิทินกลมขวา
 * ปุ่มย้อนกลับซ้ายขึ้นเฉพาะตอนอยู่ในกลุ่ม พากลับไปหน้าเลือกกลุ่ม (ปุ่มย้อนกลับของแถบบนพากลับหน้าหลัก)
 */
export function PayHead({
  title,
  onBack,
  onCal,
  calLabel = "เลือกรอบเงินเดือน",
}: {
  title: string;
  onBack?: () => void;
  onCal?: () => void;
  calLabel?: string;
}) {
  return (
    <div className="hp-head">
      {onBack ? (
        <button type="button" className="hp-round" aria-label="กลับไปเลือกกลุ่ม" onClick={onBack}>
          <ChevronLeftIcon className="size-5" strokeWidth={2.4} />
        </button>
      ) : (
        <span aria-hidden className="hp-round-pad" />
      )}
      <h2>{title}</h2>
      {onCal ? (
        <button type="button" className="hp-round" aria-label={calLabel} aria-haspopup="dialog" onClick={onCal}>
          <CalendarIcon className="size-5" strokeWidth={2.2} />
        </button>
      ) : (
        <span aria-hidden className="hp-round-pad" />
      )}
    </div>
  );
}

// ─── มือถือ: แผ่นปฏิทินเลือกรอบ ─────────────────────────────────────

const WEEK = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

/**
 * แผ่นปฏิทินเลือกรอบ/เดือน (ต้นแบบ m-pay-sheet)
 * mode "cycle" — แตะวันไหนก็ได้ ได้รอบที่วันนั้นอยู่ (ช่วงอ่านจาก hrCycle ตามวันตัดรอบที่ตั้งไว้) ช่วงของรอบเป็นแถบชมพู
 * mode "month" — แตะวันไหนก็ได้ในเดือน ได้เดือนนั้น
 * วันที่ไม่อยู่ในรอบที่มีในระบบกดไม่ได้
 */
export function PayCalendar({
  months,
  selected,
  mode,
  today,
  onPick,
  onClose,
}: {
  months: string[];
  selected?: string;
  mode: "cycle" | "month";
  today: string;
  onPick: (month: string) => void;
  onClose: () => void;
}) {
  const ranges = months.map((m) => ({ m, ...hrCycle(m) }));
  const cycleOf = (iso: string) =>
    mode === "cycle"
      ? ranges.find((r) => iso >= r.from && iso <= r.to)?.m
      : months.includes(iso.slice(0, 7))
        ? iso.slice(0, 7)
        : undefined;
  const sel = selected ? ranges.find((r) => r.m === selected) : undefined;
  const [ym, setYm] = useState<[number, number]>(() => {
    const base = selected || months[months.length - 1] || today.slice(0, 7);
    const key = mode === "cycle" ? hrCycle(base).to : `${base}-01`;
    const [y, m] = key.split("-").map(Number);
    return [y, m - 1];
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [y, m] = ym;
  const first = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const shift = (d: number) => {
    const x = new Date(y, m + d, 1);
    setYm([x.getFullYear(), x.getMonth()]);
  };

  const cells: ReactNode[] = [];
  for (let i = 0; i < first; i++) cells.push(<span key={`b${i}`} />);
  for (let d = 1; d <= dim; d++) {
    const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
    const target = cycleOf(iso);
    const wd = new Date(y, m, d).getDay();
    const inr = selected
      ? mode === "cycle"
        ? Boolean(sel && iso >= sel.from && iso <= sel.to)
        : iso.slice(0, 7) === selected
      : false;
    const isFirst = inr && (d === 1 || iso === sel?.from || wd === 0);
    const isLast = inr && (d === dim || iso === sel?.to || wd === 6);
    cells.push(
      <button
        key={iso}
        type="button"
        disabled={!target}
        className={`${inr ? "inr" : ""} ${isFirst ? "first" : ""} ${isLast ? "last" : ""} ${iso === today ? "today" : ""}`}
        onClick={() => {
          if (!target) return;
          onPick(target);
          onClose();
        }}
      >
        <b>{d}</b>
      </button>,
    );
  }

  return createPortal(
    <div
      className="hp-cal"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "cycle" ? "เลือกรอบเงินเดือน" : "เลือกเดือน"}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="hp-cal-panel">
        <div className="hp-cal-grab" />
        <div className="hp-cal-head">
          <button type="button" aria-label="เดือนก่อนหน้า" onClick={() => shift(-1)}>
            <ChevronLeftIcon className="size-4" strokeWidth={2.4} />
          </button>
          <h2>{thaiMonth(`${y}-${pad(m + 1)}`)}</h2>
          <button type="button" aria-label="เดือนถัดไป" onClick={() => shift(1)}>
            <ChevronRightIcon className="size-4" strokeWidth={2.4} />
          </button>
        </div>
        <div className="hp-cal-wk" aria-hidden>
          {WEEK.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="hp-cal-grid">{cells}</div>
      </div>
    </div>,
    document.body,
  );
}

// ─── มือถือ: การ์ดรายคน ─────────────────────────────────────────────

/** แถวในการ์ด ชื่อซ้าย ค่าขวา — muted = ค่าศูนย์/ว่าง ให้จางลง */
export type PayCardRow = { label: ReactNode; value: ReactNode; tone?: string; muted?: boolean };

/** รายการการ์ดของกลุ่ม (ต้นแบบ .panel tbody บนมือถือ) */
export function PayList({ children, empty }: { children?: ReactNode; empty?: ReactNode }) {
  return <div className="hp-list">{empty ? <div className="hp-empty">{empty}</div> : children}</div>;
}

/**
 * การ์ดของหนึ่งคน (ต้นแบบ pay-rows / ts-rows) — ชื่อ 16px บนสุด ตัวเลขเป็นแถวชื่อซ้ายค่าขวา
 * ยอดสุทธิเป็นแถวพื้นชมพูตัวใหญ่ ปุ่มไอคอนมุมขวาบน
 * collapsed — การ์ดพับ (หน้าตรวจเวลา) ซ่อนแถวตัวเลข เหลือชื่อ ป้าย และคำว่าแตะเพื่อดูรายละเอียด
 */
export function PayCard({
  title,
  sub,
  corner,
  rows,
  net,
  status,
  onOpen,
  openLabel,
  collapsed,
  children,
}: {
  title: ReactNode;
  sub?: ReactNode;
  /** มุมขวาบน — ป้ายสถานะและ/หรือปุ่มไอคอน */
  corner?: ReactNode;
  rows?: PayCardRow[];
  net?: { label: string; value: ReactNode };
  /** แถวสถานะท้ายการ์ด ชื่อซ้ายป้ายขวา */
  status?: { label: string; value: ReactNode };
  onOpen?: () => void;
  openLabel?: string;
  /** undefined = การ์ดธรรมดา · true/false = การ์ดพับได้ (พับอยู่ / กางแล้ว) */
  collapsed?: boolean;
  children?: ReactNode;
}) {
  const open = onOpen
    ? {
        role: "button" as const,
        tabIndex: 0,
        "aria-label": openLabel,
        "aria-expanded": collapsed === undefined ? undefined : !collapsed,
        onClick: onOpen,
        onKeyDown: (ev: React.KeyboardEvent) => {
          if (ev.target !== ev.currentTarget) return;
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            onOpen();
          }
        },
      }
    : {};
  return (
    <div {...open} className={`hp-card ${onOpen ? "hp-tap" : ""}`}>
      <div className="hp-card-head">
        <div className="min-w-0 flex-1">
          <b>{title}</b>
          {sub && <em>{sub}</em>}
          {collapsed !== undefined && (
            <span className={`hp-hint ${collapsed ? "" : "up"}`} aria-hidden>
              {collapsed ? "แตะเพื่อดูรายละเอียด" : "ซ่อนรายละเอียด"}
              <ChevronDownIcon className="size-3.5" strokeWidth={2.4} />
            </span>
          )}
        </div>
        {corner && (
          /* ปุ่มที่มุมไม่ส่งการแตะต่อไปที่ตัวการ์ด */
          <div
            className="hp-corner"
            onClick={(ev) => ev.stopPropagation()}
            onKeyDown={(ev) => ev.stopPropagation()}
          >
            {corner}
          </div>
        )}
      </div>
      {!collapsed && rows && rows.length > 0 && (
        <dl className="hp-rows">
          {rows.map((r, i) => (
            <div key={i}>
              <dt>{r.label}</dt>
              <dd className={`num ${r.muted ? "hp-muted" : ""} ${r.tone ?? ""}`}>{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {!collapsed && net && (
        <div className="hp-net">
          <span>{net.label}</span>
          <b className="num">{net.value}</b>
        </div>
      )}
      {!collapsed && status && (
        <div className="hp-st">
          <span>{status.label}</span>
          {status.value}
        </div>
      )}
      {!collapsed && children}
    </div>
  );
}

/** ปุ่มไอคอน 36px มุมขวาบนของการ์ด */
export function PayIconBtn({
  label,
  onClick,
  disabled,
  title,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="hp-iact"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={(ev) => {
        ev.stopPropagation();
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

/**
 * ตัวกรองเดือนแบบ ‹ เดือน › ชุดเดียวทั้งสามขั้นของรอบเงินเดือน (ผู้ใช้สั่ง 6 ต.ค. 2569)
 * ไม่มีป้ายเหนือกรอบ · เลื่อนได้เฉพาะเดือนที่มีรอบในระบบ เดือนที่ยังไม่มีข้อมูลกดไม่ไป
 * months เรียงจากเก่าไปใหม่
 */
export function MonthStepper({
  months,
  value,
  onChange,
}: {
  months: string[];
  value: string;
  onChange: (m: string) => void;
}) {
  const i = months.indexOf(value);
  return (
    <div className="mo glass-thin">
      <button type="button" aria-label="เดือนก่อนหน้า" disabled={i <= 0} onClick={() => i > 0 && onChange(months[i - 1])}>
        <ChevronLeftIcon className="size-[15px]" strokeWidth={2.4} />
      </button>
      <span>{thaiMonth(value)}</span>
      <button
        type="button"
        aria-label="เดือนถัดไป"
        disabled={i < 0 || i >= months.length - 1}
        onClick={() => i >= 0 && i < months.length - 1 && onChange(months[i + 1])}
      >
        <ChevronRightIcon className="size-[15px]" strokeWidth={2.4} />
      </button>
    </div>
  );
}

/**
 * ตัวกรองปีแบบ ‹ ปี › ของหน้าประวัติรอบ (ผู้ใช้สั่ง 6 ต.ค. 2569) — หน้าตาเดียวกับ MonthStepper
 * years เป็นปี ค.ศ. เรียงจากเก่าไปใหม่ แสดงเป็นปี พ.ศ.
 */
export function YearStepper({
  years,
  value,
  onChange,
}: {
  years: number[];
  value: number;
  onChange: (y: number) => void;
}) {
  const i = years.indexOf(value);
  return (
    <div className="mo glass-thin">
      <button type="button" aria-label="ปีก่อนหน้า" disabled={i <= 0} onClick={() => i > 0 && onChange(years[i - 1])}>
        <ChevronLeftIcon className="size-[15px]" strokeWidth={2.4} />
      </button>
      <span>ปี {value + 543}</span>
      <button
        type="button"
        aria-label="ปีถัดไป"
        disabled={i < 0 || i >= years.length - 1}
        onClick={() => i >= 0 && i < years.length - 1 && onChange(years[i + 1])}
      >
        <ChevronRightIcon className="size-[15px]" strokeWidth={2.4} />
      </button>
    </div>
  );
}
