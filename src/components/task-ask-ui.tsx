"use client";

/*
 * งานที่ทีมเสนอเอง (เจ้าของอนุมัติ 20 ต.ค. 2569) — หน้าจอทั้งสองฝั่ง
 *   ทีมงาน: ปุ่ม "+ เสนองาน" ในหน้างานที่ได้รับ → กล่องเสนองาน · การ์ดใบที่รอ PM / ไม่อนุมัติ
 *   PM: ส่วน "งานที่ทีมเสนอ" กับ "งานนอกโปรเจค" ในหน้างานเข้าใหม่ · กล่องอนุมัติ / ไม่อนุมัติ
 * กติกาและที่เก็บข้อมูลอยู่ที่ task-ask.ts กับ pm-store.ts
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { thaiDate, thaiStamp, todayIso } from "@/lib/format";
import { fileKind, projName, TASK_STATUS, type Project, type ProjectTask } from "@/lib/pm-data";
import { approveAsk, dismissAsk, proposeTask, rejectAsk, usePm } from "@/lib/pm-store";
import { ASK_FROM_LABEL, askWaiting, LOOSE_NAME, type AskFrom, type TaskAsk } from "@/lib/task-ask";
import { useNameOf } from "@/lib/emp-name";
import { FileDrop, fileSize, type PickedFile } from "./file-drop";
import { Field, Sheet } from "./lead-dialogs";
import { ThaiDatePicker } from "./thai-date-picker";
import { usePmReadOnly } from "./pm-readonly";
import { CalendarIcon, FileIcon, SendIcon } from "./icons";

/** ชื่อที่งานไปอยู่ — ชื่อโปรเจค หรือ "งานนอกโปรเจค" */
function homeName(projects: Project[], pj: string) {
  const p = pj ? projects.find((x) => x.pj === pj) : undefined;
  return p ? projName(p) : LOOSE_NAME;
}

function fromText(from: AskFrom, name: string) {
  return name.trim() ? `${ASK_FROM_LABEL[from]} · ${name.trim()}` : ASK_FROM_LABEL[from];
}

/** เฟสที่กำลังเดินอยู่วันนี้ — ไม่มีใช้เฟสล่าสุดที่เริ่มแล้ว สุดท้ายคือเฟสท้าย */
function currentPhase(p: Project | undefined, today: string) {
  if (!p || p.phases.length === 0) return 0;
  const now = p.phases.findIndex((ph) => ph.start <= today && today <= ph.end);
  if (now >= 0) return now;
  let last = -1;
  p.phases.forEach((ph, i) => {
    if (ph.start <= today) last = i;
  });
  return last >= 0 ? last : p.phases.length - 1;
}

// ═══ ฝั่งทีมงาน ═══════════════════════════════════════════════════

/** ปุ่มเปิดกล่องเสนองาน */
export function ProposeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn solid btn-solid flex-none max-md:h-[46px]! max-md:rounded-full! max-md:px-5!"
    >
      + เสนองาน
    </button>
  );
}

