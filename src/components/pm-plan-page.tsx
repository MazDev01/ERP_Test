"use client";

/*
 * จัดคิวงาน (ตามต้นแบบ pm-plan.html) — PM วางแผนงานที่ GM มอบหมายให้ก่อนเปิดเป็นโปรเจค (ผู้ใช้สั่ง 27 ต.ค. 2569)
 *
 * งานที่มีข้อเสนอได้เฟสและงานย่อยมาเป็นโครงตั้งต้น งานที่ไม่มีเริ่มจากกระดานว่างแล้วสร้างเฟสเอง
 * PM ทำได้ — เพิ่ม/แก้เฟส · เพิ่มงานในเฟส · ลากจัดลำดับในเฟส · เลือกคนและวัน · มอบหมายหลายงานพร้อมกัน
 * แก้เฟสที่มาจากข้อเสนอ ระบบจำค่าเดิมไว้แล้วบอกส่วนต่าง จะได้ตอบลูกค้าได้ว่าต่างจากที่เสนอไปเท่าไหร่
 *
 * แผนที่ยังไม่ยืนยันเก็บเป็นร่างในสโตร์ตั้งแต่ตอนแก้ (กติกาเดียวกับใบเสนอราคา)
 * ไม่มีปุ่มบันทึก · รีโหลดหรือออกจากหน้าไปแล้วกลับมา สิ่งที่กรอกไว้ยังอยู่
 * "ยืนยันแผน" เปลี่ยนแค่สถานะ — ร่างกลายเป็นโปรเจค แล้วกลับหน้ารายการโปรเจค
 */

import { ROLE_EMPLOYEE, useHrTime } from "@/lib/hr-link";
import { hrPos, type PosKey } from "@/lib/hr-data";
import { useHr } from "@/lib/hr-store";
import { empReqLeaveHours, useEmpRequests } from "@/lib/emp-requests";
import { fmtLeaveHours, leaveHoursOf } from "@/lib/leave-data";
import { HR_LEAVE_LABEL, leaveRowHours } from "@/lib/hr-data";
import { useAllLeave } from "@/lib/leave-store";
import { useRole, type Role } from "@/lib/role";
import { USERS } from "@/lib/mock-data";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { addDays, daysBetween, thaiDate, thaiStamp, todayIso } from "@/lib/format";
import { initialOf, useNameOf } from "@/lib/emp-name";
import { useProfile } from "@/lib/profile-data";
import {
  fileKind,
  fileKindLabel,
  isInHouse,
  isAssignedJob,
  isJobOf,
  isRef,
  projectHref,
  teamRoles,
  roleLabel,
  type InboxJob,
  type Member,
  type Project,
  type ProjectDoc,
  type TaskFile,
  type TeamRole,
} from "@/lib/pm-data";
import {
  confirmPlan,
  memberName,
  memberOf,
  replanProject,
  savePlanDraft,
  type DraftPhase,
  type DraftTask,
  type PlannedTask,
  taskHomes,
  usePm,
  useTeam,
} from "@/lib/pm-store";
import {
  CalendarIcon,
  CheckIcon,
  FileIcon,
  ChevronDownIcon,
  CloseIcon,
  LinkIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  QuotationIcon,
  UserIcon,
  TrashIcon,
} from "./icons";
import { fileSize } from "./file-drop";
import { Field, Sheet } from "./lead-dialogs";
import "../styles/mobile/pm-plan.css";
import { ProposalPreview, QuotationPreview } from "./pm-docs";
import { ThaiDatePicker } from "./thai-date-picker";
import { AddDocButton, AddDocsDialog, DocChips, RenameButton, RenameDialog } from "./pm-project-tools";
import { useAddOption } from "./add-option";
import { ReadOnlyNote, usePmReadOnly } from "./pm-readonly";
import { useCrumb } from "@/lib/crumb";
import { autoAfter, resolveAfter } from "@/lib/task-deps";

/*
 * งานย่อยและเฟสระหว่างวางแผน — รูปเดียวกับร่างในสโตร์ (pm-store: DraftTask/DraftPhase)
 * ประกาศไว้ที่สโตร์เพราะร่างถูกบันทึกจริง ไม่ใช่ของชั่วคราวในหน้านี้แล้ว
 */
type Draft = DraftTask;
type PlanPhase = DraftPhase;

type Board = { phases: PlanPhase[]; plan: Draft[][] };

/**
 * งานที่กำลังวางแผน — งานที่รับเข้ามาแล้วรอวางแผน หรือโปรเจคที่ยืนยันแล้วกลับมาแก้แผน
 * docs = ข้อมูลสำหรับเปิดใบเสนอราคา/ข้อเสนอ (โปรเจคตั้งต้นไม่มี)
 */
type Target = {
  /** เลขที่โปรเจค (ผู้ใช้สั่ง 5 ต.ค. 2569 — เดิมเลขที่ดีล) */
  pj: string;
  cus: string;
  /** ชื่อโปรเจค — ว่าง = ยังไม่ได้ตั้ง ขึ้นชื่อลูกค้าแทน (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  name?: string;
  scope: string;
  /** เอกสารที่ PM/GM แนบเพิ่ม (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  extra: ProjectDoc[];
  docs?: InboxJob;
  /** ช่วงตามใบเสนอราคา — ว่าง = คิดจากเฟสที่วางเอง */
  planStart: string;
  planEnd: string;
  firstDay: string;
  project?: Project;
  /** PM ที่ GM มอบหมายงานนี้ให้ (ชื่อเต็ม) — เป็นเจ้าของโปรเจคตอนยืนยันแผน (ผู้ใช้สั่ง 27 ต.ค. 2569) */
  owner?: string;
  initial: () => Board;
};

function targetOfJob(j: InboxJob): Target {
  return {
    pj: j.pj,
    cus: j.cus,
    name: j.name,
    scope: j.scope,
    extra: j.docs ?? [],
    docs: j,
    planStart: j.planStart,
    planEnd: j.planEnd,
    firstDay: j.projectStart || j.planStart || todayIso(),
    owner: j.takenBy,
    initial: () => blankBoard(j),
  };
}

function targetOfProject(p: Project): Target {
  return {
    pj: p.pj,
    cus: p.cus,
    name: p.name,
    scope: p.scope,
    extra: p.docs ?? [],
    docs: p.source,
    planStart: "",
    planEnd: "",
    firstDay: p.start,
    project: p,
    initial: () => ({
      /* own ติดมาด้วย — เฟสที่ PM สร้างเองไม่มีงานต่อกันอัตโนมัติแม้แก้แผนรอบหลัง (ผู้ใช้สั่ง 21 ต.ค. 2569) */
      phases: p.phases.map((ph) => ({ name: ph.name, role: ph.role, start: ph.start, end: ph.end, par: ph.par, own: ph.own })),
      plan: p.phases.map((ph, pi) =>
        p.tasks
          .map((t, i) => ({ t, i }))
          .filter(({ t }) => t.phase === pi)
          .map(({ t, i }) => ({
            name: t.name,
            role: ph.role,
            whos: [...t.whos],
            start: t.start,
            due: t.due,
            /* โจทย์และไฟล์ของงานเดิมติดมาด้วย จะได้แก้ต่อได้โดยไม่ต้องพิมพ์ใหม่ */
            brief: t.brief,
            files: t.files.map((f) => ({ ...f })),
            from: i,
            /* งานที่เดินอยู่แล้วคงงานต่อกันเดิมไว้ ไม่มี = เริ่มได้ทันที
               ห้ามปล่อยเป็น "ตามเฟส" ไม่งั้นแก้แผนครั้งเดียว งานที่กำลังทำอยู่จะถูกล็อกทั้งกระดาน */
            after: t.after ? [...t.after] : [],
            /* ผู้ตรวจไม่ติดมา — ผู้ตรวจ = ผู้สั่งเสมอ (ผู้ใช้สั่ง 27 ต.ค. 2569) */
            noReview: t.noReview || undefined,
            clientReview: t.clientReview || undefined,
          })),
      ),
    }),
  };
}

/** ตำแหน่งของงานย่อยในกระดาน: เฟสที่เท่าไร ใบที่เท่าไร */
type Spot = { phase: number; index: number };

/* เฟสหนึ่งมีงานได้หลายตำแหน่ง สีจึงไม่ผูกกับตำแหน่ง ใช้สีตามลำดับเฟสแทน (ตามต้นแบบ) */
const PH_TONE = ["#D0021B", "#2F55B8", "#1F7A4D", "#B26414", "#6B3FBF", "#0B7C84", "#B02A72", "#4A5568"];
const phaseColor = (i: number) => PH_TONE[i % PH_TONE.length];

