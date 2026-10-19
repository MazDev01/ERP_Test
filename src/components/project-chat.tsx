"use client";

/*
 * แชทกลุ่มของโปรเจค — ปุ่มลอย + หน้าต่างแชทแบบ messenger มุมขวาล่าง (มือถือเต็มจอ)
 * แยกออกจาก pm-project-page.tsx เพื่อใช้ร่วมกับหน้างานที่ได้รับของทีมงาน (my-tasks) (ผู้ใช้สั่ง 5 ต.ค. 2569)
 * สายข้อความเดียวกันทั้งสองหน้า (project.chat ผ่าน postChat) — ต่างกันแค่ผู้ส่ง: หน้าโปรเจคส่งในนาม "PM"
 * หน้างานที่ได้รับส่งในนามรหัสพนักงานของคนที่ล็อกอิน
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { bkkNow, daysBetween, pad2, thaiDate, toIsoDate, todayIso } from "@/lib/format";
import { initialOf, nameOf } from "@/lib/emp-name";
import { projectMembers, type ChatMessage, type Project } from "@/lib/pm-data";
import { memberOf, postChat } from "@/lib/pm-store";
import { lockScroll } from "@/lib/scroll-lock";
import { ChevronLeftIcon, CloseIcon, FileIcon, UsersIcon } from "./icons";
import { Sheet } from "./lead-dialogs";
import "@/styles/project-chat.css";

/** ยังไม่มีที่เก็บไฟล์จริง — บอกชื่อไฟล์ที่จะเปิดไว้ก่อน (ต้นแบบใช้ alert) */
export function FileNotice({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <Sheet
      title="เปิดดูไฟล์"
      onClose={onClose}
      footer={
        <button type="button" className="btn glass-thin" onClick={onClose}>
          ปิด
        </button>
      }
    >
      <p className="text-[13.5px] font-semibold break-words">{name}</p>
    </Sheet>
  );
}


// ─── 4. แชทโปรเจค ────────────────────────────────────────────────

/** วันนี้กับเมื่อวานเรียกชื่อวัน ไกลกว่านั้นบอกวันที่ */
function dayLabel(iso: string, today: string) {
  const d = daysBetween(iso, today);
  if (d === 0) return "วันนี้";
  if (d === 1) return "เมื่อวาน";
  return thaiDate(iso);
}

