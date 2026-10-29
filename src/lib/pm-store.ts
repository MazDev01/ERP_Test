"use client";

/*
 * งาน PM ทั้งสายอยู่ในสโตร์เดียว เพราะแต่ละขั้นส่งงานต่อกัน:
 * งานเข้าใหม่ → ส่งไปวางแผน → ยืนยันแผน → กลายเป็นโปรเจค
 * ถ้าแยกสโตร์จะเกิดสถานะที่ขัดกันเอง เช่น งานยังอยู่ในกล่องเข้าทั้งที่เปิดโปรเจคแล้ว
 */

import { useSyncExternalStore } from "react";
import { bkkStamp, nextDocNo, todayIso } from "./format";
import { settings } from "./system-settings";
import { currentRole, type Role } from "./role";
import {
  PM_INBOX,
  PM_PROJECTS,
  PM_TEAM,
  IN_HOUSE_CUS,
  fileKind,
  isInHouse,
  isRef,
  type WaitKind,
  type Activity,
  type ChatMessage,
  type FileNote,
  type InboxJob,
  type Member,
  type Project,
  type ProjectDoc,
  type ProjectPhase,
  type TaskFile,
  type TeamRole,
  type ProjectTask,
  type Submission,
  type TaskStatus,
} from "./pm-data";
import { createPersistedStore } from "./persisted-store";
import { LOCK_SEND_WHILE_WAITING, blockers } from "./task-deps";
import { hrSnapshot, subscribeHr } from "./hr-store";
import { HR_EMP, type Employee } from "./hr-data";
import { displayName, nameOf } from "./emp-name";
import { TEAM_ROLES_BY_POSITION } from "./pm-data";
import { USERS } from "./mock-data";
import {
  ASK_SEED,
  LOOSE_SEED,
  isLoose,
  looseHomes,
  looseOwner,
  type AskFrom,
  type TaskAsk,
} from "./task-ask";

/* ─── ร่างแผนงานที่ยังไม่ยืนยัน ─────────────────────────────────────
 * เฟสและงานย่อยระหว่างวางแผน เก็บรูปเดียวกับกระดานในหน้าจัดคิวงาน
 * อยู่ในสโตร์ ไม่ใช่ state ของหน้า — ปิดหน้าหรือรีโหลดแล้วสิ่งที่กรอกไว้ต้องยังอยู่
 */
export type DraftPhase = {
  name: string;
  role?: TeamRole;
  start: string;
  end: string;
  /** PM สร้างเฟสนี้เอง ไม่ได้มาจากข้อเสนอ */
  own?: boolean;
  baseName?: string;
  baseStart?: string;
  baseEnd?: string;
  /** กลุ่มเฟสที่ทำคู่กัน (ข้อเสนอ par A/B) — เฟสกลุ่มเดียวกันไม่รอกันตอนเติมงานต่อกัน */
  par?: string;
};

export type DraftTask = {
  /** ดัชนีงานเดิมในโปรเจค — มีเฉพาะตอนแก้แผนของโปรเจคที่เดินงานอยู่ */
  from?: number;
  name: string;
  role?: TeamRole;
  whos: string[];
  start: string;
  due: string;
  /** โจทย์ที่ PM เขียนให้คนทำ */
  brief?: string;
  /** ไฟล์ประกอบโจทย์ที่ PM แนบมา */
  files?: TaskFile[];
  /** งานต่อกันที่ PM กำหนดเอง (ข้อยกเว้น) — ไม่มี = ตามเฟส (task-deps.ts autoAfter) · [] = เริ่มได้ทันที */
  after?: string[];
  /* ผู้ตรวจ = ผู้สั่งเสมอ ไม่มีช่องเลือกผู้ตรวจแล้ว (ผู้ใช้สั่ง 27 ต.ค. 2569) */
  /** ไม่ต้องตรวจ — ส่งแล้วปิดงานทันที */
  noReview?: boolean;
  /** ต้องให้ลูกค้าตรวจ — ห้ามคู่กับ noReview (ผู้ใช้สั่ง 21 ต.ค. 2569) */
  clientReview?: boolean;
  /*
   * ช่องที่ระบบเติมให้และ PM ยังไม่ได้แตะ — หน้าต่างงานขึ้นคำบอกสีเขียวว่ามาจากไหน
   * PM แก้ช่องไหน ธงของช่องนั้นหาย (ระบบร่าง PM แค่ยืนยัน — ผู้ใช้สั่ง 21 ต.ค. 2569)
   */
  autoFill?: { who?: boolean; dates?: boolean; brief?: boolean };
};

export type PlanDraft = {
  phases: DraftPhase[];
  plan: DraftTask[][];
  /** แก้ล่าสุดเมื่อไร "YYYY-MM-DD HH:mm" — หน้าจออื่นใช้บอกว่ามีร่างค้างอยู่ */
  at: string;
  by: string;
};

/*
 * ข้อความที่ผูกกับงานย่อยใบเดียว — คนละอันกับแชทโปรเจค
 *
 * แชทโปรเจคอยู่ในหน้าของ PM ซึ่งทีมงาน (บทบาท staff) เปิดไม่ได้ตามกติกาเมนูตามบทบาท
 * PM จึงพิมพ์ทวงงานไปโดยที่ไม่มีใครเห็น แล้วต้องไปตามกันในไลน์อีกที
 * สายนี้ผูกกับ "งานใบนั้น" ผู้รับงานจึงเห็นได้ในหน้างานที่ได้รับของตัวเอง โดยไม่ต้องเปิดหน้าของ PM
 * ทุกข้อความส่งเข้าแชทโปรเจคด้วย (postTaskTalk) PM จึงยังอ่านที่เดียวได้เหมือนเดิม
 */
export type TaskTalk = {
  /** "PM" หรือรหัสพนักงานของผู้รับงาน */
  who: string;
  /** "YYYY-MM-DD HH:mm" */
  at: string;
  tx: string;
  /** ข้อความนี้คือการทวงงาน — ผู้รับงานต้องเห็นเป็นเรื่องที่ต้องตอบ ไม่ใช่ข้อความทั่วไป */
  nudge?: boolean;
};

/** คีย์ของสายข้อความหนึ่งงาน — เลขที่โปรเจคกับชื่องาน (ชื่องานไม่ซ้ำกันในโปรเจคเดียว) · เดิมใช้เลขดีล (เปลี่ยน 5 ต.ค. 2569) */
export function talkKey(pj: string, taskName: string) {
  return `${pj}|${taskName}`;
}

export type PmState = {
  inbox: InboxJob[];
  projects: Project[];
  /** ข้อความของงานย่อยแต่ละใบ — คีย์จาก talkKey() */
  talks: Record<string, TaskTalk[]>;
  /*
   * ทีมที่รับงานได้ — ยังไม่มีหน้าจัดการทีมในระบบ (ไม่มีในเมนูตามต้นแบบ)
   * ตอนนี้แก้ได้ทางเดียวคือแก้ PM_TEAM ในชุดข้อมูลตั้งต้น
   */
  team: Member[];
  /*
   * ร่างแผนที่ยังไม่ยืนยัน แยกตามเลขที่โปรเจค (เดิมเลขที่ดีล — เปลี่ยน 5 ต.ค. 2569) — กติกาเดียวกับใบเสนอราคา
   * บันทึกตั้งแต่ตอนแก้ ไม่มีปุ่มบันทึก · "ยืนยันแผน" เป็นแค่การเปลี่ยนสถานะ
   *
   * TODO: ระบบจริงต้องเก็บร่างไว้ที่เซิร์ฟเวอร์ ไม่ใช่ในเบราว์เซอร์
   * ตอนนี้ยังไม่มี backend ร่างจึงลงมาที่ localStorage เหมือนสโตร์อื่นทั้งระบบ
   * ผลคือเปิดจากอีกเครื่องหรืออีกคนจะไม่เห็นร่างนี้ ซึ่งผิดกติกาของเจ้าของระบบ
   */
  drafts: Record<string, PlanDraft>;
  /** งานที่ทีมเสนอเอง (task-ask.ts) — ทุกใบเก็บไว้ ไม่ลบ */
  asks: TaskAsk[];
  /** งานนอกโปรเจคที่ PM อนุมัติแล้ว — ไม่อยู่ใน projects จึงไม่นับใน % ของโปรเจคใด */
  loose: ProjectTask[];
};

const INITIAL: PmState = {
  inbox: PM_INBOX,
  /* ชุดตั้งต้นยังไม่มีผู้สั่ง — เติมตอนสร้างค่าเริ่ม (ค่าเริ่มไม่ผ่าน migratePm) (ผู้ใช้สั่ง 21 ต.ค. 2569) */
  projects: PM_PROJECTS.map((p) => ({ ...p, tasks: p.tasks.map((t) => fillPeople(t, p.pm)) })),
  team: PM_TEAM,
  drafts: {},
  talks: {},
  asks: ASK_SEED,
  loose: LOOSE_SEED.map((t) => fillPeople(t, USERS.pm.name)),
};

function isPmState(value: unknown): value is PmState {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return Array.isArray(s.inbox) && Array.isArray(s.projects) && Array.isArray(s.team);
}

/*
 * เติมของที่เพิ่มเข้าชุดตั้งต้นทีหลังให้ข้อมูลเก่าที่ค้างอยู่ในเครื่องผู้ใช้
 *
 * ไม่เปลี่ยนคีย์ เพราะจะทิ้งงานที่ทีมส่งและผลตรวจที่ PM กดไปแล้วทั้งหมด
 * กติกาคือ "เติมของที่หาย ไม่ทับของที่มี" — สถานะงานที่ผู้ใช้ทำไว้เองต้องอยู่เหมือนเดิม
 */
/*
 * ข้อมูลรุ่นก่อน 5 ต.ค. 2569 ระบุโปรเจคด้วยเลขที่ดีล ยังไม่มีเลขที่โปรเจค (ผู้ใช้สั่ง 5 ต.ค. 2569)
 * รายการที่ตรงกับชุดตั้งต้น (เทียบเลขดีล) ได้เลข PJ กับใบแจ้งหนี้งวดแรกตามชุดตั้งต้น
 * ที่เหลือออกเลข PJ ใหม่ต่อจากเลขสูงสุดที่มี · ใบแจ้งหนี้งวดแรกปล่อยว่างไว้ — หน้าจอหาเองจากเลขดีลผ่าน flow.ts
 * ร่างแผนกับสายข้อความที่เก็บคีย์ด้วยเลขดีล ย้ายไปคีย์ด้วยเลข PJ
 */
