"use client";

import { useHydrated } from "@/lib/pwa";import { bkkNow } from "@/lib/format";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import "@/styles/mobile/ot.css";
import { CalendarPanel } from "./thai-date-picker";
import { lockScroll } from "@/lib/scroll-lock";
import {
  breakMinutesIn,
  OT_KIND,
  otHours,
  otKindOf,
  otAheadDeadline,
  isOffDayKind,
  type OtRecord,
} from "@/lib/ot-data";
import { addOtRequest } from "@/lib/ot-store";
import { recordsOfDay } from "@/lib/attendance";
import {
  getRecordsServerSnapshot,
  getRecordsSnapshot,
  subscribeRecords,
} from "@/lib/attendance-store";
import { leavesOnDate, useLeaveRecords } from "@/lib/leave-store";
import { OT_MIN_HOURS } from "./ot-actual-fields";
import { minutesOfDay, minutesOfTime, WORK_SCHEDULE } from "@/lib/work-schedule";
import {
  CalendarIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  CloseIcon,
} from "./icons";

/** วันทำงานเริ่มโอทีได้ 19:00 (หลังพักกินข้าว) ไม่ใช่ 18:00 ที่เพิ่งเลิกงาน */
const otStart = () => minutesOfDay(WORK_SCHEDULE.otStart);
const DAY_END = 24 * 60;
const MIN_STEP = 15;

const TH_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

/** วันทำงานเริ่มโอทีได้หลังพักกินข้าว · วันหยุดทำได้ทั้งวัน */
function boundsOf(iso: string) {
  if (!iso) return { lo: otStart(), hi: DAY_END };
  return isOffDayKind(otKindOf(iso))
    ? { lo: 0, hi: DAY_END }
    : { lo: otStart(), hi: DAY_END };
}

