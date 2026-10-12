/*
 * ตารางงานของ PM — นัดหมายและกิจกรรมที่ต้องไปเอง
 *
 * แยกจากงานย่อยในโปรเจค (ProjectTask) เพราะสองอย่างนี้ตอบคนละคำถาม
 * งานย่อยคือ "ใครต้องทำอะไรให้เสร็จเมื่อไร" ส่วนกิจกรรมคือ "วันนี้ต้องไปไหนกี่โมง"
 * งานย่อยมีคนรับผิดชอบคนเดียวก็จบ แต่กิจกรรมกินเวลาของหลายคนพร้อมกัน
 *
 * ยังไม่ต่อ backend ข้อมูลชุดนี้เป็นค่าตั้งต้น รายละเอียดที่ PM พิมพ์เพิ่มอยู่ใน pm-schedule-store
 */

import { settings } from "./system-settings";

/** ประเภทนัดตามต้นแบบ EV_KIND — นัดพบลูกค้า / ตรวจงาน / ประชุมทีม / อื่นๆ */
export type EventKind = string;

/** สีของแต่ละประเภท — ใช้ทั้งในปฏิทินและป้ายอธิบายสี จึงเก็บไว้ที่เดียว */
export const PM_EVENT_KIND: Record<string, { label: string; cls: string; dot: string }> = {
  client: { label: "นัดพบลูกค้า", cls: "k-client", dot: "#D0021B" },
  review: { label: "ตรวจงาน", cls: "k-review", dot: "#B26414" },
  meeting: { label: "ประชุมทีม", cls: "k-meeting", dot: "#2F55B8" },
  other: { label: "อื่นๆ", cls: "k-other", dot: "#4A5568" },
};

/*
 * ประเภทนัดหมายทั้งหมด — ชุดตั้งต้นด้านบน + ที่ฝ่ายบุคคลเพิ่มไว้ในข้อมูลหลัก (Full Proposal · M5)
 * ประเภทที่เพิ่มเองใช้กรอบสีกลาง (k-other) แต่จุดสีเป็นสีที่เลือกไว้
 */
export function eventKinds(): { key: EventKind; label: string; cls: string; dot: string }[] {
  const saved = settings().catalog.eventKinds;
  const builtin = Object.entries(PM_EVENT_KIND).map(([key, v]) => ({ key, ...v }));
  const extra = (saved ?? [])
    .filter((x) => !(x.key in PM_EVENT_KIND))
    .map((x) => ({ key: x.key, label: x.label, cls: "k-other", dot: x.color }));
  /* ชื่อที่ฝ่ายบุคคลแก้ไว้ทับชื่อตั้งต้น */
  return [
    ...builtin.map((b) => ({ ...b, label: (saved ?? []).find((x) => x.key === b.key)?.label ?? b.label })),
    ...extra,
  ];
}

export function eventKind(key: EventKind) {
  return eventKinds().find((k) => k.key === key) ?? { key, label: key, cls: "k-other", dot: "#4A5568" };
}

/*
 * จานสีให้ผู้ใช้เลือกเองตอนสร้างหรือแก้กิจกรรม
 *
 * สีตามประเภทบอกได้แค่ "เป็นนัดแบบไหน" แต่ PM มักอยากแยกตามลูกค้าหรือตามโปรเจค
 * จึงให้เลือกทับได้ ถ้าไม่ได้เลือก กิจกรรมยังใช้สีของประเภทเหมือนเดิม
 */
export type EventColor = "red" | "orange" | "green" | "teal" | "blue" | "purple" | "pink" | "gray";