function assignPj(v: PmState): PmState {
  const legacy = (x: { pj?: string }) => !x.pj;
  if (!v.inbox.some(legacy) && !v.projects.some(legacy)) return v;
  const seed = new Map([...PM_PROJECTS, ...PM_INBOX].map((x) => [x.deal ?? "", x]));
  const used = [...v.inbox, ...v.projects, ...PM_PROJECTS, ...PM_INBOX].map((x) => x.pj).filter(Boolean);
  const byDeal = new Map<string, string>();
  const fix = <T extends InboxJob | Project>(x: T): T => {
    if (x.pj) return x;
    const dealNo = (x as { deal?: string }).deal ?? "";
    const known = byDeal.get(dealNo) ?? seed.get(dealNo)?.pj;
    const pj = known ?? nextDocNo(settings().docs.project, used);
    if (!known) used.push(pj);
    byDeal.set(dealNo, pj);
    return { ...x, pj, bill: x.bill ?? seed.get(dealNo)?.bill ?? "", deal: dealNo || undefined };
  };
  const inbox = v.inbox.map(fix);
  const projects = v.projects.map(fix);
  const rekey = <T,>(rec: Record<string, T> | undefined, key: (k: string) => string) =>
    Object.fromEntries(Object.entries(rec ?? {}).map(([k, x]) => [key(k), x]));
  const drafts = rekey(v.drafts, (k) => byDeal.get(k) ?? k);
  const talks = rekey(v.talks, (k) => {
    const i = k.indexOf("|");
    const pj = i > 0 ? byDeal.get(k.slice(0, i)) : undefined;
    return pj ? `${pj}${k.slice(i)}` : k;
  });
  return { ...v, inbox, projects, drafts, talks };
}

/** งานเข้าใหม่ตัวอย่างที่เพิ่มเข้าชุดตั้งต้น 8 ต.ค. 2569 — migratePm เติมให้เครื่องที่ยังไม่มี */
const INBOX_ADDED_OCT = new Set(["PJ-2569-0025", "PJ-2569-0026"]);

function migratePm(input: PmState): PmState {
  const v = assignPj(input);
  const seedOf = new Map(PM_PROJECTS.map((p) => [p.pj, p]));

  const projects = v.projects.map((p) => {
    const seed = seedOf.get(p.pj);
    if (!seed) return p;
    const has = new Set(p.tasks.map((t) => t.name));
    return {
      ...p,
      /* ชื่อลูกค้าแก้ในระบบไม่ได้ ถือว่าของชุดตั้งต้นถูกเสมอ */
      cus: seed.cus,
      /* กลุ่มเฟสทำคู่ (par) เพิ่ม 20 ต.ค. 2569 — เติมจากชุดตั้งต้นเมื่อชื่อเฟสตรงกัน */
      phases: p.phases.map((ph) => (ph.par ? ph : { ...ph, par: seed.phases.find((x) => x.name === ph.name)?.par })),
      /* ชื่อโปรเจคเพิ่มเข้าชุดตั้งต้น 21 ก.ย. — เติมเฉพาะที่ยังไม่ได้ตั้ง ชื่อที่ PM แก้เองห้ามทับ */
      name: p.name ?? seed.name,
      tasks: [
        ...p.tasks.map((t) => {
          const st = seed.tasks.find((x) => x.name === t.name);
          if (!st) return t;
          /* เติมเฉพาะช่องที่ยังว่าง สถานะและรอบที่ส่งไปแล้วห้ามแตะ */
          /* ไม่ต้องตรวจของชุดตั้งต้นเพิ่ม 21 ต.ค. 2569 — เติมเฉพาะที่ยังไม่มี · ผู้ตรวจไม่เติมแล้ว ผู้ตรวจ = ผู้สั่งเสมอ (ผู้ใช้สั่ง 27 ต.ค. 2569) */
          return {
            ...t,
            brief: t.brief ?? st.brief,
            doneAt: t.doneAt ?? st.doneAt,
            after: t.after ?? st.after,
            noReview: t.noReview ?? st.noReview,
            /* คอมเมนต์บนไฟล์ของตัวอย่างงานตีกลับ — เติมเฉพาะรอบตีกลับเดียวกับชุดตั้งต้นที่ยังไม่มี (ผู้ใช้สั่ง 29 ต.ค. 2569) */
            back:
              t.back && !t.back.notes && st.back?.notes && t.status === "revise" && t.back.at === st.back.at
                ? { ...t.back, notes: st.back.notes }
                : t.back,
          };
        }),
        ...seed.tasks.filter((t) => !has.has(t.name)),
      ],
    };
  });

  /* โปรเจคที่เพิ่งเพิ่มเข้าชุดตั้งต้น — ของเก่ายังไม่มี ต้องต่อท้ายให้ */
  const known = new Set(v.projects.map((p) => p.pj));
  const added = PM_PROJECTS.filter((p) => !known.has(p.pj));

  /* ตัวอย่างดีลที่ถูกยกเลิก (ครัวคุณจิ) เพิ่มเข้าชุดตั้งต้น 21 ก.ย. 2569 — เครื่องที่เก็บข้อมูลไว้ก่อนให้เห็นด้วย
     ใช้เฉพาะรายการตั้งต้นที่มีการยกเลิก และของในเครื่องยังเดินอยู่ ไม่ทับของที่ผู้ใช้ยกเลิกเอง */
  const cancelled = [...projects, ...added].map((p) => {
    const seed = seedOf.get(p.pj);
    return seed?.cancelled && p.status === "running" && !p.cancelled
      ? { ...p, status: "cancelled" as const, cancelled: seed.cancelled, updated: seed.updated }
      : p;
  });

  /* ร่างแผนเพิ่มเข้ามา 23 ก.ย. · สายข้อความของงานย่อยเพิ่ม 24 ก.ย. —
     ข้อมูลที่ยังไม่มีช่องพวกนี้ถือว่ายังว่าง เติมให้ ไม่เปลี่ยนคีย์ จะได้ไม่ทิ้งงานที่ทำไว้แล้ว */
  /* ชื่อคนรับงานเพิ่ม 5 ต.ค. 2569 — งานตั้งต้นที่รับไปแล้วเติมชื่อจากชุดตั้งต้น · GM มอบหมายแทนการกดรับ (ผู้ใช้สั่ง 27 ต.ค. 2569): งานที่มีชื่อแล้วเป็นของ PM คนนั้นต่อ
     งานอื่นที่รับไปก่อนมีช่องนี้ปล่อยว่าง ขึ้นเป็น "รอมอบหมาย" ให้ GM มอบหมายใหม่ */
  const inboxSeed = new Map(PM_INBOX.map((j) => [j.pj, j]));
  const inboxKept = v.inbox.map((j) => {
    const seed = inboxSeed.get(j.pj);
    const taken =
      j.stage === "plan" && !j.takenBy && seed?.takenBy
        ? { ...j, takenBy: seed.takenBy, takenAt: j.takenAt ?? seed.takenAt }
        : j;
    /* เฟสในข้อเสนอมาจากฝ่ายก่อนการขาย PM แก้ในร่างแผน ไม่ใช่ที่งาน — ยังไม่มีร่างก็ใช้เฟสล่าสุดของชุดตั้งต้น
       (เพิ่มเฟสเขียนเนื้อหาและ par ให้ตัวอย่างงานต่อกัน 20 ต.ค. 2569) */
    return seed && !v.drafts?.[j.pj] ? { ...taken, phases: seed.phases } : taken;
  });
  /* งานเข้าใหม่ตัวอย่างที่เพิ่มเข้าชุดตั้งต้นทีหลัง (8 ต.ค. 2569) — เติมเฉพาะเลขที่โปรเจคที่ยังไม่มีทั้งในกล่องและในโปรเจค
     งานที่ยืนยันแผนแล้วออกจากกล่องไปเป็นโปรเจคเลขเดิม จึงต้องเช็กสองที่ ไม่งั้นงานที่ทำไปแล้วจะเด้งกลับมา */
  const takenPj = new Set([...v.inbox, ...v.projects, ...added].map((x) => x.pj));
  /* เฉพาะใบที่เพิ่มรอบนี้ — ใบตั้งต้นรุ่นก่อนที่หายไปจากเครื่อง อาจหายเพราะดีลถูกยกเลิก ห้ามเด้งกลับ */
  const inbox = [...inboxKept, ...PM_INBOX.filter((j) => INBOX_ADDED_OCT.has(j.pj) && !takenPj.has(j.pj))];

  /* เอกสารแนบของโปรเจคเพิ่ม 5 ต.ค. 2569 — ข้อมูลเก่าที่ยังไม่มีช่องนี้ถือว่ายังไม่มีเอกสาร (ผู้ใช้สั่ง 5 ต.ค. 2569)
     ชื่อโปรเจคที่เก็บไว้แล้วไม่แตะ แม้จะเป็นรูปแบบเดิม "ลูกค้า – ขอบเขตงาน" */
  /* ผู้สั่งเพิ่ม 21 ต.ค. 2569 — งานเก่าเติมจาก PM ของโปรเจค ไม่ทับค่าที่ตั้งไว้ ไม่แตะสถานะ/รอบส่ง
     ผู้ตรวจที่เคยเลือกไว้ลบทิ้ง ผู้ตรวจ = ผู้สั่งเสมอ (ผู้ใช้สั่ง 27 ต.ค. 2569) */
  const asked = seedAsks(v);
  return {
    ...v,
    inbox: inbox.map((j) => (j.docs ? j : { ...j, docs: [] })),
    /* added (โปรเจคตั้งต้นที่ยังไม่มีในเครื่อง) ต่อท้ายอยู่ใน cancelled แล้ว */
    projects: cancelled.map((p) => ({
      ...(p.docs ? p : { ...p, docs: [] }),
      tasks: p.tasks.map((t) => fillPeople(t, p.pm)),
    })),
    drafts: v.drafts ?? {},
    talks: v.talks ?? {},
    asks: asked.asks,
    loose: asked.loose.map((t) => fillPeople(t, USERS.pm.name)),
  };
}

