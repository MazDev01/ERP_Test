"use client";

/*
 * งานที่ได้รับ — มุมของทีมงาน (ตามดีไซน์ที่ผู้ใช้ส่งมา 16 ก.ย. 2569)
 *
 * คู่กับหน้า "งานรอตรวจ" ของ PM (pm-reviews-page.tsx) งานใบเดียวกันเดินสองทาง
 *   ได้รับ → กดส่ง → รอ PM ตรวจ → ผ่าน หรือ ตีกลับมาแก้ → ส่งใหม่
 *
 * ขั้นของงานอ่านจากสถานะจริงทุกครั้ง ไม่ได้เก็บแยกไว้ต่างหาก
 * เพราะขั้นที่เก็บแยกคือจุดที่จะเริ่มไม่ตรงกับสถานะจริงเป็นที่แรก
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { addDays, bkkStamp, daysBetween, thaiDate, thaiStamp, todayIso } from "@/lib/format";
import { TASK_STATUS, fileKindLabel, lastSub, projName, type Project, type ProjectTask } from "@/lib/pm-data";
import { clearTaskWait, memberName, openNudge, postTaskTalk, reviewerOf, setTaskWait, taskHomes, taskTalks, usePm, type TaskTalk } from "@/lib/pm-store";
import type { WaitKind } from "@/lib/pm-data";
import { submitWorkFlow } from "@/lib/flow";
import { ReviewDialog } from "./pm-reviews-page";
import { ASK_FROM_LABEL, isLoose } from "@/lib/task-ask";
import { AskCard, ProposeSheet } from "./task-ask-ui";
import { useProfile } from "@/lib/profile-data";
import { nameOf } from "@/lib/emp-name";
import { FileDrop, type PickedFile } from "./file-drop";
import { Field, Sheet } from "./lead-dialogs";
import { SearchBox } from "./sales-ui";
import { TalkList } from "./pm-project-page";
import { ProjectChat } from "./project-chat";
import { ClientCommentList } from "./client-review-pm";
import { ClientFixBoard, openFixes } from "./review-pins";
import { FileNotesView } from "./file-notes";
import { roundsOfTask, useClientReviews, type ReviewRound } from "@/lib/client-review-store";
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  FileIcon,
  InboxIcon,
  PencilIcon,
  SendIcon,
} from "./icons";
import "@/styles/mobile/my-tasks.css";
import { LOCK_SEND_WHILE_WAITING, WAIT_KIND_LABEL, blockers, manualWaitDays, readySince, waitingDays } from "@/lib/task-deps";

/* ask = งานที่เสนอเองแล้วรอ PM อนุมัติ หรือไม่อนุมัติ (20 ต.ค. 2569) — ยังไม่ใช่งานจริง
   review = งานของคนอื่นที่เราเป็นผู้ตรวจ ส่งมาแล้วรอเรา — ทีมงานไม่มีหน้าอื่นให้ตรวจ (ผู้ใช้สั่ง 21 ต.ค. 2569)
   ผู้ตรวจ = ผู้สั่งเสมอ · แท็บนี้ขึ้นเฉพาะคนที่สั่งงานคนอื่นไว้ (ผู้ใช้สั่ง 27 ต.ค. 2569) */
type Stage = "recv" | "sent" | "revise" | "done" | "ask" | "review";

/*
 * หน้าตาของแต่ละขั้น — สีเดียวกันทั้งการ์ดสรุปข้างบนและไอคอนหน้าการ์ดงาน
 * คนใช้จะได้กวาดตาแล้วรู้ทันทีว่าใบไหนอยู่ขั้นไหน โดยไม่ต้องอ่านป้าย
 */
const LOOK: Record<Stage, { label: string; icon: typeof InboxIcon; tone: string }> = {
  recv: { label: "งานที่ได้รับ", icon: InboxIcon, tone: "bg-muted text-muted-foreground" },
  sent: {
    /* ผู้ตรวจ = ผู้สั่ง ไม่ใช่ PM เสมอไป — ชื่อผู้ตรวจอยู่บนการ์ด (ผู้ใช้สั่ง 27 ต.ค. 2569) */
    label: "รอตรวจ",
    icon: ClockIcon,
    tone: "bg-[var(--warning-soft)] text-[var(--warning)]",
  },
  revise: {
    label: "งานที่ต้องแก้ไข",
    icon: PencilIcon,
    tone: "bg-[var(--destructive-soft)] text-destructive",
  },
  done: {
    label: "งานเสร็จแล้ว",
    icon: CheckCircleIcon,
    tone: "bg-[var(--success-soft)] text-[var(--success)]",
  },
  ask: {
    label: "รอ Project Manager อนุมัติ",
    icon: SendIcon,
    tone: "bg-[var(--info-soft)] text-[var(--info)]",
  },
  review: {
    label: "รอฉันตรวจ",
    icon: CheckCircleIcon,
    tone: "bg-accent text-primary",
  },
};

/* ไม่มีการ์ด "รอ PM อนุมัติ" แล้ว — ทีมไม่เสนองานเอง (ผู้ใช้สั่ง 29 ต.ค. 2569) */
const STAGES: Stage[] = ["recv", "sent", "revise", "done", "review"];

/* มือถือ: วงกลมไอคอนหน้าการ์ดงาน ย้อมตามขั้น (ต้นแบบ mt-mobile .tk-thumb.tk-c1–c4) */
const M_TINT: Record<Stage, { bg: string; fg: string }> = {
  recv: { bg: "#F4EEEF", fg: "#C8102E" },
  sent: { bg: "#FDEDD6", fg: "#94500A" },
  revise: { bg: "#FCE3E7", fg: "#B0101F" },
  done: { bg: "#DDF2E6", fg: "#0F7049" },
  ask: { bg: "#E3EDFB", fg: "#1F5FAD" },
  review: { bg: "#F4EEEF", fg: "#C8102E" },
};

/* สิ่งที่ PM เปลี่ยนล่าสุดในงานใบนี้ — ผู้รับงานต้องรู้ว่าของเดิมไม่เหมือนเดิมแล้ว */
const CHANGE_LABEL: Record<"assign" | "due" | "owner", string> = {
  assign: "งานใหม่",
  due: "เลื่อนกำหนดส่ง",
  owner: "เปลี่ยนผู้รับผิดชอบ",
};


/* ไฟล์ที่แนบในกล่องส่งงานอัปโหลดจำลองนานเท่านี้ (ตรงกับ UPLOAD_MS ใน file-drop.tsx)
   ส่งก่อนครบเวลาไม่ได้ ต้องรอให้ไฟล์อัปโหลดเสร็จก่อน ตามต้นแบบ */
const UPLOAD_WAIT_MS = 1300;

type Row = { p: Project; t: ProjectTask };

/** ขั้นของงานตามเหตุการณ์จริง — ยังไม่เคยส่ง · รอตรวจ · ถูกตีกลับ · ผ่านแล้ว */
function stageOf(t: ProjectTask): Stage {
  if (t.status === "done") return "done";
  if (t.status === "revise") return "revise";
  /* รอลูกค้าตรวจ (wait) — ทีมส่งไปแล้ว ยังไม่ใช่งานที่ต้องลงมือ อยู่แท็บรอตรวจเหมือนรอ PM */
  if (t.status === "sent" || t.status === "wait") return "sent";
  return "recv";
}

/**
 * อ่านลิงก์ที่มาจากกระดิ่ง — ?stage= บอกว่าเปิดแท็บไหน · ?find= บอกว่าเจาะหางานใบไหน
 *
 * ต้องสร้างหน้าใหม่ทุกครั้งที่พารามิเตอร์เปลี่ยน เพราะถ้าอยู่หน้านี้อยู่แล้วกดกระดิ่ง
 * URL เปลี่ยนแต่คอมโพเนนต์ไม่ได้โหลดใหม่ ค่าตั้งต้นใน useState จะไม่อ่านซ้ำ
 * แล้วกดไปก็จะไม่เห็นงานที่ต้องการ
 */
export function MyTasksPage() {
  const params = useSearchParams();
  return (
    <MyTasks
      key={params.toString()}
      initialStage={toStage(params.get("stage"))}
      initialQuery={params.get("find") ?? ""}
    />
  );
}

function toStage(v: string | null): Stage {
  return v === "sent" || v === "revise" || v === "done" || v === "ask" || v === "review" ? v : "recv";
}

