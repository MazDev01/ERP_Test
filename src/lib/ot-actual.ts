/*
 * เทียบคำขอโอทีกับเวลาตอกบัตรจริงของวันนั้น (ผู้ใช้ตัดสิน 22 ก.ย. 2569)
 *
 * ผู้อนุมัติต้องเห็นเวลาเข้า-ออกจริงก่อนตัดสิน ระบบเสนอชั่วโมงจากบัตรตอก
 * แล้วผู้อนุมัติแก้ได้ก่อนกดอนุมัติ — ตัวนี้แค่คำนวณข้อเสนอ ไม่บันทึกอะไร
 *
 * เข้า = ตอกเข้าครั้งแรกของวัน · ออก = ตอกออกครั้งสุดท้ายของวัน
 * ทำโอทีเลยเที่ยงคืนแล้วตอกออกตอนเช้ามืดของวันถัดไป นับเป็นเวลาออกของวันที่ขอ
 */

import { parseIsoDate, toIsoDate, todayIso } from "./format";
import { recordsOfDay, type PunchRecord } from "./attendance";
import { otHours } from "./ot-data";
import { formatMinutesOfDay, minutesNow, minutesOfTime } from "./work-schedule";

/** ตอกออกหลังเที่ยงคืนไม่เกินกี่โมงถึงยังนับเป็นของคืนก่อน */
const AFTER_MIDNIGHT_MIN = 6 * 60;

export type OtActual = {
  /** ตอกเข้าครั้งแรกของวัน (นาทีของวัน) — null = ไม่มี */
  inMin: number | null;
  /** ตอกออกครั้งสุดท้าย — เลยเที่ยงคืนจะเกิน 1440 */
  outMin: number | null;
  /** ชั่วโมงที่ระบบเสนอจากบัตรตอก — null = ยังคำนวณไม่ได้ (ไม่มีบันทึก/ยังไม่ถึงเวลา) */
  suggested: number | null;
  /** ค่าเริ่มต้นของช่องชั่วโมง — ข้อเสนอ หรือเท่าที่ขอเมื่อคำนวณไม่ได้ */
  proposed: number;
  /** none = ไม่มีบันทึก · wait = ยังไม่ถึงเวลา/ยังไม่ตอกออก · match = ตรงตามที่ขอ · cut = ตัดลดตามบัตรตอก */
  state: "none" | "wait" | "match" | "cut";
  /** คำอธิบายสั้น ๆ ให้ผู้อนุมัติอ่าน */
  note: string;
};

const h2 = (n: number) => n.toFixed(2);
const hhmm = (m: number) => formatMinutesOfDay(m % 1440);

/** ปัดลงทีละ 15 นาที ให้ตรงกับช่องชั่วโมงที่ขยับทีละ 0.25 */
const floorQuarter = (h: number) => Math.floor(h * 4 + 1e-9) / 4;

function nextDay(iso: string) {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + 1);
  return toIsoDate(d);
}

/** ข้อความช่วงเวลาตอกบัตรจริง เช่น "09:02–21:30 น." */
export function punchRange(a: OtActual) {
  if (a.inMin == null && a.outMin == null) return "—";
  return `${a.inMin == null ? "ไม่มีเข้า" : hhmm(a.inMin)}–${a.outMin == null ? "ยังไม่ออก" : hhmm(a.outMin)} น.`;
}

/**
 * ชั่วโมงโอทีตามบัตรตอก — ช่วงที่นับ = ส่วนที่ทับกันของ (เวลาที่ขอ) กับ (เข้า–ออกจริง)
 * หักช่วงพักด้วย otHours · ไม่เกินที่ขอ · ปัดลงทีละ 15 นาที
 *
 * missing = เหตุผลจากทะเบียนฝ่ายบุคคลเมื่อวันนั้นไม่มีบันทึก (เช่น "ไม่มีบันทึกเวลา") ใส่ต่อท้ายข้อความ
 */
