"use client";

/*
 * ฝั่ง PM ของ "ลูกค้าตรวจงานผ่านลิงก์" (ดู lib/client-review-store.ts)
 *
 *   ClientSendSheet     — ส่งงานที่ตรวจผ่านแล้วให้ลูกค้า: เลือกไฟล์ ข้อความ อายุลิงก์ → ได้ลิงก์ /review/<token>
 *   ClientRoundChip     — ป้ายบนการ์ดงาน: รอลูกค้าตรวจ / ลูกค้าคอมเมนต์ N จุด / ลูกค้าอนุมัติแล้ว
 *   ClientFeedbackSheet — ความเห็นจากลูกค้าทีละไฟล์ ติ๊กแก้แล้ว ส่งให้ทีมแก้ หรือปิดงาน
 *   ClientCommentList   — รายการคอมเมนต์แบบอ่านอย่างเดียว ใช้ทั้งกล่องของ PM และหน้างานของทีม (my-tasks)
 *
 * GM ดูอย่างเดียว — ปุ่มที่เปลี่ยนข้อมูลซ่อนตาม usePmReadOnly เหมือนกล่องอื่นของ PM
 */

import { useState } from "react";
import { thaiDate, thaiStamp } from "@/lib/format";
import { useCrm, customerOfDeal } from "@/lib/crm-store";
import { lastSub, projName, type Project, type ProjectTask } from "@/lib/pm-data";
import {
  DEFAULT_EXPIRY_DAYS,
  closeFromClient,
  commentWhere,
  createRound,
  findRound,
  forwardToTeam,
  latestRound,
  reviewKindOf,
  roundStatus,
  sizeText,
  toggleCommentDone,
  totalSize,
  useClientReviews,
  type NewReviewFile,
  type ReviewFileKind,
  type ReviewRound,
} from "@/lib/client-review-store";
import { Sheet } from "./lead-dialogs";
import { usePmReadOnly } from "./pm-readonly";
import { CheckIcon, FileIcon, LinkIcon } from "./icons";
import "@/styles/review.css";

/** ลิงก์เต็มของรอบ — ฝั่งเซิร์ฟเวอร์ไม่มี location ใช้ path อย่างเดียว */
export function reviewUrl(token: string) {
  const path = `/review/${token}`;
  return typeof window === "undefined" ? path : `${window.location.origin}${path}`;
}

/*
 * เปิดหน้าลูกค้าเป็นแท็บใหม่ — ใช้ window.open (ไม่ใส่ noopener) เพื่อให้แท็บใหม่ได้สำเนา sessionStorage
 * ไฟล์ที่ PM เพิ่งเลือกจากเครื่องจะได้เปิดดูในหน้าลูกค้าได้ (ดู liveUrl)
 */
export function openAsClient(token: string) {
  window.open(`/review/${token}`, "_blank");
}

// ─── ป้ายบนการ์ดงาน ───────────────────────────────────────────────

export function roundChip(r: ReviewRound): { text: string; cls: string } {
  const st = roundStatus(r);
  if (r.closedAt) return { text: `ลูกค้าอนุมัติแล้ว · ปิดงาน`, cls: "t-ok" };
  if (r.forwardedAt) return { text: `ส่งความเห็นลูกค้าให้ทีมแก้แล้ว`, cls: "t-miss" };
  if (st === "approved") return { text: "ลูกค้าอนุมัติแล้ว", cls: "t-ok" };
  if (st === "submitted") return { text: `ลูกค้าคอมเมนต์ ${r.comments.length} จุด`, cls: "t-late" };
  if (st === "expired") return { text: "ลิงก์ตรวจงานหมดอายุ", cls: "t-miss" };
  return { text: "รอลูกค้าตรวจ", cls: "t-leave" };
}

export function ClientRoundChip({ round, onOpen }: { round: ReviewRound; onOpen: () => void }) {
  const c = roundChip(round);
  return (
    <button
      type="button"
      onClick={onOpen}
      title="ดูความเห็นจากลูกค้า"
      className={`tag ${c.cls} mt-2 max-w-full cursor-pointer`}
    >
      <i />
      <span className="truncate">
        {c.text} · รอบที่ {round.round}
      </span>
    </button>
  );
}

// ─── ส่งให้ลูกค้าตรวจ ─────────────────────────────────────────────

type Pick = { key: string; name: string; kind: ReviewFileKind; size: string; from: string };

