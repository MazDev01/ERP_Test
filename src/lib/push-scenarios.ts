/*
 * ชุดข้อความทดสอบแจ้งเตือน — หน้า /notify-test ส่งให้ service worker แสดงผ่านทางเดียวกับ push จริง
 *
 * แต่ละชุดจำลองเรื่องจริงในกระดิ่ง (notifications.ts) — ข้อความ ระดับ และลิงก์ปลายทางตรงกับของจริง
 * เพื่อทดสอบให้ครบวงจร: ขึ้นบนเครื่อง → กดแล้วไปหน้าที่ลงมือต่อได้
 * PushPayload คือสัญญาระหว่างฝั่งส่งกับ public/sw.js — backend (Vercel) ที่มาทีหลังต้องส่งตามรูปแบบนี้
 */

import type { Level } from "./notifications";
import type { NotifyEventKey } from "./notify-settings";

/** สิ่งที่ service worker (public/sw.js) อ่านจาก push — เปลี่ยนรูปแบบต้องแก้สองที่พร้อมกัน */
export type PushPayload = {
  id: string;
  title: string;
  body: string;
  /** หน้าที่เปิดเมื่อกดแจ้งเตือน */
  url: string;
  /** แจ้งเตือน tag เดียวกันแทนที่ของเก่า ไม่ซ้อนกัน */
  tag: string;
  level: Level;
  event?: NotifyEventKey;
  /** เวลาที่เซิร์ฟเวอร์ส่ง (ms) — ใช้วัดว่าถึงเครื่องช้าแค่ไหน */
  sentAt: number;
  /** Android เท่านั้น — iOS ไม่สั่น */
  vibrate?: number[];
  /** Android/คอมพิวเตอร์ ค้างจนกว่าจะกด — iOS ไม่รองรับ */
  requireInteraction?: boolean;
  /** tag ซ้ำแล้วยังส่งเสียง/สั่นอีกครั้ง — sw.js ถือว่าเป็น true ถ้าไม่ได้ส่ง false มา */
  renotify?: boolean;
  silent?: boolean;
  /** ตัวเลขบนไอคอนแอป (iOS 16.4+ ที่ติดตั้งแล้ว · Android บาง launcher) — 0 = ล้าง */
  badgeCount?: number;
};

export type PushScenario = {
  key: string;
  label: string;
  /** ทดสอบอะไร — แสดงในหน้าทดสอบ */
  checks: string;
  build: () => Omit<PushPayload, "id" | "sentAt">;
};

