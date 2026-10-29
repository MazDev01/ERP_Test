"use client";

/*
 * รายการโปรเจค — โปรเจคที่ยืนยันแผนงานแล้วทั้งหมด แสดงเป็นโฟลเดอร์
 *
 * เป็นโฟลเดอร์ไม่ใช่ตาราง เพราะหน้านี้มีหน้าที่เดียวคือ "หาโปรเจคแล้วเปิด"
 * รายละเอียดทุกอย่างอยู่ในหน้าโปรเจคแล้ว ตรงนี้จึงเหลือแค่ชื่อลูกค้า สถานะ และความคืบหน้า
 * พอให้เลือกถูกใบ โดยไม่ต้องอ่านทั้งแถว
 * สลับเป็นมุมมองแถว (ตารางแบบ Google Drive) ได้ที่ปุ่มมุมขวาบน — ค่าตั้งต้นยังเป็นโฟลเดอร์ (ผู้ใช้สั่ง 16 ต.ค. 2569)
 *
 * ตัวกรองเป็นปุ่มพร้อมจำนวน ไม่ใช่ดรอปดาวน์ เพราะมีแค่สี่แบบ
 * และจำนวนบนปุ่มตอบได้ทันทีว่ามีโปรเจคเลยกำหนดกี่ใบ โดยไม่ต้องกดเข้าไปดู
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { daysBetween, thaiDate, thaiStamp, todayIso } from "@/lib/format";
import { setPmProjectsView, usePmProjectsView, type PmProjectsView } from "@/lib/pm-projects-view";
import { pctColor, planHref, projName, projectHref, projectProgress, type InboxJob, type Project } from "@/lib/pm-data";
import { addAdhocProject, renameProject, usePm, type PlanDraft } from "@/lib/pm-store";
import { services } from "@/lib/pm-data";
import { Sheet } from "./lead-dialogs";
import { PlusIcon } from "./icons";
import { ReadOnlyNote } from "./pm-readonly";
import { useRole } from "@/lib/role";
import { USERS } from "@/lib/mock-data";
import { nameOf } from "@/lib/emp-name";
import { SearchIcon } from "./icons";
import { FOLDER_TONE, FolderArt as FolderIcon } from "./folder-art";
import "@/styles/mobile/pm-projects.css";

type FolderKey = "all" | "plan" | "run" | "late" | "done" | "cancelled";

/*
 * โปรเจคในหน้านี้มาจากสองที่ (ตามต้นแบบ pm-projects.html)
 *   1) pm.projects — วางแผนเสร็จแล้ว มีเฟสและงานย่อยครบ
 *   2) pm.inbox ที่ stage = plan — GM มอบหมาย PM แล้วแต่ยังไม่ยืนยันแผน (ผู้ใช้สั่ง 27 ต.ค. 2569) ต้องเห็นตรงนี้ด้วย
 *      ไม่งั้นได้รับมอบหมายแล้วงานจะหายไปจากสายตา กดแล้วพาไปหน้าวางแผน
 */
type Item = { kind: "project"; p: Project } | { kind: "plan"; j: InboxJob };