export function actualOt(
  req: { date: string; startMin: number; endMin: number; hours: number },
  punches: PunchRecord[],
  opts: { today?: string; nowMin?: number; missing?: string } = {},
): OtActual {
  const today = opts.today ?? todayIso();
  const day = recordsOfDay(punches, req.date);
  const firstIn = day.find((r) => r.type === "in");
  const lastOut = [...day].reverse().find((r) => r.type === "out");
  const inMin = firstIn ? minutesOfTime(new Date(firstIn.at)) : null;
  let outMin = lastOut ? minutesOfTime(new Date(lastOut.at)) : null;

  /* ยังอยู่ในงาน (ตอกเข้าเป็นรายการสุดท้าย) แล้วไปตอกออกตอนเช้ามืดของวันถัดไป */
  const last = day.at(-1);
  if (last?.type === "in") {
    const early = recordsOfDay(punches, nextDay(req.date))[0];
    const m = early?.type === "out" ? minutesOfTime(new Date(early.at)) : null;
    if (m != null && m <= AFTER_MIDNIGHT_MIN) outMin = 1440 + m;
  }
  const stillIn = last?.type === "in" && (outMin == null || outMin < 1440);

  const asked = req.hours;
  const wait = (note: string): OtActual => ({ inMin, outMin, suggested: null, proposed: asked, state: "wait", note });

  /* วันที่ยังมาไม่ถึง หรือวันนี้ที่ยังทำงานอยู่ — ยังเทียบไม่ได้ ใช้ตามที่ขอไปก่อน */
  if (req.date > today) return wait("ยังไม่ถึงวันทำโอที — ใช้ตามที่ขอ");
  if (req.date === today) {
    const now = opts.nowMin ?? minutesNow();
    if (day.length === 0 && now < req.endMin) return wait("ยังไม่ถึงเวลา/ยังไม่ตอกบัตร — ใช้ตามที่ขอ");
    if (stillIn) return wait("ยังไม่ตอกบัตรออก — ใช้ตามที่ขอ");
  }

  if (day.length === 0)
    return {
      inMin, outMin, suggested: null, proposed: asked, state: "none",
      note: `ไม่มีบันทึกตอกบัตรวันนั้น${opts.missing ? ` (${opts.missing})` : ""} ใช้ตามที่ขอ`,
    };
  if (outMin == null)
    return { inMin, outMin, suggested: null, proposed: asked, state: "none", note: "ไม่พบการตอกบัตรออกวันนั้น ใช้ตามที่ขอ" };

  const from = Math.max(req.startMin, inMin ?? req.startMin);
  const to = Math.min(req.endMin, outMin);
  const suggested = Math.min(asked, floorQuarter(Math.max(0, otHours(from, to))));
  if (suggested >= asked) return { inMin, outMin, suggested, proposed: asked, state: "match", note: "ตรงตามที่ขอ" };

  /* บอกว่าตัดเพราะออกก่อน หรือเข้าช้ากว่าเวลาที่ขอ (โอทีวันหยุด) */
  const why =
    outMin < req.endMin
      ? `ตอกบัตรออก ${hhmm(outMin)} น.`
      : inMin != null && inMin > req.startMin
        ? `ตอกบัตรเข้า ${hhmm(inMin)} น.`
        : "ช่วงที่ขอไม่ตรงกับเวลาตอกบัตร";
  return {
    inMin, outMin, suggested, proposed: suggested, state: "cut",
    note: `${why} — เสนอ ${h2(suggested)} ชม. จากที่ขอ ${h2(asked)}`,
  };
}

/** ข้อความเหตุผลอัตโนมัติเมื่อผู้อนุมัติปรับชั่วโมงแต่ไม่ได้พิมพ์เหตุผล */
export function adjustNote(approved: number, asked: number, a: OtActual) {
  if (approved === asked) return "";
  return a.suggested != null && approved === a.suggested
    ? `ปรับเป็น ${h2(approved)} ชม. ตามเวลาตอกบัตรจริง`
    : `ปรับเป็น ${h2(approved)} ชม. จากที่ขอ ${h2(asked)} ชม.`;
}