function MyTasks({ initialStage, initialQuery }: { initialStage: Stage; initialQuery: string }) {
  const pm = usePm();
  const me = useProfile();
  const today = todayIso();

  const [pickedStage, setStage] = useState<Stage>(initialStage);
  const [query, setQuery] = useState(initialQuery);
  /** การ์ดที่เปิดดูรายละเอียดอยู่ */
  const [viewing, setViewing] = useState<Row | null>(null);
  /** การ์ดที่กำลังกรอกฟอร์มส่งงาน */
  const [sending, setSending] = useState<Row | null>(null);
  /** การ์ดที่กำลังเปิดคุยกับ PM เรื่องงานใบนั้น */
  const [talking, setTalking] = useState<Row | null>(null);
  /* แชทกลุ่มของโปรเจคที่เปิดอยู่ — มีได้ทีละหน้าต่าง กดของอีกงานก็สลับสาย (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  const [chatPj, setChatPj] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const chatProject = pm.projects.find((p) => p.pj === chatPj);
  const [toast, setToast] = useState("");
  const [proposing, setProposing] = useState(false);
  /** การ์ดที่กำลังแจ้งรอข้อมูล (คนทำกดเอง — ผู้ใช้สั่ง 21 ต.ค. 2569) */
  const [waitingRow, setWaitingRow] = useState<Row | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /* จอมือถือ: กดการ์ดสรุปแล้วเลื่อนลงไปที่รายการงาน ตามต้นแบบ (scrollToList)
     จอกว้างเห็นรายการอยู่แล้ว ไม่ต้องเลื่อน */
  function toList() {
    const el = listRef.current;
    if (!el || !window.matchMedia("(max-width: 639px)").matches) return;
    /* รายการสั้นเลื่อนขึ้นไม่ถึงใต้หัวหน้า ให้พื้นที่รายการสูงอย่างน้อยเท่าจอที่เหลือ */
    el.style.minHeight = `${Math.max(0, window.innerHeight - 180)}px`;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => el.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" }));
  }

  /* งานของตัวเองเท่านั้น — จับคู่ด้วยรหัสพนักงานที่อยู่ในทีมของโปรเจค */
  const mine = useMemo<Row[]>(
    () =>
      /* โปรเจคที่ถูกยกเลิก งานหยุด ไม่ต้องทำต่อ · งานนอกโปรเจคที่ PM อนุมัติแล้วรวมอยู่ด้วย (taskHomes) */
      taskHomes(pm)
        .filter((p) => p.status !== "cancelled")
        .flatMap((p) =>
          p.tasks.filter((t) => t.whos.includes(me.employeeId)).map((t) => ({ p, t })),
        ),
    [pm, me.employeeId],
  );

  /* ใบที่เสนอไปแล้วยังไม่อนุมัติ หรือไม่อนุมัติแต่ยังไม่กดรับทราบ */
  const asks = useMemo(
    () =>
      (pm.asks ?? [])
        .filter((a) => a.by === me.employeeId && !a.ok && !a.gone)
        .sort((a, b) => b.at.localeCompare(a.at)),
    [pm.asks, me.employeeId],
  );
  const askRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return asks.filter((a) => !q || `${a.name} ${a.brief} ${a.fromName}`.toLowerCase().includes(q));
  }, [asks, query]);

  /* งานของคนอื่นที่เราสั่ง (ผู้ตรวจ = ผู้สั่งเสมอ — ผู้ใช้สั่ง 27 ต.ค. 2569) ส่งมาแล้ว — ทุกโปรเจค + งานนอกโปรเจค · ที่ส่งมาก่อนขึ้นก่อน (ผู้ใช้สั่ง 21 ต.ค. 2569) */
  const toReview = useMemo<Row[]>(
    () =>
      taskHomes(pm)
        .filter((p) => p.status !== "cancelled")
        .flatMap((p) =>
          p.tasks
            .filter((t) => t.status === "sent" && reviewerOf(t, p) === me.employeeId)
            .map((t) => ({ p, t })),
        )
        .sort((a, b) => (lastSub(a.t)?.at ?? "").localeCompare(lastSub(b.t)?.at ?? "")),
    [pm, me.employeeId],
  );
  const reviewRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return toReview.filter(
      (x) => !q || `${x.t.name} ${projName(x.p)} ${x.p.cus} ${memberName(x.t.whos[0] ?? "")}`.toLowerCase().includes(q),
    );
  }, [toReview, query]);
  const [reviewing, setReviewing] = useState<Row | null>(null);

  /*
   * แท็บ "รอฉันตรวจ" ขึ้นเฉพาะคนที่สั่งงานคนอื่นไว้ (มีงานที่ยังไม่ปิดซึ่งตัวเองเป็นผู้ตรวจ)
   * คนที่ไม่เคยสั่งงานใครไม่เห็นแท็บนี้เลย (ผู้ใช้สั่ง 27 ต.ค. 2569)
   */
  const showReview = useMemo(
    () =>
      toReview.length > 0 ||
      taskHomes(pm).some(
        (p) =>
          p.status !== "cancelled" &&
          p.tasks.some((t) => t.status !== "done" && t.whos[0] !== me.employeeId && reviewerOf(t, p) === me.employeeId),
      ),
    [pm, me.employeeId, toReview.length],
  );
  const stages = showReview ? STAGES : STAGES.filter((k) => k !== "review");
  /* เปิดลิงก์ ?stage=review แต่ไม่มีแท็บนี้ → แท็บงานที่ได้รับ */
  const stage: Stage = !showReview && pickedStage === "review" ? "recv" : pickedStage;

  const counts = useMemo(() => {
    const out: Record<Stage, number> = { recv: 0, sent: 0, revise: 0, done: 0, ask: asks.length, review: toReview.length };
    for (const x of mine) out[stageOf(x.t)] += 1;
    return out;
  }, [mine, asks.length, toReview.length]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mine
      .filter((x) => stageOf(x.t) === stage)
      .filter(
        (x) => !q || `${x.t.name} ${projName(x.p)} ${x.p.cus} ${x.t.brief ?? ""}`.toLowerCase().includes(q),
      )
      /* งานที่เริ่มได้ขึ้นก่อน งานที่ยังรอข้อมูลตามท้าย — แล้วเรียงตามกำหนดส่ง */
      .sort(
        (a, b) =>
          Number(blockers(a.p.tasks, a.t).length > 0) - Number(blockers(b.p.tasks, b.t).length > 0) ||
          a.t.due.localeCompare(b.t.due),
      );
  }, [mine, stage, query]);

  /* ข้อความยืนยันหายเองหลังผ่านไปครู่หนึ่ง ไม่ต้องให้กดปิด */
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  return (
    <div className="m-mt space-y-[18px] max-md:space-y-3">
      {/* ชื่อหน้ามุมซ้ายบน — แถบบนจอคอมเป็นเส้นทางแล้ว · มือถือชื่อหน้าอยู่แถบบนของมือถือเหมือนเดิม (ผู้ใช้สั่ง 12 ต.ค. 2569) */}
      <h1 className="page-h1">งานที่ได้รับ</h1>

      {/* แบนเนอร์ทักทาย — จอเล็กกว่า md ซ่อน ตามต้นแบบ (mt-mobile .tk-hero) */}
      <section className="relative hidden overflow-hidden rounded-[20px] bg-accent px-8 py-9 max-md:hidden! sm:block lg:px-[60px] lg:py-12">
        <h2 className="truncate text-[34px] leading-tight font-bold lg:text-[40px]">
          สวัสดี, {nameOf(me.name).split(" ")[0]}
        </h2>
        <p className="mt-3 text-[16px] text-foreground/80">พร้อมเริ่มงานของวันนี้แล้วหรือยัง</p>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-10 right-10 hidden size-[220px] rounded-full bg-primary/10 lg:block"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-[200px] -bottom-12 hidden size-[120px] rounded-full bg-primary/10 lg:block"
        />
      </section>

      <div className="m-mt-search flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground max-md:hidden">ภาพรวม</p>
        {/* ใช้ช่องค้นหากลางของระบบ — เคยเขียนเองแล้วไอคอนทับตัวอักษร
            เพราะ .field-control กำหนด padding ของตัวเองทับคลาส pl-*
            มือถือเป็นแคปซูล 46px (my-tasks.css) */}
        <div className="flex min-w-0 items-center gap-2.5 max-md:w-full">
          <div className="min-w-0 max-md:flex-1">
            <SearchBox value={query} onChange={setQuery} placeholder="ค้นหางานหรือโครงการ" />
          </div>
        </div>
      </div>

      {/* มือถือ: ขั้นของงานเป็นชิปเลื่อนข้าง (ต้นแบบ mt-mobile .tk-stat) — กดแล้วกรองรายการ */}
      <div
        role="group"
        aria-label="ขั้นของงาน"
        /* ชิดขอบจอเวลาเลื่อน — หักระยะขอบของ <main> (px-4 · sm:px-[30px]) */
        className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:-mx-[30px] sm:px-[30px] md:hidden"
      >
        {stages.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={stage === k}
            onClick={() => setStage(k)}
            className={`inline-flex h-[38px] flex-none items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold whitespace-nowrap ${
              stage === k ? "bg-[#C8102E] text-white" : "bg-[#EDE8EA] text-[#6E6164]"
            }`}
          >
            {LOOK[k].label}
            <span className="num text-[13px] opacity-85">{counts[k]}</span>
          </button>
        ))}
      </div>

      {/* การ์ดสรุปสี่ใบ — กดเพื่อกรองรายการข้างล่าง (จอ md ขึ้นไป) */}
      <div className={`grid grid-cols-2 gap-2.5 max-md:hidden sm:gap-3 lg:grid-cols-3 ${showReview ? "xl:grid-cols-5" : "lg:grid-cols-4"}`}>
        {stages.map((k) => (
          <StatCard
            key={k}
            stage={k}
            n={counts[k]}
            on={stage === k}
            onClick={() => {
              setStage(k);
              toList();
            }}
          />
        ))}
      </div>

      <div ref={listRef} className="flex scroll-mt-20 flex-col gap-3.5 max-md:gap-2.5">
        {stage === "review" ? (
          reviewRows.length === 0 ? (
            <p className="glass rounded-[18px] px-5 py-14 text-center text-[13.5px] text-muted-foreground max-md:rounded-[20px] max-md:border-0 max-md:bg-white max-md:text-[#8A7E81]">
              {query.trim() ? "ไม่พบงานที่ค้นหา" : "ไม่มีงานรอคุณตรวจ"}
            </p>
          ) : (
            reviewRows.map((x) => (
              <ReviewCard key={`${x.p.pj}-${x.t.name}`} row={x} today={today} onOpen={() => setReviewing(x)} />
            ))
          )
        ) : stage === "ask" ? (
          askRows.length === 0 ? (
            <p className="glass rounded-[18px] px-5 py-14 text-center text-[13.5px] text-muted-foreground max-md:rounded-[20px] max-md:border-0 max-md:bg-white max-md:text-[#8A7E81]">
              {query.trim() ? "ไม่พบงานที่ค้นหา" : "ไม่มีงานในกลุ่มนี้"}
            </p>
          ) : (
            askRows.map((a) => <AskCard key={a.id} ask={a} />)
          )
        ) : rows.length === 0 ? (
          <p className="glass rounded-[18px] px-5 py-14 text-center text-[13.5px] text-muted-foreground max-md:rounded-[20px] max-md:border-0 max-md:bg-white max-md:text-[#8A7E81]">
            {query.trim() ? "ไม่พบงานที่ค้นหา" : "ไม่มีงานในกลุ่มนี้"}
          </p>
        ) : (
          rows.map((x) => (
            <TaskCard
              key={`${x.p.pj}-${x.t.name}`}
              row={x}
              today={today}
              talks={taskTalks(pm, x.p.pj, x.t.name)}
              nudge={openNudge(pm, x.p.pj, x.t.name)}
              onOpen={() => setViewing(x)}
              onSend={() => setSending(x)}
              onWait={() => setWaitingRow(x)}
              onUnwait={() => {
                clearTaskWait(x.p.pj, x.t.name, me.employeeId);
                setToast("บันทึกว่าได้ข้อมูลแล้ว");
              }}
              onTalk={() => setTalking(x)}
              onChat={() => {
                setChatPj(x.p.pj);
                setChatOpen(true);
              }}
            />
          ))
        )}
      </div>

      {viewing && (
        <DetailDialog row={viewing} today={today} onClose={() => setViewing(null)} />
      )}

      {/* ตรวจงานของคนอื่น — กล่องเดียวกับหน้างานรอตรวจของ PM (ผ่าน / ส่งกลับแก้ ต้องมีเหตุผล) */}
      {reviewing && (
        <ReviewDialog
          row={reviewing}
          onClose={() => setReviewing(null)}
          onDone={() => {
            setReviewing(null);
            setToast("บันทึกผลตรวจแล้ว");
          }}
        />
      )}

      {/* แชทกลุ่มของโปรเจค — สายเดียวกับที่ PM ใช้ในหน้าโปรเจค ส่งในนามคนที่ล็อกอิน */}
      {chatProject && (
        <ProjectChat
          project={chatProject}
          title={projName(chatProject)}
          me={me.employeeId}
          fab={false}
          open={chatOpen}
          onOpenChange={setChatOpen}
        />
      )}

      {talking && (
        <TalkDialog
          row={talking}
          me={me.employeeId}
          onClose={() => setTalking(null)}
          onSent={() => {
            setTalking(null);
            setToast("ส่งข้อความถึง Project Manager แล้ว");
          }}
        />
      )}

      {proposing && (
        <ProposeSheet
          me={me.employeeId}
          onClose={() => setProposing(false)}
          onSent={() => {
            setProposing(false);
            setStage("ask");
            setToast("ส่งให้ Project Manager อนุมัติแล้ว");
          }}
        />
      )}

      {waitingRow && (
        <WaitSheet
          row={waitingRow}
          me={me.employeeId}
          onClose={() => setWaitingRow(null)}
          onSaved={() => {
            setWaitingRow(null);
            setToast("แจ้งรอข้อมูลแล้ว · Project Manager เห็นแล้ว");
          }}
        />
      )}

      {sending && (
        <SubmitDialog
          row={sending}
          me={me.employeeId}
          onClose={() => setSending(null)}
          onSent={() => {
            setSending(null);
            setToast(sending.t.noReview ? "ส่งงานแล้ว · ปิดงานแล้ว" : "ส่งงานแล้ว");
          }}
        />
      )}

      {toast && (
        <p
          role="status"
          className="fixed bottom-[calc(88px+env(safe-area-inset-bottom))] left-1/2 z-70 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-5 py-3 text-[13.5px] font-semibold whitespace-nowrap text-background shadow-lg sm:bottom-8"
        >
          <CheckCircleIcon className="size-[18px] text-[var(--success)]" strokeWidth={2.2} />
          {toast}
        </p>
      )}
    </div>
  );
}