/*
 * งานที่ทีมเสนอเองเพิ่ม 20 ต.ค. 2569 — เติมตัวอย่างที่ยังไม่มีตามรหัสใบเสนอ
 * ใบเสนอไม่เคยถูกลบ (อนุมัติ/ไม่อนุมัติ/ปิดแล้วก็ยังอยู่) ใบที่ผู้ใช้ทำไปแล้วจึงไม่เด้งกลับ
 * งานนอกโปรเจคตัวอย่างเติมเมื่อยังไม่มีงานที่มาจากใบเสนอเดียวกัน
 */
function seedAsks(v: PmState): Pick<PmState, "asks" | "loose"> {
  const asks = v.asks ?? [];
  const loose = v.loose ?? [];
  const haveAsk = new Set(asks.map((a) => a.id));
  const haveLoose = new Set(loose.map((t) => t.origin?.ask).filter(Boolean));
  return {
    asks: [...asks, ...ASK_SEED.filter((a) => !haveAsk.has(a.id))],
    loose: [...loose, ...LOOSE_SEED.filter((t) => !haveLoose.has(t.origin?.ask) && !haveAsk.has(t.origin?.ask ?? ""))],
  };
}

/* ขึ้นเป็น v4 เพราะรูปข้อมูลเปลี่ยน — งานย่อยมีผู้มอบหมาย/เวลา และสโตร์มีร่างแผน */
const store = createPersistedStore<PmState>("maz-erp.pm.v4", INITIAL, isPmState, migratePm);

/**
 * ยกเลิกงานของดีลที่ถูกยกเลิก — โปรเจคเปลี่ยนเป็น "ยกเลิก" งานหยุด
 * เรียกผ่าน cancelDealFlow เท่านั้น
 *
 * งานที่ GM มอบหมาย PM แล้วและกำลังวางแผนอยู่ (stage "plan") ต้องไม่หายเงียบ ๆ
 * (เจ้าของสั่ง 24 ก.ย. 2569 — เดิมโยนทิ้งจาก inbox ทั้งใบ แผนที่ PM ลงแรงทำไว้
 * จึงหายไปโดยไม่มีใครรู้ และคนที่ถูกมอบหมายก็ไม่รู้ว่างานตายแล้ว)
 * ใบแบบนี้จึงกลายเป็นโปรเจคสถานะ "ยกเลิก" ที่เก็บแผนร่างไว้ครบ เปิดดูย้อนหลังได้
 * ร่างยังอยู่ใน drafts ด้วย เผื่อดีลกลับมาใหม่จะได้ไม่ต้องวางแผนใหม่ทั้งชุด
 *
 * งานที่ยังไม่ได้มอบหมาย PM (stage "new") เอาออกจากกล่องงานเข้าใหม่ตามเดิม — ยังไม่มีใครลงแรงกับมัน
 */
export function cancelDealWork(deal: string, c: { at: string; by: string; why: string }) {
  store.update((s) => {
    const job = s.inbox.find((j) => j.deal === deal && j.stage === "plan");
    /* ร่างแผนคีย์ด้วยเลขที่โปรเจค — ดีลเป็นแค่ตัวบอกว่าโปรเจคไหนต้องหยุด */
    const draft = job ? s.drafts[job.pj] : undefined;
    const known = s.projects.some((p) => p.deal === deal);
    const day = c.at.slice(0, 10);
    /* แผนร่าง → งานของโปรเจคที่ถูกยกเลิก (สถานะ "ยังไม่เริ่ม" เพราะยังไม่เคยมอบหมายจริง) */
    const tasks: ProjectTask[] =
      draft?.plan.flatMap((col, phase) =>
        col.map<ProjectTask>((t) =>
          withStatus(
            {
              name: t.name,
              phase,
              whos: [...t.whos],
              start: t.start,
              due: t.due,
              status: "todo" as const,
              pct: 0,
              files: (t.files ?? []).map((f) => ({ ...f })),
              brief: t.brief?.trim() || undefined,
              assignedBy: USERS.pm.employeeId,
              noReview: t.noReview || undefined,
              clientReview: (!t.noReview && t.clientReview) || undefined,
            },
            "todo",
            USERS.pm.employeeId,
            c.at,
            true,
          ),
        ),
      ) ?? [];
    const kept: Project[] =
      job && !known
        ? [
            {
              pj: job.pj,
              bill: job.bill,
              deal: job.deal,
              service: job.service,
              name: job.name,
              cus: job.cus,
              quo: job.quo,
              net: job.net,
              scope: job.scope,
              pm: job.takenBy || USERS.pm.name, // PM ที่ GM มอบหมายไว้เป็นเจ้าของ (ผู้ใช้สั่ง 27 ต.ค. 2569)
              start: job.projectStart || day,
              due: job.planEnd || day,
              status: "cancelled" as const,
              cancelled: c,
              updated: day,
              tone: "c" as const,
              phases: (draft?.phases ?? job.phases).map((ph) => ({
                name: ph.name,
                role: ph.role ?? "ba",
                start: ph.start,
                end: ph.end,
              })),
              tasks,
              source: job,
              chat: [],
              acts: [
                {
                  kind: "status" as const,
                  who: "PM",
                  at: c.at,
                  tx: `ดีลถูกยกเลิกโดย${c.by} · ${c.why} — แผนที่วางไว้เก็บไว้ดูย้อนหลังได้`,
                },
              ],
            },
          ]
        : [];
    return {
      ...s,
      inbox: s.inbox.filter((j) => j.deal !== deal),
      projects: [
        ...kept,
        ...s.projects.map((p) =>
          p.deal === deal && p.status !== "cancelled"
            ? { ...p, status: "cancelled" as const, cancelled: c, updated: day }
            : p,
        ),
      ],
    };
  });
}

/*
 * ชุดข้อมูลที่หน้าจอกำลังวาดอยู่ — memberOf/memberName อ่านจากตัวนี้ ไม่อ่านสโตร์ตรง ๆ
 * ตอน hydrate usePm ได้ชุดของฝั่งเซิร์ฟเวอร์ ชื่อที่ memberOf คืนจึงตรงกับ HTML ที่ส่งมา
 * พอ hydrate เสร็จ usePm ได้ชุดจริงแล้ววาดใหม่ ชื่อก็ตามมาเอง
 */
let rendering: "server" | "client" = "server";

/* React เรียก getServer ตอน hydrate และ get หลังจากนั้น — จำไว้ว่ารอบวาดนี้ใช้ชุดไหน */
const readClient = () => {
  rendering = "client";
  return store.get();
};
const readServer = () => {
  rendering = "server";
  return store.getServer();
};

export function usePm() {
  return useSyncExternalStore(store.subscribe, readClient, readServer);
}

export function resetPm() {
  store.reset();
}

/** อ่านค่าปัจจุบันนอกคอมโพเนนต์ — ใช้ตอนส่งงานข้ามฝ่าย (ดู flow.ts) */
export function pmSnapshot() {
  return store.get();
}

/*
 * ค้นทีมจากรหัสพนักงาน — อ่านจากสโตร์ ไม่ใช่จากชุดข้อมูลตั้งต้น
 * ไม่งั้นชื่อที่ PM เพิ่งแก้จะไม่เปลี่ยนตามในการ์ดงานและหน้าแผนงาน
 */
/*
 * ทีมงาน = ทะเบียนพนักงานชุดเดียวกับฝ่ายบุคคล (ERD HR-BR-19)
 * ชื่อในทีม = ชื่อเล่น (ผู้ใช้สั่ง 19 ต.ค. 2569) — ชื่อเต็มดูที่รายละเอียดพนักงาน
 * ชื่อและสถานะอ่านจากทะเบียนเสมอ (แก้ชื่อที่ฝ่ายบุคคลแล้วตามมาเอง) · ทักษะและจำนวนงานเป็นของฝั่ง PM
 * พนักงานใหม่ในตำแหน่งสายผลิตเข้าทีมเอง · คนที่พ้นสภาพยังอยู่ (left) เพื่อแสดงชื่อในงานเก่า
 */
export function teamFrom(stored: Member[], emp: Employee[]): Member[] {
  const byId = new Map(emp.map((e) => [e.id, e]));
  const fromStore = stored.map((m) => {
    const e = byId.get(m.id);
    return e ? { ...m, name: displayName(e), left: e.status === "left" } : m;
  });
  const have = new Set(stored.map((m) => m.id));
  const joined = emp
    .filter((e) => !have.has(e.id) && e.status === "active" && TEAM_ROLES_BY_POSITION[e.pos])
    .map((e) => ({ id: e.id, name: displayName(e), roles: TEAM_ROLES_BY_POSITION[e.pos], load: 0 }));
  return [...fromStore, ...joined];
}

/*
 * ซิงก์รายชื่อทีมในสโตร์ของ PM ตามทะเบียนฝ่ายบุคคล — ตอนเปิดแอป และทุกครั้งที่ทะเบียนเปลี่ยน
 * เขียนลงสโตร์ของ PM เลย ทุกหน้าจึงอ่าน pm.team / memberOf ได้ตามปกติ ไม่ต้องอ่านสองสโตร์ตอนวาด
 * (อ่านสองสโตร์ตอนวาดทำให้หน้าที่ hydrate ช้า เช่นใน Suspense ได้ชื่อไม่ตรงกับฝั่งเซิร์ฟเวอร์)
 */
function syncTeamFromHr() {
  const cur = store.get().team;
  const next = teamFrom(cur, hrSnapshot().emp);
  if (JSON.stringify(next) !== JSON.stringify(cur)) store.update((s) => ({ ...s, team: next }));
}

if (typeof window !== "undefined") {
  subscribeHr(syncTeamFromHr);
  queueMicrotask(syncTeamFromHr);
}

/** ทีมงานสำหรับหน้าจอ — ซิงก์จากทะเบียนฝ่ายบุคคลแล้ว */
export function useTeam() {
  return usePm().team;
}

