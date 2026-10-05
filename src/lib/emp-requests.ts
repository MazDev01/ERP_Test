/*
 * คำขอของพนักงานที่ยังไม่มีบัญชีเข้าระบบ — ใบลาและโอทีที่ขึ้นถึงผู้อนุมัติตามตำแหน่ง
 *
 * ใบลา/โอทีในระบบเก็บตามบทบาท (leave-store, ot-store) เพราะหนึ่งบทบาทคือหนึ่งคนที่ล็อกอินได้
 * แต่ต้นแบบมีคำขอจากทีมงานอีกหลายคน (SA, Dev, Website) ที่ CEO ต้องตัดสิน (CEO-BR-02)
 * จึงเก็บแยกตามรหัสพนักงานที่นี่ · ผลการตัดสินบันทึกกลับที่คำขอเอง (CEO-BR-01)
 *
 * ชุดตั้งต้นตามต้นแบบ dose-erp-maz/ceo-approvals.html (CEO_REQ ของคนที่ไม่มีบทบาทในระบบ)
 * + คิวของ PM ตามต้นแบบ pm-approvals.html (PM_APPROVALS) — โอทีและใบเบิกค่าน้ำมันของทีม
 *   OT ของตำแหน่ง SA / Dev / Website ไม่เข้าคิว PM (ต้นแบบ toCeo) ขึ้นถึง CEO แทน
 *   ชุดนั้นอยู่ในคิว CEO ด้านบนแล้ว (OT-2569-0011/012/015) และ OT ของ E05 เป็นใบของบทบาทพนักงานใน ot-store
 * + คิวของ GM ตามต้นแบบ gm-approvals.html (22 ก.ย. 2569) — ใบลาทุกตำแหน่ง ยกเว้น GM บัญชีและบุคคล และนักศึกษาฝึกงาน
 *   ใบลาชุด LV-2569-0008/0012/0013 เดิมอยู่คิว PM ต้นแบบชุดใหม่ย้ายไป GM (PM ไม่อนุมัติการลา เห็นแค่วันลาในหน้าวางแผน)
 *   ใบลา LV-2569-0019 และ OT-2569-0016 ของ E10 (PM) ในต้นแบบไม่ได้ใส่ที่นี่ เพราะ PM มีบัญชีเข้าระบบ
 *   ใบของ PM อยู่ใน leave-store / ot-store ของบทบาท pm และขึ้น GM ตามสายอนุมัติอยู่แล้ว (role.ts)
 */

import { useSyncExternalStore } from "react";
import { bkkStamp } from "./format";
import { createPersistedStore } from "./persisted-store";

export type EmpRequest = {
  id: string;
  /** รหัสพนักงานในทะเบียนฝ่ายบุคคล */
  emp: string;
  /** ผู้อนุมัติ — exec = ผู้บริหาร (หน้า /ceo/approvals) · pm = ผู้จัดการโครงการ · gm = ผู้จัดการทั่วไป (หน้า /approvals) */
  to: "exec" | "pm" | "gm";
  kind: "leave" | "ot" | "expense";
  /* ใบลา */
  leaveType?: string;
  from?: string;
  toDate?: string;
  days?: number;
  /** วันลาประเภทนี้ที่ใช้ไปแล้วก่อนใบนี้ */
  used?: number;
  /** ลาครึ่งวัน — ช่วงเช้า/บ่าย ใช้ start/end เป็นเวลา */
  span?: "full" | "half";
  period?: "am" | "pm";
  /** เอกสารแนบของใบลา — ยังไม่มีที่เก็บไฟล์จริง เก็บแค่ชื่อ */
  files?: string[];
  /* ใบเบิกค่าน้ำมัน */
  /** รอบเดือน yyyy-mm */
  month?: string;
  plate?: string;
  fuel?: { date: string; place: string; km: number; work: string; note: string }[];
  /* โอที */
  date?: string;
  start?: string;
  end?: string;
  hours?: number;
  /** ชั่วโมงที่ผู้อนุมัติอนุมัติจริง (ปรับตามเวลาตอกบัตร) — ไม่มี = เท่าที่ขอ */
  approvedHours?: number;
  /** ทำในวันหยุด */
  holiday?: boolean;
  note: string;
  /** "yyyy-mm-dd hh:mm" เวลาที่ยื่น */
  at: string;
  status: "pending" | "approved" | "rejected";
  decidedAt?: string;
  reason?: string;
};

