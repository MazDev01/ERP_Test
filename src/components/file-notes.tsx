"use client";

/*
 * คอมเมนต์ของ PM บนไฟล์ที่ทีมส่งมา ตอนตีกลับ — หน้าตาเดียวกับหน้าลูกค้าตรวจงาน (ผู้ใช้สั่ง 29 ต.ค. 2569)
 *
 *   FileNotesEditor — กล่องตรวจงานของ PM: เปิดไฟล์ → ปักหมุดบนรูป · ตามเวลาในวิดีโอ · ทั้งไฟล์
 *   FileNotesView   — กล่อง "สิ่งที่ต้องแก้ตามที่ PM ตีกลับ" ของทีม: รายการตามไฟล์ · กดไฟล์เปิดดูหมุด
 *
 * ไฟล์ของงานยังไม่มีที่เก็บจริง — PinBoard ขึ้นกรอบตัวแทนแล้ววาดหมุดบนกรอบนั้นเหมือนไฟล์ตัวอย่างของลูกค้า
 */

import { useRef, useState } from "react";
import {
  commentWhere,
  reviewKindOf,
  type ReviewComment,
  type ReviewFile,
} from "@/lib/client-review-store";
import type { FileNote } from "@/lib/pm-data";
import { FileIcon } from "./icons";
import { PinBoard } from "./review-pins";

const asFile = (name: string): ReviewFile => ({ id: name, name, kind: reviewKindOf(name), size: "—" });

const asComment = (n: FileNote, i: number): ReviewComment => ({
  id: String(i),
  fileId: n.file,
  author: "",
  text: n.text,
  at: "",
  t: n.t,
  pin: n.pin,
  page: n.page,
});

/** "1:05" → 65 วินาที · อ่านไม่ออก = undefined */
function secOf(v: string) {
  const m = /^\s*(\d+)(?::(\d{1,2}))?\s*$/.exec(v);
  if (!m) return undefined;
  return m[2] === undefined ? Number(m[1]) : Number(m[1]) * 60 + Number(m[2]);
}