export function PmProjectsPage() {
  const pm = usePm();
  const today = todayIso();
  /*
   * SA เปิดหน้านี้ได้เฉพาะโปรเจคที่รับโอนมาเป็นเจ้าของ (Proposal · PM — Transfer Project)
   * โปรเจคของคนอื่นไม่ใช่เรื่องของ SA จึงกรองตั้งแต่ต้นทาง ไม่ใช่ซ่อนแค่บนหน้าจอ
   */
  const role = useRole();
  const mine = role === "ps" ? USERS.ps.name : "";
  const view = usePmProjectsView(role);
  const [folder, setFolder] = useState<FolderKey>("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  /*
   * ไม่มีเมนูสามจุด (ลบ/โอน) บนโฟลเดอร์แล้ว — ลบหรือแก้จากหน้านี้ทำให้ดูย้อนหลังไม่ได้ (ผู้ใช้สั่ง 27 ต.ค. 2569)
   * การโอนโปรเจคยังทำได้ที่หน้ารายละเอียดโปรเจค ซึ่งเก็บประวัติการโอนไว้
   */

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
    /* งานที่ยังรอวางแผนเป็นของ PM ที่ GM มอบหมาย ยังไม่มีเจ้าของโปรเจค จึงไม่ใช่ของ SA */
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

  /* แปลงเป็นแถวของมุมมองแถว — สถานะ/สีเหมือนการ์ดโฟลเดอร์ทุกอย่าง (ผู้ใช้สั่ง 16 ต.ค. 2569) */
  const rowOf = (x: Item, isLate: boolean): Row => {
    if (x.kind === "plan") {
      const j = x.j;
      return {
        pj: j.pj,
        href: planHref(j.pj),
        name: projName(j),
        cus: j.cus,
        tone: FOLDER_TONE.plan,
        status: { text: "รอวางแผน", cls: "t-early" },
        pct: null,
        cancelled: false,
        due: j.planEnd || j.due || "",
        owner: nameOf(j.takenBy),
      };
    }
    const p = x.p;
    const st = stOf(p);
    return {
      pj: p.pj,
      href: projectHref(p.pj),
      name: projName(p),
      cus: p.cus,
      tone:
        st === "cancelled" ? FOLDER_TONE.cancelled : st === "done" ? FOLDER_TONE.done : isLate ? FOLDER_TONE.late : FOLDER_TONE.run,
      status:
        st === "cancelled"
          ? { text: "ยกเลิก", cls: "t-miss" }
          : st === "done"
            ? { text: "เสร็จแล้ว", cls: "t-ok" }
            : isLate
              ? { text: `เลยกำหนด ${daysBetween(p.due, today)} วัน`, cls: "t-late" }
              : { text: "กำลังดำเนินการ", cls: "t-leave" },
      pct: projectProgress(p).pct,
      cancelled: st === "cancelled",
      due: p.due || "",
      owner: nameOf(p.pm),
      project: p,
    };
  };

  return (
    <div className="pj-m space-y-4">
      {/* ชื่อหน้ามุมซ้ายบน — แถบบนจอคอมเป็นเส้นทางแล้ว (ผู้ใช้สั่ง 12 ต.ค. 2569) */}
      {/* ปุ่มสลับมุมมอง แถว/โฟลเดอร์ มุมขวาบนแบบ Google Drive (ผู้ใช้สั่ง 16 ต.ค. 2569)
          มือถือชื่อหน้าซ่อน ปุ่มจึงชิดขวาด้วย ml-auto */}
      <div className="flex items-center gap-3">
        <h1 className="page-h1">{mine ? "โปรเจคที่รับโอน" : "โปรเจค"}</h1>
        <ViewSwitch value={view} onChange={(v) => setPmProjectsView(role, v)} />
      </div>
      <div className="bar">
        <span className="search glass-thin w-full sm:w-[300px]">
          <SearchIcon className="size-[15px] shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาลูกค้า ชื่อโปรเจค หรือขอบเขตงาน"
            aria-label="ค้นหาโปรเจค"
            autoComplete="off"
          />
        </span>
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
      {/* ตัวกรองสถานะอยู่บรรทัดของตัวเองใต้ช่องค้นหา ไม่ถูกบีบเป็นแนวตั้ง (ผู้ใช้สั่ง 16 ต.ค. 2569) */}
        {/* ตัวกรองสถานะขึ้นบรรทัดใหม่เมื่อไม่พอ — ไม่ปัดข้าง (เจ้าของสั่ง 25 ก.ย. 2569)
            ตัวกรองที่อยู่นอกจอเท่ากับไม่มี เพราะไม่มีอะไรบอกว่าเลื่อนต่อได้ */}
        <div
          className="pj-chips flex flex-wrap gap-2"
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

      {adding && <AddProjectDialog onClose={() => setAdding(false)} />}
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
        ) : view === "list" ? (
          /* มุมมองแถว — ใช้ผลกรอง/ค้นหา/แท็บชุดเดียวกับโฟลเดอร์ (ผู้ใช้สั่ง 16 ต.ค. 2569) */
          <ListView
            rows={rows.map((x) => rowOf(x, x.kind === "project" && late(x)))}
          />
        ) : (
          <div className="pj-list grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(168px,1fr))]">
            {rows.map((x) =>
              x.kind === "project" ? (
                <Folder key={x.p.pj} project={x.p} status={stOf(x.p)} today={today} late={late(x)} />
              ) : (
                <PlanFolder key={x.j.pj} job={x.j} draft={pm.drafts[x.j.pj]} />
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
}: {
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
function PlanFolder({ job: j, draft }: { job: InboxJob; draft?: PlanDraft }) {
  return (
    <Link
      href={planHref(j.pj)}
      title={`${projName(j)} · ${j.cus}`}
      className="pj-card group relative flex flex-col items-center gap-0.5 rounded-[14px] px-2.5 pt-[18px] pb-4 text-center transition-colors hover:bg-black/[.045] max-sm:border max-sm:border-border max-sm:bg-card max-sm:pt-3.5 max-sm:active:bg-muted"
    >
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

/* ───────── มุมมองแถว แบบ Google Drive (ผู้ใช้สั่ง 16 ต.ค. 2569) ───────── */

/** หนึ่งแถวในมุมมองแถว — โปรเจคจริงหรืองานรอวางแผน แปลงมาเป็นรูปเดียวกัน */
type Row = {
  pj: string;
  href: string;
  name: string;
  cus: string;
  tone: { back: string; front: string };
  status: { text: string; cls: string };
  /** งานรอวางแผนยังไม่มีความคืบหน้า = null */
  pct: number | null;
  cancelled: boolean;
  due: string;
  owner: string;
  /** มีเฉพาะโปรเจคจริง — ใช้กับเมนูโอนโปรเจค */
  project?: Project;
};

type SortKey = "name" | "cus" | "due" | "pct";

/** ปุ่มสลับ แถว / โฟลเดอร์ — ปุ่มที่เลือกอยู่มีพื้นเน้นและเครื่องหมายถูก เหมือน Drive */
function ViewSwitch({ value, onChange }: { value: PmProjectsView; onChange: (v: PmProjectsView) => void }) {
  const opts: { key: PmProjectsView; label: string; icon: React.ReactNode }[] = [
    {
      key: "list",
      label: "แถว",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      ),
    },
    {
      key: "grid",
      label: "โฟลเดอร์",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" />
          <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" />
          <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" />
          <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" />
        </svg>
      ),
    },
  ];
  return (
    <div role="group" aria-label="มุมมอง" className="ml-auto inline-flex h-9 flex-none overflow-hidden rounded-full border border-border bg-card">
      {opts.map((o, i) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            aria-label={o.label}
            title={o.label}
            onClick={() => onChange(o.key)}
            className={`inline-flex items-center gap-1 px-3.5 transition-colors ${i > 0 ? "border-l border-border" : ""} ${
              on ? "bg-accent text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {on && (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            )}
            {o.icon}
          </button>
        );
      })}
    </div>
  );
}

/** แถบความคืบหน้าเล็ก — ยกเลิกแล้วเป็นสีเทา · งานรอวางแผนขึ้น — */
function MiniProgress({ pct, cancelled }: { pct: number | null; cancelled: boolean }) {
  if (pct === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={`flex items-center gap-2 ${cancelled ? "opacity-70" : ""}`}>
      <span className="block h-1.5 w-[72px] flex-none overflow-hidden rounded bg-muted">
        <i className="block h-full rounded" style={{ width: `${pct}%`, background: cancelled ? "#A3A9B3" : pctColor(pct) }} />
      </span>
      <em className="num text-[12px] font-semibold text-muted-foreground not-italic">{pct}%</em>
    </span>
  );
}

/** หัวคอลัมน์ที่กดเรียงได้ — ลูกศรขึ้น = น้อยไปมาก ลง = มากไปน้อย แบบ Drive */
function SortHead({
  k,
  sort,
  onSort,
  children,
}: {
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 } | null;
  onSort: (k: SortKey) => void;
  children: React.ReactNode;
}) {
  const on = sort?.key === k;
  const desc = on && sort.dir === -1;
  return (
    <th aria-sort={on ? (desc ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`-mx-1 inline-flex items-center gap-1 rounded px-1 hover:bg-black/[.06] ${on ? "text-foreground" : ""}`}
      >
        {children}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`transition-transform ${on ? "" : "opacity-0"} ${desc ? "rotate-180" : ""}`}
        >
          <path d="M12 19V5M6 11l6-6 6 6" />
        </svg>
      </button>
    </th>
  );
}

function ListView({ rows }: { rows: Row[] }) {
  const router = useRouter();
  /* ยังไม่กดหัวคอลัมน์ = ลำดับเดิมเหมือนมุมมองโฟลเดอร์ · กดซ้ำสลับน้อยไปมาก/มากไปน้อย */
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const sorted = sort
    ? [...rows].sort((a, b) => {
        const d = sort.dir;
        if (sort.key === "name") return a.name.localeCompare(b.name, "th") * d;
        if (sort.key === "cus") return a.cus.localeCompare(b.cus, "th") * d;
        if (sort.key === "due") {
          /* ไม่มีกำหนดส่งอยู่ท้ายเสมอ */
          if (!a.due || !b.due) return a.due ? -1 : b.due ? 1 : 0;
          return a.due.localeCompare(b.due) * d;
        }
        /* งานรอวางแผน (ไม่มี %) อยู่ท้ายเสมอ */
        if (a.pct === null || b.pct === null) return a.pct !== null ? -1 : b.pct !== null ? 1 : 0;
        return (a.pct - b.pct) * d;
      })
    : rows;
  const onSort = (key: SortKey) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  return (
    <>
      {/* จอคอม — ตาราง */}
      <div className="hidden rounded-[14px] border border-border bg-card md:block">
        <table className="data-table [&_thead_th:first-child]:rounded-tl-[14px] [&_thead_th:last-child]:rounded-tr-[14px]">
          <thead>
            <tr>
              <SortHead k="name" sort={sort} onSort={onSort}>ชื่อ</SortHead>
              <SortHead k="cus" sort={sort} onSort={onSort}>ลูกค้า</SortHead>
              <th>สถานะ</th>
              <SortHead k="pct" sort={sort} onSort={onSort}>ความคืบหน้า</SortHead>
              <SortHead k="due" sort={sort} onSort={onSort}>กำหนดส่ง</SortHead>
              <th>ผู้รับผิดชอบ</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.pj} className="cursor-pointer" onClick={() => router.push(r.href)}>
                <td>
                  <Link
                    href={r.href}
                    onClick={(e) => e.stopPropagation()}
                    title={`${r.name} · ${r.cus}`}
                    className="flex min-w-0 items-center gap-2.5 font-semibold"
                  >
                    <span className={`flex-none ${r.cancelled ? "opacity-60" : ""}`}>
                      <FolderIcon tone={r.tone} width={24} height={20} />
                    </span>
                    <span className="truncate">{r.name}</span>
                  </Link>
                </td>
                <td className="max-w-[220px] truncate text-muted-foreground">{r.cus || "—"}</td>
                <td>
                  <span className={`tag ${r.status.cls}`}>
                    <i />
                    {r.status.text}
                  </span>
                </td>
                <td>
                  <MiniProgress pct={r.pct} cancelled={r.cancelled} />
                </td>
                <td className="num whitespace-nowrap">{r.due ? thaiDate(r.due) : "—"}</td>
                <td className="whitespace-nowrap">{r.owner || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* มือถือ — แถวย่อ: ไอคอน + ชื่อ + สถานะ + % */}
      <ul className="flex flex-col rounded-[16px] border border-border bg-card md:hidden">
        {sorted.map((r, i) => (
          <li key={r.pj} className={`flex items-center gap-2 pr-1.5 ${i > 0 ? "border-t border-border" : ""}`}>
            <Link href={r.href} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3.5 active:bg-muted">
              <span className={`flex-none ${r.cancelled ? "opacity-60" : ""}`}>
                <FolderIcon tone={r.tone} width={28} height={23} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <b className="truncate text-[14px] font-bold">{r.name}</b>
                <span className="flex items-center gap-2">
                  <span className={`tag ${r.status.cls}`}>{r.status.text}</span>
                  {r.pct !== null && (
                    <em className="num text-[12px] font-semibold text-muted-foreground not-italic">{r.pct}%</em>
                  )}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