export function PmPlanPage() {
  const pm = usePm();
  const me = useProfile();
  const router = useRouter();
  /* GM เปิดดูแผนได้ แต่ PM เป็นคนวางแผน (ต้นแบบ pm-plan.html?as=gm) */
  const ro = usePmReadOnly();
  const params = useSearchParams();

  /* ทุกงานที่รับแล้วรอวางแผน — รวมงานที่ไม่มีข้อเสนอ ซึ่งต้องสร้างเฟสเอง
     ปุ่ม "วางแผนงาน" ในหน้าโปรเจคส่ง ?pj= ของโปรเจคที่ยืนยันแล้วมา — เปิดมาแก้แผนได้ด้วย
     ลิงก์เก่า ?deal= ยังเปิดได้ — แปลงเลขดีลเป็นเลขที่โปรเจคครั้งเดียวตรงนี้ (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  const rawParam = params.get("pj") ?? params.get("deal") ?? "";
  const fromParam =
    [...pm.projects, ...pm.inbox].find((x) => isRef(x, rawParam))?.pj ?? rawParam;
  /* โปรเจคที่ถูกยกเลิกแล้ววางแผนต่อไม่ได้ — ไม่เอาเข้ารายการให้เลือก */
  const linked = pm.projects.find((p) => p.pj === fromParam && p.status !== "cancelled");
  /*
   * GM มอบหมายงานให้ PM (ผู้ใช้สั่ง 27 ต.ค. 2569) — PM วางแผนได้เฉพาะงานในกล่องที่ GM มอบหมายให้ตัวเอง
   * GM เปิดได้ทุกงานที่มี PM ดูแลแล้วเหมือนเดิม (usePmReadOnly ไม่ล็อก GM) · งานที่ยังรอมอบหมายยังวางแผนไม่ได้
   */
  const role = useRole();
  const myName = USERS[role]?.name ?? "";
  const canPlanJob = (j: InboxJob) => (role === "gm" ? isAssignedJob(j) : isJobOf(j, myName));
  const targets: Target[] = [
    ...(linked ? [targetOfProject(linked)] : []),
    ...pm.inbox.filter(canPlanJob).map(targetOfJob),
  ];
  /* ลิงก์ชี้มาที่งานในกล่องที่ไม่ได้มอบหมายให้คนนี้ — บอกตรง ๆ ไม่สลับไปงานอื่น */
  const notMine = pm.inbox.find((j) => j.pj === fromParam && !canPlanJob(j));
  /* ไม่มีตัวเลือกโปรเจคบนหน้านี้แล้ว — เลือกจากการเปิดโฟลเดอร์ใน /pm/projects (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  const job = targets.find((t) => t.pj === fromParam) ?? targets[0];
  const [renaming, setRenaming] = useState(false);
  const [addingDoc, setAddingDoc] = useState(false);
  /*
   * ลิงก์ชี้มาที่ดีลที่ไม่มีให้วางแผนแล้ว (ถูกยกเลิก หรือยืนยันแผนไปแล้ว)
   * ต้องบอกให้รู้ ไม่ใช่สลับไปงานอื่นเงียบ ๆ แล้วปล่อยให้แก้ผิดใบ (ผู้ใช้ทักท้วง 24 ก.ย. 2569)
   */
  const gone = Boolean(fromParam) && !targets.some((t) => t.pj === fromParam);
  const cancelled = pm.projects.find((p) => p.pj === fromParam && p.status === "cancelled");

  /* ทีมจากทะเบียนเดียวกับฝ่ายบุคคล — คนที่พ้นสภาพแล้วมอบหมายงานใหม่ไม่ได้ */
  const team = useMarketingTeam();
  /*
   * ระบบร่างแผนให้ PM แค่ตรวจแล้วยืนยัน (ผู้ใช้สั่ง 21 ต.ค. 2569)
   * งานใหม่ที่ยังไม่มีร่าง — เติมผู้รับผิดชอบ วัน และรายละเอียดให้ตั้งแต่เปิดกระดาน ยืนยันแผนได้ทันที
   * โปรเจคที่เดินอยู่แล้วไม่เติมเอง ใช้ปุ่ม "เติมช่องที่ว่างให้" แทน
   */
  const fillCtx: FillCtx = { team, projects: pm.projects, scope: job?.scope ?? "" };
  /* ร่างเก็บในสโตร์ คีย์ด้วยเลขที่โปรเจค — สลับงานไปมาหรือรีโหลดแล้วสิ่งที่กรอกไว้ไม่หาย */
  const draft = job ? pm.drafts[job.pj] : undefined;
  const board: Board = job
    ? (draft ?? (job.project ? job.initial() : fillEmpty(job.initial(), fillCtx, false).board))
    : { phases: [], plan: [] };
  const { phases, plan } = board;
  /* ช่องที่ยังว่างและระบบเติมให้ได้ — มีเมื่อไรขึ้นปุ่ม "เติมช่องที่ว่างให้" (แก้แผนโปรเจคเดิมเติมเฉพาะงานที่เพิ่มใหม่) */
  const fillable = job ? fillEmpty(board, fillCtx, Boolean(job.project)).n : 0;
  /* งานภายใน (ไม่มีลูกค้า) — ไม่มีตัวเลือกให้ลูกค้าตรวจ (ผู้ใช้สั่ง 21 ต.ค. 2569) */
  const inHouse = job ? isInHouse(job.project ?? job.docs ?? { cus: job.cus }) : false;

  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const nameOfEmp = useNameOf();
  /*
   * บรรทัดเสริมบนการ์ด — ขึ้นเฉพาะข้อยกเว้น (ผู้ใช้สั่ง 21 ต.ค. 2569)
   * ไม่ต้องตรวจ / ส่งลูกค้าตรวจ · "รอ …" เฉพาะงานเก่าที่ตั้งงานต่อกันไว้ต่างจากแม่แบบ
   * ไม่มี "ตรวจโดย …" แล้ว ผู้ตรวจ = ผู้สั่งเสมอ (ผู้ใช้สั่ง 27 ต.ค. 2569)
   */
  const cardNotes = (t: Draft, pi: number): string[] => {
    const review = t.noReview ? "ไม่ต้องตรวจ" : t.clientReview && !inHouse ? "ส่งลูกค้าตรวจ" : "";
    let wait = "";
    if (t.after !== undefined) {
      const own = resolveAfter(phases, plan, pi, t.after);
      const tpl = new Set(autoAfter(phases, plan, pi));
      const same = own.length === tpl.size && own.every((n) => tpl.has(n));
      if (own.length && !same) wait = `รอ ${own.length === 1 ? own[0] : `${own.length} งานก่อนหน้า`}`;
    }
    return [review, wait].filter(Boolean);
  };
  const [bulkWho, setBulkWho] = useState(team[0]?.id ?? "");
  const [open, setOpen] = useState<Spot | null>(null);
  const [doc, setDoc] = useState<"quo" | "prop" | null>(null);
  /** เฟสที่กำลังแก้ — -1 = เพิ่มเฟสใหม่ */
  const [phaseEdit, setPhaseEdit] = useState<number | null>(null);
  /* มือถือ: ชิปเลือกเฟส (เจ้าของขอคืน 25 ก.ย. 2569) — "all" = แสดงทุกเฟสเรียงลงมา · จอกว้างไม่ใช้ */
  const [mPhase, setMPhase] = useState<number | "all">("all");
  const [adding, setAdding] = useState<number | null>(null);
  /* ลากการ์ดเพื่อสลับลำดับ — ลากได้เฉพาะในเฟสเดียวกัน เพราะงานย่อยผูกกับเฟสของมัน */
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  /* ลบเฟส/งาน — ถามยืนยันก่อน (ผู้ใช้สั่ง 8 ต.ค. 2569) */
  const [asking, setAsking] = useState<{ phase: number; index?: number } | null>(null);

  /* แก้อะไรก็บันทึกร่างทันที ไม่มีปุ่มบันทึก (กติกาเดียวกับใบเสนอราคา) */
  function edit(fn: (b: Board) => void) {
    if (!job) return;
    const next = cloneBoard(board);
    fn(next);
    savePlanDraft(job.pj, next, `${me.name} (PM)`);
  }

  function dropOn(phase: number, index: number) {
    if (!drag) return;
    const [fp, fi] = drag.split(":").map(Number);
    setDrag(null);
    setOver(null);
    if (fp !== phase || fi === index) return;
    edit((b) => {
      const [item] = b.plan[phase].splice(fi, 1);
      b.plan[phase].splice(index, 0, item);
    });
    /* ลำดับเปลี่ยน คีย์ของใบที่ติ๊กไว้จึงชี้ผิดใบ ล้างทิ้งดีกว่ามอบหมายผิดคน */
    setPicked({});
  }

  const flat = plan.flat();
  const noWho = flat.filter((t) => !t.whos.length).length;
  const noDate = flat.filter((t) => !t.start || !t.due).length;
  const left = Math.max(noWho, noDate);
  const outOfPhase = phases.filter((ph, pi) =>
    (plan[pi] ?? []).some((t) => t.start && t.due && (t.start < ph.start || t.due > ph.end)),
  );
  const problems = [
    /* ตามต้นแบบ แผนใหม่ยืนยันได้แม้ยังไม่มีงาน — กันเฉพาะตอนแก้แผนโปรเจคที่เดินอยู่ จะได้ไม่ล้างงานเดิมทิ้งหมด */
    job?.project && flat.length === 0 ? "ยังไม่มีงานในแผน" : "",
    noDate > 0 ? `ยังไม่ได้กำหนดวัน ${noDate} งาน` : "",
    noWho > 0 ? `ยังไม่ได้เลือกผู้รับผิดชอบ ${noWho} งาน` : "",
    /* โปรเจคที่เดินงานอยู่อาจมีงานเก่าที่วันเลยกรอบเฟสมาก่อนแล้ว — แสดงเตือนที่การ์ด แต่ไม่ห้ามบันทึก */
    ...(job?.project ? [] : outOfPhase.map((ph) => `มีงานหลุดกรอบเฟส "${ph.name}"`)),
  ].filter(Boolean);

  const pickedKeys = Object.keys(picked).filter((k) => picked[k]);
  /* ปุ่มถอดออกกดได้เฉพาะตอนคนที่เลือกเป็นผู้รับผิดชอบอยู่จริงในงานที่ติ๊กไว้ */
  const removable = pickedKeys.filter((k) => at(plan, k)?.whos.includes(bulkWho)).length;

  /* เส้นทางบนแถบบน "โปรเจค / ลูกค้า / วางแผนงาน" แทนทางเดินในหน้า (ผู้ใช้สั่ง 12 ต.ค. 2569) */
  useCrumb(
    job && { label: "โปรเจค", href: "/pm/projects", root: true },
    job && (job.project ? { label: job.cus, href: projectHref(job.pj) } : job.cus),
    job && "วางแผนงาน",
  );

  if (gone || !job) {
    return (
      <div className="space-y-4">
        <PageBar />
        <section className="glass rounded-[15px] px-5 py-12 text-center">
          {gone ? (
            <>
              <b className="block text-[15px] font-bold">ไม่พบงานของโปรเจคนี้ในหน้าวางแผน</b>
              <p className="mx-auto mt-2 max-w-[520px] text-[13px] leading-relaxed text-muted-foreground">
                <span className="num">{fromParam}</span>{" "}
                {cancelled
                  ? `ถูกยกเลิกเมื่อ ${cancelled.cancelled ? thaiDate(cancelled.cancelled.at.slice(0, 10)) : "แล้ว"} โดย ${cancelled.cancelled?.by ? nameOfEmp(cancelled.cancelled.by) : "ฝ่ายที่เกี่ยวข้อง"}`
                  : notMine
                    ? isAssignedJob(notMine)
                      ? "งานนี้มอบหมายให้ PM คนอื่นแล้ว"
                      : "งานนี้ยังรอ GM มอบหมาย PM"
                    : ""}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2.5">
                <Link
                  href={fromParam ? projectHref(fromParam) : "/pm/projects"}
                  className="btn glass-thin"
                >
                  เปิดหน้าโปรเจค
                </Link>
                {targets.length > 0 && (
                  <Link href="/pm/plan" className="btn solid btn-solid">
                    ไปงานที่รอวางแผน ({targets.length})
                  </Link>
                )}
              </div>
            </>
          ) : (
            <span className="text-muted-foreground">ไม่มีงานรอวางแผน</span>
          )}
        </section>
      </div>
    );
  }

  /* ช่วงเวลาบนแถบล็อก — มีข้อเสนอใช้ระยะตามใบเสนอราคา ไม่มีคิดจากเฟสที่ PM วางเอง */
  /* PM กำหนดเฟสและวันเองทั้งหมด ไม่ยึดระยะจากข้อเสนอแล้ว (ผู้ใช้สั่ง 8 ต.ค. 2569) */
  const own = true;
  const docs = job.docs;
  const span = own
    ? phases.reduce(
        (r, ph) => ({ s: !r.s || ph.start < r.s ? ph.start : r.s, e: ph.end > r.e ? ph.end : r.e }),
        { s: "", e: "" },
      )
    : { s: job.planStart, e: job.planEnd };

  function confirm() {
    if (!job || problems.length) return;
    const tasks: PlannedTask[] = [];
    plan.forEach((list, pi) =>
      list.forEach((t) =>
        tasks.push({
          from: t.from,
          name: t.name,
          phase: pi,
          whos: t.whos,
          start: t.start,
          due: t.due,
          brief: t.brief,
          files: t.files,
          /* ระบบเติมงานต่อกันจากแม่แบบตอนยืนยันแผน — เฟสที่สร้างเองไม่มี · ค่าเดิมของข้อมูลเก่าใช้ตามเดิม */
          after: resolveAfter(phases, plan, pi, t.after),
          /* ไม่ส่งผู้ตรวจ — ผู้ตรวจ = ผู้สั่งเสมอ (ผู้ใช้สั่ง 27 ต.ค. 2569) */
          noReview: t.noReview,
          clientReview: inHouse || t.noReview ? undefined : t.clientReview,
        }),
      ),
    );
    const outPhases = phases.map((ph, pi) => ({
      name: ph.name,
      /* โปรเจคต้องมีตำแหน่งของเฟส — เฟสที่สร้างเองใช้ตำแหน่งของงานแรกในเฟส */
      role: ph.role ?? plan[pi]?.find((t) => t.role)?.role ?? teamRoles()[0].key,
      start: ph.start,
      end: ph.end,
      par: ph.par,
      own: ph.own || undefined,
    }));
    if (job.project) {
      /* โปรเจคที่เดินงานอยู่ — บันทึกแผนใหม่แล้วกลับไปหน้าโปรเจคนั้น (ร่างถูกล้างในสโตร์แล้ว) */
      replanProject(job.pj, tasks, outPhases);
      router.push(projectHref(job.pj));
      return;
    }
    /* เจ้าของโปรเจค = PM ที่ GM มอบหมาย ไม่ใช่คนที่กดยืนยัน (GM วางแผนแทนได้) (ผู้ใช้สั่ง 27 ต.ค. 2569) */
    confirmPlan(job.pj, tasks, `${job.owner || me.name} (PM)`, outPhases);
    /* ยืนยันแล้วกลับไปหน้ารายการโปรเจคตามต้นแบบ — โฟลเดอร์ของงานนี้โผล่ในรายการทันที */
    router.push("/pm/projects");
  }

  /* ปุ่มยืนยันแผน — จอกว้างอยู่บนแถบบน · มือถืออยู่ท้ายหน้าต่อจากกระดาน (ตามต้นแบบ) ใช้ตัวจัดการเดียวกัน */
  function confirmButton(where: string) {
    if (!job) return null;
    return (
      <button
        type="button"
        disabled={problems.length > 0}
        title={problems.length ? problems.join("\n") : "ส่งแผนงานให้ทีม"}
        onClick={confirm}
        /* ยังกดไม่ได้ก็ต้องดูเป็นปุ่ม — ใช้ปุ่มมีกรอบ (.btn ประกาศนอก @layer คลาส disabled: ของ Tailwind จึงแพ้) (ผู้ใช้สั่ง 5 ต.ค. 2569) */
        className={`btn shrink-0 whitespace-nowrap ${problems.length > 0 ? "glass-thin cursor-not-allowed !text-muted-foreground" : "solid btn-solid"} ${where}`}
      >
        <span>{job.project ? "บันทึกแผนงาน" : "ยืนยันแผนงาน"}</span>
        {problems.length > 0 && left > 0 && (
          <span className="text-[11px] font-medium">เหลืออีก {left} งาน</span>
        )}
      </button>
    );
  }

  return (
    /* มือถือ: แถบมอบหมายหลายงานลอยเหนือแถบล่าง — เว้นท้ายหน้าไว้ จะได้เลื่อนดูการ์ดใบสุดท้ายได้ */
    <div className={`pmplan-m space-y-3.5 ${!ro && pickedKeys.length > 0 ? "max-md:pb-[170px]" : ""}`}>
      <div className="bar pl-bar">
        <div className="min-w-0">
          {/* ทางเดิน โปรเจค / ลูกค้า / วางแผนงาน แทนปุ่มย้อนกลับ · แก้ชื่อที่หน้าโปรเจค (ผู้ใช้สั่ง 8 ต.ค. 2569)
              จอคอมย้ายไปแถบบนแล้ว เหลือเฉพาะมือถือ (ผู้ใช้สั่ง 12 ต.ค. 2569) */}
          <p className="mb-1 text-xs text-muted-foreground md:hidden">
            <Link href="/pm/projects" className="hover:text-primary">
              โปรเจค
            </Link>
            <span className="mx-1.5">/</span>
            {job.project ? (
              <Link href={projectHref(job.pj)} className="hover:text-primary">
                {job.cus}
              </Link>
            ) : (
              <span>{job.cus}</span>
            )}
            <span className="mx-1.5">/</span>
            <b className="font-semibold text-foreground">วางแผนงาน</b>
          </p>
          <h1 style={{ marginTop: 10, marginBottom: 0, lineHeight: 1.25 }}>{job.name?.trim() || job.cus}</h1>
          {/* ระยะเวลาอยู่ใต้ชื่อโปรเจค แทนกล่องกุญแจด้านขวา (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
          <p className="num text-[13px] text-muted-foreground" style={{ marginTop: 2 }}>
            ระยะเวลาดำเนินการ{" "}
            <b className="font-semibold text-foreground">
              {phases.length && span.s && span.e ? `${thaiDate(span.s)} – ${thaiDate(span.e)}` : "ยังไม่กำหนด"}
            </b>
          </p>
        </div>
        <div className="tools w-full flex-wrap items-center md:w-auto md:flex-nowrap">
          {/* ปุ่มแนบไฟล์อยู่ข้างปุ่มบันทึกแผนงาน (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
          {/* ร่างเดิมที่ยังมีช่องว่าง — ให้ระบบเติมแบบเดียวกับแผนใหม่ เฉพาะช่องที่ว่าง ไม่ทับที่ PM เลือกไว้ (ผู้ใช้สั่ง 21 ต.ค. 2569) */}
          {!ro && fillable > 0 && (
            <button
              type="button"
              className="btn glass-thin whitespace-nowrap"
              title="ระบบเติมผู้รับผิดชอบ วัน และรายละเอียดให้เฉพาะช่องที่ยังว่าง"
              onClick={() =>
                edit((b) => {
                  const r = fillEmpty(b, fillCtx, Boolean(job.project)).board;
                  b.phases = r.phases;
                  b.plan = r.plan;
                })
              }
            >
              เติมช่องที่ว่างให้
            </button>
          )}
          {!ro && <AddDocButton className="pl-docbtn whitespace-nowrap" label="แนบไฟล์" onClick={() => setAddingDoc(true)} />}
          {!ro && confirmButton("pl-confirm-top")}
        </div>
      </div>
      <ReadOnlyNote />

      {/* ร่างแผนบันทึกเองตั้งแต่ตอนแก้ — บอกให้เห็นว่ามีร่างค้างอยู่และแก้ล่าสุดเมื่อไร */}
      {draft && (
        <p className="rounded-[10px] bg-[var(--warning-soft)] px-3.5 py-[9px] text-[12.5px] font-semibold text-[var(--warning)]">
          ร่างแผนยังไม่ยืนยัน · แก้ล่าสุด {thaiStamp(draft.at)} น. โดย {nameOfEmp(draft.by)}
        </p>
      )}

      {/* ── เอกสารอ้างอิงและกรอบเวลา — วางบนพื้นหน้า ไม่มีกล่องครอบ (ตามต้นแบบ) ── */}
      {/* ไม่มีไฟล์แนบ ไม่เว้นที่ว่าง */}
      {job.extra.length > 0 && (
      <section className="flex flex-wrap items-start gap-3.5 max-md:items-center max-md:gap-2">
        <span className="flex flex-wrap items-center gap-2">
          {/* ไม่มีปุ่มใบเสนอราคา/Proposal ตั้งต้น — PM แนบไฟล์เองทุกไฟล์ (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
          {/* เอกสารอื่นที่แนบให้ทีมเห็น + ปุ่มแนบเพิ่ม (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
          <DocChips pj={job.pj} docs={job.extra} canEdit={!ro} />
        </span>
      </section>
      )}

      {/* ── เลือกหลายใบแล้วมอบหมายพร้อมกัน — โผล่เมื่อมีงานถูกติ๊กไว้ ── */}
      {!ro && pickedKeys.length > 0 && (
        <section
          className="panel glass pl-bulk relative z-40 flex flex-wrap items-center gap-3.5 px-[18px] py-3"
          aria-label="งานที่ถูกติ๊กไว้เพื่อมอบหมายพร้อมกัน"
        >
          <span className="pl-bcount rounded-[20px] bg-accent px-3.5 py-[5px] text-[13px] font-bold text-primary">
            เลือก {pickedKeys.length} งาน
          </span>
          <span className="pl-bpick flex min-w-[240px] flex-1 items-center gap-2.5">
            <span className="flex-none text-[12.5px] font-semibold text-muted-foreground">มอบหมายให้</span>
            <WhoPicker team={team} value={bulkWho} onChange={setBulkWho} />
          </span>
          <span className="pl-bacts flex flex-wrap gap-2">
            <button
              type="button"
              className="btn solid btn-solid"
              onClick={() =>
                edit((b) => {
                  for (const k of pickedKeys) {
                    const t = at(b.plan, k);
                    if (t && !t.whos.includes(bulkWho)) {
                      t.whos.push(bulkWho);
                      /* PM เลือกคนเองแล้ว — คำบอก "แนะนำจากตำแหน่ง…" หายไป */
                      t.autoFill = unflag(t.autoFill, "who");
                    }
                  }
                })
              }
            >
              มอบหมาย {pickedKeys.length} งาน
            </button>
          </span>
        </section>
      )}

      {/* ── กระดานงานย่อยแยกตามเฟส ── */}
      {phases.length === 0 ? (
        /* โปรเจคที่ไม่มีข้อเสนอยังไม่มีเฟส ถือว่าปกติ บอกให้ชัดว่าเริ่มจากสร้างเฟสเอง */
        <section className="glass rounded-[15px] px-5 py-14 text-center">
          <p className="text-[15px] font-bold">ยังไม่มีแผนงาน</p>
          {!ro && (
            <button type="button" className="btn solid btn-solid mt-5 inline-flex" onClick={() => setPhaseEdit(-1)}>
              <PlusIcon className="size-[15px]" strokeWidth={2.2} />
              เพิ่มเฟส
            </button>
          )}
        </section>
      ) : (
        <>
        {/* มือถือ: แถวชิปเลือกเฟส ปัดข้างได้ — เลือกแล้วแสดงเฉพาะเฟสนั้น (จอกว้างซ่อน) */}
        <div className="pl-phase-chips md:hidden" role="tablist" aria-label="เลือกเฟส">
          {(["all", ...phases.map((_, pi) => pi)] as (number | "all")[]).map((k) => {
            const on = (mPhase === "all" || mPhase >= phases.length ? "all" : mPhase) === k;
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={on}
                className={on ? "on" : ""}
                onClick={() => setMPhase(k)}
              >
                {k === "all" ? "ทั้งหมด" : phases[k].name}
              </button>
            );
          })}
        </div>
        {/* จอกว้างเรียงทุกเฟสเป็นกระดานปัดข้าง · มือถือเรียงเฟสลงมาเป็นการ์ดทีละใบ แล้วต่อด้วยปุ่มเพิ่มเฟส (ตามต้นแบบ) */}
        <div className="flex items-stretch gap-3 overflow-x-auto pb-2 max-md:flex-col max-md:gap-3.5 max-md:overflow-visible max-md:pb-0">
          {phases.map((ph, pi) => {
            const list = plan[pi] ?? [];
            const color = phaseColor(pi);
            const base = baseLines(ph);
            return (
              <section
                key={`${pi}-${ph.name}`}
                id={`plan-ph-${pi}`}
                className={`${mPhase !== "all" && mPhase < phases.length && mPhase !== pi ? "max-md:hidden " : ""}flex max-h-[560px] w-[276px] flex-none flex-col overflow-hidden rounded-[14px] border border-border bg-card max-md:max-h-none max-md:w-auto max-md:rounded-[20px] max-md:border-0 max-md:bg-white max-md:shadow-[0_1px_2px_rgba(40,20,25,.04)]`}
              >
                <header
                  className="flex items-center gap-[9px] px-3.5 py-3 text-white"
                  style={{ background: color }}
                >
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold" title={ph.name}>
                    {ph.name}
                  </span>
                  <span className="num grid h-[22px] min-w-[22px] place-items-center rounded-full bg-white/28 px-1.5 text-[11.5px] font-bold">
                    {list.length}
                  </span>
                  {!ro && <>
                  <button
                    type="button"
                    aria-label={`เพิ่มงานในเฟส ${ph.name}`}
                    title="เพิ่มงาน"
                    onClick={() => setAdding(pi)}
                    className="grid size-[26px] place-items-center rounded-lg bg-white/18 hover:bg-white/35 max-md:size-9"
                  >
                    <PlusIcon className="size-3.5" strokeWidth={2.4} />
                  </button>
                  <button
                    type="button"
                    aria-label={`แก้เฟส ${ph.name}`}
                    title="แก้เฟส"
                    onClick={() => setPhaseEdit(pi)}
                    className="grid size-[26px] place-items-center rounded-lg bg-white/18 hover:bg-white/35 max-md:size-9"
                  >
                    <PencilIcon className="size-3.5" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    aria-label={`ลบเฟส ${ph.name}`}
                    title="ลบเฟส"
                    onClick={() => setAsking({ phase: pi })}
                    className="grid size-[26px] place-items-center rounded-lg bg-white/18 hover:bg-white/35 max-md:size-9"
                  >
                    <TrashIcon className="size-3.5" strokeWidth={2} />
                  </button>
                  </>}
                </header>

                {base.length > 0 && (
                  <div className="px-3.5 pt-2.5">
                    {base.map((x) => (
                      <p
                        key={x}
                        className={`mt-[5px] text-[10.5px] leading-[1.5] first:mt-0 ${
                          ph.own ? "text-muted-foreground" : "font-semibold text-[var(--warning)]"
                        }`}
                      >
                        {x}
                      </p>
                    ))}
                  </div>
                )}

                <div
                  className={`scroll-stable flex min-h-0 flex-1 flex-col gap-[11px] overflow-y-auto px-3.5 pt-[11px] pb-3.5 max-md:gap-2 max-md:overflow-visible max-md:p-2.5 ${
                    over === pi ? "bg-primary/[.06]" : ""
                  }`}
                >
                  {list.map((t, ti) => (
                    <TaskCard
                      key={`${pi}-${ti}-${t.name}`}
                      task={t}
                      notes={cardNotes(t, pi)}
                      outside={Boolean(t.start && t.due && (t.start < ph.start || t.due > ph.end))}
                      order={ti + 1}
                      checked={Boolean(picked[key(pi, ti)])}
                      dragging={drag === key(pi, ti)}
                      onCheck={() => setPicked({ ...picked, [key(pi, ti)]: !picked[key(pi, ti)] })}
                      readOnly={ro}
                      onOpen={() => setOpen({ phase: pi, index: ti })}
                      onDelete={() => setAsking({ phase: pi, index: ti })}
                      onDragStart={() => setDrag(key(pi, ti))}
                      onDragOver={(e) => {
                        if (drag && Number(drag.split(":")[0]) === pi) {
                          e.preventDefault();
                          setOver(pi);
                        }
                      }}
                      onDrop={() => dropOn(pi, ti)}
                      onDragEnd={() => {
                        setDrag(null);
                        setOver(null);
                      }}
                    />
                  ))}
                  {!ro && <button
                    type="button"
                    onClick={() => setAdding(pi)}
                    className="mt-2 w-full flex-none rounded-[11px] border-[1.5px] border-dashed border-border p-[9px] text-[12px] font-semibold text-muted-foreground hover:border-primary hover:text-primary max-md:mt-0 max-md:h-[42px] max-md:rounded-[12px] max-md:py-0"
                  >
                    + เพิ่มงาน
                  </button>}
                </div>
              </section>
            );
          })}
          {!ro && <button
            type="button"
            onClick={() => setPhaseEdit(-1)}
            className="min-h-[120px] w-[236px] flex-none self-stretch rounded-[16px] border-[1.5px] border-dashed border-border py-4 text-[13.5px] font-semibold text-muted-foreground hover:border-primary hover:text-primary max-md:h-[50px] max-md:min-h-0 max-md:w-full max-md:py-0"
          >
            + เพิ่มเฟส
          </button>}
        </div>
        </>
      )}

      {asking && phases[asking.phase] && (
        <Sheet
          title={asking.index === undefined ? "ลบเฟส" : "ลบงาน"}
          onClose={() => setAsking(null)}
          footer={
            <>
              <button type="button" className="btn glass-thin" onClick={() => setAsking(null)}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="btn solid btn-solid"
                onClick={() => {
                  const a = asking;
                  edit((b) => {
                    if (a.index === undefined) {
                      b.phases.splice(a.phase, 1);
                      b.plan.splice(a.phase, 1);
                    } else {
                      b.plan[a.phase].splice(a.index, 1);
                    }
                  });
                  setPicked({});
                  setOpen(null);
                  setAsking(null);
                }}
              >
                ลบ
              </button>
            </>
          }
        >
          <p className="text-[13.5px]">
            {asking.index === undefined ? (
              <>
                ลบเฟส <b>{phases[asking.phase].name}</b>
                {(plan[asking.phase] ?? []).length ? ` และงานในเฟสนี้ ${plan[asking.phase].length} งาน` : ""} ใช่ไหม?
              </>
            ) : (
              <>
                ลบงาน <b>{plan[asking.phase]?.[asking.index]?.name}</b> ใช่ไหม?
              </>
            )}
          </p>
        </Sheet>
      )}

      {/* มือถือ: ปุ่มยืนยันแผนอยู่ท้ายหน้าต่อจากกระดาน เต็มความกว้าง (จอกว้างอยู่บนแถบบน) */}
      {!ro && <div className="pt-0.5 md:hidden">{confirmButton("pl-confirm-bottom")}</div>}

      {doc && docs && (
        <Sheet
          title={
            doc === "quo"
              ? `ใบเสนอราคา ${docs.quo}`
              : `Proposal รอบ ${docs.proposal?.round ?? ""}`
          }
          wide
          onClose={() => setDoc(null)}
          footer={
            <>
              <button
                type="button"
                className="btn glass-thin flex-1 justify-center sm:mr-auto sm:flex-none"
                onClick={() => setDoc(null)}
              >
                ปิด
              </button>
              {doc === "prop" && docs.proposal && <ProposalAction job={docs} />}
            </>
          }
        >
          {doc === "quo" ? <QuotationPreview job={docs} /> : <ProposalPreview job={docs} />}
        </Sheet>
      )}

      {renaming && (
        <RenameDialog
          project={{ pj: job.pj, name: job.name, cus: job.cus, scope: job.scope }}
          onClose={() => setRenaming(false)}
        />
      )}
      {addingDoc && <AddDocsDialog pj={job.pj} onClose={() => setAddingDoc(false)} />}

      {phaseEdit !== null && (
        <PhaseDialog
          firstDay={job.firstDay}
          phases={phases}
          index={phaseEdit}
          onClose={() => setPhaseEdit(null)}
          onSave={(v) => {
            edit((b) => {
              if (phaseEdit < 0) {
                b.phases.push({ ...v, own: true });
                b.plan.push([]);
                return;
              }
              const ph = b.phases[phaseEdit];
              /* เก็บค่าตามข้อเสนอไว้ครั้งแรกที่แก้ ของเดิมจะได้ไม่หาย */
              if (!ph.own && ph.baseStart === undefined) {
                ph.baseName = ph.name;
                ph.baseStart = ph.start;
                ph.baseEnd = ph.end;
              }
              ph.name = v.name;
              ph.start = v.start;
              ph.end = v.end;
            });
            setPhaseEdit(null);
          }}
        />
      )}

      {adding !== null && phases[adding] && (
        <AddTaskDialog
          phase={phases[adding]}
          pj={job?.pj}
          onClose={() => setAdding(null)}
          onSave={(t) => {
            edit((b) => {
              b.plan[adding].push(t);
            });
            setAdding(null);
          }}
        />
      )}

      {open && plan[open.phase]?.[open.index] && (
        <TaskDialog
          phase={phases[open.phase]}
          pj={job?.pj}
          color={phaseColor(open.phase)}
          spot={open}
          task={plan[open.phase][open.index]}
          count={plan[open.phase].length}
          onClose={() => setOpen(null)}
          onEdit={(fn) =>
            edit((b) => {
              fn(b.plan[open.phase][open.index]);
            })
          }
        />
      )}
    </div>
  );
}

function PageBar() {
  return (
    /* ชื่อหน้าชิดซ้าย ปุ่มชิดขวา · มือถือคงเดิม (ผู้ใช้สั่ง 12 ต.ค. 2569) */
    <div className="bar max-md:justify-end!">
      <h1 className="page-h1">จัดคิวงาน</h1>
      <div className="tools">
        <Link href="/pm/projects" className="btn glass-thin">
          ไปหน้าโปรเจค
        </Link>
      </div>
    </div>
  );
}

/**
 * บรรทัดบอกส่วนต่างจากข้อเสนอใต้หัวเฟส
 * เฟสที่ PM สร้างเองไม่มีค่าเทียบ บอกแค่ว่าเพิ่มเอง
 */
/* ไม่เทียบกับข้อเสนอแล้ว — PM กำหนดเฟสเอง (ผู้ใช้สั่ง 8 ต.ค. 2569) */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function baseLines(_ph: PlanPhase): string[] {
  return [];
}

// ─── เพิ่ม / แก้เฟส ──────────────────────────────────────────────

function PhaseDialog({
  firstDay,
  phases,
  index,
  onClose,
  onSave,
}: {
  firstDay: string;
  phases: PlanPhase[];
  index: number;
  onClose: () => void;
  onSave: (v: { name: string; start: string; end: string }) => void;
}) {
  const isNew = index < 0;
  const ph = isNew ? undefined : phases[index];
  const last = phases[phases.length - 1];
  const first = firstDay;
  const [name, setName] = useState(ph?.name ?? "");
  const [start, setStart] = useState(ph?.start ?? (last ? addDays(last.end, 1) : first));
  const [end, setEnd] = useState(ph?.end ?? (last ? addDays(last.end, 7) : addDays(first, 6)));
  const [pick, setPick] = useState<"s" | "e" | null>(null);
  const [warn, setWarn] = useState(false);

  const ok = Boolean(name.trim() && start && end && end >= start);

  return (
    <Sheet
      title={isNew ? "เพิ่มเฟส" : "แก้เฟส"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid"
            onClick={() => (ok ? onSave({ name: name.trim(), start, end }) : setWarn(true))}
          >
            บันทึก
          </button>
        </>
      }
    >
      <Field label="ชื่อเฟส" required>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น พัฒนาระบบหลังบ้าน"
          className={`field-control ${warn && !name.trim() ? "!border-destructive" : ""}`}
        />
      </Field>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="วันเริ่ม" required>
          <ThaiDatePicker
            value={start}
            open={pick === "s"}
            label="วันเริ่มเฟส"
            invalid={warn && (!start || (Boolean(end) && end < start))}
            onToggle={() => setPick((p) => (p === "s" ? null : "s"))}
            onPick={(iso) => {
              setStart(iso);
              if (end && end < iso) setEnd(iso);
              setPick(null);
            }}
          />
        </Field>
        <Field label="วันสิ้นสุด" required>
          <ThaiDatePicker
            value={end}
            min={start || undefined}
            open={pick === "e"}
            label="วันสิ้นสุดเฟส"
            invalid={warn && (!end || (Boolean(start) && end < start))}
            onToggle={() => setPick((p) => (p === "e" ? null : "e"))}
            onPick={(iso) => {
              setEnd(iso);
              setPick(null);
            }}
          />
        </Field>
      </div>
      {/* ไม่มีกล่องเตือนแยก — ช่องที่ยังไม่ครบขึ้นขอบแดงแทน (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
    </Sheet>
  );
}

// ─── เพิ่มงานในเฟส ───────────────────────────────────────────────

function AddTaskDialog({
  phase,
  pj,
  onClose,
  onSave,
}: {
  phase: PlanPhase;
  pj?: string;
  onClose: () => void;
  onSave: (t: Draft) => void;
}) {
  const team = useMarketingTeam();
  const [name, setName] = useState("");
  const [role, setRole] = useState<TeamRole | "">(phase.role ?? "");
  const [who, setWho] = useState("");
  const addRole = useAddOption({ catalog: "teamRoles" }, (v) => {
    setRole(v);
    setWho("");
  });
  const [start, setStart] = useState(phase.start);
  const [due, setDue] = useState(phase.end);
  const [brief, setBrief] = useState("");
  const [pick, setPick] = useState<"s" | "e" | null>(null);
  const [warn, setWarn] = useState(false);
  /* เลือกคนได้อิสระทุกคนในทีม ไม่กรองตามตำแหน่งของเฟส · บอกตำแหน่งท้ายชื่อเหมือนหน้าต่างงาน (ผู้ใช้สั่ง 27 ต.ค. 2569) */
  const hr = useHr();
  const people = team;
  /* ลาของแต่ละคนที่ทับช่วงงาน — บอกท้ายชื่อในรายการ และเตือนใต้ช่องเมื่อเลือกคนนั้น (ตามต้นแบบ) */
  const clashOf = useLeaveClash();
  const whoClash = who ? clashOf(who, start, due) : [];
  const busyOf = useBusyOf(pj);
  const ok = Boolean(name.trim() && start && due && due >= start);

  return (
    <Sheet
      title="เพิ่มงาน"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid"
            onClick={() =>
              ok
                ? onSave({
                    name: name.trim(),
                    role: role || undefined,
                    whos: who ? [who] : [],
                    start,
                    due,
                    brief: brief.trim() || undefined,
                  })
                : setWarn(true)
            }
          >
            เพิ่มงาน
          </button>
        </>
      }
    >
      <p className="mb-4 text-[12.5px] text-muted-foreground">
        เฟส {phase.name} · {thaiDate(phase.start)} – {thaiDate(phase.end)}
      </p>
      <Field label="ชื่องาน" required>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น ทำระบบรับเข้าสินค้า"
          className={`field-control ${warn && !name.trim() ? "!border-destructive" : ""}`}
        />
      </Field>
      <div className="grid gap-x-4">
        {/* ไม่มีตำแหน่งในทีม — เลือกผู้รับผิดชอบจากพนักงานได้เลย (ผู้ใช้สั่ง 12 ต.ค. 2569) */}
        <Field label="ผู้รับผิดชอบ">
          <select value={who} onChange={(e) => setWho(e.target.value)} className="field-control cursor-pointer">
            <option value="">ยังไม่มอบหมาย</option>
            {people.map((m) => {
              const c = clashOf(m.id, start, due);
              const emp = hr.emp.find((e) => e.id === m.id);
              const busy = busyOf(m.id, start, due).length;
              return (
                <option key={m.id} value={m.id} style={busyStyle(busy)}>
                  {whoLabel(m, emp?.pos)}
                  {busyTag(busy)}
                  {c.length ? ` — ${leaveText(c[0])}` : ""}
                </option>
              );
            })}
          </select>
          {whoClash.length > 0 && (
            <p className="mt-1.5 text-[12.5px] font-semibold text-destructive">
              คนนี้{whoClash.map(leaveText).join(" และ ")} อยู่ในช่วงงานนี้
            </p>
          )}
          <BusyList list={who ? busyOf(who, start, due) : []} />
        </Field>
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="วันเริ่ม" required>
          <ThaiDatePicker
            value={start}
            min={phase.start}
            max={phase.end}
            open={pick === "s"}
            label="วันเริ่มงาน"
            invalid={warn && (!start || (Boolean(due) && due < start))}
            onToggle={() => setPick((p) => (p === "s" ? null : "s"))}
            onPick={(iso) => {
              setStart(iso);
              if (due && due < iso) setDue(iso);
              setPick(null);
            }}
          />
        </Field>
        <Field label="กำหนดส่ง" required>
          <ThaiDatePicker
            value={due}
            min={start || phase.start}
            max={phase.end}
            open={pick === "e"}
            label="กำหนดส่งงาน"
            invalid={warn && (!due || (Boolean(start) && due < start))}
            onToggle={() => setPick((p) => (p === "e" ? null : "e"))}
            onPick={(iso) => {
              setDue(iso);
              setPick(null);
            }}
          />
        </Field>
      </div>
      {/* โจทย์เขียนตั้งแต่ตอนเพิ่มงานได้เลย แนบไฟล์เพิ่มทีหลังในการ์ดงาน */}
      <Field label="รายละเอียดงาน (โจทย์)">
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="บอกให้ชัดว่าต้องทำอะไร ส่งอะไร คนทำจะเห็นข้อความนี้ในหน้างานที่ได้รับ"
          className="field-control h-[86px] resize-y py-2.5 leading-relaxed"
        />
      </Field>
    </Sheet>
  );
}

/*
 * ปุ่มท้ายของเอกสาร Proposal — ข้อเสนอเป็นลิงก์ Canva ก็เปิดลิงก์ เป็น PDF ก็พิมพ์ออกมา
 * ข้อเสนอที่ไม่มีลิงก์แนบมา ปุ่มปิดไว้พร้อมบอกเหตุผล ไม่ใช่กดแล้วไม่เกิดอะไร
 */
function ProposalAction({ job }: { job: InboxJob }) {
  const pr = job.proposal;
  if (!pr) return null;
  if (pr.kind === "canva") {
    return pr.url ? (
      <a
        href={pr.url}
        target="_blank"
        rel="noreferrer"
        className="btn solid btn-solid flex-1 justify-center sm:flex-none"
      >
        เปิดใน Canva
      </a>
    ) : (
      <button
        type="button"
        disabled
        title="ข้อเสนอนี้ยังไม่มีลิงก์ Canva แนบมา"
        className="btn solid btn-solid flex-1 justify-center disabled:opacity-45 sm:flex-none"
      >
        เปิดใน Canva
      </button>
    );
  }
  return (
    <button
      type="button"
      className="btn solid btn-solid flex-1 justify-center sm:flex-none"
      onClick={printDoc}
      title="เปิดหน้าต่างพิมพ์ แล้วเลือกบันทึกเป็น PDF"
    >
      ดาวน์โหลด PDF
    </button>
  );
}

/* พิมพ์เฉพาะแผ่นเอกสารในกล่อง ไม่เอาหน้าเว็บด้านหลังติดไปด้วย (ดู .print-doc ใน globals.css) */
function printDoc() {
  document.body.classList.add("print-doc");
  window.print();
  window.setTimeout(() => document.body.classList.remove("print-doc"), 400);
}

/* งานที่คนนี้ถืออยู่และวันทับช่วงของงานที่กำลังมอบ — บอกจำนวนในดรอปดาวน์ และรายการใต้ช่องเมื่อเลือกแล้ว (ผู้ใช้สั่ง 29 ต.ค. 2569)
   ไม่นับงานที่เสร็จแล้ว โปรเจคที่ยกเลิก และตัวงานที่กำลังแก้อยู่เอง */
type Busy = { name: string; where: string; start: string; due: string };
function useBusyOf(pj?: string) {
  const pm = usePm();
  return useCallback(
    (id: string, start: string, due: string, self?: string): Busy[] => {
      if (!id || !start || !due) return [];
      return taskHomes(pm)
        .filter((p) => p.status !== "cancelled")
        .flatMap((p) =>
          p.tasks
            .filter(
              (t) =>
                t.status !== "done" &&
                t.whos.includes(id) &&
                Boolean(t.start && t.due) &&
                t.start <= due &&
                t.due >= start &&
                !(pj && isRef(p, pj) && t.name === self),
            )
            .map((t) => ({ name: t.name, where: p.name || p.cus, start: t.start, due: t.due })),
        )
        .sort((a, b) => a.start.localeCompare(b.start));
    },
    [pm, pj],
  );
}

/* สถานะงานชน: 1–2 งาน เหลือง · 3 งานขึ้นไป แดง (ผู้ใช้สั่ง 29 ต.ค. 2569) */
function busyTag(n: number) {
  return n ? `  ${n >= 3 ? "🔴" : "🟡"} ${n} งาน` : "";
}
function busyStyle(n: number): React.CSSProperties | undefined {
  return n ? { color: n >= 3 ? "var(--destructive)" : "var(--warning)" } : undefined;
}

function BusyList({ list }: { list: Busy[] }) {
  if (!list.length) return null;
  return (
    <div className="mt-1.5 text-[12px]">
      <p className="font-semibold" style={busyStyle(list.length)}>
        {list.length >= 3 ? "🔴" : "🟡"} ถืองานช่วงนี้อยู่ {list.length} งาน
      </p>
      <ul className="mt-1 space-y-0.5 text-muted-foreground">
        {list.map((b, i) => (
          <li key={i}>
            {b.name} · {b.where} · {thaiDate(b.start)} – {thaiDate(b.due)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* คนที่ PM มอบงานได้ = ตำแหน่งในแผนก marketing เท่านั้น ไม่รวมคนที่พ้นสภาพ (ผู้ใช้สั่ง 29 ต.ค. 2569) */
function useMarketingTeam() {
  const hr = useHr();
  return useTeam().filter((m) => {
    const emp = hr.emp.find((e) => e.id === m.id);
    return !m.left && Boolean(emp) && hrPos(emp!.pos).dept === "marketing";
  });
}

/* ตัวเลือกผู้รับผิดชอบ = "ตำแหน่งเต็ม (ชื่อ)" เช่น System Analysis (นุ่น) — ตำแหน่งย่อเขียนเต็มเฉพาะในดรอปดาวน์นี้ (ผู้ใช้สั่ง 29 ต.ค. 2569) */
const POS_FULL: Record<string, string> = {
  SA: "System Analysis",
  PM: "Project Manager",
  GM: "General Manager",
  BD: "Business Development",
  Dev: "Developer",
};
function whoLabel(m: Member, pos?: PosKey) {
  const label = pos ? hrPos(pos).label : m.roles.map(roleLabel).join(" | ");
  return `${POS_FULL[label] ?? label} (${m.name})`;
}

// ─── ตัวเลือกผู้รับผิดชอบในแถบมอบหมายพร้อมกัน ────────────────────────

/*
 * ทำเองแทน <select> เพราะต้องเห็นทั้งชื่อและตำแหน่งงานสองบรรทัด
 * ช่องเลือกของเบราว์เซอร์แสดงได้บรรทัดเดียว ชื่อยาวกับตำแหน่งจึงถูกตัดจนอ่านไม่ออก
 */
/*
 * เลือกคนที่จะมอบหมายพร้อมกัน — ดรอปดาวน์ธรรมดา ชื่อ · ตำแหน่งตามทะเบียน HR (ผู้ใช้สั่ง 8 ต.ค. 2569)
 * เดิมเป็นรายการลอยที่ถูกกล่องแถบมอบหมายตัดทิ้ง กดแล้วไม่เห็นรายชื่อ
 */
function WhoPicker({
  team,
  value,
  onChange,
}: {
  team: Member[];
  value: string;
  onChange: (id: string) => void;
}) {
  const hr = useHr();
  return (
    <PlainSelect value={value} label="มอบหมายให้" onChange={onChange} className="min-w-0 flex-1">
      <option value="">— เลือกผู้รับผิดชอบ —</option>
      {team.map((m) => {
        const emp = hr.emp.find((e) => e.id === m.id);
        return (
          <option key={m.id} value={m.id}>
            {whoLabel(m, emp?.pos)}
          </option>
        );
      })}
    </PlainSelect>
  );
}

/*
 * ดรอปดาวน์ธรรมดา ลูกศรห่างขอบ และกลับหัวเป็น ^ ตอนกางรายการ (ผู้ใช้สั่ง 8 ต.ค. 2569)
 * select ของเบราว์เซอร์บอกไม่ได้ว่ากางอยู่ไหม — นับจากการกด/เลือก/ออกจากช่องแทน
 */
function PlainSelect({
  value,
  label,
  onChange,
  className = "",
  children,
}: {
  value: string;
  label: string;
  onChange: (v: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`relative block ${className}`}>
      <select
        value={value}
        aria-label={label}
        onMouseDown={() => setOpen((o) => !o)}
        onChange={(e) => {
          setOpen(false);
          onChange(e.target.value);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape" || e.key === "Enter" || e.key === "Tab") setOpen(false);
        }}
        className="field-control cursor-pointer appearance-none"
        style={{ paddingRight: 40 }}
      >
        {children}
      </select>
      <ChevronDownIcon
        className={`pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        style={{ right: 14 }}
        strokeWidth={2.4}
      />
    </span>
  );
}

// ─── การ์ดงานย่อยบนกระดาน ────────────────────────────────────────

/* วันบนการ์ดตัดปีออก เพราะอยู่ในกรอบเฟสเดียวกันอยู่แล้ว */
const short = (iso: string) => thaiDate(iso).replace(/\s\d{4}$/, "");

/*
 * การ์ดบอกแค่ชื่องาน คน และวันที่ (ผู้ใช้สั่ง 21 ต.ค. 2569)
 * บรรทัดอื่นขึ้นเฉพาะข้อยกเว้น (notes) และคำเตือนเดิม (ลาทับช่วงงาน · นอกกรอบเฟส)
 */
function TaskCard({
  task,
  notes,
  outside,
  order,
  checked,
  dragging,
  onCheck,
  onOpen,
  onDelete,
  readOnly = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  task: Draft;
  /** บรรทัดข้อยกเว้น — การตรวจที่ไม่ใช่ค่าตั้งต้น · งานต่อกันเดิมที่ต่างจากแม่แบบ */
  notes: string[];
  /** วันของงานเลยกรอบเฟส */
  outside: boolean;
  order: number;
  checked: boolean;
  dragging: boolean;
  onCheck: () => void;
  onOpen: () => void;
  onDelete: () => void;
  readOnly?: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const ready = task.whos.length > 0 && Boolean(task.start) && Boolean(task.due);
  const first = task.whos[0] ? (memberOf(task.whos[0])?.name ?? task.whos[0]) : "";
  /* มอบงานในช่วงที่ผู้รับผิดชอบลา (อนุมัติแล้วหรือรออนุมัติ) — เตือนบนการ์ดเลย ไม่ต้องเปิดดูทีละใบ */
  const clashOf = useLeaveClash();
  const clash = task.whos.flatMap((id) =>
    clashOf(id, task.start, task.due).map((l) => `${(memberOf(id)?.name ?? id).split(" ")[0]} ${leaveText(l)}`),
  );
  return (
    <article
      draggable={!readOnly}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.name);
        onDragStart();
      }}
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      className={`relative flex flex-none cursor-grab items-stretch overflow-hidden rounded-[11px] border bg-card shadow-[0_1px_2px_rgba(31,36,48,.06),0_3px_8px_-4px_rgba(31,36,48,.16)] transition-colors hover:border-primary active:cursor-grabbing max-md:rounded-[14px] max-md:shadow-none ${
        checked ? "border-primary ring-2 ring-primary/16" : "border-[#D8DDE6] max-md:border-[#F0E6E8]"
      } ${ready ? "border-l-4 border-l-[var(--success)]" : ""} ${dragging ? "opacity-45" : ""}`}
    >
      {/* ซ้ายคือแถบเลือกงาน ขวาคือพื้นที่เปิดรายละเอียด แยกกันชัดเจน */}
      {!readOnly && <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={`เลือกงาน ${task.name}`}
        onClick={onCheck}
        className={`group grid w-11 flex-none place-items-center border-r border-border hover:bg-accent ${
          checked ? "bg-accent" : ""
        }`}
      >
        <span
          className={`grid size-5 place-items-center rounded-[6px] border-[1.6px] ${
            checked
              ? "border-primary bg-primary text-white"
              : "border-border bg-card text-transparent group-hover:border-primary"
          }`}
        >
          <CheckIcon className="size-3" strokeWidth={3.2} />
        </span>
      </button>}
      <div
        role="button"
        tabIndex={0}
        onClick={readOnly ? undefined : onOpen}
        onKeyDown={(e) => {
          if (!readOnly && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onOpen();
          }
        }}
        className={`min-w-0 flex-1 cursor-pointer p-[11px] ${readOnly ? "" : "pr-8"}`}
      >
        <div className="flex items-start gap-2">
          <span className="num grid size-[19px] flex-none place-items-center rounded-[6px] bg-muted text-[10.5px] font-bold text-muted-foreground">
            {order}
          </span>
          <span className="block min-w-0 flex-1 truncate text-[12.5px] leading-[1.5] font-semibold max-md:overflow-visible max-md:text-[13.5px] max-md:whitespace-normal" title={task.name}>
            {task.name}
          </span>
        </div>
        <div className="mt-[9px] flex flex-col gap-1.5">
          <MetaRow icon={<UserIcon className="size-[13px]" />} none={!task.whos.length}>
            <span title={task.whos.map((id) => memberOf(id)?.name ?? id).join(", ")}>
              {task.whos.length
                ? `${first}${task.whos.length > 1 ? ` +${task.whos.length - 1}` : ""}`
                : "ยังไม่มอบหมาย"}
            </span>
          </MetaRow>
          <MetaRow
            icon={<CalendarIcon className="size-[13px]" />}
            none={!task.start || !task.due}
            bad={outside}
          >
            {task.start && task.due ? `${short(task.start)} – ${short(task.due)}` : "ยังไม่กำหนด"}
            {outside && " · นอกกรอบเฟส"}
          </MetaRow>
          {/* ไม่มีบรรทัดรายละเอียด/ไฟล์ "รอ…/เริ่มได้ทันที" และผู้ตรวจประจำการ์ดแล้ว — ขึ้นเฉพาะที่ต่างจากค่าตั้งต้น (ผู้ใช้สั่ง 21 ต.ค. 2569) */}
          {notes.map((n) => (
            <MetaRow key={n} icon={n.startsWith("รอ ") ? <LinkIcon className="size-[13px]" /> : <CheckIcon className="size-[13px]" />}>
              <span title={n}>{n}</span>
            </MetaRow>
          ))}
          {clash.length > 0 && (
            <span
              title="มอบงานในช่วงที่ผู้รับผิดชอบลา"
              className="block truncate text-[11.5px] leading-4 font-semibold text-destructive"
            >
              ⚠ {clash.join(" · ")}
            </span>
          )}
        </div>
      </div>
      {/* ลบงานใบนี้ — มุมขวาล่างของการ์ด (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
      {!readOnly && (
        <button
          type="button"
          aria-label={`ลบงาน ${task.name}`}
          title="ลบงาน"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-[var(--destructive-soft)] hover:text-destructive"
          style={{ right: 6, bottom: 6 }}
        >
          <TrashIcon className="size-3.5" />
        </button>
      )}
    </article>
  );
}

/** บรรทัดข้อมูลบนการ์ด — ทุกใบสูงเท่ากัน ไม่ว่าจะมอบหมายแล้วหรือยัง จะได้กวาดตาเทียบกันได้ */
function MetaRow({
  icon,
  none,
  bad,
  children,
}: {
  icon: React.ReactNode;
  none?: boolean;
  bad?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`flex min-h-4 items-center gap-[7px] truncate text-[11.5px] leading-4 ${
        bad ? "font-semibold text-destructive" : none ? "text-muted-foreground/70" : "text-muted-foreground"
      }`}
    >
      <span className="flex-none opacity-75">{icon}</span>
      <span className="truncate">{children}</span>
    </span>
  );
}

/** ป้ายบน ค่าล่าง — ข้อมูลกรอบเวลาบนแถบเอกสาร */
function LockLine({
  label,
  value,
  mobile,
}: {
  label: string;
  value: string;
  /** ข้อความบนมือถือที่ไม่มีหัวข้อกำกับ เช่น "4 เฟส" — ไม่ส่งมาใช้ value */
  mobile?: string;
}) {
  return (
    <span className="flex flex-col gap-[3px] leading-[1.45] max-md:gap-0">
      <em className="text-[11px] whitespace-nowrap text-muted-foreground not-italic max-md:hidden">{label}</em>
      <b className="num font-semibold whitespace-nowrap max-md:text-[12.5px] max-md:font-bold max-md:text-[#8A1B2A]">
        {mobile ? (
          <>
            <span className="max-md:hidden">{value}</span>
            <span className="md:hidden">{mobile}</span>
          </>
        ) : (
          value
        )}
      </b>
    </span>
  );
}

// ─── การ์ดรายละเอียดงานย่อย ──────────────────────────────────────

/*
 * หน้าต่างนี้ใช้แก้ข้อยกเว้น ไม่ใช่ฟอร์มให้กรอกทุกช่อง — ระบบเติมคน วัน และรายละเอียดไว้ก่อน (ผู้ใช้สั่ง 21 ต.ค. 2569)
 * ท้ายกล่องบอกสถานะพร้อมปุ่มบันทึก
 * ตำแหน่งของงานใช้เตือนเวลาเลือกคนข้ามสาย — งานไม่มีตำแหน่งใช้ของเฟส ไม่มีทั้งคู่ก็ไม่เตือน
 */
function TaskDialog({
  phase,
  pj,
  color,
  spot,
  task,
  count,
  onClose,
  onEdit,
}: {
  phase: PlanPhase;
  pj?: string;
  color: string;
  spot: Spot;
  task: Draft;
  count: number;
  onClose: () => void;
  onEdit: (fn: (t: Draft) => void) => void;
}) {
  const team = useMarketingTeam();
  const hr = useHr();
  /* วันลาของทีม — อนุมัติแล้ว (ใบลาจริง + ทะเบียนฝ่ายบุคคล) และใบที่ยื่นไว้รออนุมัติ (ต้นแบบ PM_LEAVE_PENDING) */
  const clashOf = useLeaveClash();
  const leaveIn = (id: string) => clashOf(id, task.start, task.due).map(leaveText).join(" · ");
  const busyOf = useBusyOf(pj);
  const [pick, setPick] = useState<"s" | "e" | null>(null);
  const role = task.role ?? phase.role;
  const fits = (m: Member) => !role || m.roles.includes(role);
  const offFit = task.whos.filter((id) => {
    const m = memberOf(id);
    return m && !fits(m);
  }).length;
  const onLeave = task.whos.filter((id) => leaveIn(id)).length;

  const ready = task.whos.length > 0 && Boolean(task.start) && Boolean(task.due);

  return (
    <Sheet
      title={task.name}
      mid
      onClose={onClose}
      footer={
        <>
          <span
            className={`mr-auto self-center text-[12.5px] font-semibold ${
              ready ? "text-[var(--success)]" : "text-destructive"
            }`}
          >
            {ready ? "พร้อมมอบหมาย" : !task.whos.length ? "ยังไม่มีผู้รับผิดชอบ" : "ยังไม่ได้กำหนดวัน"}
          </span>
          {/* ทุกช่องบันทึกตั้งแต่ตอนแก้ ปุ่มนี้แค่ปิดหน้าต่าง — ใช้คำว่า "บันทึก" ตามที่เจ้าของสั่ง (ผู้ใช้สั่ง 21 ต.ค. 2569) */}
          <button type="button" className="btn solid btn-solid" onClick={onClose}>
            <CheckIcon className="size-[14px]" strokeWidth={2.3} />
            บันทึก
          </button>
        </>
      }
    >
      <div onClick={() => setPick(null)}>
        {/* ── ผู้รับผิดชอบ 65% · ระยะเวลา 35% แถวเดียวกัน (ผู้ใช้สั่ง 8 ต.ค. 2569) ── */}
        {/* ช่องวันกว้างเท่าที่ต้องใช้และอยู่บรรทัดเดียวเสมอ ผู้รับผิดชอบใช้พื้นที่ที่เหลือ */}
        <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <section className="min-w-0">
            <h3 className="text-xs font-bold text-muted-foreground">ผู้รับผิดชอบ</h3>
            <PlainSelect
              value={task.whos[0] ?? ""}
              label="ผู้รับผิดชอบ"
              className="mt-2"
              onChange={(id) =>
                onEdit((t) => {
                  t.whos = id ? [id] : [];
                  t.autoFill = unflag(t.autoFill, "who");
                })
              }
            >
              <option value="">— เลือกผู้รับผิดชอบ —</option>
              {/* ชื่อกับตำแหน่งตามทะเบียนพนักงานฝ่ายบุคคล ไม่มีวันลา (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
              {team.map((m) => {
                const emp = hr.emp.find((e) => e.id === m.id);
                const busy = busyOf(m.id, task.start, task.due, task.name).length;
                return (
                  <option key={m.id} value={m.id} style={busyStyle(busy)}>
                    {whoLabel(m, emp?.pos)}
                    {busyTag(busy)}
                  </option>
                );
              })}
            </PlainSelect>
            <BusyList list={task.whos[0] ? busyOf(task.whos[0], task.start, task.due, task.name) : []} />
            {offFit > 0 && (
              <p className="mt-1.5 text-[11.5px] font-semibold text-destructive">
                มี {offFit} คนที่ไม่ได้อยู่ตำแหน่ง “{role ? roleLabel(role) : ""}”
              </p>
            )}
            {onLeave > 0 && (
              /* ยังมอบหมายได้ แต่ให้รู้ก่อนว่างานจะช้าเพราะคนลา */
              <p className="mt-1.5 text-[11.5px] font-semibold text-[var(--warning)]">
                มี {onLeave} คนลาในช่วงวันของงานนี้
              </p>
            )}
          </section>

          <section className="min-w-0">
            <h3 className="text-xs font-bold text-muted-foreground">
              ระยะเวลา
              {task.start && task.due ? <span className="num font-semibold"> · {daysBetween(task.start, task.due) + 1} วัน</span> : null}
            </h3>
            <div className="mt-2 flex flex-nowrap items-center gap-1.5 whitespace-nowrap">
              <ThaiDatePicker
                variant="chip"
                value={task.start}
                min={phase.start}
                max={phase.end}
                open={pick === "s"}
                label="วันเริ่มงาน"
                placeholder="วันเริ่ม"
                onToggle={() => setPick((p) => (p === "s" ? null : "s"))}
                onPick={(iso) => {
                  onEdit((t) => {
                    t.start = iso;
                    if (t.due && t.due < iso) t.due = iso;
                    t.autoFill = unflag(t.autoFill, "dates");
                  });
                  setPick(null);
                }}
              />
              <span className="text-muted-foreground">–</span>
              <ThaiDatePicker
                variant="chip"
                value={task.due}
                min={phase.start}
                max={phase.end}
                open={pick === "e"}
                label="วันส่งงาน"
                placeholder="วันส่ง"
                onToggle={() => setPick((p) => (p === "e" ? null : "e"))}
                onPick={(iso) => {
                  onEdit((t) => {
                    t.due = iso;
                    if (t.start && t.start > iso) t.start = iso;
                    t.autoFill = unflag(t.autoFill, "dates");
                  });
                  setPick(null);
                }}
              />
            </div>
          </section>
        </div>

        {/* ── โจทย์ที่ส่งให้คนทำ ──
            คนทำเห็นแค่ชื่องานกับกำหนดส่งไม่พอ ต้องได้โจทย์และไฟล์ประกอบไปด้วย
            ไม่งั้นต้องเดินมาถาม PM ทุกใบ (ผู้ใช้กำหนด 23 ก.ย. 2569) */}
        <section className="mt-5">
          <h3 className="text-xs font-bold text-muted-foreground">รายละเอียดงาน (โจทย์)</h3>
          <textarea
            value={task.brief ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onEdit((t) => {
                t.brief = v;
                t.autoFill = unflag(t.autoFill, "brief");
              });
            }}
            placeholder="บอกให้ชัดว่าต้องทำอะไร ส่งอะไร และมีอะไรที่ต้องระวัง"
            aria-label="รายละเอียดงาน"
            className="field-control resize-y py-2.5 leading-relaxed text-muted-foreground/70 placeholder:text-muted-foreground/35"
            /* .field-control ล็อกความสูงไว้ — ต้องกำหนดผ่าน style ถึงจะสูงจริง */
            style={{ height: 160 }}
          />
        </section>

        {/* ไม่มีส่วนการตรวจงานในหน้าต่างงานแล้ว — ผู้ตรวจคือผู้สั่งเสมอ ไม่ต้องตั้งอะไร (ผู้ใช้สั่ง 27 ต.ค. 2569) */}
      </div>
    </Sheet>
  );
}

/** ไฟล์ที่เพิ่งเลือกจากเครื่อง → รายการไฟล์ของงาน (ยังไม่มีที่เก็บไฟล์จริง เก็บแค่ชื่อกับขนาด) */
function pickedFiles(list: FileList | null): TaskFile[] {
  if (!list) return [];
  const at = todayIso();
  return Array.from(list).map((f) => ({
    n: f.name,
    k: fileKind(f.name),
    sz: fileSize(f.size),
    at,
    by: "PM",
  }));
}

/** แถวคนหนึ่งคน — ชื่อ ตำแหน่ง และงานที่ถืออยู่ ใช้ทั้งในรายการที่เลือกแล้วและรายชื่อทีม */
function PersonRow({
  member,
  fits,
  on,
  leave = "",
  children,
}: {
  member: Member;
  fits: boolean;
  on?: boolean;
  /** ลาที่ทับช่วงวันของงาน (อนุมัติแล้วหรือรออนุมัติ) เป็นข้อความพร้อมแสดง */
  leave?: string;
  children?: React.ReactNode;
}) {
  /* งานที่ถืออยู่ต้องนับจากโปรเจคจริง — ตัวเลข load ในทะเบียนเป็นค่าคงที่ คนที่เข้าทีมใหม่ติดอยู่ที่ 0 ตลอด */
  const projects = usePm().projects;
  return (
    <span
      className={`flex w-full items-center gap-[13px] rounded-[14px] border px-3.5 py-[11px] ${
        on ? "border-primary bg-accent" : "border-border bg-white hover:border-primary"
      }`}
    >
      <span className="grid size-11 flex-none place-items-center rounded-full bg-accent text-sm font-bold text-primary">
        {initialOf(member.name)}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[14.5px] font-bold">{member.name}</b>
        {/* คนที่ไม่ได้อยู่ตำแหน่งของเฟสนี้ขึ้นแดง ยังเลือกได้แต่ให้รู้ตัวว่ากำลังเลือกข้ามตำแหน่ง */}
        <span
          className={`mt-0.5 block truncate text-[11.5px] ${fits ? "text-muted-foreground" : "text-destructive"}`}
        >
          {member.roles.map(roleLabel).join(" | ")}
        </span>
      </span>
      {leave && (
        <span
          title={leave}
          className="num max-w-[190px] flex-none truncate rounded-[20px] bg-[var(--warning-soft)] px-[9px] py-[3px] text-[11px] font-semibold text-[var(--warning)]"
        >
          {leave}
        </span>
      )}
      <span className="num flex-none rounded-[20px] bg-muted px-[9px] py-[3px] text-[11px] font-semibold text-muted-foreground">
        {openTaskCount(projects, member.id)} งาน
      </span>
      {children}
    </span>
  );
}


// ─── ตัวช่วยของหน้านี้ ────────────────────────────────────────────

/** ช่วงลาหนึ่งช่วงของคนในทีม — pending = ใบที่ยื่นไว้แต่ยังไม่อนุมัติ */
/* hours = ชั่วโมงลาของวันที่ลาไม่เต็มวัน · ไม่มีค่า = ลาเต็มวัน (ผู้ใช้สั่ง 19 ต.ค. 2569) */
type TeamLeave = { from: string; to: string; type: string; pending: boolean; hours?: number };

const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "ลากิจ 11 ก.ย. (รออนุมัติ)" · หลายวัน "ลาพักร้อน 21–25 ก.ย." (ต้นแบบ leaveText) */
function leaveText(l: TeamLeave) {
  const [, m1, d1] = l.from.split("-").map(Number);
  const [, m2, d2] = l.to.split("-").map(Number);
  const rng =
    l.from === l.to
      ? `${d1} ${TH_MON[m1 - 1]}`
      : m1 === m2
        ? `${d1}–${d2} ${TH_MON[m1 - 1]}`
        : `${d1} ${TH_MON[m1 - 1]} – ${d2} ${TH_MON[m2 - 1]}`;
  return `${l.type} ${rng}${l.hours != null ? ` ${fmtLeaveHours(l.hours)}` : ""}${l.pending ? " (รออนุมัติ)" : ""}`;
}

/*
 * วันลาของทีม: ลาที่อนุมัติแล้วจากฝ่ายบุคคล และใบลาที่ยื่นไว้รออนุมัติ (ต้นแบบ PM_LEAVE_TIME + PM_LEAVE_PENDING)
 *   อนุมัติแล้ว — useHrTime (ทะเบียน + ใบลาจริงของบทบาทที่ล็อกอินได้) รวมวันติดกันเป็นช่วงเดียว
 *   รออนุมัติ — ใบของบทบาทใน leave-store และคำขอของทีมงานใน emp-requests
 *   คำขอของทีมงานที่อนุมัติแล้วยังไม่ไหลเข้าทะเบียน จึงนับจาก emp-requests ด้วย
 * คืนฟังก์ชันหาลาที่ทับช่วงงาน — งานที่ยังไม่กำหนดวันไม่เตือน
 */
function useLeaveClash() {
  const time = useHrTime();
  const extra = useEmpRequests();
  const byRole = useAllLeave();
  return useCallback(
    (id: string, start: string, due: string): TeamLeave[] => {
      if (!start || !due) return [];
      const out: TeamLeave[] = [];
      const days = [...(time[id]?.leave ?? [])].sort((a, b) => a.d.localeCompare(b.d));
      for (const l of days) {
        const type = HR_LEAVE_LABEL[l.type as keyof typeof HR_LEAVE_LABEL] ?? "ลา";
        const last = out[out.length - 1];
        const partial = l.span === "half";
        if (!partial && last && last.hours == null && last.type === type && addDays(last.to, 1) === l.d) last.to = l.d;
        else out.push({ from: l.d, to: l.d, type, pending: false, ...(partial ? { hours: leaveRowHours(l) } : {}) });
      }
      for (const r of extra) {
        if (r.emp !== id || r.kind !== "leave" || r.status === "rejected" || !r.from) continue;
        out.push({ from: r.from, to: r.toDate || r.from, type: r.leaveType ?? "ลา", pending: r.status === "pending", ...(r.span === "half" ? { hours: empReqLeaveHours(r) } : {}) });
      }
      for (const [role, emp] of Object.entries(ROLE_EMPLOYEE)) {
        if (emp !== id) continue;
        for (const v of byRole[role as Role] ?? []) {
          if (v.status === "รอการอนุมัติ") out.push({ from: v.date, to: v.toDate, type: v.type, pending: true, ...(v.days < 1 ? { hours: leaveHoursOf(v) } : {}) });
        }
      }
      return out.filter((l) => l.from <= due && l.to >= start);
    },
    [time, extra, byRole],
  );
}

/** กระดานตั้งต้นจากข้อเสนอ — งานที่ไม่มีข้อเสนอเริ่มจากกระดานว่าง */
function blankBoard(job: InboxJob): Board {
  return {
    phases: job.phases.map((ph) => ({ name: ph.name, role: ph.role, start: ph.start, end: ph.end, par: ph.par })),
    plan: job.phases.map((ph) =>
      ph.tasks.map((name) => ({ name, role: ph.role, whos: [], start: "", due: "" })),
    ),
  };
}

function cloneBoard(b: Board): Board {
  return {
    phases: b.phases.map((ph) => ({ ...ph })),
    plan: b.plan.map((list) =>
      list.map((t) => ({
        ...t,
        whos: [...t.whos],
        files: t.files?.map((f) => ({ ...f })),
        autoFill: t.autoFill ? { ...t.autoFill } : undefined,
      })),
    ),
  };
}

// ─── ระบบร่างแผนให้ (ผู้ใช้สั่ง 21 ต.ค. 2569) ─────────────────────────

type FillCtx = { team: Member[]; projects: Project[]; scope: string };

/** PM แก้ช่องนี้เองแล้ว — ล้างธง "ระบบเติมให้" ของช่องนั้น ไม่เหลือธงก็ไม่เก็บ */
function unflag(f: Draft["autoFill"], k: "who" | "dates" | "brief"): Draft["autoFill"] {
  if (!f?.[k]) return f;
  const next = { ...f, [k]: undefined };
  return next.who || next.dates || next.brief ? next : undefined;
}

/** แบ่งช่วงเฟสให้งานในเฟสเรียงต่อกันเท่า ๆ กัน (นับวันปฏิทิน อย่างน้อยงานละ 1 วัน งานสุดท้ายจบวันจบเฟส) */
function splitSpan(start: string, end: string, n: number): { start: string; due: string }[] {
  if (!start || !end || end < start || n <= 0) return [];
  const days = daysBetween(start, end) + 1;
  return Array.from({ length: n }, (_, i) => {
    const a = Math.floor((i * days) / n);
    const b = Math.max(a, Math.floor(((i + 1) * days) / n) - 1);
    return { start: addDays(start, a), due: addDays(start, Math.min(b, days - 1)) };
  });
}

/*
 * เติมเฉพาะช่องที่ว่าง ไม่ทับที่ PM เลือกไว้ — ใช้ทั้งตอนเปิดกระดานใหม่และปุ่ม "เติมช่องที่ว่างให้"
 *   ผู้รับผิดชอบ: คนในทีม (ไม่รวมคนที่พ้นสภาพ) ที่มีตำแหน่งของงาน/เฟส และงานค้างน้อยสุด เท่ากันเอาคนแรกในรายการ
 *                นับงานที่เพิ่งเติมในกระดานนี้ด้วย ไม่งั้นงานทั้งเฟสไปกองที่คนเดียว
 *   วัน: แบ่งช่วงเฟสให้งานเรียงต่อกัน · รายละเอียด: ข้อเสนอยังไม่มีข้อความรายงาน จึงสร้างประโยคสั้นจากชื่องาน เฟส และขอบเขต
 * onlyNew = แก้แผนโปรเจคที่เดินอยู่ — เติมเฉพาะงานที่เพิ่มใหม่ งานเดิมไม่แตะ
 * คืนจำนวนช่องที่เติม (0 = ไม่มีอะไรให้เติม ซ่อนปุ่ม)
 */
function fillEmpty(b: Board, ctx: FillCtx, onlyNew: boolean): { board: Board; n: number } {
  const next = cloneBoard(b);
  let n = 0;
  const load = new Map(ctx.team.map((m) => [m.id, openTaskCount(ctx.projects, m.id)]));
  for (const t of next.plan.flat()) for (const id of t.whos) load.set(id, (load.get(id) ?? 0) + 1);
  next.phases.forEach((ph, pi) => {
    const list = next.plan[pi] ?? [];
    const slots = splitSpan(ph.start, ph.end, list.length);
    list.forEach((t, ti) => {
      if (onlyNew && t.from !== undefined) return;
      const auto = { ...t.autoFill };
      const role = t.role ?? ph.role;
      if (!t.whos.length && role) {
        let pick: Member | undefined;
        for (const m of ctx.team) {
          if (!m.roles.includes(role)) continue;
          if (!pick || (load.get(m.id) ?? 0) < (load.get(pick.id) ?? 0)) pick = m;
        }
        if (pick) {
          t.whos = [pick.id];
          load.set(pick.id, (load.get(pick.id) ?? 0) + 1);
          auto.who = true;
          n += 1;
        }
      }
      if ((!t.start || !t.due) && slots[ti]) {
        t.start = slots[ti].start;
        t.due = slots[ti].due;
        auto.dates = true;
        n += 1;
      }
      if (!t.brief?.trim()) {
        t.brief = `${t.name} ในเฟส ${ph.name}${ctx.scope.trim() ? ` · ขอบเขต: ${ctx.scope.trim()}` : ""}`;
        auto.brief = true;
        n += 1;
      }
      if (auto.who || auto.dates || auto.brief) t.autoFill = auto;
    });
  });
  return { board: next, n };
}

function key(phase: number, index: number) {
  return `${phase}:${index}`;
}

function at(plan: Draft[][], k: string) {
  const [p, i] = k.split(":").map(Number);
  return plan[p]?.[i];
}

/** จำนวนงานที่ยังไม่ปิดของคนหนึ่งคน นับจากทุกโปรเจคที่ยังเดินอยู่ */
function openTaskCount(projects: Project[], id: string) {
  let n = 0;
  for (const p of projects) {
    if (p.status !== "running") continue;
    for (const t of p.tasks) if (t.status !== "done" && t.whos.includes(id)) n += 1;
  }
  return n;
}