/** ไฟล์ที่ส่งให้ลูกค้าได้ — ไฟล์ของรอบที่ส่งล่าสุดก่อน แล้วตามด้วยไฟล์ของงาน (ชื่อซ้ำเอาอันแรก) */
function candidates(t: ProjectTask): Pick[] {
  const out: Pick[] = [];
  const seen = new Set<string>();
  for (const n of lastSub(t)?.files ?? []) {
    if (seen.has(n)) continue;
    seen.add(n);
    out.push({ key: `s:${n}`, name: n, kind: reviewKindOf(n), size: "—", from: "ส่งตรวจรอบล่าสุด" });
  }
  for (const f of t.files) {
    if (seen.has(f.n)) continue;
    seen.add(f.n);
    const kind: ReviewFileKind = f.k === "link" ? "link" : f.k === "image" ? "image" : reviewKindOf(f.n);
    out.push({ key: `f:${f.n}`, name: f.n, kind, size: f.sz === "ลิงก์" ? "—" : f.sz, from: "ไฟล์ของงาน" });
  }
  return out;
}

type Local = { id: string; name: string; kind: ReviewFileKind; bytes: number; blobUrl: string };

const KIND_LABEL: Record<ReviewFileKind, string> = { image: "รูปภาพ", video: "วิดีโอ", pdf: "เอกสาร", link: "ลิงก์" };