function FileRow({ name, n, on, onClick }: { name: string; n: number; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left ${on ? "bg-accent" : "hover:bg-muted"}`}
    >
      <FileIcon className="size-[15px] flex-none text-muted-foreground" strokeWidth={2} />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{name}</span>
      {n > 0 && (
        <span className="num flex-none rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{n} จุด</span>
      )}
    </button>
  );
}

export function FileNotesEditor({
  files,
  notes,
  onChange,
}: {
  files: string[];
  notes: FileNote[];
  onChange: (next: FileNote[]) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [scope, setScope] = useState<"here" | "whole">("here");
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [time, setTime] = useState("");
  const [page, setPage] = useState("");
  const [text, setText] = useState("");
  const [err, setErr] = useState("");

  function pick(name: string) {
    setOpen(open === name ? null : name);
    setScope("here");
    setPending(null);
    setTime("");
    setPage("");
    setText("");
    setErr("");
  }

  const f = open ? asFile(open) : null;
  const mine = notes.map((n, i) => ({ n, i })).filter((x) => x.n.file === open);
  const nextPin = Math.max(0, ...mine.map((x) => x.n.pin?.n ?? 0)) + 1;
  const here = scope === "here" && (f?.kind === "image" || f?.kind === "video");

  function add() {
    if (!f) return;
    if (!text.trim()) return setErr("เขียนคอมเมนต์ก่อน");
    const note: FileNote = { file: f.name, text: text.trim() };
    if (here && f.kind === "image") {
      if (!pending) return setErr("แตะบนรูปเพื่อปักหมุด");
      note.pin = { ...pending, n: nextPin };
    }
    if (here && f.kind === "video") {
      const t = secOf(time);
      if (t === undefined) return setErr("ใส่เวลาในวิดีโอ");
      note.t = t;
    }
    if (f.kind === "pdf" && Number(page) > 0) note.page = Number(page);
    onChange([...notes, note]);
    setPending(null);
    setTime("");
    setPage("");
    setText("");
    setErr("");
  }

  return (
    <div className="flex flex-col gap-1">
      {files.map((name) => (
        <div key={name}>
          <FileRow name={name} n={notes.filter((x) => x.file === name).length} on={open === name} onClick={() => pick(name)} />
          {f && open === name && (
            <div className="mt-1.5 mb-2 rounded-[12px] border border-border bg-card p-3">
              <div className="flex justify-center">
                <PinBoard
                  f={f}
                  pins={f.kind === "image" ? mine.filter((x) => x.n.pin).map((x) => asComment(x.n, x.i)) : []}
                  active={null}
                  fit
                  onPick={
                    f.kind === "image" && scope === "here"
                      ? (p) => {
                          setPending(p);
                          setErr("");
                        }
                      : undefined
                  }
                  pending={pending}
                  nextPin={nextPin}
                />
              </div>
              {mine.length > 0 && (
                <ul className="mt-2.5 flex flex-col gap-1.5">
                  {mine.map(({ n, i }) => (
                    <li key={i} className="rvc-item">
                      {n.pin && <span className="rvc-pin">{n.pin.n}</span>}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-baseline gap-x-2 text-[11.5px] text-muted-foreground">
                          <b className="num font-semibold text-primary">{commentWhere(asComment(n, i))}</b>
                          <button
                            type="button"
                            className="ml-auto text-muted-foreground hover:text-destructive"
                            onClick={() => onChange(notes.filter((_, j) => j !== i))}
                          >
                            ลบ
                          </button>
                        </p>
                        <p className="mt-0.5 text-[13px] leading-relaxed break-words whitespace-pre-line">{n.text}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2.5">
                <div className="rvv-chips" role="group" aria-label="คอมเมนต์ตรงไหน">
                  {f.kind === "image" && (
                    <button type="button" className={scope === "here" ? "on" : ""} onClick={() => setScope("here")}>
                      {pending ? `จุดที่ ${nextPin}` : "ปักหมุดบนรูป"}
                    </button>
                  )}
                  {f.kind === "video" && (
                    <button type="button" className={scope === "here" ? "on" : ""} onClick={() => setScope("here")}>
                      ที่เวลา
                    </button>
                  )}
                  {f.kind === "video" && scope === "here" && (
                    <input
                      value={time}
                      onChange={(e) => {
                        setTime(e.target.value);
                        setErr("");
                      }}
                      placeholder="0:00"
                      inputMode="numeric"
                      aria-label="เวลาในวิดีโอ"
                      className="field-control num !h-[30px] w-[90px] !rounded-full !px-3 text-[12.5px]"
                    />
                  )}
                  <button
                    type="button"
                    className={!here ? "on" : ""}
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
                <textarea
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setErr("");
                  }}
                  rows={2}
                  placeholder={
                    f.kind === "image" && here ? "ตรงหมุดนี้ต้องปรับอะไร?" : f.kind === "video" && here ? "ตรงเวลานี้ต้องแก้อะไร?" : "ความเห็นต่อไฟล์นี้"
                  }
                  aria-label="คอมเมนต์"
                  className="field-control mt-2 h-auto resize-y py-2 text-[13px] leading-relaxed"
                />
                {err && <p className="mt-1.5 text-[12px] font-semibold text-destructive">{err}</p>}
                <div className="mt-2 flex justify-end">
                  <button type="button" className="btn solid btn-solid" onClick={add}>
                    คอมเมนต์
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function FileNotesView({ notes }: { notes: FileNote[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const all = notes.map(asComment);
  const files = [...new Set(notes.map((n) => n.file))];

  function showPin(c: ReviewComment) {
    setOpen(c.fileId);
    setActive(c.id);
    requestAnimationFrame(() =>
      box.current?.querySelector<HTMLElement>(`[data-pin="${c.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  }

  return (
    <div ref={box} className="flex flex-col gap-3">
      {files.map((name) => {
        const f = asFile(name);
        const list = all
          .filter((c) => c.fileId === name)
          .sort((a, b) => (a.t ?? -1) - (b.t ?? -1) || (a.pin?.n ?? 0) - (b.pin?.n ?? 0));
        const pins = f.kind === "image" ? list.filter((c) => c.pin) : [];
        return (
          <section key={name} className="min-w-0">
            <FileRow name={name} n={list.length} on={open === name} onClick={() => setOpen(open === name ? null : name)} />
            {open === name && (
              <div className="mt-1.5 mb-1 flex justify-center">
                <PinBoard
                  f={f}
                  pins={pins}
                  active={active}
                  fit
                  onPin={(c) => {
                    setActive(c.id);
                    box.current?.querySelector<HTMLElement>(`[data-item="${c.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                  }}
                />
              </div>
            )}
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {list.map((c) => {
                const pinned = pins.includes(c);
                return (
                  <li
                    key={c.id}
                    data-item={c.id}
                    className={`rvc-item ${pinned ? "click" : ""} ${active === c.id ? "on" : ""}`}
                    onClick={pinned ? () => showPin(c) : undefined}
                  >
                    {c.pin && <span className="rvc-pin">{c.pin.n}</span>}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11.5px] text-muted-foreground">
                        <b className="num font-semibold text-primary">{commentWhere(c)}</b>
                      </p>
                      <p className="mt-0.5 text-[13px] leading-relaxed break-words whitespace-pre-line text-foreground">{c.text}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
