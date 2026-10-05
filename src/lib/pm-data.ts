/*
 * งานฝั่งผู้จัดการโครงการ (PM) — งานเข้าใหม่ → วางแผนงาน → โปรเจค
 *
 * บัญชีส่งงานที่ลูกค้าชำระงวดแรกแล้วมาให้ PM (PM_INBOX)
 * PM ตรวจเอกสารแล้วส่งเข้าขั้นตอนวางแผน จัดลำดับงานย่อยและเลือกผู้รับผิดชอบ
 * พอยืนยันแผนจึงกลายเป็นโปรเจคที่ติดตามความคืบหน้าได้ (PM_PROJECTS)
 *
 * ยังไม่มี backend — เมื่อต่อ API แล้วให้แทนที่ด้วยตาราง
 * project / project_task / employee_role / task_handoff
 */

import { merged } from "./catalog";
import { settings } from "./system-settings";

// ═══ ตำแหน่งงานในทีม ═══════════════════════════════════════════
/*
 * ตำแหน่งงานในทีม แบ่งเป็นสองสาย
 *   สายระบบ  — งานเว็บไซต์และระบบ
 *   สายการตลาด — งาน Digital Marketing
 * เฟสของงานระบุตำแหน่งที่ควรรับผิดชอบ หน้าวางแผนงานใช้ตรงนี้เตือนเวลามอบผิดสาย
 */
/** รหัสตำแหน่งในทีม — ชุดตั้งต้นด้านล่าง + ที่ผู้ดูแลระบบเพิ่ม (teamRoles()) */
export type TeamRole = string;

export const BUILTIN_TEAM_ROLES: { key: TeamRole; label: string; color: string }[] = [
  { key: "ba", label: "วิเคราะห์ระบบ", color: "#7c5ce0" },
  { key: "design", label: "ออกแบบ UI/UX", color: "#e0568a" },
  { key: "frontend", label: "พัฒนาหน้าเว็บ", color: "#2f7dd1" },
  { key: "backend", label: "พัฒนาระบบหลังบ้าน", color: "#d97706" },
  { key: "content", label: "คอนเทนต์และกราฟิก", color: "#0ea5a5" },
  { key: "qa", label: "ทดสอบระบบ", color: "#2e9e6b" },
  { key: "deploy", label: "ติดตั้งและส่งมอบ", color: "#8a6a2f" },
  { key: "plan", label: "วางแผนแคมเปญ", color: "#c2410c" },
  { key: "media", label: "วางแผนสื่อและโฆษณา", color: "#0369a1" },
  { key: "artwork", label: "อาร์ตเวิร์ก", color: "#be185d" },
  { key: "caption", label: "เขียนแคปชัน", color: "#6d28d9" },
];

/** ตำแหน่งในทีมทั้งหมด — ผู้ดูแลระบบเพิ่ม/แก้ชื่อได้ที่ /admin/options */
export function teamRoles() {
  return merged(settings().catalog.teamRoles, BUILTIN_TEAM_ROLES, (r) => r.key);
}

export function roleLabel(key: TeamRole) {
  return teamRoles().find((r) => r.key === key)?.label ?? key;
}

export function roleColor(key: TeamRole) {
  return teamRoles().find((r) => r.key === key)?.color ?? "#888888";
}

export type Member = {
  id: string;
  name: string;
  roles: TeamRole[];
  /** จำนวนงานที่ถืออยู่ตอนนี้ — ใช้ดูว่าใครว่างพอจะรับเพิ่ม */
  load: number;
  /** พ้นสภาพแล้วในทะเบียนฝ่ายบุคคล — ยังอยู่เพื่อแสดงชื่อในงานเก่า แต่เลือกมอบหมายใหม่ไม่ได้ */
  left?: boolean;
};

/*
 * ตำแหน่งในทะเบียนฝ่ายบุคคลที่นับเป็นทีมงานของ PM → ทักษะตั้งต้นในทีม
 * พนักงานใหม่ในตำแหน่งเหล่านี้เข้าทีมเองทันที PM ปรับทักษะเพิ่มได้ภายหลัง
 * ตำแหน่งบริหาร/สนับสนุน (GM, PM, บัญชีและบุคคล, แม่บ้าน, BD, Sales) ไม่ได้เป็นทีมผลิตงาน
 */
export const TEAM_ROLES_BY_POSITION: Record<string, TeamRole[]> = {
  graphic: ["design", "artwork"],
  content: ["content", "caption"],
  media: ["media"],
  website: ["frontend"],
  sa: ["ba"],
  dev: ["backend"],
};

export const PM_TEAM: Member[] = [
  /* ทีมงานตามทะเบียนต้นแบบ PM_PEOPLE — ตำแหน่งสายผลิต (ไม่รวมแม่บ้าน บัญชี GM PM) · ภาระงานคิดจากงานจริง */
  { id: "E01", name: "ปิยะวัฒน์ แก้วใส", roles: ["ba"], load: 0 },
  { id: "E02", name: "ณิชา วงศ์อารีย์", roles: ["design","artwork"], load: 0 },
  { id: "E03", name: "ธนกฤต ศรีบุญเรือง", roles: ["frontend"], load: 0 },
  { id: "E04", name: "อรรถพล ใจกล้า", roles: ["backend"], load: 0 },
  { id: "E05", name: "กมลชนก พูนสุข", roles: ["frontend"], load: 0 },
  { id: "E06", name: "ศุภณัฐ ทองแท้", roles: ["backend"], load: 0 },
  { id: "E07", name: "พิมพ์ชนก ดีงาม", roles: ["content","caption"], load: 0 },
  { id: "E08", name: "วรากร สุขเสมอ", roles: ["ba"], load: 0 },
  { id: "E09", name: "ธีรวัฒน์ ศรีสมบูรณ์", roles: ["media"], load: 0 },
  { id: "E13", name: "ธนดล เกียรติศักดิ์", roles: ["plan"], load: 0 },
  { id: "E14", name: "ณัฐริกา ใจอารีย์", roles: ["design","artwork"], load: 0 },
  { id: "E17", name: "ภัทรพล คำมูล", roles: ["frontend"], load: 0 },
  { id: "E16", name: "สิทธิชัย รุ่งเรือง", roles: ["content","caption"], load: 0, left: true },
];

// ═══ งานเข้าใหม่จากฝ่ายบัญชี ════════════════════════════════════
/** new = รอ PM ตรวจเอกสาร · plan = ส่งเข้าขั้นตอนวางแผนแล้ว */
/*
 * ประเภทบริการที่บริษัทขาย — ใช้แยกว่างานใบนี้ต้องเดินสายงานแบบไหน
 * งาน Digital Marketing มีหน้าโฆษณาและรายงานเป็นของตัวเอง ประเภทอื่นไม่มี
 */
/** รหัสประเภทบริการ — ชุดตั้งต้นด้านล่าง + ที่ผู้ดูแลระบบเพิ่ม (services()) · "dm" มีหน้าโฆษณาของตัวเอง */
export type ServiceKey = string;

export const BUILTIN_SERVICES: { key: ServiceKey; label: string }[] = [
  { key: "bplan", label: "Business Plan" },
  { key: "branding", label: "Branding" },
  { key: "seo", label: "SEO" },
  { key: "franchise", label: "Franchise" },
  { key: "complan", label: "Communication Plan" },
  { key: "dm", label: "Digital Marketing" },
  { key: "dataviz", label: "Data Visualize" },
  { key: "website", label: "Website" },
];

/** ประเภทบริการทั้งหมด — ผู้ดูแลระบบเพิ่ม/แก้ชื่อได้ที่ /admin/options */
export function services() {
  return merged(settings().catalog.services, BUILTIN_SERVICES, (x) => x.key);
}