export function memberOf(id: string) {
  return (rendering === "client" ? store.get() : store.getServer()).team.find((m) => m.id === id);
}

export function memberName(id: string) {
  return memberOf(id)?.name ?? nameOf(id);
}

// ─── ผู้สั่ง · ผู้ทำ · ผู้ตรวจ ─────────────────────────────────────────
/*
 * งาน 1 ใบมี 3 คน: ผู้สั่ง (assignedBy) · ผู้ทำ (whos[0]) · ผู้ตรวจ
 * ผู้ตรวจ = ผู้สั่งเสมอ เลือกคนอื่นไม่ได้แล้ว — PM สั่ง PM ตรวจ · sale สั่ง sale ตรวจ (ผู้ใช้สั่ง 27 ต.ค. 2569)
 * ไม่มีช่องเก็บผู้ตรวจ — หน้าจอและกระดิ่งอ่านผู้ตรวจผ่าน reviewerOf() เท่านั้น
 * ข้อมูลเก่าที่เคยเก็บผู้ตรวจไว้ (ช่อง reviewer 21 ต.ค. 2569) ไม่ถูกอ่านอีก — fillPeople ลบทิ้งตอนโหลด
 */

/** รหัสพนักงานของ PM จากชื่อที่เก็บใน Project.pm ("ชื่อ" หรือ "ชื่อ (PM)") — หาไม่เจอใช้ PM ตั้งต้น */
export function pmIdOf(pmName: string | undefined): string {
  const n = (pmName ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!n) return USERS.pm.employeeId;
  const u = Object.values(USERS).find((x) => x.name === n);
  if (u) return u.employeeId;
  return HR_EMP.find((e) => e.name === n || e.nick?.trim() === n)?.id ?? USERS.pm.employeeId;
}

/** กันไว้อีกชั้น: ผู้ทำตรวจงานตัวเองไม่ได้ — ผู้สั่งเป็นคนทำเอง (ไม่ควรเกิด) ตกไปที่ GM (GM ทำเองตกไปที่ PM) */
export function safeReviewer(reviewer: string | undefined, whos: string[]): string {
  const r = reviewer || USERS.pm.employeeId;
  if (r !== whos[0]) return r;
  return whos[0] === USERS.gm.employeeId ? USERS.pm.employeeId : USERS.gm.employeeId;
}

/** ผู้ตรวจของงานใบนี้ = ผู้สั่ง · ข้อมูลเก่าที่ยังไม่มีผู้สั่ง = PM เจ้าของโปรเจค (ผู้ใช้สั่ง 27 ต.ค. 2569) */
export function reviewerOf(t: Pick<ProjectTask, "assignedBy" | "whos">, p: Pick<Project, "pm">): string {
  return safeReviewer(t.assignedBy ?? pmIdOf(p.pm), t.whos);
}

/** แก้การตรวจงาน (ไม่ต้องตรวจ / ส่งลูกค้าตรวจ) ได้เฉพาะ PM เจ้าของโปรเจค หรือ GM — คนอื่นเห็นอย่างเดียว */
export function canSetReview(pmName: string | undefined, role: Role = currentRole()) {
  if (role === "gm") return true;
  return role === "pm" && pmIdOf(pmName) === USERS.pm.employeeId;
}

/** รหัสพนักงานของคนที่ล็อกอินอยู่ — ใช้ประทับว่าใครเปลี่ยนสถานะ */
function actorId() {
  return USERS[currentRole()]?.employeeId ?? USERS.pm.employeeId;
}

/*
 * เปลี่ยนสถานะงาน + ลงประวัติ — ทุกจุดในสโตร์ที่เปลี่ยนสถานะต้องผ่านตัวนี้ ประวัติจึงครบ (ผู้ใช้สั่ง 21 ต.ค. 2569)
 * fresh = งานเพิ่งเกิด/เพิ่งมอบหมาย (from = null) · สถานะเดิมซ้ำไม่ลงประวัติ
 */
export function withStatus(t: ProjectTask, to: TaskStatus, by: string, at: string, fresh = false): ProjectTask {
  if (!fresh && t.status === to) return t;
  return {
    ...t,
    status: to,
    history: [...(t.history ?? []), { at, from: fresh ? null : t.status, to, by }],
  };
}

/*
 * เติมผู้สั่งให้งานที่ยังไม่มี — ไม่ทับค่าที่ตั้งไว้แล้ว ไม่แตะสถานะและรอบส่ง
 * ผู้ตรวจที่เคยเลือกไว้ (ช่อง reviewer ของข้อมูลเก่า) ลบทิ้ง — ผู้ตรวจ = ผู้สั่งเสมอ (ผู้ใช้สั่ง 27 ต.ค. 2569)
 */
function fillPeople(t: ProjectTask, pmName: string): ProjectTask {
  const old = t as ProjectTask & { reviewer?: unknown };
  if (t.assignedBy && old.reviewer === undefined) return t;
  const { reviewer: _dropped, ...rest } = old;
  void _dropped;
  return { ...rest, assignedBy: t.assignedBy ?? pmIdOf(pmName) };
}

/**
 * บัญชีรับเงินงวดแรกแล้ว งานจึงเข้ากล่องงานใหม่ของ PM — เกิดโปรเจคพร้อมเลขที่โปรเจคตรงนี้ (ผู้ใช้สั่ง 5 ต.ค. 2569)
 * กันซ้ำด้วยใบแจ้งหนี้งวดแรก (และเลขดีลถ้ามี) เผื่อบัญชีแก้แล้วบันทึกเงินเข้าซ้ำ
 * คืนเลขที่โปรเจค — ของที่มีอยู่แล้วคืนเลขเดิม
 */
export function addInboxJob(job: Omit<InboxJob, "pj">): string {
  const same = (x: InboxJob | Project) =>
    (Boolean(job.bill) && x.bill === job.bill) || (Boolean(job.deal) && x.deal === job.deal);
  const cur = store.get();
  const had = cur.inbox.find(same) ?? cur.projects.find(same);
  if (had) return had.pj;
  const pj = nextDocNo(settings().docs.project, [...cur.inbox, ...cur.projects].map((x) => x.pj));
  store.update((s) => ({ ...s, inbox: [{ ...job, pj }, ...s.inbox] }));
  return pj;
}

function today() {
  return todayIso();
}

/** เปิดดูเอกสารของงานแล้ว — จุดแดงหน้าแถวในกล่องงานเข้าใหม่หายไป */
export function markInboxSeen(pj: string) {
  store.update((s) => ({
    ...s,
    inbox: s.inbox.map((j) => (isRef(j, pj) && !j.seen ? { ...j, seen: true } : j)),
  }));
}

/*
 * GM มอบหมายงานเข้าใหม่ให้ PM (ผู้ใช้สั่ง 27 ต.ค. 2569) — แทนปุ่ม "รับงาน" ที่ PM กดรับเองจากกระดานกลาง
 *
 * มอบหมายครั้งแรก: งานออกจากขั้น "รอมอบหมาย" ไปรอวางแผนของ PM คนนั้น
 *   วันเริ่มโครงการตั้งต้นแบบเดียวกับกล่องยืนยันรับงานเดิม — วันเริ่มตามข้อเสนอ ไม่มีใช้วันนี้
 *   เฟสตามข้อเสนอคงเดิม · PM เลื่อนวันและแก้เฟสเองได้ตอนวางแผน
 * เปลี่ยน PM: งานยังไม่ยืนยันแผน (ยังอยู่ในกล่อง) — เปลี่ยนแค่ผู้ดูแล วันและร่างแผนที่ทำไว้คงเดิม
 *   ยืนยันแผนแล้วเป็นโปรเจค งานออกจากกล่องแล้ว — เปลี่ยนคนผ่านการโอนโปรเจค (transferProject) ไม่ใช่ที่นี่
 * ชื่อ PM เก็บเป็นชื่อเต็มตามทะเบียน (รูปแบบเดียวกับ takenBy เดิม) · ผู้มอบหมาย = คนที่ล็อกอินอยู่
 * seen = false — PM ที่ได้รับยังไม่ได้เปิดดูเอกสาร
 */
export function assignInboxJob(pj: string, pmName: string, note = ""): boolean {
  const to = pmName.trim();
  const cur = store.get().inbox.find((j) => isRef(j, pj));
  if (!to || !cur) return false;
  const by = USERS[currentRole()]?.name ?? "";
  const at = today();
  const who = { takenBy: to, takenAt: at, assignedBy: by, assignedAt: at, assignNote: note.trim() || undefined, seen: false };
  store.update((s) => ({
    ...s,
    inbox: s.inbox.map((j) => {
      if (!isRef(j, pj)) return j;
      /* เปลี่ยน PM ของงานที่รอวางแผนอยู่แล้ว — ไม่แตะวันและเฟส */
      if (j.stage === "plan") return { ...j, ...who };
      const start = j.planStart || at;
      /* ชื่อโปรเจค (PM-BR-03) ตั้งต้นเป็นชื่อลูกค้า PM แก้ได้ที่หน้าวางแผน/หน้าโปรเจค (ผู้ใช้สั่ง 5 ต.ค. 2569) */
      const name = j.name?.trim() || j.cus;
      return { ...j, ...who, stage: "plan" as const, name, projectStart: start, planStart: start };
    }),
  }));
  return true;
}

/**
 * PM เพิ่มโปรเจคเอง — งานด่วนที่ได้รับแจ้งมาโดยตรง เกี่ยวกับลูกค้าหรือไม่ก็ได้ (ผู้ใช้สั่ง 8 ต.ค. 2569)
 * ไม่ผ่านกล่องงานเข้า: เกิดเป็นงานที่ "รับแล้ว รอวางแผน" ทันที แล้ววางแผนต่อจากหน้าโปรเจคเหมือนงานอื่น
 * ไม่มีใบแจ้งหนี้/ใบเสนอราคาผูก · เลขที่ต่อจากเลข PJ ที่มากที่สุดของปีนี้
 */