const SEED: EmpRequest[] = [
  { id: "OT-2569-0018", emp: "E01", to: "exec", kind: "ot", date: "2026-09-02", start: "18:00", end: "20:00", hours: 2, holiday: false, note: "ปรับหน้ารายงานให้ลูกค้าอัลฟ่าคอร์ป", at: "2026-09-02 20:05", status: "rejected", reason: "งานนี้ยังไม่เร่ง ให้ทำในเวลางานพรุ่งนี้", decidedAt: "2026-09-03 09:15" },
  { id: "OT-2569-0021", emp: "E01", to: "exec", kind: "ot", date: "2026-09-06", start: "18:00", end: "21:00", hours: 3, holiday: false, note: "แก้ระบบจองคิวให้ทันส่งมอบวันจันทร์", at: "2026-09-06 21:10", status: "pending" },
  { id: "OT-2569-0022", emp: "E04", to: "exec", kind: "ot", date: "2026-09-05", start: "10:00", end: "15:00", hours: 5, holiday: true, note: "ย้ายเซิร์ฟเวอร์ลูกค้า ต้องทำตอนไม่มีคนใช้งาน", at: "2026-09-05 15:20", status: "pending" },
  { id: "OT-2569-0015", emp: "E08", to: "exec", kind: "ot", date: "2026-08-29", start: "09:00", end: "12:00", hours: 3, holiday: true, note: "ทดสอบระบบก่อนขึ้นใช้งานจริง", at: "2026-08-29 12:10", status: "approved", decidedAt: "2026-08-31 08:40" },
  { id: "OT-2569-0011", emp: "E03", to: "exec", kind: "ot", date: "2026-09-04", start: "18:00", end: "21:30", hours: 3.5, holiday: false, note: "แก้บั๊กหน้าเมนูของครัวคุณจิก่อนส่งลูกค้า", at: "2026-09-04 21:40", status: "pending" },
  { id: "OT-2569-0012", emp: "E04", to: "exec", kind: "ot", date: "2026-09-05", start: "09:00", end: "17:00", hours: 8, holiday: true, note: "ติดตั้งระบบหน้างานลูกค้า นัดวันเสาร์ตามที่ลูกค้าสะดวก", at: "2026-09-05 17:15", status: "pending" },
  { id: "OT-2569-0015", emp: "E06", to: "exec", kind: "ot", date: "2026-09-06", start: "18:00", end: "19:30", hours: 1.5, holiday: false, note: "ย้ายฐานข้อมูลขึ้นเซิร์ฟเวอร์ใหม่ ต้องทำนอกเวลาทำการ", at: "2026-09-06 19:40", status: "pending" },

  /* ── คิวของ PM (ต้นแบบ pm-approvals.html PM_APPROVALS) ── */
  { id: "OT-2569-0013", emp: "E07", to: "gm", kind: "ot", date: "2026-09-07", start: "18:00", end: "20:00", hours: 2, holiday: false, note: "ทดสอบระบบจองโต๊ะรอบสุดท้ายก่อนส่งมอบ", at: "2026-09-07 09:40", status: "pending" },
  /* ── คิวของ GM (ต้นแบบ gm-approvals.html) — ใบลาของทีมที่ยังไม่มีบัญชีเข้าระบบ ── */
  { id: "LV-2569-0018", emp: "E13", to: "gm", kind: "leave", leaveType: "ลากิจ", from: "2026-09-14", toDate: "2026-09-14", days: 1, span: "full", files: [], note: "ติดต่อราชการ", at: "2026-09-06 18:40", status: "pending" },
  { id: "LV-2569-0008", emp: "E02", to: "gm", kind: "leave", leaveType: "ลาพักร้อน", from: "2026-09-21", toDate: "2026-09-25", days: 5, span: "full", files: [], note: "พักผ่อนประจำปี", at: "2026-09-04 17:26", status: "pending" },
  { id: "LV-2569-0012", emp: "E06", to: "gm", kind: "leave", leaveType: "ลากิจ", from: "2026-09-11", toDate: "2026-09-11", days: 1, span: "full", files: [], note: "ติดต่อราชการที่อำเภอ", at: "2026-09-07 08:15", status: "pending" },
  { id: "LV-2569-0013", emp: "E08", to: "gm", kind: "leave", leaveType: "ลาป่วย", from: "2026-09-07", toDate: "2026-09-07", days: 0.5, span: "half", period: "am", start: "09:00", end: "13:00", files: ["ใบนัดทันตแพทย์.pdf"], note: "พบทันตแพทย์ตามนัด", at: "2026-09-06 20:31", status: "pending" },
  { id: "EX-2569-0006", emp: "E01", to: "gm", kind: "expense", month: "2026-08", plate: "1กจ 4471 เชียงใหม่", note: "", at: "2026-09-01 09:12", status: "pending", fuel: [
    { date: "2026-08-18", place: "ออฟฟิศ – เอ็มเทคเอ็นจิเนียริ่ง อ.สารภี", km: 34, work: "เก็บความต้องการรอบสอง", note: "" },
    { date: "2026-08-27", place: "ออฟฟิศ – สยามพลาสติก ต.หนองหอย", km: 18, work: "ยืนยันขอบเขตงานกับลูกค้า", note: "จอดเสียค่าที่จอด 40 บาท ไม่ได้เบิก" },
  ] },
  { id: "EX-2569-0007", emp: "E05", to: "gm", kind: "expense", month: "2026-08", plate: "ขค 8812 เชียงใหม่", note: "", at: "2026-09-01 11:48", status: "pending", fuel: [
    { date: "2026-08-21", place: "ออฟฟิศ – ครัวคุณจิ ถ.ช้างคลาน", km: 22, work: "ถ่ายภาพหน้าร้านทำเนื้อหาเว็บ", note: "" },
  ] },
  { id: "EX-2569-0008", emp: "E06", to: "gm", kind: "expense", month: "2026-08", plate: "2กท 0391 เชียงใหม่", note: "", at: "2026-09-02 08:55", status: "pending", fuel: [
    { date: "2026-08-12", place: "ออฟฟิศ – บุญมีฟาร์ม อ.สันทราย", km: 41, work: "สำรวจอินเทอร์เน็ตหน้างานก่อนติดตั้ง", note: "เติมน้ำมันเอง" },
    { date: "2026-08-29", place: "ออฟฟิศ – อัลฟ่าคอร์ป สาขาเชียงใหม่", km: 12, work: "อบรมผู้ใช้รอบที่ 2", note: "" },
  ] },
];

