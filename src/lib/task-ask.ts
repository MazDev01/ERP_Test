/*
 * งานที่ทีมเสนอเอง (เจ้าของอนุมัติ 20 ต.ค. 2569)
 *
 * กติกา
 *   1. เสนอได้เฉพาะงานของตัวเอง — ผู้รับงานคือคนเสนอคนเดียว
 *   2. ทุกงานต้องให้ PM อนุมัติก่อน
 *   3. นับเข้า % ของโปรเจคเฉพาะงานที่อนุมัติแล้วและผูกโปรเจค
 *
 * ใบเสนอไม่เคยถูกลบ — อนุมัติแล้วจด ok · ไม่อนุมัติจด no · ผู้เสนอปิดใบที่ไม่อนุมัติแล้วจด gone
 * เก็บไว้ทุกใบเพื่อให้การเติมตัวอย่างตามรหัส (migratePm) ไม่ดึงใบที่จบไปแล้วกลับมา
 *
 * งานนอกโปรเจคที่อนุมัติแล้วอยู่ใน PmState.loose (รูปเดียวกับงานในโปรเจค)
 * ไม่ได้อยู่ใน projects — หน้ารายการโปรเจค แดชบอร์ด และ % ของโปรเจคจึงไม่เห็นงานพวกนี้เลย
 * หน้างานที่ได้รับ / งานรอตรวจ / กระดิ่ง ประกอบ "บ้านชั่วคราว" ต่อคน (looseHomes) ตอนอ่าน
 * แล้วใช้ submitWork / approveWork / sendBackWork ตัวเดิมผ่านคีย์ loose:<รหัสพนักงาน>
 */

import type { Project, ProjectTask, TaskFile } from "./pm-data";

export type AskFrom = "client" | "staff";

export const ASK_FROM_LABEL: Record<AskFrom, string> = {
  client: "ลูกค้า",
  staff: "คนในบริษัท",
};

export type TaskAsk = {
  /** รหัสภายใน ไม่โชว์ในหน้าจอ */
  id: string;
  /** รหัสพนักงานผู้เสนอ = ผู้รับงาน */
  by: string;
  /** "YYYY-MM-DD HH:mm" */
  at: string;
  /** เลขที่โปรเจค — ว่าง = ไม่อยู่ในโปรเจค */
  pj: string;
  name: string;
  from: AskFrom;
  /** ชื่อคนที่ขอมา พิมพ์เอง */
  fromName: string;
  brief: string;
  due: string;
  files: TaskFile[];
  /** PM อนุมัติแล้ว — pj คือที่ที่งานไปอยู่จริง (PM เปลี่ยนได้ตอนอนุมัติ) */
  ok?: { at: string; by: string; pj: string; name: string };
  /** PM ไม่อนุมัติ — เหตุผลบังคับ */
  no?: { why: string; at: string; by: string };
  /** ผู้เสนอรับทราบผลไม่อนุมัติแล้ว ซ่อนจากหน้าของตัวเอง */
  gone?: boolean;
};

/** ที่มาของงานที่เกิดจากการเสนอ — ไว้ดูประวัติเท่านั้น ไม่มีผลกับการเดินงาน */
export type TaskOrigin = {
  ask: string;
  by: string;
  at: string;
  from: AskFrom;
  fromName: string;
};

export function askWaiting(a: TaskAsk) {
  return !a.ok && !a.no;
}

/* ─── บ้านชั่วคราวของงานนอกโปรเจค ─────────────────────────────── */

const LOOSE = "loose:";
export const LOOSE_NAME = "งานนอกโปรเจค";

export function looseKey(emp: string) {
  return `${LOOSE}${emp}`;
}

export function isLoose(pj: string | null | undefined) {
  return Boolean(pj?.startsWith(LOOSE));
}

export function looseOwner(pj: string) {
  return pj.slice(LOOSE.length);
}

/** โปรเจคจำลองหนึ่งคน — สร้างตอนอ่าน ไม่เก็บลงสโตร์ และไม่ออกไปถึงหน้ารายการโปรเจค */
export function looseHome(emp: string, tasks: ProjectTask[], pm: string): Project {
  return {
    pj: looseKey(emp),
    bill: "",
    service: "",
    name: LOOSE_NAME,
    cus: LOOSE_NAME,
    quo: "",
    net: 0,
    scope: "",
    pm,
    start: "",
    due: "",
    status: "running",
    updated: "",
    tone: "a",
    phases: [],
    tasks,
    chat: [],
    acts: [],
    docs: [],
  };
}