// ─── การ์ดสรุปหนึ่งใบ ──────────────────────────────────────────────

function StatCard({
  stage,
  n,
  on,
  onClick,
}: {
  stage: Stage;
  n: number;
  on: boolean;
  onClick: () => void;
}) {
  const look = LOOK[stage];
  const Icon = look.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      /* การ์ดกระจกขาว ไอคอนพื้นอ่อน — ชุดเดียวกับการ์ดสรุปของหน้าอื่นทั้งระบบ */
      className={[
        "glass flex min-w-0 items-center gap-2.5 rounded-[18px] px-3 py-3.5 text-left sm:gap-3 sm:px-[18px] sm:py-4",
        "transition-colors",
        on ? "border-primary" : "hover:border-primary",
      ].join(" ")}
    >
      <span
        className={`flex size-9 flex-none items-center justify-center rounded-[12px] sm:size-[42px] sm:rounded-[13px] ${look.tone}`}
        aria-hidden="true"
      >
        <Icon className="size-[21px]" strokeWidth={1.9} />
      </span>
      <span className="min-w-0">
        <b className="num block text-[22px] leading-none font-extrabold">{n}</b>
        <span className="mt-1 block text-[11.5px] text-muted-foreground max-sm:leading-snug sm:truncate">
          {look.label}
        </span>
      </span>
    </button>
  );
}

// ─── การ์ดงานหนึ่งใบ ───────────────────────────────────────────────

