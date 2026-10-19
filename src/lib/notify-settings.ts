/*
 * เรื่องที่แจ้งเตือน (topic) — ระบบเลือกให้เองตามบทบาทของบัญชี ไม่มีให้ผู้ใช้เปิด/ปิดรายเรื่องแล้ว
 * (ผู้ใช้สั่ง 16 ต.ค. 2569) หน้าโปรไฟล์เหลือแค่เปิด/ปิดการแจ้งเตือนบนอุปกรณ์ (ดู push-subs.ts)
 *
 * เก็บเป็นข้อมูลไว้ให้ฝั่งส่ง push (backend ที่ยังไม่ได้สร้าง) ใช้ตัดสินว่าจะส่งเรื่องไหนให้ใคร
 * กระดิ่งในแอปไม่อ่านไฟล์นี้เพื่อกรอง — บันทึกทุกเรื่องเสมอ ไม่ขึ้นกับสิทธิ์แจ้งเตือนของเบราว์เซอร์
 *
 * ตารางนี้คือตารางแจ้งเตือนที่เจ้าของอนุมัติ (ผู้ใช้สั่ง 16 ต.ค. 2569)
 *   level "act"  = 🔴 ต้องลงมือทำ (action บอกว่าทำอะไร)
 *   level "info" = ⚪ แจ้งให้ทราบอย่างเดียว
 * เลิกเรื่อง "ลืมเช็คเอาท์" แล้ว (ผู้ใช้สั่ง 16 ต.ค. 2569) — อย่าเพิ่มกลับ
 */

import type { Role } from "./role";
import { companySchedule, type DaySchedule } from "./work-schedule";

/**
 * กลุ่มผู้รับ (ผู้ใช้สั่ง 16 ต.ค. 2569)
 * employees = พนักงานทุกคนที่ลงเวลา รวมนักศึกษาฝึกงาน ยกเว้น CEO
 * staff = ทีมงานที่รับงานโปรเจค · psTarget = คนที่คำขอก่อนการขายส่งถึง (ระบุตัวคน บทบาทใดก็ได้)
 * pm = ผู้จัดการโครงการ — GM ได้ชุดของ PM ทั้งหมดด้วย
 */
export type NotifyAudience = "employees" | "staff" | "sales" | "psTarget" | "acc" | "hr" | "pm" | "gm" | "ceo";

export type NotifyLevel = "act" | "info";

type NotifyEvent = {
  key: string;
  title: string;
  /** สิ่งที่ผู้รับต้องทำ — ว่างเมื่อเป็นเรื่องแจ้งให้ทราบ */
  action: string;
  level: NotifyLevel;
  audience: NotifyAudience;
  /** นักศึกษาฝึกงานไม่ได้รับ (สลิปเงินเดือน) */
  noIntern?: boolean;
};

