"use client";

/*
 * ช่องตัดสินโอทีตามเวลาตอกบัตรจริง — ใช้ร่วมกันทั้ง /approvals และ /ceo/approvals
 *
 * แสดงเวลาเข้า-ออกจริงของวันนั้น + ข้อเสนอของระบบ แล้วให้ผู้อนุมัติแก้ชั่วโมงได้ (ทีละ 0.25 ไม่เกินที่ขอ)
 * ปรับชั่วโมงแล้วไม่พิมพ์เหตุผล ระบบเติมเหตุผลให้เอง · ถ้าพิมพ์ไว้ใช้ของผู้อนุมัติ
 *
 * บัตรตอกอ่านตามบทบาท (useAllPunches) · ทีมงานที่ยังไม่มีบัญชีไม่มีบัตรตอกในระบบ
 * ใช้ทะเบียนฝ่ายบุคคลบอกเหตุผลถ้ามีรายการของวันนั้น ไม่มีก็บอกว่าไม่มีบันทึก
 */

import { useMemo, useState } from "react";
import { useAllPunches } from "@/lib/attendance-store";
import { HR_ISSUE_LABEL, ROLE_EMPLOYEE } from "@/lib/hr-data";
import { EMPLOYEE_ROLE } from "@/lib/hr-link";
import { useHr } from "@/lib/hr-store";
import { actualOt, adjustNote, punchRange, type OtActual } from "@/lib/ot-actual";
import type { Role } from "@/lib/role";

export type OtReq = {
  date: string;
  startMin: number;
  endMin: number;
  /** ชั่วโมงที่ขอ */
  hours: number;
  /** ใบของบทบาทที่ล็อกอินได้ */
  role?: Role;
  /** รหัสพนักงาน — ทีมงานที่ยังไม่มีบัญชี */
  emp?: string;
};

export type OtDecision = ReturnType<typeof useOtDecision>;

/** อนุมัติโอทีต่ำกว่านี้ไม่ได้ (ผู้ใช้ตัดสิน 23 ก.ย. 2569) — 0.00 ชม. อนุมัติไม่ได้ */
export const OT_MIN_HOURS = 0.5;

/** สถานะของช่องชั่วโมง/เหตุผลของคำขอโอทีหนึ่งใบ */
export function useOtDecision(req: OtReq | null) {
  const punches = useAllPunches();
  const hr = useHr();

  const actual: OtActual | null = useMemo(() => {
    if (!req) return null;
    const role = req.role ?? (req.emp ? EMPLOYEE_ROLE[req.emp] : undefined);
    const emp = req.emp ?? (req.role ? ROLE_EMPLOYEE[req.role] : undefined);
    const issue = emp ? hr.time[emp]?.issues.find((x) => x.d === req.date) : undefined;
    return actualOt(req, role ? punches[role] : [], {
      missing: issue ? issue.note || HR_ISSUE_LABEL[issue.kind] : undefined,
    });
  }, [req, punches, hr.time]);

  /* null = ยังไม่แตะ ใช้ข้อเสนอของระบบ — บัตรตอกโหลดตามมาทีหลังก็ยังได้ค่าล่าสุด */
  const [edited, setEdited] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const asked = req?.hours ?? 0;
  const text = edited ?? String(actual?.proposed ?? asked);
  const value = Number(text);
  /* ต้องมากกว่า 0 และอย่างน้อย 0.5 ชม. · เกินที่ขอไม่ได้ */
  const valid =
    text.trim() !== "" && Number.isFinite(value) && value >= OT_MIN_HOURS && value <= asked;
  /* ที่ขอเองยังไม่ถึงขั้นต่ำ — อนุมัติไม่ได้เลย ต้องไม่อนุมัติอย่างเดียว */
  const tooSmall = asked < OT_MIN_HOURS;
  /* เวลาที่ขอไม่ตรงกับเวลาตอกบัตร — บังคับให้ผู้อนุมัติยืนยันชั่วโมงที่อนุมัติจริงก่อน หรือไม่อนุมัติ */
  const mustChoose = actual?.state === "cut" && edited === null;

  return {
    actual,
    asked,
    text,
    setText: setEdited,
    comment,
    setComment,
    valid,
    tooSmall,
    mustChoose,
    /** กดอนุมัติได้หรือยัง — ตัวเลขถูกต้อง และยืนยันชั่วโมงแล้วถ้าบัตรตอกไม่ครอบคลุม */
    ready: valid && !mustChoose,
    /** ยืนยันใช้ชั่วโมงที่ระบบเสนอโดยไม่แก้ตัวเลข — ปลดล็อกปุ่มอนุมัติ */
    confirm: () => setEdited(text),
    /** ชั่วโมงที่จะบันทึก — ปัดสองตำแหน่งกันเศษทศนิยม */
    hours: valid ? Math.round(value * 100) / 100 : asked,
    /** เหตุผลที่จะบันทึก — ที่พิมพ์ไว้ก่อน ไม่มีก็เติมให้เมื่อปรับชั่วโมง */
    finalComment() {
      const typed = comment.trim();
      if (typed || !actual) return typed;
      return adjustNote(Math.round(value * 100) / 100, asked, actual);
    },
  };
}