function TaskCard({
  row,
  today,
  talks,
  nudge,
  onOpen,
  onSend,
  onWait,
  onUnwait,
  onTalk,
  onChat,
}: {
  row: Row;
  today: string;
  talks: TaskTalk[];
  /** ทวงล่าสุดที่ยังไม่ได้ตอบ */
  nudge?: TaskTalk;
  onOpen: () => void;
  onSend: () => void;
  /** คนทำแจ้งรอข้อมูลเอง / ได้ข้อมูลแล้ว (ผู้ใช้สั่ง 21 ต.ค. 2569) */
  onWait: () => void;
  onUnwait: () => void;
  onTalk: () => void;
  /** เปิดแชทกลุ่มของโปรเจคที่งานใบนี้อยู่ */
  onChat: () => void;
}) {
  const { p, t } = row;
  const stage = stageOf(t);
  const look = LOOK[stage];
  const Icon = look.icon;
  const late = stage === "recv" && daysBetween(t.due, today) > 0;
  /* รอข้อมูล — งานก่อนหน้ายังไม่ผ่าน (task-deps.ts) · ล็อกปุ่มส่งงานตาม LOCK_SEND_WHILE_WAITING */
  const wait = blockers(p.tasks, t);
  const locked = LOCK_SEND_WHILE_WAITING && wait.length > 0;
  const ready = readySince(p.tasks, t);
  const canSend = (stage === "recv" || stage === "revise") && !locked;
  const tint = M_TINT[stage];

  return (
    <>
    {/* มือถือ (< md) — การ์ดตามต้นแบบ mt-mobile .tk-row ทั้งใบกดเปิดรายละเอียด */}
    <article className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-[20px] bg-white p-3.5 text-[#2A1F22] shadow-[0_1px_2px_rgba(40,20,25,.04)] md:hidden">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`ดูรายละเอียดงาน ${t.name}`}
        className="absolute inset-0 z-[1] rounded-[20px]"
      />
      <span
        className="row-span-3 grid size-10 place-items-center rounded-full"
        style={{ background: tint.bg, color: tint.fg }}
        aria-hidden="true"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="m8.5 12 2.5 2.5 4.5-5" />
        </svg>
      </span>
      <p className="text-[12px] font-medium text-[#8A7E81]">{projName(p)}</p>
      <h3 className="text-[15.5px] leading-[1.35] font-bold">{t.name}</h3>
      {/* งานที่ต้องแก้ไข ไม่แสดงรายละเอียดงานเดิม — เห็นแค่สิ่งที่ต้องแก้ (ผู้ใช้สั่ง 29 ต.ค. 2569) */}
      {stage !== "revise" && (
        <p className="line-clamp-2 text-[13px] leading-[1.45] text-[#6E6164]">
          {t.brief || "ยังไม่มีรายละเอียดงานจาก Project Manager"}
        </p>
      )}

      {/* ข้อมูลที่ต้องเห็นก่อนกดส่ง — ต้นแบบไม่มี แต่ตัดทิ้งไม่ได้ (เหตุผลที่ตีกลับ · PM ทวง · คุยกับ PM) */}
      {(stage === "revise" || nudge || wait.length > 0 || ready || t.waitingOn) && (
        <div className="col-span-2 mt-1.5 flex flex-col gap-2">
          <WaitNote wait={wait} t={t} today={today} ready={ready} />
          <ManualWaitNote t={t} today={today} onClear={onUnwait} className="relative z-[2]" />
          {stage === "revise" && <BackNote back={t.back} />}
          {nudge && (
            <div className="rounded-[13px] bg-[var(--warning-soft)] px-3.5 py-2.5">
              <p className="text-[12.5px] font-bold text-[var(--warning)]">Project Manager ทวงงานนี้</p>
              <p className="mt-1 text-[13px] leading-relaxed break-words">{nudge.tx}</p>
            </div>
          )}
        </div>
      )}
      {/* เดิมเป็นลิงก์ "คุยกับ PM เรื่องงานนี้" — เปลี่ยนเป็นปุ่มแชทกลุ่มของโปรเจค (ผู้ใช้สั่ง 5 ต.ค. 2569)
          ข้อความทวงของ PM ยังอยู่ในสายของงานใบนั้น จึงเหลือ "ตอบ PM" ไว้เฉพาะตอนถูกทวง */}
      {/* ปุ่มแชทโปรเจคย้ายไปชิดซ้ายของปุ่มส่งงานในแถวล่าง (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
      {nudge && (
        <span className="relative z-[2] col-span-2 flex flex-wrap items-center gap-2.5 justify-self-start">
          <button type="button" onClick={onTalk} className="text-[12.5px] font-semibold text-[#C8102E]">
            ตอบ Project Manager{talks.length > 0 ? ` (${talks.length})` : ""}
          </button>
        </span>
      )}

      <hr className="col-span-2 mt-2 mb-1 border-0 border-t-[1.5px] border-dashed border-[#ECE3E5]" />
      <div className="col-span-2 flex items-center justify-between gap-3">
        <p
          className={`num flex min-w-0 items-center gap-[5px] text-[12.5px] font-semibold ${
            late ? "text-[#B0101F]" : "text-[#6E6164]"
          }`}
        >
          <CalendarIcon
            className={`size-3.5 flex-none ${late ? "text-[#B0101F]" : "text-[#8A7E81]"}`}
            strokeWidth={2.2}
          />
          {whenText(t, stage, today)}
        </p>
        <span className="relative z-[2] flex flex-none items-center gap-2">
          {!isLoose(p.pj) && <ChatButton onClick={onChat} />}
          {canSend && (
            <button
              type="button"
              onClick={onSend}
              className="h-[34px] flex-none rounded-[10px] bg-[#C8102E] px-4 text-[13px] font-semibold text-white"
            >
              {stage === "revise" ? "ส่งแก้ไข" : "ส่งงาน"}
            </button>
          )}
          {locked && <WaitPill />}
        </span>
      </div>
    </article>

    {/* ทั้งการ์ดกดเปิดรายละเอียด (งานที่อนุมัติแล้วดูประวัติการส่ง) — ยกเว้นตอนกดปุ่มในการ์ด (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
    <article
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a")) return;
        onOpen();
      }}
      className="glass-thin cursor-pointer rounded-[16px] px-4 py-4 transition-colors hover:border-primary max-md:hidden sm:px-5"
    >
      <div className="flex gap-3 sm:gap-4">
        <span
          className={`grid size-11 flex-none place-items-center rounded-[13px] sm:size-[58px] sm:rounded-[14px] ${look.tone}`}
          aria-hidden="true"
        >
          <Icon className="size-[22px] sm:size-[26px]" strokeWidth={1.8} />
        </span>

        <div className="min-w-0 flex-1">
          {/* ชื่อโปรเจคอยู่เหนือชื่องานบนมือถือ และไปอยู่ขวาสุดบนจอใหญ่ ตามดีไซน์ */}
          <p className="mb-0.5 text-[12.5px] font-semibold text-muted-foreground sm:hidden">
            {projName(p)}
          </p>
          <div className="flex items-start justify-between gap-4">
            <button
              type="button"
              onClick={onOpen}
              className="min-w-0 text-left text-[15px] font-bold hover:text-primary hover:underline"
            >
              {t.name}
            </button>
            <span className="hidden flex-none text-[12.5px] text-muted-foreground sm:block">
              {projName(p)}
            </span>
          </div>

          {/* งานที่ต้องแก้ไข ไม่แสดงรายละเอียดงานเดิม — เห็นแค่สิ่งที่ต้องแก้ (ผู้ใช้สั่ง 29 ต.ค. 2569) */}
          {stage === "revise" ? null : t.brief ? (
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{t.brief}</p>
          ) : (
            <p className="mt-1 text-[13px] text-muted-foreground/70">ยังไม่มีรายละเอียดงานจาก Project Manager</p>
          )}

          {/* เหตุผลที่ถูกตีกลับอยู่บนการ์ด ไม่ใช่หลังการกดเปิดดู —
              เดิมต้องกดชื่องานถึงจะเห็น คนจึงกด "ส่งแก้ไข" โดยไม่รู้ว่าต้องแก้อะไร แล้วส่งของเดิมกลับไป */}
          {stage === "revise" && <BackNote back={t.back} />}

          <WaitNote wait={wait} t={t} today={today} ready={ready} className="mt-2" />
          <ManualWaitNote t={t} today={today} onClear={onUnwait} className="mt-2" />

          {/* PM ทวงงานใบนี้ — ต้องเห็นบนการ์ด ไม่ใช่รอให้ไปตามกันในไลน์ */}
          {nudge && (
            <div className="mt-2 rounded-[13px] bg-[var(--warning-soft)] px-3.5 py-2.5">
              <p className="text-[12.5px] font-bold text-[var(--warning)]">Project Manager ทวงงานนี้</p>
              <p className="mt-1 text-[13px] leading-relaxed break-words">{nudge.tx}</p>
              <em className="num mt-1 block text-[11.5px] text-muted-foreground not-italic">
                {thaiStamp(nudge.at)} น.
              </em>
            </div>
          )}

          {/* มอบหมายเมื่อไร และเปลี่ยนอะไรล่าสุด — แยกงานใหม่ออกจากงานเก่าได้โดยไม่ต้องเปิดดู
              งานที่ต้องแก้ไขไม่มีแถวนี้ — ชื่อ PM อยู่ในกล่องสิ่งที่ต้องแก้แล้ว (ผู้ใช้สั่ง 29 ต.ค. 2569) */}
          {stage !== "revise" && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-muted-foreground">
            {t.lastChange && (
              <span className="rounded-full bg-accent px-2.5 py-0.5 font-bold text-primary">
                {CHANGE_LABEL[t.lastChange.what]}
              </span>
            )}
            {t.assignedAt && <span className="num">มอบหมาย {thaiStamp(t.assignedAt)} น.</span>}
            <span>โดย {nameOf(t.lastChange?.by || p.pm)}</span>
            {t.files.length > 0 && (
              <span className="num inline-flex items-center gap-1">
                <FileIcon className="size-[13px]" strokeWidth={2} />
                {t.files.length} ไฟล์
              </span>
            )}
          </p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
            <p
              className={`text-[13px] font-semibold ${late ? "text-destructive" : "text-foreground"}`}
            >
              {whenText(t, stage, today)}
            </p>
            {/* ตอบ PM ได้จากหน้าของตัวเอง ไม่ต้องเข้าหน้าโปรเจคของ PM ซึ่งบทบาททีมงานเปิดไม่ได้ */}
            {/* ปุ่มแชทกลุ่มของโปรเจค แทนลิงก์ "คุยกับ PM เรื่องงานนี้" (ผู้ใช้สั่ง 5 ต.ค. 2569) · "ตอบ PM" เหลือเฉพาะตอนถูกทวง */}
            {/* ชิดขวาเป็นกลุ่มเดียว [แชทโปรเจค][ส่งงาน] (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
            <span className="ml-auto flex flex-wrap items-center justify-end gap-2.5 max-sm:w-full">
              {nudge && (
                <button type="button" onClick={onTalk} className="text-[12.5px] font-semibold text-primary hover:underline">
                  ตอบ Project Manager{talks.length > 0 ? ` (${talks.length})` : ""}
                </button>
              )}
              {!isLoose(p.pj) && <ChatButton onClick={onChat} />}
              {canSend && (
                <button
                  type="button"
                  onClick={onSend}
                  /* มือถือขยายปุ่มเต็มแถว นิ้วกดง่าย */
                  className="btn solid btn-solid btn-mini max-sm:h-10! max-sm:w-full max-sm:justify-center max-sm:text-[13.5px]!"
                >
                  {stage === "revise" ? "ส่งแก้ไข" : "ส่งงาน"}
                </button>
              )}
              {locked && <WaitPill />}
            </span>
          </div>
        </div>
      </div>
    </article>
    </>
  );
}

/*
 * รอข้อมูล — บอกว่ารองานไหน ใครทำ ถึงไหนแล้ว และรอมากี่วัน (แผนที่ระบบ 20 ต.ค. 2569 หัวข้อ 6)
 * งานก่อนหน้าผ่านครบแล้วภายใน 7 วัน ขึ้นแถบเขียวบอกว่าเริ่มได้ แทนการรอให้ใครมาบอกในไลน์
 */
function WaitNote({
  wait,
  t,
  today,
  ready,
  className = "",
}: {
  wait: ProjectTask[];
  t: ProjectTask;
  today: string;
  ready: string | null;
  className?: string;
}) {
  if (!wait.length) {
    if (!ready || daysBetween(ready.slice(0, 10), today) > 7) return null;
    return (
      <div className={`rounded-[13px] bg-[var(--success-soft)] px-3.5 py-2.5 ${className}`}>
        <p className="text-[12.5px] font-bold text-[var(--success)]">งานก่อนหน้าผ่านครบแล้ว เริ่มงานได้</p>
        <p className="num mt-0.5 text-[12px] text-muted-foreground">ผ่านครบเมื่อ {stamp(ready)}</p>
      </div>
    );
  }
  const days = waitingDays(t, today);
  return (
    <div className={`rounded-[13px] bg-[var(--warning-soft)] px-3.5 py-2.5 ${className}`}>
      <p className="text-[12.5px] font-bold text-[var(--warning)]">
        รอข้อมูล{days > 0 ? <span className="num"> · รอมา {days} วัน</span> : null}
      </p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {wait.map((w) => {
          const over = daysBetween(w.due, today);
          return (
            <li key={w.name} className="text-[12.5px] leading-relaxed break-words">
              รอ <b className="font-semibold">{w.name}</b>
              <span className="text-muted-foreground">
                {" "}· {w.whos.map(memberName).join(", ") || "ยังไม่มีคนทำ"} · {TASK_STATUS[w.status].label}
              </span>
              {over > 0 && <span className="num font-semibold text-destructive"> · เลยกำหนด {over} วัน</span>}
            </li>
          );
        })}
      </ul>
      {LOCK_SEND_WHILE_WAITING && (
        <p className="mt-1 text-[11.5px] text-muted-foreground">ส่งงานได้เมื่องานก่อนหน้าตรวจผ่านครบ</p>
      )}
    </div>
  );
}

/*
 * รอข้อมูลที่คนทำกดเอง (ผู้ใช้สั่ง 21 ต.ค. 2569) — หน้าตาเดียวกับ WaitNote
 * บอกว่ารออะไร มากี่วัน · ไม่ล็อกปุ่มส่งงาน · กด "ได้ข้อมูลแล้ว" ปิดการรอ (ส่งงานแล้วก็ปิดเอง)
 */
function ManualWaitNote({
  t,
  today,
  onClear,
  className = "",
}: {
  t: ProjectTask;
  today: string;
  onClear: () => void;
  className?: string;
}) {
  const w = t.waitingOn;
  if (!w) return null;
  const days = manualWaitDays(t, today);
  return (
    <div className={`rounded-[13px] bg-[var(--warning-soft)] px-3.5 py-2.5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] font-bold text-[var(--warning)]">
            รอข้อมูล · {WAIT_KIND_LABEL[w.kind]}
            {days > 0 ? <span className="num"> · รอมา {days} วัน</span> : null}
          </p>
          {w.note && <p className="mt-0.5 text-[12.5px] leading-relaxed break-words">{w.note}</p>}
          <p className="num mt-0.5 text-[11.5px] text-muted-foreground">แจ้งเมื่อ {stamp(w.since)} · ส่งงานได้ตามปกติ</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="flex-none text-[12.5px] font-semibold text-primary hover:underline"
        >
          ได้ข้อมูลแล้ว
        </button>
      </div>
    </div>
  );
}

/** แจ้งรอข้อมูลนอกแผน — รอลูกค้า / รอไฟล์ / อื่น ๆ + หมายเหตุ (ผู้ใช้สั่ง 21 ต.ค. 2569) */
function WaitSheet({
  row,
  me,
  onClose,
  onSaved,
}: {
  row: Row;
  me: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<WaitKind>("customer");
  const [note, setNote] = useState("");
  const options: { k: WaitKind; label: string }[] = [
    { k: "customer", label: "รอลูกค้า" },
    { k: "file", label: "รอไฟล์" },
    { k: "other", label: "อื่น ๆ" },
  ];
  return (
    <Sheet
      title="รอข้อมูล"
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
              setTaskWait(row.p.pj, row.t.name, { kind, note, by: me });
              onSaved();
            }}
          >
            บันทึก
          </button>
        </>
      }
    >
      <p className="mb-4 text-[13px] font-semibold">{row.t.name}</p>
      <Field label="รออะไร" required>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13.5px]">
          {options.map((o) => (
            <label key={o.k} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="wait-kind"
                className="size-4 accent-[var(--primary)]"
                checked={kind === o.k}
                onChange={() => setKind(o.k)}
              />
              {o.label}
            </label>
          ))}
        </div>
      </Field>
      <Field label="หมายเหตุ" labelNote="ไม่บังคับ">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="เช่น ลูกค้ายังไม่ส่งรูปสินค้า"
          className="field-control h-[76px] resize-y py-2.5 leading-relaxed"
        />
      </Field>
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        ระบบแจ้ง Project Manager ว่างานนี้รอข้อมูล · ยังส่งงานได้ตามปกติ และช่วงที่รอจะไม่นับเป็นความช้าของคุณ
      </p>
    </Sheet>
  );
}

/** แทนปุ่มส่งงานตอนรอข้อมูล — เห็นว่ามีปุ่มแต่ยังกดไม่ได้ ไม่ใช่ปุ่มหายไปเฉย ๆ */
function WaitPill() {
  return (
    <span
      aria-disabled="true"
      title="รองานก่อนหน้าผ่านก่อน"
      className="inline-flex h-[34px] flex-none cursor-not-allowed items-center rounded-[10px] border border-border px-4 text-[13px] font-semibold text-muted-foreground"
    >
      รอข้อมูล
    </span>
  );
}

// ─── การ์ดงานที่รอเราตรวจ (ผู้ใช้สั่ง 21 ต.ค. 2569) ──────────────────

function ReviewCard({ row, today, onOpen }: { row: Row; today: string; onOpen: () => void }) {
  const { p, t } = row;
  const sub = lastSub(t);
  const day = sub?.at.split(" ")[0] ?? "";
  const waited = day ? daysBetween(day, today) : 0;
  const who = memberName(sub?.by ?? t.whos[0] ?? "");
  return (
    <article
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a")) return;
        onOpen();
      }}
      className="glass-thin flex cursor-pointer flex-wrap items-center gap-3 rounded-[16px] px-4 py-4 transition-colors hover:border-primary max-md:rounded-[20px] max-md:border-0 max-md:bg-white sm:px-5"
    >
      <span
        className={`grid size-11 flex-none place-items-center rounded-[13px] ${LOOK.review.tone}`}
        aria-hidden="true"
      >
        <CheckCircleIcon className="size-[22px]" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-semibold text-muted-foreground">{projName(p)}</p>
        <p className="text-[15px] font-bold break-words">{t.name}</p>
        <p className="num mt-0.5 text-[12.5px] text-muted-foreground">
          {who} ส่งมา{day ? ` ${stamp(sub?.at ?? day)}` : ""}
          {waited >= 3 && <span className="font-semibold text-destructive"> · รอมา {waited} วัน</span>}
        </p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="btn solid btn-solid btn-mini max-sm:h-10! max-sm:w-full max-sm:justify-center"
      >
        ตรวจงาน
      </button>
    </article>
  );
}

/* งานที่ต้องแก้ไข กำหนดส่ง = กำหนดส่งแก้ ไม่ใช่กำหนดส่งรอบแรก · ข้อมูลเก่าไม่มีวัน ใช้ 2 วันหลังตีกลับ (ผู้ใช้สั่ง 29 ต.ค. 2569) */
function dueOf(t: ProjectTask) {
  if (t.status !== "revise" || !t.back) return t.due;
  return t.back.due ?? addDays(t.back.at.split(" ")[0], 2);
}

/** บรรทัดวันของการ์ด — แต่ละขั้นสนใจคนละวัน */
function whenText(t: ProjectTask, stage: Stage, today: string) {
  if (stage === "recv") {
    const over = daysBetween(t.due, today);
    return over > 0 ? `เลยกำหนด ${over} วัน` : `กำหนดส่ง ${thaiDate(t.due)}`;
  }
  if (stage === "done") {
    return t.doneAt ? `อนุมัติเมื่อ ${stamp(t.doneAt)}` : "อนุมัติแล้ว";
  }
  /* งานที่ต้องแก้ไข บอกเวลาที่ PM ส่งกลับ ไม่ใช่เวลาที่เราส่งไป (ผู้ใช้สั่ง 29 ต.ค. 2569) */
  if (stage === "revise" && t.back) return `ส่งกลับให้แก้เมื่อ ${stamp(t.back.at)}`;
  const sub = lastSub(t);
  return sub ? `ส่งเมื่อ ${stamp(sub.at)}` : "—";
}

// ─── กล่องรายละเอียด ──────────────────────────────────────────────

function DetailDialog({
  row,
  today,
  onClose,
}: {
  row: Row;
  today: string;
  onClose: () => void;
}) {
  const { p, t } = row;
  const stage = stageOf(t);
  const sub = lastSub(t);
  const late = stage === "recv" && daysBetween(t.due, today) > 0;
  /* รอบใหม่อยู่บนสุด คนอ่านจะได้เห็นของล่าสุดก่อนแล้วค่อยไล่ลงไปดูรอบก่อน */
  const subs = [...(t.subs ?? [])].reverse();

  return (
    <Sheet title={projName(p)} onClose={onClose} footer={null}>
      {/* โจทย์กับไฟล์จาก PM ขึ้นทุกขั้น — ส่งไปแล้วหรือถูกตีกลับก็ยังต้องเปิดอ่านโจทย์ได้ */}
      {/* .m-mt-dlg = ตัวจับของ my-tasks.css ให้กล่องเป็นแผ่นเลื่อนขึ้นบนมือถือ */}
      <h3 className="m-mt-dlg text-[15px] font-bold">{t.name}</h3>
      {t.brief ? (
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{t.brief}</p>
      ) : (
        <p className="mt-1.5 text-[13.5px] text-muted-foreground/70">
          Project Manager ยังไม่ได้เขียนรายละเอียดงานใบนี้
        </p>
      )}

      <p className="mt-5 mb-2 text-[11.5px] text-muted-foreground">ไฟล์จาก Project Manager</p>
      <FileList names={t.files.map((f) => ({ n: f.n, sz: f.sz }))} empty="ไม่มีไฟล์แนบ" />
      <ProjectDocs p={p} />

      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <Kv k={t.origin ? "ผู้อนุมัติ" : "ผู้มอบหมาย"} v={nameOf(t.lastChange?.by || p.pm)} />
        <Kv k="กำหนดส่ง" v={thaiDate(dueOf(t))} warn={late} />
        {t.origin && (
          <Kv
            k="ขอมาจาก"
            v={t.origin.fromName ? `${ASK_FROM_LABEL[t.origin.from]} · ${t.origin.fromName}` : ASK_FROM_LABEL[t.origin.from]}
          />
        )}
        {t.assignedAt && <Kv k="มอบหมายเมื่อ" v={`${thaiStamp(t.assignedAt)} น.`} />}
        {t.lastChange && (
          <Kv
            k="เปลี่ยนแปลงล่าสุด"
            v={`${CHANGE_LABEL[t.lastChange.what]} · ${thaiStamp(t.lastChange.at)} น.`}
          />
        )}
      </dl>

      {stage !== "recv" && <hr className="mt-5 border-border" />}

      {stage === "sent" && sub && (
        <>
          <dl className="mt-5 grid gap-4 sm:grid-cols-3">
            <Kv k="ส่งเมื่อ" v={stamp(sub.at)} />
            <div>
              <dt className="text-[11.5px] text-muted-foreground">สถานะ</dt>
              <dd className="mt-1">
                <span className="tag t-early">
                  <i />
                  รอตรวจสอบ
                </span>
              </dd>
            </div>
            {/* บอกรอบเฉพาะเมื่อเคยส่งแก้แล้ว (มากกว่า 1 รอบ) */}
            {subs.length > 1 && <Kv k="รอบที่" v={String(subs.length)} />}
          </dl>
          <div className="mt-4">
            <FileList names={sub.files.map((n) => ({ n }))} empty="ไม่ได้แนบไฟล์" />
          </div>
          {sub.note && <p className="mt-3.5 text-[13.5px] leading-relaxed">{sub.note}</p>}
        </>
      )}

      {stage === "revise" && (
        <div className="mt-5">
          <BackNote back={t.back} pj={p.pj} task={t.name} />
        </div>
      )}

      {/* งานที่อนุมัติแล้ว — ไล่ประวัติทุกรอบตั้งแต่ส่งครั้งแรกจนปิดงาน (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
      {stage === "done" && <SubmitHistory p={p} t={t} />}
    </Sheet>
  );
}

// ─── ประวัติการส่งงาน (ผู้ใช้สั่ง 9 ต.ค. 2569) ─────────────────────

/** ผลตรวจหนึ่งขั้นใต้รอบที่ส่ง */
type HistStep = {
  at?: string;
  label: string;
  tone: "ok" | "miss" | "info";
  why?: string;
  round?: ReviewRound;
};

/*
 * เรียงจากรอบแรกไปรอบล่าสุด — แต่ละรอบ = สิ่งที่ส่ง แล้วตามด้วยผลตรวจของ PM และรอบตรวจของลูกค้า (ถ้ามี)
 * สโตร์เก็บเหตุผลตีกลับไว้แค่รอบล่าสุด รอบก่อนหน้าจึงดึงเวลาจากกิจกรรมโปรเจค และเหตุผลจากความเห็นลูกค้าที่ส่งต่อมา
 */
function SubmitHistory({ p, t }: { p: Project; t: ProjectTask }) {
  const reviews = useClientReviews();
  const subs = t.subs ?? [];
  const client = roundsOfTask(reviews, p.pj, t.name);
  const backActs = p.acts
    .filter((a) => a.tx === `ส่งกลับให้แก้ ${t.name}`)
    .map((a) => a.at)
    .sort();
  const passActs = p.acts
    .filter((a) => a.tx === `ตรวจผ่าน ${t.name}`)
    .map((a) => a.at)
    .sort();

  if (subs.length === 0) {
    return (
      <div className="mt-5">
        <p className="mb-2 text-[11.5px] text-muted-foreground">ประวัติการส่งงาน</p>
        <p className="text-[13px] text-muted-foreground">ไม่มีประวัติการส่งงาน</p>
        {t.doneAt && <p className="num mt-2 text-[12.5px]">อนุมัติ {stamp(t.doneAt)}</p>}
      </div>
    );
  }

  return (
    <div className="mt-5">
      <p className="mb-3 text-[11.5px] text-muted-foreground">ประวัติการส่งงาน</p>
      <ol className="relative flex flex-col gap-4 border-l-2 border-border pl-4">
        {subs.map((sb, i) => {
          const from = sb.at;
          const to = subs[i + 1]?.at;
          const last = i === subs.length - 1;
          const inWin = (at?: string) => !!at && at >= from && (!to || at < to);
          const steps: HistStep[] = [];
          const rounds = client.filter((r) => inWin(r.createdAt));

          if (rounds.length > 0) {
            steps.push({ at: rounds[0].createdAt, label: "ตรวจผ่าน", tone: "ok" });
            for (const r of rounds) {
              steps.push({ at: r.createdAt, label: `ส่งให้ลูกค้าตรวจ รอบที่ ${r.round}`, tone: "info" });
              if (r.status === "approved") {
                steps.push({ at: r.submittedAt, label: "ลูกค้าอนุมัติ", tone: "ok" });
              } else if (r.forwardedAt) {
                steps.push({ at: r.forwardedAt, label: "ส่งกลับให้แก้ตามความเห็นลูกค้า", tone: "miss", round: r });
              } else if (r.submittedAt) {
                steps.push({ at: r.submittedAt, label: "ลูกค้าส่งความเห็น", tone: "info", round: r });
              }
            }
          } else if (!last) {
            const at = backActs.find(inWin);
            const why = t.back && inWin(t.back.at) ? t.back.why : undefined;
            steps.push({ at, label: "ส่งกลับให้แก้", tone: "miss", why });
          } else {
            steps.push({ at: t.doneAt ?? passActs.find(inWin), label: t.noReview ? "ปิดงาน · ไม่ต้องตรวจ" : "ตรวจผ่าน · อนุมัติ", tone: "ok" });
          }
          if (last && rounds.length > 0 && t.doneAt) steps.push({ at: t.doneAt, label: "อนุมัติ · ปิดงาน", tone: "ok" });

          return (
            <li key={`${sb.at}-${i}`} className="relative">
              <span
                aria-hidden="true"
                className="absolute top-1 size-2.5 rounded-full bg-primary"
                style={{ left: -22 }}
              />
              <div className="flex flex-wrap items-center gap-2.5">
                <b className="text-[13px] font-bold">รอบที่ {i + 1}</b>
                <span className="num text-[12.5px] text-muted-foreground">ส่ง {stamp(sb.at)}</span>
                {sb.by && <span className="text-[12px] text-muted-foreground">{nameOf(memberName(sb.by))}</span>}
              </div>
              <div className="mt-2">
                <FileList names={sb.files.map((n) => ({ n }))} empty="ไม่ได้แนบไฟล์" />
              </div>
              {sb.note && <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-line">{sb.note}</p>}

              <ul className="mt-2.5 flex flex-col gap-2">
                {steps.map((st, k) => (
                  <li key={k} className="rounded-[12px] bg-muted/60 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`tag ${st.tone === "ok" ? "t-ok" : st.tone === "miss" ? "t-late" : "t-info"}`}>
                        <i />
                        {st.label}
                      </span>
                      {st.at && <span className="num text-[12px] text-muted-foreground">{stamp(st.at)}</span>}
                    </div>
                    {st.why && (
                      <p className="mt-1.5 text-[13px] leading-relaxed whitespace-pre-line text-destructive">{st.why}</p>
                    )}
                    {st.round && st.round.comments.length > 0 && (
                      <div className="mt-2 rounded-[10px] bg-card p-2.5">
                        <ClientCommentList round={st.round} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ─── กล่องส่งงาน ──────────────────────────────────────────────────

function SubmitDialog({
  row,
  me,
  onClose,
  onSent,
}: {
  row: Row;
  me: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { p, t } = row;
  const revise = stageOf(t) === "revise";
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [note, setNote] = useState("");
  /*
   * สลับไปอ่านโจทย์ได้ในหน้าต่างเดิม (ผู้ใช้กำหนด 23 ก.ย. 2569)
   * บังคับปิดแล้วเปิดใหม่ = สิ่งที่พิมพ์ค้างไว้หาย แล้วคนส่งงานผิดโจทย์
   * ไฟล์กับหมายเหตุอยู่ในสเตตของกล่องนี้ สลับมุมมองจึงไม่ล้างของที่กรอกไว้
   */
  const [brief, setBrief] = useState(false);
  const [touched, setTouched] = useState(false);
  /** ไฟล์ยังอัปโหลดไม่เสร็จตอนกดส่ง */
  const [busyWarn, setBusyWarn] = useState(false);
  /* เวลาที่แนบแต่ละไฟล์ — ใช้บอกว่าอัปโหลด (จำลอง) เสร็จหรือยัง */
  const addedAt = useRef<Record<string, number>>({});

  /* ต้องมีอย่างน้อยอย่างหนึ่ง ไม่งั้น PM เปิดมาแล้วไม่รู้ว่าได้อะไรมา */
  const empty = files.length === 0 && !note.trim();

  return (
    <Sheet
      title={t.name}
      onClose={onClose}
      steady
      footer={
        <>
          <button
            type="button"
            className="btn glass-thin flex-1 justify-center sm:flex-none"
            onClick={brief ? () => setBrief(false) : onClose}
          >
            {brief ? "กลับไปกรอกฟอร์ม" : "ยกเลิก"}
          </button>
          <button
            type="button"
            className="btn solid btn-solid flex-1 justify-center sm:flex-none"
            onClick={() => {
              const now = Date.now();
              if (files.some((f) => now - (addedAt.current[f.id] ?? 0) < UPLOAD_WAIT_MS)) {
                setBusyWarn(true);
                return;
              }
              setTouched(true);
              if (empty) {
                /* เตือนที่ฟอร์ม ไม่ใช่ที่หน้าอ่านโจทย์ */
                setBrief(false);
                return;
              }
              submitWorkFlow(p.pj, t.name, {
                by: me,
                files: files.map((f) => f.name),
                note: note.trim(),
                at: bkkStamp(),
              });
              onSent();
            }}
          >
            {revise ? "ส่งแก้ไข" : "ส่งงาน"}
          </button>
        </>
      }
    >
      <div className="m-mt-dlg flex items-center justify-between gap-3 border-b border-border pb-3">
        <h3 className="text-[14px] font-bold">
          {brief ? "รายละเอียดงาน" : revise ? "ส่งแก้ไข" : "ส่งงาน"}
        </h3>
        <button
          type="button"
          onClick={() => setBrief((v) => !v)}
          className="text-[12.5px] font-semibold text-primary hover:underline"
        >
          {brief ? "‹ กลับไปกรอกฟอร์ม" : "ดูรายละเอียดงาน"}
        </button>
      </div>

      {brief && (
        <div className="mt-4">
          <p className="text-[13px] font-semibold text-muted-foreground">{projName(p)}</p>
          <h4 className="mt-1 text-[15px] font-bold">{t.name}</h4>
          {t.brief ? (
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{t.brief}</p>
          ) : (
            <p className="mt-1.5 text-[13.5px] text-muted-foreground/70">
              Project Manager ยังไม่ได้เขียนรายละเอียดงานใบนี้
            </p>
          )}
          {revise && (
            <div className="mt-4">
              <BackNote back={t.back} pj={p.pj} task={t.name} />
            </div>
          )}
          <p className="mt-5 mb-2 text-[11.5px] text-muted-foreground">ไฟล์จาก Project Manager</p>
          <FileList names={t.files.map((f) => ({ n: f.n, sz: f.sz }))} empty="ไม่มีไฟล์แนบ" />
          <ProjectDocs p={p} />
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <Kv k="ผู้มอบหมาย" v={nameOf(t.lastChange?.by || p.pm)} />
            <Kv k="กำหนดส่ง" v={thaiDate(dueOf(t))} />
            {t.assignedAt && <Kv k="มอบหมายเมื่อ" v={`${thaiStamp(t.assignedAt)} น.`} />}
          </dl>
        </div>
      )}

      <div className={brief ? "hidden" : undefined}>
      {/* ไม่บอกผู้ตรวจในหน้างานของพนักงานแล้ว (ผู้ใช้สั่ง 29 ต.ค. 2569) */}
      {/* ส่งแก้ไข = ต้องเห็นสิ่งที่ต้องแก้อยู่ตรงหน้า ไม่ต้องสลับไปหน้าโจทย์ก่อน */}
      {revise && (
        <div className="mt-4">
          <BackNote back={t.back} pj={p.pj} task={t.name} />
        </div>
      )}
      <div className="mt-4">
        <FileDrop
          files={files}
          onChange={(next) => {
            const now = Date.now();
            for (const f of next) if (!(f.id in addedAt.current)) addedAt.current[f.id] = now;
            setFiles(next);
            setBusyWarn(false);
            if (touched) setTouched(false);
          }}
          title="ลากไฟล์มาวางที่นี่ หรือกดเพื่อเลือกไฟล์"
          label="เลือกไฟล์ผลงาน"
        />
      </div>

      <div className="mt-4">
        <Field
          label="หมายเหตุ"
          error={
            busyWarn
              ? "รอให้ไฟล์อัปโหลดเสร็จก่อนส่ง"
              : touched && empty
                ? "แนบไฟล์หรือเขียนหมายเหตุอย่างน้อยหนึ่งอย่าง"
                : undefined
          }
        >
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (touched) setTouched(false);
            }}
            placeholder="บอกสั้นๆ ว่าทำอะไรไปบ้าง"
            className="field-control h-[86px] resize-y py-2.5 leading-relaxed"
          />
        </Field>
      </div>
      </div>
    </Sheet>
  );
}

// ─── คุยกับ PM เรื่องงานใบนี้ ─────────────────────────────────────

/**
 * ผู้รับงานอ่านและตอบข้อความที่ PM ส่งมาเรื่องงานของตัวเอง
 *
 * แชทโปรเจคอยู่ในหน้าของ PM ซึ่งบทบาททีมงานเปิดไม่ได้ (กติกาเมนูตามบทบาท)
 * เอาเฉพาะส่วนที่เกี่ยวกับงานของตัวเองมาไว้ตรงนี้แทน ไม่ต้องให้สิทธิ์เข้าหน้าของ PM
 */
function TalkDialog({
  row,
  me,
  onClose,
  onSent,
}: {
  row: Row;
  me: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { p, t } = row;
  const talks = taskTalks(usePm(), p.pj, t.name);
  const [tx, setTx] = useState("");
  const [err, setErr] = useState(false);

  return (
    <Sheet
      title={t.name}
      onClose={onClose}
      steady
      footer={
        <>
          <button type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={onClose}>
            ปิด
          </button>
          <button
            type="button"
            className="btn solid btn-solid flex-1 justify-center sm:flex-none"
            onClick={() => {
              const v = tx.trim();
              if (!v) return setErr(true);
              postTaskTalk(p.pj, t.name, me, v, bkkStamp());
              onSent();
            }}
          >
            ส่งถึง Project Manager
          </button>
        </>
      }
    >
      <p className="m-mt-dlg text-[12.5px] text-muted-foreground">
        {projName(p)} · กำหนดส่ง {thaiDate(t.due)}
      </p>
      <TalkList talks={talks} pmName={p.pm} />
      <div className="mt-4">
        <label htmlFor="talk-tx" className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">
          ตอบ Project Manager
        </label>
        <textarea
          id="talk-tx"
          autoFocus
          rows={3}
          value={tx}
          onChange={(e) => {
            setTx(e.target.value);
            setErr(false);
          }}
          placeholder="เช่น ติดรอไฟล์จากลูกค้า จะส่งได้พรุ่งนี้บ่าย"
          className="field-control w-full resize-y py-2.5 text-[13.5px] leading-relaxed"
        />
        {err && <p className="mt-2 text-[12.5px] text-destructive">เขียนข้อความก่อนส่ง</p>}
      </div>
    </Sheet>
  );
}

// ─── ชิ้นเล็ก ─────────────────────────────────────────────────────

/**
 * สิ่งที่ PM สั่งให้แก้ — ขึ้นทุกที่ที่คนทำงานกำลังจะกดส่งใหม่ (การ์ดงาน กล่องส่งงาน กล่องรายละเอียด)
 * ตีกลับแล้วไม่บอกเหตุผลถือเป็นข้อมูลหาย ต้องบอกตรง ๆ ว่า PM ยังไม่ได้เขียน
 */
function BackNote({ back, pj, task }: { back?: ProjectTask["back"]; pj?: string; task?: string }) {
  /*
   * PM ส่งความเห็นของลูกค้าต่อมา (ลิงก์ตรวจงาน) — จับคู่ด้วยเวลาที่ตีกลับ (forwardedAt = back.at)
   * ข้อมูลที่เวลาไม่ตรงกัน: รอบล่าสุดของงานที่ส่งต่อแล้ว และข้อความตีกลับขึ้นต้นด้วยรอบนั้น (composeReason)
   * ตีกลับด้วยข้อความของ PM เอง = ไม่มีรอบ → แสดงข้อความเดิม
   */
  const reviews = useClientReviews();
  const round = back && pj && task ? reviewRoundOfBack(reviews, pj, task, back) : undefined;
  if (!back) {
    return (
      <p className="rounded-[14px] bg-muted px-4 py-3 text-[13px] text-muted-foreground">
        Project Manager ตีกลับโดยไม่ได้เขียนเหตุผล · ถาม Project Manager ก่อนส่งใหม่
      </p>
    );
  }
  const by = (
    <em className="num mt-1.5 block text-[11.5px] text-muted-foreground not-italic">
      {/* บางใบเก็บเป็นรหัสพนักงาน — คนอ่านต้องเห็นชื่อ ไม่ใช่รหัส */}
      {back.by ? nameOf(memberName(back.by)) : "Project Manager"}
      {/* บนการ์ดวันที่อยู่บรรทัดล่างแล้ว (ผู้ใช้สั่ง 29 ต.ค. 2569) */}
      {pj ? ` · ${thaiDate(back.at.split(" ")[0])}` : ""}
    </em>
  );
  /* รูปพร้อมหมุดของลูกค้า แทนข้อความบรรทัดละจุด — PM ติ๊กแก้แล้วครบทุกจุดภายหลัง = กลับไปแสดงข้อความเดิม */
  if (round && openFixes(round).length > 0) {
    return (
      <div className="rounded-[14px] bg-[var(--destructive-soft)] px-4 py-3.5">
        <h5 className="text-[13px] font-bold text-destructive">สิ่งที่ต้องแก้ตามความเห็นลูกค้า</h5>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          รอบที่ {round.round}
          {round.contact ? ` · ${round.contact}` : ""}
        </p>
        <div className="mt-2.5 rounded-[12px] bg-card p-3">
          <ClientFixBoard round={round} />
        </div>
        {by}
      </div>
    );
  }
  return (
    <div className="rounded-[14px] bg-[var(--destructive-soft)] px-4 py-3.5">
      <h5 className="text-[13px] font-bold text-destructive">สิ่งที่ต้องแก้ตามที่ Project Manager ตีกลับ</h5>
      {back.why && <p className="mt-1.5 text-[13px] leading-relaxed whitespace-pre-line text-destructive">{back.why}</p>}
      {/* คอมเมนต์ของ PM บนไฟล์ — แยกตามไฟล์ กดไฟล์เปิดดูหมุด (ผู้ใช้สั่ง 29 ต.ค. 2569)
          บนการ์ดมีแค่ข้อความ เห็นไฟล์เต็มเมื่อเปิดรายละเอียดงาน (การ์ดไม่ส่ง pj มา — ผู้ใช้สั่ง 29 ต.ค. 2569) */}
      {pj && back.notes?.length ? (
        <div className="mt-2.5 rounded-[12px] bg-card p-3">
          <FileNotesView notes={back.notes} />
        </div>
      ) : null}
      {by}
    </div>
  );
}

/** รอบตรวจของลูกค้าที่ทำให้งานถูกตีกลับครั้งนี้ */
function reviewRoundOfBack(
  s: ReturnType<typeof useClientReviews>,
  pj: string,
  task: string,
  back: NonNullable<ProjectTask["back"]>,
) {
  const sent = roundsOfTask(s, pj, task).filter((r) => r.forwardedAt);
  const exact = sent.find((r) => r.forwardedAt === back.at);
  if (exact) return exact;
  const last = sent[sent.length - 1];
  return last && back.why.startsWith(`ความเห็นจากลูกค้า รอบที่ ${last.round}`) ? last : undefined;
}

function Kv({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-[11.5px] text-muted-foreground">{k}</dt>
      <dd className={`mt-1 text-[13.5px] font-semibold ${warn ? "text-destructive" : ""}`}>
        {v}
      </dd>
    </div>
  );
}

/** ไฟล์พร้อมขนาด (ถ้ารู้) — ไฟล์จาก PM มีขนาด ไฟล์ที่ส่งงานเก็บแต่ชื่อ ตามต้นแบบ fileRow */
function FileList({ names, empty }: { names: { n: string; sz?: string }[]; empty: string }) {
  if (names.length === 0) {
    return <p className="text-[13px] text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {names.map(({ n, sz }) => (
        <li key={n} className="flex items-center gap-3">
          <FileIcon className="size-[15px] flex-none text-muted-foreground" strokeWidth={2} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{n}</span>
            <em className="block text-[11.5px] text-muted-foreground not-italic">
              {fileKindLabel(n)}
              {sz ? ` · ${sz}` : ""}
            </em>
          </span>
          <DownloadLink />
        </li>
      ))}
    </ul>
  );
}

/* ยังไม่มีที่เก็บไฟล์จริง ปุ่มจึงบอกตรง ๆ แทนที่จะทำเป็นว่าโหลดได้ */
/*
 * เอกสารที่ PM/GM แนบให้ทั้งโปรเจค (ปุ่ม "+" ข้างใบเสนอราคา/Proposal) — ทีมเปิดหน้าโปรเจคของ PM ไม่ได้
 * จึงโชว์ต่อจากไฟล์จาก PM ในหน้างานที่ได้รับ (ผู้ใช้สั่ง 5 ต.ค. 2569)
 */
/** ปุ่มเปิดแชทกลุ่มของโปรเจค — ยังไม่มีสถานะอ่านแล้วในสโตร์ จึงไม่มีตัวเลขยังไม่อ่าน */
function ChatButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="btn glass-thin btn-mini gap-1.5 text-primary">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" />
      </svg>
      แชทโปรเจค
    </button>
  );
}

function ProjectDocs({ p }: { p: Project }) {
  const docs = p.docs ?? [];
  if (!docs.length) return null;
  return (
    <>
      <p className="mt-5 mb-2 text-[11.5px] text-muted-foreground">เอกสารของโปรเจค</p>
      <ul className="flex flex-col gap-2">
        {docs.map((d) => (
          <li key={d.n} className="flex items-center gap-3">
            <FileIcon className="size-[15px] flex-none text-muted-foreground" strokeWidth={2} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{d.n}</span>
              <em className="block text-[11.5px] text-muted-foreground not-italic">
                {d.url ? "ลิงก์" : `${fileKindLabel(d.n)} · ${d.sz}`} · แนบโดย {d.by ? nameOf(d.by) : "—"}
              </em>
            </span>
            {d.url ? (
              <a href={d.url} target="_blank" rel="noreferrer" className="text-[12.5px] font-semibold text-primary hover:underline">
                เปิด
              </a>
            ) : (
              <DownloadLink />
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function DownloadLink({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      className={`lnk flex flex-none items-center gap-1 ${className}`}
      onClick={() => window.alert("ยังไม่มีระบบเก็บไฟล์จริง จึงยังดาวน์โหลดไม่ได้")}
    >
      <DownloadIcon className="size-[14px]" strokeWidth={2} />
      ดาวน์โหลด
    </button>
  );
}



/** "2026-09-06 16:45" → "6 ก.ย. 2569 16:45 น." */
function stamp(value: string) {
  const [day, time] = value.split(" ");
  return time ? `${thaiDate(day)} ${time} น.` : thaiDate(day);
}

