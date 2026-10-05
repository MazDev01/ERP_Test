"use client";

import Link from "next/link";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { bkkNow } from "@/lib/format";
import { lockScroll } from "@/lib/scroll-lock";
import "@/styles/mobile/ot.css";
import {
  OT_KIND,
  otKindOf,
  paidHours,
  type OtKind,
  type OtRecord,
  type OtStatus,
} from "@/lib/ot-data";
import { cancelOtRequest, useOtRecords } from "@/lib/ot-store";
import {
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  PlusIcon,
} from "./icons";
import { ApproverNote } from "./approver-note";
import { OtDialog } from "./ot-dialog";

const PER_PAGE = 10;

const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const TH_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

const STATUS_CLASS: Record<OtStatus, string> = {
  รออนุมัติ: "t-early",
  อนุมัติแล้ว: "t-ok",
  ไม่อนุมัติ: "t-late",
  ยกเลิก: "t-miss",
};

const TABS: { key: "all" | OtStatus; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "รออนุมัติ", label: "รออนุมัติ" },
  { key: "อนุมัติแล้ว", label: "อนุมัติแล้ว" },
  { key: "ไม่อนุมัติ", label: "ไม่อนุมัติ" },
  { key: "ยกเลิก", label: "ยกเลิก" },
];

const TH_WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