export const PM_COLORS: { c: EventColor; name: string; bg: string; fg: string }[] = [
  { c: "red", name: "แดง", bg: "#FDECEE", fg: "#C0121F" },
  { c: "orange", name: "ส้ม", bg: "#FDF2E3", fg: "#B4630B" },
  { c: "green", name: "เขียว", bg: "#E7F5EE", fg: "#14875A" },
  { c: "teal", name: "เขียวน้ำทะเล", bg: "#E3F3F4", fg: "#0F6E75" },
  { c: "blue", name: "น้ำเงิน", bg: "#E7ECF7", fg: "#1A3E8C" },
  { c: "purple", name: "ม่วง", bg: "#F1E8FA", fg: "#6A2CA0" },
  { c: "pink", name: "ชมพู", bg: "#FCE9F1", fg: "#B02A6B" },
  { c: "gray", name: "เทา", bg: "#EEF0F4", fg: "#4A5262" },
];

/** สีตั้งต้นในช่องเลือกสี ตอนเปิดแก้กิจกรรมที่ยังไม่เคยเลือกสี — ให้ตรงกับที่เห็นในปฏิทินอยู่แล้ว */
export const KIND_COLOR: Record<EventKind, EventColor> = {
  client: "red",
  review: "orange",
  meeting: "blue",
  other: "gray",
};

export function colorOf(c: EventColor) {
  return PM_COLORS.find((x) => x.c === c) ?? PM_COLORS[0];
}

/** วิธีระบายสีกิจกรรม — เลือกสีเองได้สีนั้น ไม่ได้เลือกใช้คลาสของประเภท */
export function eventPaint(e: PmEvent): { cls: string; style?: { background: string; color: string } } {
  if (!e.col) return { cls: PM_EVENT_KIND[e.kind].cls };
  const x = colorOf(e.col);
  return { cls: "", style: { background: x.bg, color: x.fg } };
}

export type PmEvent = {
  id: string;
  /** วันที่เริ่ม (yyyy-mm-dd) */
  date: string;
  /** วันสิ้นสุดของกิจกรรมข้ามวัน ไม่มีค่า = จบวันเดียวกับที่เริ่ม */
  dateEnd?: string;
  /** เวลาเริ่ม-จบ เป็น HH:mm */
  from: string;
  to: string;
  kind: EventKind;
  /** สีที่ผู้ใช้เลือกเอง — ไม่มีค่า = ใช้สีของประเภท */
  col?: EventColor;
  title: string;
  place: string;
  /** เลขที่โปรเจค (PJ-) ที่นัดนี้เกี่ยวข้อง — ว่างคือนัดที่ไม่ผูกกับโปรเจคไหน · เดิมเก็บเลขที่ดีล (เปลี่ยน 5 ต.ค. 2569) */
  pj?: string;
  /** รหัสพนักงานที่ต้องเข้าร่วม · นัดของฝ่ายขาย (by "sales") เก็บรหัสผู้สนใจแทน */
  who: string[];
  /** สิ่งที่ต้องเตรียม — เป็นค่าตั้งต้นของช่องรายละเอียด PM แก้ทับได้ */
  todo: string[];
  /*
   * ใครเป็นคนสร้างนัดนี้ (24 ก.ย. 2569 · เจ้าของสั่ง)
   * สร้างนัดได้เฉพาะ PM กับ GM เท่านั้น — SA/BD และทีมงานดูอย่างเดียว
   * เหตุผล: ถ้าใครก็ใส่นัดในปฏิทินคนอื่นได้ ปฏิทินจะเต็มไปด้วยนัดที่อีกฝ่ายไม่เคยตกลง
   * และไม่มีใครรับผิดชอบว่านัดนั้นมีจริงหรือเปล่า · PM กับ GM เป็นคนจัดคิวงานและจัดคนอยู่แล้ว
   * ใบเก่าที่ไม่มีคีย์นี้ถือว่า PM สร้าง
   */
  by?: "pm" | "gm" | "ps" | "sales";
  /*
   * นัดของทีมก่อนการขาย (เจ้าของตัดสิน 25 ก.ย. 2569) — ต้องผูกกับคำขอก่อนการขายที่ตัวเองรับผิดชอบ
   * เก็บเลขที่คำขอไว้ เพื่อกันไม่ให้กลายเป็นปฏิทินส่วนตัวที่เคยตัดทิ้งไปแล้ว
   * นัดกลุ่มนี้ไม่ขึ้นในปฏิทินของ PM เพราะยังไม่มีดีลและยังไม่ใช่งานของ PM
   */
  ps?: string;
  /*
   * ยกเลิกแล้ว — เก็บไว้เป็นประวัติ ไม่ลบทิ้ง (ยูสเคส PM-06 BR-03)
   * นัดที่ยกเลิกไม่ขึ้นเป็นแถบในปฏิทินอีก แต่ยังอยู่ในรายการของวันนั้นแบบขีดฆ่า
   */
  cancel?: { at: string; by: string; why: string };
  /*
   * ประวัติการแก้ที่ผู้เข้าร่วมต้องรู้ (เจ้าของสั่ง 24 ก.ย. 2569)
   * เก็บเฉพาะครั้งที่ "วัน เวลา หรือรายชื่อผู้เข้าร่วม" เปลี่ยน — แก้หัวข้อหรือสถานที่ไม่นับ
   * เพราะคนที่กันเวลาไว้แล้วต้องรู้ว่าต้องไปวันไหนกี่โมง ส่วนคนที่ถูกถอดออก
   * จะไม่เห็นนัดนี้ในปฏิทินตัวเองอีก ถ้าไม่บอกก็จะไปรอเก้อ
   */
  edits?: EventChange[];
};

