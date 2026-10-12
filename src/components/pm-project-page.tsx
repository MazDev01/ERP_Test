"use client";

/*
 * รายละเอียดโปรเจคหนึ่งโปรเจค (ตามต้นแบบ pm-project.html) — เปิดจากการ์ดโฟลเดอร์ในหน้ารายการโปรเจค
 *
 *   หัวโปรเจค (ชื่อโปรเจค · สถานะ · ความคืบหน้า · วันเริ่ม/ส่งมอบ) + แก้ชื่อโปรเจค (PM-BR-03)
 *   สมาชิกในโปรเจค (นอกกริด สองคอลัมน์ล่างจะได้เริ่มที่ระดับเดียวกัน)
 *   ซ้าย: งานในโปรเจค · แชทโปรเจค
 *   ขวา: เอกสารจากฝ่ายขาย (PM-BR-08) · ไฟล์ล่าสุด · กิจกรรมล่าสุด
 *
 * ปุ่ม "วางแผนงาน" พาไปแก้แผนของโปรเจคนี้ในหน้าจัดคิวงาน
 * ทุกลิงก์ในหน้านี้อยู่ในหน้าของ PM เท่านั้น ไม่พาข้ามไปหน้าของบทบาทอื่น
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PresalesRequest, PresalesRound } from "@/lib/crm-data";
import { useCrm } from "@/lib/crm-store";
import { useAcc } from "@/lib/acc-store";
import { quotationNoOf } from "@/lib/flow";
import { addDays, bkkStamp, daysBetween, initials, thaiDate, thaiStamp, todayIso } from "@/lib/format";
import {
  fileKind,
  isRef,
  lastSub,
  planHref,
  projName,
  projectMembers,
  projectProgress,
  roleLabel,
  serviceLabel,
  TASK_STATUS,
  type InboxJob,
  type Project,
  type TaskFile,
  type TaskStatus,
  pctColor,
} from "@/lib/pm-data";
import {
  memberOf,
  nudgeTask,
  talkKey,
  taskTalks,
  transferProject,
  usePm,
  type TaskTalk,
} from "@/lib/pm-store";
import { hrPos } from "@/lib/hr-data";
import { useHr } from "@/lib/hr-store";
import { ChevronLeftIcon, CloseIcon, FileIcon, LinkIcon, PlanBoardIcon } from "./icons";
import { Sheet } from "./lead-dialogs";
import { QuotationPreview } from "./pm-docs";
import { ReadOnlyNote, usePmReadOnly } from "./pm-readonly";
import { isCanva, ProposalDialog } from "./proposal-doc";
import { FileNotice, ProjectChat } from "./project-chat";
import { ReviewDialog } from "./pm-reviews-page";
import { AddDocButton, AddDocsDialog, docSub, RemoveDocDialog, RenameButton, RenameDialog } from "./pm-project-tools";
import "@/styles/mobile/pm-project.css";
import { useSearchParams } from "next/navigation";
import { latestRound, roundStatus, useClientReviews } from "@/lib/client-review-store";
import { ClientFeedbackSheet, ClientRoundChip, ClientSendSheet } from "./client-review-pm";

/* สีแถบบนการ์ดงานตามสถานะ (ตามต้นแบบ) */
const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: "var(--neutral)",
  doing: "var(--warning)",
  sent: "var(--info)",
  revise: "var(--destructive)",
  wait: "var(--info)",
  done: "var(--success)",
};

/** pj = เลขที่โปรเจค — ลิงก์เก่าที่ส่งเลขดีลมาก็หาเจอ (isRef · ผู้ใช้สั่ง 5 ต.ค. 2569) */
export function PmProjectPage({ pj }: { pj: string }) {
  const pm = usePm();
  const project = pm.projects.find((p) => isRef(p, pj));

  if (!project) {
    return (
      <div className="space-y-4">
        <div className="bar">
          <div>
            <h1>ไม่พบโปรเจค</h1>
            <p>เลขที่โปรเจค {pj} ไม่มีในระบบ</p>
          </div>
        </div>
        <section className="glass rounded-[15px] px-5 py-14 text-center">
          <Link href="/pm/projects" className="btn solid btn-solid mt-5 inline-flex">
            กลับไปหน้าโปรเจค
          </Link>
        </section>
      </div>
    );
  }

  return <Detail project={project} />;
}

