"use client";

import { useHydrated } from "@/lib/pwa";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarPanel } from "./thai-date-picker";
import { todayIso } from "@/lib/format";
import { lockScroll } from "@/lib/scroll-lock";
import { isWorkday } from "@/lib/holidays";
import { leaveTypes, type LeaveRecord, type LeaveType } from "@/lib/leave-data";
import { addLeaveRequest, excessDays, leaveUsage } from "@/lib/leave-store";
import { useOtRecords } from "@/lib/ot-store";
import { hasNoApprover, useApprovalRoute, useRole } from "@/lib/role";
import { currentProfile } from "@/lib/profile-data";
import { formatMinutesOfDay, minutesOfDay, WORK_SCHEDULE } from "@/lib/work-schedule";
import {
  CalendarIcon,
  CloseIcon,
} from "./icons";
import "@/styles/mobile/sheet.css";

/* อ่านเวลาทำงานสดทุกครั้ง — ผู้ดูแลระบบแก้เวลาได้ (ดู work-schedule.ts) */
const lunchA = () => minutesOfDay(WORK_SCHEDULE.lunchStart);
const lunchB = () => minutesOfDay(WORK_SCHEDULE.lunchEnd);
const fullMin = () =>
  minutesOfDay(WORK_SCHEDULE.end) - minutesOfDay(WORK_SCHEDULE.start) - WORK_SCHEDULE.breakMinutes;

function preset() {
  return {
    morning: { start: minutesOfDay(WORK_SCHEDULE.start), end: lunchA() },
    afternoon: { start: lunchB(), end: minutesOfDay(WORK_SCHEDULE.end) },
  } as const;
}

const TH_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

const TODAY = todayIso();