/*
 * หนึ่งครั้งที่แก้นัด — เก็บทั้ง "ของเดิม" และ "ของใหม่"
 * เพราะข้อความแจ้งเตือนต้องบอกว่าเลื่อนจากอะไรเป็นอะไร ไม่ใช่บอกแค่ค่าปัจจุบัน
 */
export type EventChange = {
  /** เวลาที่แก้ (yyyy-mm-dd HH:mm เวลาไทย) */
  at: string;
  /** ชื่อผู้แก้ */
  by: string;
  /** ช่วงวันเดิม → ใหม่ (yyyy-mm-dd หรือ "เริ่ม~สิ้นสุด" ถ้าข้ามวัน) ไม่มีค่า = วันไม่เปลี่ยน */
  date?: { before: string; after: string };
  /** ช่วงเวลาเดิม → ใหม่ รูปแบบ "HH:mm-HH:mm" ไม่มีค่า = เวลาไม่เปลี่ยน */
  time?: { before: string; after: string };
  /** รหัสพนักงานที่ถูกเพิ่มเข้ามาในครั้งนี้ */
  added: string[];
  /** รหัสพนักงานที่ถูกถอดออกในครั้งนี้ — ต้องแจ้งด้วย ทั้งที่เขาไม่อยู่ใน who แล้ว */
  removed: string[];
};

/** ครั้งที่แก้ล่าสุด — ข้อความแจ้งเตือนใช้ครั้งล่าสุดครั้งเดียว ไม่ไล่ทั้งประวัติ */
export function lastEdit(e: PmEvent) {
  return e.edits?.length ? e.edits[e.edits.length - 1] : undefined;
}