export function serviceLabel(key: ServiceKey) {
  return services().find((s) => s.key === key)?.label ?? key;
}

export type InboxStage = "new" | "plan";

export type Phase = {
  name: string;
  role: TeamRole;
  start: string;
  end: string;
  /** งานย่อยที่ทีมก่อนการขายกำหนดมาแล้ว PM แค่จัดลำดับกับหาคนทำ */
  tasks: string[];
  /** กลุ่มเฟสที่ทำคู่กัน — เฟสรหัสเดียวกันเริ่มพร้อมกัน (ต้นแบบ par A/B) */
  par?: string;
};

export type Proposal = {
  no: string;
  round: number;
  at: string;
  by: string;
  hours: number;
  note: string;
  kind: "pdf" | "canva";
  file: string;
  url: string;
};

export type InboxJob = {
  /*
   * โปรเจคผูกกับ "วางบิลงวดแรก" ไม่ใช่ดีล (ผู้ใช้สั่ง 5 ต.ค. 2569)
   * โปรเจคมาได้สองทาง — ดีลฝ่ายขายที่ส่งไปวางบิล หรือลูกค้าเก่าที่ฝ่ายบัญชีออกใบเสนอราคาเอง
   * ทั้งสองทางมาบรรจบที่ใบแจ้งหนี้งวดแรก โปรเจคจึงอ้างใบนั้นเสมอ และมีเลขของตัวเอง
   */
  /** เลขที่โปรเจค PJ-<พ.ศ.>-xxxx — ตัวระบุโปรเจคทุกที่ในระบบ (ลิงก์ ?pj= ร่างแผน แชท ตารางงาน) */
  pj: string;
  /** เลขที่ใบแจ้งหนี้งวดแรก (วางบิลงวดแรก) — ผ่านใบนี้ไปถึงใบเสนอราคาและลูกค้า · ว่างได้กับข้อมูลเก่าที่ยังไม่รู้เลข */
  bill: string;
  /** เลขที่ดีลฝ่ายขาย — มีเฉพาะงานที่มาจากดีล ห้ามใช้เป็นตัวระบุโปรเจค */
  deal?: string;
  service: ServiceKey;
  cus: string;
  quo: string;
  quoDate: string;
  net: number;
  /** จำนวนงวดตามเงื่อนไขชำระเงิน */
  seqs: number;
  paidAt: string;
  sentAt: string;
  scope: string;
  items: string[];
  due: string;
  stage: InboxStage;
  planStart: string;
  planEnd: string;
  durationDays: number;
  /*
   * งานที่มีข้อเสนอ = งานโปรเจค ต้องวางแผนและมอบหมายทีม
   * งานที่ไม่มี = งานเดี่ยว ลูกค้าสั่งตรงจบในตัว ไม่ต้องเปิดโปรเจค (ดู isSolo)
   */
  phases: Phase[];
  proposal?: Proposal;
  /*
   * งานเดี่ยวไม่ผ่านการวางแผน PM จับคนและกำหนดวันส่งตั้งแต่ตอนรับงาน
   * สองช่องนี้จึงมีค่าเฉพาะงานเดี่ยวที่รับแล้ว งานโปรเจคใช้เฟสในข้อเสนอแทน
   */
  assignWhos?: string[];
  assignDue?: string;
  /** PM เปิดดูเอกสารแล้วหรือยัง — ยังไม่เปิดขึ้นจุดแดงหน้าแถวในกล่องงานเข้าใหม่ */
  seen?: boolean;
  /** วันเริ่มโครงการที่ PM เลือกตอนรับงาน */
  projectStart?: string;
  /*
   * กล่องงานเข้าใหม่เป็นกระดานรับงานกลาง PM ทุกคนและ GM เห็นตารางเดียวกัน (ผู้ใช้สั่ง 5 ต.ค. 2569)
   * ใครกดรับก่อนได้งาน — จดชื่อคนรับไว้ให้คนอื่นเห็นว่างานไปอยู่กับใคร และห้ามรับซ้ำ
   * ข้อมูลเก่าที่รับไปก่อนมีช่องนี้ไม่มีชื่อ หน้าจอขึ้นแค่ "รับแล้ว"
   */
  /** ชื่อคนที่กดรับงาน */
  takenBy?: string;
  /** วันที่กดรับงาน (YYYY-MM-DD) */
  takenAt?: string;
  /** ชื่อโปรเจคที่ PM ตั้งตอนรับงาน (PM-BR-03) — ติดไปกับโปรเจคตอนยืนยันแผน */
  name?: string;
  /** เอกสารอื่นที่ PM/GM แนบเพิ่มให้ทีมเห็น — ติดไปกับโปรเจคตอนยืนยันแผน (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  docs?: ProjectDoc[];
  contact: string;
  phone: string;
  taxId: string;
  address: string;
  terms: string;
  validDays: number;
};

export const PM_INBOX: InboxJob[] = [
  /* ต้นแบบ dose-erp-maz/pm-inbox.html PM_INBOX (6 งาน) — ตำแหน่งของเฟสแปลงเป็นตำแหน่งในทีม */
  {
    pj: "PJ-2569-0005",
    bill: "INV-2569-0014",
    deal: "DL-2569-0009",
    service: "website",
    cus: "สยามพลาสติก",
    quo: "MAZ-2569-0042",
    quoDate: "2026-09-02",
    net: 342400,
    seqs: 2,
    paidAt: "2026-09-05",
    sentAt: "2026-09-07",
    scope: "ระบบจัดการคลังสินค้าและอบรมการใช้งาน",
    items: ["ระบบรับเข้าและตัดจ่ายสินค้า","รายงานสต๊อกคงเหลือรายวัน","เชื่อมข้อมูลกับระบบขายหน้าร้านเดิม","อบรมการใช้งาน 2 รอบ พร้อมคู่มือ"],
    due: "2026-12-20",
    stage: "new",
    planStart: "2026-09-08",
    planEnd: "2026-12-20",
    durationDays: 104,
    phases: [
      { name: "วิเคราะห์ระบบคลังสินค้า", role: "ba", start: "2026-09-08", end: "2026-09-22", tasks: ["สำรวจขั้นตอนคลังปัจจุบัน","ออกแบบผังข้อมูลสินค้า","สรุปขอบเขตกับลูกค้า"] },
      { name: "ออกแบบหน้าจอระบบ", role: "design", start: "2026-09-23", end: "2026-10-10", tasks: ["ออกแบบหน้ารับเข้าสินค้า","ออกแบบหน้าตัดจ่าย","ออกแบบรายงานสต๊อก"] },
      { name: "พัฒนาระบบรับเข้าตัดจ่าย", role: "backend", start: "2026-10-11", end: "2026-11-20", tasks: ["ทำระบบรับเข้าสินค้า","ทำระบบตัดจ่ายสินค้า","ทำรายงานสต๊อกคงเหลือรายวัน"] },
      { name: "เชื่อมระบบขายหน้าร้าน", role: "backend", start: "2026-11-21", end: "2026-12-05", tasks: ["ต่อข้อมูลกับระบบขายเดิม","ทดสอบการซิงก์ข้อมูล"] },
      { name: "ทดสอบและอบรมผู้ใช้", role: "ba", start: "2026-12-06", end: "2026-12-20", tasks: ["ทดสอบระบบทั้งหมด","จัดอบรมรอบที่ 1","จัดอบรมรอบที่ 2","ส่งมอบพร้อมคู่มือ"] },
    ],
    proposal: { no: "PS-2569-0031", round: 2, at: "2026-09-02", by: "ปิยะวัฒน์ (SA)", hours: 6, note: "ปรับขอบเขตตามที่ลูกค้าขอตัดโมดูลรายงาน", kind: "pdf", file: "proposal-siamplastic-r2.pdf", url: "" },
    contact: "ณัฐพล พงษ์ไพร",
    phone: "082-556-7788",
    taxId: "0105558009922",
    address: "88/2 ถ.เชียงใหม่–ลำพูน ต.หนองหอย อ.เมือง จ.เชียงใหม่ 50000",
    terms: "มัดจำ 50% ก่อนเริ่มงาน ส่วนที่เหลือชำระเมื่อส่งมอบ",
    validDays: 30,
  },
  {
    pj: "PJ-2569-0007",
    bill: "INV-2569-0035",
    deal: "DL-2569-0026",
    service: "website",
    cus: "บุญมีฟาร์ม",
    quo: "MAZ-2569-0045",
    quoDate: "2026-09-04",
    net: 128000,
    seqs: 2,
    paidAt: "2026-09-06",
    sentAt: "2026-09-07",
    scope: "เว็บไซต์ฟาร์มและระบบสั่งจองล่วงหน้า",
    items: ["เว็บไซต์แนะนำฟาร์ม 5 หน้า","ระบบสั่งจองสินค้าล่วงหน้า","เชื่อมแจ้งเตือนไลน์"],
    due: "2026-11-30",
    stage: "plan",
    takenBy: "ชนิกานต์ วัฒนกุล",
    takenAt: "2026-09-08",
    planStart: "2026-09-08",
    planEnd: "2026-11-30",
    durationDays: 84,
    phases: [
      { name: "วิเคราะห์และสรุปขอบเขต", role: "ba", start: "2026-09-08", end: "2026-09-16", tasks: ["เก็บความต้องการจากลูกค้า","สรุปขอบเขตงานเป็นเอกสาร","ยืนยันขอบเขตกับลูกค้า"] },
      { name: "ออกแบบ UI ทั้งเว็บไซต์", role: "design", start: "2026-09-17", end: "2026-09-30", tasks: ["วางโทนสีและฟอนต์","ออกแบบปุ่มและองค์ประกอบ","จัดองค์ประกอบหน้าแรก","ออกแบบหน้าที่เหลือ 4 หน้า"] },
      { name: "พัฒนาเว็บไซต์", role: "frontend", start: "2026-10-01", end: "2026-10-31", tasks: ["วางโครงหน้าเว็บ","ทำหน้าแรกตามแบบ","ทำหน้าที่เหลือ 4 หน้า","ปรับให้แสดงผลบนมือถือ"] },
      { name: "ระบบสั่งจองและแจ้งเตือน", role: "backend", start: "2026-11-01", end: "2026-11-18", tasks: ["ทำระบบสั่งจองล่วงหน้า","เชื่อมแจ้งเตือนไลน์","ทำหน้าจัดการออเดอร์"] },
      { name: "ทดสอบและส่งมอบ", role: "ba", start: "2026-11-19", end: "2026-11-30", tasks: ["ทดสอบทุกหน้าและระบบจอง","แก้ตามผลทดสอบ","ติดตั้งขึ้นเซิร์ฟเวอร์จริง","อบรมและส่งมอบ"] },
    ],
    proposal: { no: "PS-2569-0028", round: 1, at: "2026-08-30", by: "ธนดล (BD)", hours: 3.5, note: "ข้อเสนอระบบจัดการออเดอร์ผลผลิต พร้อมเดโมหน้าจอ", kind: "canva", file: "ข้อเสนอ บุญมีฟาร์ม (Canva)", url: "https://www.canva.com/design/DAGyyyyyyy/view" },
    contact: "บุญมี ทองสุข",
    phone: "081-778-4433",
    taxId: "0505561000456",
    address: "12 หมู่ 4 ต.สันทราย อ.สันทราย จ.เชียงใหม่ 50210",
    terms: "มัดจำ 40% ก่อนเริ่มงาน ส่วนที่เหลือชำระเมื่อส่งมอบ",
    validDays: 30,
  },
  {
    pj: "PJ-2569-0008",
    bill: "INV-2569-0036",
    deal: "DL-2569-0035",
    service: "dm",
    cus: "เอ็นอาร์ พร็อพเพอร์ตี้",
    quo: "MAZ-2569-0052",
    quoDate: "2026-09-01",
    net: 270000,
    seqs: 3,
    paidAt: "2026-09-06",
    sentAt: "2026-09-07",
    scope: "Digital Marketing 3 แคมเปญ ระยะ 6 เดือน",
    items: ["วางแผนแคมเปญ 3 ชุด","ดูแลเพจและยิงโฆษณา 6 เดือน","รายงานผลรายสัปดาห์และรายเดือน"],
    due: "2027-03-07",
    stage: "new",
    planStart: "2026-09-08",
    planEnd: "2027-03-07",
    durationDays: 180,
    phases: [
      { name: "รับงานและวางไทม์ไลน์", role: "plan", start: "2026-09-08", end: "2026-09-11", tasks: ["รับบรีฟจากฝ่ายขาย","ทำ Check List และ Timeline"] },
      { name: "วางแผนแคมเปญ", role: "plan", start: "2026-09-12", end: "2026-09-18", tasks: ["สรุป Key message และ Support message","กำหนดจำนวนชิ้นงานต่อแคมเปญ"], par: "A" },
      { name: "วาง Media Plan", role: "media", start: "2026-09-12", end: "2026-09-18", tasks: ["กำหนดกลุ่มเป้าหมาย","เลือกช่องทางและเครื่องมือ","ประมาณงบและผลลัพธ์"], par: "A" },
      { name: "ลูกค้าตรวจแผน", role: "plan", start: "2026-09-19", end: "2026-09-23", tasks: ["ส่งแผนให้ลูกค้าตรวจ","แก้ตามคอมเมนต์ลูกค้า"] },
      { name: "ผลิตอาร์ตเวิร์ก", role: "artwork", start: "2026-09-24", end: "2026-10-05", tasks: ["ทำอาร์ตเวิร์กแคมเปญที่ 1","ทำอาร์ตเวิร์กแคมเปญที่ 2","ทำอาร์ตเวิร์กแคมเปญที่ 3"], par: "B" },
      { name: "เขียนแคปชัน", role: "caption", start: "2026-09-24", end: "2026-10-05", tasks: ["เขียนแคปชันแคมเปญที่ 1","เขียนแคปชันแคมเปญที่ 2","เขียนแคปชันแคมเปญที่ 3"], par: "B" },
      { name: "ลูกค้าตรวจชิ้นงาน", role: "plan", start: "2026-10-06", end: "2026-10-09", tasks: ["ส่งอาร์ตเวิร์กและแคปชันให้ลูกค้าตรวจ","แก้ตามคอมเมนต์ลูกค้า"] },
      { name: "โพสต์และยิงโฆษณา", role: "media", start: "2026-10-12", end: "2027-02-27", tasks: ["โพสต์ลงแพลตฟอร์มตามแผน","สั่งรันโฆษณาตามรอบเดือน","ติดตามงบที่ใช้จริงรายรอบ"] },
      { name: "รายงานผล", role: "media", start: "2026-10-19", end: "2027-03-07", tasks: ["กรอกผลโฆษณารายสัปดาห์","สรุปรายงานรายเดือนส่งลูกค้า"] },
    ],
    proposal: { no: "PS-2569-0034", round: 1, at: "2026-08-28", by: "ชนิกานต์ (AE)", hours: 5, note: "แผนสื่อ 3 แคมเปญ เน้นกลุ่มเจ้าของบ้านในกรุงเทพฯ", kind: "canva", file: "ข้อเสนอ เอ็นอาร์ พร็อพเพอร์ตี้ (Canva)", url: "https://www.canva.com/design/DAGzzzzzzz/view" },
    contact: "นฤมล รัตนกิจ",
    phone: "081-224-9910",
    taxId: "0105557003311",
    address: "55 อาคารเอ็นอาร์ ชั้น 8 ถ.รัชดาภิเษก แขวงดินแดง เขตดินแดง กรุงเทพฯ 10400",
    terms: "ชำระเป็น 3 งวดตามรอบสองเดือน",
    validDays: 30,
  },
  {
    pj: "PJ-2569-0004",
    bill: "INV-2569-0033",
    deal: "DL-2569-0029",
    service: "dm",
    cus: "เซลล่า ไทยแลนด์",
    quo: "MAZ-2569-0046",
    quoDate: "2026-08-26",
    net: 96000,
    seqs: 2,
    paidAt: "2026-09-01",
    sentAt: "2026-09-03",
    scope: "Digital Marketing 1 แคมเปญ ระยะ 3 เดือน",
    items: ["วางแผนแคมเปญสกินแคร์","อาร์ตเวิร์กและแคปชัน 5 ชิ้น","ยิงโฆษณาและรายงานผล 3 เดือน"],
    due: "2026-12-02",
    stage: "plan",
    takenBy: "ชนิกานต์ วัฒนกุล",
    takenAt: "2026-09-04",
    planStart: "2026-09-03",
    planEnd: "2026-12-02",
    durationDays: 90,
    phases: [
      { name: "รับงานและวางไทม์ไลน์", role: "plan", start: "2026-09-03", end: "2026-09-05", tasks: ["รับบรีฟจากฝ่ายขาย","ทำ Check List และ Timeline"] },
      { name: "วางแผนแคมเปญ", role: "plan", start: "2026-09-08", end: "2026-09-12", tasks: ["สรุป Key message และ Support message","กำหนดจำนวนชิ้นงาน 5 ชิ้น"], par: "A" },
      { name: "วาง Media Plan", role: "media", start: "2026-09-08", end: "2026-09-12", tasks: ["กำหนดกลุ่มเป้าหมาย","เลือกช่องทางและเครื่องมือ","ประมาณงบและผลลัพธ์"], par: "A" },
      { name: "ลูกค้าตรวจแผน", role: "plan", start: "2026-09-15", end: "2026-09-17", tasks: ["ส่งแผนให้ลูกค้าตรวจ","แก้ตามคอมเมนต์ลูกค้า"] },
      { name: "ผลิตอาร์ตเวิร์ก", role: "artwork", start: "2026-09-18", end: "2026-09-30", tasks: ["ทำอาร์ตเวิร์กชิ้นที่ 1-2","ทำอาร์ตเวิร์กชิ้นที่ 3-5"], par: "B" },
      { name: "เขียนแคปชัน", role: "caption", start: "2026-09-18", end: "2026-09-30", tasks: ["เขียนแคปชัน 5 ชิ้น"], par: "B" },
      { name: "ลูกค้าตรวจชิ้นงาน", role: "plan", start: "2026-10-01", end: "2026-10-05", tasks: ["ส่งอาร์ตเวิร์กและแคปชันให้ลูกค้าตรวจ","แก้ตามคอมเมนต์ลูกค้า"] },
      { name: "โพสต์และยิงโฆษณา", role: "media", start: "2026-10-06", end: "2026-11-27", tasks: ["โพสต์ลงแพลตฟอร์มตามแผน","สั่งรันโฆษณาตามรอบเดือน"] },
      { name: "รายงานผล", role: "media", start: "2026-10-13", end: "2026-12-02", tasks: ["กรอกผลโฆษณารายสัปดาห์","สรุปรายงานรายเดือนส่งลูกค้า"] },
    ],
    proposal: { no: "PS-2569-0030", round: 2, at: "2026-08-24", by: "ชนิกานต์ (AE)", hours: 4, note: "ปรับจำนวนชิ้นงานจาก 8 เหลือ 5 ตามงบที่ลูกค้าให้", kind: "pdf", file: "proposal-cella-r2.pdf", url: "" },
    contact: "ศิริพร ชัยมงคล",
    phone: "084-119-3355",
    taxId: "0105559004488",
    address: "19 ซอยสุขุมวิท 31 แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพฯ 10110",
    terms: "มัดจำ 50% ก่อนเริ่มงาน ส่วนที่เหลือชำระเมื่อจบแคมเปญ",
    validDays: 30,
  },
  {
    pj: "PJ-2569-0006",
    bill: "INV-2569-0034",
    deal: "DL-2569-0031",
    service: "branding",
    cus: "ครัวคุณจิ",
    quo: "MAZ-2569-0048",
    quoDate: "2026-09-03",
    net: 8500,
    seqs: 1,
    paidAt: "2026-09-05",
    sentAt: "2026-09-07",
    scope: "แก้แบนเนอร์โปรโมชันหน้าเว็บ 3 ชิ้น",
    items: ["แบนเนอร์หน้าแรก 1 ชิ้น","แบนเนอร์โปรโมชันเดือน ต.ค. 2 ชิ้น"],
    due: "2026-09-18",
    stage: "plan",
    takenBy: "ชนิกานต์ วัฒนกุล",
    takenAt: "2026-09-08",
    planStart: "2026-09-08",
    planEnd: "",
    durationDays: 0,
    phases: [

    ],
    projectStart: "2026-09-08",
    contact: "จิราภรณ์ แสงทอง",
    phone: "089-441-2276",
    taxId: "0505560002118",
    address: "45/7 ถ.นิมมานเหมินท์ ต.สุเทพ อ.เมือง จ.เชียงใหม่ 50200",
    terms: "ชำระเต็มจำนวนก่อนเริ่มงาน",
    validDays: 15,
  },
  {
    pj: "PJ-2569-0009",
    bill: "INV-2569-0037",
    deal: "DL-2569-0033",
    service: "website",
    cus: "อัลฟ่าคอร์ป",
    quo: "MAZ-2569-0050",
    quoDate: "2026-09-05",
    net: 15000,
    seqs: 1,
    paidAt: "2026-09-07",
    sentAt: "2026-09-07",
    scope: "ต่ออายุโฮสติ้งและย้ายขึ้นเซิร์ฟเวอร์ใหม่",
    items: ["ต่ออายุโฮสติ้ง 1 ปี","ย้ายข้อมูลขึ้นเซิร์ฟเวอร์ใหม่","ตั้งค่าใบรับรอง SSL"],
    due: "2026-09-25",
    stage: "new",
    planStart: "",
    planEnd: "",
    durationDays: 0,
    phases: [

    ],
    contact: "ศักดิ์ชัย ธนบดี",
    phone: "086-330-5591",
    taxId: "0105556007744",
    address: "199 อาคารอัลฟ่า ชั้น 12 ถ.พระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพฯ 10310",
    terms: "ชำระเต็มจำนวนก่อนเริ่มงาน",
    validDays: 15,
  },
];