export function ClientSendSheet({
  project,
  task,
  onClose,
}: {
  project: Project;
  task: ProjectTask;
  onClose: () => void;
}) {
  const crm = useCrm();
  const list = candidates(task);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(list.map((x) => x.key)));
  const [locals, setLocals] = useState<Local[]>([]);
  const [message, setMessage] = useState("");
  const [days, setDays] = useState(DEFAULT_EXPIRY_DAYS);
  /* ผู้ติดต่อของดีล — งานที่รับผ่านกล่องงานเข้ามีในใบงาน ไม่มีก็ย้อนไปหาลูกค้าในฝ่ายขาย */
  const [contact, setContact] = useState(
    () => project.source?.contact || customerOfDeal(crm, project.deal ?? "", project.quo, project.cus)?.contact || "",
  );
  const [err, setErr] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const reviews = useClientReviews();
  const nextRound = (latestRound(reviews, project.pj, task.name)?.round ?? 0) + 1;

  function toggle(key: string) {
    setErr(false);
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  function addLocal(files: FileList | null) {
    if (!files) return;
    const add: Local[] = [...files].map((f) => ({
      id: `${f.name}-${f.size}-${f.lastModified}`,
      name: f.name,
      kind: f.type.startsWith("image/")
        ? "image"
        : f.type.startsWith("video/")
          ? "video"
          : reviewKindOf(f.name),
      bytes: f.size,
      blobUrl: URL.createObjectURL(f),
    }));
    setErr(false);
    setLocals((l) => [...l, ...add.filter((a) => !l.some((x) => x.id === a.id))]);
  }

  function create() {
    const files: NewReviewFile[] = [
      ...list
        .filter((x) => picked.has(x.key))
        .map((x) => ({ name: x.name, kind: x.kind, size: x.size })),
      ...locals.map((l) => ({ name: l.name, kind: l.kind, size: sizeText(l.bytes), local: true, blobUrl: l.blobUrl })),
    ];
    if (!files.length) return setErr(true);
    const tk = createRound({
      pj: project.pj,
      taskName: task.name,
      project: projName(project),
      createdBy: project.pm,
      message,
      contact,
      days,
      files,
    });
    setToken(tk);
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  if (token) {
    const url = reviewUrl(token);
    return (
      <Sheet
        title={`ส่งให้ลูกค้าตรวจ · รอบที่ ${nextRound - 1}`}
        onClose={onClose}
        footer={
          <>
            <button type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={onClose}>
              ปิด
            </button>
            <button
              type="button"
              className="btn solid btn-solid flex-1 justify-center sm:flex-none"
              onClick={() => openAsClient(token)}
            >
              เปิดดูแบบลูกค้า
            </button>
          </>
        }
      >
        <p className="flex items-center gap-2 text-[13.5px] font-semibold text-[var(--success)]">
          <CheckIcon className="size-4" /> สร้างลิงก์แล้ว · งานเปลี่ยนเป็น “รอลูกค้าตรวจ”
        </p>
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">
          ส่งลิงก์นี้ให้ {contact || "ลูกค้า"} ทางอีเมลหรือไลน์ · ลูกค้าเปิดได้โดยไม่ต้องล็อกอิน
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-[12px] border border-border bg-muted px-3 py-2.5">
          <code className="min-w-0 flex-1 truncate text-[12.5px]">{url}</code>
          <button type="button" className="btn glass-thin btn-mini flex-none" onClick={() => copy(url)}>
            {copied ? "คัดลอกแล้ว" : "คัดลอก"}
          </button>
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
          ระยะนี้ยังไม่มีระบบหลังบ้าน — ลิงก์เปิดได้เฉพาะในเบราว์เซอร์เครื่องนี้ และไฟล์ที่เลือกจากเครื่องเปิดดูได้จนกว่าจะปิดแท็บนี้
          การอัปโหลดไฟล์จริงและลิงก์ที่ส่งให้ลูกค้าภายนอกได้มากับระบบหลังบ้าน
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={`ส่งให้ลูกค้าตรวจ · รอบที่ ${nextRound}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn solid btn-solid flex-1 justify-center sm:flex-none" onClick={create}>
            สร้างลิงก์
          </button>
        </>
      }
    >
      <p className="text-[12.5px] text-muted-foreground">
        งาน <b className="font-semibold text-foreground">{task.name}</b> · {projName(project)}
      </p>

      <p className="mt-4 mb-1.5 text-[12.5px] font-semibold">ไฟล์ที่ให้ลูกค้าตรวจ</p>
      {list.length === 0 && locals.length === 0 && (
        <p className="text-[12.5px] text-muted-foreground">งานนี้ยังไม่มีไฟล์ · เลือกไฟล์จากเครื่องด้านล่าง</p>
      )}
      <ul className="flex flex-col gap-1.5">
        {list.map((x) => (
          <li key={x.key}>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-border px-3 py-2 hover:border-primary">
              <input
                type="checkbox"
                checked={picked.has(x.key)}
                onChange={() => toggle(x.key)}
                className="size-4 flex-none accent-[var(--primary)]"
              />
              <KindIcon kind={x.kind} />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[13px] font-semibold">{x.name}</b>
                <em className="block text-[11.5px] text-muted-foreground not-italic">
                  {KIND_LABEL[x.kind]} · {x.size} · {x.from}
                </em>
              </span>
            </label>
          </li>
        ))}
        {locals.map((l) => (
          <li
            key={l.id}
            className="flex items-center gap-2.5 rounded-[10px] border border-dashed border-border px-3 py-2"
          >
            <KindIcon kind={l.kind} />
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[13px] font-semibold">{l.name}</b>
              <em className="block text-[11.5px] text-muted-foreground not-italic">
                {KIND_LABEL[l.kind]} · {sizeText(l.bytes)} · จากเครื่องนี้
              </em>
            </span>
            <button
              type="button"
              className="btn glass-thin btn-mini"
              onClick={() => {
                URL.revokeObjectURL(l.blobUrl);
                setLocals((all) => all.filter((x) => x.id !== l.id));
              }}
            >
              เอาออก
            </button>
          </li>
        ))}
      </ul>
      <label className="btn glass-thin btn-mini mt-2 inline-flex cursor-pointer">
        + เลือกไฟล์จากเครื่อง
        <input
          type="file"
          multiple
          accept="image/*,video/*,application/pdf"
          className="sr-only"
          onChange={(e) => {
            addLocal(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <p className="mt-1.5 text-[11.5px] text-muted-foreground">
        รูป วิดีโอ หรือ PDF · ยังไม่ได้อัปโหลดจริง เปิดดูได้ระหว่างที่แท็บนี้ยังเปิดอยู่ (อัปโหลดจริงมากับระบบหลังบ้าน)
      </p>
      {err && <p className="mt-2 text-[12.5px] font-semibold text-destructive">เลือกอย่างน้อยหนึ่งไฟล์</p>}

      <label htmlFor="cr-contact" className="mt-4 mb-1.5 block text-[12.5px] font-semibold">
        ผู้ตรวจฝั่งลูกค้า
      </label>
      <input
        id="cr-contact"
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        placeholder="ชื่อผู้ติดต่อของลูกค้า"
        className="field-control"
      />

      <label htmlFor="cr-msg" className="mt-4 mb-1.5 block text-[12.5px] font-semibold">
        ข้อความถึงลูกค้า <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span>
      </label>
      <textarea
        id="cr-msg"
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="เช่น รบกวนดูสีและตัวอักษรหน้าแรก ติดตรงไหนคอมเมนต์ไว้ได้เลย"
        className="field-control h-auto resize-y py-2.5 leading-relaxed"
      />

      <label htmlFor="cr-days" className="mt-4 mb-1.5 block text-[12.5px] font-semibold">
        ลิงก์หมดอายุใน
      </label>
      <select
        id="cr-days"
        value={days}
        onChange={(e) => setDays(Number(e.target.value))}
        className="field-control cursor-pointer"
      >
        {[7, 14, 30, 60, 90].map((d) => (
          <option key={d} value={d}>
            {d} วัน
          </option>
        ))}
      </select>
    </Sheet>
  );
}

function KindIcon({ kind }: { kind: ReviewFileKind }) {
  const cls = "grid size-8 flex-none place-items-center rounded-[9px] bg-accent text-primary";
  if (kind === "link")
    return (
      <span className={cls}>
        <LinkIcon className="size-4" />
      </span>
    );
  if (kind === "video")
    return (
      <span className={cls} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
          <path d="M8 5.5v13l10.5-6.5z" />
        </svg>
      </span>
    );
  return (
    <span className={cls}>
      <FileIcon className="size-4" />
    </span>
  );
}

// ─── รายการคอมเมนต์ (อ่านอย่างเดียว / ติ๊กแก้แล้ว) ────────────────────

export function ClientCommentList({
  round,
  onToggle,
}: {
  round: ReviewRound;
  /** มี = PM ติ๊ก "แก้แล้ว" ได้ */
  onToggle?: (id: string) => void;
}) {
  const byFile = round.files
    .map((f) => ({
      f,
      list: round.comments
        .filter((c) => c.fileId === f.id)
        .sort((a, b) => (a.t ?? -1) - (b.t ?? -1) || (a.pin?.n ?? 0) - (b.pin?.n ?? 0)),
    }))
    .filter((x) => x.list.length > 0);

  if (byFile.length === 0) {
    return <p className="text-[12.5px] text-muted-foreground">ไม่มีคอมเมนต์</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {byFile.map(({ f, list }) => (
        <section key={f.id}>
          <h4 className="mb-1.5 flex items-center gap-2 text-[12.5px] font-bold">
            <span className="min-w-0 truncate">{f.name}</span>
            <span className="num flex-none rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {list.length} จุด
            </span>
          </h4>
          <ul className="flex flex-col gap-1.5">
            {list.map((c) => (
              <li key={c.id} className={`rvc-item ${c.done ? "is-done" : ""}`}>
                {c.frame ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.frame} alt="" className="rvc-frame" />
                ) : c.pin ? (
                  <span className="rvc-pin">{c.pin.n}</span>
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-[11.5px] text-muted-foreground">
                    <b className="num font-semibold text-primary">{commentWhere(c)}</b>
                    <b className="font-semibold text-foreground">{c.author || "ลูกค้า"}</b>
                    <span className="num">{thaiStamp(c.at)} น.</span>
                  </p>
                  <p className="mt-0.5 text-[13px] leading-relaxed break-words whitespace-pre-line">{c.text}</p>
                  {c.attach && (
                    <p className="mt-1 flex items-center gap-2 text-[11.5px] text-muted-foreground">
                      {c.attach.data && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.attach.data} alt="" className="size-10 rounded-md object-cover" />
                      )}
                      แนบ {c.attach.name}
                    </p>
                  )}
                </div>
                {onToggle ? (
                  <label className="flex flex-none cursor-pointer items-center gap-1.5 self-start text-[11.5px] font-semibold text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={Boolean(c.done)}
                      onChange={() => onToggle(c.id)}
                      className="size-4 accent-[var(--success)]"
                    />
                    แก้แล้ว
                  </label>
                ) : (
                  c.done && <span className="tag t-ok flex-none self-start">แก้แล้ว</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ─── ความเห็นจากลูกค้า ────────────────────────────────────────────

export function ClientFeedbackSheet({ token, onClose }: { token: string; onClose: () => void }) {
  const reviews = useClientReviews();
  const r = findRound(reviews, token);
  const ro = usePmReadOnly();
  const [copied, setCopied] = useState(false);

  if (!r) {
    return (
      <Sheet
        title="ความเห็นจากลูกค้า"
        onClose={onClose}
        footer={
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ปิด
          </button>
        }
      >
        <p className="text-[13px] text-muted-foreground">ไม่พบรอบตรวจงานนี้ในเครื่อง</p>
      </Sheet>
    );
  }

  const st = roundStatus(r);
  const chip = roundChip(r);
  const open = r.comments.filter((c) => !c.done).length;
  const canForward = !ro && st === "submitted" && !r.forwardedAt && !r.closedAt && open > 0;
  const canClose = !ro && st === "approved" && !r.closedAt && !r.forwardedAt;
  const url = reviewUrl(r.token);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Sheet
      title={`ความเห็นจากลูกค้า รอบที่ ${r.round}`}
      onClose={onClose}
      steady
      footer={
        <>
          <button type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={onClose}>
            ปิด
          </button>
          {canForward && (
            <button
              type="button"
              className="btn solid flex-1 justify-center !bg-destructive !text-white sm:flex-none"
              onClick={() => {
                forwardToTeam(r.token);
                onClose();
              }}
            >
              ส่งให้ทีมแก้ ({open} จุด)
            </button>
          )}
          {canClose && (
            <button
              type="button"
              className="btn solid flex-1 justify-center !bg-[var(--success)] !text-white sm:flex-none"
              onClick={() => {
                closeFromClient(r.token);
                onClose();
              }}
            >
              ปิดงาน
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`tag ${chip.cls}`}>
          <i />
          {chip.text}
        </span>
        <span className="text-[12px] text-muted-foreground">{r.taskName}</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
        <div>
          <dt className="text-[11.5px] text-muted-foreground">ส่งเมื่อ</dt>
          <dd className="num font-medium">{thaiStamp(r.createdAt)} น.</dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-muted-foreground">ผู้ตรวจ</dt>
          <dd className="font-medium">{r.contact || "—"}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-muted-foreground">ไฟล์</dt>
          <dd className="num font-medium">
            {r.files.length} ไฟล์ · {totalSize(r.files)} · อนุมัติ {r.files.filter((f) => f.approved).length}
          </dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-muted-foreground">
            {r.submittedAt ? "ลูกค้าตอบเมื่อ" : "ลิงก์หมดอายุ"}
          </dt>
          <dd className="num font-medium">
            {r.submittedAt ? `${thaiStamp(r.submittedAt)} น.` : thaiDate(r.expiresAt)}
          </dd>
        </div>
      </dl>

      {st === "open" && (
        <div className="mt-3 rounded-[12px] border border-border bg-muted px-3 py-2.5">
          <p className="text-[12px] text-muted-foreground">ลูกค้ายังไม่ได้ส่งความเห็น · ลิงก์ตรวจงาน</p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-[12.5px]">{url}</code>
            <button type="button" className="btn glass-thin btn-mini flex-none" onClick={copy}>
              {copied ? "คัดลอกแล้ว" : "คัดลอก"}
            </button>
            <button type="button" className="btn glass-thin btn-mini flex-none" onClick={() => openAsClient(r.token)}>
              เปิดดู
            </button>
          </div>
        </div>
      )}

      {r.message && (
        <p className="mt-3 rounded-[12px] bg-accent px-3 py-2 text-[12.5px] leading-relaxed">
          <b className="font-semibold">ข้อความถึงลูกค้า:</b> {r.message}
        </p>
      )}

      <h3 className="mt-4 mb-2 text-[13px] font-semibold">
        คอมเมนต์ {r.comments.length ? `${r.comments.length} จุด` : ""}
      </h3>
      <ClientCommentList round={r} onToggle={ro ? undefined : (id) => toggleCommentDone(r.token, id)} />

      {canForward && (
        <p className="mt-3 text-[11.5px] text-muted-foreground">
          “ส่งให้ทีมแก้” ส่งเฉพาะจุดที่ยังไม่ได้ติ๊กแก้แล้ว — ทีมเห็นในกล่อง “สิ่งที่ต้องแก้” ของงานนี้
        </p>
      )}
      {r.forwardedAt && (
        <p className="mt-3 text-[12px] text-muted-foreground">
          ส่งให้ทีมแก้เมื่อ {thaiStamp(r.forwardedAt)} น.
        </p>
      )}
      {r.closedAt && (
        <p className="mt-3 text-[12px] text-muted-foreground">ปิดงานเมื่อ {thaiStamp(r.closedAt)} น.</p>
      )}
    </Sheet>
  );
}
