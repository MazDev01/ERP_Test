"use client";

/*
 * ปฏิทินของผู้จัดการทั่วไป (GM) — ใช้ปฏิทินชุดเดียวกับทุกบทบาท (schedule-board.tsx)
 *
 * เจ้าของสั่ง 24 ก.ย. 2569 ว่าหน้าตารางงานต้องหน้าตาเหมือนกันทุกอัน
 * ต่างกันแค่ว่าในปฏิทินมีอะไร และหน้านี้เพิ่มนัดได้ (กดที่ช่องวันหรือปุ่มบนหัวเรื่อง)
 *
 * เป็นปฏิทินของทั้งบริษัท
 *   กำหนดส่งมอบโปรเจค (แดง)  — โปรเจคที่กำลังทำ กดแล้วเปิดหน้าโปรเจคใบนั้น (ดูอย่างเดียวตาม pm-readonly)
 *   ลา อนุมัติแล้ว (เขียว)    — วันลาของทุกคน
 *   ลา รออนุมัติ (ส้ม)       — ใบที่ยังไม่ตัดสิน · ใบที่ GM เป็นผู้อนุมัติกดไปหน้ารายการรออนุมัติได้
 *   นัดหมาย (ม่วง)          — พร้อมรายชื่อผู้เข้าร่วม
 *
 * GM สร้างนัดหมายได้ (ปุ่ม + เพิ่มนัดหมาย บนแถบหัวปฏิทิน)
 * เจ้าของสั่งไว้ว่า **สร้างนัดได้เฉพาะ PM กับ GM** เพราะสองคนนี้เป็นคนจัดคิวงานและจัดคนอยู่แล้ว
 * ถ้าใครก็ใส่นัดในปฏิทินคนอื่นได้ ปฏิทินจะเต็มไปด้วยนัดที่อีกฝ่ายไม่เคยตกลงและไม่มีใครรับผิดชอบ
 * จึงต้องเลือกผู้เข้าร่วมอย่างน้อยหนึ่งคนเสมอ — นัดที่ไม่มีใครเข้าร่วมไม่ใช่นัด
 *
 * **ใครสร้างได้ต้องแก้และยกเลิกได้** (เจ้าของสั่ง 24 ก.ย. 2569)
 * นัดที่พิมพ์ผิดแล้วแก้ไม่ได้จะค้างอยู่ในปฏิทินของทุกคนตลอดไป
 * แต่ GM แก้ได้เฉพาะ **นัดที่ตัวเองสร้าง** (by === "gm") เท่านั้น
 * นัดของ PM เปิดได้แค่ดู เหมือนที่ PM ก็แก้นัดของ GM ไม่ได้ — เจ้าของใบเป็นคนรับผิดชอบใบนั้น
 * ยกเลิกต้องมีเหตุผลทุกครั้ง และใบไม่หาย ยังขึ้นเป็นแบบขีดฆ่าในปฏิทินของผู้เข้าร่วม
 */

import { useMemo, useState } from "react";
import { useHr } from "@/lib/hr-store";
import { useTeamLeave } from "@/lib/gm-data";
import { USERS } from "@/lib/mock-data";
import {
  KIND_COLOR,
  eventKinds,
  endOf,
  type EventKind,
  type PmEvent,
} from "@/lib/pm-schedule-data";
import { addEvent, cancelEvent, editEvent, useSchedule } from "@/lib/pm-schedule-store";
import { usePm } from "@/lib/pm-store";
import { projectHref } from "@/lib/pm-data";
import { AppointmentSheet } from "./appointment-sheet";
import { PlusIcon } from "./icons";
import { Sheet } from "./lead-dialogs";
import {
  ScheduleBoard,
  tintPaint,
  useBoardNav,
  type BoardEvent,
  type BoardKind,
} from "./schedule-board";
import { ThaiDatePicker } from "./thai-date-picker";
import { Field, Input, Select } from "./ui";
import { todayIso } from "@/lib/format";

const KINDS: BoardKind[] = [
  { key: "due", label: "กำหนดส่งมอบโปรเจค", color: "#D0021B" },
  { key: "leave", label: "ลา (อนุมัติแล้ว)", color: "#14875A" },
  { key: "wait", label: "ลา (รออนุมัติ)", color: "#B4630B" },
  { key: "meet", label: "นัดหมาย", color: "#6A2CA0" },
];

const COLOR = Object.fromEntries(KINDS.map((k) => [k.key, k.color])) as Record<string, string>;
const paintOf = (kind: string) => ({ dot: COLOR[kind], paint: tintPaint(COLOR[kind]) });

const eventKindList = () => eventKinds();