// ═══ โปรเจคที่วางแผนแล้ว ════════════════════════════════════════
/** wait = ทีมหยุดรอลูกค้าตรวจ งานไม่ได้ค้างเพราะทีมช้า */
/*
 * สถานะของงานย่อย
 *
 * sent กับ revise เป็นคนละเรื่องกับ wait
 * wait = ส่งให้ลูกค้าดูแล้วรอลูกค้า · sent = ทีมส่งให้ PM ตรวจ · revise = PM ตีกลับมาแก้
 * แยกกันเพราะคนที่ต้องขยับต่อคนละคน และหน้างานรอตรวจดูเฉพาะ sent
 */
export type TaskStatus = "todo" | "doing" | "sent" | "revise" | "wait" | "done";

export const TASK_STATUS: Record<TaskStatus, { label: string; cls: string }> = {
  todo: { label: "ยังไม่เริ่ม", cls: "t-miss" },
  doing: { label: "กำลังทำ", cls: "t-early" },
  sent: { label: "รอ PM ตรวจ", cls: "t-info" },
  revise: { label: "ต้องแก้ไข", cls: "t-late" },
  wait: { label: "รอลูกค้าตรวจ", cls: "t-leave" },
  done: { label: "เสร็จแล้ว", cls: "t-ok" },
};