function sizeOf(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * แชทโปรเจค — อยู่ในหน้าต่างแชทของ ChatWidget เสมอ (win) · ไม่มีแชทวางในหน้าแล้วตั้งแต่ 2 ต.ค. 2569
 * active = หน้าต่างเปิดอยู่ ใช้เลื่อนไปข้อความล่าสุดทุกครั้งที่เปิด
 */
function Chat({
  project,
  today,
  win = false,
  active = true,
  me = "PM",
}: {
  project: Project;
  today: string;
  win?: boolean;
  active?: boolean;
  /** ผู้ส่ง — "PM" (หน้าโปรเจค) หรือรหัสพนักงานของทีมงาน (หน้างานที่ได้รับ) */
  me?: string;
}) {
  const [draft, setDraft] = useState("");
  /* ไฟล์ที่เลือกไว้แต่ยังไม่ได้ส่ง เอาออกได้ก่อนกดส่ง */
  const [pick, setPick] = useState<{ n: string; sz: string }[]>([]);
  const [dropping, setDropping] = useState(false);
  /* ไฟล์แนบในแชทที่กดเปิดดู — เปิดแบบเดียวกับไฟล์ส่งงาน (ต้นแบบ data-file) */
  const [viewing, setViewing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /* ข้อความล่าสุดอยู่ล่างสุด — เปิดหน้าหรือส่งข้อความใหม่แล้วเลื่อนลงให้เห็นเสมอ */
  useEffect(() => {
    const el = listRef.current;
    if (el && active) el.scrollTop = el.scrollHeight;
  }, [project.chat.length, active]);

  function take(list: FileList | null) {
    if (!list) return;
    const add = Array.from(list).map((f) => ({ n: f.name, sz: sizeOf(f.size) }));
    setPick((p) => [...p, ...add]);
  }

  function send() {
    const text = draft.trim();
    if (!text && !pick.length) return;
    const now = bkkNow();
    postChat(project.pj, text, `${toIsoDate(now)} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`, pick, me);
    setDraft("");
    setPick([]);
  }

  /* จัดกลุ่ม — ขึ้นเส้นคั่นเมื่อข้ามวัน และคนเดิมส่งติดกันไม่ต้องขึ้นรูปกับชื่อซ้ำ */
  const rows: { m: ChatMessage; sep: string; head: boolean }[] = [];
  let lastDay = "";
  let lastWho = "";
  for (const m of project.chat) {
    const day = m.at.split(" ")[0];
    const sep = day !== lastDay ? dayLabel(day, today) : "";
    if (sep) {
      lastDay = day;
      lastWho = "";
    }
    rows.push({ m, sep, head: m.who !== me && m.who !== lastWho });
    lastWho = m.who;
  }

  return (
    <section className={win ? "pd-chat pd-chat-in-win" : "pd-blk pd-chat"}>
      {!win && <p className="mb-[11px] text-[13.5px] font-bold">แชทโปรเจค</p>}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDropping(false);
          take(e.dataTransfer.files);
        }}
        className={`pd-chat-box flex flex-col rounded-[14px] border bg-card p-3.5 ${
          dropping ? "border-primary ring-2 ring-primary/20" : "border-border"
        }`}
      >
        <div ref={listRef} className="pd-chat-msgs flex max-h-[360px] flex-col gap-1.5 overflow-y-auto">
          {rows.length === 0 && (
            <p className="w-full py-8 text-center text-[12.5px] text-muted-foreground">
              ยังไม่มีข้อความในโปรเจคนี้
            </p>
          )}
          {rows.map(({ m, sep, head }, i) => {
            const mine = m.who === me;
            const name = m.who === "PM" ? nameOf(project.pm) : (memberOf(m.who)?.name ?? nameOf(m.who));
            return (
              <div key={`${m.at}-${i}`} className="flex flex-col">
                {sep && (
                  <p className="my-2 flex items-center gap-2.5 text-[11px] text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                    {sep}
                  </p>
                )}
                <div className={`flex max-w-[78%] items-end gap-2 ${mine ? "self-end" : ""} ${head ? "mt-1.5" : ""}`}>
                  {!mine && (
                    <span
                      title={name}
                      className={`grid size-[26px] flex-none place-items-center rounded-full text-[10px] font-bold ${
                        head ? "bg-accent text-primary" : "invisible"
                      }`}
                    >
                      {initialOf(name)}
                    </span>
                  )}
                  <div className="flex min-w-0 flex-col">
                    {head && <b className="mb-0.5 text-[11px] font-semibold text-muted-foreground">{name}</b>}
                    <div className={`flex items-end gap-1.5 ${mine ? "flex-row-reverse" : ""}`}>
                      <div
                        className={`min-w-0 rounded-[12px] px-3 py-[8px] ${mine ? "bg-primary text-white" : "bg-muted"}`}
                      >
                        {m.tx && <p className="text-[12.5px] leading-[1.6] break-words">{m.tx}</p>}
                        {m.files?.map((f) => (
                          <button
                            key={f.n}
                            type="button"
                            title="เปิดดูไฟล์"
                            onClick={() => setViewing(f.n)}
                            className={`mt-1 flex w-full items-center gap-2 rounded-[9px] px-2 py-1.5 text-left text-[11.5px] hover:underline ${
                              mine ? "bg-white/15" : "bg-card"
                            }`}
                          >
                            <FileIcon className="size-3.5 flex-none" strokeWidth={2} />
                            <span className="min-w-0">
                              <b className="block truncate font-semibold">{f.n}</b>
                              {f.sz && <em className="text-[10.5px] not-italic opacity-75">{f.sz}</em>}
                            </span>
                          </button>
                        ))}
                      </div>
                      <span className="num flex-none text-[10px] text-muted-foreground">
                        {m.at.split(" ")[1]}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {pick.length > 0 && (
          <ul className="pd-chat-pick mt-3 flex flex-wrap gap-1.5">
            {pick.map((f, i) => (
              <li
                key={`${f.n}-${i}`}
                className="flex items-center gap-1.5 rounded-full bg-muted py-1 pr-1 pl-2.5 text-[11.5px]"
              >
                {f.n}
                <button
                  type="button"
                  aria-label={`เอา ${f.n} ออก`}
                  onClick={() => setPick((p) => p.filter((_, x) => x !== i))}
                  className="grid size-5 place-items-center rounded-full hover:bg-card"
                >
                  <CloseIcon className="size-3" strokeWidth={2.4} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          data-ro-hide
          className="pd-chat-send mt-[13px] flex gap-[9px] border-t border-border pt-[13px]"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <button
            type="button"
            aria-label="แนบไฟล์"
            title="แนบไฟล์ (ลากไฟล์มาวางในกล่องแชทได้)"
            onClick={() => fileRef.current?.click()}
            className="grid size-[38px] flex-none place-items-center rounded-[11px] border border-border hover:border-primary hover:text-primary"
          >
            <FileIcon className="size-4" strokeWidth={2} />
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            aria-label="เลือกไฟล์แนบในแชท"
            onChange={(e) => {
              take(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="พิมพ์ข้อความถึงทีมในโปรเจคนี้"
            aria-label={`ข้อความถึงทีมของ ${project.cus}`}
            autoComplete="off"
            className="field-control flex-1 rounded-[11px] text-[13px]"
            style={{ height: 38 }}
          />
          <button
            type="submit"
            className="btn solid btn-solid px-5 disabled:opacity-45"
            style={{ height: 38 }}
            disabled={!draft.trim() && !pick.length}
          >
            ส่ง
          </button>
        </form>
      </div>
      {viewing && <FileNotice name={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}

// ─── 4.1 แชทโปรเจค — ปุ่มลอย + หน้าต่างแชท (ต้นแบบ pd-chat · ทุกขนาดจอตั้งแต่ 2 ต.ค. 2569) ──────

const PHONE_MQ = "(max-width: 767.98px)";

/** จอมือถือหรือไม่ (ฝั่งเซิร์ฟเวอร์ถือว่าไม่ใช่ — แชทในหน้าถูกซ่อนด้วย CSS อยู่แล้วระหว่างรอ hydrate) */
export function useIsPhone() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(PHONE_MQ);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(PHONE_MQ).matches,
    () => false,
  );
}

/*
 * ใช้ Chat ตัวเดิม (ข้อความ แนบไฟล์ ส่ง) ในหน้าต่างลอยแบบแชทของเว็บทั่วไป
 * หน้าต่างวางค้างไว้ตลอดแล้วซ่อน ข้อความที่พิมพ์ค้างจึงไม่หายตอนปิด
 * มือถือเต็มจอและล็อกการเลื่อนหน้า · จอคอมเป็นกล่องลอย หน้าด้านหลังยังเลื่อนและกดได้
 */
export function ProjectChat({
  project,
  title,
  me = "PM",
  fab = true,
  open: openProp,
  onOpenChange,
}: {
  project: Project;
  /** หัวหน้าต่าง — ว่างใช้ "แชทโปรเจค" */
  title?: string;
  /** ผู้ส่ง — "PM" หรือรหัสพนักงาน */
  me?: string;
  /** มีปุ่มลอยหรือไม่ — หน้างานที่ได้รับเปิดจากปุ่มบนการ์ดงานแทน */
  fab?: boolean;
  /** คุมการเปิดจากภายนอก (ไม่ส่ง = หน้าต่างจัดการเอง) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const phone = useIsPhone();
  const today = todayIso();
  const [openSelf, setOpenSelf] = useState(false);
  const open = openProp ?? openSelf;
  const setOpen = (v: boolean | ((x: boolean) => boolean)) => {
    const next = typeof v === "function" ? v(open) : v;
    if (openProp === undefined) setOpenSelf(next);
    onOpenChange?.(next);
  };
  /* ตัวเลขบนปุ่ม = ข้อความของคนอื่นทั้งหมด (ตัวอย่างตามต้นแบบ) — ยังไม่มีสถานะอ่านแล้ว จึงไม่ใช่จำนวนที่ยังไม่อ่าน */
  const others = project.chat.filter((m) => m.who !== me).length;
  const members = projectMembers(project).length;

  /* ตัวปิดล่าสุดเก็บใน ref — effect ไม่ต้องผูกกับฟังก์ชันที่สร้างใหม่ทุกรอบ */
  const closeRef = useRef(() => setOpen(false));
  closeRef.current = () => setOpen(false);
  useEffect(() => {
    if (!open) return;
    const unlock = phone ? lockScroll() : () => {};
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      unlock();
      document.removeEventListener("keydown", onKey);
    };
  }, [open, phone]);

  return (
    <>
      {fab && (
      <button
        type="button"
        className="pd-chat-fab"
        aria-label={open ? "ปิดแชทโปรเจค" : "เปิดแชทโปรเจค"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        /* เปิดแชทแล้วซ่อนปุ่มลอย ปิดด้วยปุ่ม - ที่หัวแชท (ผู้ใช้สั่ง 9 ต.ค. 2569) */
        style={open && !phone ? { display: "none" } : undefined}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {open && !phone ? (
            <path d="M18 6 6 18M6 6l12 12" />
          ) : (
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" />
          )}
        </svg>
        {others > 0 && !open && <span className="n num">{others}</span>}
      </button>
      )}
      <div
        className={`pd-chat-win ${fab ? "" : "pd-chat-win-nofab"}`}
        data-open={open ? "" : undefined}
        role="dialog"
        aria-modal={phone}
        aria-label="แชทโปรเจค"
        aria-hidden={!open}
        inert={!open}
      >
        <div className="pd-chat-hd">
          {phone && (
            <button type="button" aria-label="กลับ" onClick={() => setOpen(false)}>
              <ChevronLeftIcon className="size-[22px]" strokeWidth={2.4} />
            </button>
          )}
          <span className="gav" aria-hidden="true">
            <UsersIcon className="size-5" strokeWidth={2} />
          </span>
          <b>
            <span>{title || "แชทโปรเจค"}</span>
            <small className="num">สมาชิก {members} คน</small>
          </b>
          {!phone && (
            <>
              <button type="button" aria-label="ย่อหน้าต่างแชท" title="ย่อ" onClick={() => setOpen(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 12h12" />
                </svg>
              </button>
              {/* ไม่มีปุ่มลอย (หน้างานที่ได้รับ) — มีกากบาทปิดด้วย แบบหน้าต่างแชท messenger */}
              {!fab && (
                <button type="button" aria-label="ปิดแชทโปรเจค" title="ปิด" onClick={() => setOpen(false)}>
                  <CloseIcon className="size-[18px]" strokeWidth={2.2} />
                </button>
              )}
            </>
          )}
        </div>
        {/* key = เลขโปรเจค — สลับไปโปรเจคอื่นแล้วข้อความที่พิมพ์ค้างไม่ติดข้ามไป */}
        <Chat key={project.pj} project={project} today={today} win active={open} me={me} />
      </div>
    </>
  );
}

