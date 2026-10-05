"use client";

/*
 * กล่องรายละเอียดนัดหมายแบบดูอย่างเดียว — ใช้กับใบที่ "คนเปิดไม่ได้เป็นคนสร้าง"
 * (ปฏิทินของ SA/BD · ทีมงาน · GM ที่เปิดนัดของ PM) ตามกติกา 24 ก.ย. 2569 ที่เจ้าของสั่งไว้
 *
 * สร้างนัดหมายได้เฉพาะ PM กับ GM เท่านั้น และคนที่สร้างได้ก็แก้กับยกเลิกได้
 * แต่เฉพาะใบของตัวเอง — GM เปิดใบของ PM จึงมาที่กล่องนี้ ไม่มีช่องกรอกและไม่มีปุ่มบันทึก
 * คนอื่นเห็นได้แค่ว่าใครนัด เมื่อไร ที่ไหน มีใครร่วมบ้าง และใบนี้ถูกเลื่อนหรือยกเลิกไปแล้วหรือยัง
 * ถ้าอยากนัดต้องขอให้ PM หรือ GM เป็นคนตั้งนัดให้
 */

import { useCrm } from "@/lib/crm-store";
import { thaiDate } from "@/lib/format";
import { useHr } from "@/lib/hr-store";
import { usePm } from "@/lib/pm-store";
import { isRef } from "@/lib/pm-data";
import { endOf, eventKind, lastEdit, type PmEvent } from "@/lib/pm-schedule-data";
import { Sheet } from "./lead-dialogs";

const DW_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

const longDate = (iso: string) => `วัน${DW_FULL[new Date(`${iso}T00:00:00`).getDay()]} ${thaiDate(iso)}`;

/** ตัวคั่นบรรทัด — แยกเป็นค่าคงที่ เพราะสตริงขึ้นบรรทัดใหม่ใน JSX อ่านยาก */
const NEWLINE = String.fromCharCode(10);

/** ช่วงวันในประวัติการแก้เก็บเป็น "เริ่ม~สิ้นสุด" — แปลงกลับเป็นวันไทยให้คนอ่าน */
const spanText = (v: string) => v.split("~").map(thaiDate).join(" – ");

/** ช่วงเวลาในประวัติการแก้เก็บเป็น "HH:mm-HH:mm" */
const timeText = (v: string) => `${v.replace("-", " – ")} น.`;

export function AppointmentSheet({
  event,
  note,
  onClose,
  className,
}: {
  event: PmEvent;
  /** บันทึกที่ผู้สร้างพิมพ์ไว้ — ไม่มีก็ไม่ต้องขึ้นหัวข้อ */
  note?: string;
  onClose: () => void;
  /** คลาสเพิ่มที่ตัวกล่อง — หน้าที่เรียกใช้แต่งเฉพาะหน้าได้ */
  className?: string;
}) {
  const kind = eventKind(event.kind);
  /* ชื่อผู้เข้าร่วมอ่านจากทะเบียนฝ่ายบุคคล — ครอบคลุมคนที่ไม่ได้อยู่ในทีมผลิตงาน เช่น PM และ GM */
  const emp = useHr().emp;
  const project = usePm().projects.find((p) => isRef(p, event.pj));
  const end = endOf(event);
  const customers = useCrm().customers;
  /* นัดของฝ่ายขายเก็บรหัสผู้สนใจ — หาจากทะเบียนพนักงานไม่เจอก็หาจากรายชื่อผู้สนใจ */
  const nameOf = (id: string) =>
    emp.find((e) => e.id === id)?.name ?? customers.find((c) => c.code === id)?.name ?? id;
  /* บอกการแก้ครั้งล่าสุดครั้งเดียว — คนอ่านอยากรู้ว่า "ตกลงตอนนี้เป็นยังไง" ไม่ได้อยากอ่านประวัติทั้งเส้น */
  const edit = event.cancel ? undefined : lastEdit(event);
  const editLines = edit
    ? [
        edit.date && `เลื่อนวันจาก ${spanText(edit.date.before)} เป็น ${spanText(edit.date.after)}`,
        edit.time && `เปลี่ยนเวลาจาก ${timeText(edit.time.before)} เป็น ${timeText(edit.time.after)}`,
        edit.added.length > 0 && `เพิ่มผู้เข้าร่วม ${edit.added.map(nameOf).join(" · ")}`,
        edit.removed.length > 0 && `ถอดออก ${edit.removed.map(nameOf).join(" · ")}`,
        `${edit.by} · ${edit.at}`,
      ].filter((x): x is string => Boolean(x))
    : [];

  return (
    <Sheet title={event.title} onClose={onClose} footer={null} className={className}>
      <span
        className="inline-flex items-center gap-1.5 rounded-[20px] px-[11px] py-1 text-[12px] font-bold"
        style={{ color: kind.dot, background: `color-mix(in srgb, ${kind.dot} 12%, transparent)` }}
      >
        <i aria-hidden="true" className="size-[7px] rounded-full" style={{ background: kind.dot }} />
        {kind.label}
      </span>

      <dl className="mt-4 flex flex-col gap-3.5">
        <Kv k="วันที่" v={end > event.date ? `${thaiDate(event.date)} – ${thaiDate(end)}` : longDate(event.date)} />
        <Kv k="เวลา" v={event.from ? `${event.from} – ${event.to} น.` : "ทั้งวัน"} />
        <Kv k="สถานที่หรือลิงก์" v={event.place || "ไม่ระบุสถานที่"} />
        {project && <Kv k="โปรเจค" v={project.name || project.cus} />}
        <Kv
          k="ผู้เข้าร่วม"
          v={event.who.map(nameOf).join("\n") || "ไม่ระบุ"}
        />
        <Kv k="ผู้ตั้งนัด" v={event.by === "gm" ? "ผู้จัดการทั่วไป" : "ผู้จัดการโครงการ"} />
        {note?.trim() && <Kv k="บันทึก" v={note} />}
        {editLines.length > 0 && <Kv k="แก้ล่าสุด" v={editLines.join(NEWLINE)} />}
        {event.cancel && (
          <Kv k="ยกเลิกแล้ว" v={`${event.cancel.by} · ${event.cancel.at}${event.cancel.why ? `\n${event.cancel.why}` : ""}`} />
        )}
      </dl>
    </Sheet>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[11.5px] text-muted-foreground">{k}</dt>
      {/* ผู้เข้าร่วมหลายคนขึ้นบรรทัดละคน อ่านง่ายกว่าเรียงต่อกันด้วยจุด */}
      <dd className="mt-[3px] text-[14px] leading-relaxed font-medium whitespace-pre-line">{v}</dd>
    </div>
  );
}