/*
 * เหตุผลตอนยกเลิกเป็นของบังคับ (เจ้าของสั่ง 24 ก.ย. 2569)
 * คนที่กันเวลาไว้แล้วได้รับแจ้งว่า "ยกเลิก" เฉย ๆ ก็ต้องเดินมาถามอยู่ดี
 */
const CANCEL_WARN = "กรอกเหตุผลที่ยกเลิกก่อน — ผู้เข้าร่วมจะเห็นข้อความนี้ในแจ้งเตือน";

export function GmCalendarPage() {
  const pm = usePm();
  const leaves = useTeamLeave();
  const sc = useSchedule();
  const hr = useHr();
  const nav = useBoardNav();
  /* ว่างอยู่ = ปิด · ไม่มี event = เพิ่มใบใหม่ของวันนั้น · มี event = แก้ใบที่ GM สร้างเอง */
  const [editing, setEditing] = useState<{ day: string; event?: PmEvent } | null>(null);
  /* นัดของ PM และใบที่ยกเลิกแล้ว เปิดได้แค่ดู จึงเก็บคนละตัวกับกล่องแก้ไข */
  const [open, setOpen] = useState<PmEvent | null>(null);

  /** กดที่นัดหนึ่งใบ — ใบที่ GM สร้างเองและยังไม่ถูกยกเลิกเปิดแก้ไข นอกนั้นเปิดดูอย่างเดียว */
  function openEvent(e: PmEvent) {
    if (e.by === "gm" && !e.cancel) setEditing({ day: e.date, event: e });
    else setOpen(e);
  }

  const events = useMemo(() => {
    /* ข้อมูลของแถบ — มีเฉพาะนัดหมายที่กดแล้วเปิดใบได้ นอกนั้นเป็นลิงก์ไปหน้าของจริง */
    const out: BoardEvent<PmEvent | null>[] = [];
    const nameOf = (id: string) => hr.emp.find((e) => e.id === id)?.name ?? id;

    for (const l of leaves)
      out.push({
        id: l.key,
        kind: l.pending ? "wait" : "leave",
        start: l.from,
        end: l.to > l.from ? l.to : l.from,
        title: `${l.name} · ${l.type}`,
        sub: l.pending ? "รออนุมัติ" : "อนุมัติแล้ว",
        /* ใบที่ GM เป็นผู้อนุมัติ กดแล้วไปที่ใบนั้นในหน้ารายการรออนุมัติ */
        href: l.pending && l.mine && l.id ? `/approvals?kind=leave&find=${encodeURIComponent(l.id)}` : undefined,
        ...paintOf(l.pending ? "wait" : "leave"),
        data: null,
      });

    for (const p of pm.projects) {
      if (p.status !== "running" || !p.due) continue;
      const name = p.name || p.cus;
      out.push({
        id: `due-${p.pj}`,
        kind: "due",
        start: p.due,
        end: p.due,
        title: `ส่งมอบ · ${name}`,
        bar: `ส่งมอบ ${name}`,
        sub: `${p.cus} · PM ${p.pm}`,
        href: projectHref(p.pj),
        ...paintOf("due"),
        data: null,
      });
    }

    /* นัดหมายทั้งบริษัท พร้อมรายชื่อผู้เข้าร่วมในบรรทัดรอง
       ใบที่ยกเลิกแล้วยังขึ้นแบบขีดฆ่า เพราะคนที่กันเวลาไว้ต้องเห็นว่าเกิดอะไรขึ้น ไม่ใช่หายเงียบ */
    for (const e of sc.events)
      out.push({
        id: `ev-${e.id}`,
        kind: "meet",
        start: e.date,
        end: endOf(e),
        title: e.title,
        time: e.from || undefined,
        timeEnd: e.to || undefined,
        sub: [e.place, e.who.map(nameOf).join(" · ")].filter(Boolean).join(" · "),
        cancelled: Boolean(e.cancel),
        cancelWhy: e.cancel?.why,
        ...paintOf("meet"),
        data: e,
      });

    return out;
  }, [leaves, pm.projects, sc.events, hr.emp]);

  return (
    <div className="space-y-4">
      <div className="bar">
        <div>
          <h1>ตารางงาน</h1>
          <p>ปฏิทินของทั้งบริษัท · วันลาทุกคน กำหนดส่งมอบโปรเจค และนัดหมาย</p>
        </div>
        <div className="tools">
          {/* มือถือใช้ปุ่ม "+ เพิ่มนัดหมาย" ในการ์ดนัดของวันที่เลือก (schedule-board) จึงซ่อนปุ่มนี้
              ซ่อนที่ตัวครอบ ไม่ใช่ที่ปุ่ม เพราะ .btn ใน globals.css ตั้ง display ไว้นอก @layer */}
          <span className="max-sm:hidden">
            <button type="button" className="btn solid btn-solid" onClick={() => setEditing({ day: nav.sel })}>
              <PlusIcon className="size-3.5" strokeWidth={2.4} />
              เพิ่มนัดหมาย
            </button>
          </span>
        </div>
      </div>

      <ScheduleBoard
        nav={nav}
        events={events}
        kinds={KINDS}
        hint="วันลาและกำหนดส่งมอบมาจากใบจริงของแต่ละฝ่าย · กดที่ช่องวันเพื่อเพิ่มนัดของวันนั้น · แก้หรือยกเลิกได้เฉพาะนัดที่คุณตั้งเอง"
        onOpen={(e) => e.data && openEvent(e.data)}
        onAdd={(day) => setEditing({ day })}
      />

      {editing && (
        <GmEventForm
          day={editing.day}
          event={editing.event}
          note={editing.event ? (sc.notes[editing.event.id] ?? "") : ""}
          onClose={() => setEditing(null)}
        />
      )}
      {open && (
        <AppointmentSheet event={open} note={sc.notes[open.id] ?? open.todo.join("\n")} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

// ─── กล่องเพิ่ม / แก้ / ยกเลิกนัดหมายของ GM ────────────────────────

/*
 * ช่องกรอกตามโครงหน้า: หัวข้อ · ประเภท · วันที่ · เวลาเริ่ม–สิ้นสุด · สถานที่หรือลิงก์ · ผู้เข้าร่วม
 * ไม่มีนัดข้ามวันและไม่มีการผูกโปรเจคแบบของ PM เพราะ GM ตั้งนัดคนเป็นหลัก ไม่ได้จัดคิวงาน
 * ผู้เข้าร่วมติกจากพนักงานที่ยังทำงานอยู่ และต้องเลือกอย่างน้อยหนึ่งคน
 *
 * กล่องเดียวกันใช้ทั้งเพิ่มและแก้ (ส่ง event เข้ามา = แก้ใบนั้น) เหมือนฝั่ง PM
 * เพราะช่องกรอกเป็นชุดเดียวกันเป๊ะ แยกเป็นสองกล่องจะกลายเป็นสองที่ที่ต้องแก้ตามกันตลอด
 * ใบที่เปิดแก้ได้มีแต่ใบที่ GM สร้างเอง — หน้าหลักกันไว้ตั้งแต่ตอนกดแล้ว
 */
function GmEventForm({
  day,
  event,
  note,
  onClose,
}: {
  /** วันที่ตั้งต้นของใบใหม่ — วันที่เลือกอยู่ในปฏิทิน ไม่ใช่วันนี้เสมอไป */
  day: string;
  event?: PmEvent;
  /* บันทึกเดิมของใบนั้น — กล่องนี้ไม่มีช่องบันทึก แต่ต้องส่งคืนไปด้วยตอนแก้ ไม่งั้นโน้ตหาย */
  note: string;
  onClose: () => void;
}) {
  /* คนที่พ้นสภาพแล้วไม่ขึ้นให้เลือก — ไม่มีประโยชน์ที่จะเชิญเข้าประชุม */
  const staff = useHr().emp.filter((e) => e.status === "active");
  const [title, setTitle] = useState(event?.title ?? "");
  const [kind, setKind] = useState<EventKind>(event?.kind ?? "meeting");
  const [date, setDate] = useState(event?.date ?? day ?? todayIso());
  const [from, setFrom] = useState(event?.from ?? "10:00");
  const [to, setTo] = useState(event?.to ?? "11:00");
  const [place, setPlace] = useState(
    event && event.place !== "ยังไม่ระบุสถานที่" ? event.place : "",
  );
  const [who, setWho] = useState<string[]>(event?.who ?? []);
  const [pick, setPick] = useState(false);
  const [err, setErr] = useState("");
  /* กดปุ่มยกเลิกนัดครั้งแรกเปิดกล่องยืนยัน ครั้งที่สองจึงยกเลิกจริง (เหมือนฝั่ง PM) */
  const [confirmDel, setConfirmDel] = useState(false);
  const [why, setWhy] = useState("");

  function save() {
    /* บอกให้ตรงช่องที่ยังไม่ผ่าน (เจ้าของสั่ง 25 ก.ย. 2569) ไม่ใช่ข้อความรวมที่ต้องไล่หาเอง */
    const missing = [
      !title.trim() && "หัวข้อ",
      !date && "วันที่",
      !from && "เวลาเริ่ม",
      !to && "เวลาสิ้นสุด",
    ].filter(Boolean) as string[];
    if (missing.length) return setErr(`ยังไม่ได้กรอก${missing.join(" · ")}`);
    if (to <= from) return setErr("เวลาเริ่มต้องไม่หลังเวลาสิ้นสุด");
    /* นัดที่ไม่มีผู้เข้าร่วมไม่ใช่นัด — และผู้เข้าร่วมคือคนที่จะได้รับแจ้งเตือน */
    if (who.length === 0) return setErr("เลือกผู้เข้าร่วมอย่างน้อย 1 คน");
    const draft = {
      title: title.trim(),
      kind,
      date,
      dateEnd: date,
      from,
      to,
      place: place.trim(),
      pj: event?.pj ?? "",
      who,
      note,
      col: event?.col ?? KIND_COLOR[kind],
      by: "gm" as const,
    };
    /* แก้แล้วบันทึกว่าใครแก้ ไว้ให้แจ้งเตือนบอกผู้เข้าร่วมว่าวันเวลาหรือรายชื่อเปลี่ยนไปอย่างไร */
    if (event) editEvent(event.id, draft, USERS.gm.name);
    else addEvent(draft);
    onClose();
  }

  function cancelIt() {
    if (!confirmDel) {
      setConfirmDel(true);
      return;
    }
    /* เหตุผลเป็นของบังคับ — ข้อความแจ้งเตือนที่ผู้เข้าร่วมได้รับคือเหตุผลบรรทัดนี้ */
    if (!why.trim()) return setErr(CANCEL_WARN);
    if (event) cancelEvent(event.id, USERS.gm.name, why);
    onClose();
  }

  return (
    <Sheet
      title={event ? "แก้นัดหมาย" : "เพิ่มนัดหมาย"}
      onClose={onClose}
      footer={
        <>
          {/* ยกเลิกแล้วใบไม่หาย ยังขึ้นแบบขีดฆ่าในปฏิทินของผู้เข้าร่วม (ยูสเคส PM-06 BR-03) */}
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
          ยกเลิกแล้วใบจะยังอยู่ในปฏิทินของผู้เข้าร่วมแบบขีดฆ่า ไม่หายไป · ทุกคนจะได้รับแจ้งพร้อมเหตุผล
          <Input
            className="mt-2 bg-white"
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
        <Field label="หัวข้อ">
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setErr("");
            }}
            placeholder="เช่น ประชุมสรุปงานประจำเดือน"
          />
        </Field>

        <Field label="ประเภท">
          <Select value={kind} onChange={(e) => setKind(e.target.value as EventKind)}>
            {eventKindList().map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>

        {/* จอแคบให้วันที่กินเต็มแถวบน แล้วเวลาเริ่ม–ถึงอยู่แถวล่าง
            สามช่องเรียงกันที่ 390px ทำให้ช่องเวลาแคบจนอ่านค่าไม่ครบ */}
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
            <Input type="time" step={900} value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="ถึง">
            <Input type="time" step={900} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>

        <Field label="สถานที่หรือลิงก์">
          <Input
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="เช่น ห้องประชุมชั้น 3 หรือ ออนไลน์"
          />
        </Field>

        <Field label="ผู้เข้าร่วม" hint="เลือกอย่างน้อย 1 คน — ทุกคนที่เลือกจะเห็นนัดนี้ในตารางงานของตัวเอง">
          {/* สองคอลัมน์ตามโครงหน้า · จอแคบเหลือคอลัมน์เดียว รายชื่อจะได้ไม่ถูกตัด */}
          <span className="grid max-h-[210px] grid-cols-1 gap-x-3 overflow-y-auto sm:grid-cols-2">
            {staff.map((m) => {
              const on = who.includes(m.id);
              return (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-center gap-2 py-[5px] text-[12.5px] font-medium"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setWho((v) => {
                        setErr("");
                        return on ? v.filter((x) => x !== m.id) : [...v, m.id];
                      })
                    }
                    className="size-[15px] flex-none accent-[var(--primary)]"
                  />
                  <span className="min-w-0 truncate">{m.name}</span>
                </label>
              );
            })}
          </span>
        </Field>

        {/* คำเตือนเรื่องเหตุผลที่ยกเลิกขึ้นในกล่องยืนยันด้านบนแล้ว ไม่ต้องขึ้นซ้ำท้ายฟอร์ม */}
        {err && err !== CANCEL_WARN && (
          <p
            role="alert"
            className="rounded-[11px] bg-[var(--destructive-soft)] px-3 py-2.5 text-xs leading-[1.55] font-semibold text-destructive"
          >
            {err}
          </p>
        )}

        <p className="text-[11.5px] leading-[1.7] text-muted-foreground">
          ผู้ตั้งนัด {USERS.gm.name} · ผู้เข้าร่วมทุกคนจะได้รับแจ้งเตือนและเห็นนัดนี้ในปฏิทินของตัวเอง
          {event ? " · เปลี่ยนวัน เวลา หรือรายชื่อ ทุกคนที่เกี่ยวข้องจะได้รับแจ้ง รวมถึงคนที่ถูกถอดออก" : ""}
        </p>
      </div>
    </Sheet>
  );
}
