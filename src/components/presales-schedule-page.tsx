"use client";

/*
 * ตารางงานของทีมก่อนการขาย (SA/BD) — ใช้ปฏิทินชุดเดียวกับทุกบทบาท (schedule-board.tsx)
 *
 * เจ้าของสั่ง 24 ก.ย. 2569 ว่าหน้าตารางงานต้องหน้าตาเหมือนกันทุกอัน
 * ต่างกันแค่ว่าในปฏิทินมีอะไร และใครเพิ่มนัดได้
 *
 * รวมทุกอย่างที่มีวันที่ของคนนี้ไว้ในปฏิทินเดียว
 *   กำหนดส่งข้อเสนอ (แดง)  — คำขอที่ยังไม่ส่ง ตามวันส่งงาน
 *   ส่งข้อเสนอแล้ว (เขียว)  — วันที่ส่งข้อเสนอแต่ละรอบ
 *   งานในโปรเจค (น้ำเงิน)  — งานย่อยที่ PM มอบหมายให้เรา ตามวันกำหนดส่ง
 *   วันลา (ส้ม)           — ใบลาของเรา ทั้งที่อนุมัติแล้วและรออนุมัติ
 *   นัดหมายที่ถูกเชิญ (ม่วง) — นัดที่ PM หรือ GM ใส่ชื่อเราไว้
 *
 * ตั้งนัดของตัวเองได้ตั้งแต่ 25 ก.ย. 2569 (เจ้าของตัดสิน) แต่ต้องผูกกับคำขอก่อนการขายที่ตัวเองรับผิดชอบ
 * เพราะงานของ SA/BD เกิดก่อนมีดีลและยังไม่มี PM ให้ลงนัดให้ — นัดสำรวจหน้างานหรือนำเสนอข้อเสนอ
 * จึงไม่มีใครลงให้ · ที่ยังห้ามคือนัดอิสระที่ไม่ผูกกับงาน ซึ่งก็คือปฏิทินส่วนตัวที่ตัดทิ้งไปแล้ว
 * นัดกลุ่มนี้ไม่ขึ้นในปฏิทินของ PM เพราะยังไม่ใช่งานของโปรเจค
 *
 * ลิงก์พาไปหน้างานก่อนการขายและใบลาของตัวเองเท่านั้น — งานในโปรเจคเป็นหน้าของทีมงาน จึงแสดงเฉย ๆ
 */

import { useMemo, useState } from "react";
import { type PresalesRequest } from "@/lib/crm-data";
import { useCrm } from "@/lib/crm-store";
import { parseIsoDate, TH_MONTHS_SHORT } from "@/lib/format";
import { useLeaveRecords } from "@/lib/leave-store";
import { fmtLeaveHours, leaveHoursOf } from "@/lib/leave-data";
import { USERS } from "@/lib/mock-data";
import {
  invitedEvents,
  isPsEvent,
  type EventColor,
  type EventKind,
  type PmEvent,
} from "@/lib/pm-schedule-data";
import { addEvent, cancelEvent, editEvent, useSchedule } from "@/lib/pm-schedule-store";
import { usePm, useTeam } from "@/lib/pm-store";
import { PS_ME as ME, psMine as mine, psWorkLink } from "@/lib/presales-work";
import { AppointmentSheet } from "./appointment-sheet";
import { Sheet } from "./lead-dialogs";
import { ThaiDatePicker } from "./thai-date-picker";
import { Field, Input, Select } from "./ui";
import { Time24Input, UI_TIME_CLS } from "./time24-input"; // ช่องเวลา 24 ชม. แทน input[type=time] (ผู้ใช้สั่ง 13 ต.ค. 2569)
import {
  ColorPick,
  ScheduleBoard,
  colPaint,
  tintPaint,
  useBoardNav,
  type BoardEvent,
  type BoardKind,
} from "./schedule-board";

type Kind = "due" | "sent" | "task" | "leave" | "meet" | "mine";