export function addAdhocProject(input: { name: string; cus: string; service: string; scope: string }) {
  const by = USERS[currentRole()]?.name ?? "";
  const at = today();
  const be = Number(at.slice(0, 4)) + 543;
  let pj = "";
  store.update((s) => {
    const nums = [...s.inbox, ...s.projects]
      .map((x) => x.pj)
      .filter((x) => x.startsWith(`PJ-${be}-`))
      .map((x) => Number(x.slice(-4)) || 0);
    pj = `PJ-${be}-${String(Math.max(0, ...nums) + 1).padStart(4, "0")}`;
    const job: InboxJob = {
      pj,
      bill: "",
      service: input.service,
      /* เว้นลูกค้าว่าง = งานภายใน — isInHouse() ดูจากชื่อนี้ ไม่มีตัวเลือกให้ลูกค้าตรวจ (ผู้ใช้สั่ง 21 ต.ค. 2569) */
      cus: input.cus.trim() || IN_HOUSE_CUS,
      quo: "",
      quoDate: "",
      net: 0,
      seqs: 0,
      paidAt: "",
      sentAt: at,
      scope: input.scope.trim() || input.name.trim(),
      items: [],
      /* ยังไม่มีวัน — PM กำหนดเฟสและวันเองตอนวางแผน */
      due: "",
      stage: "plan",
      planStart: "",
      planEnd: "",
      durationDays: 0,
      phases: [],
      seen: true,
      projectStart: "",
      name: input.name.trim(),
      takenBy: by,
      takenAt: at,
      /* ไม่ได้มาจากใบเสนอราคา จึงไม่มีข้อมูลผู้ติดต่อ/เงื่อนไข */
      contact: "",
      phone: "",
      taxId: "",
      address: "",
      terms: "",
      validDays: 0,
    };
    return { ...s, inbox: [job, ...s.inbox] };
  });
  return pj;
}

export type PlannedTask = {
  /** ดัชนีงานเดิมในโปรเจค — มีเฉพาะตอนแก้แผนของโปรเจคที่เดินงานอยู่ */
  from?: number;
  name: string;
  phase: number;
  whos: string[];
  start: string;
  due: string;
  /** โจทย์ที่ PM เขียนให้คนทำ — ว่างได้ แต่คนทำจะไม่รู้ว่าต้องทำอะไรนอกจากชื่องาน */
  brief?: string;
  /** ไฟล์ประกอบโจทย์ที่ PM แนบมาให้ */
  files?: TaskFile[];
  /** งานต่อกันที่ใช้จริง — หน้าวางแผนแปลง "ตามเฟส" เป็นชื่องานมาแล้ว (resolveAfter) */
  after?: string[];
  noReview?: boolean;
  /** ต้องให้ลูกค้าตรวจ (ผู้ใช้สั่ง 21 ต.ค. 2569) */
  clientReview?: boolean;
};

/* ─── ร่างแผนที่ยังไม่ยืนยัน ────────────────────────────────────────
 * กติกาเดียวกับใบเสนอราคา — แก้ปุ๊บบันทึกปั๊บ ไม่มีปุ่มบันทึก
 * "ยืนยันแผน" เปลี่ยนแค่สถานะ (ร่าง → โปรเจค) ไม่ใช่จุดที่เพิ่งเริ่มบันทึก
 */
export function savePlanDraft(pj: string, draft: Omit<PlanDraft, "at" | "by">, by: string) {
  store.update((s) => ({
    ...s,
    drafts: { ...s.drafts, [pj]: { ...draft, at: bkkStamp(), by } },
  }));
}

/** ทิ้งร่างของดีลนี้ — ยืนยันแผนแล้วร่างหมดหน้าที่ */
export function clearPlanDraft(pj: string) {
  store.update((s) => {
    if (!s.drafts[pj]) return s;
    const next = { ...s.drafts };
    delete next[pj];
    return { ...s, drafts: next };
  });
}

/*
 * ประทับว่าใครมอบงานใบนี้และเมื่อไร — ผู้รับงานต้องแยกงานใหม่ออกจากงานเก่าได้
 * งานที่ยังไม่มีผู้รับผิดชอบยังไม่ถือว่ามอบหมาย จึงไม่ประทับเวลา
 */
function stampAssign(t: ProjectTask, what: "assign" | "due" | "owner", at: string, by: string): ProjectTask {
  return {
    ...t,
    assignedAt: what === "due" ? t.assignedAt : t.whos.length ? at : undefined,
    lastChange: { at, what, by },
  };
}

/**
 * ยืนยันแผนงาน — งานออกจากกล่องเข้าแล้วเปิดเป็นโปรเจคจริง
 *
 * โทนสีปกวนสามแบบตามจำนวนโปรเจคที่มีอยู่ จะได้ไม่ซ้ำกับใบก่อนหน้าติดกัน
 */
export function confirmPlan(
  pj: string,
  tasks: PlannedTask[],
  pmName: string,
  /** เฟสหลัง PM แก้หรือเพิ่มเองในหน้าวางแผน */
  phases: ProjectPhase[],
) {
  const at = bkkStamp();
  store.update((s) => {
    const job = s.inbox.find((j) => isRef(j, pj));
    if (!job) return s;
    /* งานที่ไม่มีข้อเสนอไม่มีวันจบจากใบเสนอราคา ใช้วันจบของเฟสสุดท้ายที่ PM วางไว้แทน */
    const lastEnd = phases.reduce((m, ph) => (ph.end > m ? ph.end : m), "");
    const tones = ["a", "b", "c"] as const;
    const project: Project = {
      pj: job.pj,
      bill: job.bill,
      deal: job.deal,
      service: job.service,
      name: job.name,
      cus: job.cus,
      quo: job.quo,
      net: job.net,
      scope: job.scope,
      pm: pmName,
      start: job.projectStart || phases.reduce((m, ph) => (!m || (ph.start && ph.start < m) ? ph.start : m), "") || today(),
      /* วันจบตามเฟสที่ PM วางเอง ไม่ใช่ระยะจากข้อเสนอ (ผู้ใช้สั่ง 8 ต.ค. 2569) */
      due: lastEnd || job.planEnd,
      status: "running",
      updated: today(),
      tone: tones[s.projects.length % tones.length],
      phases: phases.map((ph) => ({ ...ph })),
      source: job,
      /* เอกสารที่แนบไว้ตอนวางแผนติดไปกับโปรเจค ทีมจะได้เห็น (ผู้ใช้สั่ง 5 ต.ค. 2569) */
      docs: (job.docs ?? []).map((d) => ({ ...d })),
      /* ทุกใบเพิ่งถูกมอบหมายรอบแรก จึงประทับเวลาและผู้มอบให้ทั้งชุด
         ผู้สั่ง = PM เจ้าของโปรเจค · ประวัติเริ่มที่ "มอบหมาย" (ผู้ใช้สั่ง 21 ต.ค. 2569) · ผู้ตรวจ = ผู้สั่งเสมอ (ผู้ใช้สั่ง 27 ต.ค. 2569) */
      tasks: tasks.map<ProjectTask>((t) =>
        withStatus(
          stampAssign(
            {
              name: t.name,
              phase: t.phase,
              whos: [...t.whos],
              start: t.start,
              due: t.due,
              status: "todo",
              pct: 0,
              files: (t.files ?? []).map((f) => ({ ...f })),
              brief: t.brief?.trim() || undefined,
              after: t.after?.length ? [...t.after] : undefined,
              assignedBy: pmIdOf(pmName),
              noReview: t.noReview || undefined,
              /* ต้องให้ลูกค้าตรวจ — ไม่ต้องตรวจแล้วไม่มี · งานภายในไม่มี (ผู้ใช้สั่ง 21 ต.ค. 2569) */
              clientReview: (!t.noReview && !isInHouse(job) && t.clientReview) || undefined,
            },
            "assign",
            at,
            pmName,
          ),
          "todo",
          actorId(),
          at,
          true,
        ),
      ),
      chat: [],
      /* เวลาที่กดจริงเหมือนกิจกรรมอื่นทุกรายการ ไม่ใช่ 09:00 ตายตัว */
      acts: [{ kind: "status", who: "PM", at, tx: "เปิดโปรเจคและมอบหมายงานให้ทีม" }],
    };
    /* ยืนยันแล้วร่างหมดหน้าที่ — แผนจริงอยู่ในโปรเจคแล้ว */
    const drafts = { ...s.drafts };
    delete drafts[pj];
    return {
      ...s,
      inbox: s.inbox.filter((j) => !isRef(j, pj)),
      projects: [project, ...s.projects],
      drafts,
    };
  });
}

/**
 * แก้แผนของโปรเจคที่ยืนยันไปแล้ว (ปุ่ม "วางแผนงาน" ในหน้ารายละเอียดโปรเจค)
 *
 * งานเดิมเก็บสถานะ ความคืบหน้า ไฟล์ และรอบส่งงานไว้ทั้งหมด เปลี่ยนแค่ชื่อ เฟส คน และวัน
 * งานที่เพิ่มใหม่เริ่มที่ "ยังไม่เริ่ม"
 */