export function OtPage() {
  const records = useOtRecords();
  /* ลิงก์จากแจ้งเตือน LINE — /ot?find=OT-2569-0123 เปิดเดือนของคำขอนั้นแล้วไฮไลต์ให้ */
  const findId = useSearchParams().get("find") ?? "";
  const found = records.find((r) => r.id === findId);
  const [view, setView] = useState(() => {
    if (!found) return new Date(2026, 8, 1);
    const [y, m] = found.date.split("-").map(Number);
    return new Date(y, m - 1, 1);
  });
  const [tab, setTab] = useState<"all" | OtStatus>("all");
  const [page, setPage] = useState(1);
  /* หน้าบันทึกเวลาส่งลิงก์ ?new=1&date=... มาเปิดฟอร์มพร้อมวันที่ให้เลย */
  const params = useSearchParams();
  const presetDate = params.get("date") ?? undefined;
  const [dialogOpen, setDialogOpen] = useState(params.get("new") !== null);
  const [flash, setFlash] = useState<string | null>(null);
  /* มือถือ — กรองรายการเหลือวันเดียวจากแผ่นปฏิทิน (null = ทั้งเดือน) */
  const [day, setDay] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const inMonth = useMemo(() => {
    const prefix = `${view.getFullYear()}-${pad(view.getMonth() + 1)}`;
    return records.filter((r) => r.date.startsWith(prefix));
  }, [records, view]);

  const scoped = useMemo(() => {
    const list = tab === "all" ? inMonth : inMonth.filter((r) => r.status === tab);
    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  }, [inMonth, tab]);

  const maxPage = Math.max(1, Math.ceil(scoped.length / PER_PAGE));
  const safePage = Math.min(page, maxPage);
  const from = (safePage - 1) * PER_PAGE;
  const list = scoped.slice(from, from + PER_PAGE);
  const totalPaid = inMonth.reduce((sum, r) => sum + paidHours(r), 0);

  /* มือถือ — ฐานของชิปและจำนวนคำขอ คือเดือนที่เลือก หรือวันเดียวถ้ากรองวันไว้ · แสดงทั้งหมดไม่แบ่งหน้า */
  const mBase = day ? inMonth.filter((r) => r.date === day) : inMonth;
  const mList = (tab === "all" ? [...mBase] : mBase.filter((r) => r.status === tab)).sort(
    (a, b) => b.date.localeCompare(a.date) || b.submittedAt.localeCompare(a.submittedAt),
  );

  function hoursOfKind(kind: OtKind) {
    return inMonth
      .filter((r) => otKindOf(r.date) === kind)
      .reduce((sum, r) => sum + paidHours(r), 0);
  }

  return (
    <>
    {/* จอคอม (md ขึ้นไป) — หน้าตาเดิมทุกอย่าง · มือถืออยู่ในกล่อง .m-ot ข้างล่าง */}
    <div className="hidden space-y-4 md:block">
      <div className="bar">
        <div>
          <h1>โอทีของฉัน</h1>
          <ApproverNote kind="ot" />
        </div>
        <div className="tools w-full flex-wrap sm:w-auto">
          <div className="mo glass-thin w-full justify-center sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1));
                setPage(1);
              }}
              aria-label="เดือนก่อนหน้า"
            >
              <ChevronLeftIcon className="size-[15px]" strokeWidth={2.4} />
            </button>
            <span className="min-w-[150px]">
              {TH_MONTHS[view.getMonth()]} {view.getFullYear() + 543}
            </span>
            <button
              type="button"
              onClick={() => {
                setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1));
                setPage(1);
              }}
              aria-label="เดือนถัดไป"
            >
              <ChevronRightIcon className="size-[15px]" strokeWidth={2.4} />
            </button>
          </div>
          <button
            type="button"
            className="btn solid btn-solid btn-block-mobile shrink-0"
            onClick={() => setDialogOpen(true)}
          >
            <PlusIcon className="size-[15px]" strokeWidth={2.2} />
            ขอทำล่วงเวลา
          </button>
        </div>
      </div>

      {flash && (
        <p className="flex items-center gap-2.5 rounded-xl border border-[var(--success)]/20 bg-[var(--success-soft)] px-4 py-3 text-sm font-medium text-[var(--success)]">
          <CheckIcon className="size-4 shrink-0" strokeWidth={2.4} />
          {flash}
        </p>
      )}

      {/* ── ชั่วโมงที่อนุมัติแล้วแยกตามเรต ── */}
      <div className="hidden gap-3.5 sm:grid sm:grid-cols-3">
        {(Object.keys(OT_KIND) as OtKind[]).map((kind) => (
          <div key={kind} className="glass rounded-2xl px-[17px] py-[15px]">
            <div className="flex items-center justify-between gap-2.5">
              <b className="text-[13.5px] font-semibold">
                โอที{OT_KIND[kind].label}
              </b>
              <em className="glass-thin rounded-full px-[9px] py-0.5 text-[11.5px] font-semibold text-muted-foreground not-italic">
                {OT_KIND[kind].rate} เท่า
              </em>
            </div>
            <p className="num mt-2 text-[27px] leading-tight font-bold">
              {hoursOfKind(kind).toFixed(2)}
              <span className="ml-1.5 text-[13px] font-semibold text-muted-foreground">
                ชั่วโมง
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              อนุมัติแล้วในเดือนนี้
            </p>
          </div>
        ))}
      </div>

      <section className="panel glass flex flex-col">
        <div className="strip">
          <div className="tabs">
            {TABS.map((t) => {
              const count =
                t.key === "all"
                  ? inMonth.length
                  : inMonth.filter((r) => r.status === t.key).length;
              return (
                <button
                  key={t.key}
                  type="button"
                  className={tab === t.key ? "on" : ""}
                  onClick={() => {
                    setTab(t.key);
                    setPage(1);
                  }}
                >
                  {t.label} <b>{count}</b>
                </button>
              );
            })}
          </div>
          <div className="legend hidden sm:flex">
            <span><i style={{ background: "var(--warning)" }} />รออนุมัติ</span>
            <span><i style={{ background: "var(--success)" }} />อนุมัติแล้ว</span>
            <span><i style={{ background: "var(--destructive)" }} />ไม่อนุมัติ</span>
            <span><i style={{ background: "var(--neutral)" }} />ยกเลิก</span>
          </div>
        </div>

        <div className="scroll-stable hidden min-h-0 flex-1 overflow-auto md:block">
          <table className="data-table min-w-[760px]">
            <thead>
              <tr>
                <th style={{ width: 150 }}>วันที่ทำล่วงเวลา</th>
                <th style={{ width: 140 }}>ช่วงเวลา</th>
                <th className="c" style={{ width: 116 }}>ชั่วโมง</th>
                <th>งานที่ปฏิบัติ</th>
                <th style={{ width: 132 }}>สถานะ</th>
                <th className="c" style={{ width: 96 }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-[50px] text-center text-muted-foreground">
                    ไม่มีรายการในเดือนนี้
                  </td>
                </tr>
              ) : (
                list.map((r) => <Row key={r.id} row={r} hit={r.id === findId} />)
              )}
            </tbody>
          </table>
        </div>

        <div className="foot flex-col items-stretch gap-3 text-center sm:flex-row sm:items-center sm:text-left">
          <span>
            {scoped.length === 0
              ? "แสดง 0 รายการ"
              : `แสดง ${from + 1}–${from + list.length} จาก ${scoped.length} รายการ`}
          </span>
          <span className="sum">
            ชั่วโมงที่อนุมัติแล้วรวม<b>{totalPaid.toFixed(2)}</b> ชั่วโมง
          </span>
          <div className="pages justify-center sm:justify-start">
            <button
              type="button"
              className="glass-thin"
              disabled={safePage === 1}
              onClick={() => setPage(safePage - 1)}
              aria-label="ก่อนหน้า"
            >
              ‹
            </button>
            {Array.from({ length: maxPage }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={`glass-thin ${n === safePage ? "on" : ""}`}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              className="glass-thin"
              disabled={safePage === maxPage}
              onClick={() => setPage(safePage + 1)}
              aria-label="ถัดไป"
            >
              ›
            </button>
          </div>
        </div>
      </section>
    </div>

    {/* ── มือถือ — ตามต้นแบบ attendance.html แท็บล่วงเวลา ──
        ชื่อหน้า "โอที" อยู่ที่แถบบนของ shell แล้ว แถวนี้จึงมีแค่เดือน · จำนวนคำขอ · ปุ่มปฏิทิน
        ซ่อนแถบเลื่อนเดือน การ์ดชั่วโมงแยกเรต และยอดรวมท้ายตาราง — เปลี่ยนเดือนผ่านแผ่นปฏิทิน */}
    <div className="m-ot md:hidden">
      <div className="m-ot-head">
        <p>
          <b>
            {TH_MONTHS[view.getMonth()]} {view.getFullYear() + 543}
          </b>
          <span className="num">{mBase.length} คำขอ</span>
        </p>
        <button
          type="button"
          className="m-ot-calbtn"
          aria-label="เลือกวันที่"
          onClick={() => setSheetOpen(true)}
        >
          <CalendarIcon strokeWidth={2} />
        </button>
      </div>
      <div className="m-ot-approver">
        <ApproverNote kind="ot" />
      </div>

      {day && (
        <div className="m-ot-pill">
          <span>{thaiDate(day)}</span>
          <button type="button" aria-label="ล้างวันที่ที่เลือก" onClick={() => setDay(null)}>
            <CloseIcon strokeWidth={2.6} />
          </button>
        </div>
      )}

      {flash && (
        <p className="m-ot-flash flex items-center gap-2.5 rounded-xl border border-[var(--success)]/20 bg-[var(--success-soft)] px-4 py-3 text-sm font-medium text-[var(--success)]">
          <CheckIcon className="size-4 shrink-0" strokeWidth={2.4} />
          {flash}
        </p>
      )}

      <div className="m-ot-chips">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? "on" : ""}
            onClick={() => {
              setTab(t.key);
              setPage(1);
            }}
          >
            {t.label}
            <b className="num">
              {t.key === "all" ? mBase.length : mBase.filter((r) => r.status === t.key).length}
            </b>
          </button>
        ))}
      </div>

      <ul className="m-ot-list">
        {mList.length === 0 ? (
          <li className="m-ot-empty">{day ? "ไม่มีรายการในวันนี้" : "ไม่มีรายการในเดือนนี้"}</li>
        ) : (
          mList.map((r) => <MobileCard key={r.id} row={r} hit={r.id === findId} />)
        )}
      </ul>

      <button
        type="button"
        className="m-ot-fab"
        aria-label="ขอโอที"
        onClick={() => setDialogOpen(true)}
      >
        <PlusIcon strokeWidth={2.4} />
        <span className="sr-only">ขอโอที</span>
      </button>
    </div>

    {sheetOpen && (
      <DaySheet
        records={records}
        view={view}
        day={day}
        onClose={() => setSheetOpen(false)}
        onPick={(iso) => {
          const d = new Date(`${iso}T00:00:00`);
          setView(new Date(d.getFullYear(), d.getMonth(), 1));
          setDay(iso);
          setPage(1);
          setSheetOpen(false);
        }}
        onWholeMonth={(month) => {
          setView(month);
          setDay(null);
          setPage(1);
          setSheetOpen(false);
        }}
      />
    )}

      {dialogOpen && (
        <OtDialog
          records={records}
          presetDate={presetDate}
          onClose={() => setDialogOpen(false)}
          onSubmitted={(hours, date) => {
            setFlash(`ส่งคำขอโอที ${hours.toFixed(2)} ชั่วโมงเรียบร้อย — รอหัวหน้าอนุมัติ`);
            const d = new Date(`${date}T00:00:00`);
            setView(new Date(d.getFullYear(), d.getMonth(), 1));
            setTab("all");
            setDay(null);
            setPage(1);
            if (flashTimer.current) clearTimeout(flashTimer.current);
            flashTimer.current = setTimeout(() => setFlash(null), 6000);
          }}
        />
      )}
    </>
  );
}