function Detail({ project }: { project: Project }) {
  const today = todayIso();
  /* ร่างแผนของโปรเจคนี้ที่ PM ยังไม่ได้ยืนยัน — คนอื่นที่เปิดโปรเจคต้องเห็นว่ามีร่างค้างอยู่ */
  const draft = usePm().drafts[project.pj];
  const pr = projectProgress(project);
  /* สมาชิกที่กดเลือก — กรองงานในโปรเจคให้เหลือเฉพาะงานของคนนั้น กดซ้ำเพื่อยกเลิก (ผู้ใช้สั่ง 8 ต.ค. 2569) */
  const [who, setWho] = useState<string | null>(null);
  /* คลิกที่อื่นนอกรูปโปรไฟล์ = กลับมาดูงานทุกคน · ยกเว้นในส่วนงาน (แท็บ/การ์ด) และกล่องที่เปิดจากการ์ด (ผู้ใช้สั่ง 8 ต.ค. 2569) */
  useEffect(() => {
    if (!who) return;
    const off = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (el?.closest("[data-mem-pick], [data-keep-who], [role=dialog]")) return;
      setWho(null);
    };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [who]);
  /* โปรเจคที่ยืนยันแผนตอนยังไม่มีเฟส ไม่มีวันส่งมอบ — นับวันไม่ได้ ไม่ใช่ว่าเลยกำหนด */
  const hasDue = Boolean(project.due);
  const left = hasDue ? daysBetween(today, project.due) : 0;
  const late = hasDue && project.status === "running" && left < 0;

  const [renaming, setRenaming] = useState(false);
  const title = projName(project);
  /* GM เปิดดูได้อย่างเดียว — ซ่อนปุ่มแก้ชื่อและช่องแชท (ต้นแบบ pm-project.html?as=gm) */
  const ro = usePmReadOnly();
  const [transferring, setTransferring] = useState(false);
  const lastTransfer = project.transfers?.[project.transfers.length - 1];


  const status =
    project.status === "cancelled"
      ? { text: "ยกเลิก", cls: "t-miss" }
      : project.status === "done"
      ? { text: "ส่งมอบแล้ว", cls: "t-ok" }
      : late
        ? { text: `เลยกำหนด ${Math.abs(left)} วัน`, cls: "t-late" }
        : { text: "กำลังดำเนินการ", cls: "t-info" };

  return (
    <div className={`pd-m space-y-4 ${ro ? "ro-gm" : ""}`}>
      <div className="bar pd-bar">
        <div className="min-w-0">
          <p className="mb-1 text-xs text-muted-foreground">
            <Link href="/pm/projects" className="hover:text-primary">
              โปรเจค
            </Link>
            <span className="mx-1.5">/</span>
            <b className="font-semibold text-foreground">{project.cus}</b>
          </p>
          {/* ไม่มีหัวข้อใหญ่ซ้ำกับชื่อในกล่องหัวโปรเจค (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
          <h1 className="sr-only">{title}</h1>
        </div>
        <div className="tools w-full flex-wrap sm:w-auto">
          {/* มือถือ: สองปุ่มแบ่งครึ่งแถว สูงพอให้นิ้วกด */}
          <Link href="/pm/projects" className="btn glass-thin max-sm:h-10 max-sm:flex-1 max-sm:justify-center">
            <ChevronLeftIcon className="size-[15px]" strokeWidth={2.2} />
            กลับไปหน้าโปรเจค
          </Link>
          <Link
            href={planHref(project.pj)}
            className="btn solid btn-solid max-sm:h-10 max-sm:flex-1 max-sm:justify-center"
          >
            <PlanBoardIcon className="size-3.5" strokeWidth={2} />
            {/* GM เข้าหน้าแผนได้แต่แก้ไม่ได้ — ป้ายจึงบอกตามจริงว่าเข้าไปดู ไม่ใช่เข้าไปวาง */}
            {ro ? "ดูแผนงาน" : "วางแผนงาน"}
          </Link>
        </div>
      </div>
      {/* มือถือ (ต้นแบบ m-pj-head): ซ่อนแถบหัวจอคอม เหลือปุ่มกลมกลับไปหน้าโปรเจค + ปุ่มวางแผนงาน
          ชื่อหน้าอยู่บนหัวของ app-shell แล้ว และหัวนั้นยังไม่มีช่องขวาให้หน้าใส่ปุ่ม จึงวางไว้บนสุดของเนื้อหา */}
      <div className="pd-mtop">
        <Link href="/pm/projects" aria-label="กลับไปหน้าโปรเจค" title="กลับไปหน้าโปรเจค">
          <ChevronLeftIcon className="size-5" strokeWidth={2.4} />
        </Link>
        <Link
          href={planHref(project.pj)}
          aria-label={ro ? "ดูแผนงาน" : "วางแผนงาน"}
          title={ro ? "ดูแผนงาน" : "วางแผนงาน"}
        >
          <PlanBoardIcon className="size-[19px]" strokeWidth={2.2} />
        </Link>
      </div>
      <ReadOnlyNote />

      {draft && (
        <p className="rounded-[10px] bg-[var(--warning-soft)] px-3.5 py-[9px] text-[12.5px] font-semibold text-[var(--warning)]">
          มีร่างแผนงานที่ยังไม่ยืนยัน · แก้ล่าสุด {thaiStamp(draft.at)} น. โดย {draft.by}
        </p>
      )}

      {/* 1. หัวโปรเจค — ไปถึงไหนแล้ว · เหลือเวลาเท่าไร */}
      <section className="pd-head glass grid gap-6 rounded-[16px] px-[22px] py-[18px] max-sm:gap-4 max-sm:px-4 lg:grid-cols-[minmax(0,1.4fr)_280px] lg:items-center">
        <div className="min-w-0">
          {/* หัวกล่องเหลือชื่อโปรเจคกับชื่อลูกค้า — ไม่มีป้ายสถานะ ปุ่มแก้ชื่อ ผู้ดูแล/โอน บริการ และขอบเขต (ผู้ใช้สั่ง 8 ต.ค. 2569)
              แก้ชื่อได้ที่ชื่อใต้โฟลเดอร์ในหน้าโปรเจค */}
          {/* ระยะเวลาโครงการอยู่บนชื่อโปรเจค (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
          <p className="num mb-1 text-[12.5px] font-semibold text-muted-foreground">
            ระยะเวลาโครงการ {thaiDate(project.start)}
            {hasDue ? ` - ${thaiDate(project.due)}` : ""}
          </p>
          <p className="text-[19px] font-extrabold">{title}</p>
          <p className="mt-[3px] text-[13px] font-semibold text-muted-foreground">{project.cus}</p>
          {project.status === "cancelled" && (
            /* ดีลถูกยกเลิก — บอกว่าใครยกเลิก เมื่อไร และเพราะอะไร ทีมจะได้ไม่ทำงานต่อ */
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              ยกเลิกเมื่อ {thaiDate(project.cancelled?.at.slice(0, 10) ?? "")} โดย {project.cancelled?.by || "—"} ·{" "}
              {project.cancelled?.why ?? ""}
            </p>
          )}
        </div>

        <div className="min-w-0">
          <p className="flex items-baseline justify-between gap-2.5">
            <span className="text-[11.5px] font-semibold text-muted-foreground">ความคืบหน้า</span>
            <b className="num text-xl font-extrabold text-primary">{pr.pct}%</b>
          </p>
          <span className="mt-[7px] block h-2 overflow-hidden rounded-lg bg-muted">
            <i className="block h-full rounded-lg" style={{ width: `${pr.pct}%`, background: pctColor(pr.pct) }} />
          </span>
          <p className="num mt-[5px] text-center text-[11.5px] text-muted-foreground">
            {pr.done} จาก {pr.all} งาน
          </p>
        </div>
      </section>

      <Members project={project} who={who} onPick={(id) => setWho((w) => (w === id ? null : id))} />

      <div className="pd-grid grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Tasks project={project} today={today} count={pr.all} who={who} />
        </div>
        <aside className="min-w-0 space-y-5">
          <SalesDocs project={project} />
          <RecentFiles project={project} />
          <RecentActs project={project} />
        </aside>
      </div>

      {/* แชทโปรเจคเป็นปุ่มลอยมุมขวาล่าง เปิดหน้าต่างแชทแบบเว็บทั่วไป ทุกขนาดจอ (ผู้ใช้สั่ง 2 ต.ค. 2569)
          จอคอมเป็นกล่องลอยเหนือปุ่ม · มือถือเต็มจอ */}
      {/* แยกเป็นคอมโพเนนต์กลางให้หน้างานที่ได้รับใช้สายเดียวกัน (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
      <ProjectChat project={project} title={title} />

      {renaming && <RenameDialog project={project} onClose={() => setRenaming(false)} />}
      {transferring && <TransferDialog project={project} onClose={() => setTransferring(false)} />}
    </div>
  );
}

// ─── โอนโปรเจค ────────────────────────────────────────────────────
/*
 * โอนโปรเจคให้คนใหม่ (Proposal · PM — Transfer Project)
 * รับโอนได้เฉพาะตำแหน่ง PM และ SA ตามที่ระบุไว้ใน proposal ("PM การตลาด · PM เว็บ · SA ที่รับโอนโปรเจค")
 * ต้องใส่เหตุผลเสมอ เพราะเป็นการเปลี่ยนตัวคนรับผิดชอบ ไม่ใช่แก้ข้อมูลเฉย ๆ
 */
const TRANSFER_POS = ["pm", "sa"];

export function TransferDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const hr = useHr();
  const people = hr.emp.filter(
    (e) => e.status === "active" && TRANSFER_POS.includes(e.pos) && e.name !== project.pm,
  );
  const [to, setTo] = useState("");
  const [why, setWhy] = useState("");
  const [touched, setTouched] = useState(false);
  const missTo = !to;
  const missWhy = !why.trim();

  function save() {
    setTouched(true);
    if (missTo || missWhy) return;
    transferProject(project.pj, to, why, project.pm);
    onClose();
  }

  return (
    <Sheet
      title="โอนโปรเจค"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn solid btn-solid" onClick={save}>
            โอนโปรเจค
          </button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        โอนแล้ว <b className="font-semibold text-foreground">{project.pm}</b>{" "}
        จะไม่ได้เป็นผู้ดูแลโปรเจคนี้อีก · งานย่อยและคนที่ถูกมอบหมายไว้แล้วไม่เปลี่ยน
      </p>

      <label className="mt-4 block text-[12.5px] font-semibold">โอนให้</label>
      {people.length === 0 ? (
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">
          ยังไม่มีพนักงานตำแหน่ง PM หรือ SA คนอื่นในทะเบียน
        </p>
      ) : (
        <select
          value={to}
          aria-label="โอนให้"
          onChange={(e) => setTo(e.target.value)}
          className="field-control mt-1.5 cursor-pointer"
        >
          <option value="">— เลือกผู้ดูแลคนใหม่ —</option>
          {people.map((e) => (
            <option key={e.id} value={e.name}>
              {e.name} · {hrPos(e.pos).label}
            </option>
          ))}
        </select>
      )}
      {touched && missTo && (
        <p className="mt-1.5 text-[12px] font-semibold text-destructive">เลือกผู้ดูแลคนใหม่ก่อน</p>
      )}

      <label className="mt-4 block text-[12.5px] font-semibold">เหตุผลที่โอน</label>
      <textarea
        value={why}
        aria-label="เหตุผลที่โอน"
        onChange={(e) => setWhy(e.target.value)}
        placeholder="โอนหลังตกลงกันแล้ว เขียนไว้ให้คนอื่นย้อนดูได้ว่าเพราะอะไร"
        className="field-control mt-1.5 h-[84px] resize-y py-2.5 leading-relaxed"
      />
      {touched && missWhy && (
        <p className="mt-1.5 text-[12px] font-semibold text-destructive">ใส่เหตุผลก่อนโอน</p>
      )}
    </Sheet>
  );
}

// ─── แก้ชื่อโปรเจค ─────────────────────────────────────────────────

// ─── เอกสารจากฝ่ายขาย (PM-BR-08 ติดมากับงานทั้งชุดตอนรับชำระงวดแรก) ─────────

type SalesDoc = {
  k: "pdf" | "canva" | "link" | "img" | "xlsx";
  name: string;
  from: string;
  at: string;
  url?: string;
  /** เปิดอะไรเมื่อกดดู */
  open: { t: "quo" } | { t: "round"; req: PresalesRequest; round: PresalesRound } | { t: "file" };
};

function docKindOf(name: string): SalesDoc["k"] {
  const x = name.toLowerCase();
  if (/^https?:\/\//.test(x)) return "link";
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(x)) return "img";
  if (/\.(xlsx?|csv)$/.test(x)) return "xlsx";
  return "pdf";
}

function sdocKind(k: SalesDoc["k"]) {
  return k === "canva"
    ? "ลิงก์ Canva"
    : k === "link"
      ? "ลิงก์"
      : k === "img"
        ? "รูปภาพ"
        : k === "xlsx"
          ? "ไฟล์ Excel"
          : "ไฟล์ PDF";
}

function SalesDocs({ project }: { project: Project }) {
  const crm = useCrm();
  const acc = useAcc();
  const ro = usePmReadOnly();
  const [open, setOpen] = useState<SalesDoc | null>(null);
  /* เอกสารอื่นที่ PM/GM แนบเพิ่ม (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const extra = project.docs ?? [];

  /* ชุดเดียวกับหน้าขายและคำขอก่อนการขาย — ใบเสนอราคา · สัญญา · ข้อเสนอทุกรอบ · ไฟล์จากลูกค้า
     ใบเสนอราคาหาผ่านใบแจ้งหนี้งวดแรกของโปรเจค ไม่ผ่านดีล (ผู้ใช้สั่ง 5 ต.ค. 2569)
     สัญญาเป็นของดีลฝ่ายขาย — มีเฉพาะโปรเจคที่มาจากดีล */
  const quoNo = quotationNoOf(project, acc);
  const deal = project.deal ? crm.deals.find((d) => d.no === project.deal) : undefined;
  const quo = crm.quotations.find((q) => q.no === quoNo);
  const list: SalesDoc[] = [];
  if (quo || quoNo) {
    list.push({
      k: "pdf",
      name: `ใบเสนอราคา ${quo?.no ?? quoNo}`,
      from: "",
      at: quo?.issued ?? "",
      open: { t: "quo" },
    });
  }
  for (const c of deal?.contracts ?? []) {
    list.push({
      k: c.kind === "link" ? "link" : docKindOf(c.name),
      name: c.name,
      from: `สัญญา${c.no ? ` ${c.no}` : ""}${c.signed ? ` เซ็น ${thaiDate(c.signed)}` : ""}`,
      at: c.at,
      url: c.url,
      open: { t: "file" },
    });
  }
  /* ใบเสนอราคาที่ไม่ได้ออกจากลิงก์ ?ps= จะไม่มีเลขคำขอ — ใช้ข้อเสนอที่ติดมากับใบงานตอนรับงานแทน */
  const ps = quo?.ps || project.source?.proposal?.no;
  const req = ps ? crm.presales.find((r) => r.no === ps) : undefined;
  if (ps) {
    const rounds = crm.presalesRounds.filter((r) => r.requestNo === ps).sort((a, b) => b.round - a.round);
    const top = rounds[0]?.round;
    for (const r of rounds) {
      list.push({
        k: r.kind === "canva" ? "canva" : "pdf",
        name: r.file,
        from: `ข้อเสนอรอบที่ ${r.round}${r.round === top ? " (ฉบับล่าสุด)" : ""}`,
        at: r.at,
        url: r.url,
        open: req ? { t: "round", req, round: r } : { t: "file" },
      });
    }
    for (const f of req?.attachments ?? []) {
      const k = docKindOf(f);
      list.push({
        k,
        name: k === "link" ? "เว็บไซต์เดิมของลูกค้า" : f,
        from: "ไฟล์จากลูกค้า",
        at: "",
        url: k === "link" ? f : undefined,
        open: { t: "file" },
      });
    }
  }

  /* ใบเสนอราคา ข้อเสนอ และสัญญาจากฝ่ายขาย ไม่ติดมาเป็นเอกสารตั้งต้นของโปรเจค — PM เห็นตอนรับงานเท่านั้น
     ในโปรเจค PM แนบไฟล์ที่ทีมควรเห็นเองทุกไฟล์ กันกรณีใบเสนอราคาเปิดเผยกับทีมไม่ได้ (ผู้ใช้สั่ง 8 ต.ค. 2569) */
  list.length = 0;
  return (
    <section className="pd-blk">
      <div className="flex items-start justify-between gap-2">
        <BlockTitle count={String(list.length + extra.length)}>เอกสารของโปรเจคนี้</BlockTitle>
        {!ro && <AddDocButton className="h-7 px-2 max-sm:h-9" onClick={() => setAdding(true)} />}
      </div>
      <ul className="overflow-hidden rounded-[14px] border border-border bg-card">
        {extra.map((d) => (
          <FileRow
            key={`x-${d.n}`}
            kind={d.url ? "link" : fileKind(d.n)}
            name={d.n}
            sub={["เอกสารแนบของโปรเจค", docSub(d)]}
            tag={d.url ? "ลิงก์" : "เอกสารแนบ"}
          >
            {d.url ? (
              <a href={d.url} target="_blank" rel="noreferrer" className="btn glass-thin h-7 px-2.5 text-[11.5px] max-sm:h-9 max-sm:px-3">
                เปิด
              </a>
            ) : (
              <button
                type="button"
                className="btn glass-thin h-7 px-2.5 text-[11.5px] max-sm:h-9 max-sm:px-3"
                onClick={() => setOpen({ k: "pdf", name: d.n, from: "", at: "", open: { t: "file" } })}
              >
                ดู
              </button>
            )}
            {!ro && (
              <button
                type="button"
                data-ceo-hide
                title="เอาเอกสารนี้ออก"
                aria-label={`เอา ${d.n} ออก`}
                className="btn glass-thin h-7 px-2 text-[11.5px] hover:text-destructive max-sm:h-9"
                onClick={() => setRemoving(d.n)}
              >
                <CloseIcon className="size-3.5" strokeWidth={2.2} />
              </button>
            )}
          </FileRow>
        ))}
        {list.length === 0 && extra.length === 0 ? (
          <li className="px-3.5 py-3 text-[12.5px] text-muted-foreground">ยังไม่มีเอกสาร</li>
        ) : (
          list.map((x, i) => {
            const link = x.k === "link" || x.k === "canva";
            return (
              <FileRow
                key={`${x.name}-${i}`}
                kind={link ? "link" : x.k === "img" ? "image" : "pdf"}
                name={x.name}
                sub={[x.from, x.at ? thaiDate(x.at) : ""]}
                tag={sdocKind(x.k)}
              >
                {link && x.url ? (
                  <a href={x.url} target="_blank" rel="noreferrer" className="btn glass-thin h-7 px-2.5 text-[11.5px] max-sm:h-9 max-sm:px-3">
                    เปิด
                  </a>
                ) : (
                  <button type="button" className="btn glass-thin h-7 px-2.5 text-[11.5px] max-sm:h-9 max-sm:px-3" onClick={() => setOpen(x)}>
                    {link ? "เปิด" : "ดู"}
                  </button>
                )}
              </FileRow>
            );
          })
        )}
      </ul>

      {open?.open.t === "quo" && (
        <Sheet
          wide
          title={open.name}
          onClose={() => setOpen(null)}
          footer={
            <button type="button" className="btn glass-thin" onClick={() => setOpen(null)}>
              ปิด
            </button>
          }
        >
          <QuotationPreview job={project.source ?? jobOf(project, crm, quoNo)} />
        </Sheet>
      )}
      {open?.open.t === "round" && !isCanva(open.open.round) && (
        <ProposalDialog
          request={open.open.req}
          round={open.open.round}
          customerName={project.cus}
          onClose={() => setOpen(null)}
        />
      )}
      {open && (open.open.t === "file" || (open.open.t === "round" && isCanva(open.open.round))) && (
        <FileNotice name={open.name} onClose={() => setOpen(null)} />
      )}
      {adding && <AddDocsDialog pj={project.pj} onClose={() => setAdding(false)} />}
      <RemoveDocDialog pj={project.pj} name={removing} onClose={() => setRemoving(null)} />
    </section>
  );
}

/*
 * โปรเจคตั้งต้นไม่มีงานตอนรับเข้ามา (source) — ประกอบใบเสนอราคาจากข้อมูลฝ่ายขายแทน
 * เป็นสำเนาอ่านอย่างเดียวเหมือนตอนเปิดจากงานเข้าใหม่
 */
function jobOf(p: Project, crm: ReturnType<typeof useCrm>, quoNo = p.quo): InboxJob {
  const q = crm.quotations.find((x) => x.no === quoNo);
  const c = crm.customers.find((x) => x.code === q?.customerCode);
  return {
    pj: p.pj,
    bill: p.bill,
    deal: p.deal,
    service: p.service,
    cus: p.cus,
    quo: quoNo,
    quoDate: q?.issued ?? p.start,
    net: p.net,
    seqs: 1,
    paidAt: p.start,
    sentAt: p.start,
    scope: p.scope,
    items: [],
    due: p.due,
    stage: "plan",
    planStart: p.start,
    planEnd: p.due,
    durationDays: daysBetween(p.start, p.due),
    phases: [],
    contact: c?.contact ?? "—",
    phone: c?.phone ?? "—",
    taxId: c?.taxId ?? "—",
    address: c?.address ?? "—",
    terms: q?.terms ?? "—",
    validDays: q?.validDays ?? 30,
  };
}

/** แถวไฟล์ในคอลัมน์ขวา — ไอคอนตามชนิด ชื่อ บรรทัดรอง ป้ายชนิด แล้วปุ่ม */
function FileRow({
  kind,
  name,
  sub,
  tag,
  children,
}: {
  kind: TaskFile["k"];
  name: string;
  sub: string[];
  tag?: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5 last:border-b-0">
      <span
        className={`grid size-8 flex-none place-items-center rounded-[9px] ${
          kind === "image"
            ? "bg-[var(--info-soft)] text-[var(--info)]"
            : kind === "link"
              ? "bg-[var(--success-soft)] text-[var(--success)]"
              : "bg-accent text-primary"
        }`}
      >
        {kind === "link" ? (
          <LinkIcon className="size-3.5" strokeWidth={2} />
        ) : (
          <FileIcon className="size-3.5" strokeWidth={2} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[12.5px] font-semibold" title={name}>
          {name}
        </b>
        <em className="flex flex-wrap gap-x-2 text-[11px] text-muted-foreground not-italic">
          {sub.filter(Boolean).map((x) => (
            <span key={x}>{x}</span>
          ))}
        </em>
      </span>
      {tag && (
        <span className="hidden flex-none rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground sm:inline">
          {tag}
        </span>
      )}
      <span className="flex flex-none gap-1">{children}</span>
    </li>
  );
}

// ─── ไฟล์ล่าสุด ─────────────────────────────────────────────────────

function RecentFiles({ project }: { project: Project }) {
  const [open, setOpen] = useState<string | null>(null);
  /* ไฟล์ส่งงานของทุกงาน + ไฟล์ที่ส่งในแชทโปรเจค — ใหม่สุดก่อน แสดงเฉพาะล่าสุดไม่ให้หน้าแน่น */
  const all = [
    ...project.tasks.flatMap((t) => t.files.map((f) => ({ f, where: t.name }))),
    ...(project.files ?? []).map((f) => ({ f, where: "แชทโปรเจค" })),
  ].sort((a, b) => b.f.at.localeCompare(a.f.at));
  const show = all.slice(0, 5);
  return (
    <section className="pd-blk">
      <BlockTitle>ไฟล์ล่าสุด</BlockTitle>
      <ul className="overflow-hidden rounded-[14px] border border-border bg-card">
        {show.length === 0 ? (
          <li className="px-3.5 py-3 text-[12.5px] text-muted-foreground">ยังไม่มีไฟล์ส่งงาน</li>
        ) : (
          <>
            {show.map(({ f, where }, i) => (
              <FileRow key={`${f.n}-${i}`} kind={f.k} name={f.n} sub={[where, thaiDate(f.at)]}>
                <button type="button" className="btn glass-thin h-7 px-2.5 text-[11.5px] max-sm:h-9 max-sm:px-3" onClick={() => setOpen(f.n)}>
                  {f.k === "link" ? "เปิด" : "ดู"}
                </button>
                {f.k !== "link" && (
                  <button type="button" className="btn glass-thin h-7 px-2.5 text-[11.5px] max-sm:h-9 max-sm:px-3" onClick={() => setOpen(f.n)}>
                    โหลด
                  </button>
                )}
              </FileRow>
            ))}
            {all.length > show.length && (
              <li className="px-3.5 py-2.5 text-[11.5px] text-muted-foreground">
                และอีก {all.length - show.length} ไฟล์ในงานแต่ละชิ้น
              </li>
            )}
          </>
        )}
      </ul>
      {open && <FileNotice name={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

// ─── กิจกรรมล่าสุด ───────────────────────────────────────────────────

/* ไอคอนตามชนิดกิจกรรม (ต้นแบบ AK) — เพิ่มไฟล์ · ข้อความ · อัปเดตสถานะ · ส่งงาน */
const ACT_ICON: Record<string, { i: string; cls: string }> = {
  file: { i: "📎", cls: "bg-[var(--info-soft)]" },
  chat: { i: "💬", cls: "bg-muted" },
  status: { i: "↻", cls: "bg-[var(--warning-soft)] text-[var(--warning)]" },
  done: { i: "✓", cls: "bg-[var(--success-soft)] text-[var(--success)]" },
};

function RecentActs({ project }: { project: Project }) {
  const list = [...project.acts].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  return (
    <section className="pd-blk">
      <BlockTitle>กิจกรรมล่าสุด</BlockTitle>
      <ul className="space-y-1 rounded-[14px] border border-border bg-card px-3.5 py-2.5">
        {list.length === 0 ? (
          <li className="py-1 text-[12.5px] text-muted-foreground">ยังไม่มีกิจกรรม</li>
        ) : (
          list.map((a, i) => {
            const name = a.who === "PM" ? project.pm : (memberOf(a.who)?.name ?? a.who);
            const ic = ACT_ICON[a.kind] ?? ACT_ICON.status;
            return (
              <li key={`${a.at}-${i}`} className="flex gap-2.5 py-1.5">
                <span
                  className={`grid size-7 flex-none place-items-center rounded-full text-[12px] font-bold ${ic.cls}`}
                >
                  {ic.i}
                </span>
                <span className="min-w-0 text-[12.5px] leading-[1.55]">
                  <b className="font-semibold">{name}</b> {a.tx}
                  <em className="num flex gap-2 text-[11px] text-muted-foreground not-italic">
                    <span>{thaiDate(a.at.slice(0, 10))}</span>
                    <span>{a.at.split(" ")[1]}</span>
                  </em>
                </span>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}

/** หัวข้อของบล็อกในหน้านี้ — ตัวเลขข้างหลังบอกจำนวนโดยไม่ต้องนับเอง */
function BlockTitle({ children, count }: { children: React.ReactNode; count?: string }) {
  return (
    <p className="pd-bh mb-[11px] flex items-center gap-[9px] text-[13.5px] font-bold">
      {children}
      {count && (
        <b className="num rounded-[20px] bg-muted px-[9px] py-0.5 text-[11px] font-bold text-muted-foreground">
          {count}
        </b>
      )}
    </p>
  );
}

// ─── 2. งานในโปรเจค ───────────────────────────────────────────────

type TaskTab = "all" | "doing" | "pm" | "client" | "replied" | "revise" | "done";
/* replied = ลูกค้าตอบรอบล่าสุดกลับมาแล้ว (คอมเมนต์/อนุมัติ) แต่ PM ยังไม่ได้ส่งให้ทีมแก้หรือปิดงาน */
const TASK_TABS: { key: TaskTab; label: string; test: (st: string, replied: boolean) => boolean }[] = [
  { key: "all", label: "ทั้งหมด", test: () => true },
  /* ทีมไม่มีปุ่มเริ่มงาน — ยังไม่เริ่มกับกำลังทำแยกกันไม่ได้จริง รวมเป็นกำลังทำ (ผู้ใช้สั่ง 8 ต.ค. 2569) */
  { key: "doing", label: "กำลังทำ", test: (st) => st === "todo" || st === "doing" },
  /* รอ PM ตรวจ กับ รอลูกค้าตรวจ แยกกัน — คนละคนต้องทำต่อ (ผู้ใช้สั่ง 8 ต.ค. 2569) */
  { key: "pm", label: "ตรวจงาน", test: (st) => st === "sent" },
  { key: "client", label: "รอลูกค้าตรวจ", test: (st, replied) => st === "wait" && !replied },
  /* ลูกค้าตอบแล้วแยกแท็บ ไม่ปนกับงานที่ยังรอลูกค้า (ผู้ใช้สั่ง 8 ต.ค. 2569) */
  { key: "replied", label: "ลูกค้าตอบแล้ว", test: (_st, replied) => replied },
  { key: "revise", label: "ต้องแก้ไข", test: (st) => st === "revise" },
  { key: "done", label: "เสร็จแล้ว", test: (st) => st === "done" },
];

function Tasks({ project, today, count, who }: { project: Project; today: string; count: number; who: string | null }) {
  /* งานของสมาชิกที่เลือกไว้ (ไม่ได้เลือก = ทุกงาน) */
  const mine = project.tasks.filter((t) => !who || t.whos.includes(who));
  const reviewsAll = useClientReviews();
  /* ลูกค้าตอบรอบล่าสุดแล้ว รอ PM ส่งให้ทีมแก้หรือปิดงาน */
  const replied = (name: string) => {
    const r = latestRound(reviewsAll, project.pj, name);
    if (!r || r.forwardedAt || r.closedAt) return false;
    const st = roundStatus(r);
    return st === "submitted" || st === "approved";
  };
  /* งานที่กำลังทวง — ทวงจากการ์ดงานใบนั้นตรง ๆ ไม่ใช่พิมพ์ลอย ๆ ในแชทโปรเจคที่ทีมเปิดไม่ได้ */
  const [nudging, setNudging] = useState<string | null>(null);
  /* ตรวจงานที่ทีมส่งมาได้จากการ์ดงานตรงนี้เลย ไม่ต้องไปเมนูงานรอตรวจ (ผู้ใช้สั่ง 8 ต.ค. 2569) */
  const [reviewing, setReviewing] = useState<string | null>(null);
  const reviewTask = reviewing ? project.tasks.find((t) => t.name === reviewing) : undefined;
  const talks = usePm().talks;
  /* ลูกค้าตรวจงานผ่านลิงก์ — ส่งให้ลูกค้า (ชื่องาน) · ความเห็นจากลูกค้า (token) · ลิงก์จากกระดิ่ง ?review=<token> เปิดให้เลย */
  const reviews = useClientReviews();
  const [sending, setSending] = useState<string | null>(null);
  const reviewParam = useSearchParams().get("review");
  const [feedback, setFeedback] = useState<string | null>(reviewParam);
  const sendTask = sending ? project.tasks.find((t) => t.name === sending) : undefined;
  /* แท็บกรองตามสถานะ · งานที่ยังไม่เสร็จขึ้นก่อน งานเสร็จแล้วอยู่ท้าย (ผู้ใช้สั่ง 8 ต.ค. 2569) */
  const [tab, setTab] = useState<TaskTab>("all");
  const shown = project.tasks
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => !who || t.whos.includes(who))
    .filter(({ t }) => TASK_TABS.find((x) => x.key === tab)!.test(t.status, replied(t.name)))
    .sort((a, b) => Number(a.t.status === "done") - Number(b.t.status === "done") || a.i - b.i);
  return (
    <section className="pd-blk" data-keep-who>
      <BlockTitle count={`${count} งาน`}>งานในโปรเจค</BlockTitle>
      {count > 0 && (
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="กรองตามสถานะงาน">
          {TASK_TABS.map((x) => {
            const on = x.key === tab;
            const n = mine.filter((t) => x.test(t.status, replied(t.name))).length;
            return (
              <button
                key={x.key}
                type="button"
                aria-pressed={on}
                onClick={() => setTab(x.key)}
                className={`inline-flex h-[32px] items-center gap-2 rounded-[20px] border px-[13px] text-[12.5px] font-semibold ${
                  on
                    ? "border-primary bg-accent text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"
                }`}
              >
                {x.label}
                <b className={`num text-[11px] font-bold ${on ? "text-primary" : "text-muted-foreground"}`}>{n}</b>
              </button>
            );
          })}
        </div>
      )}
      {count === 0 ? (
        <p className="py-4 text-[12.5px] text-muted-foreground">ยังไม่มีงานย่อยในโปรเจคนี้</p>
      ) : (
        <div className="pd-tgrid grid gap-[11px] [grid-template-columns:repeat(auto-fill,minmax(228px,1fr))]">
          {shown.length === 0 && (
            <p className="col-span-full py-4 text-[12.5px] text-muted-foreground">ไม่มีงานในสถานะนี้</p>
          )}
          {shown.map(({ t, i }) => {
            const phase = project.phases[t.phase];
            const st = TASK_STATUS[t.status];
            const n = daysBetween(today, t.due);
            /* วันที่ทีมส่งงานจริงมาจากรอบล่าสุดที่ส่ง ไม่ใช่กำหนดส่งที่ตั้งไว้ในคิวงาน */
            /* งานเสร็จที่ไม่มีรอบส่งในข้อมูล (โปรเจคตั้งต้น) ใช้วันที่ตรวจผ่าน หรือก่อนกำหนดหนึ่งวันตามต้นแบบ
               ไม่ขึ้น "เลยกำหนด" ให้งานที่ปิดไปแล้ว */
            const sentAt =
              lastSub(t)?.at.split(" ")[0] ??
              (t.status === "done" ? (t.doneAt?.slice(0, 10) ?? addDays(t.due, -1)) : "");
            const first = t.whos[0] ? (memberOf(t.whos[0])?.name ?? t.whos[0]) : "";
            const talkCount = (talks[talkKey(project.pj, t.name)] ?? []).length;
            const latest = latestRound(reviews, project.pj, t.name);
            /* ส่งได้เมื่อ PM ตรวจผ่านแล้ว (done) และไม่มีรอบที่ลูกค้ายังตรวจค้างอยู่ / ลูกค้าอนุมัติปิดไปแล้ว */
            const canSend =
              project.status !== "cancelled" &&
              t.status === "done" &&
              (!latest || (roundStatus(latest) !== "open" && !latest.closedAt));
            return (
              <article
                key={`${t.name}-${i}`}
                title={phase ? `${phase.name} · ${roleLabel(phase.role)}` : undefined}
                className="pd-tk rounded-[13px] border border-border bg-card p-[13px]"
                style={{ borderTop: `3px solid ${STATUS_COLOR[t.status]}` }}
              >
                <span className={`tag ${st.cls}`}>
                  <i />
                  {st.label}
                </span>
                <p className="mt-2 text-[13px] leading-[1.5] font-bold">{t.name}</p>
                {/* คนทำต้องได้โจทย์ ไม่ใช่แค่ชื่องาน — ใบที่ยังไม่มีขึ้นให้เห็นตั้งแต่หน้านี้ */}
                <p
                  className={`mt-1 line-clamp-2 text-[11.5px] leading-[1.5] ${
                    t.brief ? "text-muted-foreground" : "text-muted-foreground/70"
                  }`}
                >
                  {t.brief || "ยังไม่มีรายละเอียดงาน"}
                  {t.files.length > 0 ? ` · ${t.files.length} ไฟล์แนบ` : ""}
                </p>
                <div className="mt-2.5 flex items-center justify-between gap-[9px]">
                  <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                    {first ? (
                      <>
                        <span
                          title={first}
                          className="grid size-[22px] flex-none place-items-center rounded-full bg-accent text-[9px] font-bold text-primary"
                        >
                          {initials(first)}
                        </span>
                        <span className="truncate">{first}</span>
                      </>
                    ) : (
                      "ยังไม่มอบหมาย"
                    )}
                  </span>
                  <span
                    className={`num flex-none text-[11px] ${
                      !sentAt && n < 0 ? "font-bold text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {sentAt
                      ? `ส่งเมื่อ ${thaiDate(sentAt)}`
                      : n < 0
                        ? `เลยกำหนด ${Math.abs(n)} วัน`
                        : `กำหนดส่ง ${thaiDate(t.due)}`}
                  </span>
                </div>

                {/* ไม่มีปุ่มทวง/คุยเรื่องงานบนการ์ด — คุยในแชทโปรเจคแทน (ผู้ใช้สั่ง 9 ต.ค. 2569) */}

                {t.status === "sent" && (
                  <button
                    type="button"
                    data-ro-hide
                    onClick={() => setReviewing(t.name)}
                    className="mt-2.5 h-8 w-full rounded-[9px] bg-primary text-[11.5px] font-semibold text-white hover:opacity-90 max-sm:h-10 max-sm:text-[13px]"
                  >
                    ตรวจงาน
                  </button>
                )}

                {/* ลูกค้าตรวจงานผ่านลิงก์ — ป้ายของรอบล่าสุด (กดดูความเห็น) และปุ่มส่งรอบใหม่หลัง PM ตรวจผ่าน */}
                {/* ลูกค้าตอบแล้วมีปุ่มดูความเห็นแทน ไม่ต้องมีป้ายจำนวนคอมเมนต์บนการ์ด — ดูรายละเอียดในกล่อง (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
                {latest && !replied(t.name) && <ClientRoundChip round={latest} onOpen={() => setFeedback(latest.token)} />}
                {latest && replied(t.name) && (
                  <button
                    type="button"
                    onClick={() => setFeedback(latest.token)}
                    className="mt-2.5 h-8 w-full rounded-[9px] bg-primary text-[11.5px] font-semibold text-white hover:opacity-90 max-sm:h-10 max-sm:text-[13px]"
                  >
                    ดูความเห็นลูกค้า
                  </button>
                )}
                {canSend && (
                  <button
                    type="button"
                    data-ro-hide
                    onClick={() => setSending(t.name)}
                    className="mt-2.5 h-8 w-full rounded-[9px] border border-primary/40 text-[11.5px] font-semibold text-primary hover:bg-accent max-sm:h-10 max-sm:text-[13px]"
                  >
                    ส่งให้ลูกค้าตรวจ{latest ? ` · รอบที่ ${latest.round + 1}` : ""}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {nudging && (
        <TaskTalkDialog project={project} taskName={nudging} onClose={() => setNudging(null)} />
      )}
      {reviewTask && (
        <ReviewDialog row={{ p: project, t: reviewTask }} onClose={() => setReviewing(null)} onDone={() => setReviewing(null)} />
      )}
      {sendTask && <ClientSendSheet project={project} task={sendTask} onClose={() => setSending(null)} />}
      {feedback && <ClientFeedbackSheet token={feedback} onClose={() => setFeedback(null)} />}
    </section>
  );
}

// ─── 3. ทวงงาน / คุยเรื่องงานใบเดียว ────────────────────────────────

/**
 * สายข้อความของงานใบเดียว — PM ทวงที่นี่ ผู้รับงานเห็นในหน้างานที่ได้รับของตัวเอง
 * เดิมไม่มีทางทวงในระบบเลย PM จึงพิมพ์ลงแชทโปรเจคที่ทีมงานเปิดไม่ได้ แล้วไปตามกันในไลน์
 */
function TaskTalkDialog({
  project,
  taskName,
  onClose,
}: {
  project: Project;
  taskName: string;
  onClose: () => void;
}) {
  const talks = taskTalks(usePm(), project.pj, taskName);
  const task = project.tasks.find((t) => t.name === taskName);
  const ro = usePmReadOnly();
  const [tx, setTx] = useState("");
  const [err, setErr] = useState(false);

  function send() {
    const v = tx.trim();
    if (!v) return setErr(true);
    nudgeTask(project.pj, taskName, v, bkkStamp());
    onClose();
  }

  return (
    <Sheet
      title={`ทวงงาน · ${taskName}`}
      onClose={onClose}
      footer={
        ro ? (
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ปิด
          </button>
        ) : (
          <>
            <button type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={onClose}>
              ยกเลิก
            </button>
            <button type="button" className="btn solid btn-solid flex-1 justify-center sm:flex-none" onClick={send}>
              ส่งถึงผู้รับงาน
            </button>
          </>
        )
      }
    >
      <p className="text-[12.5px] text-muted-foreground">
        ผู้รับงาน{" "}
        <b className="font-semibold text-foreground">
          {task?.whos.map((w) => memberOf(w)?.name ?? w).join(" · ") || "ยังไม่มอบหมาย"}
        </b>{" "}
        · กำหนดส่ง {thaiDate(task?.due ?? "")}
      </p>

      <TalkList talks={talks} pmName={project.pm} />

      {!ro && (
        <div className="mt-4">
          <label htmlFor="nudge-tx" className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">
            ข้อความถึงผู้รับงาน
          </label>
          <textarea
            id="nudge-tx"
            autoFocus
            rows={3}
            value={tx}
            onChange={(e) => {
              setTx(e.target.value);
              setErr(false);
            }}
            placeholder="เช่น งานนี้เลยกำหนดมา 2 วันแล้ว ส่งได้เมื่อไร"
            className="field-control w-full resize-y py-2.5 text-[13.5px] leading-relaxed"
          />
          {err && <p className="mt-2 text-[12.5px] text-destructive">เขียนข้อความก่อนส่ง</p>}
        </div>
      )}
    </Sheet>
  );
}

/** สายข้อความของงานใบหนึ่ง — ใช้ทั้งฝั่ง PM และฝั่งผู้รับงาน (my-tasks) */
export function TalkList({ talks, pmName }: { talks: TaskTalk[]; pmName: string }) {
  if (talks.length === 0) {
    return <p className="mt-4 text-[12.5px] text-muted-foreground">ยังไม่มีข้อความเรื่องงานใบนี้</p>;
  }
  return (
    <ul className="mt-4 flex flex-col gap-2">
      {talks.map((m, i) => (
        <li
          key={`${m.at}-${i}`}
          className={`rounded-[12px] px-3.5 py-2.5 ${
            m.nudge ? "bg-[var(--warning-soft)]" : "bg-muted"
          }`}
        >
          <p className="flex flex-wrap items-baseline gap-x-2 text-[11.5px] text-muted-foreground">
            <b className="font-semibold text-foreground">
              {m.who === "PM" ? pmName : (memberOf(m.who)?.name ?? m.who)}
            </b>
            {m.nudge && <span className="font-semibold text-[var(--warning)]">ทวงงาน</span>}
            <span className="num">{thaiStamp(m.at)} น.</span>
          </p>
          <p className="mt-1 text-[13px] leading-relaxed break-words">{m.tx}</p>
        </li>
      ))}
    </ul>
  );
}

// ─── 3. สมาชิกในโปรเจค ─────────────────────────────────────────────

function Members({ project, who, onPick }: { project: Project; who: string | null; onPick: (id: string) => void }) {
  const mem = projectMembers(project);
  /* ตำแหน่งในป้ายชื่ออ่านจากทะเบียนฝ่ายบุคคล (hrPos) ตามต้นแบบ — ไม่พบในทะเบียน ใช้บทบาทในทีมแทน */
  const hr = useHr();
  return (
    <section className="pd-blk pd-memblk">
      <BlockTitle count={`${mem.length} คน`}>สมาชิกในโปรเจค</BlockTitle>
      {mem.length === 0 ? (
        <p className="py-4 text-[12.5px] text-muted-foreground">ยังไม่มีใครถูกมอบหมาย</p>
      ) : (
        <div className="pd-mem flex flex-wrap gap-3.5 p-1">
          {mem.map((id) => {
            const m = memberOf(id);
            const name = m?.name ?? id;
            const open = project.tasks.filter((t) => t.whos.includes(id) && t.status !== "done").length;
            const emp = hr.emp.find((e) => e.id === id);
            const pos = emp ? hrPos(emp.pos).label : (m?.roles ?? []).map(roleLabel).join(" | ");
            const title = `${name} · ${pos} · เหลือ ${open} งาน`;
            return (
              <button
                key={id}
                type="button"
                title={title}
                aria-label={title}
                aria-pressed={who === id}
                data-mem-pick
                onClick={() => onPick(id)}
                className={`block size-11 cursor-pointer overflow-hidden rounded-full transition-opacity ${
                  who === id
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-[var(--background)]"
                    : who
                      ? "opacity-50 hover:opacity-100"
                      : ""
                }`}
              >
                <Avatar id={id} />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/*
 * รูปโปรไฟล์วาดเป็น SVG ในไฟล์ ไม่ดึงรูปจากภายนอก (ยังไม่มีที่เก็บรูปจริง)
 * สีเลือกจากรหัสพนักงานแบบคงที่ คนเดิมได้สีเดิมทุกครั้ง ไม่สุ่มใหม่ทุกครั้งที่วาด
 */
const AV_TONE = [
  { bg: "#FDECEE", fg: "#D0021B" },
  { bg: "#E9EEFB", fg: "#2F55B8" },
  { bg: "#E7F6EE", fg: "#1F7A4D" },
  { bg: "#FDF0E1", fg: "#B26414" },
  { bg: "#F1EBFA", fg: "#6B3FBF" },
  { bg: "#E4F5F6", fg: "#0B7C84" },
  { bg: "#FBEAF3", fg: "#B02A72" },
  { bg: "#EEF1F4", fg: "#4A5568" },
];

function Avatar({ id }: { id: string }) {
  let n = 0;
  for (const ch of id) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  const t = AV_TONE[n % AV_TONE.length];
  return (
    <svg viewBox="0 0 48 48" className="block size-full" aria-hidden="true">
      <rect width="48" height="48" fill={t.bg} />
      <circle cx="24" cy="21" r="8" fill={t.fg} />
      <path d="M9 44c0-7.7 6.7-12.3 15-12.3S39 36.3 39 44z" fill={t.fg} />
    </svg>
  );
}
