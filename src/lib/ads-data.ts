/*
 * แผนสื่อ การสั่งรับโฆษณา และผลที่ได้ — เฉพาะงาน Digital Marketing
 *
 * แยกไฟล์จาก pm-data เพราะเป็นข้อมูลของสายการตลาดล้วน ๆ
 * งานประเภทอื่นไม่มีข้อมูลชุดนี้เลย ไม่ใช่ว่ามีแล้วปล่อยว่าง
 *
 * ตัวเลขที่คำนวณได้จะไม่เก็บลงข้อมูล (ดู engageRate / costPerEngage ท้ายไฟล์)
 * เพราะตัวเลขสรุปที่เก็บซ้ำคือจุดที่ข้อมูลเริ่มไม่ตรงกันเป็นที่แรก
 */

/** ช่องทางที่บริษัทซื้อโฆษณาได้ — ใช้เป็นตัวเลือกตอนสั่งรับโฆษณา */
/* แพลตฟอร์มโฆษณา — ผู้ดูแลระบบแก้ได้ที่ /admin/options (optionsOf("adPlatform")) */

/** กลุ่มเป้าหมายที่ตกลงกับลูกค้าไว้ในแผน */
export type AdTarget = {
  who: string;
  area: string;
  age: string;
  interest: string;
  size: string;
};

/** หนึ่งบรรทัดในแผนสื่อ — ช่องทางหนึ่งกับงบที่กันไว้ */
export type AdPlanRow = {
  channel: string;
  objective: string;
  tool: string;
  budget: number;
  /** ผลที่คาดไว้ตอนวางแผน เอาไว้เทียบกับผลจริงตอนรายงาน */
  est: string;
  remark: string;
};

export type AdPlan = { target: AdTarget; rows: AdPlanRow[] };

/** ใบสั่งรับโฆษณาหนึ่งรอบเดือน หนึ่งช่องทาง */
export type AdRun = {
  /** เลขที่โปรเจค (PJ-) — เดิมเลขที่ดีล (เปลี่ยน 5 ต.ค. 2569) */
  pj: string;
  /** รอบเดือนในรูป YYYY-MM */
  round: string;
  /** รหัสพนักงานผู้ดูแลสื่อ และผู้ดูแลลูกค้า */
  media: string;
  ae: string;
  orderedAt: string;
  channel: string;
  tool: string;
  start: string;
  end: string;
  budget: number;
  /** รันจริงแล้วหรือยัง — ยังไม่รันคือถึงรอบแล้วแต่ยังไม่ได้เริ่ม */
  ran: boolean;
  note: string;
  /** ผู้สั่งรัน (ชื่อ) — บันทึกตอนสั่ง ตรวจย้อนได้ */
  orderedBy?: string;
  /** ผู้กดยืนยันว่ารันแล้วและเวลา "yyyy-mm-dd hh:mm" (PM-BR-10) */
  ranBy?: string;
  ranAt?: string;
};

/** ผลที่แพลตฟอร์มรายงานกลับมา — กรอกด้วยมือทั้งหมด ยังไม่ได้ต่อ API */
export type AdMetric = {
  impression: number;
  reach: number;
  engagement: number;
  reactions: number;
  comments: number;
  saves: number;
  shares: number;
  clicks: number;
  spent: number;
};

/** ชิ้นงานโฆษณาหนึ่งชิ้น — m เป็น null คือยังไม่ได้กรอกผล */
export type AdContent = {
  /** เลขที่โปรเจค (PJ-) — เดิมเลขที่ดีล (เปลี่ยน 5 ต.ค. 2569) */
  pj: string;
  round: string;
  name: string;
  type: "Single" | "Album" | "VDO";
  m: AdMetric | null;
  /** ผู้กรอกผลล่าสุดและเวลา — ตัวเลขคีย์มือต้องตรวจย้อนได้ (PM-BR-10) */
  by?: string;
  at?: string;
};