export type TaskFile = {
  n: string;
  k: "image" | "pdf" | "link";
  sz: string;
  at: string;
  by: string;
};

/** ผลงานที่ทีมส่งให้ PM ตรวจหนึ่งรอบ */
export type Submission = {
  /** วันและเวลาที่กดส่ง */
  at: string;
  /** รหัสพนักงานที่ส่ง */
  by: string;
  files: string[];
  note: string;
};

/** ผลตรวจที่ PM ตีกลับมา — ต้องมีเหตุผลเสมอ ไม่งั้นคนทำไม่รู้ว่าต้องแก้อะไร */
export type SendBack = { why: string; at: string; by: string };

export type ProjectTask = {
  name: string;
  /** ดัชนีเฟสที่งานนี้อยู่ */
  phase: number;
  whos: string[];
  start: string;
  due: string;
  status: TaskStatus;
  pct: number;
  files: TaskFile[];
  /** รายละเอียดที่ PM เขียนไว้ตอนมอบหมาย — คนทำอ่านจากหน้างานที่ได้รับ */
  brief?: string;
  /*
   * ใครมอบงานใบนี้ และมอบเมื่อไร — ผู้รับงานต้องแยกงานที่เพิ่งได้รับออกจากงานเก่าได้
   * สองช่องนี้เขียนจากสโตร์เท่านั้น (confirmPlan / replanProject) หน้าจอห้ามเขียนเอง
   */
  /** "YYYY-MM-DD HH:mm" — เวลาที่งานนี้ถูกมอบหมายให้คนปัจจุบัน */
  assignedAt?: string;
  /** การเปลี่ยนแปลงล่าสุดที่ผู้รับงานต้องรู้ */
  lastChange?: { at: string; what: "assign" | "due" | "owner"; by: string };
  /** วันเวลาที่ PM ตรวจผ่าน — มีเฉพาะงานที่ปิดแล้ว */
  doneAt?: string;
  /** ทุกรอบที่เคยส่งมา เรียงจากเก่าไปใหม่ — รอบท้ายสุดคือรอบที่สะท้อนสถานะตอนนี้ */
  subs?: Submission[];
  /** เหตุผลที่ถูกตีกลับรอบล่าสุด — ล้างทิ้งเมื่อส่งใหม่หรือผ่านแล้ว */
  back?: SendBack;
};