export function replanProject(pj: string, tasks: PlannedTask[], phases: ProjectPhase[]) {
  const at = bkkStamp();
  store.update((s) => {
    const drafts = { ...s.drafts };
    delete drafts[pj];
    return {
    ...s,
    drafts,
    projects: s.projects.map((p) => {
      if (!isRef(p, pj)) return p;
      const lastEnd = phases.reduce((m, ph) => (ph.end > m ? ph.end : m), p.due);
      return {
        ...p,
        due: lastEnd,
        updated: today(),
        phases: phases.map((ph) => ({ ...ph })),
        tasks: tasks.map<ProjectTask>((t) => {
          const old = t.from !== undefined ? p.tasks[t.from] : undefined;
          const base: ProjectTask = old ?? { name: t.name, phase: t.phase, whos: [], start: "", due: "", status: "todo", pct: 0, files: [] };
          /* ผู้สั่งของงานเดิมคงไว้ · งานใหม่ = PM เจ้าของโปรเจค (ผู้ใช้สั่ง 21 ต.ค. 2569) · ผู้ตรวจ = ผู้สั่งเสมอ (ผู้ใช้สั่ง 27 ต.ค. 2569) */
          const assignedBy = base.assignedBy ?? pmIdOf(p.pm);
          const next: ProjectTask = {
            ...base,
            name: t.name,
            phase: t.phase,
            whos: [...t.whos],
            start: t.start,
            due: t.due,
            files: t.files ? t.files.map((f) => ({ ...f })) : base.files,
            brief: t.brief?.trim() || undefined,
            after: t.after?.length ? [...t.after] : undefined,
            assignedBy,
            noReview: t.noReview || undefined,
            clientReview: (!t.noReview && !isInHouse(p) && t.clientReview) || undefined,
          };
          /*
           * สิ่งที่ผู้รับงานต้องรู้มีสามอย่าง — เพิ่งได้รับงาน · เปลี่ยนคนทำ · เลื่อนกำหนดส่ง
           * งานเก่าที่ไม่ได้แตะไม่ต้องประทับใหม่ ไม่งั้นทุกใบจะขึ้นว่า "เพิ่งเปลี่ยน" ทั้งกระดาน
           */
          if (!old) return withStatus(stampAssign(next, "assign", at, p.pm), "todo", actorId(), at, true);
          if (old.whos.join(",") !== next.whos.join(",")) return stampAssign(next, "owner", at, p.pm);
          if (old.due !== next.due) return stampAssign(next, "due", at, p.pm);
          return next;
        }),
        /* เวลาที่กดจริง ไม่ใช่ 09:00 ตายตัว — นี่คือหลักฐานว่าใครแก้แผนตอนไหน */
        acts: [{ kind: "status" as const, who: "PM", at, tx: "ปรับแผนงานของโปรเจค" }, ...p.acts],
      };
    }),
    };
  });
}

/**
 * แก้ชื่อโปรเจค (PM-BR-03) — PM ตั้งและแก้ได้เอง ส่วนลูกค้า บริการ และขอบเขตมาจากดีล แก้ตรงนี้ไม่ได้
 * งานที่ยังรอวางแผน (อยู่ในกล่องงานเข้า) แก้ที่งานนั้น ชื่อจะติดไปตอนยืนยันแผน
 */
/** ลบโปรเจค (หรืองานที่ยังวางแผนอยู่) ออกจากระบบ พร้อมร่างแผนและข้อความของงานย่อย (ผู้ใช้สั่ง 8 ต.ค. 2569) */
export function deleteProject(pj: string) {
  store.update((s) => {
    const drafts = { ...s.drafts };
    delete drafts[pj];
    const talks = Object.fromEntries(Object.entries(s.talks).filter(([k]) => !k.startsWith(`${pj}|`)));
    return {
      ...s,
      inbox: s.inbox.filter((j) => !isRef(j, pj)),
      projects: s.projects.filter((p) => !isRef(p, pj)),
      drafts,
      talks,
    };
  });
}

export function renameProject(pj: string, name: string) {
  const v = name.trim();
  if (!v) return;
  store.update((s) => ({
    ...s,
    inbox: s.inbox.map((j) => (isRef(j, pj) ? { ...j, name: v } : j)),
    projects: s.projects.map((p) => (isRef(p, pj) ? { ...p, name: v, updated: today() } : p)),
  }));
}

/*
 * แนบเอกสารอื่นให้โปรเจค (ผู้ใช้สั่ง 5 ต.ค. 2569) — ปุ่ม "+" ข้างใบเสนอราคา/Proposal
 * งานที่ยังวางแผนอยู่เก็บที่ใบงานในกล่องเข้า (ติดไปตอนยืนยันแผน) · โปรเจคที่เดินแล้วเก็บที่โปรเจค
 * ชื่อซ้ำกับที่มีอยู่ไม่เพิ่มซ้ำ — ลบใช้ชื่อเป็นตัวระบุ
 */
export function addProjectDocs(pj: string, docs: ProjectDoc[]) {
  if (!docs.length) return;
  const at = bkkStamp();
  const merge = (cur: ProjectDoc[] | undefined) => {
    const have = new Set((cur ?? []).map((d) => d.n));
    return [...docs.filter((d) => !have.has(d.n)), ...(cur ?? [])];
  };
  store.update((s) => ({
    ...s,
    inbox: s.inbox.map((j) => (isRef(j, pj) ? { ...j, docs: merge(j.docs) } : j)),
    projects: s.projects.map((p) =>
      isRef(p, pj)
        ? {
            ...p,
            docs: merge(p.docs),
            updated: today(),
            acts: [
              { kind: "file" as const, who: "PM", at, tx: `แนบเอกสารโปรเจค ${docs.length} รายการ` },
              ...p.acts,
            ],
          }
        : p,
    ),
  }));
}

/** เอาเอกสารแนบของโปรเจคออก (PM/GM กดยืนยันก่อน) */
export function removeProjectDoc(pj: string, name: string) {
  store.update((s) => ({
    ...s,
    inbox: s.inbox.map((j) => (isRef(j, pj) ? { ...j, docs: (j.docs ?? []).filter((d) => d.n !== name) } : j)),
    projects: s.projects.map((p) =>
      isRef(p, pj) ? { ...p, docs: (p.docs ?? []).filter((d) => d.n !== name), updated: today() } : p,
    ),
  }));
}

/*
 * โอนโปรเจคให้เจ้าของคนใหม่ (Proposal · PM — Transfer Project)
 * โปรเจคมีเจ้าของได้คนเดียว โอนแล้วเจ้าของเดิมหมดสิทธิ์ทันที
 * โอนหลังตกลงกันแล้วเท่านั้น จึงบังคับให้ใส่เหตุผล และเก็บไว้เป็นประวัติทุกครั้ง
 * งานย่อยกับคนที่ถูกมอบหมายไม่เปลี่ยน — เปลี่ยนแค่คนที่ดูแลโปรเจค
 */
export function transferProject(pj: string, to: string, why: string, by: string) {
  const name = to.trim();
  const reason = why.trim();
  if (!name || !reason) return false;
  let done = false;
  store.update((s) => ({
    ...s,
    projects: s.projects.map((p) => {
      if (!isRef(p, pj)) return p;
      /* โอนให้คนเดิมไม่ใช่การโอน อย่าลงประวัติหลอก ๆ ไว้ */
      if (p.pm === name) return p;
      done = true;
      const at = bkkStamp();
      return {
        ...p,
        pm: name,
        updated: today(),
        transfers: [...(p.transfers ?? []), { at, from: p.pm, to: name, by, why: reason }],
        acts: [
          { kind: "status" as const, who: by, at, tx: `โอนโปรเจคให้ ${name} · ${reason}` },
          ...p.acts,
        ].slice(0, 40),
      };
    }),
  }));
  return done;
}

/** เลื่อนสถานะงานย่อย — เสร็จแล้วให้ความคืบหน้าเต็ม 100 เสมอ */
export function setTaskStatus(pj: string, taskIndex: number, status: TaskStatus) {
  const by = actorId();
  const at = bkkStamp();
  store.update((s) => ({
    ...s,
    projects: s.projects.map((p) => {
      if (!isRef(p, pj)) return p;
      const tasks = p.tasks.map((t, i) =>
        i === taskIndex && !t.clientOk
          ? { ...withStatus(t, status, by, at), pct: status === "done" ? 100 : status === "todo" ? 0 : t.pct }
          : t,
      );
      /* งานครบทุกใบแล้วถือว่าโปรเจคส่งมอบเสร็จ ไม่ต้องมากดปิดซ้ำอีกที */
      const allDone = tasks.every((t) => t.status === "done");
      return {
        ...p,
        tasks,
        status: allDone ? ("done" as const) : ("running" as const),
        updated: today(),
      };
    }),
  }));
}

/**
 * ปรับความคืบหน้าของงานที่กำลังทำอยู่
 *
 * สถานะกับเปอร์เซ็นต์ต้องไม่ขัดกัน — 0 คือยังไม่เริ่ม 100 คือเสร็จ
 * จึงเลื่อนสถานะให้ตามค่าที่กรอกด้วย ไม่ให้เกิดงาน "เสร็จแล้ว 40%"
 */
export function setTaskProgress(pj: string, taskIndex: number, pct: number) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const by = actorId();
  const at = bkkStamp();
  store.update((s) => ({
    ...s,
    projects: s.projects.map((p) => {
      if (!isRef(p, pj)) return p;
      const tasks = p.tasks.map((t, i) =>
        i === taskIndex && !t.clientOk
          ? {
              ...withStatus(
                t,
                clamped >= 100 ? "done" : clamped <= 0 ? "todo" : "doing",
                by,
                at,
              ),
              pct: clamped,
            }
          : t,
      );
      const allDone = tasks.every((t) => t.status === "done");
      return {
        ...p,
        tasks,
        status: allDone ? ("done" as const) : ("running" as const),
        updated: today(),
      };
    }),
  }));
}

/**
 * แนบไฟล์เข้ากับงานย่อย
 *
 * ยังไม่มีที่เก็บไฟล์จริง จึงบันทึกได้แค่รายการว่ามีไฟล์อะไร ใครส่ง ส่งเมื่อไร
 * ตัวไฟล์เปิดได้เฉพาะในรอบที่เพิ่งเลือกเข้ามา (ดู objectURL ในหน้าโปรเจค)
 * เมื่อต่อ backend ให้อัปโหลดขึ้น storage แล้วเก็บ URL แทน
 */
export function attachFile(pj: string, taskIndex: number, file: TaskFile) {
  store.update((s) => ({
    ...s,
    projects: s.projects.map((p) =>
      isRef(p, pj)
        ? {
            ...p,
            tasks: p.tasks.map((t, i) =>
              i === taskIndex ? { ...t, files: [file, ...t.files] } : t,
            ),
            updated: today(),
          }
        : p,
    ),
  }));
}

export function removeFile(pj: string, taskIndex: number, name: string) {
  store.update((s) => ({
    ...s,
    projects: s.projects.map((p) =>
      isRef(p, pj)
        ? {
            ...p,
            tasks: p.tasks.map((t, i) =>
              i === taskIndex ? { ...t, files: t.files.filter((f) => f.n !== name) } : t,
            ),
          }
        : p,
    ),
  }));
}

// ─── ส่งงานให้ตรวจ และผลตรวจ ─────────────────────────────────────