/**
 * เติมคำขอที่เพิ่มเข้าชุดตั้งต้นทีหลัง (คิวของ PM 21 ก.ย. · คิวของ GM 22 ก.ย.) — ไม่ทับผลที่ตัดสินไปแล้วในเครื่อง
 * ผู้อนุมัติ (to) ของใบตั้งต้นตามชุดตั้งต้นล่าสุดเสมอ — ใบลาที่เคยอยู่คิว PM ย้ายไป GM ตามต้นแบบใหม่
 */
function addNewSeed(list: EmpRequest[]): EmpRequest[] {
  const seedTo = new Map(SEED.map((r) => [r.id, r.to]));
  const moved = list.map((r) => {
    const to = seedTo.get(r.id);
    return to && to !== r.to ? { ...r, to } : r;
  });
  const have = new Set(list.map((r) => r.id));
  const add = SEED.filter((r) => !have.has(r.id));
  return [...moved, ...add];
}

const store = createPersistedStore<EmpRequest[]>(
  "maz-erp.emp-requests.v1",
  SEED,
  (v): v is EmpRequest[] => Array.isArray(v),
  addNewSeed,
);

export function useEmpRequests() {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

/**
 * เลขที่เอกสารของคำขอชนิดหนึ่ง — ใบลา/ใบเบิกของบทบาทเดินเลขต่อจากชุดนี้ด้วย
 * ถ้าไม่รวม เลขใหม่จะไปซ้ำกับใบที่ค้างอยู่ในคิวของ GM
 */
export function empRequestIds(kind: EmpRequest["kind"]) {
  return store.get().filter((r) => r.kind === kind).map((r) => r.id);
}

/** ยอดเบิกค่าน้ำมันของใบเบิก — ระยะรวม × อัตราต่อกิโลเมตร */
export function empFuelKm(r: EmpRequest) {
  return (r.fuel ?? []).reduce((a, x) => a + (Number(x.km) || 0), 0);
}

/**
 * ตัดสินคำขอ — อนุมัติทันที · ไม่อนุมัติต้องมีเหตุผล (CEO-BR-03)
 * โอทีส่ง approvedHours มาได้เมื่อผู้อนุมัติปรับชั่วโมงตามเวลาตอกบัตรจริง
 */
export function decideEmpRequest(id: string, approve: boolean, reason = "", approvedHours?: number) {
  store.update((list) =>
    list.map((r) =>
      r.id === id && r.status === "pending"
        ? {
            ...r,
            status: approve ? ("approved" as const) : ("rejected" as const),
            reason,
            decidedAt: bkkStamp(),
            ...(approve && approvedHours !== undefined ? { approvedHours } : {}),
          }
        : r,
    ),
  );
}
