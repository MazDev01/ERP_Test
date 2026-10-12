"use client";

/*
 * รายการโปรเจค — โปรเจคที่ยืนยันแผนงานแล้วทั้งหมด แสดงเป็นโฟลเดอร์
 *
 * เป็นโฟลเดอร์ไม่ใช่ตาราง เพราะหน้านี้มีหน้าที่เดียวคือ "หาโปรเจคแล้วเปิด"
 * รายละเอียดทุกอย่างอยู่ในหน้าโปรเจคแล้ว ตรงนี้จึงเหลือแค่ชื่อลูกค้า สถานะ และความคืบหน้า
 * พอให้เลือกถูกใบ โดยไม่ต้องอ่านทั้งแถว
 *
 * ตัวกรองเป็นปุ่มพร้อมจำนวน ไม่ใช่ดรอปดาวน์ เพราะมีแค่สี่แบบ
 * และจำนวนบนปุ่มตอบได้ทันทีว่ามีโปรเจคเลยกำหนดกี่ใบ โดยไม่ต้องกดเข้าไปดู
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { daysBetween, thaiStamp, todayIso } from "@/lib/format";
import { pctColor, planHref, projName, projectHref, projectProgress, type InboxJob, type Project } from "@/lib/pm-data";
import { addAdhocProject, deleteProject, renameProject, usePm, type PlanDraft } from "@/lib/pm-store";
import { services } from "@/lib/pm-data";
import { Sheet } from "./lead-dialogs";
import { PlusIcon } from "./icons";
import { ReadOnlyNote } from "./pm-readonly";
import { TransferDialog } from "./pm-project-page";
import { useRole } from "@/lib/role";
import { USERS } from "@/lib/mock-data";
import { SearchIcon } from "./icons";
import "@/styles/mobile/pm-projects.css";

type FolderKey = "all" | "plan" | "run" | "late" | "done" | "cancelled";

/*
 * โปรเจคในหน้านี้มาจากสองที่ (ตามต้นแบบ pm-projects.html)
 *   1) pm.projects — วางแผนเสร็จแล้ว มีเฟสและงานย่อยครบ
 *   2) pm.inbox ที่ stage = plan — รับงานแล้วแต่ยังไม่ยืนยันแผน ต้องเห็นตรงนี้ด้วย
 *      ไม่งั้นรับงานแล้วงานจะหายไปจากสายตา กดแล้วพาไปหน้าวางแผน
 */
type Item = { kind: "project"; p: Project } | { kind: "plan"; j: InboxJob };

/* สีโฟลเดอร์ = สีสถานะของโปรเจค ไม่มีจุดสถานะแยก (ผู้ใช้สั่ง 8 ต.ค. 2569) */
const FOLDER_TONE: Record<"plan" | "run" | "late" | "done" | "cancelled", { back: string; front: string }> = {
  plan: { back: "#FBE3BF", front: "#F2B45C" },
  run: { back: "#C7D4F2", front: "#8FA6E8" },
  late: { back: "#F8C9C9", front: "#EC8A8A" },
  done: { back: "#BFE6D2", front: "#7FCFA7" },
  cancelled: { back: "#E3E5E9", front: "#C3C8D0" },
};