/** หางานย่อยใบเดียวจากรหัสดีลกับชื่องาน — สองอย่างนี้รวมกันไม่ซ้ำกันในระบบ */
function patchTask(
  s: PmState,
  pj: string,
  taskName: string,
  fn: (t: ProjectTask) => ProjectTask,
  /* ความเคลื่อนไหวที่จะขึ้นในกิจกรรมล่าสุดของโปรเจค — งานขยับแล้วต้องมีร่องรอยเสมอ
     ไม่งั้น PM เปิดหน้าโปรเจคแล้วเห็นสถานะเปลี่ยนโดยไม่รู้ว่าใครทำเมื่อไหร่ */
  act: Activity,
): PmState {
  /* งานนอกโปรเจค — อยู่ใน loose ไม่มีโปรเจคให้ลงกิจกรรมหรือเลื่อนสถานะ */
  if (isLoose(pj)) {
    const owner = looseOwner(pj);
    return {
      ...s,
      loose: s.loose.map((t) => (t.whos[0] === owner && t.name === taskName && !t.clientOk ? fn(t) : t)),
    };
  }
  /* ลูกค้าอนุมัติแล้ว = ปิดถาวร ไม่รับการเปลี่ยนสถานะใด ๆ อีก */
  const target = s.projects.find((p) => isRef(p, pj))?.tasks.find((t) => t.name === taskName);
  if (target?.clientOk) return s;
  return {
    ...s,
    projects: s.projects.map((p) => {
      if (!isRef(p, pj)) return p;
      const tasks = p.tasks.map((t) => (t.name === taskName ? fn(t) : t));
      const allDone = tasks.every((t) => t.status === "done");
      return {
        ...p,
        tasks,
        status: allDone ? ("done" as const) : ("running" as const),
        acts: [act, ...p.acts],
        updated: today(),
      };
    }),
  };
}

/**
 * ทีมส่งผลงานให้ PM ตรวจ — ใช้ได้ทั้งรอบแรกและรอบที่ส่งแก้
 *
 * เก็บทุกรอบไว้ต่อกัน ไม่ทับของเดิม เพราะตอน PM ตรวจต้องเทียบได้ว่ารอบก่อนตีกลับเพราะอะไร
 * แล้วรอบนี้แก้ตรงนั้นหรือยัง · ส่งใหม่แล้วเหตุผลที่ตีกลับถือว่าจบไป จึงล้าง back ทิ้ง
 */
export function submitWork(
  pj: string,
  taskName: string,
  input: { by: string; files: string[]; note: string; at: string },
) {
  const sub: Submission = {
    at: input.at,
    by: input.by,
    files: input.files,
    note: input.note,
  };
  store.update((s) => {
    /* รอข้อมูลอยู่ = ยังส่งไม่ได้ (LOCK_SEND_WHILE_WAITING) — กันที่สโตร์ด้วย ไม่ฝากไว้กับปุ่มบนหน้าจออย่างเดียว */
    const home = s.projects.find((p) => isRef(p, pj));
    const task = home?.tasks.find((t) => t.name === taskName);
    if (LOCK_SEND_WHILE_WAITING && home && task && blockers(home.tasks, task).length) return s;
    /* ไม่ต้องตรวจ — ส่งแล้วปิดงานทันที เวลาปิด = เวลาส่ง (ผู้ใช้สั่ง 21 ต.ค. 2569) */
    const quick =
      task?.noReview ??
      (isLoose(pj) ? s.loose.find((t) => t.whos[0] === looseOwner(pj) && t.name === taskName)?.noReview : undefined);
    if (quick) {
      return patchTask(
        s,
        pj,
        taskName,
        (t) => ({
          ...withStatus(t, "done", input.by, input.at),
          ...endWait(t, input.at),
          pct: 100,
          doneAt: input.at,
          subs: [...(t.subs ?? []), sub],
          back: undefined,
        }),
        { kind: "done", who: input.by, at: input.at, tx: `ส่งงาน ${taskName} · ไม่ต้องตรวจ ปิดงานแล้ว` },
      );
    }
    return patchTask(
      s,
      pj,
      taskName,
      (t) => ({
        ...withStatus(t, "sent", input.by, input.at),
        /* ส่งงานแล้ว = ได้ข้อมูลครบแล้ว ปิดการรอที่กดเองไว้ด้วย (ผู้ใช้สั่ง 21 ต.ค. 2569) */
        ...endWait(t, input.at),
        subs: [...(t.subs ?? []), sub],
        back: undefined,
      }),
      /* รอบแรกกับรอบแก้เขียนคนละแบบ PM จะได้รู้ว่าใบนี้เคยตีกลับไปแล้ว */
      {
        kind: "done",
        who: input.by,
        at: input.at,
        tx: `ส่งงาน ${taskName} ให้ตรวจ`,
      },
    );
  });
}

/*
 * รอข้อมูลที่คนทำกดเอง (ผู้ใช้สั่ง 21 ต.ค. 2569) — รอนอกแผน: รอลูกค้า / รอไฟล์ / อื่น ๆ
 * ไม่เปลี่ยนสถานะงาน ไม่ล็อกปุ่มส่ง · เก็บทุกช่วงที่รอไว้ใน waits ไว้หักเวลารอออกจากความช้าของคนทำ
 */
function endWait(t: ProjectTask, at: string): Pick<ProjectTask, "waitingOn" | "waits"> {
  if (!t.waitingOn) return { waitingOn: undefined, waits: t.waits };
  return {
    waitingOn: undefined,
    waits: (t.waits ?? []).map((w) => (w.to || w.from !== t.waitingOn?.since ? w : { ...w, to: at })),
  };
}

export function setTaskWait(pj: string, taskName: string, input: { kind: WaitKind; note?: string; by: string }) {
  const at = bkkStamp();
  const note = input.note?.trim() || undefined;
  store.update((s) =>
    patchTask(
      s,
      pj,
      taskName,
      (t) =>
        t.status === "done" || t.waitingOn
          ? t
          : {
              ...t,
              waitingOn: { kind: input.kind, note, since: at, by: input.by },
              waits: [...(t.waits ?? []), { kind: input.kind, note, from: at, by: input.by }],
            },
      { kind: "status", who: input.by, at, tx: `แจ้งรอข้อมูล ${taskName}${note ? ` · ${note}` : ""}` },
    ),
  );
}

/** ได้ข้อมูลแล้ว — ปิดช่วงที่รออยู่ */
export function clearTaskWait(pj: string, taskName: string, by: string) {
  const at = bkkStamp();
  store.update((s) =>
    patchTask(
      s,
      pj,
      taskName,
      (t) => (t.waitingOn ? { ...t, ...endWait(t, at) } : t),
      { kind: "status", who: by, at, tx: `ได้ข้อมูลแล้ว ${taskName}` },
    ),
  );
}

/**
 * PM ตรวจผ่าน — งานจบที่ 100% ไม่ต้องให้ทีมมากดปิดซ้ำอีกที
 * byClient = ลูกค้าอนุมัติผ่านลิงก์ตรวจงาน → ประทับ clientOk งานปิดถาวร
 */
export function approveWork(pj: string, taskName: string, stamp: string, byClient = false) {
  /* ผู้ตรวจตัวจริง (คนที่กด) ไม่ใช่คำว่า "PM" — ชื่อขึ้นในกิจกรรมผ่านรหัสพนักงาน (ผู้ใช้สั่ง 21 ต.ค. 2569)
     ข้อความกิจกรรมคงรูปเดิม เพราะประวัติการส่งงาน (my-tasks SubmitHistory) จับคู่จากข้อความนี้ */
  const by = byClient ? "ลูกค้า" : actorId();
  store.update((s) =>
    patchTask(
      s,
      pj,
      taskName,
      (t) => ({
        ...withStatus(t, "done", by, stamp),
        pct: 100,
        doneAt: stamp,
        back: undefined,
        ...(byClient ? { clientOk: stamp } : {}),
      }),
      byClient
        ? { kind: "status", who: "ลูกค้า", at: stamp, tx: `ลูกค้าอนุมัติ ${taskName} · ปิดงาน` }
        : { kind: "status", who: by, at: stamp, tx: `ตรวจผ่าน ${taskName}` },
    ),
  );
}

/** ผู้ตรวจตีกลับให้แก้ — เหตุผลหรือคอมเมนต์บนไฟล์อย่างใดอย่างหนึ่งบังคับ ฝั่งที่เรียกต้องกันไว้ก่อนแล้ว · by ไม่ส่ง = คนที่ล็อกอินอยู่ */
export function sendBackWork(pj: string, taskName: string, why: string, stamp: string, by = actorId(), notes?: FileNote[], due?: string) {
  store.update((s) =>
    patchTask(
      s,
      pj,
      taskName,
      (t) => ({
        ...withStatus(t, "revise", by, stamp),
        back: { why, at: stamp, by, ...(notes?.length ? { notes } : {}), ...(due ? { due } : {}) },
      }),
      { kind: "status", who: by, at: stamp, tx: `ส่งกลับให้แก้ ${taskName}` },
    ),
  );
}

/**
 * PM ส่งงานที่ตรวจผ่านแล้วให้ลูกค้าตรวจผ่านลิงก์ (client-review-store) — งานเป็น "รอลูกค้าตรวจ"
 * ลูกค้าอนุมัติแล้วงานปิดเอง (approveWork byClient) · ลูกค้ามีความเห็นก็ตีกลับด้วย sendBackWork ตามทางเดิม
 */
export function sendToClientWork(pj: string, taskName: string, round: number, stamp: string) {
  const by = actorId();
  store.update((s) => {
    /* งานภายใน (ไม่มีลูกค้า) ส่งให้ลูกค้าตรวจไม่ได้ — หน้าจอซ่อนปุ่มแล้ว กันที่สโตร์อีกชั้น (ผู้ใช้สั่ง 21 ต.ค. 2569) */
    const home = s.projects.find((p) => isRef(p, pj));
    if (home && isInHouse(home)) return s;
    return patchTask(
      s,
      pj,
      taskName,
      /* งาน "ไม่ต้องตรวจ" ส่งให้ลูกค้าตรวจไม่ได้ (ผู้ใช้สั่ง 21 ต.ค. 2569) — หน้าจอซ่อนปุ่มแล้ว กันที่สโตร์อีกชั้น */
      (t) => (t.noReview ? t : { ...withStatus(t, "wait", by, stamp), back: undefined }),
      { kind: "status", who: by, at: stamp, tx: `ส่ง ${taskName} ให้ลูกค้าตรวจ รอบที่ ${round}` },
    );
  });
}

