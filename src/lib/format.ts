/* ตัวช่วยจัดรูปแบบที่ใช้ร่วมกันทุกหน้า — วันที่ไทย เงินบาท ตัวย่อชื่อ */

const TH_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

const TH_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export { TH_MONTHS_SHORT, TH_MONTHS_FULL };

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/*
 * ═══ เวลาของระบบ = เวลาประเทศไทยเสมอ ═══════════════════════════
 *
 * บริษัทอยู่ไทยและกติกาทั้งระบบอิงเวลาไทย (เข้างาน 09:00 · รอบเงินเดือนตัดวันที่ 25)
 * ถ้าปล่อยให้อ่านเวลาของเครื่อง คนที่เปิดจากต่างประเทศหรือตั้งเขตเวลาผิด
 * จะตอกบัตรลงวันผิด และเห็นรอบเงินเดือนคนละรอบกับเพื่อนที่นั่งข้าง ๆ
 *
 * กติกา — จุดที่ "อ่านเวลาปัจจุบัน" ให้ใช้ bkkNow() / todayIso() เท่านั้น
 * ส่วนเวลาที่บันทึกไว้แล้ว (เช่น at ของการตอกบัตร) ยังเก็บเป็น ISO จริงเหมือนเดิม
 * แล้วค่อยแปลงเป็นเวลาไทยตอนอ่านด้วย bkkOf()
 */
export const BANGKOK_TZ = "Asia/Bangkok";

/** เวลาไทยเร็วกว่า UTC กี่นาที — คงที่ ไม่มีเวลาออมแสง */
const BANGKOK_OFFSET_MIN = 7 * 60;

/**
 * แปลงชั่วขณะหนึ่งให้เป็น Date ที่อ่านค่าด้วย getHours/getDate แล้วได้เวลาไทย
 *
 * ใช้วิธีเลื่อนเวลา ไม่ใช่ Intl เพราะทุกจุดในระบบอ่านผ่าน getter ของ Date
 * ค่าที่ได้จึงห้ามเอาไปใช้เป็นชั่วขณะจริงอีก (getTime จะเพี้ยน) ใช้อ่านหน้าปัดเท่านั้น
 */
export function bkkOf(instant: Date) {
  return new Date(instant.getTime() + (BANGKOK_OFFSET_MIN + instant.getTimezoneOffset()) * 60_000);
}

/** ทางกลับของ bkkOf — เอา Date ที่อ่านเป็นเวลาไทยแล้ว กลับเป็นชั่วขณะจริง */
export function fromBkk(wall: Date) {
  return new Date(wall.getTime() - (BANGKOK_OFFSET_MIN + wall.getTimezoneOffset()) * 60_000);
}

/** เวลาไทยตอนนี้ — ใช้แทน new Date() ทุกจุดที่หมายถึง "ตอนนี้" */
export function bkkNow() {
  return bkkOf(new Date());
}

/** วันนี้ตามเวลาไทย เป็น yyyy-mm-dd */
export function todayIso() {
  return toIsoDate(bkkNow());
}