export function PmProjectsPage() {
  const pm = usePm();
  const today = todayIso();
  /*
   * SA เปิดหน้านี้ได้เฉพาะโปรเจคที่รับโอนมาเป็นเจ้าของ (Proposal · PM — Transfer Project)
   * โปรเจคของคนอื่นไม่ใช่เรื่องของ SA จึงกรองตั้งแต่ต้นทาง ไม่ใช่ซ่อนแค่บนหน้าจอ
   */
  const role = useRole();
  const mine = role === "ps" ? USERS.ps.name : "";
  const [folder, setFolder] = useState<FolderKey>("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  /* โปรเจคที่กดลบ — รอยืนยันก่อนลบจริง */
  const [del, setDel] = useState<{ pj: string; name: string } | null>(null);
  /* โปรเจคที่กดโอน */
  const [moving, setMoving] = useState<Project | null>(null);

  /* เลยกำหนด = ยังไม่ส่งมอบ และวันนี้เลยวันกำหนดส่งไปแล้ว (งานรอวางแผนไม่นับ)
     ตัวเลขบนปุ่มทุกปุ่มในหน้านี้นับเป็น "โปรเจค" ไม่ใช่ใบงานย่อย — ชื่อปุ่มจึงบอกหน่วยไว้ด้วย
     เพราะแดชบอร์ด PM มีการ์ด "งานย่อยล่าช้า" ที่นับใบงาน ไม่ใช่โปรเจค */
  /* ส่งมอบแล้วต้องเสร็จทุกงาน — ยังมีงานค้างนับเป็นกำลังดำเนินการ ไม่ใช่ส่งมอบแล้ว (ผู้ใช้สั่ง 8 ต.ค. 2569) */
  const stOf = (p: Project) => (p.status === "done" && p.tasks.some((t) => t.status !== "done") ? "running" : p.status);

  const late = (x: Item) =>
    x.kind === "project" && stOf(x.p) === "running" && daysBetween(x.p.due, today) > 0;

  /* ส่งมอบแล้วแต่ยังมีงานย่อยค้าง — งานที่ยังไม่เสร็จก็ยังเป็นงานของใครสักคน ต้องเห็นจากหน้ารายการ */

  const items: Item[] = [
    ...pm.projects.filter((p) => !mine || p.pm === mine).map((p) => ({ kind: "project" as const, p })),
    /* งานที่ยังรอวางแผนเป็นของ PM ที่รับงานเข้ามา ยังไม่มีเจ้าของโปรเจค จึงไม่ใช่ของ SA */
    ...(mine
      ? []
      : pm.inbox
          .filter((j) => j.stage === "plan" && !pm.projects.some((p) => p.pj === j.pj))
          .map((j) => ({ kind: "plan" as const, j }))),
  ];

  const folders: { key: FolderKey; name: string; test: (x: Item) => boolean }[] = [
    { key: "all", name: "ทุกโปรเจค", test: () => true },
    { key: "plan", name: "รอวางแผน", test: (x) => x.kind === "plan" },
    { key: "run", name: "กำลังดำเนินการ", test: (x) => x.kind === "project" && stOf(x.p) === "running" && !late(x) },
    { key: "late", name: "โปรเจคเลยกำหนด", test: late },
    { key: "done", name: "เสร็จแล้ว", test: (x) => x.kind === "project" && stOf(x.p) === "done" },
    /* ดีลถูกยกเลิกหลังปิดการขาย — เก็บไว้ดูย้อนหลัง งานหยุดแล้ว */
    { key: "cancelled", name: "ยกเลิก", test: (x) => x.kind === "project" && x.p.status === "cancelled" },
  ];
  const active = folders.find((f) => f.key === folder) ?? folders[0];

  const q = query.trim().toLowerCase();
  const rows = items.filter((x) => {
    if (!active.test(x)) return false;
    const r = x.kind === "project" ? x.p : x.j;
    return !q || `${projName(r)} ${r.cus} ${r.pj} ${r.deal ?? ""} ${r.scope} ${r.quo}`.toLowerCase().includes(q);
  });

  return (
    <div className="pj-m space-y-4">
      {/* ไม่มีหัวข้อหน้า — แถบบนบอกชื่อหน้าและวันที่อยู่แล้ว ปุ่มเลื่อนขึ้นชิดขวา (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
      <h1 className="sr-only">{mine ? "โปรเจคที่รับโอน" : "โปรเจค"}</h1>
      {/* ตัวกรองสถานะอยู่แถวเดียวกับช่องค้นหา (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
      <div className="bar">
        <span className="search glass-thin w-full sm:w-[300px]">
          <SearchIcon className="size-[15px] shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาลูกค้า เลขที่โปรเจค หรือขอบเขตงาน"
            aria-label="ค้นหาโปรเจค"
            autoComplete="off"
          />
        </span>
        {/* ตัวกรองสถานะขึ้นบรรทัดใหม่เมื่อไม่พอ — ไม่ปัดข้าง (เจ้าของสั่ง 25 ก.ย. 2569)
            ตัวกรองที่อยู่นอกจอเท่ากับไม่มี เพราะไม่มีอะไรบอกว่าเลื่อนต่อได้ */}
        <div
          className="pj-chips flex flex-1 flex-wrap gap-2"
          role="group"
          aria-label="กรองตามสถานะโปรเจค"
        >
          {folders.map((f) => {
            const on = f.key === folder;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={on}
                onClick={() => setFolder(f.key)}
                className={`pj-chip${on ? " on" : ""} inline-flex h-[34px] items-center gap-2 rounded-[20px] border px-[15px] text-[13px] font-semibold max-sm:h-10 max-sm:flex-none max-sm:whitespace-nowrap ${
                  on
                    ? "border-primary bg-accent text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"
                }`}
              >
                {f.name}
                <b className={`num text-[11px] font-bold ${on ? "text-primary" : "text-muted-foreground"}`}>
                  {items.filter(f.test).length}
                </b>
              </button>
            );
          })}
        </div>

        <div className="tools w-full sm:w-auto">
          {/* PM เพิ่มโปรเจคเองได้ทันที ไม่ต้องรอรับงานจากกล่องงานเข้า (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
          {!mine && (
            <button type="button" className="btn solid btn-solid whitespace-nowrap" onClick={() => setAdding(true)}>
              <PlusIcon className="size-4" strokeWidth={2.4} />
              เพิ่มโปรเจค
            </button>
          )}
        </div>
      </div>
      {adding && <AddProjectDialog onClose={() => setAdding(false)} />}
      {moving && <TransferDialog project={moving} onClose={() => setMoving(null)} />}
      {del && <DeleteDialog pj={del.pj} name={del.name} onClose={() => setDel(null)} />}
      <ReadOnlyNote />

      <section>
        <p className="pj-sech mb-3 flex items-center gap-2.5 text-[15px] font-bold">
          โปรเจค
          <b className="num rounded-[20px] bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
            {rows.length}
          </b>
        </p>
        {rows.length === 0 ? (
          <p className="pj-empty p-10 text-center text-[13px] text-muted-foreground">ไม่พบโปรเจคที่ตรงกับเงื่อนไข</p>
        ) : (
          <div className="pj-list grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(168px,1fr))]">
            {rows.map((x) =>
              x.kind === "project" ? (
                <Folder key={x.p.pj} project={x.p} status={stOf(x.p)} today={today} late={late(x)} onDelete={mine ? undefined : () => setDel({ pj: x.p.pj, name: projName(x.p) })} onTransfer={mine ? undefined : () => setMoving(x.p)} />
              ) : (
                <PlanFolder key={x.j.pj} job={x.j} draft={pm.drafts[x.j.pj]} onDelete={mine ? undefined : () => setDel({ pj: x.j.pj, name: projName(x.j) })} />
              ),
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Folder({
  project: p,
  status: st,
  today,
  late,
  onDelete,
  onTransfer,
}: {
  onDelete?: () => void;
  onTransfer?: () => void;
  project: Project;
  /** สถานะจริง — ส่งมอบแล้วแต่ยังมีงานค้าง นับเป็นกำลังดำเนินการ */
  status: Project["status"];
  today: string;
  late: boolean;
}) {
  const pr = projectProgress(p);
  const status =
    st === "cancelled"
      ? { text: "ยกเลิก", tone: FOLDER_TONE.cancelled }
      : st === "done"
      ? { text: "เสร็จแล้ว", tone: FOLDER_TONE.done }
      : late
        ? { text: `เลยกำหนด ${daysBetween(p.due, today)} วัน`, tone: FOLDER_TONE.late }
        : { text: "กำลังดำเนินการ", tone: FOLDER_TONE.run };

  return (
    <Link
      href={projectHref(p.pj)}
      title={`${projName(p)} · ${p.cus}`}
      className="pj-card group relative flex flex-col items-center gap-0.5 rounded-[14px] px-2.5 pt-[18px] pb-4 text-center transition-colors hover:bg-black/[.045] max-sm:border max-sm:border-border max-sm:bg-card max-sm:pt-3.5 max-sm:active:bg-muted"
    >
      {onDelete && <CardMenu onDelete={onDelete} onTransfer={st === "cancelled" ? undefined : onTransfer} />}
      <StatusIcon label={status.text} dim={p.status === "cancelled"}>
        <FolderIcon tone={status.tone} />
        <MobileFolderIcon />
      </StatusIcon>
      {/* แถบความคืบหน้าอยู่ใต้รูปโฟลเดอร์ กว้างเท่าโฟลเดอร์พอดี (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
      {/* ยกเลิกแล้วยังเห็นเปอร์เซ็นต์ที่ทำไปถึง แต่เป็นสีเทา (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
      <span className={`pj-pg flex items-center gap-1.5 ${st === "cancelled" ? "opacity-70" : ""}`} style={{ width: 76, marginTop: 4 }}>
        <span className="pj-bar block h-1 min-w-0 flex-1 overflow-hidden rounded bg-muted">
          <i
            className="block h-full rounded"
            style={{ width: `${pr.pct}%`, background: st === "cancelled" ? "#A3A9B3" : pctColor(pr.pct) }}
          />
        </span>
        <em className="pj-pct num flex-none text-[10px] leading-none font-semibold text-muted-foreground not-italic">{pr.pct}%</em>
      </span>
      {/* ชื่อโปรเจคเป็นหัว ลูกค้าเป็นบรรทัดรอง (PM-BR-03) */}
      <NameEdit pj={p.pj} name={projName(p)} />
      <em className="pj-cus max-w-full truncate text-[11px] text-muted-foreground not-italic">{p.cus}</em>
      {p.status === "cancelled" && (
        <em className="pj-hint pj-hint-muted mt-[7px] line-clamp-2 max-w-full text-[10.5px] text-muted-foreground not-italic">
          โครงการถูกยกเลิก
        </em>
      )}
    </Link>
  );
}

/** งานที่รับแล้วแต่ยังไม่ยืนยันแผน — ยังไม่มีอะไรให้ดูในหน้ารายละเอียด จึงพาไปวางแผนเลย */
function PlanFolder({ job: j, draft, onDelete }: { job: InboxJob; draft?: PlanDraft; onDelete?: () => void }) {
  return (
    <Link
      href={planHref(j.pj)}
      title={`${projName(j)} · ${j.cus}`}
      className="pj-card group relative flex flex-col items-center gap-0.5 rounded-[14px] px-2.5 pt-[18px] pb-4 text-center transition-colors hover:bg-black/[.045] max-sm:border max-sm:border-border max-sm:bg-card max-sm:pt-3.5 max-sm:active:bg-muted"
    >
      {onDelete && <CardMenu onDelete={onDelete} />}
      <StatusIcon label={j.phases.length ? "ยังไม่ยืนยันแผน" : "ยังไม่มีแผนงาน"}>
        <FolderIcon tone={FOLDER_TONE.plan} />
        <MobileFolderIcon />
      </StatusIcon>
      <NameEdit pj={j.pj} name={projName(j)} />
      <em className="pj-cus max-w-full truncate text-[11px] text-muted-foreground not-italic">{j.cus}</em>
      {/* ร่างที่ PM กรอกค้างไว้ — คนอื่นต้องเห็นว่ามีร่างอยู่ ไม่ใช่เห็นแค่ว่ายังไม่ยืนยัน */}
      {draft ? (
        <em className="pj-hint mt-[7px] text-[10.5px] font-semibold text-[var(--warning)] not-italic">
          มีร่างแผน · แก้ล่าสุด {thaiStamp(draft.at)}
        </em>
      ) : null}
    </Link>
  );
}

/** ไอคอนโฟลเดอร์ — สีบอกสถานะ ชี้เมาส์เห็นชื่อสถานะ · โปรแกรมอ่านหน้าจออ่านจาก aria-label */
function StatusIcon({
  label,
  dim,
  children,
}: {
  label: string;
  /** โปรเจคที่ยกเลิกแล้ว — โฟลเดอร์จางกว่าอันอื่น */
  dim?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span role="img" aria-label={label} title={label} className={`relative inline-block ${dim ? "opacity-60" : ""}`}>
      {children}
    </span>
  );
}

function FolderIcon({ tone }: { tone: { back: string; front: string } }) {
  return (
    <svg viewBox="0 0 64 52" width="76" height="62" aria-hidden="true" className="block">
      <path
        fill={tone.back}
        d="M2 8a6 6 0 0 1 6-6h16l6 7h26a6 6 0 0 1 6 6v31a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6Z"
      />
      <path fill={tone.front} d="M2 17h60v25a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6Z" />
    </svg>
  );
}

/** ไอคอนโฟลเดอร์ในวงกลมฟ้า — แสดงเฉพาะการ์ดบนมือถือ (เดสก์ท็อปซ่อนด้วย hidden) */
function MobileFolderIcon() {
  return (
    <span className="pj-ico hidden" aria-hidden="true">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    </span>
  );
}

/** กล่องเพิ่มโปรเจค — สร้างแล้วพาไปหน้าวางแผนของโปรเจคนั้น */
function AddProjectDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [cus, setCus] = useState("");
  const [service, setService] = useState("");
  const [scope, setScope] = useState("");
  const [warn, setWarn] = useState("");
  const cls = "field-control h-10 text-[13.5px]";
  function save() {
    if (!name.trim()) return setWarn("กรอกชื่อโปรเจค");
    /* ไม่มีวันในฟอร์ม — วันเริ่ม/กำหนดส่งได้จากตอนวางแผน · สร้างแล้วอยู่หน้าเดิม (ผู้ใช้สั่ง 8 ต.ค. 2569) */
    addAdhocProject({ name, cus, service, scope });
    onClose();
  }
  return (
    <Sheet
      title="เพิ่มโปรเจค"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn solid btn-solid" onClick={save}>
            เพิ่มโปรเจค
          </button>
        </>
      }
    >
      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-muted-foreground sm:col-span-2">
          <span>
            ชื่อโปรเจค<span className="text-destructive">*</span>
          </span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${cls} ${warn && !name.trim() ? "!border-destructive" : ""}`} placeholder="เช่น ถ่ายภาพสินค้าด่วน" />
        </label>
        <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-muted-foreground">
          ลูกค้า
          <input value={cus} onChange={(e) => setCus(e.target.value)} className={cls} placeholder="เว้นว่างได้ ถ้าเป็นงานภายใน" />
        </label>
        <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-muted-foreground">
          ประเภทบริการ
          <select value={service} onChange={(e) => setService(e.target.value)} className={`${cls} cursor-pointer`}>
            <option value="">ไม่ระบุ</option>
            {services().map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-muted-foreground sm:col-span-2">
          รายละเอียดงาน
          <textarea
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            rows={3}
            className="field-control py-2 text-[13.5px]"
            style={{ height: "auto" }}
          />
        </label>
      </div>
    </Sheet>
  );
}

/** ปุ่มสามจุดมุมขวาบนของการ์ด — โอนโปรเจค / ลบ (ผู้ใช้สั่ง 8 ต.ค. 2569) · โผล่เมื่อชี้เมาส์ (มือถือเห็นตลอด) */
function CardMenu({ onDelete, onTransfer }: { onDelete: () => void; onTransfer?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const pick = (fn: () => void) => (e: React.MouseEvent) => {
    stop(e);
    setOpen(false);
    fn();
  };
  const item = "flex w-full items-center px-3.5 py-2 text-left text-[13px] font-semibold hover:bg-muted";
  return (
    <span ref={ref} className="absolute z-10" style={{ top: 6, right: 6 }}>
      <button
        type="button"
        aria-label="ตัวเลือกโปรเจค"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          stop(e);
          setOpen((v) => !v);
        }}
        className={`grid size-7 place-items-center rounded-full text-muted-foreground transition-opacity hover:bg-black/[.08] hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100 ${open ? "bg-black/[.08] opacity-100" : "opacity-0"}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {open && (
        <span
          role="menu"
          className="absolute right-0 mt-1 block min-w-[140px] overflow-hidden rounded-[10px] border border-border bg-card py-1 shadow-lg"
          style={{ top: "100%" }}
        >
          {onTransfer && (
            <button type="button" role="menuitem" className={item} onClick={pick(onTransfer)}>
              โอนโปรเจค
            </button>
          )}
          <button type="button" role="menuitem" className={`${item} text-destructive`} onClick={pick(onDelete)}>
            ลบ
          </button>
        </span>
      )}
    </span>
  );
}

