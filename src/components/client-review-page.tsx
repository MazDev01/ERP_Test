"use client";

/*
 * หน้าลูกค้าตรวจงาน /review/<token> — เปิดจากลิงก์ที่ PM ส่ง ไม่ต้องล็อกอิน ไม่มีเมนูของระบบ (app-shell)
 * แบบอ้างอิง: หน้ารีวิวไฟล์สไตล์ Frame.io แต่ใช้สี MAZ ขาว/แดง (เจ้าของสั่ง 2 ต.ค. 2569)
 *
 *   หัว: โลโก้ MAZ · ตรวจงาน · รอบที่ N
 *   ชื่อโปรเจค + งาน · N ไฟล์ · ขนาดรวม · ผู้ส่ง · วันหมดอายุ · ข้อความจาก PM
 *   การ์ดไฟล์ (สลับตาราง/รายการ) — อนุมัติทีละไฟล์ หรือเปิดตัวดูไฟล์เพื่อคอมเมนต์
 *   แถบล่าง: ส่งความเห็นให้ทีม · อนุมัติงานทั้งหมด → ส่งแล้วหน้านี้อ่านอย่างเดียว
 *
 * เฟส 1 ข้อมูลอยู่ใน localStorage (client-review-store) — เปิดได้เฉพาะเบราว์เซอร์เดียวกับ PM
 */

import { useEffect, useRef, useState } from "react";
import { thaiDate, thaiStamp } from "@/lib/format";
import { useHydrated } from "@/lib/pwa";
import { lockScroll } from "@/lib/scroll-lock";
import {
  addComment,
  clock,
  commentWhere,
  deleteComment,
  editComment,
  findRound,
  liveUrl,
  rememberName,
  rememberedName,
  roundStatus,
  setFileApproved,
  submitRound,
  totalSize,
  useClientReviews,
  type ReviewComment,
  type ReviewFile,
  type ReviewRound,
  type ReviewStatus,
} from "@/lib/client-review-store";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, FileIcon, GridIcon, LinkIcon, MenuIcon } from "./icons";
import "@/styles/review.css";
import { PinBoard } from "./review-pins";
import { nameOf } from "@/lib/emp-name";

function Wordmark({ className = "h-[22px] w-auto" }: { className?: string }) {
  return (
    <svg viewBox="60 115 1560 410" className={className} role="img" aria-label="MAZ">
      <g fill="none" stroke="var(--primary)" strokeWidth="80" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="115,470 115,170 335,355 555,170 555,470" />
        <polyline points="670,470 885,170 1105,470" />
        <polyline points="1215,170 1565,170 1215,470 1565,470" />
      </g>
    </svg>
  );
}

function PlayGlyph({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l10.5-6.5z" />
    </svg>
  );
}

function PauseGlyph({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
    </svg>
  );
}

export function ClientReviewPage({ token }: { token: string }) {
  /* ข้อมูลอยู่ในเบราว์เซอร์ — ก่อน hydrate ยังไม่รู้ว่ามีรอบนี้ไหม อย่าเพิ่งบอกว่าลิงก์หมดอายุ */
  const hydrated = useHydrated();
  const s = useClientReviews();
  if (!hydrated) {
    return (
      <div className="rv">
        <div className="grid flex-1 place-items-center text-[13px] text-muted-foreground">กำลังเปิดงาน…</div>
      </div>
    );
  }
  const r = findRound(s, token);
  const st = r ? roundStatus(r) : "expired";
  if (!r || st === "expired") return <Gone />;
  return <Review r={r} st={st} />;
}

function Gone() {
  return (
    <div className="rv">
      <div className="grid flex-1 place-items-center px-4">
        <div className="w-full max-w-[420px] rounded-[20px] bg-white px-6 py-10 text-center shadow-[0_1px_2px_rgba(40,20,25,.04)]">
          <Wordmark className="mx-auto h-[30px] w-auto" />
          <h1 className="mt-6 text-[17px] font-bold">ลิงก์นี้หมดอายุแล้ว</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
            กรุณาติดต่อผู้ดูแลโปรเจค เพื่อขอลิงก์ตรวจงานใหม่
          </p>
        </div>
      </div>
    </div>
  );
}