export const NOTIFY_EVENTS = [
  // ── พนักงานทุกคนที่ลงเวลา (รวมฝึกงาน ยกเว้น CEO) ──
  { key: "checkin", title: "10 นาทีก่อนเวลาเข้างาน", action: "เช็คอิน", level: "act", audience: "employees" },
  { key: "checkout", title: "ถึงเวลาเลิกงาน", action: "เช็คเอาท์", level: "act", audience: "employees" },
  { key: "leave", title: "คำขอลา/โอที/เบิกค่าใช้จ่าย ไม่อนุมัติ", action: "อ่านเหตุผล แล้วยื่นใหม่ถ้าต้องการ", level: "act", audience: "employees" },
  { key: "leaveok", title: "คำขอลา/โอที/เบิกค่าใช้จ่าย อนุมัติแล้ว", action: "", level: "info", audience: "employees" },
  { key: "leaveedit", title: "GM แก้ผลการลาที่อนุมัติไปแล้ว (มีเหตุผลแนบ)", action: "", level: "info", audience: "employees" },
  { key: "payslip", title: "สลิปเงินเดือนออกแล้ว", action: "", level: "info", audience: "employees", noIntern: true },

  // ── ทีมงานที่รับงานโปรเจค ──
  { key: "tasknew", title: "PM มอบหมายงานใหม่", action: "เริ่มทำ", level: "act", audience: "staff" },
  { key: "taskback", title: "PM ส่งงานกลับแก้", action: "แก้ แล้วส่งใหม่", level: "act", audience: "staff" },
  { key: "taskduesoon", title: "งานครบกำหนดพรุ่งนี้ ยังไม่ส่ง", action: "ส่งงาน", level: "act", audience: "staff" },
  { key: "taskoverdue", title: "งานเลยกำหนด ยังไม่ส่ง", action: "ส่งงาน", level: "act", audience: "staff" },
  { key: "eventinvite", title: "PM เพิ่มเข้านัดหมาย", action: "เข้าร่วม", level: "act", audience: "staff" },
  { key: "chatnew", title: "มีข้อความใหม่ในแชทโปรเจค", action: "ตอบ", level: "act", audience: "staff" },
  { key: "taskok", title: "งานผ่านการตรวจ", action: "", level: "info", audience: "staff" },
  { key: "eventchange", title: "PM เปลี่ยนเวลาหรือยกเลิกนัดหมาย", action: "", level: "info", audience: "staff" },

  // ── พนักงานขาย ──
  { key: "presales", title: "BD/SA ส่ง proposal กลับมา", action: "ทำใบเสนอราคา", level: "act", audience: "sales" },
  { key: "followup", title: "ถึงวันนัดติดตามผู้สนใจ", action: "ติดต่อลูกค้า แล้วบันทึกการติดต่อ", level: "act", audience: "sales" },
  { key: "quotexp", title: "ใบเสนอราคาใกล้หมดกำหนดยืนราคา ยังไม่เกิดดีล", action: "ติดตามลูกค้า", level: "act", audience: "sales" },
  { key: "dealcancelacc", title: "บัญชียกเลิกดีล (ลูกค้าจ่ายไปแล้ว)", action: "", level: "info", audience: "sales" },
  { key: "dealpaid", title: "ลูกค้าชำระงวดแล้ว", action: "", level: "info", audience: "sales" },
  { key: "contract", title: "ออกใบสัญญาแล้ว", action: "", level: "info", audience: "sales" },

  // ── คนที่คำขอก่อนการขายส่งถึง (BD / SA / Website ฯลฯ — ระบุตัวคน) ──
  { key: "psreq", title: "Sales ส่งคำขอก่อนการขายใหม่", action: "ทำ proposal หรือ demo ส่งกลับ", level: "act", audience: "psTarget" },
  { key: "psmore", title: "Sales ส่งข้อมูลเพิ่มแล้ว", action: "", level: "info", audience: "psTarget" },

  // ── บัญชี ──
  { key: "billnew", title: "Sales ปิดดีลส่งมาวางบิล", action: "แบ่งงวด แล้วออกใบแจ้งหนี้งวด 1", level: "act", audience: "acc" },
  { key: "billnext", title: "ออกใบเสร็จงวดก่อนแล้ว งวดถัดไปพร้อม", action: "ออกใบแจ้งหนี้งวดถัดไป", level: "act", audience: "acc" },
  { key: "invdue", title: "ใบแจ้งหนี้ถึงวันครบกำหนดชำระ", action: "เช็คยอดเงินเข้า แล้วออกใบเสร็จ", level: "act", audience: "acc" },
  { key: "invlate", title: "ใบแจ้งหนี้เลยกำหนด ยังไม่ออกใบเสร็จ", action: "ทวงลูกค้า", level: "act", audience: "acc" },
  { key: "whtdue", title: "ใกล้กำหนดนำส่งภาษีที่หักจากผู้ขาย", action: "สรุปข้อมูลส่งสำนักงานบัญชี", level: "act", audience: "acc" },
  { key: "dealcancelsales", title: "Sales ยกเลิกดีล (ลูกค้ายังไม่จ่าย)", action: "", level: "info", audience: "acc" },

  // ── ฝ่ายบุคคล (บัญชีและบุคคล) ──
  { key: "internleave", title: "นักศึกษาฝึกงานยื่นลา", action: "อนุมัติหรือไม่อนุมัติ", level: "act", audience: "hr" },
  { key: "timereview", title: "ระบบพบรายการที่ต้องตรวจ (ไม่มีบันทึกเวลา / ไม่ได้เช็คเอาท์ / ลาแล้วแต่มีเช็คอิน)", action: "ตรวจ แล้วบันทึกผล", level: "act", audience: "hr" },
  { key: "cutoff", title: "ถึงวันตัดรอบ", action: "ปิดรอบเวลาทำงาน แล้วคำนวณเงินเดือน", level: "act", audience: "hr" },
  /* CEO อนุมัติยอดเงินเดือนกลับมา (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  { key: "payok", title: "CEO อนุมัติเงินเดือนแล้ว", action: "สร้างและเผยแพร่สลิป", level: "act", audience: "hr" },
  { key: "payback", title: "CEO ไม่อนุมัติเงินเดือน", action: "แก้ไขแล้วส่งใหม่", level: "act", audience: "hr" },
  { key: "slipmake", title: "ปิดรอบเงินเดือนแล้ว", action: "สร้างและเผยแพร่สลิป", level: "act", audience: "hr" },
  { key: "holidayback", title: "CEO ตีกลับวันหยุด", action: "แก้ แล้วส่งใหม่", level: "act", audience: "hr" },
  { key: "holidayok", title: "CEO อนุมัติวันหยุดแล้ว", action: "", level: "info", audience: "hr" },
  { key: "probation", title: "พนักงานทดลองงานใกล้ครบกำหนด", action: "ประเมิน แล้วเปลี่ยนเป็นพนักงานประจำ", level: "act", audience: "hr" },

  // ── PM (GM ได้ชุดนี้ด้วย) ──
  { key: "pmjob", title: "มีงานใหม่เข้า (งวด 1 ชำระแล้ว)", action: "รับงาน", level: "act", audience: "pm" },
  { key: "pmreview", title: "พนักงานส่งงาน", action: "ตรวจ แล้วให้ผ่านหรือส่งกลับแก้", level: "act", audience: "pm" },
  { key: "pmlate", title: "งานในโปรเจคเลยกำหนด", action: "ติดตามคนทำ", level: "act", audience: "pm" },
  { key: "pmtransfer", title: "PM อีกคนโอนโปรเจคมาให้", action: "รับโปรเจค", level: "act", audience: "pm" },
  { key: "pmevent", title: "ใกล้ถึงเวลานัดหมายของตัวเอง", action: "เข้าร่วม", level: "act", audience: "pm" },
  { key: "pmcancel", title: "ดีลของโปรเจคที่ตัวเองดูแลถูกยกเลิก", action: "", level: "info", audience: "pm" },

  // ── GM ──
  { key: "gmapprove", title: "มีคำขอลา/โอที/เบิกค่าใช้จ่าย ที่ต้องให้ GM อนุมัติ", action: "อนุมัติหรือไม่อนุมัติ", level: "act", audience: "gm" },

  // ── CEO (ไม่อยู่ในชุดพนักงานทุกคน) ──
  { key: "ceoapprove", title: "มีคำขอรออนุมัติ: ลาของ GM และบัญชีและบุคคล · โอทีของ SA/Dev · ค่าน้ำ ค่าไฟ อินเทอร์เน็ต", action: "อนุมัติหรือไม่อนุมัติ", level: "act", audience: "ceo" },
  { key: "ceoholiday", title: "HR ส่งวันหยุดมาให้อนุมัติ", action: "อนุมัติหรือตีกลับ", level: "act", audience: "ceo" },
  /* ยอดเงินเดือนรออนุมัติ (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  { key: "ceopaywait", title: "ยอดเงินเดือนรออนุมัติ", action: "อนุมัติหรือไม่อนุมัติ", level: "act", audience: "ceo" },
  { key: "ceopayroll", title: "ปิดรอบเงินเดือนแล้ว", action: "เปิดดูยอดเงินเดือนรอบนั้นเพื่อโอนเงินเดือน", level: "act", audience: "ceo" },
] as const satisfies readonly NotifyEvent[];

export type NotifyEventKey = (typeof NOTIFY_EVENTS)[number]["key"];

/** บทบาทที่ลงเวลา = ทุกบทบาทยกเว้น CEO */
const TIME_ROLES: readonly Role[] = ["sales", "ps", "pm", "acc", "hr", "staff", "gm", "intern", "maid"];

/** กลุ่มผู้รับที่บทบาทนี้อยู่ (ไม่รวม employees / psTarget ซึ่งคิดแยก) */
const ROLE_AUDIENCE: Partial<Record<Role, NotifyAudience[]>> = {
  staff: ["staff"],
  sales: ["sales"],
  /* ทีมก่อนการขายรับคำขอทุกใบอยู่แล้ว */
  ps: ["psTarget"],
  acc: ["acc"],
  hr: ["hr"],
  pm: ["pm"],
  /* GM ได้ชุดของ PM ทั้งหมดด้วย */
  gm: ["gm", "pm"],
};

/**
 * เรื่องที่บัญชีนี้ได้รับ คิดจากบทบาททั้งหมดของบัญชี (ผู้ใช้สั่ง 16 ต.ค. 2569)
 * CEO ได้เฉพาะชุดของ CEO · ฝึกงานไม่ได้รับสลิป
 * presalesTarget = บัญชีนี้เป็นผู้รับคำขอก่อนการขายที่ส่งถึงตัว (บทบาทใดก็ได้) — ฝั่งส่งรู้จากคำขอ (toEmp)
 */
export function topicsForRoles(
  roles: readonly Role[],
  opts: { presalesTarget?: boolean } = {},
): NotifyEventKey[] {
  if (roles.includes("ceo")) return NOTIFY_EVENTS.filter((e) => e.audience === "ceo").map((e) => e.key);
  const aud = new Set<NotifyAudience>(roles.flatMap((r) => ROLE_AUDIENCE[r] ?? []));
  if (roles.some((r) => TIME_ROLES.includes(r))) aud.add("employees");
  if (opts.presalesTarget) aud.add("psTarget");
  const onlyIntern = roles.length > 0 && roles.every((r) => r === "intern");
  return NOTIFY_EVENTS.filter(
    (e: NotifyEvent) => aud.has(e.audience) && !(onlyIntern && e.noIntern),
  ).map((e) => e.key);
}

/** "08:30" ลบ 10 นาที → "08:20" */
function minus(hm: string, min: number) {
  const [h, m] = hm.split(":").map(Number);
  const t = (((h * 60 + m - min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * เวลาเตือนเช็คอิน/เช็คเอาท์ — ใช้เวลาทำงานของระบบ (ผู้ดูแลตั้งที่ /admin/schedule)
 * เช็คอิน = 10 นาทีก่อนเวลาเข้างาน · เช็คเอาท์ = ถึงเวลาเลิกงาน (ผู้ใช้สั่ง 16 ต.ค. 2569)
 * ไม่มีเตือนลืมเช็คเอาท์แล้ว (ผู้ใช้สั่ง 16 ต.ค. 2569)
 * เวลาของแต่ละคนตามตำแหน่ง — ส่ง scheduleFor(พนักงาน) มา เช่นแม่บ้านเตือน 07:50 / 17:00 (ผู้ใช้สั่ง 16 ต.ค. 2569)
 * ไม่ส่ง = เวลาของบริษัท
 */
export function reminderTimes(sch: DaySchedule = companySchedule()) {
  return {
    checkin: minus(sch.start, 10),
    checkout: sch.end,
  };
}
