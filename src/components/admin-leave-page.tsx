"use client";

/*
 * ประเภทการลา — สิทธิ์วันลาต่อปีของรอบปีปัจจุบัน (leave-data.ts อ่านผ่าน entitlements() / leaveTypes())
 *
 * ผู้ดูแลระบบเพิ่มประเภทใหม่ได้ (ผู้ใช้สั่ง 18 ก.ย. 2569) — กดปุ่ม "เพิ่มประเภทการลา" เปิดกล่อง
 * ชื่อ + จำนวนวันต่อปี + คำอธิบายสั้น · ประเภทที่เพิ่มเองกดดินสอแก้ได้ทุกช่อง
 * เปลี่ยนชื่อแล้วใบลาที่ยื่นไปแล้วยังเก็บชื่อเดิม (กล่องเตือนให้เห็นก่อนบันทึก)
 * ประเภทตั้งต้นของระบบลบไม่ได้ · ประเภทที่เพิ่มเองลบได้ ใบลาเก่ายังเก็บชื่อเดิมไว้
 * ตั้ง 0 วัน = ไม่มีสิทธิ์ลาประเภทนี้ (ยังเห็นในรายการ แต่ยื่นแล้วจะเตือนว่าเกินสิทธิ์)
 * ฝ่ายบุคคลสรุปประเภทที่เพิ่มเองเป็นกลุ่ม "ลากิจ" (LEAVE_GROUP ใน hr-link.ts)
 *
 * รอบปีขึ้นใหม่เองทุก 1 ม.ค. · ลาพักร้อนที่เหลือยกไปปีถัดไปได้ตามเพดานที่ตั้งที่นี่
 * (ผู้ใช้สั่ง 22 ก.ย. 2569) ค่าเก็บใน rates.vacationCarryMax — 0 = ไม่ยกยอด หมดสิ้นปี
 */

import { useState } from "react";
import { LEAVE_TYPES, currentPeriod, isBuiltinLeave, leaveLabel, leaveNote } from "@/lib/leave-data";
import type { LeaveQuota, RateSettings } from "@/lib/system-settings";
import { thaiDate } from "@/lib/format";
import { AdminHead, Card, Input2, SaveBar, Switch, inputCls, useSectionDraft } from "./admin-ui";
import { useAllLeave } from "@/lib/leave-store";
import { PencilIcon, PlusIcon, TrashIcon } from "./icons";
import { Sheet } from "./lead-dialogs";

/** รายการครบทุกประเภท — ประเภทตั้งต้นที่หายไปจากค่าที่บันทึกไว้เติมให้เป็น 0 วัน */
function withBuiltins(list: LeaveQuota[]): LeaveQuota[] {
  const have = new Set(list.map((q) => q.type));
  return [...list, ...LEAVE_TYPES.filter((t) => !have.has(t)).map((t) => ({ type: t, days: 0 }))];
}

function describe(a: LeaveQuota[], b: LeaveQuota[]) {
  const out: string[] = [];
  for (const q of b) {
    const was = a.find((x) => x.type === q.type);
    if (!was) out.push(`เพิ่มประเภท ${q.type} ${q.days} วัน`);
    else if (was.days !== q.days) out.push(`${q.type} ${was.days} → ${q.days} วัน`);
  }
  for (const q of a) if (!b.some((x) => x.type === q.type)) out.push(`ลบประเภท ${q.type}`);
  return out;
}

/* ตัวเลือกเพดานยกยอด — เลือกจากรายการ หรือ "กำหนดเอง" แล้วพิมพ์จำนวนวัน */
const CARRY_CHOICES = [0, 3, 5, 10];

const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
/* ไม่ให้เลือก 29–31 — บางเดือนไม่มีวันนั้น รอบปีจะเลื่อนไปมา */
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);
const pad2 = (n: number) => String(n).padStart(2, "0");
const startText = (md: string) => {
  const [m, d] = md.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};