const KINDS: BoardKind[] = [
  { key: "due", label: "กำหนดส่งข้อเสนอ", color: "#D0021B" },
  { key: "sent", label: "ส่งข้อเสนอแล้ว", color: "#14875A" },
  { key: "task", label: "งานในโปรเจค", color: "#1F6FD0" },
  { key: "leave", label: "วันลา", color: "#B4630B" },
  { key: "meet", label: "นัดหมายที่ถูกเชิญ", color: "#6A2CA0" },
  { key: "mine", label: "นัดที่ฉันตั้งเอง", color: "#0F6E75" },
];

/* เหตุผลตอนยกเลิกเป็นของบังคับ — ข้อความนี้คือสิ่งที่ผู้เข้าร่วมได้รับในแจ้งเตือน */
const CANCEL_WARN = "กรอกเหตุผลที่ยกเลิกก่อน";

const COLOR = Object.fromEntries(KINDS.map((k) => [k.key, k.color])) as Record<string, string>;
const paintOf = (kind: string) => ({ dot: COLOR[kind], paint: tintPaint(COLOR[kind]) });

const shortDate = (day: string) => {
  const d = parseIsoDate(day);
  return `${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]}`;
};

export function PresalesSchedulePage() {
  const crm = useCrm();
  const pm = usePm();
  const leave = useLeaveRecords();
  const sc = useSchedule();
  const nav = useBoardNav();
  /* นัดที่เปิดดูรายละเอียดอยู่ — นัดของคนอื่นดูอย่างเดียว แก้ไม่ได้ */
  const [open, setOpen] = useState<PmEvent | null>(null);
  /* ฟอร์มตั้งนัดของตัวเอง — เปิดจากปุ่มเพิ่ม หรือกดที่นัดที่ตัวเองตั้งไว้ */
  const [form, setForm] = useState<{ day: string; event?: PmEvent } | null>(null);
  const nameOfCus = (code: string) => crm.customers.find((c) => c.code === code)?.name ?? "—";
  /* คำขอที่ยังทำอยู่ของเรา — นัดต้องผูกกับใบใดใบหนึ่งในนี้ */
  const myRequests = crm.presales.filter((r) => mine(r) && r.status !== "ปิดคำขอ");

  /* รวมเหตุการณ์ทั้งหมดของคนนี้ เป็นรายการบนปฏิทิน */
  const events = useMemo(() => {
    /* ข้อมูลของแถบ — มีเฉพาะนัดหมายที่กดแล้วเปิดกล่องรายละเอียดได้ นอกนั้นเป็นลิงก์ */
    const out: BoardEvent<PmEvent | null>[] = [];
    const add = (k: Kind, id: string, start: string, end: string, title: string, sub: string, href?: string) => {
      if (!start) return;
      out.push({
        id,
        kind: k,
        start,
        end: end > start ? end : start,
        title,
        sub: sub || undefined,
        href,
        ...paintOf(k),
        data: null,
      });
    };
    const nameOf = new Map(crm.customers.map((c) => [c.code, c.name]));
    for (const r of crm.presales.filter(mine)) {
      const cus = nameOf.get(r.customerCode) ?? "—";
      if (r.status === "รอรับงาน" || r.status === "กำลังทำ" || r.status === "รอข้อมูลเพิ่ม")
        add("due", `due-${r.no}`, r.due, r.due, `กำหนดส่งข้อเสนอ · ${cus}`, r.problem, psWorkLink(r.no));
      for (const x of crm.presalesRounds.filter((x) => x.requestNo === r.no))
        add("sent", `sent-${r.no}-${x.round}`, x.at, x.at, `ส่งข้อเสนอรอบที่ ${x.round} · ${cus}`, x.note, psWorkLink(r.no));
    }
    for (const p of pm.projects) {
      p.tasks.forEach((t, ti) => {
        if (!t.whos.includes(ME.employeeId) || !t.due) return;
        const done = t.status === "done";
        add(
          "task",
          `task-${p.pj}-${ti}`,
          t.due,
          t.due,
          `${done ? "ส่งแล้ว · " : "กำหนดส่งงาน · "}${t.name}`,
          `${p.name || p.cus}${t.start ? ` · เริ่ม ${shortDate(t.start)}` : ""}`,
        );
      });
    }
    /* ใบลาของเรา — ใบที่ไม่อนุมัติหรือยกเลิกแล้ว ไม่ใช่วันลาจริง · กดแล้วเปิดใบนั้นในหน้าการลา */
    for (const l of leave) {
      if (l.status === "ไม่อนุมัติ" || l.status === "ยกเลิก") continue;
      const state = l.status === "อนุมัติแล้ว" ? "อนุมัติแล้ว" : "รออนุมัติ";
      add("leave", `leave-${l.id}`, l.date, l.toDate || l.date, `${l.type} · ${fmtLeaveHours(leaveHoursOf(l))}` /* จำนวนลาเป็นชั่วโมง (ผู้ใช้สั่ง 19 ต.ค. 2569) */, state, `/leave?find=${encodeURIComponent(l.id)}`);
    }
    /* นัดที่เราตั้งเอง กับนัดที่ PM/GM เชิญเรา — กดแล้วเปิดกล่องในหน้านี้ ไม่มีที่ให้ไปต่อ */
    for (const e of invitedEvents(sc.events, ME.employeeId))
      out.push({
        id: `ev-${e.id}`,
        kind: isPsEvent(e) ? "mine" : "meet",
        start: e.date,
        end: e.dateEnd && e.dateEnd > e.date ? e.dateEnd : e.date,
        title: e.title,
        time: e.from || undefined,
        timeEnd: e.to || undefined,
        sub: e.place || undefined,
        /* นัดที่ถูกยกเลิกยังอยู่ในรายการแบบขีดฆ่า ไม่หายเงียบ (เจ้าของสั่ง 24 ก.ย. 2569) */
        cancelled: Boolean(e.cancel),
        cancelWhy: e.cancel?.why,
        /* สีที่เลือกเองมาก่อนสีของกลุ่ม เฉพาะนัดที่ตั้งเอง — นัดที่ถูกเชิญคงสีม่วงเดิม (ผู้ใช้สั่ง 9 ต.ค. 2569) */
        ...(isPsEvent(e) && e.col ? colPaint(e.col) : paintOf(isPsEvent(e) ? "mine" : "meet")),
        data: e,
      });
    return out;
  }, [crm.customers, crm.presales, crm.presalesRounds, pm.projects, leave, sc.events]);

  return (
    <div className="space-y-4">
      {/* หน้าตาเดียวกับตารางงาน PM — ไม่มีหัวข้อหน้า ดับเบิลคลิกช่องวันเพื่อเพิ่มนัด (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
      {/* ชื่อหน้ามุมซ้ายบน — แถบบนจอคอมเป็นเส้นทางแล้ว (ผู้ใช้สั่ง 12 ต.ค. 2569) */}
      <h1 className="page-h1">ตารางงาน</h1>

      <ScheduleBoard
        nav={nav}
        events={events}
        kinds={KINDS}
        /* ไม่โชว์คำอธิบายการทำงานของระบบ (ผู้ใช้สั่ง 5 ต.ค. 2569) */
        hint=""
        onAdd={(day) => setForm({ day })}
        onOpen={(e) => {
          if (!e.data) return;
          /* นัดที่เราตั้งเองและยังไม่ถูกยกเลิก เปิดเพื่อแก้ได้ · นอกนั้นดูอย่างเดียว */
          if (isPsEvent(e.data) && !e.data.cancel) setForm({ day: e.data.date, event: e.data });
          else setOpen(e.data);
        }}
        noKinds
      />

      {open && (
        <AppointmentSheet event={open} note={sc.notes[open.id] ?? open.todo.join("\n")} onClose={() => setOpen(null)} />
      )}

      {form && (
        <PsEventForm
          key={form.event?.id ?? form.day}
          day={form.day}
          event={form.event}
          requests={myRequests}
          customerName={nameOfCus}
          note={form.event ? (sc.notes[form.event.id] ?? form.event.todo.join("\n")) : ""}
          onClose={() => setForm(null)}
          onSaved={(date) => {
            nav.jumpTo(date);
            setForm(null);
          }}
        />
      )}
    </div>
  );
}