export const AD_PLANS: Record<string, AdPlan> = {
  /* ต้นแบบ pm-ads.html AD_PLAN */
  "PJ-2569-0008": {
    target: {"who": "เจ้าของบ้าน", "area": "กรุงเทพมหานคร", "age": "30 – 60 ปี", "interest": "ต่อเติมบ้าน|ออกแบบภายใน|เฟอร์นิเจอร์|ปรับปรุงบ้าน|ซ่อมแซมบ้าน|สถาปัตยกรรมสมัยใหม่", "size": "7,500,000 – 8,900,000 คน"},
    rows: [
      {"channel": "Google", "objective": "Search", "tool": "Keyword", "budget": 4000, "est": "คลิก 400", "remark": ""},
      {"channel": "Google", "objective": "Performance Max", "tool": "Display", "budget": 2000, "est": "คลิก 400", "remark": ""},
      {"channel": "Facebook", "objective": "Reach", "tool": "Single 1-3 + VDO", "budget": 3000, "est": "เข้าถึง 100,000", "remark": ""},
      {"channel": "Facebook", "objective": "Engagement", "tool": "Single 1-3", "budget": 3000, "est": "มีส่วนร่วม 600", "remark": ""},
      {"channel": "Facebook", "objective": "Inbox", "tool": "Single 1-3 + VDO", "budget": 11000, "est": "ทัก 25", "remark": "งบสูงสุดของแผน"},
    ],
  },
  "PJ-2569-0004": {
    target: {"who": "ผู้หญิงที่ดูแลผิวหน้า", "area": "ทั่วประเทศ เน้นกรุงเทพฯ และปริมณฑล", "age": "22 – 45 ปี", "interest": "สกินแคร์|ความงาม|รีวิวเครื่องสำอาง|ดูแลผิวหน้า", "size": "4,200,000 – 5,100,000 คน"},
    rows: [
      {"channel": "Facebook", "objective": "Engagement", "tool": "Single 1-5", "budget": 7500, "est": "มีส่วนร่วม 5,000", "remark": "แบ่งชิ้นละ 1,500"},
      {"channel": "Facebook", "objective": "Reach", "tool": "Album", "budget": 3000, "est": "เข้าถึง 60,000", "remark": ""},
      {"channel": "Instagram", "objective": "Engagement", "tool": "Single 1-5", "budget": 2500, "est": "มีส่วนร่วม 1,800", "remark": ""},
    ],
  },
};

export const AD_RUNS: AdRun[] = [
  /* ต้นแบบ AD_RUNS (8 รอบ) */
  {"pj": "PJ-2569-0008", "round": "2026-10", "media": "E09", "ae": "E10", "orderedAt": "2026-10-09", "channel": "Google", "tool": "Google Search", "start": "2026-10-12", "end": "2026-10-31", "budget": 4000, "ran": true, "note": ""},
  {"pj": "PJ-2569-0008", "round": "2026-10", "media": "E09", "ae": "E10", "orderedAt": "2026-10-09", "channel": "Google", "tool": "GDN", "start": "2026-10-12", "end": "2026-10-31", "budget": 2000, "ran": true, "note": ""},
  {"pj": "PJ-2569-0008", "round": "2026-10", "media": "E09", "ae": "E10", "orderedAt": "2026-10-09", "channel": "Facebook", "tool": "Single Ads 1-3", "start": "2026-10-12", "end": "2026-10-31", "budget": 6000, "ran": true, "note": ""},
  {"pj": "PJ-2569-0008", "round": "2026-11", "media": "E09", "ae": "E10", "orderedAt": "2026-10-30", "channel": "Facebook", "tool": "Single Ads 4-6", "start": "2026-11-02", "end": "2026-11-30", "budget": 6000, "ran": false, "note": "รอลูกค้ายืนยันชิ้นงานรอบสอง"},
  {"pj": "PJ-2569-0008", "round": "2026-11", "media": "E09", "ae": "E10", "orderedAt": "2026-10-30", "channel": "TikTok", "tool": "VDO 1-2", "start": "2026-11-02", "end": "2026-11-30", "budget": 5000, "ran": false, "note": ""},
  {"pj": "PJ-2569-0004", "round": "2026-10", "media": "E09", "ae": "E10", "orderedAt": "2026-10-05", "channel": "Facebook", "tool": "Single Ads 1-5", "start": "2026-10-06", "end": "2026-10-31", "budget": 7500, "ran": true, "note": ""},
  {"pj": "PJ-2569-0004", "round": "2026-10", "media": "E09", "ae": "E10", "orderedAt": "2026-10-05", "channel": "Facebook", "tool": "Photo Album 1-2", "start": "2026-10-06", "end": "2026-10-31", "budget": 3000, "ran": true, "note": ""},
  {"pj": "PJ-2569-0004", "round": "2026-11", "media": "E09", "ae": "E10", "orderedAt": "2026-11-02", "channel": "Instagram", "tool": "Single Ads 1-5", "start": "2026-11-03", "end": "2026-11-27", "budget": 2500, "ran": false, "note": ""},
];