function describeCarry(a: RateSettings, b: RateSettings) {
  const txt = (n: number) => (n > 0 ? `ยกได้ไม่เกิน ${n} วัน` : "ไม่ยกยอด");
  const out: string[] = [];
  if (a.leaveYearStart !== b.leaveYearStart)
    out.push(`วันเริ่มรอบปีการลา ${startText(a.leaveYearStart)} → ${startText(b.leaveYearStart)}`);
  if (a.vacationCarryMax !== b.vacationCarryMax)
    out.push(`ยกยอดลาพักร้อนข้ามปี ${txt(a.vacationCarryMax)} → ${txt(b.vacationCarryMax)}`);
  return out;
}

export function AdminLeavePage() {
  const allLeave = useAllLeave();
  const d = useSectionDraft("leave", "การลา", describe);
  const c = useSectionDraft("rates", "การลา", describeCarry);
  const carry = c.draft.vacationCarryMax;
  const [customCarry, setCustomCarry] = useState(!CARRY_CHOICES.includes(carry));
  const badCarry = !Number.isInteger(carry) || carry < 0 || carry > 365;
  const [from, to] = currentPeriod().split(" - ");
  const list = withBuiltins(d.draft);

  /* กล่องเพิ่ม/แก้ประเภท — null = ปิด · "" = เพิ่มใหม่ · ชื่อประเภท = แก้อันที่เพิ่มไว้ */
  const [editing, setEditing] = useState<string | null>(null);

  function setDaysOf(type: string, value: number) {
    d.setDraft(list.map((q) => (q.type === type ? { ...q, days: value } : q)));
  }

  function saveType(prev: string, next: LeaveQuota) {
    d.setDraft(prev ? list.map((q) => (q.type === prev ? next : q)) : [...list, next]);
    setEditing(null);
  }

  function toggleType(type: string) {
    d.setDraft(list.map((q) => (q.type === type ? { ...q, off: !q.off } : q)));
  }

  /* จำนวนใบลาที่ใช้ประเภทนี้ — ลบไม่ได้ถ้ามีใบอ้างอยู่ (ต้นแบบ HR-12 คอลัมน์การใช้งาน) */
  function usedOf(type: string) {
    /* useAllLeave คืนใบลาแยกตามบทบาท รวมให้เป็นชุดเดียวก่อนนับ */
    const n = Object.values(allLeave).flat().filter((r) => r.type === type).length;
    return n ? `ใบลา ${n}` : "";
  }

  function remove(type: string) {
    d.setDraft(list.filter((q) => q.type !== type));
  }

  const bad = list.some((q) => !Number.isFinite(q.days) || q.days < 0 || q.days > 365)
    ? "จำนวนวันต้องอยู่ระหว่าง 0 ถึง 365"
    : "";

  return (
    <div className="space-y-4">
      <AdminHead
        title="ประเภทการลา"
        desc="สิทธิ์วันลาต่อปีของพนักงานทุกบทบาท — พนักงานเห็นวันคงเหลือจากตัวเลขนี้ และระบบเตือนเมื่อยื่นลาเกินสิทธิ์"
      />

      <section className="glass overflow-hidden rounded-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="text-[14.5px] font-bold">สิทธิ์วันลา</h2>
          </div>
          <button type="button" className="btn solid btn-solid" onClick={() => setEditing("")}>
            <PlusIcon className="size-4" strokeWidth={2.4} />
            เพิ่มประเภทการลา
          </button>
        </div>

        <div className="px-4 pt-3 pb-4 sm:px-5">
          {/* หัวตารางแบบเดียวกับหน้าข้อมูลหลัก (ต้นแบบ HR-12) */}
          <div className="grid grid-cols-[minmax(0,1fr)_96px_58px_84px] items-center gap-2 border-b border-border pb-2 text-[11.5px] font-bold text-muted-foreground sm:grid-cols-[26px_minmax(0,1fr)_150px_58px_84px]">
            <span className="text-center max-sm:hidden">#</span>
            <span>ชื่อ</span>
            <span className="text-right sm:text-left">สิทธิ์ต่อปี</span>
            <span className="text-center">เปิดใช้</span>
            <span />
          </div>

          {list.map((q, i) => {
            const was = d.saved.find((x) => x.type === q.type);
            const builtin = isBuiltinLeave(q.type);
            const used = usedOf(q.type);
            return (
              <div
                key={q.type}
                className="grid grid-cols-[minmax(0,1fr)_96px_58px_84px] items-center gap-2 border-b border-border py-2 last:border-b-0 hover:bg-muted/40 sm:grid-cols-[26px_minmax(0,1fr)_150px_58px_84px]"
              >
                <span className="num text-center text-[12px] text-muted-foreground max-sm:hidden">{i + 1}</span>
                <span className="min-w-0">
                  <b className={`block text-[13.5px] ${q.off ? "font-medium text-muted-foreground" : "font-semibold"}`}>
                    {leaveLabel(q.type)}
                    {q.off && (
                      <em className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground not-italic">
                        ปิดใช้งาน
                      </em>
                    )}
                    {!builtin && !was && (
                      <em className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary not-italic">
                        ใหม่ · ยังไม่บันทึก
                      </em>
                    )}
                  </b>
                  <small className="block text-[11.5px] text-muted-foreground">
                    {q.note ?? leaveNote(q.type)}
                    {was && q.days !== was.days && ` · เดิม ${was.days} วัน`}
                  </small>
                </span>
                <span className="flex items-center justify-end gap-1.5 sm:justify-start">
                  <input
                    type="number"
                    min={0}
                    max={365}
                    step={0.5}
                    value={q.days}
                    aria-label={`สิทธิ์${q.type} (วันต่อปี)`}
                    onChange={(e) => setDaysOf(q.type, Number(e.target.value))}
                    className="field-control num h-9 w-[78px] text-right text-[13.5px]"
                  />
                  <span className="text-[12px] whitespace-nowrap text-muted-foreground">วัน/ปี</span>
                </span>
                <span className="flex justify-center">
                  <Switch
                    on={!q.off}
                    onToggle={() => toggleType(q.type)}
                    label={`เปิดหรือปิดใช้งาน ${q.type}`}
                  />
                </span>
                <span className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    aria-label={`แก้ไขประเภท ${q.type}`}
                    onClick={() => setEditing(q.type)}
                    className="btn glass-thin btn-mini"
                  >
                    <PencilIcon className="size-4" strokeWidth={1.9} />
                  </button>
                  {/* ลบไม่ได้ก็ไม่ต้องมีปุ่มลบ (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
                  {!builtin && !used && (
                    <button
                      type="button"
                      aria-label={`ลบประเภท ${q.type}`}
                      onClick={() => remove(q.type)}
                      className="btn glass-thin btn-mini"
                    >
                      <TrashIcon className="size-4" strokeWidth={1.9} />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ไม่มีข้อความอธิบายการทำงานของระบบ และไม่มีช่องยกยอดลาพักร้อน (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
      <Card title="รอบปีการลา">
        <p className="mb-1.5 text-[12.5px] font-semibold text-muted-foreground">วันเริ่มรอบปีการลา</p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] text-muted-foreground">ทุกวันที่</span>
          <select
            value={Number(c.draft.leaveYearStart.slice(3))}
            onChange={(e) =>
              c.setDraft({ ...c.draft, leaveYearStart: `${c.draft.leaveYearStart.slice(0, 2)}-${pad2(Number(e.target.value))}` })
            }
            className={`${inputCls} max-w-[90px] cursor-pointer`}
            aria-label="วันที่เริ่มรอบ"
          >
            {DAYS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <select
            value={Number(c.draft.leaveYearStart.slice(0, 2))}
            onChange={(e) =>
              c.setDraft({ ...c.draft, leaveYearStart: `${pad2(Number(e.target.value))}-${c.draft.leaveYearStart.slice(3)}` })
            }
            className={`${inputCls} max-w-[180px] cursor-pointer`}
            aria-label="เดือนที่เริ่มรอบ"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </Card>


      {editing !== null && (
        <TypeDialog
          initial={list.find((q) => q.type === editing)}
          lockName={isBuiltinLeave(editing)}
          taken={list.map((q) => q.type).filter((t) => t !== editing)}
          onClose={() => setEditing(null)}
          onSave={(next) => saveType(editing, next)}
        />
      )}

      <SaveBar
        dirty={d.dirty || c.dirty}
        isDefault={d.isDefault && c.saved.vacationCarryMax === 0 && c.saved.leaveYearStart === "01-01"}
        invalid={bad || (badCarry ? "จำนวนวันยกยอดต้องเป็นจำนวนเต็ม 0 ถึง 365" : "")}
        onSave={() => {
          if (d.dirty) d.save();
          if (c.dirty) c.save();
        }}
        onCancel={() => {
          d.cancel();
          c.cancel();
          setCustomCarry(!CARRY_CHOICES.includes(c.saved.vacationCarryMax));
        }}
        onDefault={() => {
          d.toDefault();
          /* คืนเฉพาะเพดานยกยอด — อัตราอื่นในหมวดเดียวกันเป็นของหน้าอัตราและภาษี */
          c.setDraft({ ...c.saved, vacationCarryMax: 0, leaveYearStart: "01-01" });
          setCustomCarry(false);
        }}
      />
    </div>
  );
}

/**
 * เพิ่ม/แก้ประเภทการลาที่เพิ่มเอง
 * เปลี่ยนชื่อได้ แต่ใบลาที่ยื่นไปแล้วยังเก็บชื่อเดิม (ไม่ถูกนับเข้าสิทธิ์ของชื่อใหม่)
 */
function TypeDialog({
  initial,
  lockName = false,
  taken,
  onClose,
  onSave,
}: {
  initial?: LeaveQuota;
  /** ประเภทตั้งต้นของระบบ — แก้ได้แค่วันและคำอธิบาย ชื่อผูกกับการสรุปของฝ่ายบุคคล */
  lockName?: boolean;
  taken: string[];
  onClose: () => void;
  onSave: (q: LeaveQuota) => void;
}) {
  const [name, setName] = useState(initial?.type ?? "");
  const [days, setDays] = useState(initial ? String(initial.days) : "");
  const [note, setNote] = useState(initial?.note ?? (initial ? leaveNote(initial.type) : ""));
  const clean = name.trim();
  const dup = Boolean(clean) && taken.includes(clean);
  const n = Number(days) || 0;
  const badDays = n < 0 || n > 365;
  const renamed = Boolean(initial) && clean !== initial?.type;

  function save() {
    if (!clean || dup || badDays) return;
    onSave({ type: clean, days: n, ...(note.trim() ? { note: note.trim() } : {}) });
  }

  return (
    <Sheet
      title={initial ? `แก้ไขประเภท ${initial.type}` : "เพิ่มประเภทการลา"}
      narrow
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn solid btn-solid" disabled={!clean || dup || badDays} onClick={save}>
            {initial ? "บันทึกการแก้ไข" : "เพิ่ม"}
          </button>
        </>
      }
    >
      <div className="grid gap-3.5 sm:grid-cols-[minmax(0,1fr)_120px]">
        <Input2 label="ชื่อประเภท" error={dup ? "มีประเภทนี้อยู่แล้ว" : undefined}>
          <input
            autoFocus={!lockName}
            disabled={lockName}
            title={lockName ? "ประเภทตั้งต้นของระบบเปลี่ยนชื่อไม่ได้" : undefined}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="เช่น ลาบวช · ลาเพื่อรับราชการทหาร"
            className={`${inputCls} disabled:cursor-not-allowed disabled:opacity-60`}
          />
        </Input2>
        <Input2 label="วัน/ปี" error={badDays ? "0–365 วัน" : undefined}>
          <input
            type="number"
            min={0}
            max={365}
            step={0.5}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="0"
            className={`${inputCls} num text-right`}
          />
        </Input2>
      </div>
      <div className="mt-3.5">
        <Input2 label="คำอธิบาย (ไม่บังคับ)">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="เช่น ลาได้ครั้งเดียวตลอดการทำงาน"
            className={inputCls}
          />
        </Input2>
      </div>
    </Sheet>
  );
}