function Thumb({ f, onOpen }: { f: ReviewFile; onOpen: () => void }) {
  const url = liveUrl(f);
  return (
    <button type="button" className="rv-thumb" onClick={onOpen} aria-label={`เปิด ${f.name}`}>
      {f.kind === "image" && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" />
      ) : f.kind === "video" ? (
        <>
          {f.poster && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.poster} alt="" />
          )}
          <span className="rv-play">
            <PlayGlyph />
          </span>
          {f.duration ? <span className="rv-dur num">{clock(f.duration)}</span> : null}
        </>
      ) : (
        <span className="ico">{f.kind === "link" ? <LinkIcon className="size-6" /> : <FileIcon className="size-6" />}</span>
      )}
    </button>
  );
}

function fileChip(f: ReviewFile, n: number) {
  if (f.approved) return { text: "อนุมัติแล้ว", cls: "t-ok" };
  if (n > 0) return { text: `มีคอมเมนต์ ${n}`, cls: "t-early" };
  return { text: "รอตรวจ", cls: "t-miss" };
}

function Review({ r, st }: { r: ReviewRound; st: Exclude<ReviewStatus, "expired"> }) {
  const readOnly = st !== "open";
  const [view, setView] = useState<"grid" | "list">("grid");
  const [open, setOpen] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<null | "submit" | "approve">(null);
  /* ชื่อผู้คอมเมนต์ — เคยแก้ไว้ในเบราว์เซอร์นี้ใช้ชื่อนั้น ไม่งั้นใช้ผู้ติดต่อของดีล */
  const [name, setName] = useState(() => rememberedName() || r.contact);
  const approvedN = r.files.filter((f) => f.approved).length;

  return (
    <div className="rv">
      <header className="rv-head">
        <div className="rv-brand">
          <Wordmark />
          <b>ตรวจงาน</b>
        </div>
        <span className="rv-round num">
          รอบที่ {r.round} · {thaiDate(r.createdAt.slice(0, 10))}
        </span>
      </header>

      <main className="rv-main">
        <h1 className="rv-title">
          {r.project} – {r.taskName}
        </h1>
        <p className="rv-meta num">
          {r.files.length} ไฟล์ · {totalSize(r.files)} · ส่งโดย {nameOf(r.createdBy)} · ลิงก์หมดอายุ {thaiDate(r.expiresAt)}
        </p>
        {r.message && (
          <p className="rv-msg">
            <b className="mb-0.5 block text-[12px] font-semibold text-muted-foreground">ข้อความจาก {nameOf(r.createdBy)}</b>
            {r.message}
          </p>
        )}

        {st === "approved" && (
          <p className="rv-banner ok">
            <b className="block text-[15px]">ขอบคุณค่ะ — อนุมัติงานรอบนี้แล้ว</b>
            ทีมได้รับผลแล้ว ส่งเมื่อ {thaiStamp(r.submittedAt ?? "")} น. · หน้านี้ดูได้อย่างเดียว
          </p>
        )}
        {st === "submitted" && (
          <p className="rv-banner sent">
            <b className="block text-[15px]">ขอบคุณค่ะ — ส่งความเห็นให้ทีมแล้ว</b>
            คอมเมนต์ {r.comments.length} จุด ส่งเมื่อ {thaiStamp(r.submittedAt ?? "")} น.
          </p>
        )}

        <div className="rv-filesbar">
          <h2>ไฟล์ ({r.files.length})</h2>
          <div className="seg" role="group" aria-label="มุมมอง">
            <button type="button" className={view === "grid" ? "on" : ""} onClick={() => setView("grid")} aria-label="ตาราง">
              <GridIcon className="size-4" />
            </button>
            <button type="button" className={view === "list" ? "on" : ""} onClick={() => setView("list")} aria-label="รายการ">
              <MenuIcon className="size-4" />
            </button>
          </div>
        </div>

        <div className={`rv-grid ${view === "list" ? "list" : ""}`}>
          {r.files.map((f, i) => {
            const n = r.comments.filter((c) => c.fileId === f.id).length;
            const chip = fileChip(f, n);
            return (
              <article key={f.id} className="rv-card">
                <Thumb f={f} onOpen={() => setOpen(i)} />
                <div className="rv-cbody">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="nm" title={f.name}>
                        {f.name}
                      </p>
                      <p className="sz num">{f.size}</p>
                    </div>
                    <span className={`tag ${chip.cls} flex-none`}>
                      <i />
                      {chip.text}
                    </span>
                  </div>
                  <div className="rv-acts">
                    <button
                      type="button"
                      className={f.approved ? "on" : ""}
                      disabled={readOnly}
                      onClick={() => setFileApproved(r.token, f.id, !f.approved)}
                    >
                      {f.approved ? "✓ อนุมัติแล้ว" : "อนุมัติ"}
                    </button>
                    <button type="button" onClick={() => setOpen(i)}>
                      {readOnly || f.approved ? "ดูไฟล์" : "คอมเมนต์"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>

      {!readOnly && (
        <footer className="rv-foot">
          <div className="rv-foot-in">
            {confirm ? (
              <>
                <p className="sum">
                  {confirm === "approve"
                    ? `ยืนยันอนุมัติทั้ง ${r.files.length} ไฟล์?${r.comments.length ? ` คอมเมนต์ ${r.comments.length} จุดจะส่งไปเป็นหมายเหตุ` : ""}`
                    : `ยืนยันส่งคอมเมนต์ ${r.comments.length} จุดให้ทีม? ส่งแล้วแก้ไม่ได้`}
                </p>
                <button type="button" className="btn glass-thin" onClick={() => setConfirm(null)}>
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className={`btn solid ${confirm === "approve" ? "!bg-[var(--success)]" : "btn-solid"}`}
                  onClick={() => {
                    submitRound(r.token, confirm === "approve");
                    setConfirm(null);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  ยืนยัน
                </button>
              </>
            ) : (
              <>
                <p className="sum num">
                  คอมเมนต์ {r.comments.length} จุด · อนุมัติ {approvedN}/{r.files.length} ไฟล์
                </p>
                <button
                  type="button"
                  className="btn glass-thin"
                  disabled={r.comments.length === 0 && approvedN === 0}
                  title={r.comments.length === 0 && approvedN === 0 ? "ยังไม่มีคอมเมนต์หรือไฟล์ที่อนุมัติ" : undefined}
                  onClick={() => setConfirm("submit")}
                >
                  ส่งความเห็นให้ทีม
                </button>
                <button type="button" className="btn solid !bg-[var(--success)]" onClick={() => setConfirm("approve")}>
                  อนุมัติงานทั้งหมด
                </button>
              </>
            )}
          </div>
        </footer>
      )}

      {open !== null && r.files[open] && (
        <Viewer
          r={r}
          index={open}
          setIndex={setOpen}
          onClose={() => setOpen(null)}
          readOnly={readOnly}
          name={name}
          setName={setName}
        />
      )}
    </div>
  );
}

// ─── ตัวดูไฟล์ ────────────────────────────────────────────────────

type MediaApi = {
  seek: (t: number) => void;
  pause: () => void;
  now: () => number;
  /** ภาพเฟรมตอนนี้เป็น JPEG เล็ก — วาดไม่ได้ (เช่น canvas ติด taint) คืน undefined */
  frame: () => string | undefined;
};

function Viewer({
  r,
  index,
  setIndex,
  onClose,
  readOnly,
  name,
  setName,
}: {
  r: ReviewRound;
  index: number;
  setIndex: (i: number) => void;
  onClose: () => void;
  readOnly: boolean;
  name: string;
  setName: (v: string) => void;
}) {
  const f = r.files[index];
  /* ไฟล์ที่ลูกค้าอนุมัติแล้วคอมเมนต์เพิ่มไม่ได้ — ยกเลิกอนุมัติก่อนถึงคอมเมนต์ได้ (ผู้ใช้สั่ง 20 ต.ค. 2569) */
  const locked = readOnly || !!f.approved;
  const total = r.files.length;
  const api = useRef<MediaApi | null>(null);
  const [time, setTime] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [scope, setScope] = useState<"here" | "whole">("here");
  const [page, setPage] = useState("");
  const [text, setText] = useState("");
  const [attach, setAttach] = useState<{ name: string; data?: string } | null>(null);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  const comments = r.comments
    .filter((c) => c.fileId === f.id)
    .sort((a, b) => (a.t ?? -1) - (b.t ?? -1) || (a.pin?.n ?? 0) - (b.pin?.n ?? 0) || a.at.localeCompare(b.at));
  const nextPin = Math.max(0, ...r.comments.filter((c) => c.fileId === f.id).map((c) => c.pin?.n ?? 0)) + 1;

  /* เปลี่ยนไฟล์ = ล้างสิ่งที่เลือกค้างของไฟล์ก่อน (เรียกจากปุ่ม ไม่ใช่ใน effect) */
  function go(i: number) {
    if (i < 0 || i >= total) return;
    setIndex(i);
    setTime(0);
    setActive(null);
    setPending(null);
    setScope("here");
    setPage("");
    setErr("");
    setEditing(null);
  }

  useEffect(() => {
    const unlock = lockScroll();
    return unlock;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "Escape") onClose();
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") go(index - 1);
      if (e.key === "ArrowRight") go(index + 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function pickAttach(file: File | undefined) {
    if (!file) return;
    /* เก็บภาพตัวอย่างเฉพาะไฟล์เล็ก (< ~300KB) — localStorage มีที่จำกัด ไฟล์ใหญ่จำแค่ชื่อ */
    if (file.type.startsWith("image/") && file.size < 300 * 1024) {
      const fr = new FileReader();
      fr.onload = () => setAttach({ name: file.name, data: typeof fr.result === "string" ? fr.result : undefined });
      fr.onerror = () => setAttach({ name: file.name });
      fr.readAsDataURL(file);
    } else {
      setAttach({ name: file.name });
    }
  }

  function send() {
    const v = text.trim();
    const who = name.trim();
    if (!who) return setErr("ใส่ชื่อของคุณก่อน");
    if (!v) return setErr("เขียนคอมเมนต์ก่อน");
    rememberName(who);
    const base = { fileId: f.id, author: who, text: v, ...(attach ? { attach } : {}) };
    let c: Omit<ReviewComment, "id" | "at"> = base;
    if (f.kind === "video" && scope === "here") {
      api.current?.pause();
      const t = Math.round((api.current?.now() ?? time) * 10) / 10;
      const frame = api.current?.frame();
      c = { ...base, t, ...(frame ? { frame } : {}) };
    } else if (f.kind === "image" && scope === "here") {
      if (!pending) return setErr("คลิกบนรูปเพื่อปักหมุดก่อน หรือเลือก “ทั้งไฟล์”");
      c = { ...base, pin: { ...pending, n: nextPin } };
      setPending(null);
    } else if (f.kind === "pdf" && Number(page) > 0) {
      c = { ...base, page: Math.floor(Number(page)) };
    }
    const id = addComment(r.token, c);
    setActive(id);
    setText("");
    setAttach(null);
    setErr("");
    return true;
  }

  /* ปุ่มบันทึกมุมขวาบน — มีข้อความค้างในช่องก็บันทึกเป็นคอมเมนต์ก่อน แล้วปิดตัวดูไฟล์ */
  function save() {
    if (text.trim() && send() !== true) return;
    onClose();
  }

  function pickComment(c: ReviewComment) {
    setActive(c.id);
    if (c.t !== undefined) api.current?.seek(c.t);
  }

  const hasHere = f.kind === "video" || f.kind === "image";
  const here = hasHere && scope === "here";

  return (
    <div className="rvv" role="dialog" aria-modal="true" aria-label={f.name}>
      <div className="rvv-top">
        <button type="button" className="iconbtn glass-thin flex-none" onClick={onClose} aria-label="ปิด">
          <CloseIcon className="size-4" />
        </button>
        <p className="nm" title={f.name}>
          {f.name}
        </p>
        <span className="ix num">
          {index + 1}/{total}
        </span>
        {/* อนุมัติทำที่การ์ดไฟล์ ในตัวดูไฟล์เป็นปุ่มบันทึกแทน (ผู้ใช้สั่ง 20 ต.ค. 2569) */}
        {!locked && (
          <button type="button" onClick={save} className="btn solid btn-solid flex-none">
            บันทึก
          </button>
        )}
      </div>

      <div className="rvv-body">
        <div className="rvv-stage">
          <button type="button" className="rvv-nav prev" disabled={index === 0} onClick={() => go(index - 1)} aria-label="ไฟล์ก่อนหน้า">
            <ChevronLeftIcon className="size-5" />
          </button>
          <button type="button" className="rvv-nav next" disabled={index >= total - 1} onClick={() => go(index + 1)} aria-label="ไฟล์ถัดไป">
            <ChevronRightIcon className="size-5" />
          </button>
          <div className="rvv-media">
            {f.kind === "video" ? (
              <VideoStage
                key={f.id}
                f={f}
                api={api}
                marks={comments.filter((c) => c.t !== undefined)}
                active={active}
                onTime={setTime}
                onMark={pickComment}
              />
            ) : f.kind === "image" ? (
              <ImageStage
                key={f.id}
                f={f}
                pins={comments.filter((c) => c.pin)}
                pending={here && !locked ? pending : null}
                nextPin={nextPin}
                active={active}
                readOnly={locked}
                onPick={(p) => {
                  setPending(p);
                  setScope("here");
                  setErr("");
                }}
                onPin={pickComment}
              />
            ) : f.kind === "pdf" ? (
              <PdfStage f={f} />
            ) : (
              <LinkStage f={f} />
            )}
          </div>
        </div>

        <aside className="rvv-side">
          <div className="rvv-list">
            <h3 className="mb-2 text-[13.5px] font-bold">
              คอมเมนต์ <span className="font-normal text-muted-foreground">{comments.length ? `${comments.length} จุด` : "(ยังไม่มี)"}</span>
            </h3>
            {comments.length === 0 ? (
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                {locked
                  ? "ไม่มีคอมเมนต์ในไฟล์นี้"
                  : f.kind === "video"
                    ? "ยังไม่มีคอมเมนต์ในไฟล์นี้ หยุดวิดีโอตรงจุดที่ต้องการแล้วเขียนด้านล่าง"
                    : f.kind === "image"
                      ? "ยังไม่มีคอมเมนต์ในไฟล์นี้ คลิกบนรูปตรงจุดที่ต้องการเพื่อปักหมุด แล้วเขียนด้านล่าง"
                      : "ยังไม่มีคอมเมนต์ในไฟล์นี้ เขียนความเห็นด้านล่างได้เลย"}
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {comments.map((c) => (
                  <li
                    key={c.id}
                    className={`rvc-item click ${active === c.id ? "on" : ""}`}
                    onClick={() => pickComment(c)}
                  >
                    {c.frame ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.frame} alt="" className="rvc-frame" />
                    ) : c.pin ? (
                      <span className="rvc-pin">{c.pin.n}</span>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-[11.5px] text-muted-foreground">
                        <b className="num font-semibold text-primary">{commentWhere(c)}</b>
                        <b className="font-semibold text-foreground">{c.author}</b>
                        <span className="num">{thaiStamp(c.at)} น.</span>
                      </p>
                      {editing?.id === c.id ? (
                        <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                          <textarea
                            value={editing.text}
                            onChange={(e) => setEditing({ id: c.id, text: e.target.value })}
                            rows={2}
                            className="field-control h-auto resize-y py-2 text-[13px]"
                            aria-label="แก้คอมเมนต์"
                          />
                          <div className="mt-1.5 flex gap-1.5">
                            <button
                              type="button"
                              className="btn solid btn-solid btn-mini"
                              onClick={() => {
                                editComment(r.token, c.id, editing.text);
                                setEditing(null);
                              }}
                            >
                              บันทึก
                            </button>
                            <button type="button" className="btn glass-thin btn-mini" onClick={() => setEditing(null)}>
                              ยกเลิก
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-0.5 text-[13px] leading-relaxed break-words whitespace-pre-line">{c.text}</p>
                      )}
                      {c.attach && (
                        <p className="mt-1 flex items-center gap-2 text-[11.5px] text-muted-foreground">
                          {c.attach.data && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.attach.data} alt="" className="size-10 rounded-md object-cover" />
                          )}
                          แนบ {c.attach.name}
                        </p>
                      )}
                      {!locked && editing?.id !== c.id && (
                        <p className="mt-1 flex gap-3 text-[11.5px] font-semibold">
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditing({ id: c.id, text: c.text });
                            }}
                          >
                            แก้ไข
                          </button>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteComment(r.token, c.id);
                            }}
                          >
                            ลบ
                          </button>
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!locked && (
            <div className="rvv-form">
              <div className="rvv-chips" role="group" aria-label="คอมเมนต์ตรงไหน">
                {f.kind === "video" && (
                  <button type="button" className={scope === "here" ? "on" : ""} onClick={() => setScope("here")}>
                    ที่ {clock(time)}
                  </button>
                )}
                {f.kind === "image" && (
                  <button type="button" className={scope === "here" ? "on" : ""} onClick={() => setScope("here")}>
                    {pending ? `จุดที่ ${nextPin}` : "ปักหมุดบนรูป"}
                  </button>
                )}
                <button
                  type="button"
                  className={!hasHere || scope === "whole" ? "on" : ""}
                  onClick={() => {
                    setScope("whole");
                    setPending(null);
                  }}
                >
                  {f.kind === "video" ? "ทั้งวิดีโอ" : "ทั้งไฟล์"}
                </button>
                {f.kind === "pdf" && (
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={page}
                    onChange={(e) => setPage(e.target.value)}
                    placeholder="หน้า (ไม่บังคับ)"
                    aria-label="เลขหน้า"
                    className="field-control !h-[30px] w-[130px] !rounded-full !px-3 text-[12.5px]"
                  />
                )}
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ชื่อของคุณ"
                aria-label="ชื่อของคุณ"
                className="field-control mt-2 !h-[38px] text-[13px]"
              />
              <textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setErr("");
                }}
                rows={3}
                placeholder={
                  f.kind === "video" && here
                    ? "เห็นอะไรตรงนี้?"
                    : f.kind === "image" && here
                      ? "ตรงหมุดนี้ต้องปรับอะไร?"
                      : "ความเห็นต่อไฟล์นี้"
                }
                aria-label="คอมเมนต์"
                className="field-control mt-2 h-auto resize-y py-2 text-[13px] leading-relaxed"
              />
              {attach && (
                <p className="mt-1.5 flex items-center gap-2 text-[12px] text-muted-foreground">
                  {attach.data && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={attach.data} alt="" className="size-8 rounded object-cover" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{attach.name}</span>
                  <button type="button" className="font-semibold hover:text-destructive" onClick={() => setAttach(null)}>
                    เอาออก
                  </button>
                </p>
              )}
              {err && <p className="mt-1.5 text-[12px] font-semibold text-destructive">{err}</p>}
              <div className="mt-2 flex items-center gap-2">
                <label className="btn glass-thin cursor-pointer">
                  แนบรูป
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      pickAttach(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button type="button" className="btn solid btn-solid ml-auto" onClick={send}>
                  คอมเมนต์
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ─── สื่อแต่ละชนิด ────────────────────────────────────────────────

/** ภาพเฟรมของตัวเล่นจำลอง — ไม่มีไฟล์จริงให้วาด จึงวาดพื้นกับเวลาแทน ให้คอมเมนต์ยังมีภาพประกอบ */
function fakeFrame(t: number) {
  try {
    const c = document.createElement("canvas");
    c.width = 240;
    c.height = 135;
    const g = c.getContext("2d");
    if (!g) return undefined;
    const grad = g.createLinearGradient(0, 0, 240, 135);
    grad.addColorStop(0, "#6b0000");
    grad.addColorStop(1, "#db0000");
    g.fillStyle = grad;
    g.fillRect(0, 0, 240, 135);
    g.fillStyle = "#fff";
    g.font = "bold 28px sans-serif";
    g.textAlign = "center";
    g.fillText(clock(t), 120, 78);
    return c.toDataURL("image/jpeg", 0.7);
  } catch {
    return undefined;
  }
}

function VideoStage({
  f,
  api,
  marks,
  active,
  onTime,
  onMark,
}: {
  f: ReviewFile;
  api: React.RefObject<MediaApi | null>;
  marks: ReviewComment[];
  active: string | null;
  onTime: (t: number) => void;
  onMark: (c: ReviewComment) => void;
}) {
  const url = liveUrl(f);
  const vref = useRef<HTMLVideoElement>(null);
  const tRef = useRef(0);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(f.duration ?? 165);
  const [playing, setPlaying] = useState(false);
  const real = Boolean(url);

  function report(n: number) {
    tRef.current = n;
    setT(n);
    onTime(n);
  }

  /* ตัวเล่นจำลอง — เดินเวลาเองทุก 250ms (ยังไม่มีไฟล์วิดีโอจริง) */
  useEffect(() => {
    if (real || !playing) return;
    const id = setInterval(() => {
      const n = Math.min(dur, tRef.current + 0.25);
      report(n);
      if (n >= dur) setPlaying(false);
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [real, playing, dur]);

  function seek(n: number) {
    const v = Math.max(0, Math.min(dur, n));
    if (real && vref.current) {
      vref.current.currentTime = v;
      vref.current.pause();
    }
    setPlaying(false);
    report(v);
  }

  function toggle() {
    if (real && vref.current) {
      if (vref.current.paused) void vref.current.play();
      else vref.current.pause();
      return;
    }
    if (tRef.current >= dur) report(0);
    setPlaying((p) => !p);
  }

  useEffect(() => {
    api.current = {
      seek,
      pause: () => {
        vref.current?.pause();
        setPlaying(false);
      },
      now: () => tRef.current,
      frame: () => {
        const v = vref.current;
        if (!real || !v) return fakeFrame(tRef.current);
        try {
          const w = 240;
          const h = Math.round((w * (v.videoHeight || 135)) / (v.videoWidth || 240));
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          c.getContext("2d")?.drawImage(v, 0, 0, w, h);
          return c.toDataURL("image/jpeg", 0.7);
        } catch {
          /* วิดีโอข้ามโดเมนทำให้ canvas ติด taint — เก็บคอมเมนต์ได้ แค่ไม่มีภาพเฟรม */
          return undefined;
        }
      },
    };
    return () => {
      api.current = null;
    };
  });

  const pct = dur ? (t / dur) * 100 : 0;

  return (
    <div className="rvv-video">
      <div className="rvv-screen">
        {real ? (
          <video
            ref={vref}
            src={url}
            poster={f.poster}
            playsInline
            preload="metadata"
            onClick={toggle}
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) setDur(d);
            }}
            onTimeUpdate={(e) => report(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onError={() => setDur(f.duration ?? 165)}
          />
        ) : (
          <>
            {f.poster ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.poster} alt="" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-[#6b0000] to-[#db0000]" />
            )}
            <span className="clockbig num">{clock(t)}</span>
          </>
        )}
        {!playing && (
          <button type="button" className="bigplay" onClick={toggle} aria-label="เล่น">
            <PlayGlyph className="size-7" />
          </button>
        )}
      </div>
      <div className="rvv-ctrl">
        <button type="button" className="pp" onClick={toggle} aria-label={playing ? "หยุด" : "เล่น"}>
          {playing ? <PauseGlyph className="size-4" /> : <PlayGlyph className="size-4" />}
        </button>
        <div
          className="rvv-track"
          role="slider"
          aria-label="ตำแหน่งวิดีโอ"
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          aria-valuenow={Math.round(t)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") seek(t - 5);
            if (e.key === "ArrowRight") seek(t + 5);
          }}
          onClick={(e) => {
            const b = e.currentTarget.getBoundingClientRect();
            seek(((e.clientX - b.left) / b.width) * dur);
          }}
        >
          <span className="fill" style={{ width: `${pct}%` }} />
          {marks.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`mk ${active === c.id ? "on" : ""}`}
              style={{ left: `${dur ? ((c.t ?? 0) / dur) * 100 : 0}%` }}
              title={`${clock(c.t ?? 0)} · ${c.text}`}
              aria-label={`คอมเมนต์ที่ ${clock(c.t ?? 0)}`}
              onClick={(e) => {
                e.stopPropagation();
                onMark(c);
              }}
            />
          ))}
        </div>
        <span className="tm num">
          {clock(t)} / {clock(dur)}
        </span>
      </div>
    </div>
  );
}

function ImageStage({
  f,
  pins,
  pending,
  nextPin,
  active,
  readOnly,
  onPick,
  onPin,
}: {
  f: ReviewFile;
  pins: ReviewComment[];
  pending: { x: number; y: number } | null;
  nextPin: number;
  active: string | null;
  readOnly: boolean;
  onPick: (p: { x: number; y: number }) => void;
  onPin: (c: ReviewComment) => void;
}) {
  return (
    <div className="flex w-full flex-col items-center">
      <PinBoard
        f={f}
        pins={pins}
        active={active}
        onPin={onPin}
        onPick={readOnly ? undefined : onPick}
        pending={pending}
        nextPin={nextPin}
        placeholder="ปักหมุดบนกรอบนี้หรือคอมเมนต์ทั้งไฟล์ได้"
      />
      {!readOnly && <p className="rvv-note">คลิกบนรูปตรงจุดที่ต้องการเพื่อปักหมุด</p>}
    </div>
  );
}

function PdfStage({ f }: { f: ReviewFile }) {
  const url = liveUrl(f);
  if (url) return <iframe src={url} title={f.name} className="rvv-pdf" />;
  return (
    <div className="rvv-ph">
      <span className="ico">
        <FileIcon className="size-7" />
      </span>
      <b className="block text-[14px] text-foreground">{f.name}</b>
      คอมเมนต์ทั้งไฟล์ หรือระบุเลขหน้าได้ที่ช่องด้านข้าง
    </div>
  );
}

function LinkStage({ f }: { f: ReviewFile }) {
  const href = f.url && /^https?:\/\//.test(f.url) ? f.url : /^https?:\/\//.test(f.name) ? f.name : undefined;
  return (
    <div className="rvv-ph">
      <span className="ico">
        <LinkIcon className="size-7" />
      </span>
      <b className="block text-[14px] break-all text-foreground">{href ?? f.name}</b>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="btn solid btn-solid mt-4 inline-flex">
          เปิดลิงก์
        </a>
      ) : (
        <span className="mt-2 block">Project Manager ยังไม่ได้ใส่ที่อยู่ลิงก์ — คอมเมนต์ทั้งไฟล์ได้ที่ช่องด้านข้าง</span>
      )}
    </div>
  );
}