export function ProposeSheet({
  me,
  onClose,
  onSent,
}: {
  me: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const pm = usePm();
  const today = todayIso();
  /* เลือกได้เฉพาะโปรเจคที่ตัวเองมีงานอยู่ และยังเดินงานอยู่ */
  const mine = useMemo(
    () => pm.projects.filter((p) => p.status === "running" && p.tasks.some((t) => t.whos.includes(me))),
    [pm.projects, me],
  );
  const [pj, setPj] = useState("");
  const [name, setName] = useState("");
  const [from, setFrom] = useState<AskFrom>("client");
  const [fromName, setFromName] = useState("");
  const [brief, setBrief] = useState("");
  const [due, setDue] = useState("");
  const [pick, setPick] = useState(false);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const missName = !name.trim();
  const missDue = !due;

  function send() {
    setTouched(true);
    if (missName || missDue || busy) return;
    proposeTask({
      by: me,
      pj,
      name: name.trim(),
      from,
      fromName: fromName.trim(),
      brief: brief.trim(),
      due,
      files: files.map((f) => ({ n: f.name, k: fileKind(f.name), sz: fileSize(f.size), at: today, by: me })),
    });
    onSent();
  }

  return (
    <Sheet
      title="เสนองาน"
      onClose={onClose}
      steady
      footer={
        <>
          <button type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn solid btn-solid flex-1 justify-center sm:flex-none" onClick={send}>
            ส่งให้ PM อนุมัติ
          </button>
        </>
      }
    >
      <div className="m-mt-dlg flex flex-col gap-4">
        <Field label="โปรเจค" required>
          <select value={pj} onChange={(e) => setPj(e.target.value)} className="field-control cursor-pointer">
            <option value="">ไม่อยู่ในโปรเจค</option>
            {mine.map((p) => (
              <option key={p.pj} value={p.pj}>
                {projName(p)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="ชื่องาน" required error={touched && missName ? "กรอกชื่องาน" : undefined}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field-control"
            placeholder="เช่น ทำหน้าโปรโมชันใหม่"
          />
        </Field>

        <Field label="ใครขอมา">
          <div className="flex flex-col gap-2">
            <div className="seg" role="radiogroup" aria-label="ใครขอมา">
              {(Object.keys(ASK_FROM_LABEL) as AskFrom[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={from === k}
                  className={from === k ? "on" : ""}
                  onClick={() => setFrom(k)}
                >
                  {ASK_FROM_LABEL[k]}
                </button>
              ))}
            </div>
            <input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              className="field-control"
              aria-label="ชื่อคนที่ขอมา"
              placeholder={from === "client" ? "ชื่อลูกค้าที่ขอ" : "ชื่อคนที่ขอ"}
            />
          </div>
        </Field>

        <Field label="รายละเอียด">
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            className="field-control h-[86px] resize-y py-2.5 leading-relaxed"
            placeholder="งานนี้ต้องทำอะไรบ้าง"
          />
        </Field>

        <Field label="กำหนดส่ง" required error={touched && missDue ? "เลือกกำหนดส่ง" : undefined}>
          <ThaiDatePicker
            value={due}
            min={today}
            open={pick}
            label="กำหนดส่ง"
            invalid={touched && missDue}
            onToggle={() => setPick((v) => !v)}
            onPick={(iso) => {
              setDue(iso);
              setPick(false);
            }}
          />
        </Field>

        <Field label="แนบไฟล์" error={touched && busy ? "รอให้ไฟล์อัปโหลดเสร็จก่อนส่ง" : undefined}>
          <FileDrop files={files} onChange={setFiles} onBusy={setBusy} label="เลือกไฟล์แนบ" />
        </Field>
      </div>
    </Sheet>
  );
}

/** การ์ดใบที่เสนอไป — รอ PM อนุมัติ หรือ ไม่อนุมัติ (พร้อมเหตุผล ปิดได้) */
export function AskCard({ ask }: { ask: TaskAsk }) {
  const pm = usePm();
  const nameOf = useNameOf();
  const no = ask.no;
  return (
    <article className="glass-thin rounded-[16px] px-4 py-4 max-md:rounded-[20px] max-md:border-0 max-md:bg-white max-md:p-3.5 max-md:shadow-[0_1px_2px_rgba(40,20,25,.04)] sm:px-5">
      <div className="flex gap-3 sm:gap-4">
        <span
          className={`grid size-10 flex-none place-items-center rounded-full md:size-[58px] md:rounded-[14px] ${
            no ? "bg-[var(--destructive-soft)] text-destructive" : "bg-[var(--info-soft)] text-[var(--info)]"
          }`}
          aria-hidden="true"
        >
          <SendIcon className="size-5 md:size-[24px]" strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <span className="min-w-0">
              <p className="text-[12px] font-medium text-muted-foreground">{homeName(pm.projects, ask.pj)}</p>
              <h3 className="text-[15px] leading-[1.35] font-bold break-words">{ask.name}</h3>
            </span>
            <span className={`tag ${no ? "t-late" : "t-info"} flex-none`}>
              <i />
              {no ? "ไม่อนุมัติ" : "รอ PM อนุมัติ"}
            </span>
          </div>
          {ask.brief && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{ask.brief}</p>}

          {no && (
            <div className="mt-2 rounded-[13px] bg-[var(--destructive-soft)] px-3.5 py-2.5">
              <p className="text-[12.5px] font-bold text-destructive">เหตุผลจาก PM</p>
              <p className="mt-1 text-[13px] leading-relaxed break-words">{no.why}</p>
              <em className="num mt-1 block text-[11.5px] text-muted-foreground not-italic">
                {nameOf(no.by)} · {thaiStamp(no.at)} น.
              </em>
            </div>
          )}

          <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-muted-foreground">
            <span>ขอมาจาก {fromText(ask.from, ask.fromName)}</span>
            <span className="num">เสนอ {thaiStamp(ask.at)} น.</span>
            {ask.files.length > 0 && (
              <span className="num inline-flex items-center gap-1">
                <FileIcon className="size-[13px]" strokeWidth={2} />
                {ask.files.length} ไฟล์
              </span>
            )}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
            <p className="num flex items-center gap-[5px] text-[13px] font-semibold max-md:text-[12.5px]">
              <CalendarIcon className="size-3.5 flex-none text-muted-foreground" strokeWidth={2.2} />
              กำหนดส่ง {thaiDate(ask.due)}
            </p>
            {no && (
              <button type="button" className="btn glass-thin btn-mini" onClick={() => dismissAsk(ask.id)}>
                รับทราบ
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

// ═══ ฝั่ง PM ══════════════════════════════════════════════════════

/** ส่วนในหน้างานเข้าใหม่ — งานที่ทีมเสนอรออนุมัติ แล้วตามด้วยงานนอกโปรเจคที่อนุมัติไปแล้ว */
export function PmAskSections() {
  const pm = usePm();
  const nameOf = useNameOf();
  const ro = usePmReadOnly();
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);

  const waiting = (pm.asks ?? []).filter(askWaiting).sort((a, b) => a.at.localeCompare(b.at));
  /* งานที่ยังไม่เสร็จขึ้นก่อน เรียงตามกำหนดส่ง */
  const loose = [...(pm.loose ?? [])].sort(
    (a, b) => Number(a.status === "done") - Number(b.status === "done") || a.due.localeCompare(b.due),
  );
  const ask = (id: string | null) => (id ? pm.asks.find((a) => a.id === id) : undefined);
  const approve = ask(approving);
  const reject = ask(rejecting);

  return (
    <>
      <Panel title="งานที่ทีมเสนอ" count={waiting.length} unit="งาน">
        {waiting.length === 0 ? (
          <Empty>ไม่มีงานที่ทีมเสนอ</Empty>
        ) : (
          waiting.map((a) => (
            <li
              key={a.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-5 py-3.5 max-md:grid-cols-1 max-md:rounded-[20px] max-md:bg-white max-md:p-3.5 max-md:shadow-[0_1px_2px_rgba(40,20,25,.04)]"
            >
              <button
                type="button"
                className="min-w-0 cursor-pointer text-left"
                onClick={() => !ro && setApproving(a.id)}
              >
                <span className="block text-[12px] text-muted-foreground">
                  {nameOf(a.by)} เสนองาน · {homeName(pm.projects, a.pj)}
                </span>
                <b className="block text-[14px] font-bold break-words">{a.name}</b>
                <span className="num mt-0.5 block text-[12px] text-muted-foreground">
                  ขอมาจาก {fromText(a.from, a.fromName)} · กำหนดส่ง {thaiDate(a.due)} · เสนอ {thaiDate(a.at.slice(0, 10))}
                </span>
              </button>
              {!ro && (
                <span className="flex items-center gap-2 justify-self-end max-md:w-full">
                  <button
                    type="button"
                    className="btn glass-thin btn-mini text-destructive max-md:h-10! max-md:flex-1 max-md:justify-center"
                    onClick={() => setRejecting(a.id)}
                  >
                    ไม่อนุมัติ
                  </button>
                  <button
                    type="button"
                    className="btn solid btn-solid btn-mini max-md:h-10! max-md:flex-1 max-md:justify-center"
                    onClick={() => setApproving(a.id)}
                  >
                    อนุมัติ
                  </button>
                </span>
              )}
            </li>
          ))
        )}
      </Panel>

      <Panel title={LOOSE_NAME} count={loose.filter((t) => t.status !== "done").length} unit="งานค้าง">
        {loose.length === 0 ? (
          <Empty>ยังไม่มีงานนอกโปรเจค</Empty>
        ) : (
          loose.map((t) => <LooseRow key={`${t.whos[0]}-${t.name}`} t={t} owner={nameOf(t.whos[0])} />)
        )}
      </Panel>

      {approve && <ApproveSheet key={approve.id} ask={approve} onClose={() => setApproving(null)} />}
      {reject && <RejectSheet key={reject.id} ask={reject} onClose={() => setRejecting(null)} />}
    </>
  );
}

function Panel({
  title,
  count,
  unit,
  children,
}: {
  title: string;
  count: number;
  unit: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel glass flex min-w-0 flex-col max-md:!overflow-visible max-md:!rounded-none max-md:!border-0 max-md:!bg-transparent max-md:!shadow-none">
      <div className="strip max-md:!border-0 max-md:!bg-transparent max-md:!px-0">
        <h2 className="py-2.5 text-[14.5px] font-bold">
          {title}
          {count > 0 && <span className="num ml-1.5 text-muted-foreground">{count} {unit}</span>}
        </h2>
      </div>
      <ul className="flex flex-col divide-y divide-border max-md:gap-2.5 max-md:divide-y-0">{children}</ul>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <li className="py-9 text-center text-[13px] text-muted-foreground max-md:rounded-[20px] max-md:bg-white">
      {children}
    </li>
  );
}

function LooseRow({ t, owner }: { t: ProjectTask; owner: string }) {
  const st = TASK_STATUS[t.status];
  const today = todayIso();
  const late = t.status !== "done" && t.status !== "sent" && t.due < today;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-5 py-3.5 max-md:rounded-[20px] max-md:bg-white max-md:p-3.5 max-md:shadow-[0_1px_2px_rgba(40,20,25,.04)]">
      <span className="min-w-0">
        <span className="block text-[12px] text-muted-foreground">{owner}</span>
        <b className="block text-[14px] font-bold break-words">{t.name}</b>
        <span className={`num mt-0.5 block text-[12px] ${late ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
          {t.status === "done" && t.doneAt ? `ตรวจผ่าน ${thaiDate(t.doneAt.slice(0, 10))}` : `กำหนดส่ง ${thaiDate(t.due)}`}
          {t.origin ? ` · ขอมาจาก ${fromText(t.origin.from, t.origin.fromName)}` : ""}
        </span>
      </span>
      <span className="flex items-center gap-2 justify-self-end">
        <span className={`tag ${st.cls}`}>
          <i />
          {st.label}
        </span>
        {t.status === "sent" && (
          <Link href="/pm/reviews" className="btn glass-thin btn-mini">
            ตรวจงาน
          </Link>
        )}
      </span>
    </li>
  );
}

function ApproveSheet({ ask, onClose }: { ask: TaskAsk; onClose: () => void }) {
  const pm = usePm();
  const nameOf = useNameOf();
  const today = todayIso();
  const running = pm.projects.filter((p) => p.status === "running");
  const [pj, setPj] = useState(() => (running.some((p) => p.pj === ask.pj) ? ask.pj : ""));
  const project = running.find((p) => p.pj === pj);
  const [phase, setPhase] = useState(() => currentPhase(project, today));
  const [due, setDue] = useState(() => (ask.due < today ? today : ask.due));
  const [pick, setPick] = useState(false);

  return (
    <Sheet
      title="อนุมัติงานที่เสนอ"
      onClose={onClose}
      steady
      footer={
        <>
          <button type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid flex-1 justify-center !bg-[var(--success)] !text-white sm:flex-none"
            onClick={() => {
              if (!due) return;
              approveAsk(ask.id, { pj, phase, due });
              onClose();
            }}
          >
            อนุมัติ
          </button>
        </>
      }
    >
      <div className="m-mt-dlg">
        <p className="text-[12.5px] text-muted-foreground">{nameOf(ask.by)} เสนองาน</p>
        <h3 className="mt-0.5 text-[15px] font-bold break-words">{ask.name}</h3>
        {ask.brief && <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{ask.brief}</p>}
        <dl className="mt-4 grid gap-x-4 gap-y-2 sm:grid-cols-2">
          <Kv k="ขอมาจาก" v={fromText(ask.from, ask.fromName)} />
          <Kv k="เสนอเมื่อ" v={`${thaiStamp(ask.at)} น.`} />
          <Kv k="ผู้รับงาน" v={nameOf(ask.by)} />
          <Kv k="กำหนดส่งที่เสนอ" v={thaiDate(ask.due)} />
        </dl>
        {ask.files.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1.5">
            {ask.files.map((f) => (
              <li key={f.n} className="flex items-center gap-2 text-[13px]">
                <FileIcon className="size-[15px] flex-none text-muted-foreground" strokeWidth={2} />
                <span className="min-w-0 flex-1 truncate">{f.n}</span>
                <em className="num text-[11.5px] text-muted-foreground not-italic">{f.sz}</em>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex flex-col gap-4 border-t border-border pt-4">
          <Field label="โปรเจค">
            <select
              value={pj}
              onChange={(e) => {
                setPj(e.target.value);
                setPhase(currentPhase(running.find((p) => p.pj === e.target.value), today));
              }}
              className="field-control cursor-pointer"
            >
              <option value="">ไม่อยู่ในโปรเจค</option>
              {running.map((p) => (
                <option key={p.pj} value={p.pj}>
                  {projName(p)}
                </option>
              ))}
            </select>
          </Field>
          {project && project.phases.length > 0 && (
            <Field label="เฟส">
              <select
                value={phase}
                onChange={(e) => setPhase(Number(e.target.value))}
                className="field-control cursor-pointer"
              >
                {project.phases.map((ph, i) => (
                  <option key={`${ph.name}-${i}`} value={i}>
                    {ph.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="กำหนดส่ง" required>
            <ThaiDatePicker
              value={due}
              min={today}
              open={pick}
              label="กำหนดส่ง"
              onToggle={() => setPick((v) => !v)}
              onPick={(iso) => {
                setDue(iso);
                setPick(false);
              }}
            />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}

function RejectSheet({ ask, onClose }: { ask: TaskAsk; onClose: () => void }) {
  const nameOf = useNameOf();
  const [why, setWhy] = useState("");
  const [touched, setTouched] = useState(false);
  return (
    <Sheet
      title="ไม่อนุมัติงานที่เสนอ"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn flex-1 justify-center !bg-destructive !text-white sm:flex-none"
            onClick={() => {
              setTouched(true);
              if (!why.trim()) return;
              rejectAsk(ask.id, why.trim());
              onClose();
            }}
          >
            ไม่อนุมัติ
          </button>
        </>
      }
    >
      <div className="m-mt-dlg">
        <p className="text-[12.5px] text-muted-foreground">{nameOf(ask.by)} เสนองาน</p>
        <h3 className="mt-0.5 mb-4 text-[15px] font-bold break-words">{ask.name}</h3>
        <Field label="เหตุผล" required error={touched && !why.trim() ? "กรอกเหตุผล" : undefined}>
          <textarea
            value={why}
            onChange={(e) => {
              setWhy(e.target.value);
              if (touched) setTouched(false);
            }}
            className="field-control h-[86px] resize-y py-2.5 leading-relaxed"
          />
        </Field>
      </div>
    </Sheet>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[11.5px] text-muted-foreground">{k}</dt>
      <dd className="mt-[3px] text-[13.5px] font-medium break-words">{v}</dd>
    </div>
  );
}