export const AD_CONTENTS: AdContent[] = [
  /* ต้นแบบ AD_CONTENT (8 ชิ้น) */
  {"pj": "PJ-2569-0004", "round": "2026-10", "name": "จะแก้ผิวหน้าโทรม หรือดูแลผิวใหม่ให้กระจ่างใส", "type": "Album", "m": {"impression": 30535, "reach": 19064, "engagement": 1873, "reactions": 1761, "comments": 6, "saves": 1, "shares": 1, "clicks": 1647, "spent": 1500}},
  {"pj": "PJ-2569-0004", "round": "2026-10", "name": "ไม่ว่าจะสายผิวดี สายผิวสู้ หรือสายผิวด่วน", "type": "Single", "m": {"impression": 33387, "reach": 20484, "engagement": 1513, "reactions": 302, "comments": 2, "saves": 2, "shares": 10, "clicks": 1734, "spent": 1500}},
  {"pj": "PJ-2569-0004", "round": "2026-10", "name": "แชร์ความผิวดี มีผิวใหม่ด้วยรีวิวแบบแน่น ๆ", "type": "Single", "m": {"impression": 17525, "reach": 10468, "engagement": 1453, "reactions": 1394, "comments": 0, "saves": 4, "shares": 0, "clicks": 651, "spent": 1500}},
  {"pj": "PJ-2569-0004", "round": "2026-10", "name": "CELLA สกินแคร์โอบรับผิวคุณในไทย", "type": "Single", "m": {"impression": 21085, "reach": 11204, "engagement": 1173, "reactions": 1077, "comments": 1, "saves": 0, "shares": 1, "clicks": 1437, "spent": 1500}},
  {"pj": "PJ-2569-0004", "round": "2026-10", "name": "รีเซ็ตผิวใหม่ สร้างผิวกระจ่างใสแบบ X5", "type": "Album", "m": {"impression": 16465, "reach": 10654, "engagement": 1091, "reactions": 1027, "comments": 0, "saves": 1, "shares": 0, "clicks": 1016, "spent": 1500}},
  {"pj": "PJ-2569-0008", "round": "2026-10", "name": "บ้านเดิมอยู่มานาน ต่อเติมให้ตอบโจทย์กว่าเดิม", "type": "Single", "m": {"impression": 24310, "reach": 15982, "engagement": 942, "reactions": 868, "comments": 4, "saves": 2, "shares": 3, "clicks": 1120, "spent": 2000}},
  {"pj": "PJ-2569-0008", "round": "2026-10", "name": "ครัวใหม่ในงบที่คุมได้ เริ่มต้นวางแผนกับเรา", "type": "Album", "m": {"impression": 18774, "reach": 12406, "engagement": 761, "reactions": 702, "comments": 2, "saves": 5, "shares": 1, "clicks": 864, "spent": 2000}},
  {"pj": "PJ-2569-0008", "round": "2026-10", "name": "ห้องนั่งเล่นที่ใช้งานได้จริง ไม่ใช่แค่สวย", "type": "Single", "m": null},
];

// ═══ ตัวเลขที่คำนวณจากผล ไม่เก็บลงข้อมูล ═════════════════════════

/** อัตราการมีส่วนร่วม — เทียบกับจำนวนครั้งที่โฆษณาถูกมองเห็น */
export function engageRate(m: AdMetric) {
  return m.impression ? (m.engagement * 100) / m.impression : 0;
}

/** ต้นทุนต่อการมีส่วนร่วมหนึ่งครั้ง — ใช้เทียบว่าชิ้นไหนคุ้มกว่า */
export function costPerEngage(m: AdMetric) {
  return m.engagement ? m.spent / m.engagement : 0;
}