/*
 * ตั้งนัดของทีมก่อนการขาย (เจ้าของตัดสิน 25 ก.ย. 2569)
 *
 * SA/BD ทำงานช่วงก่อนมีดีล ยังไม่มี PM ให้ลงนัดให้ นัดสำรวจหน้างานหรือนัดนำเสนอข้อเสนอ
 * จึงต้องลงเองได้ แต่ต้องผูกกับคำขอก่อนการขายที่ตัวเองรับผิดชอบเสมอ
 * ไม่ใช่นัดอิสระ — ปฏิทินส่วนตัวเป็นสิ่งที่ตัดทิ้งไปแล้ว ไม่เอากลับมาทางอ้อม
 *
 * ใครเห็นบ้าง: ตัวเอง · คนที่ถูกเชิญ · GM (ปฏิทินรวมของบริษัท)
 * ไม่ขึ้นในปฏิทินของ PM เพราะยังไม่ใช่งานของ PM — เชิญ PM ไม่ได้ด้วยเหตุผลเดียวกัน
 */
function PsEventForm({
  day,
  event,
  requests,
  customerName,
  note,
  onClose,
  onSaved,
}: {
  day: string;
  event?: PmEvent;
  requests: PresalesRequest[];
  customerName: (code: string) => string;
  note: string;
  onClose: () => void;
  onSaved: (date: string) => void;
}) {
  /* เชิญได้เฉพาะคนที่ยังอยู่ และไม่ใช่ PM (นัดกลุ่มนี้ไม่ขึ้นในปฏิทินของ PM) */
  const team = useTeam().filter(
    (m) => !m.left && m.id !== USERS.pm.employeeId && m.id !== ME.employeeId,
  );
  const [ps, setPs] = useState(event?.ps ?? requests[0]?.no ?? "");
  const [title, setTitle] = useState(event?.title ?? "");
  /* ประเภทไม่ให้เลือกแล้ว เก็บค่าเดิมไว้ข้างใน (ผู้ใช้สั่ง 9 ต.ค. 2569) */
  const kind: EventKind = event?.kind ?? "client";
  /* ใบใหม่ตั้งต้นสีเขียวน้ำทะเล ตรงกับสีนัดที่ตั้งเองที่เห็นในปฏิทินนี้อยู่แล้ว */
  const [col, setCol] = useState<EventColor>(event?.col ?? "teal");
  const [date, setDate] = useState(event?.date ?? day);
  const [from, setFrom] = useState(event?.from ?? "10:00");
  const [to, setTo] = useState(event?.to ?? "11:00");
  const [place, setPlace] = useState(
    event && event.place !== "ยังไม่ระบุสถานที่" ? event.place : "",
  );
  const [who, setWho] = useState<string[]>(
    event?.who.filter((x) => x !== ME.employeeId) ?? [],
  );
  const [detail, setDetail] = useState(note);
  const [pick, setPick] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [why, setWhy] = useState("");

  function save() {
    /* บอกให้ตรงช่องที่ยังไม่ผ่าน ไม่ใช่ข้อความรวมที่ต้องไล่หาเอง */
    const missing = [
      !ps && "คำขอก่อนการขาย",
      !title.trim() && "หัวข้อ",
      !date && "วันที่",
    ].filter(Boolean) as string[];
    if (missing.length) return setErr(`ยังไม่ได้กรอก${missing.join(" · ")}`);
    if (to <= from) return setErr("เวลาเริ่มต้องไม่หลังเวลาสิ้นสุด");
    const draft = {
      title: title.trim(),
      kind,
      date,
      dateEnd: date,
      from,
      to,
      place: place.trim(),
      pj: "",
      /* ตัวเองอยู่ในนัดเสมอ — เป็นคนตั้งและเป็นคนไป */
      who: [ME.employeeId, ...who],
      note: detail,
      col,
      by: "ps" as const,
      ps,
    };
    if (event) editEvent(event.id, draft, ME.full);
    else addEvent(draft);
    onSaved(date);
  }

  function cancelIt() {
    if (!confirmDel) return setConfirmDel(true);
    if (!why.trim()) return setErr(CANCEL_WARN);
    if (event) cancelEvent(event.id, ME.full, why);
    onClose();
  }

  return (
    <Sheet
      title={event ? "แก้นัดหมาย" : "เพิ่มนัดหมาย"}
      onClose={onClose}
      footer={
        <>
          {event && (
            <button
              type="button"
              className="btn glass-thin mr-auto border-destructive text-destructive"
              onClick={cancelIt}
            >
              {confirmDel ? "กดอีกครั้งเพื่อยกเลิกนัด" : "ยกเลิกนัดหมาย"}
            </button>
          )}
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ปิด
          </button>
          <button type="button" className="btn solid btn-solid" onClick={save}>
            บันทึก
          </button>
        </>
      }
    >
      {confirmDel && (
        <p
          role="alert"
          className="mb-3.5 rounded-[11px] bg-[var(--destructive-soft)] px-3 py-2.5 text-xs leading-[1.6] font-semibold text-destructive"
        >
          <Input
            className="bg-white"
            value={why}
            aria-label="เหตุผลที่ยกเลิก"
            onChange={(e) => {
              setWhy(e.target.value);
              setErr("");
            }}
            placeholder="เหตุผลที่ยกเลิก (ต้องกรอก)"
          />
          {err === CANCEL_WARN && <span className="mt-1.5 block">{CANCEL_WARN}</span>}
        </p>
      )}

      <div className="space-y-3.5" onClick={() => setPick(false)}>
        {requests.length === 0 ? (
          <p className="rounded-[11px] bg-[var(--warning-soft)] px-3.5 py-3 text-[12.5px] leading-relaxed font-semibold text-[var(--warning)]">
            ยังไม่มีคำขอก่อนการขายที่คุณรับผิดชอบอยู่
          </p>
        ) : (
          <Field label="คำขอก่อนการขาย">
            <Select
              value={ps}
              onChange={(e) => {
                setPs(e.target.value);
                setErr("");
              }}
            >
              {requests.map((r) => (
                <option key={r.no} value={r.no}>
                  {customerName(r.customerCode)} · {r.problem.length > 40 ? `${r.problem.slice(0, 40)}…` : r.problem}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="หัวข้อ">
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setErr("");
            }}
            placeholder="เช่น สำรวจหน้างาน หรือ นำเสนอข้อเสนอ"
          />
        </Field>

        {/* ไม่มีช่องประเภท — สีของนัดแยกนัดแทน เหมือนตารางงาน PM (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
        <ColorPick value={col} onChange={setCol} />

        <div className="grid grid-cols-2 items-end gap-2.5 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <Field label="วันที่" className="col-span-2 sm:col-span-1">
            <ThaiDatePicker
              value={date}
              open={pick}
              label="วันที่นัด"
              onToggle={() => setPick((p) => !p)}
              onPick={(iso) => {
                setDate(iso);
                setPick(false);
                setErr("");
              }}
            />
          </Field>
          <Field label="เวลาเริ่ม">
            <Time24Input step={900} className={UI_TIME_CLS} value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="ถึง">
            <Time24Input step={900} className={UI_TIME_CLS} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>

        <Field label="สถานที่หรือลิงก์">
          <Input
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="เช่น หน้างานลูกค้า หรือ ออนไลน์"
          />
        </Field>

        <Field
          label="ชวนใครไปด้วย"
        >
          <span className="grid max-h-[180px] grid-cols-1 gap-x-3 overflow-y-auto sm:grid-cols-2">
            {team.map((m) => {
              const on = who.includes(m.id);
              return (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-center gap-2 py-[5px] text-[12.5px] font-medium"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setWho((v) => (on ? v.filter((x) => x !== m.id) : [...v, m.id]))}
                    className="size-[15px] flex-none accent-[var(--primary)]"
                  />
                  <span className="min-w-0 truncate">{m.name}</span>
                </label>
              );
            })}
          </span>
        </Field>

        <Field label="รายละเอียด" hint="สิ่งที่ต้องเตรียมไปด้วย">
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
            className="input w-full resize-y py-2"
            placeholder="เช่น เอาแบบร่างข้อเสนอไปด้วย"
          />
        </Field>

        {err && err !== CANCEL_WARN && (
          <p
            role="alert"
            className="rounded-[11px] bg-[var(--destructive-soft)] px-3 py-2.5 text-xs leading-[1.55] font-semibold text-destructive"
          >
            {err}
          </p>
        )}

      </div>
    </Sheet>
  );
}
