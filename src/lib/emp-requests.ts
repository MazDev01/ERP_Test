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
import { companySchedule, minutesOfDay } from "./work-schedule";
import { fmtLeaveHours, leaveHoursOfDays } from "./leave-data";

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
  { id: "LV-2569-0013", emp: "E08", to: "gm", kind: "leave", leaveType: "ลาป่วย", from: "2026-09-07", toDate: "2026-09-07", days: 0.375, span: "half", period: "am", start: "09:00", end: "13:00", files: ["ใบนัดทันตแพทย์.pdf"], note: "พบทันตแพทย์ตามนัด", at: "2026-09-06 20:31", status: "pending" },
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

  /* ── ตัวอย่างรอบปัจจุบัน ปลาย ก.ย. – ต.ค. 2569 (เจ้าของสั่ง 8 ต.ค. 2569) — เติมเข้าเครื่องเดิมผ่าน addNewSeed ── */
  /* คิวผู้บริหาร (/ceo/approvals) */
  { id: "OT-2569-0060", emp: "E03", to: "exec", kind: "ot", date: "2026-10-05", start: "18:00", end: "21:00", hours: 3, holiday: false, note: "แก้บั๊กระบบสต็อกของพูลผลอะไหล่ก่อนส่งมอบ", at: "2026-10-05 21:15", status: "pending" },
  { id: "OT-2569-0061", emp: "E04", to: "exec", kind: "ot", date: "2026-10-10", start: "09:00", end: "15:00", hours: 5, holiday: true, note: "ติดตั้งเครือข่ายและกล้องวงจรปิดที่บุญมีฟาร์ม ลูกค้าสะดวกวันเสาร์", at: "2026-10-07 10:05", status: "pending" },
  { id: "OT-2569-0062", emp: "E09", to: "exec", kind: "ot", date: "2026-10-06", start: "18:00", end: "20:30", hours: 2.5, holiday: false, note: "สำรองข้อมูลและอัปเดตเซิร์ฟเวอร์ลูกค้านอกเวลาทำการ", at: "2026-10-06 20:40", status: "pending" },
  { id: "OT-2569-0063", emp: "E06", to: "exec", kind: "ot", date: "2026-09-29", start: "18:00", end: "20:00", hours: 2, holiday: false, note: "ย้ายระบบอีเมลของอัลฟ่าคอร์ปขึ้นเซิร์ฟเวอร์ใหม่", at: "2026-09-29 20:10", status: "approved", decidedAt: "2026-09-30 09:10" },
  { id: "OT-2569-0064", emp: "E08", to: "exec", kind: "ot", date: "2026-10-01", start: "18:00", end: "19:30", hours: 1.5, holiday: false, note: "ทดสอบรายงานยอดขายก่อนส่งลูกค้า", at: "2026-10-01 19:40", status: "rejected", reason: "ทดสอบในเวลางานพรุ่งนี้ได้ ลูกค้ายังไม่ต้องใช้", decidedAt: "2026-10-02 08:50" },
  /* คิวของ GM — ทีมงานที่ยังไม่มีบัญชีเข้าระบบ */
  { id: "OT-2569-0065", emp: "E07", to: "gm", kind: "ot", date: "2026-10-07", start: "18:00", end: "20:00", hours: 2, holiday: false, note: "ทดสอบแอปจองคิวบนมือถือรอบสุดท้าย", at: "2026-10-07 20:10", status: "pending" },
  { id: "LV-2569-0050", emp: "E13", to: "gm", kind: "leave", leaveType: "ลาป่วย", from: "2026-10-06", toDate: "2026-10-06", days: 1, span: "full", files: ["ใบรับรองแพทย์.pdf"], note: "ท้องเสีย ไปโรงพยาบาล", at: "2026-10-06 07:50", status: "pending" },
  { id: "LV-2569-0051", emp: "E02", to: "gm", kind: "leave", leaveType: "ลากิจ", from: "2026-10-12", toDate: "2026-10-12", days: 1, span: "full", files: [], note: "ไปทำเรื่องโอนรถที่ขนส่ง", at: "2026-10-05 16:20", status: "pending" },
  { id: "LV-2569-0052", emp: "E17", to: "gm", kind: "leave", leaveType: "ลาพักร้อน", from: "2026-10-19", toDate: "2026-10-21", days: 3, span: "full", files: [], note: "กลับบ้านที่น่านช่วงงานบุญ", at: "2026-10-04 11:35", status: "pending" },
  { id: "LV-2569-0053", emp: "E03", to: "gm", kind: "leave", leaveType: "ลาป่วย", from: "2026-09-30", toDate: "2026-09-30", days: 1, span: "full", files: [], note: "เป็นไข้หวัด", at: "2026-09-30 07:35", status: "approved", decidedAt: "2026-09-30 08:40" },
  { id: "LV-2569-0054", emp: "E09", to: "gm", kind: "leave", leaveType: "ลากิจ", from: "2026-10-02", toDate: "2026-10-02", days: 0.375, span: "half", period: "am", start: "09:00", end: "12:00", files: [], note: "พาลูกไปฉีดวัคซีน", at: "2026-09-30 17:05", status: "approved", decidedAt: "2026-10-01 09:00" },
  { id: "LV-2569-0055", emp: "E06", to: "gm", kind: "leave", leaveType: "ลาพักร้อน", from: "2026-10-26", toDate: "2026-10-27", days: 2, span: "full", files: [], note: "พักผ่อน", at: "2026-10-03 10:00", status: "rejected", reason: "ช่วงนั้นมีงานติดตั้งที่บุญมีฟาร์ม ขอเลื่อนเป็นต้นเดือน พ.ย.", decidedAt: "2026-10-03 14:30" },
  { id: "EX-2569-0027", emp: "E04", to: "gm", kind: "expense", month: "2026-09", plate: "3กก 5521 เชียงใหม่", note: "", at: "2026-10-01 08:45", status: "pending", fuel: [
    { date: "2026-09-12", place: "ออฟฟิศ – บุญมีฟาร์ม อ.สันทราย", km: 41, work: "สำรวจจุดติดตั้งกล้องวงจรปิด", note: "" },
    { date: "2026-09-26", place: "ออฟฟิศ – มั่นคงก่อสร้าง ไซต์งาน", km: 76, work: "ติดตั้งอุปกรณ์เครือข่ายหน้างาน", note: "" },
  ] },
  { id: "EX-2569-0028", emp: "E09", to: "gm", kind: "expense", month: "2026-09", plate: "4กข 1180 เชียงใหม่", note: "", at: "2026-10-02 09:30", status: "pending", fuel: [
    { date: "2026-09-17", place: "ออฟฟิศ – สยามพลาสติก อ.เมือง", km: 48, work: "ตรวจเช็กเซิร์ฟเวอร์ประจำเดือน", note: "" },
  ] },
  { id: "EX-2569-0029", emp: "E06", to: "gm", kind: "expense", month: "2026-09", plate: "2กท 0391 เชียงใหม่", note: "", at: "2026-09-30 17:20", status: "approved", decidedAt: "2026-10-01 10:15", fuel: [
    { date: "2026-09-09", place: "ออฟฟิศ – อัลฟ่าคอร์ป สาขาเชียงใหม่", km: 12, work: "ย้ายระบบอีเมลลูกค้า", note: "" },
    { date: "2026-09-22", place: "ออฟฟิศ – บุญมีฟาร์ม อ.สันทราย", km: 41, work: "ตั้งค่าอินเทอร์เน็ตหน้างาน", note: "" },
  ] },

  /* ── ตัวอย่างที่อนุมัติแล้วทั้งปี 2569 ให้กราฟ OT และค่าเดินทางของแดชบอร์ด GM มีข้อมูลทุกช่วง (เจ้าของสั่ง 20 ต.ค. 2569)
        เติมเข้าเครื่องเดิมผ่าน addNewSeed · ทุกวันที่ไม่เกิน 20 ต.ค. 2569 · วันทำงานปกติ ไม่ชนวันหยุด ── */
  { id: "OT-2569-0070", emp: "E03", to: "gm", kind: "ot", date: "2026-10-06", start: "18:00", end: "19:30", hours: 1.5, holiday: false, note: "แก้รายงานสต็อกให้พูลผลอะไหล่", at: "2026-10-06 19:40", status: "approved", decidedAt: "2026-10-07 09:00" },
  { id: "OT-2569-0071", emp: "E02", to: "gm", kind: "ot", date: "2026-10-08", start: "18:00", end: "20:00", hours: 2, holiday: false, note: "เตรียมเอกสารส่งมอบงานอัลฟ่าคอร์ป", at: "2026-10-08 20:10", status: "approved", decidedAt: "2026-10-09 08:45" },
  { id: "OT-2569-0072", emp: "E09", to: "gm", kind: "ot", date: "2026-10-14", start: "18:00", end: "21:00", hours: 3, holiday: false, note: "อัปเดตเซิร์ฟเวอร์ลูกค้านอกเวลาทำการ", at: "2026-10-14 21:10", status: "approved", decidedAt: "2026-10-15 09:05" },
  { id: "OT-2569-0073", emp: "E08", to: "gm", kind: "ot", date: "2026-10-16", start: "18:00", end: "20:30", hours: 2.5, holiday: false, note: "ทดสอบระบบจองคิวก่อนเปิดใช้จริง", at: "2026-10-16 20:40", status: "approved", decidedAt: "2026-10-17 08:30" },
  { id: "OT-2569-0074", emp: "E06", to: "gm", kind: "ot", date: "2026-10-19", start: "18:00", end: "20:00", hours: 2, holiday: false, note: "ตั้งค่าเครือข่ายสำนักงานลูกค้าใหม่", at: "2026-10-19 20:10", status: "approved", decidedAt: "2026-10-20 08:40" },
  { id: "OT-2569-0075", emp: "E04", to: "gm", kind: "ot", date: "2026-09-16", start: "18:00", end: "21:00", hours: 3, holiday: false, note: "ติดตั้งอุปกรณ์เครือข่ายหน้างาน", at: "2026-09-16 21:10", status: "approved", decidedAt: "2026-09-17 09:00" },
  { id: "OT-2569-0076", emp: "E07", to: "gm", kind: "ot", date: "2026-08-19", start: "18:00", end: "20:00", hours: 2, holiday: false, note: "ทดสอบแอปบนมือถือรอบสุดท้าย", at: "2026-08-19 20:15", status: "approved", decidedAt: "2026-08-20 09:00" },
  { id: "OT-2569-0077", emp: "E09", to: "gm", kind: "ot", date: "2026-08-26", start: "18:00", end: "20:30", hours: 2.5, holiday: false, note: "สำรองข้อมูลระบบลูกค้า", at: "2026-08-26 20:40", status: "approved", decidedAt: "2026-08-27 08:50" },
  { id: "OT-2569-0078", emp: "E03", to: "gm", kind: "ot", date: "2026-07-22", start: "18:00", end: "21:00", hours: 3, holiday: false, note: "แก้บั๊กก่อนส่งมอบงาน", at: "2026-07-22 21:10", status: "approved", decidedAt: "2026-07-23 09:10" },
  { id: "OT-2569-0079", emp: "E08", to: "gm", kind: "ot", date: "2026-06-17", start: "18:00", end: "20:00", hours: 2, holiday: false, note: "ทำรายงานยอดขายให้ลูกค้า", at: "2026-06-17 20:10", status: "approved", decidedAt: "2026-06-18 09:00" },
  { id: "OT-2569-0080", emp: "E02", to: "gm", kind: "ot", date: "2026-05-20", start: "18:00", end: "21:30", hours: 3.5, holiday: false, note: "เตรียมเอกสารประกวดราคา", at: "2026-05-20 21:40", status: "approved", decidedAt: "2026-05-21 08:45" },
  { id: "OT-2569-0081", emp: "E06", to: "gm", kind: "ot", date: "2026-04-22", start: "18:00", end: "19:30", hours: 1.5, holiday: false, note: "ย้ายฐานข้อมูลนอกเวลาทำการ", at: "2026-04-22 19:40", status: "approved", decidedAt: "2026-04-23 09:00" },
  { id: "OT-2569-0082", emp: "E04", to: "gm", kind: "ot", date: "2026-03-26", start: "18:00", end: "21:00", hours: 3, holiday: false, note: "ติดตั้งกล้องวงจรปิดหน้างาน", at: "2026-03-26 21:10", status: "approved", decidedAt: "2026-03-27 09:00" },
  { id: "OT-2569-0083", emp: "E07", to: "gm", kind: "ot", date: "2026-02-18", start: "18:00", end: "20:00", hours: 2, holiday: false, note: "ทดสอบระบบก่อนขึ้นใช้งานจริง", at: "2026-02-18 20:10", status: "approved", decidedAt: "2026-02-19 08:50" },
  { id: "OT-2569-0084", emp: "E09", to: "gm", kind: "ot", date: "2026-01-15", start: "18:00", end: "20:30", hours: 2.5, holiday: false, note: "อัปเดตเซิร์ฟเวอร์ลูกค้าประจำปี", at: "2026-01-15 20:40", status: "approved", decidedAt: "2026-01-16 09:00" },
  { id: "EX-2569-0070", emp: "E04", to: "gm", kind: "expense", month: "2026-10", plate: "3กก 5521 เชียงใหม่", note: "", at: "2026-10-19 17:30", status: "approved", decidedAt: "2026-10-20 08:30", fuel: [
    { date: "2026-10-02", place: "ออฟฟิศ – บุญมีฟาร์ม อ.สันทราย", km: 41, work: "ตรวจกล้องวงจรปิดหลังติดตั้ง", note: "" },
    { date: "2026-10-08", place: "ออฟฟิศ – มั่นคงก่อสร้าง ไซต์งาน", km: 76, work: "เดินสายเครือข่ายหน้างาน", note: "" },
    { date: "2026-10-16", place: "ออฟฟิศ – สยามพลาสติก อ.เมือง", km: 48, work: "ตรวจเช็กเซิร์ฟเวอร์ประจำเดือน", note: "" },
  ] },
  { id: "EX-2569-0071", emp: "E09", to: "gm", kind: "expense", month: "2026-10", plate: "4กข 1180 เชียงใหม่", note: "", at: "2026-10-19 18:05", status: "approved", decidedAt: "2026-10-20 08:35", fuel: [
    { date: "2026-10-06", place: "ออฟฟิศ – อัลฟ่าคอร์ป สาขาเชียงใหม่", km: 12, work: "อบรมผู้ใช้ระบบใหม่", note: "" },
    { date: "2026-10-14", place: "ออฟฟิศ – เอ็มเทคเอ็นจิเนียริ่ง อ.สารภี", km: 34, work: "ติดตั้งระบบสำรองข้อมูล", note: "" },
    { date: "2026-10-19", place: "ออฟฟิศ – ครัวคุณจิ ถ.ช้างคลาน", km: 22, work: "ส่งมอบระบบจองคิว", note: "" },
  ] },
  { id: "EX-2569-0072", emp: "E09", to: "gm", kind: "expense", month: "2026-09", plate: "4กข 1180 เชียงใหม่", note: "", at: "2026-10-01 09:10", status: "approved", decidedAt: "2026-10-02 10:00", fuel: [
    { date: "2026-09-03", place: "ออฟฟิศ – มั่นคงก่อสร้าง ไซต์งาน", km: 76, work: "สำรวจหน้างานก่อนเสนอราคา", note: "" },
    { date: "2026-09-24", place: "ออฟฟิศ – อัลฟ่าคอร์ป สาขาเชียงใหม่", km: 12, work: "ตรวจเช็กระบบอีเมล", note: "" },
  ] },
  { id: "EX-2569-0073", emp: "E04", to: "gm", kind: "expense", month: "2026-08", plate: "3กก 5521 เชียงใหม่", note: "", at: "2026-09-01 08:40", status: "approved", decidedAt: "2026-09-02 09:30", fuel: [
    { date: "2026-08-06", place: "ออฟฟิศ – บุญมีฟาร์ม อ.สันทราย", km: 41, work: "สำรวจอินเทอร์เน็ตหน้างาน", note: "" },
    { date: "2026-08-20", place: "ออฟฟิศ – เอ็มเทคเอ็นจิเนียริ่ง อ.สารภี", km: 34, work: "ติดตั้งเครื่องแม่ข่าย", note: "" },
  ] },
  { id: "EX-2569-0074", emp: "E06", to: "gm", kind: "expense", month: "2026-07", plate: "2กท 0391 เชียงใหม่", note: "", at: "2026-08-01 09:00", status: "approved", decidedAt: "2026-08-03 09:15", fuel: [
    { date: "2026-07-08", place: "ออฟฟิศ – มั่นคงก่อสร้าง ไซต์งาน", km: 76, work: "ติดตั้งจุดกระจายสัญญาณ", note: "" },
    { date: "2026-07-23", place: "ออฟฟิศ – สยามพลาสติก อ.เมือง", km: 48, work: "ตรวจเช็กเซิร์ฟเวอร์ประจำเดือน", note: "" },
  ] },
  { id: "EX-2569-0075", emp: "E04", to: "gm", kind: "expense", month: "2026-06", plate: "3กก 5521 เชียงใหม่", note: "", at: "2026-07-01 08:50", status: "approved", decidedAt: "2026-07-02 09:00", fuel: [
    { date: "2026-06-10", place: "ออฟฟิศ – บุญมีฟาร์ม อ.สันทราย", km: 41, work: "บำรุงรักษากล้องวงจรปิด", note: "" },
  ] },
  { id: "EX-2569-0076", emp: "E09", to: "gm", kind: "expense", month: "2026-05", plate: "4กข 1180 เชียงใหม่", note: "", at: "2026-06-01 09:20", status: "approved", decidedAt: "2026-06-02 09:10", fuel: [
    { date: "2026-05-13", place: "ออฟฟิศ – เอ็มเทคเอ็นจิเนียริ่ง อ.สารภี", km: 34, work: "เก็บความต้องการระบบใหม่", note: "" },
    { date: "2026-05-27", place: "ออฟฟิศ – มั่นคงก่อสร้าง ไซต์งาน", km: 76, work: "สำรวจหน้างาน", note: "" },
  ] },
  { id: "EX-2569-0077", emp: "E06", to: "gm", kind: "expense", month: "2026-04", plate: "2กท 0391 เชียงใหม่", note: "", at: "2026-05-04 08:45", status: "approved", decidedAt: "2026-05-05 09:00", fuel: [
    { date: "2026-04-08", place: "ออฟฟิศ – อัลฟ่าคอร์ป สาขาเชียงใหม่", km: 12, work: "ติดตั้งเครื่องพิมพ์เครือข่าย", note: "" },
    { date: "2026-04-22", place: "ออฟฟิศ – สยามพลาสติก อ.เมือง", km: 48, work: "ตรวจเช็กเซิร์ฟเวอร์ประจำเดือน", note: "" },
  ] },
  { id: "EX-2569-0078", emp: "E04", to: "gm", kind: "expense", month: "2026-03", plate: "3กก 5521 เชียงใหม่", note: "", at: "2026-04-01 09:00", status: "approved", decidedAt: "2026-04-02 09:20", fuel: [
    { date: "2026-03-04", place: "ออฟฟิศ – มั่นคงก่อสร้าง ไซต์งาน", km: 76, work: "เดินสายเครือข่ายอาคารใหม่", note: "" },
    { date: "2026-03-18", place: "ออฟฟิศ – บุญมีฟาร์ม อ.สันทราย", km: 41, work: "สำรวจจุดติดตั้งกล้อง", note: "" },
  ] },
  { id: "EX-2569-0079", emp: "E09", to: "gm", kind: "expense", month: "2026-02", plate: "4กข 1180 เชียงใหม่", note: "", at: "2026-03-02 08:55", status: "approved", decidedAt: "2026-03-03 09:00", fuel: [
    { date: "2026-02-11", place: "ออฟฟิศ – เอ็มเทคเอ็นจิเนียริ่ง อ.สารภี", km: 34, work: "อบรมผู้ใช้ระบบ", note: "" },
  ] },
  { id: "EX-2569-0080", emp: "E06", to: "gm", kind: "expense", month: "2026-01", plate: "2กท 0391 เชียงใหม่", note: "", at: "2026-02-02 09:05", status: "approved", decidedAt: "2026-02-03 09:10", fuel: [
    { date: "2026-01-21", place: "ออฟฟิศ – สยามพลาสติก อ.เมือง", km: 48, work: "ตรวจเช็กเซิร์ฟเวอร์ประจำเดือน", note: "" },
    { date: "2026-01-28", place: "ออฟฟิศ – อัลฟ่าคอร์ป สาขาเชียงใหม่", km: 12, work: "ย้ายระบบอีเมล", note: "" },
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

/**
 * ชั่วโมงลาของคำขอลาในคิวรายรหัส — ไม่เต็มวันคิดจากเวลาเริ่ม–สิ้นสุดหักพักเที่ยง (สูตรเดียวกับ reqLeaveHours ใน hr-link.ts)
 * เต็มวัน/ไม่มีเวลา = days × 8 (ผู้ใช้สั่ง 19 ต.ค. 2569) — ใช้แสดงผลเท่านั้น
 */
export function empReqLeaveHours(r: Pick<EmpRequest, "days" | "span" | "start" | "end">) {
  if (r.span === "half" && r.start && r.end) {
    const sch = companySchedule();
    const a = minutesOfDay(r.start);
    const b = minutesOfDay(r.end);
    const lunch = Math.max(0, Math.min(b, minutesOfDay(sch.lunchEnd)) - Math.max(a, minutesOfDay(sch.lunchStart)));
    const m = Math.max(0, b - a - lunch);
    if (m > 0) return m / 60;
  }
  return leaveHoursOfDays(r.days ?? 0);
}

/** จำนวนการลาของคำขอเป็นข้อความ — "3 ชม." · "2 วัน" · "1 วัน 4 ชม." (ผู้ใช้สั่ง 19 ต.ค. 2569) */
export function empReqLeaveText(r: Pick<EmpRequest, "days" | "span" | "start" | "end">) {
  return fmtLeaveHours(empReqLeaveHours(r));
}