export const PM_EVENTS: PmEvent[] = [
  /* ต้นแบบ pm-schedule.html PM_EVENTS (7 นัด) */
  { id: "EV1", date: "2026-09-09", from: "10:00", to: "11:30", kind: "client", title: "นัดลูกค้าเอ็มเทค ตรวจหน้าเว็บรอบแรก", place: "ออฟฟิศลูกค้า ถ.พระราม 9", pj: "PJ-2569-0002", who: ["E10", "E05"], todo: ["เตรียมลิงก์ทดสอบและสรุปขอบเขตไปด้วย"] },
  { id: "EV2", date: "2026-09-08", from: "09:30", to: "10:30", kind: "meeting", title: "ประชุมทีมประจำสัปดาห์", place: "ห้องประชุมชั้น 3", who: ["E10", "E05"], todo: [] },
  { id: "EV3", date: "2026-09-11", from: "14:00", to: "15:00", kind: "review", title: "ตรวจอาร์ตเวิร์กแคมเปญเซลล่า", place: "ออนไลน์", who: ["E10"], todo: ["ดูครบ 5 ชิ้นก่อนส่งลูกค้า"] },
  { id: "EV4", date: "2026-09-16", from: "13:30", to: "15:00", kind: "client", title: "นัดลูกค้าครัวคุณจิ คุยงานเพิ่ม", place: "ร้านครัวคุณจิ", pj: "PJ-2569-0007", who: ["E10"], todo: [] },
  { id: "EV5", date: "2026-09-15", from: "09:30", to: "10:30", kind: "meeting", title: "ประชุมทีมประจำสัปดาห์", place: "ห้องประชุมชั้น 3", who: ["E10", "E05"], todo: [] },
  { id: "EV7", date: "2026-09-24", dateEnd: "2026-09-26", from: "09:00", to: "18:00", kind: "other", title: "ออกบูธงานแสดงสินค้า", place: "ไบเทค บางนา ฮอลล์ 3", who: ["E10", "E05"], todo: ["สลับกันเฝ้าบูธ"] },
  { id: "EV6", date: "2026-09-22", from: "11:00", to: "12:00", kind: "review", title: "ตรวจงานก่อนส่งมอบเอ็มเทค", place: "ออนไลน์", pj: "PJ-2569-0002", who: ["E10", "E05"], todo: [] },
  /* ต้นแบบ my-schedule.html — นัดที่ PM ใส่ชื่อพนักงาน E05 ไว้ (EVE1–EVE7) */
  { id: "EVE1", date: "2026-09-01", from: "09:30", to: "10:30", kind: "meeting", title: "ประชุมทีมประจำสัปดาห์", place: "ห้องประชุมชั้น 3", who: ["E10", "E05"], todo: [] },
  { id: "EVE2", date: "2026-09-09", from: "13:00", to: "14:00", kind: "meeting", title: "คุยแบบหน้าแรกกับทีมกราฟิก", place: "ห้องประชุมชั้น 2", pj: "PJ-2569-0002", who: ["E10", "E05"], todo: ["เอาไฟล์แบบหน้าแรกที่แก้ล่าสุดมาด้วย"] },
  { id: "EVE3", date: "2026-09-09", from: "16:00", to: "16:30", kind: "review", title: "อัปเดตความคืบหน้างานเว็บกับ PM", place: "ออนไลน์", who: ["E10", "E05"], todo: [] },
  { id: "EVE4", date: "2026-09-09", from: "17:00", to: "17:45", kind: "other", title: "ทดสอบเว็บบนมือถือกับทีม", place: "ห้องประชุมชั้น 2", pj: "PJ-2569-0003", who: ["E10", "E05"], todo: [] },
  { id: "EVE5", date: "2026-09-10", from: "14:00", to: "14:30", kind: "review", title: "ตรวจหน้าเกี่ยวกับเราครัวคุณจิ", place: "ออนไลน์", pj: "PJ-2569-0003", who: ["E10", "E05"], todo: ["เปิดหน้าเว็บบนมือถือให้ PM ดูด้วย"] },
  { id: "EVE6", date: "2026-08-27", from: "11:00", to: "12:00", kind: "review", title: "ตรวจแบบหน้าเว็บร้านอาหาร", place: "ออนไลน์", pj: "PJ-2569-0003", who: ["E10", "E05"], todo: [] },
  { id: "EVE7", date: "2026-10-02", from: "10:00", to: "11:30", kind: "client", title: "นัดลูกค้าอัลฟ่าคอร์ป ส่งมอบเว็บ", place: "ออฟฟิศลูกค้า สาทร", pj: "PJ-2569-0001", who: ["E10", "E05"], todo: [] },
  /* ตัวอย่างนัดช่วงปลาย ก.ย.–ต.ค. 2569 (เพิ่ม 8 ต.ค. 2569 สำหรับสาธิต) — รหัส EVO* ไม่ชนกับ EVN* ที่ addEvent ออกให้
     เครื่องที่มีข้อมูลเก่าได้รับผ่าน migrateSchedule (เติมเฉพาะรหัสที่ยังไม่มี) */
  { id: "EVO01", date: "2026-09-29", from: "09:30", to: "10:30", kind: "meeting", title: "ประชุมทีมประจำสัปดาห์", place: "ห้องประชุมชั้น 3", who: ["E10", "E05", "E02", "E03", "E09"], todo: [] },
  { id: "EVO02", date: "2026-10-01", from: "14:00", to: "15:30", kind: "client", title: "นัดลูกค้าใจงามเบเกอรี่ คุยผังเว็บและเมนูเค้ก", place: "ร้านใจงามเบเกอรี่ ถ.นิมมานฯ", pj: "PJ-2569-0021", who: ["E10", "E01", "E02"], todo: ["เตรียมผังเว็บและตัวอย่างหน้าสั่งเค้ก"] },
  { id: "EVO03", date: "2026-10-06", from: "09:30", to: "10:30", kind: "meeting", title: "ประชุมทีมประจำสัปดาห์", place: "ห้องประชุมชั้น 3", who: ["E10", "E05", "E02", "E14", "E09"], todo: ["ไล่งานที่ครบกำหนดสัปดาห์นี้"] },
  { id: "EVO04", date: "2026-10-07", from: "15:00", to: "16:00", kind: "review", title: "ตรวจอาร์ตเวิร์กชุดรีวิว คลินิกใสใส", place: "ออนไลน์", pj: "PJ-2569-0022", who: ["E10", "E14"], todo: ["เช็กภาพก่อน–หลังว่าลูกค้ายินยอมครบ"] },
  { id: "EVO05", date: "2026-10-08", from: "10:00", to: "11:00", kind: "review", title: "ตรวจหน้ารายการเค้กกับทีมเว็บ", place: "ห้องประชุมชั้น 2", pj: "PJ-2569-0021", who: ["E10", "E05"], todo: ["เปิดบนมือถือและแท็บเล็ตให้ดูด้วย"] },
  { id: "EVO06", date: "2026-10-08", from: "13:30", to: "15:00", kind: "client", title: "นัดลูกค้าวีพีโลจิสติกส์ สรุปผลทดสอบระบบ", place: "ออฟฟิศลูกค้า ถ.ซุปเปอร์ไฮเวย์", pj: "PJ-2569-0023", who: ["E10", "E08", "E06"], todo: ["สรุปจุดที่พิกัดหลุดและแผนแก้", "ขอวันส่งมอบใหม่"] },
  { id: "EVO07", date: "2026-10-08", from: "16:00", to: "16:30", kind: "other", title: "คุยแก้แบนเนอร์หน้าเว็บคลินิกใสใส", place: "ออนไลน์", pj: "PJ-2569-0022", who: ["E10", "E05"], todo: ["ดูแบรนด์บุ๊กของคลินิกก่อนแก้"] },
  { id: "EVO08", date: "2026-10-09", from: "11:00", to: "12:00", kind: "meeting", title: "ทบทวนงานโฆษณาประจำเดือน", place: "ห้องประชุมชั้น 3", who: ["E10", "E09", "E13"], todo: ["เทียบงบที่ใช้จริงกับแผนทุกโปรเจค"] },
  { id: "EVO09", date: "2026-10-13", from: "09:30", to: "10:30", kind: "meeting", title: "ประชุมทีมประจำสัปดาห์", place: "ห้องประชุมชั้น 3", who: ["E10", "E05", "E02", "E14", "E09"], todo: [] },
  { id: "EVO10", date: "2026-10-14", from: "10:00", to: "11:30", kind: "client", title: "นัดลูกค้าพูลผลอะไหล่ เก็บความต้องการ", place: "ร้านพูลผลอะไหล่ ถ.ช้างคลาน", pj: "PJ-2569-0025", who: ["E10", "E01"], todo: ["เตรียมแบบฟอร์มจัดหมวดอะไหล่"] },
  { id: "EVO11", date: "2026-10-15", from: "14:00", to: "15:00", kind: "review", title: "ตรวจหน้าแรกใจงามเบเกอรี่ก่อนส่งลูกค้า", place: "ออนไลน์", pj: "PJ-2569-0021", who: ["E10", "E05", "E02"], todo: [] },
  { id: "EVO12", date: "2026-10-21", dateEnd: "2026-10-22", from: "09:00", to: "17:00", kind: "other", title: "อบรม Google Ads ภายในทีม", place: "ห้องอบรมชั้น 4", who: ["E10", "E05", "E09", "E13"], todo: ["นำโน้ตบุ๊กมาเอง"] },
  { id: "EVO13", date: "2026-10-28", from: "13:30", to: "15:00", kind: "client", title: "นำเสนอผลแคมเปญเดือน ต.ค. คลินิกใสใส", place: "คลินิกใสใส สาขานิมมานฯ", pj: "PJ-2569-0022", who: ["E10", "E09"], todo: ["สรุปรายงานผลโฆษณาเดือน ต.ค."] },
  { id: "EVO14", date: "2026-10-12", from: "10:00", to: "11:00", kind: "client", title: "นัดลูกค้าเอ็มเทค ซ้อมส่งมอบเว็บไซต์", place: "ออนไลน์", pj: "PJ-2569-0002", who: ["E10", "E05", "E06"], todo: [], cancel: { at: "2026-10-07 16:20", by: "ชนิกานต์ วัฒนกุล", why: "ลูกค้าขอรวมไปคุยในวันส่งมอบจริง 15 ต.ค." } },
  { id: "EVO15", date: "2026-10-15", from: "10:00", to: "12:00", kind: "client", title: "ส่งมอบเว็บไซต์เอ็มเทค", place: "ออฟฟิศลูกค้า ถ.พระราม 9", pj: "PJ-2569-0002", who: ["E10", "E05", "E06"], todo: ["เตรียมคู่มือผู้ดูแลเว็บ"], edits: [{ at: "2026-10-07 16:25", by: "ชนิกานต์ วัฒนกุล", time: { before: "14:00-15:30", after: "10:00-12:00" }, added: ["E06"], removed: [] }] },
  /* นัดที่ GM ตั้งเอง */
  { id: "EVO16", date: "2026-10-08", from: "09:00", to: "10:00", kind: "meeting", title: "ประชุมผู้บริหารติดตามโปรเจคประจำเดือน", place: "ห้องผู้บริหาร", who: ["E11", "E10"], todo: ["สรุปโปรเจคเลยกำหนดและงานรอตรวจ"], by: "gm" },
  { id: "EVO17", date: "2026-10-20", from: "14:00", to: "16:00", kind: "meeting", title: "วางแผนงบโฆษณาและกำลังคนไตรมาส 1/2570", place: "ห้องผู้บริหาร", who: ["E11", "E10", "E13"], todo: [], by: "gm" },
  { id: "EVO18", date: "2026-10-30", from: "16:00", to: "18:00", kind: "other", title: "งานเลี้ยงสังสรรค์ปิดไตรมาส", place: "ร้านอาหารริมน้ำ ถ.เจริญราษฎร์", who: ["E10", "E11", "E01", "E02", "E05", "E09"], todo: [], by: "gm" },
];