/** รอบล่าสุดที่ส่งมา — ใช้ทั้งหน้างานรอตรวจและหน้างานที่ได้รับ */
export function lastSub(t: ProjectTask) {
  return t.subs?.[t.subs.length - 1];
}

export type ChatMessage = {
  /** รหัสพนักงาน หรือ "PM" ถ้าเป็นข้อความของผู้จัดการโครงการเอง */
  who: string;
  at: string;
  tx: string;
  /** ไฟล์ที่แนบมากับข้อความ — ยังไม่มีที่เก็บไฟล์จริง จึงเก็บแค่ชื่อกับขนาด */
  files?: { n: string; sz: string }[];
};

export type ProjectPhase = { name: string; role: TeamRole; start: string; end: string };

/** ความเคลื่อนไหวล่าสุดในโปรเจค — ไว้ให้ PM ไล่ดูว่าใครทำอะไรไปโดยไม่ต้องเปิดทีละงาน */
export type Activity = {
  kind: "file" | "chat" | "status" | "done";
  who: string;
  at: string;
  tx: string;
};

export type Project = {
  /*
   * โปรเจคผูกกับ "วางบิลงวดแรก" ไม่ใช่ดีล (ผู้ใช้สั่ง 5 ต.ค. 2569)
   * โปรเจคมาได้สองทาง — ดีลฝ่ายขายที่ส่งไปวางบิล หรือลูกค้าเก่าที่ฝ่ายบัญชีออกใบเสนอราคาเอง
   * ทั้งสองทางมาบรรจบที่ใบแจ้งหนี้งวดแรก โปรเจคจึงอ้างใบนั้นเสมอ และมีเลขของตัวเอง
   */
  /** เลขที่โปรเจค PJ-<พ.ศ.>-xxxx — ตัวระบุโปรเจคทุกที่ในระบบ (ลิงก์ ?pj= ร่างแผน แชท ตารางงาน) */
  pj: string;
  /** เลขที่ใบแจ้งหนี้งวดแรก (วางบิลงวดแรก) — ผ่านใบนี้ไปถึงใบเสนอราคาและลูกค้า · ว่างได้กับข้อมูลเก่าที่ยังไม่รู้เลข */
  bill: string;
  /** เลขที่ดีลฝ่ายขาย — มีเฉพาะงานที่มาจากดีล ห้ามใช้เป็นตัวระบุโปรเจค */
  deal?: string;
  service: ServiceKey;
  /** ชื่อโปรเจค — PM ตั้งตอนรับงานและแก้เองได้ (PM-BR-03) · ว่างใช้ชื่อลูกค้า (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  name?: string;
  cus: string;
  quo: string;
  net: number;
  scope: string;
  pm: string;
  start: string;
  due: string;
  status: "running" | "done" | "cancelled";
  updated: string;
  /** ดีลถูกยกเลิก — งานหยุด ทีมไม่ต้องทำต่อ */
  cancelled?: { at: string; by: string; why: string };
  /** โทนสีปกการ์ด — วนสามแบบเพื่อให้แยกโปรเจคออกจากกันด้วยสายตา */
  tone: "a" | "b" | "c";
  phases: ProjectPhase[];
  tasks: ProjectTask[];
  /** งานตอนรับเข้ามา (ใบเสนอราคา + ข้อเสนอ) — ใช้เปิดเอกสารตอนกลับมาวางแผนใหม่ · โปรเจคตั้งต้นไม่มี */
  source?: InboxJob;
  chat: ChatMessage[];
  acts: Activity[];
  /** ไฟล์ที่ส่งในแชทโปรเจค — เก็บเข้าไฟล์ของโปรเจคด้วย จะได้หาเจอโดยไม่ต้องไล่อ่านแชท (ตามต้นแบบ) */
  files?: TaskFile[];
  /*
   * ประวัติการโอนโปรเจค (Proposal · PM — Transfer Project)
   * โปรเจคมีเจ้าของได้คนเดียว โอนแล้วเจ้าของเดิมไม่ได้เป็นเจ้าของอีก
   * เก็บทุกครั้งที่โอน เพราะเป็นการเปลี่ยนตัวผู้รับผิดชอบ ต้องย้อนดูได้ว่าใครโอนให้ใครเพราะอะไร
   */
  transfers?: ProjectTransfer[];
  /** เอกสารอื่นที่ PM/GM แนบเพิ่มให้ทีมเห็น นอกจากใบเสนอราคา/Proposal (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  docs?: ProjectDoc[];
};

/*
 * เอกสารแนบของโปรเจค (ผู้ใช้สั่ง 5 ต.ค. 2569)
 * ยังไม่มีที่เก็บไฟล์จริง — เก็บแค่ชื่อกับขนาดเหมือนไฟล์แนบอื่นในระบบ · url มีเฉพาะที่แนบเป็นลิงก์ http(s)
 */
export type ProjectDoc = {
  n: string;
  sz: string;
  /** ชื่อคนแนบ */
  by: string;
  /** "YYYY-MM-DD HH:mm" */
  at: string;
  url?: string;
};

export type ProjectTransfer = {
  /** "YYYY-MM-DD HH:mm" */
  at: string;
  from: string;
  to: string;
  /** คนที่กดโอน — PM เจ้าของเดิม หรือ GM */
  by: string;
  why: string;
};

export const PM_PROJECTS: Project[] = [
  /* ต้นแบบ pm-projects.html PM_PROJECTS (3 โปรเจค) + งานที่ต้นแบบเติมตอนเปิดหน้า (my-tasks งานของ E05 · pm-reviews งานส่งตรวจ 2 งาน) */
  {
    pj: "PJ-2569-0002",
    bill: "INV-2569-0022",
    deal: "DL-2569-0018",
    service: "website",
    name: "เว็บไซต์องค์กร เอ็มเทค",
    cus: "เอ็มเทคเอ็นจิเนียริ่ง",
    quo: "MAZ-2569-0038",
    net: 40560,
    scope: "เว็บไซต์บริษัทและระบบฟอร์มติดต่อ",
    pm: "ชนิกานต์ วัฒนกุล",
    start: "2026-08-01",
    due: "2026-10-15",
    status: "running",
    updated: "2026-09-05",
    tone: "a",
    phases: [
      { name: "วิเคราะห์และสรุปขอบเขต", role: "ba", start: "2026-08-01", end: "2026-08-08" },
      { name: "ออกแบบหน้าจอ", role: "design", start: "2026-08-09", end: "2026-08-22" },
      { name: "พัฒนาเว็บไซต์", role: "frontend", start: "2026-08-23", end: "2026-09-20" },
      { name: "ระบบฟอร์มติดต่อ", role: "backend", start: "2026-09-21", end: "2026-09-30" },
      { name: "ทดสอบและส่งมอบ", role: "ba", start: "2026-10-01", end: "2026-10-15" },
    ],
    tasks: [
      { name: "เก็บความต้องการและสรุปขอบเขต", phase: 0, whos: ["E01"], start: "2026-08-01", due: "2026-08-05", status: "done", pct: 100, files: [{"n":"สรุปความต้องการ-เอ็มเทค.pdf","k":"pdf","sz":"1.8 MB","at":"2026-08-05","by":"E01"}] },
      { name: "ยืนยันขอบเขตกับลูกค้า", phase: 0, whos: ["E01"], start: "2026-08-06", due: "2026-08-08", status: "done", pct: 100, files: [{"n":"ขอบเขตงานฉบับลูกค้าเซ็น.pdf","k":"pdf","sz":"2.4 MB","at":"2026-08-08","by":"E01"}] },
      /* รอลูกค้าตรวจผ่านลิงก์ — คู่กับรอบตัวอย่างใน client-review-store.ts (DEMO_TOKEN) */
      { name: "ออกแบบหน้าจอทั้งเว็บไซต์", phase: 1, whos: ["E02"], start: "2026-08-09", due: "2026-08-22", status: "wait", pct: 100, files: [{"n":"แบบหน้าเว็บทั้งหมด (Figma)","k":"link","sz":"ลิงก์","at":"2026-08-22","by":"E02"},{"n":"โลโก้และชุดสี.png","k":"image","sz":"640 KB","at":"2026-08-18","by":"E02"},{"n":"หน้าแรก-ตัวอย่าง.png","k":"image","sz":"1.2 MB","at":"2026-08-20","by":"E05"}] },
      { name: "พัฒนาหน้าเว็บตามแบบ", phase: 2, whos: ["E03"], start: "2026-08-23", due: "2026-09-12", status: "sent", pct: 70, files: [{"n":"ลิงก์ทดสอบระบบ","k":"link","sz":"ลิงก์","at":"2026-09-04","by":"E03"}], subs: [{"at":"2026-09-06 00:00","by":"E03","files":["ลิงก์ทดสอบหน้างาน"],"note":"ทำตามแบบที่ตกลงไว้แล้ว รบกวนดูการแสดงผลบนมือถือด้วย"}] },
      { name: "ปรับให้แสดงผลบนมือถือ", phase: 2, whos: ["E03"], start: "2026-09-13", due: "2026-09-20", status: "sent", pct: 25, files: [], subs: [{"at":"2026-09-06 00:00","by":"E03","files":["ลิงก์ทดสอบหน้างาน"],"note":"ทำตามแบบที่ตกลงไว้แล้ว รบกวนดูการแสดงผลบนมือถือด้วย"}] },
      { name: "ระบบฟอร์มติดต่อและอีเมลแจ้งเตือน", phase: 3, whos: ["E04"], start: "2026-09-21", due: "2026-09-30", status: "todo", pct: 0, files: [] },
      { name: "ทดสอบระบบก่อนส่งมอบ", phase: 4, whos: ["E07"], start: "2026-10-01", due: "2026-10-08", status: "todo", pct: 0, files: [] },
      { name: "ติดตั้งขึ้นเซิร์ฟเวอร์จริง", phase: 4, whos: ["E06"], start: "2026-10-09", due: "2026-10-15", status: "todo", pct: 0, files: [] },
      { name: "ปรับหน้าแรกเว็บไซต์บริษัท", phase: 4, whos: ["E05"], start: "2026-08-31", due: "2026-09-04", status: "todo", pct: 0, files: [], brief: "เปลี่ยนภาพหลักและข้อความหน้าแรกตามแบบที่ลูกค้าอนุมัติ เพิ่มส่วนโลโก้ลูกค้าใต้ภาพหลัก" },
      { name: "เชื่อมฟอร์มขอใบเสนอราคาหน้าเว็บ", phase: 4, whos: ["E05"], start: "2026-09-02", due: "2026-09-10", status: "sent", pct: 0, files: [], brief: "ฟอร์มส่งเข้าอีเมลฝ่ายขายของลูกค้า มีช่องชื่อ เบอร์ ประเภทงาน และแนบไฟล์แบบได้", subs: [{"at":"2026-09-07 10:10","by":"E05","files":["quote-form.zip","ผลทดสอบฟอร์ม.pdf"],"note":"ทดสอบส่งเข้าอีเมลทดสอบแล้ว ได้รับครบทุกช่อง"}] },
    ],
    chat: [{"who":"E01","at":"2026-08-08 16:20","tx":"สรุปขอบเขตกับลูกค้าเรียบร้อย ลูกค้าขอเพิ่มหน้าข่าวสารอีกหนึ่งหน้า"},{"who":"PM","at":"2026-08-09 09:05","tx":"รับทราบ หน้าข่าวสารอยู่ในขอบเขตเดิมแล้ว ไม่ต้องคิดเพิ่ม"},{"who":"E02","at":"2026-08-22 18:40","tx":"ส่งแบบครบทุกหน้าแล้ว ฝากทีมพัฒนารีวิวก่อนเริ่มนะคะ"},{"who":"E03","at":"2026-09-04 11:15","tx":"หน้าแรกกับหน้าบริการเสร็จแล้ว เหลือหน้าติดต่อกับข่าวสาร"},{"who":"PM","at":"2026-09-05 10:30","tx":"ดีมาก อย่าลืมเช็คการแสดงผลบนมือถือด้วย เดี๋ยวรอบหน้าจะรีวิวพร้อมกัน"}],
    acts: [
      { kind: "file", who: "E03", at: "2026-09-04 11:20", tx: "เพิ่มไฟล์ ลิงก์ทดสอบระบบ ในงาน พัฒนาหน้าเว็บตามแบบ" },
      { kind: "chat", who: "PM", at: "2026-09-05 10:30", tx: "ส่งข้อความในแชทโปรเจค" },
      { kind: "status", who: "E03", at: "2026-09-04 11:15", tx: "อัปเดตความคืบหน้า พัฒนาหน้าเว็บตามแบบ เป็น 70%" },
      { kind: "done", who: "E02", at: "2026-08-22 18:40", tx: "ส่งงาน ออกแบบหน้าจอทั้งเว็บไซต์ เรียบร้อย" },
      { kind: "file", who: "E02", at: "2026-08-22 18:35", tx: "เพิ่มไฟล์ แบบหน้าเว็บทั้งหมด (Figma)" },
    ],
  },
  {
    pj: "PJ-2569-0003",
    bill: "INV-2569-0018",
    deal: "DL-2569-0017",
    service: "website",
    name: "เว็บไซต์และระบบจองโต๊ะ ครัวคุณจิ",
    cus: "ครัวคุณจิ",
    quo: "MAZ-2569-0036",
    net: 26000,
    scope: "ทำเว็บไซต์ร้านอาหารพร้อมระบบจองโต๊ะ",
    pm: "ชนิกานต์ วัฒนกุล",
    start: "2026-08-19",
    due: "2026-09-30",
    status: "cancelled",
    updated: "2026-09-06",
    cancelled: { at: "2026-09-06", by: "ฝ่ายบัญชี", why: "ลูกค้ายุติโครงการหลังชำระงวดแรก" },
    tone: "b",
    phases: [
      { name: "ออกแบบหน้าเว็บ", role: "design", start: "2026-08-19", end: "2026-08-29" },
      { name: "พัฒนาเว็บไซต์", role: "frontend", start: "2026-08-30", end: "2026-09-12" },
      { name: "ระบบจองโต๊ะ", role: "backend", start: "2026-09-13", end: "2026-09-22" },
      { name: "ทดสอบและส่งมอบ", role: "ba", start: "2026-09-23", end: "2026-09-30" },
    ],
    tasks: [
      { name: "ออกแบบหน้าเว็บร้านอาหาร", phase: 0, whos: ["E05"], start: "2026-08-19", due: "2026-08-29", status: "done", pct: 100, files: [], brief: "ทำตามแบบที่ตกลงกับลูกค้า ถ้ามีจุดไหนไม่ชัดให้ถามก่อนเริ่ม", doneAt: "2026-08-29 10:15", subs: [{"at":"2026-08-22 11:15","by":"E05","files":["design-restaurant-v1.fig"],"note":"ส่งแบบหน้าแรกก่อน"},{"at":"2026-08-24 15:40","by":"E05","files":["design-restaurant-v2.fig"],"note":"เพิ่มหน้าเมนูตามที่ PM บอก"},{"at":"2026-08-26 10:05","by":"E05","files":["design-restaurant-v3.fig","mobile-preview.pdf"],"note":"ปรับสีตามโลโก้ร้าน และแนบภาพตัวอย่างบนมือถือ"},{"at":"2026-08-28 16:30","by":"E05","files":["design-restaurant-v4.fig"],"note":"แบบหน้าเว็บครบทุกหน้าตามที่คุยกับลูกค้า"}] },
      { name: "พัฒนาเว็บไซต์และเมนูอาหาร", phase: 1, whos: ["E05"], start: "2026-08-30", due: "2026-09-12", status: "doing", pct: 50, files: [], brief: "ทำตามแบบที่ตกลงกับลูกค้า ถ้ามีจุดไหนไม่ชัดให้ถามก่อนเริ่ม" },
      { name: "ระบบจองโต๊ะออนไลน์", phase: 2, whos: ["E06"], start: "2026-09-13", due: "2026-09-22", status: "todo", pct: 0, files: [] },
      { name: "ทดสอบและส่งมอบ", phase: 3, whos: ["E07"], start: "2026-09-23", due: "2026-09-30", status: "todo", pct: 0, files: [] },
      { name: "ทำหน้าติดต่อเราและแผนที่ร้าน", phase: 3, whos: ["E05"], start: "2026-09-07", due: "2026-09-18", status: "todo", pct: 0, files: [{"n":"ข้อมูลร้าน-ครัวคุณจิ.pdf","k":"pdf","sz":"420 KB","at":"2026-09-07","by":"E10"}], brief: "หน้าเดียวมีเบอร์โทร เวลาเปิดปิด ปุ่มโทรออก และแผนที่ร้าน ใช้พิกัดจากไฟล์ที่แนบ รองรับมือถือเป็นหลัก" },
      { name: "ทำหน้าเกี่ยวกับเรา", phase: 3, whos: ["E05"], start: "2026-09-01", due: "2026-09-08", status: "sent", pct: 0, files: [], brief: "เล่าประวัติร้านสั้นๆ พร้อมภาพเชฟและภาพบรรยากาศร้าน ใช้ภาพจากโฟลเดอร์ที่ลูกค้าส่งมา", subs: [{"at":"2026-09-06 16:45","by":"E05","files":["about-v1.zip"],"note":"ทำเสร็จแล้ว ใส่ภาพครบ 6 ภาพ"}] },
    ],
    chat: [{"who":"E05","at":"2026-08-29 17:10","tx":"แบบหน้าเว็บเสร็จแล้ว ลูกค้าชอบโทนสีที่ 2"},{"who":"PM","at":"2026-09-01 09:20","tx":"เริ่มพัฒนาได้เลย ขอเน้นหน้าเมนูให้โหลดไว ลูกค้าใช้มือถือเป็นหลัก"},{"who":"E03","at":"2026-09-06 15:45","tx":"หน้าเมนูเสร็จแล้ว กำลังทำระบบกรองประเภทอาหาร"}],
    acts: [
      { kind: "chat", who: "E03", at: "2026-09-06 15:45", tx: "ส่งข้อความในแชทโปรเจค" },
      { kind: "status", who: "E05", at: "2026-09-03 09:10", tx: "อัปเดตความคืบหน้า พัฒนาเว็บไซต์และเมนูอาหาร" },
      { kind: "done", who: "E05", at: "2026-08-29 17:05", tx: "ส่งงาน ออกแบบหน้าเว็บร้านอาหาร เรียบร้อย" },
    ],
  },
  {
    pj: "PJ-2569-0001",
    bill: "INV-2569-0032",
    deal: "DL-2569-0015",
    service: "branding",
    name: "รีแบรนด์ อัลฟ่าคอร์ป",
    cus: "อัลฟ่าคอร์ป",
    quo: "MAZ-2569-0028",
    net: 145000,
    scope: "ระบบจัดการเอกสารภายในองค์กร",
    pm: "ชนิกานต์ วัฒนกุล",
    start: "2026-06-01",
    due: "2026-08-15",
    status: "done",
    updated: "2026-08-15",
    tone: "c",
    phases: [
      { name: "วิเคราะห์ระบบ", role: "ba", start: "2026-06-01", end: "2026-06-15" },
      { name: "ออกแบบและพัฒนา", role: "backend", start: "2026-06-16", end: "2026-07-31" },
      { name: "ทดสอบและส่งมอบ", role: "ba", start: "2026-08-01", end: "2026-08-15" },
    ],
    tasks: [
      { name: "วิเคราะห์ขั้นตอนเอกสารเดิม", phase: 0, whos: ["E01"], start: "2026-06-01", due: "2026-06-15", status: "done", pct: 100, files: [] },
      { name: "พัฒนาระบบจัดเก็บเอกสาร", phase: 1, whos: ["E04"], start: "2026-06-16", due: "2026-07-20", status: "done", pct: 0, files: [] },
      { name: "ทำระบบค้นหาเอกสาร", phase: 1, whos: ["E06"], start: "2026-07-21", due: "2026-07-31", status: "done", pct: 0, files: [] },
      { name: "ทดสอบและอบรมผู้ใช้", phase: 2, whos: ["E07"], start: "2026-08-01", due: "2026-08-15", status: "done", pct: 0, files: [] },
      { name: "ทำหน้าผลงานของบริษัท", phase: 2, whos: ["E05"], start: "2026-08-25", due: "2026-09-03", status: "revise", pct: 0, files: [], brief: "แสดงผลงาน 12 ชิ้น แบ่งตามประเภทงาน กดแต่ละชิ้นแล้วเปิดรายละเอียดพร้อมภาพ", subs: [{"at":"2026-09-01 15:30","by":"E05","files":["portfolio-v1.zip"],"note":"ส่งรอบแรก"},{"at":"2026-09-04 11:05","by":"E05","files":["portfolio-v2.zip"],"note":"แก้ตัวกรองประเภทงานตามที่ PM บอกแล้ว"}], back: {"why":"ภาพผลงานโหลดช้ามากบนมือถือ ช่วยย่อขนาดภาพก่อนแล้วส่งใหม่","at":"2026-09-05","by":"E10"} },
      { name: "ติดตั้ง SSL และตั้งค่าโดเมน", phase: 2, whos: ["E05"], start: "2026-08-15", due: "2026-08-20", status: "done", pct: 100, files: [], brief: "ติดตั้งใบรับรอง SSL ตั้งค่า www ให้ชี้ไปโดเมนหลัก และตรวจว่าทุกหน้าเปิดผ่าน https", doneAt: "2026-08-21 09:30", subs: [{"at":"2026-08-20 14:00","by":"E05","files":["ผลตรวจ-ssl.pdf"],"note":"ตั้งค่าเสร็จ ทุกหน้าเปิด https ได้"}] },
    ],
    chat: [{"who":"PM","at":"2026-08-15 16:00","tx":"ส่งมอบครบแล้ว ลูกค้าเซ็นรับงานเรียบร้อย ปิดโปรเจคได้"},{"who":"E07","at":"2026-08-15 16:30","tx":"อบรมครบ 2 รอบ ผู้ใช้เข้าใจดี ไม่มีปัญหาค้าง"}],
    acts: [
      { kind: "done", who: "E07", at: "2026-08-15 16:30", tx: "ส่งงาน ทดสอบและอบรมผู้ใช้ เรียบร้อย" },
      { kind: "chat", who: "PM", at: "2026-08-15 16:00", tx: "ปิดโปรเจคและแจ้งทีม" },
    ],
  },
];

// ═══ ตัวช่วยที่หลายหน้าใช้ร่วมกัน ═══════════════════════════════
/**
 * ตรงกับโปรเจค/งานใบนี้ไหม — รับทั้งเลขที่โปรเจค (PJ-) และเลขที่ดีลเดิม
 * ลิงก์ ?deal= เก่า ข้อมูลในเครื่องรุ่นก่อน (นัดหมาย ลิงก์ตรวจงาน โฆษณา) ยังอ้างเลขดีลอยู่ จึงต้องหาเจอทั้งสองแบบ
 * (ผู้ใช้สั่ง 5 ต.ค. 2569)
 */
export function isRef(x: { pj: string; deal?: string }, ref: string | null | undefined) {
  return Boolean(ref) && (x.pj === ref || (Boolean(x.deal) && x.deal === ref));
}

/**
 * เลขที่โปรเจคของเลขดีลเดิมตามชุดตั้งต้น — ใช้ตอนย้ายข้อมูลในเครื่องรุ่นก่อน 5 ต.ค. 2569
 * (นัดหมาย ลิงก์ตรวจงาน โฆษณา) ที่ยังเก็บเลขดีลไว้ · ไม่รู้จักก็คืนเลขเดิม isRef ยังหาโปรเจคเจอจากเลขดีล
 */
export function legacyPj(ref: string | undefined) {
  if (!ref || ref.startsWith(`${settings().docs.project}-`)) return ref ?? "";
  return [...PM_PROJECTS, ...PM_INBOX].find((x) => x.deal === ref)?.pj ?? ref;
}

/** ลิงก์หน้ารายละเอียดโปรเจค */
export function projectHref(pj: string) {
  return `/pm/projects?pj=${encodeURIComponent(pj)}`;
}

/** ลิงก์หน้าวางแผนงาน */
export function planHref(pj: string) {
  return `/pm/plan?pj=${encodeURIComponent(pj)}`;
}

/* หมายเหตุ: การค้นทีมจากรหัสอยู่ที่ pm-store.ts เพราะทีมแก้ไขได้แล้ว
   ถ้าค้นจาก PM_TEAM ตรงนี้ ชื่อที่ PM เพิ่งแก้จะไม่เปลี่ยนตาม */

/** ชื่อโปรเจค — PM ตั้งเอง ถ้ายังไม่ตั้งใช้ชื่อลูกค้าไปก่อน (ผู้ใช้สั่ง 5 ต.ค. 2569 — เดิม "ลูกค้า – ขอบเขตงาน") */
export function projName(p: { name?: string; cus: string; scope?: string }) {
  /* ยังไม่ได้ตั้งชื่อ — ขึ้นแค่ชื่อลูกค้า PM ค่อยแก้ชื่อหลังเปิดโฟลเดอร์ (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  return p.name?.trim() || p.cus;
}

/** ชนิดไฟล์จากนามสกุล — ใช้กับไฟล์ที่แนบในแชทแล้วเก็บเข้าไฟล์ของโปรเจค */
export function fileKind(n: string): TaskFile["k"] {
  const x = n.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(x)) return "image";
  if (/^https?:\/\//.test(x)) return "link";
  return "pdf";
}

/*
 * ป้ายชนิดไฟล์ — เคยเขียนทับว่า "ไฟล์ PDF" ทุกใบ ไฟล์รูปกับลิงก์เลยถูกเรียกผิด
 * ไฟล์ทั่วไปบอกนามสกุลจริง จะได้รู้ว่าต้องเปิดด้วยอะไรก่อนกดโหลด
 */
export function fileKindLabel(name: string, k: TaskFile["k"] = fileKind(name)) {
  if (k === "link") return "ลิงก์";
  if (k === "image") return "รูปภาพ";
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toUpperCase() : "";
  return ext ? `ไฟล์ ${ext}` : "ไฟล์";
}

/** งานเดี่ยว — ไม่มีข้อเสนอจึงไม่มีเฟสและไม่ต้องวางแผน รับแล้วทำจบในตัว */
export function isSolo(job: InboxJob) {
  return !job.proposal;
}

/** ความคืบหน้าของโปรเจค นับจากงานที่เสร็จแล้วเทียบงานทั้งหมด */
export function projectProgress(p: Project) {
  const done = p.tasks.filter((t) => t.status === "done").length;
  const all = p.tasks.length;
  return { done, all, pct: all ? Math.round((done * 100) / all) : 0 };
}

/** รหัสพนักงานทุกคนที่มีงานในโปรเจคนี้ */
export function projectMembers(p: Project) {
  const seen = new Set<string>();
  for (const t of p.tasks) for (const id of t.whos) seen.add(id);
  return [...seen];
}