function Row({ row, hit }: { row: OtRecord; hit?: boolean }) {
  const adjusted =
    row.status === "อนุมัติแล้ว" &&
    row.approvedHours != null &&
    row.approvedHours !== row.hours;

  return (
    <tr className={hit ? "ring-2 ring-primary ring-inset" : undefined}>
      <td>
        {/* กดวันที่เพื่อไปดูเวลาทำงานจริงของเดือนนั้น ว่าวันนั้นเข้าออกกี่โมง */}
        <Link
          href={`/records?month=${row.date.slice(0, 7)}`}
          className="whitespace-nowrap hover:text-primary hover:underline"
        >
          {thaiDate(row.date)}
        </Link>
        {/* เลขที่ใบ — ผู้อนุมัติอ้างเลขนี้ พนักงานจึงต้องเห็นเลขเดียวกันที่ใบของตัวเอง */}
        <span className="why">
          {row.id} · โอที{OT_KIND[otKindOf(row.date)].label}
        </span>
      </td>
      <td className="num whitespace-nowrap">
        {hhmm(row.startMin)}–{hhmm(row.endMin)}
      </td>
      <td className="c num">
        <b className="font-semibold">{row.hours.toFixed(2)}</b>
        {adjusted && (
          <span className="adj">อนุมัติ {row.approvedHours?.toFixed(2)}</span>
        )}
      </td>
      <td>
        <span className="clip">{row.reason}</span>
        {row.comment && <span className="why">หัวหน้า: {row.comment}</span>}
      </td>
      <td>
        <span className={`tag ${STATUS_CLASS[row.status]}`}>
          <i />
          {row.status}
        </span>
      </td>
      <td className="c">
        {row.status === "รออนุมัติ" ? (
          <button type="button" className="lnk" onClick={() => cancelOtRequest(row.id)}>
            ยกเลิก
          </button>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}

/** การ์ดคำขอบนมือถือ — กริดตามต้นแบบ (#ot-rows > tr บนจอแคบ) เลขที่ใบซ่อน เหลือเวลายื่นแทน */
function MobileCard({ row, hit }: { row: OtRecord; hit?: boolean }) {
  const adjusted =
    row.status === "อนุมัติแล้ว" &&
    row.approvedHours != null &&
    row.approvedHours !== row.hours;

  return (
    <li className={`m-ot-card ${hit ? "hit" : ""}`}>
      <i className="ico">
        <ClockIcon strokeWidth={2.2} />
      </i>
      {/* กดวันที่เพื่อไปดูเวลาทำงานจริงของเดือนนั้น — เหมือนตารางจอคอม */}
      <Link href={`/records?month=${row.date.slice(0, 7)}`} className="dt">
        {thaiDate(row.date)}
      </Link>
      <span className="hr num">
        {row.hours.toFixed(2)} ชม.
        {adjusted && <span className="adj">อนุมัติ {row.approvedHours?.toFixed(2)} ชม.</span>}
      </span>
      {/* ชื่อคลาส rsn ไม่ใช่ wk — .wk ใน globals.css เป็นกริดปฏิทิน 7 ช่อง ทับกันแล้วข้อความแตกเป็นคำ ๆ (แก้ 5 ต.ค. 2569) */}
      <p className="rsn">
        {row.reason}
        {row.comment && <span className="cm">หัวหน้า: {row.comment}</span>}
      </p>
      <hr className="line" />
      <span className="tm num">
        <ClockIcon strokeWidth={2} />
        {hhmm(row.startMin)}–{hhmm(row.endMin)}
      </span>
      <span className={`tag st ${STATUS_CLASS[row.status]}`}>
        <i />
        {row.status}
      </span>
      <span className="no num">ยื่น {submittedText(row.submittedAt)}</span>
      {row.status === "รออนุมัติ" && (
        <div className="ac">
          <button type="button" className="lnk" onClick={() => cancelOtRequest(row.id)}>
            ยกเลิก
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * แผ่นเลือกวันจากล่างจอ (ต้นแบบ .m-ot-sheet) — จุดแดงใต้วันที่มีคำขอ
 * เลือกวัน = เปลี่ยนเดือนไปเดือนนั้นแล้วกรองเหลือวันเดียว · "ดูทั้งเดือน" = ล้างวัน คงเดือนที่แสดงอยู่
 * เปิดจากการกดปุ่มเท่านั้น จึงอ่านวันนี้และ document ตอน render ได้ ไม่ชนกับ SSR
 */
function DaySheet({
  records,
  view,
  day,
  onClose,
  onPick,
  onWholeMonth,
}: {
  records: OtRecord[];
  view: Date;
  day: string | null;
  onClose: () => void;
  onPick: (iso: string) => void;
  onWholeMonth: (month: Date) => void;
}) {
  const today = useMemo(() => {
    const n = bkkNow();
    return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
  }, []);
  const [month, setMonth] = useState(() => new Date(view.getFullYear(), view.getMonth(), 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const unlock = lockScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
    };
  }, [onClose]);

  const y = month.getFullYear();
  const m = month.getMonth();
  const prefix = `${y}-${pad(m + 1)}`;
  const hasReq = new Set(records.filter((r) => r.date.startsWith(prefix)).map((r) => r.date));
  const lead = new Date(y, m, 1).getDay();
  const count = new Date(y, m + 1, 0).getDate();
  const atLatest = prefix >= today.slice(0, 7);

  return createPortal(
    <div
      className="m-ot-sheet md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="เลือกวันที่"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="panel-s">
        <div className="grab" />
        <div className="sh-head">
          <button type="button" aria-label="เดือนก่อนหน้า" onClick={() => setMonth(new Date(y, m - 1, 1))}>
            <ChevronLeftIcon strokeWidth={2.4} />
          </button>
          <b>
            {TH_MONTHS[m]} {y + 543}
          </b>
          <button
            type="button"
            aria-label="เดือนถัดไป"
            disabled={atLatest}
            onClick={() => setMonth(new Date(y, m + 1, 1))}
          >
            <ChevronRightIcon strokeWidth={2.4} />
          </button>
        </div>
        <div className="wd">
          {TH_WEEKDAYS.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="days">
          {Array.from({ length: lead }, (_, i) => (
            <span key={`b${i}`} />
          ))}
          {Array.from({ length: count }, (_, i) => {
            const iso = `${prefix}-${pad(i + 1)}`;
            const cls = [iso === today ? "today" : "", iso === day ? "sel" : ""].join(" ").trim();
            return (
              <button
                key={iso}
                type="button"
                className={cls}
                disabled={iso > today}
                aria-label={thaiDate(iso)}
                aria-pressed={iso === day}
                onClick={() => onPick(iso)}
              >
                <em>{i + 1}</em>
                <i className={hasReq.has(iso) ? "" : "off"} />
              </button>
            );
          })}
        </div>
        <button type="button" className="all" onClick={() => onWholeMonth(month)}>
          ดูทั้งเดือน
        </button>
      </div>
    </div>,
    document.body,
  );
}

function submittedText(at: string) {
  const [d, t] = at.split(" ");
  return t ? `${thaiDate(d)} ${t}` : thaiDate(d);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function hhmm(m: number) {
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

function thaiDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
}