/** ความยาวของกิจกรรมเป็นข้อความไทย เช่น "1 ชม. 30 นาที" */
export function eventLength(from: string, to: string) {
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  const mins = th * 60 + tm - (fh * 60 + fm);
  if (mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h ? `${h} ชม.` : "", m ? `${m} นาที` : ""].filter(Boolean).join(" ");
}

/** วันสุดท้ายของกิจกรรม — กิจกรรมวันเดียวคือวันเดิม */
export function endOf(e: PmEvent) {
  return e.dateEnd && e.dateEnd > e.date ? e.dateEnd : e.date;
}

export function isMulti(e: PmEvent) {
  return endOf(e) > e.date;
}

/** จำนวนวันตั้งแต่ a ถึง b (วันเดียวกัน = 0) */
export function dayDiff(a: string, b: string) {
  return Math.round(
    (new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000,
  );
}

/** กิจกรรมกินเวลากี่วัน — วันเดียว = 1 */
export function spanDays(e: PmEvent) {
  return dayDiff(e.date, endOf(e)) + 1;
}

/**
 * กิจกรรมที่คร่อมวันนั้น เรียงตามเวลาเริ่ม
 *
 * เทียบเป็นช่วง ไม่ใช่เทียบวันตรง ๆ เพราะกิจกรรมข้ามวันต้องโผล่ทุกวันที่มันกิน
 * ถ้าโผล่แค่วันแรก คนเปิดดูวันกลาง ๆ จะเห็นว่าวันนั้นว่างทั้งที่ไม่ว่าง
 */
export function eventsOn(all: PmEvent[], iso: string) {
  return all
    .filter((e) => iso >= e.date && iso <= endOf(e))
    .sort((a, b) => a.from.localeCompare(b.from));
}

/**
 * ข้อความบอกเวลาบนแถบกิจกรรมของวันนั้น
 *
 * กิจกรรมข้ามวันบอกเวลาเริ่มเฉพาะวันแรก วันกลางบอกว่าเป็นวันที่เท่าไรของทั้งหมด
 * เพราะเวลาเริ่มของวันแรกไม่ได้แปลว่าวันที่สามก็เริ่มเวลานั้น
 */
export function chipTime(e: PmEvent, iso: string) {
  if (!isMulti(e)) return e.from;
  const i = dayDiff(e.date, iso) + 1;
  const n = spanDays(e);
  if (i === 1) return `${e.from} · วันที่ 1/${n}`;
  if (i === n) return `วันสุดท้าย · ถึง ${e.to}`;
  return `วันที่ ${i}/${n}`;
}

/** นัดที่ยังไม่ถูกยกเลิก — ปฏิทินทุกหน้าใช้ชุดนี้ */
export function liveEvents(all: PmEvent[]) {
  return all.filter((e) => !e.cancel);
}

/*
 * นัดที่คนนี้ถูกเชิญ — รวมใบที่ถูกยกเลิกแล้วด้วย
 *
 * เดิมกรองใบที่ยกเลิกทิ้ง ผลคือนัดหายไปจากปฏิทินของผู้เข้าร่วมเงียบ ๆ
 * คนที่กันเวลาไว้แล้วเปิดดูก็ไม่รู้ว่าเป็นเพราะถูกยกเลิกหรือเพราะตัวเองจำผิด
 * (เจ้าของสั่ง 24 ก.ย. 2569) จึงคงใบไว้ให้เห็นเป็นแบบขีดฆ่าพร้อมเหตุผล
 */
export function invitedEvents(all: PmEvent[], empId: string) {
  return all.filter((e) => e.who.includes(empId));
}

/*
 * นัดที่ทีมก่อนการขายตั้งเอง — แยกออกจากนัดของ PM/GM
 * ปฏิทินของ PM ตัดกลุ่มนี้ทิ้ง ส่วนหน้าคำขอของฝ่ายขายหยิบเฉพาะของใบตัวเอง
 */
export const isPsEvent = (e: PmEvent) => e.by === "ps";

/*
 * นัดที่ฝ่ายขายตั้งเอง (ผู้ใช้สั่ง 5 ต.ค. 2569) — ผู้เข้าร่วมเป็นผู้สนใจ ไม่ใช่พนักงาน
 * ขึ้นเฉพาะตารางงานของฝ่ายขาย ปฏิทินของ PM ตัดทิ้งเหมือนนัดของทีมก่อนการขาย
 */
export const isSalesEvent = (e: PmEvent) => e.by === "sales";

export function psEventsOf(all: PmEvent[], requestNo: string) {
  return all
    .filter((e) => isPsEvent(e) && e.ps === requestNo)
    .sort((a, b) => a.date.localeCompare(b.date) || a.from.localeCompare(b.from));
}

/*
 * นัดที่ต้องแจ้งเตือนผู้เข้าร่วม (spec 24 ก.ย. 2569 "นัดหมายที่สร้างต้องแจ้งเตือนผู้เข้าร่วม")
 *
 * ตัวกระดิ่งอยู่ใน notifications.ts ซึ่งเป็นของอีกงานหนึ่ง ที่นี่จึงเตรียมเฉพาะ "ของที่ต้องแจ้ง"
 * ให้ฝั่งกระดิ่งหยิบไปทำเป็นข้อความได้เลย — นัดใหม่ที่ยังไม่ถึงวัน และนัดที่เพิ่งถูกยกเลิก
 */
export type EventNotice = {
  kind: "invite" | "cancel";
  /** รหัสพนักงานที่ต้องได้รับ (ผู้เข้าร่วมทุกคน) */
  who: string[];
  event: PmEvent;
};

export function eventNotices(all: PmEvent[], today: string): EventNotice[] {
  const out: EventNotice[] = [];
  for (const e of all) {
    if (e.cancel) {
      /* ยกเลิกแล้วต้องบอกคนที่เคยถูกเชิญ เพราะเขาอาจกันเวลาไว้แล้ว */
      if (endOf(e) >= today) out.push({ kind: "cancel", who: e.who, event: e });
      continue;
    }
    if (endOf(e) >= today) out.push({ kind: "invite", who: e.who, event: e });
  }
  return out;
}

/*
 * นัดที่ "ถูกแก้" และต้องแจ้งผู้เข้าร่วม (เจ้าของสั่ง 24 ก.ย. 2569)
 *
 * แยกจาก eventNotices เพราะคนรับไม่ใช่กลุ่มเดียวกัน — คนที่ถูกถอดออกจากนัด
 * ไม่อยู่ใน who แล้ว แต่ยังต้องได้รับแจ้งว่าไม่ต้องไป ถ้าเอามารวมชุดเดียวกัน
 * ฝั่งกระดิ่งจะแยกไม่ออกว่าใบนี้ส่งถึงใครด้วยเหตุผลอะไร
 *
 * ใบที่ถูกยกเลิกไปแล้วไม่ต้องบอกว่าเคยเลื่อน เพราะข่าวยกเลิกกลบไปหมดแล้ว
 */
export type EventChangeNotice = {
  /** changed = คนที่ยังอยู่ในนัด · dropped = คนที่ถูกถอดออก */
  kind: "changed" | "dropped";
  /** รหัสพนักงานที่ต้องได้รับ */
  who: string[];
  event: PmEvent;
  change: EventChange;
};

export function eventChangeNotices(all: PmEvent[], today: string): EventChangeNotice[] {
  const out: EventChangeNotice[] = [];
  for (const e of all) {
    if (e.cancel || endOf(e) < today) continue;
    const c = lastEdit(e);
    if (!c) continue;
    /* ผู้เข้าร่วมที่ยังอยู่ — บอกเฉพาะตอนวัน เวลา หรือรายชื่อเปลี่ยนจริง */
    if ((c.date || c.time || c.added.length || c.removed.length) && e.who.length)
      out.push({ kind: "changed", who: e.who, event: e, change: c });
    if (c.removed.length) out.push({ kind: "dropped", who: c.removed, event: e, change: c });
  }
  return out;
}