/** เวลาไทยตอนนี้แบบ "yyyy-mm-dd HH:mm" — ใช้ประทับเวลาในเอกสารและประวัติ */
export function bkkStamp() {
  const d = bkkNow();
  return `${toIsoDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * เลขที่เอกสารถัดไปแบบ ตัวนำหน้า-ปี พ.ศ.-ลำดับสี่หลัก เช่น LV-2569-0016
 * ลำดับเดินต่อกันทั้งปี นับจากเลขที่มากที่สุดที่มีอยู่ ขึ้นปีใหม่เริ่ม 0001
 */
export function nextDocNo(prefix: string, existing: string[]) {
  const head = `${prefix}-${bkkNow().getFullYear() + 543}-`;
  const max = existing
    .filter((n) => n.startsWith(head))
    .reduce((m, n) => Math.max(m, Number(n.slice(head.length)) || 0), 0);
  return head + String(max + 1).padStart(4, "0");
}

/** yyyy-mm-dd ของวันที่ที่ให้มา (อ่านจากค่าใน Date ตรง ๆ ไม่แปลงเขตเวลาซ้ำ) */
export function toIsoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseIsoDate(iso: string) {
  return new Date(`${iso}T00:00:00`);
}

/** "2026-09-08" → "8 ก.ย. 2569" */
export function thaiDate(iso: string) {
  if (!iso) return "—";
  const d = parseIsoDate(iso);
  return `${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/** "2026-09" → "กันยายน 2569" — รอบเดือนไม่มีวันที่ จึงแยกจาก thaiDate */
export function thaiMonth(key: string) {
  if (!key) return "—";
  const [y, m] = key.split("-");
  return `${TH_MONTHS_FULL[Number(m) - 1]} ${Number(y) + 543}`;
}

/** "2026-09-08" → "วันที่ 8 กันยายน 2569" */
export function thaiDateLong(iso: string) {
  if (!iso) return "—";
  const d = parseIsoDate(iso);
  return `วันที่ ${d.getDate()} ${TH_MONTHS_FULL[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/** "2026-09-08 16:40" → "8 ก.ย. 2569 16:40" */
export function thaiStamp(stamp: string) {
  if (!stamp) return "—";
  const [date, time] = stamp.split(" ");
  return `${thaiDate(date)}${time ? ` ${time}` : ""}`;
}

/** จำนวนวันจาก a ถึง b (ลบ = b อยู่ก่อน a) */
export function daysBetween(aIso: string, bIso: string) {
  return Math.round(
    (parseIsoDate(bIso).getTime() - parseIsoDate(aIso).getTime()) / 86_400_000,
  );
}

export function addDays(iso: string, days: number) {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/** 342400 → "342,400.00" */
export function baht(n: number) {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 342400 → "342,400" */
export function money(n: number) {
  return Math.round(n).toLocaleString("th-TH");
}

/** ปัดทศนิยม 2 ตำแหน่ง — ใช้ทุกครั้งที่คิดเงิน จะได้ไม่มีเศษลอย */
export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** ตัวย่อ 2 ตัวจากชื่อ ใช้ในวงกลม avatar */
export function initials(name: string) {
  const parts = String(name || "").trim().split(/\s+/);
  return ((parts[0] || "")[0] ?? "") + ((parts[1] || "")[0] ?? "");
}

const DIGIT = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACE = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

function readInt(text: string): string {
  if (text === "0") return "ศูนย์";
  let out = "";
  // หลักล้านขึ้นไปอ่านซ้ำแล้วต่อท้ายด้วย "ล้าน"
  if (text.length > 6) {
    out += readInt(text.slice(0, text.length - 6)) + "ล้าน";
    text = text.slice(-6);
  }
  const len = text.length;
  for (let i = 0; i < len; i++) {
    const d = Number(text[i]);
    const place = len - i - 1;
    if (d === 0) continue;
    if (place === 1 && d === 1) out += "สิบ";
    else if (place === 1 && d === 2) out += "ยี่สิบ";
    else if (place === 0 && d === 1 && len > 1) out += "เอ็ด";
    else out += DIGIT[d] + PLACE[place];
  }
  return out;
}

/** 342400 → "สามแสนสี่หมื่นสองพันสี่ร้อยบาทถ้วน" */
export function bahtText(amount: number) {
  const negative = amount < 0;
  const value = Math.abs(round2(amount));
  const whole = Math.floor(value);
  const satang = Math.round((value - whole) * 100);
  const head = (negative ? "ลบ" : "") + readInt(String(whole)) + "บาท";
  return head + (satang ? readInt(String(satang)) + "สตางค์" : "ถ้วน");
}

/** ใส่ลูกน้ำคั่นหลักพันระหว่างพิมพ์ — คงจุดทศนิยมที่ยังพิมพ์ค้างไว้ ไม่ตัดทิ้ง */
export function commaInput(raw: string) {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  const whole = (dot < 0 ? cleaned : cleaned.slice(0, dot)).replace(/^0+(?=\d)/, "");
  if (dot < 0) return groupThousands(whole);
  const frac = cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return `${groupThousands(whole)}.${frac}`;
}

/** แบบเดียวกับ commaInput แต่ติดลบได้ — ช่องปรับปรุงยอดที่พิมพ์ -500 เพื่อหัก */
export function commaInputSigned(raw: string) {
  const neg = raw.trim().startsWith("-");
  return (neg ? "-" : "") + commaInput(raw);
}

function groupThousands(digits: string) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * คำทักทายตามช่วงเวลาจริงของวัน (เวลาไทย) — หัวเรื่องของทุกแดชบอร์ดใช้ตัวนี้ตัวเดียว
 * แยกมาไว้ที่นี่เพราะแต่ละหน้าเคยเขียนเงื่อนไขเองแล้วตัดคำไม่เหมือนกัน
 */
export function greetNow() {
  const h = bkkNow().getHours();
  return h < 12 ? "สวัสดีตอนเช้า" : h < 17 ? "สวัสดีตอนบ่าย" : "สวัสดีตอนเย็น";
}