/** เวลาตอกบัตรจริง + ช่องชั่วโมงที่อนุมัติ + เหตุผล (ไม่บังคับ) */
export function OtActualFields({
  d,
  idPrefix,
  fixed = false,
}: {
  d: OtDecision;
  idPrefix: string;
  /** ผู้อนุมัติแก้ชั่วโมงไม่ได้ — อนุมัติได้เท่าที่ขอเท่านั้น (หน้า CEO · ผู้ใช้สั่ง 5 ต.ค. 2569) */
  fixed?: boolean;
}) {
  const a = d.actual;
  if (!a) return null;
  const tone = a.state === "cut" ? "text-warning" : "text-muted-foreground";
  return (
    <div className="space-y-2 text-[12.5px]">
      <p className="leading-[1.6]">
        <span className="text-muted-foreground">ตอกบัตรจริง </span>
        <b className="num font-semibold text-foreground">{punchRange(a)}</b>
        <span className={`block ${tone}`}>{a.note}</span>
      </p>
      {fixed ? (
        /* CEO เห็นตัวเลขอย่างเดียว ไม่มีช่องแก้ — อนุมัติ = ตามชั่วโมงที่ขอ · ไม่ตรงก็กดไม่อนุมัติ (ผู้ใช้สั่ง 5 ต.ค. 2569) */
        <>
          <p>
            <span className="font-semibold text-muted-foreground">ชั่วโมงที่อนุมัติ </span>
            <b className="num font-semibold text-foreground">{d.asked.toFixed(2)} ชม.</b>
            <span className="text-muted-foreground"> (ตามที่ขอ)</span>
          </p>
          {d.tooSmall && (
            <p className="text-destructive">
              ชั่วโมงที่ขอ {d.asked.toFixed(2)} ชม. ต่ำกว่าขั้นต่ำ {OT_MIN_HOURS.toFixed(2)} ชม. — อนุมัติไม่ได้ ให้กดไม่อนุมัติ
            </p>
          )}
          <input
            value={d.comment}
            onChange={(e) => d.setComment(e.target.value)}
            placeholder="เหตุผล/หมายเหตุ (ไม่บังคับ)"
            aria-label="เหตุผลหรือหมายเหตุการอนุมัติ"
            className="field-control h-9 w-full rounded-[10px] px-3 text-[13px]"
          />
        </>
      ) : (
      <>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <label htmlFor={`${idPrefix}-hours`} className="font-semibold text-muted-foreground">
          ชั่วโมงที่อนุมัติ
        </label>
        <input
          id={`${idPrefix}-hours`}
          type="number"
          inputMode="decimal"
          step={0.25}
          min={OT_MIN_HOURS}
          max={d.asked}
          value={d.text}
          onChange={(e) => d.setText(e.target.value)}
          aria-invalid={!d.valid}
          className="field-control num h-9 !w-[92px] flex-none rounded-[10px] px-2.5 text-[13.5px]"
        />
        <span className="text-muted-foreground">จากที่ขอ {d.asked.toFixed(2)} ชม.</span>
      </div>
      {d.tooSmall ? (
        <p className="text-destructive">
          ชั่วโมงที่ขอ {d.asked.toFixed(2)} ชม. ต่ำกว่าขั้นต่ำ {OT_MIN_HOURS.toFixed(2)} ชม. — อนุมัติไม่ได้ ให้กดไม่อนุมัติ
        </p>
      ) : !d.valid ? (
        <p className="text-destructive">
          ใส่ชั่วโมงระหว่าง {OT_MIN_HOURS.toFixed(2)} ถึง {d.asked.toFixed(2)} (ต้องมากกว่า 0 และอย่างน้อย{" "}
          {OT_MIN_HOURS.toFixed(2)} ชม.)
        </p>
      ) : d.mustChoose ? (
        /* บังคับให้ผู้อนุมัติเลือก — แก้ตัวเลขเอง กดยืนยันตามที่ระบบเสนอ หรือกดไม่อนุมัติ */
        <div className="space-y-2 rounded-[11px] border border-[rgba(192,18,31,.2)] bg-[var(--destructive-soft)] px-3 py-2.5">
          <p className="leading-[1.55] text-destructive">
            เวลาที่ขอไม่ตรงกับเวลาที่ตอกบัตร — โปรดเลือกว่าจะอนุมัติตามจริงกี่ชั่วโมง หรือกดไม่อนุมัติ
          </p>
          <button
            type="button"
            onClick={d.confirm}
            className="btn glass-thin h-9 w-full justify-center rounded-[10px] text-[12.5px] font-semibold"
          >
            ยืนยันอนุมัติ {Number(d.text).toFixed(2)} ชม. ตามเวลาตอกบัตร
          </button>
        </div>
      ) : null}
      <input
        value={d.comment}
        onChange={(e) => d.setComment(e.target.value)}
        placeholder="เหตุผล/หมายเหตุ (ไม่บังคับ)"
        aria-label="เหตุผลหรือหมายเหตุการอนุมัติ"
        className="field-control h-9 w-full rounded-[10px] px-3 text-[13px]"
      />
      </>
      )}
    </div>
  );
}