export const PUSH_SCENARIOS: PushScenario[] = [
  {
    key: "basic",
    label: "ข้อความพื้นฐาน",
    checks: "ขึ้นบนจอ มีชื่อแอปและไอคอน กดแล้วกลับมาหน้านี้",
    build: () => ({
      title: "ทดสอบแจ้งเตือน ERP MAZ",
      body: "ถ้าเห็นข้อความนี้ แปลว่าส่งจากเซิร์ฟเวอร์ถึงเครื่องได้แล้ว",
      url: "/notify-test",
      tag: "maz-test-basic",
      level: "info",
    }),
  },
  {
    key: "checkin",
    label: "เตือนเช็คอินเข้างาน",
    checks: "เรื่อง checkin · มีเสียงและสั่นตามค่าตั้งต้น · กดแล้วไปหน้าตอกบัตร",
    build: () => ({
      title: "ใกล้เวลาเข้างาน",
      body: "อีก 10 นาทีถึงเวลาเข้างาน 08:30 น. — กดเพื่อเช็คอิน",
      url: "/",
      tag: "maz-checkin",
      level: "soon",
      event: "checkin",
      vibrate: [200, 100, 200],
    }),
  },
  {
    key: "forgot",
    label: "ลืมเช็คเอาท์ (ค้างจนกด)",
    checks: "ระดับด่วน · Android ค้างบนจอจนกว่าจะกด · iOS ขึ้นแบบปกติ",
    build: () => ({
      title: "ยังไม่ได้เช็คเอาท์",
      body: "เลยเวลาเลิกงานมา 30 นาทีแล้ว — กดเพื่อบันทึกเวลาออกงาน",
      url: "/",
      tag: "maz-forgot",
      level: "late",
      event: "forgot",
      requireInteraction: true,
      vibrate: [300, 100, 300, 100, 300],
    }),
  },
  {
    key: "leave",
    label: "ใบลาไม่อนุมัติ",
    checks: "เรื่อง leave · กดแล้วไปหน้าใบลา",
    build: () => ({
      title: "ใบลาไม่ได้รับอนุมัติ",
      body: "ลาพักร้อน 2 วัน — หัวหน้าให้เหตุผลว่า ช่วงนั้นมีงานส่งมอบลูกค้า",
      url: "/leave",
      tag: "maz-leave",
      level: "late",
      event: "leave",
    }),
  },
  {
    key: "presales",
    label: "คำขอก่อนการขายส่งกลับ",
    checks: "เรื่อง presales · ลิงก์เจาะถึงรายการเดียว (?find=)",
    build: () => ({
      title: "คำขอก่อนการขายส่งกลับมาแล้ว",
      body: "PS-2569-0031 — SA ส่งข้อเสนอกลับมาให้คุณตรวจ",
      url: "/presales?find=PS-2569-0031",
      tag: "maz-presales",
      level: "info",
      event: "presales",
    }),
  },
  {
    key: "approvals",
    label: "รออนุมัติ + ตัวเลขบนไอคอน",
    checks: "ตัวเลข 3 ขึ้นบนไอคอนแอป (ต้องติดตั้งแล้ว) · กดแล้วไปหน้าคำขออนุมัติ",
    build: () => ({
      title: "มีคำขอรออนุมัติ 3 รายการ",
      body: "ใบลา 2 · โอที 1 — กดเพื่อพิจารณา",
      url: "/approvals",
      tag: "maz-approvals",
      level: "soon",
      badgeCount: 3,
    }),
  },
  {
    key: "replace",
    label: "แทนที่ของเดิม (tag ซ้ำ)",
    checks: "ส่งสองครั้ง ต้องเหลือแจ้งเตือนเดียว ตัวเลขในข้อความเปลี่ยน",
    build: () => ({
      title: "สถานะงานอัปเดต",
      body: `อัปเดตล่าสุดเวลา ${new Date().toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok" })} น.`,
      url: "/my-tasks",
      tag: "maz-replace",
      level: "info",
      renotify: true,
    }),
  },
  {
    key: "long",
    label: "ข้อความยาวภาษาไทย",
    checks: "ตัดคำไทยถูก ไม่มีสระลอย/วรรณยุกต์ซ้อน · ขยายอ่านต่อได้",
    build: () => ({
      title: "ใบเสนอราคาใกล้หมดอายุ — บริษัท ตัวอย่างการก่อสร้างและวิศวกรรม จำกัด (มหาชน)",
      body:
        "ใบเสนอราคาที่คุณออกให้ลูกค้ารายนี้จะหมดอายุในอีก 3 วัน กรุณาติดตามลูกค้า หรือขยายอายุใบเสนอราคา " +
        "ก่อนวันที่กำหนด เพื่อไม่ให้ต้องออกใบใหม่และเริ่มขั้นตอนอนุมัติราคาใหม่ทั้งหมด",
      url: "/quotations",
      tag: "maz-quotexp",
      level: "soon",
      event: "quotexp",
    }),
  },
  {
    key: "clear-badge",
    label: "ล้างตัวเลขบนไอคอน",
    checks: "ตัวเลขบนไอคอนแอปหายไป",
    build: () => ({
      title: "ไม่มีเรื่องค้างแล้ว",
      body: "ล้างตัวเลขบนไอคอนแอป",
      url: "/notify-test",
      tag: "maz-approvals",
      level: "info",
      badgeCount: 0,
    }),
  },
];

/** ระบบ push ที่อยู่เบื้องหลัง endpoint — บอกได้ว่าเครื่องนี้ส่งผ่านใคร */
export function pushServiceOf(endpoint: string) {
  let host = "";
  try {
    host = new URL(endpoint).hostname;
  } catch {
    return "ไม่ทราบ";
  }
  if (host.endsWith("push.apple.com")) return "Apple (iOS / Safari)";
  if (host === "fcm.googleapis.com" || host.endsWith("googleapis.com")) return "FCM (Chrome / Android)";
  if (host.includes("mozilla")) return "Mozilla (Firefox)";
  if (host.includes("notify.windows.com")) return "WNS (Edge)";
  return host;
}