export function OtDialog({
  records,
  presetDate,
  onClose,
  onSubmitted,
}: {
  records: OtRecord[];
  /** วันที่ตั้งต้น — มาจากการกดขอโอทีจากแถววันนั้นในหน้าบันทึกเวลา */
  presetDate?: string;
  onClose: () => void;
  onSubmitted: (hours: number, date: string) => void;
}) {
  /* เปิดกล่องได้หลัง hydrate เท่านั้น — ถ้าใช้ typeof document เซิร์ฟเวอร์จะวาดว่าง แต่เบราว์เซอร์วาดกล่อง
     ตอนที่กล่องเปิดมาตั้งแต่แรก (เช่นลิงก์ ?new=1) React จะฟ้อง hydration ไม่ตรงกัน */
  const hydrated = useHydrated();
  // กล่องนี้เปิดจากการกดปุ่มเท่านั้น จึงอ่านวันที่ตอน render ได้ ไม่ชนกับ SSR
  const today = useMemo(() => toIso(bkkNow()), []);
  const punches = useSyncExternalStore(
    subscribeRecords,
    getRecordsSnapshot,
    getRecordsServerSnapshot,
  );
  const leaveRecords = useLeaveRecords();
  const start = presetDate || today;
  const [date, setDate] = useState(start);
  /*
   * ขอทีเดียวหลายวันได้ (เจ้าของถาม 25 ก.ย. 2569 — เสาร์+อาทิตย์)
   * ว่าง = วันเดียว · เลือกถึงวันที่แล้วระบบออกใบแยกทีละวัน
   * ไม่รวมเป็นใบเดียว เพราะแต่ละวันเรตไม่เท่ากัน (เสาร์ 2 เท่า · วันหยุดบริษัท 3 เท่า)
   * และผู้อนุมัติต้องตัดสินได้ทีละวัน
   */
  const [dateTo, setDateTo] = useState("");
  /*
   * เวลาของแต่ละวัน (เจ้าของถาม 25 ก.ย. 2569 — ขอสองวันแต่คนละเวลา)
   * ค่าตั้งต้นของทุกวันคือเวลาที่ตั้งไว้ด้านบน แก้เฉพาะวันที่ต้องการต่างออกไป
   * เก็บแยกตามวัน ไม่ใช่ตามลำดับ เปลี่ยนช่วงวันแล้วเวลาที่แก้ไว้จึงไม่เลื่อนตาม
   */
  const [dayTime, setDayTime] = useState<Record<string, { s: number; e: number }>>({});
  const [startMin, setStartMin] = useState(() => boundsOf(start).lo);
  const [endMin, setEndMin] = useState(() => boundsOf(start).lo + 60);
  const [reason, setReason] = useState("");

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

  /* ทุกวันในช่วงที่เลือก — วันเดียวก็เป็นรายการที่มีสมาชิกตัวเดียว ตรรกะข้างล่างจึงเขียนชุดเดียว */
  const days = useMemo(() => {
    if (!date) return [];
    const last = dateTo && dateTo > date ? dateTo : date;
    const out: string[] = [];
    const d = new Date(`${date}T00:00:00`);
    for (let i = 0; i < 31 && toIso(d) <= last; i++) {
      out.push(toIso(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [date, dateTo]);
  const multi = days.length > 1;
  /** เวลาของวันนั้น — ยังไม่เคยแก้ก็ใช้เวลาหลักที่ตั้งไว้ด้านบน */
  const timeOf = (d: string) => dayTime[d] ?? { s: startMin, e: endMin };
  const setTimeOf = (d: string, patch: { s?: number; e?: number }) =>
    setDayTime((m) => ({ ...m, [d]: { ...timeOf(d), ...patch } }));
  const totalHours = days.reduce((a, d) => a + otHours(timeOf(d).s, timeOf(d).e), 0);

  /* ช่วงเวลาที่เลือกได้ — มีวันทำงานอยู่ในช่วงด้วย ต้องเริ่มหลังเลิกงานตามกติกาของวันทำงาน */
  const bounds = days.some((d) => !isOffDayKind(otKindOf(d)))
    ? { lo: boundsOf("x").lo, hi: DAY_END }
    : boundsOf(date);
  const kind = date ? otKindOf(date) : null;
  const hours = otHours(startMin, endMin);
  const breakMin = endMin > startMin ? breakMinutesIn(startMin, endMin) : 0;

  /* ใบที่ทับกันของแต่ละวันในช่วง — ขอหลายวันพร้อมกันก็ต้องตรวจครบทุกวัน */
  const overlaps = useMemo(
    () =>
      days
        .map((d) => ({
          day: d,
          hit: records.find(
            (r) =>
              r.date === d &&
              r.status !== "ยกเลิก" &&
              r.status !== "ไม่อนุมัติ" &&
              (dayTime[d]?.s ?? startMin) < r.endMin &&
              (dayTime[d]?.e ?? endMin) > r.startMin,
          ),
        }))
        .filter((x) => x.hit),
    [records, days, startMin, endMin, dayTime],
  );

  const problems: string[] = [];
  if (date) {
    /* ตรวจทีละวันด้วยเวลาของวันนั้นเอง — แต่ละวันตั้งเวลาต่างกันได้ */
    for (const d of days) {
      const { s: ds, e: de } = timeOf(d);
      const bd = boundsOf(d);
      const tag = multi ? `${thaiDate(d)} · ` : "";
      if (de <= ds) problems.push(`${tag}เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม`);
      if (ds < bd.lo || de > bd.hi)
        problems.push(
          `${tag}วัน${isOffDayKind(otKindOf(d)) ? "หยุด" : "ทำงาน"}ขอโอทีได้ช่วง ${hhmm(bd.lo)}–${hhmm(bd.hi)} น.`,
        );
      const h = otHours(ds, de);
      if (de > ds && h === 0) problems.push(`${tag}ช่วงที่เลือกตกอยู่ในเวลาพักทั้งหมด ไม่นับเป็นโอที`);
      if (h > 0 && h < OT_MIN_HOURS)
        problems.push(`${tag}โอทีขั้นต่ำ ${OT_MIN_HOURS.toFixed(2)} ชั่วโมง — ช่วงที่เลือกได้ ${h.toFixed(2)} ชั่วโมง`);
    }
    for (const o of overlaps)
      problems.push(
        `${multi ? `${thaiDate(o.day)} ` : ""}ทับกับคำขอ ${o.hit!.id} (${hhmm(o.hit!.startMin)}–${hhmm(o.hit!.endMin)} น.) ที่ยื่นไว้แล้ว`,
      );
    /*
     * โอทีวันหยุดต้องยื่นล่วงหน้า (เจ้าของแจ้ง 25 ก.ย. 2569 — เสาร์-อาทิตย์ขอตั้งแต่วันศุกร์)
     * วันหยุดไม่มีใครอยู่อนุมัติ ยื่นวันนั้นเลยก็ไม่มีใครกดให้ทัน
     * จำนวนวันล่วงหน้าผู้ดูแลระบบตั้งเองที่ /admin/rates
     */
    for (const d of days) {
      const dl = otAheadDeadline(d);
      if (dl && today > dl)
        problems.push(
          `โอที${OT_KIND[otKindOf(d)].label}${multi ? ` วันที่ ${thaiDate(d)}` : ""}ต้องยื่นล่วงหน้า — วันสุดท้ายที่ยื่นได้คือ ${thaiDate(dl)}`,
        );
    }
  }

  /* เทียบกับบัตรตอกและใบลาของวันนั้น — เตือนอย่างเดียว ไม่ห้ามยื่น
     เพราะขอโอทีล่วงหน้าก่อนตอกบัตรก็ทำได้ */
  const notes = useMemo(() => {
    if (!date) return [];
    const out: string[] = [];
    const dayPunches = recordsOfDay(punches, date);
    const lastOut = [...dayPunches].reverse().find((r) => r.type === "out");
    const outMin = lastOut ? minutesOfTime(new Date(lastOut.at)) : null;

    if (date <= today && dayPunches.length === 0)
      out.push("วันนั้นยังไม่มีบันทึกตอกบัตร — ผู้อนุมัติจะเทียบกับเวลาตอกบัตรจริง");
    else if (outMin != null && endMin > outMin)
      out.push(`ตอกบัตรออกจริง ${hhmm(outMin)} น. — ช่วงที่ขอเลยเวลาที่ตอกไว้`);

    const leave = leavesOnDate(leaveRecords, date)[0];
    if (leave) out.push(`วันนั้นมีใบ${leave.type}อยู่แล้ว`);
    return out;
  }, [date, today, punches, leaveRecords, endMin]);

  const canSubmit = Boolean(date) && hours >= OT_MIN_HOURS && !problems.length && reason.trim().length > 0;

  function submit() {
    if (!canSubmit) return;
    /* ออกใบแยกทีละวัน — เรตของแต่ละวันไม่เท่ากัน และผู้อนุมัติต้องตัดสินได้ทีละวัน */
    for (const d of days) {
      const { s, e } = timeOf(d);
      addOtRequest({ date: d, startMin: s, endMin: e, hours: otHours(s, e), reason: reason.trim() });
    }
    onSubmitted(totalHours, date);
    onClose();
  }

  if (!hydrated) return null;

  return createPortal(
    <div
      className="m-ot-dlg fixed inset-0 z-80 flex items-end justify-center bg-black/50 sm:items-start sm:p-6 sm:pt-[max(24px,7vh)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ot-box-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="m-ot-dlg-panel glass-solid flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[18px] sm:max-h-full sm:rounded-[18px]">
        <div className="m-ot-dlg-head flex flex-none items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5 sm:py-4">
          <h2 id="ot-box-title" className="text-[16.5px] font-bold">
            ขอทำล่วงเวลา
          </h2>
          <button type="button" className="iconbtn glass-thin" onClick={onClose} aria-label="ปิด">
            <CloseIcon className="size-[15px]" strokeWidth={2.2} />
          </button>
        </div>

        <div className="m-ot-dlg-body scroll-stable min-h-0 flex-1 overflow-auto px-4 py-4 sm:max-h-[min(70dvh,560px)] sm:min-h-[280px] sm:flex-none sm:px-5 sm:py-[18px]">
          <DateField
            label="วันที่ทำล่วงเวลา"
            value={date}
            today={today}
            quick={[{ label: "วันนี้", iso: today }]}
            onChange={(iso) => {
              setDate(iso);
              const b = boundsOf(iso);
              setStartMin((v) => Math.min(Math.max(v, b.lo), b.hi - 15));
              setEndMin((v) => Math.min(Math.max(v, b.lo + 60), b.hi));
            }}
          />

          {/* ขอทีเดียวหลายวัน — ว่างไว้คือวันเดียว (เจ้าของถาม 25 ก.ย. 2569 เรื่องขอเสาร์+อาทิตย์) */}
          <DateField
            label="ถึงวันที่ (ถ้าขอหลายวัน)"
            value={dateTo}
            today={today}
            quick={dateTo ? [{ label: "วันเดียว", iso: "" }] : []}
            onChange={setDateTo}
          />

          <div className="mb-[15px] grid gap-3 sm:grid-cols-2">
            <TimeField
              label={multi ? "เวลาเริ่ม (ใช้ทุกวัน)" : "เวลาเริ่ม"}
              value={startMin}
              bounds={bounds}
              disabled={!date}
              onChange={(v) => {
                setStartMin(v);
                /* แก้เวลาหลัก = ตั้งใหม่ให้ทุกวัน · วันที่อยากได้ต่างออกไปค่อยแก้ทีหลังข้างล่าง */
                setDayTime({});
              }}
            />
            <TimeField
              label={multi ? "เวลาสิ้นสุด (ใช้ทุกวัน)" : "เวลาสิ้นสุด"}
              value={endMin}
              bounds={bounds}
              disabled={!date}
              onChange={(v) => {
                setEndMin(v);
                setDayTime({});
              }}
            />
          </div>

          {/* ขอหลายวันแล้วแต่ละวันทำคนละเวลาได้ (เจ้าของถาม 25 ก.ย. 2569) */}
          {multi && (
            <div className="mb-[15px]">
              <p className="mb-1.5 text-[12.5px] font-semibold text-muted-foreground">
                เวลาของแต่ละวัน
                <span className="ml-1.5 font-normal">แก้เฉพาะวันที่ทำคนละเวลา</span>
              </p>
              <div className="space-y-2.5">
                {days.map((d) => (
                  <div key={d} className="glass-thin rounded-[11px] px-3 py-2.5">
                    <p className="mb-1.5 text-[12px] font-semibold">
                      {thaiDate(d)}
                      <em className="ml-1.5 font-normal text-muted-foreground not-italic">
                        โอที{OT_KIND[otKindOf(d)].label} {OT_KIND[otKindOf(d)].rate} เท่า ·{" "}
                        {otHours(timeOf(d).s, timeOf(d).e).toFixed(2)} ชม.
                      </em>
                    </p>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <TimeField
                        label="เริ่ม"
                        value={timeOf(d).s}
                        bounds={boundsOf(d)}
                        onChange={(v) => setTimeOf(d, { s: v })}
                      />
                      <TimeField
                        label="ถึง"
                        value={timeOf(d).e}
                        bounds={boundsOf(d)}
                        onChange={(v) => setTimeOf(d, { e: v })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mb-[15px]">
            <label
              htmlFor="ot-reason"
              className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground"
            >
              งานที่ปฏิบัติ
            </label>
            <textarea
              id="ot-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ระบุงานที่ปฏิบัติของเวลาที่ขอ"
              className="field-control h-[78px] resize-y py-2.5 leading-relaxed"
            />
          </div>

          <div className="glass-thin rounded-[11px] px-[13px] py-[11px] text-[13px]">
            <div className="flex items-center justify-between gap-3">
              <span>
                จำนวนชั่วโมงล่วงเวลา
                {multi ? (
                  <em className="ml-1.5 text-[11.5px] text-muted-foreground not-italic">
                    รวม {days.length} วัน
                  </em>
                ) : (
                  kind && (
                    <em className="ml-1.5 text-[11.5px] text-muted-foreground not-italic">
                      โอที{OT_KIND[kind].label} {OT_KIND[kind].rate} เท่า
                    </em>
                  )
                )}
              </span>
              <b className="num text-[15px] font-bold">{(multi ? totalHours : hours).toFixed(2)} ชั่วโมง</b>
            </div>
            {multi && (
              /* หลายวันเรตไม่เท่ากัน จึงบอกเรตของแต่ละวันไว้ก่อนกดส่ง */
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                ระบบจะออกใบแยกวันละใบ รวม {days.length} ใบ
              </p>
            )}
            {breakMin > 0 && (
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                หักเวลาพักออกแล้ว {breakMin} นาที
              </p>
            )}
          </div>

          {problems.length === 0 && notes.length > 0 && (
            <p className="mt-[9px] rounded-[11px] border border-[var(--info)]/20 bg-[var(--info-soft)] px-[13px] py-2.5 text-[12.5px] leading-relaxed text-[var(--info)]">
              {notes.map((m) => (
                <span key={m} className="block">
                  {m}
                </span>
              ))}
            </p>
          )}

          {problems.length > 0 && (
            <p className="mt-[9px] rounded-[11px] border border-destructive/20 bg-[var(--destructive-soft)] px-[13px] py-2.5 text-[12.5px] leading-relaxed text-destructive">
              {problems.map((m) => (
                <span key={m} className="block">
                  {m}
                </span>
              ))}
            </p>
          )}
        </div>

        <div className="m-ot-dlg-foot flex flex-none items-center gap-2.5 border-t border-border px-4 py-3.5 pb-[max(14px,env(safe-area-inset-bottom))] sm:justify-end sm:px-5">
          <button
            type="button"
            className="btn glass-thin flex-1 justify-center sm:flex-none"
            onClick={onClose}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid flex-1 justify-center sm:flex-none"
            disabled={!canSubmit}
            onClick={submit}
          >
            ส่งคำขอ
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── ช่องวันที่ + ปฏิทิน ──────────────────────────────────────────
function DateField({
  label,
  value,
  quick,
  onChange,
}: {
  label: string;
  value: string;
  today: string;
  quick: { label: string; iso: string }[];
  onChange: (iso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative mb-[15px]">
      <label className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">
        {label}
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
          }}
          className="field-control flex flex-1 items-center justify-between text-left"
        >
          <span className={value ? "" : "text-muted-foreground"}>
            {value ? thaiDate(value) : "เลือกวันที่"}
          </span>
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
        {quick.map((q) => (
          <button
            key={q.iso}
            type="button"
            onClick={() => onChange(q.iso)}
            className={`shrink-0 rounded-[10px] px-3 text-[12.5px] font-medium transition-colors ${
              value === q.iso
                ? "bg-accent font-semibold text-primary"
                : "glass-thin text-muted-foreground hover:text-primary"
            }`}
          >
            {q.label}
          </button>
        ))}
      </div>

      {open && (
        <div className="glass-solid absolute top-full left-0 z-90 mt-1.5 w-[min(276px,calc(100vw-2.5rem))] rounded-[14px] p-3">
          {/* ปฏิทินตัวเดียวกับทั้งระบบ — กดหัวเพื่อเลือกเดือน/ปี · วันสีแดง = วันหยุดคิดเรตโอทีวันหยุด */}
          <CalendarPanel
            value={value}
            offDay={(iso) => isOffDayKind(otKindOf(iso))}
            onPick={(iso) => {
              onChange(iso);
              setOpen(false);
            }}
          />
          <p className="mt-2 border-t border-border pt-2 text-[10.5px] text-muted-foreground">
            วันสีแดง = วันหยุด คิดเรตโอทีวันหยุด ทำได้ทั้งวัน
          </p>
        </div>
      )}
    </div>
  );
}

// ─── ช่องเวลาแบบกดขึ้น-ลง ─────────────────────────────────────────
function TimeField({
  label,
  value,
  bounds,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  bounds: { lo: number; hi: number };
  disabled?: boolean;
  onChange: (m: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const clamp = (m: number) => Math.max(bounds.lo, Math.min(bounds.hi, m));

  return (
    <div ref={wrapRef} className="relative">
      <label className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">
        {label}
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="field-control num flex items-center justify-between tracking-wide disabled:opacity-60"
      >
        {hhmm(value)} น.
        <ClockIcon className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="glass-solid absolute top-full left-0 z-90 mt-1.5 flex items-start gap-2 rounded-[14px] p-3">
          {(
            [
              { part: "h", label: "ชั่วโมง", text: pad(Math.floor(value / 60)), step: 60 },
              { part: "m", label: "นาที", text: pad(value % 60), step: MIN_STEP },
            ] as const
          ).map((col, i) => (
            <div key={col.part} className="contents">
              {i === 1 && (
                <span className="pt-[47px] text-[21px] font-bold text-muted-foreground">:</span>
              )}
              <div className="flex w-[78px] flex-col items-center gap-1.5">
                <span className="mb-px text-[11px] font-bold tracking-wide text-muted-foreground">
                  {col.label}
                </span>
                <button
                  type="button"
                  disabled={value + col.step > bounds.hi}
                  onClick={() => onChange(clamp(value + col.step))}
                  className="grid h-[26px] w-[34px] place-items-center rounded-[7px] text-muted-foreground hover:bg-black/5 hover:text-primary disabled:opacity-30"
                  aria-label={`เพิ่ม${col.label}`}
                >
                  <ChevronUpIcon className="size-3.5" strokeWidth={2.6} />
                </button>
                <b className="num glass-thin block w-full rounded-[10px] py-[7px] text-center text-[23px] font-bold">
                  {col.text}
                </b>
                <button
                  type="button"
                  disabled={value - col.step < bounds.lo}
                  onClick={() => onChange(clamp(value - col.step))}
                  className="grid h-[26px] w-[34px] place-items-center rounded-[7px] text-muted-foreground hover:bg-black/5 hover:text-primary disabled:opacity-30"
                  aria-label={`ลด${col.label}`}
                >
                  <ChevronDownIcon className="size-3.5" strokeWidth={2.6} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ตัวช่วย ──────────────────────────────────────────────────────
function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** 1440 = เที่ยงคืนของวันถัดไป แสดงเป็น 24:00 ไม่ใช่ 00:00 */
function hhmm(m: number) {
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

function toIso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function thaiDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
}
