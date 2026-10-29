/*
 * งานต่อกัน + สถานะรอข้อมูล (แผนที่ระบบ ERP MAZ 20 ต.ค. 2569 หัวข้อ 6 และ 8)
 *
 * งานหนึ่งใบบอกได้ว่า "เริ่มได้เมื่องานไหนผ่าน" (ProjectTask.after เก็บชื่องาน — ชื่อไม่ซ้ำในโปรเจคเดียว)
 * สถานะ "รอข้อมูล" ไม่เก็บซ้ำ คำนวณจาก after ทุกครั้ง — งานก่อนหน้าผ่านปุ๊บ ใบที่รออยู่เริ่มได้เอง
 *
 * ตอนวางแผน ระบบเติมให้จากเฟส: เฟสถัดไปรอเฟสก่อนหน้า · เฟสที่ par เดียวกันทำคู่กัน ไม่รอกัน
 * ไม่มีหน้าจอให้ PM แก้งานต่อกันแล้ว — after ที่ตั้งไว้ก่อน (ข้อมูลเก่า) ยังอ่านได้ตามเดิม (ผู้ใช้สั่ง 21 ต.ค. 2569)
 */

import { daysBetween } from "./format";
import { lastSub, type ProjectTask, type WaitKind } from "./pm-data";

/**
 * ระหว่างรอข้อมูล ส่งงานได้ไหม — true = ล็อก ปุ่มส่งงานกดไม่ได้ และสโตร์ไม่รับ
 * ตามแผนผังสถานะในเอกสาร "รอข้อมูล" ไปได้ทางเดียวคือกลับเป็น "ยังไม่เริ่ม" ไม่มีทางไป "รอตรวจ"
 */
export const LOCK_SEND_WHILE_WAITING = true;

/** งานก่อนหน้า "ผ่าน" = ผู้ตรวจกดผ่านแล้ว — รอลูกค้าตรวจ หรือเสร็จแล้ว */
export function passed(t: ProjectTask) {
  return t.status === "wait" || t.status === "done";
}

/** ขั้นของแต่ละเฟส — เฟสติดกันที่ par เดียวกันนับเป็นขั้นเดียว */
export function phaseSteps(phases: { par?: string }[]): number[] {
  const out: number[] = [];
  phases.forEach((ph, i) => {
    const same = i > 0 && Boolean(ph.par) && phases[i - 1].par === ph.par;
    out.push(i === 0 ? 0 : same ? out[i - 1] : out[i - 1] + 1);
  });
  return out;
}

/*
 * ลำดับงานมาจากแม่แบบ (เฟสในข้อเสนอ) เท่านั้น — ไม่มีช่อง "เริ่มได้เมื่อ" ให้ PM ติ๊กเองแล้ว
 * เฟสที่ PM สร้างเอง (own) ไม่มีงานต่อกันอัตโนมัติ เริ่มได้ทันที และไม่นับเป็นขั้นที่เฟสแม่แบบต้องรอ
 * งานที่ไม่มีข้อเสนอ = ทุกเฟสสร้างเอง = ทุกงานเริ่มได้ทันที (ผู้ใช้สั่ง 21 ต.ค. 2569)
 */
type StepPhase = { par?: string; own?: boolean };

/** งานต่อกันตามแม่แบบ — ทุกงานในขั้นก่อนหน้าที่ใกล้ที่สุดที่มีงาน (ข้ามขั้นที่ไม่มีงาน) · เฟสสร้างเอง = [] */
export function autoAfter(phases: StepPhase[], plan: { name: string }[][], phase: number): string[] {
  if (phases[phase]?.own) return [];
  /* นับขั้นเฉพาะเฟสแม่แบบ — เฟสที่สร้างเองแทรกอยู่ไม่ทำให้ลำดับของแม่แบบขาดตอน */
  const tpl = phases.map((ph, i) => ({ ph, i })).filter((x) => !x.ph.own);
  const steps = phaseSteps(tpl.map((x) => x.ph));
  const stepOf = new Map(tpl.map((x, k) => [x.i, steps[k]]));
  const mine = stepOf.get(phase) ?? 0;
  for (let s = mine - 1; s >= 0; s--) {
    const names = plan.flatMap((list, pi) => (stepOf.get(pi) === s ? list.map((t) => t.name) : []));
    if (names.length) return names;
  }
  return [];
}

/** after ที่ใช้จริง — ไม่มีค่าเดิม = ตามแม่แบบ · ค่าที่ตั้งไว้ก่อน (ข้อมูลเก่า) ตัดชื่องานที่ถูกลบไปแล้วทิ้ง */
export function resolveAfter(
  phases: StepPhase[],
  plan: { name: string }[][],
  phase: number,
  after: string[] | undefined,
): string[] {
  if (!after) return autoAfter(phases, plan, phase);
  const have = new Set(plan.flat().map((t) => t.name));
  return after.filter((n) => have.has(n));
}

/*
 * รอข้อมูลที่คนทำกดเอง (ผู้ใช้สั่ง 21 ต.ค. 2569) — รอนอกแผน เช่น รอลูกค้าส่งรูป
 * ไม่ล็อกปุ่มส่งงาน (ล็อกเฉพาะรองานก่อนหน้าตามแผน) · เก็บประวัติไว้ ไม่นับเวลารอเป็นความช้าของคนทำ
 */
export const WAIT_KIND_LABEL: Record<WaitKind, string> = {
  customer: "รอลูกค้า",
  file: "รอไฟล์",
  other: "รอเรื่องอื่น",
};

/** รอข้อมูลที่กดเองมากี่วัน — นับจากวันที่กด */
export function manualWaitDays(t: Pick<ProjectTask, "waitingOn">, today: string) {
  return t.waitingOn ? Math.max(0, daysBetween(t.waitingOn.since.slice(0, 10), today)) : 0;
}

function prereqs(tasks: ProjectTask[], t: ProjectTask) {
  return (t.after ?? [])
    .map((n) => tasks.find((x) => x.name === n))
    .filter((x): x is ProjectTask => Boolean(x));
}

/**
 * งานก่อนหน้าที่ยังไม่ผ่าน — ว่าง = เริ่มได้
 * รอเฉพาะใบที่ยังไม่เคยส่ง ใบที่ส่งแล้ว/ถูกตีกลับ/ผ่านแล้ว ไม่ย้อนกลับไปรอ
 */
export function blockers(tasks: ProjectTask[], t: ProjectTask): ProjectTask[] {
  if (t.status !== "todo" && t.status !== "doing") return [];
  return prereqs(tasks, t).filter((x) => !passed(x));
}

/** รอมากี่วัน — นับจากวันเริ่มตามแผน (วันที่ควรได้เริ่ม) ยังไม่ถึงวันเริ่ม = 0 */
export function waitingDays(t: ProjectTask, today: string) {
  return t.start && t.start <= today ? daysBetween(t.start, today) : 0;
}

/**
 * เวลาที่งานก่อนหน้าผ่านครบ — ใช้แจ้งคนทำว่าเริ่มงานได้แล้ว
 * งานที่ผ่านแล้วรอลูกค้าตรวจยังไม่มีเวลาประทับตอนผ่าน ใช้เวลาส่งรอบล่าสุดแทน
 */
export function readySince(tasks: ProjectTask[], t: ProjectTask): string | null {
  if (t.status !== "todo" && t.status !== "doing") return null;
  const pre = prereqs(tasks, t);
  if (!pre.length || !pre.every(passed)) return null;
  const stamps = pre.map((x) => x.doneAt ?? lastSub(x)?.at ?? "").filter(Boolean).sort();
  return stamps[stamps.length - 1] ?? null;
}