/** ลงกิจกรรมของโปรเจคจากนอกสโตร์ — ตอนนี้ใช้กับลูกค้าที่ส่งความเห็นผ่านลิงก์ตรวจงาน */
export function addProjectAct(pj: string, act: Activity) {
  store.update((s) => ({
    ...s,
    projects: s.projects.map((p) => (isRef(p, pj) ? { ...p, acts: [act, ...p.acts], updated: today() } : p)),
  }));
}

export function postChat(
  pj: string,
  text: string,
  stamp: string,
  files: { n: string; sz: string }[] = [],
  /** ผู้ส่ง — "PM" หรือรหัสพนักงานของทีมงานที่ส่งจากหน้างานที่ได้รับ (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  who = "PM",
) {
  const message: ChatMessage = { who, at: stamp, tx: text, files: files.length ? files : undefined };
  const act = files.length ? `ส่งไฟล์ในแชทโปรเจค ${files.length} ไฟล์` : "ส่งข้อความในแชทโปรเจค";
  /* ไฟล์ที่ส่งในแชทเก็บเข้าไฟล์ของโปรเจคด้วย จะได้หาเจอโดยไม่ต้องไล่อ่านแชท (ตามต้นแบบ) */
  const kept: TaskFile[] = files.map((f) => ({ n: f.n, k: fileKind(f.n), sz: f.sz, at: stamp.slice(0, 10), by: who }));
  store.update((s) => ({
    ...s,
    projects: s.projects.map((p) =>
      /* ส่งแชทแล้วขึ้นในกิจกรรมล่าสุดด้วย ตามต้นแบบ — คนที่ไล่ดูกิจกรรมจะรู้ว่ามีข้อความใหม่ */
      isRef(p, pj)
        ? {
            ...p,
            chat: [...p.chat, message],
            files: kept.length ? [...kept, ...(p.files ?? [])] : p.files,
            acts: [...p.acts, { kind: "chat" as const, who, at: stamp, tx: act }],
            updated: today(),
          }
        : p,
    ),
  }));
}

// ─── ข้อความของงานย่อย ─────────────────────────────────────────────

/** สายข้อความของงานหนึ่งใบ เรียงเก่าไปใหม่ */
export function taskTalks(s: PmState, pj: string, taskName: string): TaskTalk[] {
  return s.talks[talkKey(pj, taskName)] ?? [];
}

/**
 * ส่งข้อความเรื่องงานใบหนึ่ง — เก็บเข้าสายของงานนั้น และส่งเข้าแชทโปรเจคด้วย
 *
 * ที่ต้องเข้าแชทโปรเจคด้วย เพราะ PM อ่านความเคลื่อนไหวของโปรเจคจากที่นั่น
 * ถ้าเก็บแยกอย่างเดียว PM จะไม่รู้ว่าทีมตอบกลับมาแล้ว ก็กลับไปตามกันในไลน์เหมือนเดิม
 */
export function postTaskTalk(
  pj: string,
  taskName: string,
  who: string,
  tx: string,
  stamp: string,
  nudge = false,
) {
  const note: TaskTalk = { who, at: stamp, tx, ...(nudge ? { nudge: true } : {}) };
  const key = talkKey(pj, taskName);
  const act = nudge ? `ทวงงาน ${taskName}` : `ส่งข้อความเรื่อง ${taskName}`;
  store.update((s) => ({
    ...s,
    talks: { ...s.talks, [key]: [...(s.talks[key] ?? []), note] },
    projects: s.projects.map((p) =>
      isRef(p, pj)
        ? {
            ...p,
            /* ติดชื่องานไว้หน้าข้อความ คนอ่านแชทโปรเจคจะได้รู้ว่าพูดถึงงานใบไหน */
            chat: [...p.chat, { who, at: stamp, tx: `[${taskName}] ${tx}` }],
            acts: [...p.acts, { kind: "chat" as const, who, at: stamp, tx: act }],
            updated: today(),
          }
        : p,
    ),
  }));
}

/**
 * PM ทวงงานที่ค้าง — ผลคือผู้รับงานเห็นข้อความนี้ในหน้างานที่ได้รับของตัวเอง
 * (กระดิ่งของทีมงานอ่านจาก talks ตัวเดียวกัน ดูหมายเหตุใน notifications)
 */
export function nudgeTask(pj: string, taskName: string, tx: string, stamp: string) {
  postTaskTalk(pj, taskName, "PM", tx, stamp, true);
}

/** ทวงล่าสุดของงานใบนี้ — ยังไม่มีใครตอบหลังจากนั้นถึงจะนับว่ายังค้าง */
export function openNudge(s: PmState, pj: string, taskName: string) {
  const list = taskTalks(s, pj, taskName);
  const last = list[list.length - 1];
  return last?.nudge ? last : undefined;
}

// ─── งานที่ทีมเสนอเอง (เจ้าของอนุมัติ 20 ต.ค. 2569) ──────────────────

/**
 * ที่อยู่ของงานทุกใบ — โปรเจคจริง + บ้านชั่วคราวของงานนอกโปรเจค (ต่อคน)
 * ใช้เฉพาะหน้าที่ไล่ "งานของคน" (งานที่ได้รับ งานรอตรวจ กระดิ่ง) ห้ามใช้กับรายการโปรเจค
 */
export function taskHomes(s: PmState): Project[] {
  return [...s.projects, ...looseHomes(s.loose ?? [], USERS.pm.name)];
}

/** ชื่องานไม่ซ้ำในที่เดียวกัน — สายข้อความและผลตรวจอ้างงานด้วยชื่อ */
function uniqueName(name: string, taken: string[]) {
  const have = new Set(taken);
  if (!have.has(name)) return name;
  let i = 2;
  while (have.has(`${name} (${i})`)) i++;
  return `${name} (${i})`;
}

function deciderId() {
  return USERS[currentRole()]?.employeeId ?? USERS.pm.employeeId;
}

export function proposeTask(input: {
  by: string;
  pj: string;
  name: string;
  from: AskFrom;
  fromName: string;
  brief: string;
  due: string;
  files: TaskFile[];
}) {
  const ask: TaskAsk = { ...input, id: `ASK-${Date.now().toString(36)}`, at: bkkStamp() };
  store.update((s) => ({ ...s, asks: [ask, ...s.asks] }));
  return ask.id;
}

/**
 * PM อนุมัติ — งานเข้าโปรเจค (นับใน % ตามปกติ) หรือเป็นงานนอกโปรเจคของผู้เสนอ
 * ผู้รับงานคือคนเสนอคนเดียวเสมอ · เริ่มวันนี้ · กำหนดส่งตามที่ PM ยืนยัน
 */
export function approveAsk(id: string, pick: { pj: string; phase: number; due: string }) {
  const s0 = store.get();
  const ask = s0.asks.find((a) => a.id === id);
  if (!ask || ask.ok || ask.no) return false;
  const at = bkkStamp();
  const by = deciderId();
  const day = today();
  const base: ProjectTask = withStatus({
    name: ask.name,
    phase: 0,
    whos: [ask.by],
    start: day,
    due: pick.due < day ? day : pick.due,
    status: "todo",
    pct: 0,
    files: ask.files.map((f) => ({ ...f })),
    brief: ask.brief.trim() || undefined,
    assignedAt: at,
    lastChange: { at, what: "assign", by },
    origin: { ask: ask.id, by: ask.by, at: ask.at, from: ask.from, fromName: ask.fromName },
    /* ผู้สั่ง = คนที่กดอนุมัติ · ประวัติเริ่มที่มอบหมาย (ผู้ใช้สั่ง 21 ต.ค. 2569) · ผู้ตรวจ = ผู้สั่ง (ผู้ใช้สั่ง 27 ต.ค. 2569) */
    assignedBy: by,
  }, "todo", by, at, true);
  const project = pick.pj ? s0.projects.find((p) => p.pj === pick.pj && p.status !== "cancelled") : undefined;
  store.update((s) => {
    if (project) {
      const name = uniqueName(ask.name, project.tasks.map((t) => t.name));
      const phase = Math.max(0, Math.min(pick.phase, Math.max(0, project.phases.length - 1)));
      return {
        ...s,
        asks: s.asks.map((a) => (a.id === id ? { ...a, ok: { at, by, pj: project.pj, name } } : a)),
        projects: s.projects.map((p) =>
          p.pj === project.pj
            ? {
                ...p,
                tasks: [...p.tasks, { ...base, name, phase }],
                status: "running" as const,
                acts: [
                  { kind: "status" as const, who: "PM", at, tx: `อนุมัติงานที่ ${nameOf(ask.by)} เสนอ · ${name}` },
                  ...p.acts,
                ],
                updated: day,
              }
            : p,
        ),
      };
    }
    const name = uniqueName(
      ask.name,
      s.loose.filter((t) => t.whos[0] === ask.by).map((t) => t.name),
    );
    return {
      ...s,
      asks: s.asks.map((a) => (a.id === id ? { ...a, ok: { at, by, pj: "", name } } : a)),
      loose: [...s.loose, { ...base, name }],
    };
  });
  return true;
}

/** PM ไม่อนุมัติ — เหตุผลบังคับ ฝั่งที่เรียกต้องกันไว้ก่อน */
export function rejectAsk(id: string, why: string) {
  const at = bkkStamp();
  const by = deciderId();
  store.update((s) => ({
    ...s,
    asks: s.asks.map((a) => (a.id === id && !a.ok && !a.no ? { ...a, no: { why, at, by } } : a)),
  }));
}

/** ผู้เสนอรับทราบผลไม่อนุมัติแล้ว — ซ่อนจากหน้าของตัวเอง ใบยังอยู่ในประวัติ */
export function dismissAsk(id: string) {
  store.update((s) => ({ ...s, asks: s.asks.map((a) => (a.id === id && a.no ? { ...a, gone: true } : a)) }));
}