function DeleteDialog({ pj, name, onClose }: { pj: string; name: string; onClose: () => void }) {
  return (
    <Sheet
      title="ลบโปรเจค"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid"
            onClick={() => {
              deleteProject(pj);
              onClose();
            }}
          >
            ลบโปรเจค
          </button>
        </>
      }
    >
      <p className="text-[13.5px]">
        ลบ <b>{name}</b> ใช่ไหม? งาน ไฟล์ และข้อความทั้งหมดในโปรเจคนี้จะหายไปและกู้คืนไม่ได้
      </p>
    </Sheet>
  );
}

/**
 * ชื่อโปรเจคใต้โฟลเดอร์ — แก้ชื่อได้ในที่ แบบโฟลเดอร์ในคอม (ผู้ใช้สั่ง 8 ต.ค. 2569)
 * กดที่ชื่อเพื่อแก้ · Enter หรือคลิกที่อื่นเพื่อบันทึก · Esc ยกเลิก · กดที่ไอคอนโฟลเดอร์เพื่อเปิดโปรเจค
 */
function NameEdit({ pj, name }: { pj: string; name: string }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(name);
  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  function done(save: boolean) {
    if (save && v.trim() && v.trim() !== name) renameProject(pj, v);
    setEdit(false);
  }
  if (edit) {
    return (
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onClick={stop}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => done(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            stop(e);
            done(true);
          } else if (e.key === "Escape") {
            stop(e);
            setV(name);
            done(false);
          }
        }}
        aria-label="ชื่อโปรเจค"
        className="mt-[9px] w-full rounded-md border border-primary bg-card px-1.5 py-0.5 text-center text-[13.5px] font-bold outline-none"
      />
    );
  }
  return (
    <b
      role="button"
      tabIndex={0}
      title="ดับเบิลคลิกเพื่อแก้ชื่อ"
      /* คลิกเดียวไม่ทำอะไร (กันเปิดโปรเจคก่อนดับเบิลคลิกครบ) · ดับเบิลคลิกเพื่อแก้ชื่อ (ผู้ใช้สั่ง 8 ต.ค. 2569) */
      onClick={stop}
      onDoubleClick={(e) => {
        stop(e);
        setV(name);
        setEdit(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "F2" || e.key === "Enter") {
          stop(e);
          setV(name);
          setEdit(true);
        }
      }}
      className="pj-name mt-[9px] line-clamp-2 max-w-full cursor-default rounded-md px-1 select-none text-[13.5px] leading-snug font-bold hover:bg-black/[.06]"
    >
      {name}
    </b>
  );
}