export function looseHomes(loose: ProjectTask[], pm: string): Project[] {
  const by = new Map<string, ProjectTask[]>();
  for (const t of loose) {
    const id = t.whos[0];
    if (!id) continue;
    by.set(id, [...(by.get(id) ?? []), t]);
  }
  return [...by.entries()].map(([id, tasks]) => looseHome(id, tasks, pm));
}

/* ─── ตัวอย่าง (เติมให้เครื่องที่ยังไม่มีตามรหัสใน migratePm) ─────── */

const PM_E = "E10";

export const ASK_SEED: TaskAsk[] = [
  {
    id: "ASK-SEED-01",
    by: "E05",
    at: "2026-10-19 14:20",
    pj: "PJ-2569-0021",
    name: "ทำหน้าโปรโมชันเค้กปีใหม่",
    from: "client",
    fromName: "คุณใจงาม",
    brief: "ลูกค้าโทรมาขอหน้าโปรโมชันเค้กปีใหม่ 1 หน้า มีภาพเค้ก 6 แบบ ราคา และปุ่มสั่งล่วงหน้า",
    due: "2026-10-30",
    files: [{ n: "ตัวอย่างโปรโมชันจากลูกค้า.png", k: "image", sz: "380 KB", at: "2026-10-19", by: "E05" }],
  },
  {
    id: "ASK-SEED-02",
    by: "E05",
    at: "2026-10-20 09:40",
    pj: "",
    name: "ปรับเทมเพลตอีเมลตอบลูกค้าของฝ่ายขาย",
    from: "staff",
    fromName: "ชญ ฝ่ายขาย",
    brief: "ฝ่ายขายขอให้ปรับเทมเพลตอีเมลให้เปิดบนมือถือแล้วไม่เพี้ยน ใส่โลโก้และลายเซ็นใหม่",
    due: "2026-10-27",
    files: [],
  },
  {
    id: "ASK-SEED-03",
    by: "E05",
    at: "2026-10-14 11:05",
    pj: "",
    name: "ทำสไลด์แนะนำบริการทำเว็บไซต์",
    from: "staff",
    fromName: "เสริฐ",
    brief: "สไลด์ 8 หน้าไว้ใช้ตอนพบลูกค้าใหม่ มีผลงานเว็บ 4 ชิ้น ขั้นตอนทำงาน และระยะเวลา",
    due: "2026-10-24",
    files: [],
    ok: { at: "2026-10-15 09:30", by: PM_E, pj: "", name: "ทำสไลด์แนะนำบริการทำเว็บไซต์" },
  },
  {
    id: "ASK-SEED-04",
    by: "E05",
    at: "2026-10-16 16:10",
    pj: "PJ-2569-0021",
    name: "เปลี่ยนฟอนต์ทั้งเว็บเบเกอรี่",
    from: "staff",
    fromName: "ใบเตย",
    brief: "อยากเปลี่ยนฟอนต์หัวข้อให้เข้ากับโลโก้ร้านมากขึ้น",
    due: "2026-10-23",
    files: [],
    no: { why: "ลูกค้าอนุมัติฟอนต์ชุดเดิมไปแล้ว ถ้าจะเปลี่ยนต้องคุยกับลูกค้าก่อน", at: "2026-10-17 10:05", by: PM_E },
  },
];

export const LOOSE_SEED: ProjectTask[] = [
  {
    name: "ทำสไลด์แนะนำบริการทำเว็บไซต์",
    phase: 0,
    whos: ["E05"],
    start: "2026-10-15",
    due: "2026-10-24",
    status: "doing",
    pct: 0,
    files: [],
    brief: "สไลด์ 8 หน้าไว้ใช้ตอนพบลูกค้าใหม่ มีผลงานเว็บ 4 ชิ้น ขั้นตอนทำงาน และระยะเวลา",
    assignedAt: "2026-10-15 09:30",
    lastChange: { at: "2026-10-15 09:30", what: "assign", by: PM_E },
    origin: { ask: "ASK-SEED-03", by: "E05", at: "2026-10-14 11:05", from: "staff", fromName: "เสริฐ" },
  },
];