export function LeaveDialog({
  period,
  records,
  presetDate,
  onClose,
  onSubmitted,
}: {
  /** รอบปีการลาที่กำลังดูอยู่ — สิทธิ์คงเหลือต้องคิดจากรอบนี้ */
  period: string;
  records: LeaveRecord[];
  /** วันที่ตั้งต้น — มาจากการกดขอลาจากแถววันนั้นในหน้าบันทึกเวลา */
  presetDate?: string;
  onClose: () => void;
  onSubmitted: (days: number) => void;
}) {
  /* เปิดกล่องได้หลัง hydrate เท่านั้น — ถ้าใช้ typeof document เซิร์ฟเวอร์จะวาดว่าง แต่เบราว์เซอร์วาดกล่อง
     ตอนที่กล่องเปิดมาตั้งแต่แรก (เช่นลิงก์ ?new=1) React จะฟ้อง hydration ไม่ตรงกัน */
  const hydrated = useHydrated();
  const types = leaveTypes();
  const [type, setType] = useState<LeaveType>(types[0]);
  /* กดส่งแล้วยังไม่ครบ — ค่อยขึ้นข้อความว่าขาดอะไร ไม่ทักตั้งแต่ยังไม่ได้กรอก */
  const [tried, setTried] = useState(false);
  /* เปิดมาให้เริ่มที่วันนี้ก่อน — ลาย้อนหลังหรือล่วงหน้าค่อยเลื่อนเอง
     ถ้าถูกส่งวันที่มาจากหน้าบันทึกเวลา ให้ใช้วันนั้นแทน */
  const [from, setFrom] = useState(presetDate || TODAY);
  const [to, setTo] = useState(presetDate || TODAY);
  /* ลาด่วน = นับเป็นชั่วโมง แล้วแปลงเป็นวันไปหักสิทธิ์ (เจ้าของสั่ง 28 ก.ย. 2569) */
  const [span, setSpan] = useState<"full" | "half" | "hours">("full");
  /* เลือกเป็นช่วงเวลา "เริ่มลา – จนถึง" แล้วระบบคิดชั่วโมงให้ (เจ้าของสั่ง 28 ก.ย. 2569) */
  const [startAt, setStartAt] = useState(() => formatMinutesOfDay(minutesOfDay(WORK_SCHEDULE.start)));
  const [endAt, setEndAt] = useState(() => formatMinutesOfDay(minutesOfDay(WORK_SCHEDULE.start) + 60));
  const [half, setHalf] = useState<"morning" | "afternoon">("morning");
  /* ครึ่งวันคือเช้าหรือบ่ายเท่านั้น เวลาจึงตายตัวตามกะ ไม่ให้กรอกเองซ้ำ */
  const { start: startMin, end: endMin } = preset()[half];
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // ปิดด้วย Esc + ล็อกการเลื่อนพื้นหลังระหว่างเปิด
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

  const workdayCount = useMemo(() => countWorkdays(from, to), [from, to]);

  /* ลาด่วน: เลือกช่วงเวลา แล้วคิดชั่วโมงงานจริง (หักพักเที่ยงที่คาบเกี่ยวออก) */
  const urgentStart = minutesOfDay(startAt);
  const urgentEnd = minutesOfDay(endAt);
  const hours = useMemo(
    () => Math.round((netMinutes(urgentStart, urgentEnd) / 60) * 100) / 100,
    [urgentStart, urgentEnd],
  );

  const days = useMemo(() => {
    if (!from || !to || workdayCount === 0) return workdayCount;
    if (span === "hours") return hoursToDays(hours);
    if (span === "full" || from !== to) return workdayCount;
    return minutesToDays(netMinutes(startMin, endMin));
  }, [from, to, span, hours, startMin, endMin, workdayCount]);

  const overlap = useMemo(() => {
    if (!from || !to) return null;
    return (
      records.find(
        (r) =>
          /* ใบที่ถูกตีกลับหรือยกเลิกแล้วไม่กันวันซ้ำ — ยังยื่นช่วงเดิมใหม่ได้ */
          r.status !== "ไม่อนุมัติ" &&
          r.status !== "ยกเลิก" &&
          from <= r.toDate &&
          to >= r.date,
      ) ?? null
    );
  }, [records, from, to]);

  const otRecords = useOtRecords();
  const noApprover = hasNoApprover(useRole(), "leave", useApprovalRoute());
  /* สิทธิ์จากตัวคำนวณชุดเดียวของระบบ — ตัวเลขในกล่องนี้ต้องตรงกับการ์ดในหน้าการลาเป๊ะ ๆ */
  const quota = leaveUsage(records, type, period);
  const entitled = quota.entitled;

  // รวมทุกเงื่อนไขไว้ที่เดียว — บอกเหตุผลทั้งหมด ไม่ใช่ปิดปุ่มเฉย ๆ
  /* โอทีที่ยื่นไว้ในช่วงเดียวกัน — เตือนให้รู้ตัว ไม่ห้ามลา */
  const otClash = otRecords.filter(
    (o) =>
      o.status !== "ยกเลิก" &&
      o.status !== "ไม่อนุมัติ" &&
      from &&
      to &&
      o.date >= from &&
      o.date <= to,
  );

  const problems: string[] = [];
  let blocked = false;
  if (overlap) {
    problems.push(
      `ช่วงวันที่เลือกทับกับใบลา ${thaiRange(overlap.date, overlap.toDate)} ที่ยื่นไว้แล้ว — ยกเลิกใบเดิมก่อน`,
    );
    blocked = true;
  }
  if (from && to && to < from) {
    problems.push("วันที่สิ้นสุดต้องไม่อยู่ก่อนวันที่เริ่มลา");
    blocked = true;
  }
  if (from && to && workdayCount === 0 && !blocked) {
    problems.push("ช่วงที่เลือกเป็นวันหยุดทั้งหมด ไม่ต้องยื่นใบลา");
  }
  if (span === "half" && from && to && from !== to) {
    problems.push("ลาครึ่งวันเลือกได้วันเดียว");
    blocked = true;
  }
  if (span === "hours") {
    if (from !== to) {
      problems.push("ลาด่วนรายชั่วโมงเลือกได้วันเดียว");
      blocked = true;
    }
    if (!(hours > 0)) {
      problems.push("เวลาที่เลือกยังไม่มีชั่วโมงทำงาน — ตั้งเวลา \"จนถึง\" ให้อยู่หลังเวลาเริ่มลา");
      blocked = true;
    }
    if (hours * 60 > fullMin()) {
      problems.push(`ลาด่วนได้ไม่เกิน ${fmt(fullMin() / 60)} ชั่วโมง (เท่ากับหนึ่งวันทำงาน) — เกินกว่านี้ให้ลาเต็มวัน`);
      blocked = true;
    }
  }
  if (entitled <= 0) {
    problems.push("ไม่มีสิทธิ์ลาประเภทนี้ในรอบปีนี้");
    blocked = true;
  }
  /* ไม่มีใครอนุมัติได้ = ยื่นไปก็ค้าง ต้องบอกและกั้นไว้ก่อน (ผู้อนุมัติต้องไม่ใช่ผู้ยื่น) */
  if (noApprover) {
    problems.push("ใบลานี้ยังไม่มีผู้อนุมัติ — ผู้อนุมัติที่ตั้งไว้เป็นคนเดียวกับผู้ยื่น ให้ผู้ดูแลระบบแก้สายอนุมัติก่อน");
    blocked = true;
  }
  /*
   * เกินสิทธิ์เท่าไร — คิดจากสูตรกลาง excessDays() ที่จอผู้อนุมัติใช้ตัวเดียวกัน
   * สิทธิ์ตัดตอนอนุมัติเท่านั้น ใบที่ยังรออนุมัติจึงไม่เอามาหักตรงนี้ (ไม่งั้นสองจอได้เลขไม่ตรงกัน)
   * แต่ยังบอกแยกอีกบรรทัดว่ามีใบค้างอยู่กี่วัน ผู้ยื่นจะได้ไม่เซอร์ไพรส์ทีหลัง
   */
  const over = excessDays(records, type, days, period);
  if (over > 0) {
    problems.push(
      `เกินสิทธิ์คงเหลือ ${fmt(over)} วัน — ส่วนที่เกินถือเป็นลาไม่รับค่าจ้าง หักจากเงินเดือน`,
    );
  }
  if (quota.pending > 0 && days > 0) {
    const after = Math.max(0, quota.remaining - quota.pending - days);
    problems.push(
      `มีใบลาประเภทนี้รออนุมัติอยู่ ${fmt(quota.pending)} วัน — ถ้าอนุมัติครบทุกใบรวมใบนี้ จะเหลือ ${fmt(after)} วัน`,
    );
  }

  /*
   * ช่องที่ยังไม่ได้กรอก — บอกว่าขาดอะไรหลังกดส่งครั้งแรก ไม่ใช่ปิดปุ่มเงียบ ๆ
   * (กติกาของระบบ: ปฏิเสธเมื่อไรต้องบอกเหตุผลเสมอ · ผู้ใช้ย้ำ 24 ก.ย. 2569)
   */
  const missing: string[] = [];
  if (!from || !to) missing.push("ยังไม่ได้เลือกวันที่ลา");
  if (days <= 0 && from && to && !blocked) missing.push("ช่วงที่เลือกไม่มีวันทำงานให้ลา");
  if (!reason.trim()) missing.push("ยังไม่ได้กรอกเหตุผลการลา");

  const canSubmit = !blocked && days > 0 && reason.trim().length > 0;

  function submit() {
    if (!canSubmit) {
      setTried(true);
      return;
    }
    addLeaveRequest({
      type,
      from,
      to,
      days,
      half: span === "half" ? half : undefined,
      startMin: span === "half" ? startMin : span === "hours" ? urgentStart : undefined,
      endMin: span === "half" ? endMin : span === "hours" ? urgentEnd : undefined,
      hours: span === "hours" ? hours : undefined,
      reason: reason.trim(),
      employee: currentProfile().name,
      files,
    });
    onSubmitted(days);
    onClose();
  }

  if (!hydrated) return null;

  return createPortal(
    <div
      className="lv-dlg ui-sheet fixed inset-0 z-80 flex items-end justify-center bg-black/50 md:items-start md:p-6 md:pt-[max(24px,7vh)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-box-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="lv-dlg-panel ui-sheet-panel glass-solid flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[18px] md:max-h-full md:rounded-[18px]">
        <div className="lv-dlg-head ui-sheet-head flex flex-none items-center justify-between gap-3 border-b border-border px-4 py-3.5 md:px-5 md:py-4">
          <h2 id="leave-box-title" className="text-[16.5px] font-bold">
            ยื่นใบลา
          </h2>
          <button
            type="button"
            className="iconbtn glass-thin"
            onClick={onClose}
            aria-label="ปิด"
          >
            <CloseIcon className="size-[15px]" strokeWidth={2.2} />
          </button>
        </div>

        <div className="lv-dlg-body ui-sheet-body scroll-stable min-h-0 flex-1 overflow-auto px-4 py-4 md:max-h-[min(70dvh,560px)] md:min-h-[280px] md:flex-none md:px-5 md:py-[18px]">
          <Field label="ประเภทการลา" htmlFor="lv-type">
            <select
              id="lv-type"
              value={type}
              onChange={(e) => setType(e.target.value as LeaveType)}
              className="field-control cursor-pointer"
            >
              {types.map((t) => {
                const q = leaveUsage(records, t, period);
                return (
                  <option key={t} value={t}>
                    {t}{" "}
                    {q.entitled > 0
                      ? `(คงเหลือ ${fmt(q.remaining)} วัน${q.pending > 0 ? ` · รออนุมัติ ${fmt(q.pending)} วัน` : ""})`
                      : "(ไม่มีสิทธิ์)"}
                  </option>
                );
              })}
            </select>
          </Field>

          <div className="mb-[15px] grid gap-3 sm:grid-cols-2">
            <DateField
              label="วันที่เริ่มลา"
              value={from}
              onChange={(iso) => {
                setFrom(iso);
                if (!to || to < iso || span === "half") setTo(iso);
              }}
            />
            <DateField
              label="วันที่สิ้นสุด"
              value={to}
              onChange={setTo}
              disabled={span === "half"}
            />
          </div>

          <Field label="ช่วงเวลา">
            <div className="seg glass-thin">
              {(["full", "half", "hours"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={span === v ? "on" : ""}
                  onClick={() => {
                    setSpan(v);
                    if (v !== "full" && from) setTo(from);
                  }}
                >
                  {v === "full" ? "เต็มวัน" : v === "half" ? "ครึ่งวัน" : "ลาด่วน (ชั่วโมง)"}
                </button>
              ))}
            </div>
          </Field>

          {span === "hours" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="เริ่มลา">
                <input
                  type="time"
                  value={startAt}
                  step={900}
                  aria-label="เวลาที่เริ่มลาด่วน"
                  onChange={(e) => setStartAt(e.target.value)}
                  className="field-control"
                />
              </Field>
              <Field label="จนถึง">
                <input
                  type="time"
                  value={endAt}
                  step={900}
                  aria-label="เวลาที่สิ้นสุดการลาด่วน"
                  onChange={(e) => setEndAt(e.target.value)}
                  className="field-control"
                />
              </Field>
              <p className="text-[12px] leading-relaxed text-muted-foreground sm:col-span-2">
                รวม <b className="font-semibold text-foreground">{fmt(hours)} ชั่วโมง</b>
                {netMinutes(urgentStart, urgentEnd) !== Math.max(0, urgentEnd - urgentStart) && " (หักพักเที่ยงแล้ว)"}
                {" · "}หักสิทธิ์วันลา{" "}
                <b className="font-semibold text-foreground">{fmt(hoursToDays(hours))} วัน</b>{" "}
                (วันทำงาน {fmt(fullMin() / 60)} ชั่วโมง)
              </p>
            </div>
          )}

          {span === "half" && (
            <>
              <Field label="ลาช่วงไหน">
                <div className="flex flex-col gap-0.5">
                  {(["morning", "afternoon"] as const).map((p) => (
                    <label
                      key={p}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-[11px] px-[11px] py-2.5 text-[13.5px] transition-colors hover:bg-black/5 ${
                        half === p ? "font-semibold text-primary" : "font-medium"
                      }`}
                    >
                      <input
                        type="radio"
                        name="half-period"
                        checked={half === p}
                        onChange={() => setHalf(p)}
                        className="size-[17px] accent-[var(--primary)]"
                      />
                      <span>ลาช่วง{p === "morning" ? "เช้า" : "บ่าย"}</span>
                      <em className="num ml-auto text-xs not-italic opacity-70">
                        {formatMinutesOfDay(preset()[p].start)}–
                        {formatMinutesOfDay(preset()[p].end)}
                      </em>
                    </label>
                  ))}
                </div>
              </Field>
            </>
          )}

          <Field label="เหตุผลการลา" htmlFor="lv-reason">
            <textarea
              id="lv-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ระบุเหตุผล"
              className="field-control h-[78px] resize-y py-2.5 leading-relaxed"
            />
          </Field>

          <Field label="เอกสารประกอบ (ถ้ามี)">
            <div className="flex items-center gap-[11px]">
              <input
                ref={fileRef}
                type="file"
                multiple
                aria-label="เลือกเอกสารประกอบ"
                className="sr-only"
                onChange={(e) =>
                  setFiles(Array.from(e.target.files ?? []).map((f) => f.name))
                }
              />
              <button
                type="button"
                className="btn glass-thin"
                onClick={() => fileRef.current?.click()}
              >
                เลือกไฟล์
              </button>
              <span className="truncate text-[12.5px] text-muted-foreground">
                {files.length === 0
                  ? "ยังไม่ได้เลือกไฟล์"
                  : files.length === 1
                    ? files[0]
                    : `เลือกแล้ว ${files.length} ไฟล์`}
              </span>
            </div>
          </Field>

          <div className="glass-thin flex items-center justify-between gap-3 rounded-[11px] px-[13px] py-[11px] text-[13px]">
            <span>
              {span === "hours"
                ? "จำนวนวันลาที่หักจากสิทธิ์ (แปลงจากชั่วโมง)"
                : "จำนวนวันลา (ไม่นับเสาร์-อาทิตย์และวันหยุดตามปฏิทิน)"}
            </span>
            <b className="num text-[15px] font-bold">
              {span === "hours" && `${fmt(hours)} ชม. = `}
              {fmt(days)} วัน
            </b>
          </div>

          {/* สิทธิ์ยังไม่ถูกหักตอนยื่น — บอกไว้ตรงนี้ ผู้ยื่นจะได้ไม่เข้าใจว่าเสียสิทธิ์ไปแล้ว */}
          <p className="num mt-[9px] text-[12.5px] leading-relaxed text-muted-foreground">
            {type} คงเหลือ {fmt(quota.remaining)} จาก {fmt(quota.entitled)} วัน
            {quota.pending > 0 && ` · รออนุมัติอยู่ ${fmt(quota.pending)} วัน`}
            {" · "}สิทธิ์จะถูกหักเมื่อผู้อนุมัติอนุมัติแล้วเท่านั้น
          </p>

          {problems.length === 0 && otClash.length > 0 && (
            <p className="mt-[9px] rounded-[11px] border border-[var(--info)]/20 bg-[var(--info-soft)] px-[13px] py-2.5 text-[12.5px] leading-relaxed text-[var(--info)]">
              ช่วงนี้มีคำขอทำล่วงเวลาอยู่ {otClash.length} ใบ (
              {thaiDate(otClash[0].date)}
              {otClash.length > 1 ? " และวันอื่น" : ""}) — ถ้าไม่ได้ทำแล้วให้ยกเลิกใบโอทีด้วย
            </p>
          )}

          {[...problems, ...(tried ? missing : [])].length > 0 && (
            <p
              className="mt-[9px] rounded-[11px] border border-destructive/20 bg-[var(--destructive-soft)] px-[13px] py-2.5 text-[12.5px] leading-relaxed text-destructive"
              role="alert"
            >
              {[...problems, ...(tried ? missing : [])].map((m, i) => (
                <span key={m} className="block">
                  {i > 0 && <br />}
                  {m}
                </span>
              ))}
            </p>
          )}
        </div>

        <div className="lv-dlg-foot ui-sheet-foot flex flex-none items-center gap-2.5 border-t border-border px-4 py-3.5 pb-[max(14px,env(safe-area-inset-bottom))] md:justify-end md:px-5">
          <button type="button" className="btn glass-thin flex-1 justify-center md:flex-none" onClick={onClose}>
            ยกเลิก
          </button>
          {/* ปุ่มไม่ปิดตาย — กดแล้วบอกว่าขาดอะไร ดีกว่าปุ่มเทาที่ไม่บอกเหตุผล */}
          <button
            type="button"
            className="btn solid btn-solid flex-1 justify-center md:flex-none"
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

// ─── ชิ้นส่วนย่อย ──────────────────────────────────────────────────
function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-[15px]">
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

/** ช่องวันที่ + ปฏิทินของตัวเอง (native picker ระบายสีวันหยุดไม่ได้) */
function DateField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
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
    <div ref={wrapRef} className="relative">
      <label className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">
        {label}
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((v) => !v);
        }}
        className="field-control flex items-center justify-between text-left disabled:opacity-60"
      >
        <span className={value ? "" : "text-muted-foreground"}>
          {value ? thaiDate(value) : "เลือกวันที่"}
        </span>
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="glass-solid absolute top-full left-0 z-90 mt-1.5 w-[min(276px,calc(100vw-2.5rem))] rounded-[14px] p-3">
          {/* ปฏิทินตัวเดียวกับทั้งระบบ — กดหัวเพื่อเลือกเดือน/ปี */}
          <CalendarPanel
            value={value}
            onPick={(iso) => {
              onChange(iso);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── ตรรกะ ────────────────────────────────────────────────────────
function pad(n: number) {
  return String(n).padStart(2, "0");
}

/* ลาด่วนเป็นชั่วโมงทำให้ได้วันเป็นเศษสองตำแหน่ง (2 ชม. ของวัน 8 ชม. = 0.25) ต้องไม่ปัดทิ้ง */
function fmt(n: number) {
  return String(Math.round(n * 100) / 100);
}

function toIso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function thaiDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function thaiRange(a: string, b: string) {
  return a === b ? thaiDate(a) : `${thaiDate(a)} – ${thaiDate(b)}`;
}

/** นับเฉพาะวันทำงาน — ข้ามเสาร์-อาทิตย์และวันหยุดตามปฏิทิน */
function countWorkdays(from: string, to: string) {
  if (!from || !to) return 0;
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  if (b < a) return 0;
  let n = 0;
  for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    if (isWorkday(d, toIso(d))) n += 1;
  }
  return n;
}

/** นาทีทำงานสุทธิ หักเวลาพักกลางวันที่คาบเกี่ยว */
function netMinutes(a: number, b: number) {
  if (b <= a) return 0;
  const lunch = Math.max(0, Math.min(b, lunchB()) - Math.max(a, lunchA()));
  return Math.max(0, b - a - lunch);
}

/*
 * ลาด่วนคิดเป็นชั่วโมง แล้วแปลงเป็นวันไปหักสิทธิ์ตามชั่วโมงทำงานจริงของกะ
 * ปัดทศนิยมสองตำแหน่งพอ (2 ชั่วโมงของวัน 8 ชั่วโมง = 0.25 วัน) ไม่ปัดขึ้นครึ่งวันเหมือนลาปกติ
 */
export function hoursToDays(h: number) {
  const m = Math.max(0, h) * 60;
  return Math.round((m / fullMin()) * 100) / 100;
}

/** ปัดเป็นครึ่งวัน อย่างต่ำ 0.5 — ระบบเงินเดือนคิดเป็นครึ่งวันเท่านั้น */
function minutesToDays(m: number) {
  return Math.max(0.5, Math.round((m / fullMin()) * 2) / 2);
}
