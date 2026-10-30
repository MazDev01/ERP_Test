"use client";

/*
 * แก้รายการเงินได้/รายการหักที่ไม่มีสูตร ตามแบบสลิป (ผู้ใช้สั่ง 16 ต.ค. 2569)
 *
 * เดิมคือ Incentive + ค่าตำแหน่ง + "รายการปรับปรุงด้วยมือ" แบบพิมพ์เหตุผลเอง — แทนด้วยช่องตัวเลขทีละบรรทัดของสลิป
 * สลิปจึงลงบรรทัดตามช่องตรง ๆ ไม่ต้องเดาจากชื่อ · ว่าง = 0
 * มาสาย ประกันสังคม ค่าล่วงเวลา ภาษีหัก ณ ที่จ่าย ยังคิดจากสูตร ไม่มีช่องให้แก้
 *
 * อยู่ในหน้าคำนวณเงินเดือน แก้ได้ตอนรอบยังเปิดอยู่เท่านั้น (ผู้ใช้ทักไว้ 23 ก.ย. 2569 · ส่ง CEO แล้วแก้ = ต้องส่งอนุมัติใหม่ ผู้ใช้สั่ง 19 ต.ค. 2569)
 */

import { useState } from "react";
import { baht, commaInput, thaiMonth, todayIso } from "@/lib/format";
import {
  dailyRoundRange,
  extraOf,
  hasPayCuts,
  hrCycle,
  hrPos,
  isDailyRoundKey,
  payIn,
  payKeyLabel,
  PAY_CUT_ITEMS,
  PAY_INCOME_ITEMS,
  standingCuts,
  type Employee,
  type PayItemKey,
  type PayItems,
} from "@/lib/hr-data";
import { saveExtra, useHr } from "@/lib/hr-store";
import { useComSource, useHrTime } from "@/lib/hr-link";
import { Sheet } from "./lead-dialogs";
import { Field, Input } from "./ui";

/* รายการหักที่ระบบเติมให้ทุกรอบ */
const STANDING: PayItemKey[] = ["guarantee", "studentLoan"];

export function EditExtra({
  emp,
  runKey,
  hr,
  time,
  onClose,
}: {
  emp: Employee;
  /** รอบเดือน "yyyy-mm" หรือรอบรายช่วงของทดลองงาน "จาก~ถึง" */
  runKey: string;
  hr: ReturnType<typeof useHr>;
  time: ReturnType<typeof useHrTime>;
  onClose: () => void;
}) {
  const src = useComSource();
  const saved = extraOf(hr.extras, emp.id, runKey).items;
  const range = isDailyRoundKey(runKey) ? dailyRoundRange(runKey) : hrCycle(runKey);
  /* ทดลองงานจ่ายรายวันและฝึกงานไม่มีเงินประกันผลงานกับ กยศ. (ผู้ใช้สั่ง 30 ต.ค. 2569) */
  const cutsOn = hasPayCuts(emp, range);
  const incomeItems = PAY_INCOME_ITEMS.filter(({ k }) => cutsOn || k !== "guaranteeBack");
  const cutItems = PAY_CUT_ITEMS.filter(({ k }) => cutsOn || !STANDING.includes(k));
  const all = [...incomeItems, ...cutItems];
  const auto = standingCuts(emp, range, hr.extras);
  const [raw, setRaw] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      all.map(({ k }) => {
        const v = saved[k] ?? auto[k] ?? 0;
        return [k, v ? commaInput(String(v)) : saved[k] === 0 ? "0" : ""];
      }),
    ),
  );
  /** กดบันทึกทั้งที่กรอกไม่ถูก — ขึ้นคำเตือนแทนการกดไม่ลงเฉย ๆ */
  const [warn, setWarn] = useState(false);

  const parsed = all.map(({ k }) => [k, num(raw[k] ?? "")] as const);
  const valid = parsed.every(([, v]) => v !== null && v >= 0);
  const items: PayItems = {};
  for (const [k, v] of parsed) {
    /* ยอดเท่ากับที่ระบบเติมให้ = ไม่ต้องเก็บ ยอดจะได้ตามค่าที่ตั้งไว้ · ต่างจากนั้น (รวม 0 = เว้นรอบนี้) จึงเก็บเป็นยอดของรอบนี้ */
    if (STANDING.includes(k)) {
      if (v !== null && v !== (auto[k] ?? 0)) items[k] = v;
    } else if (v) items[k] = v;
  }

  /* ยอดสุทธิก่อน/หลังแก้ — คิดด้วยสูตรเดียวกับหน้าคำนวณเงินเดือน (รวมภาษีหัก ณ ที่จ่ายของทดลองงาน) */
  const now = payIn(emp, range, time, hr.extras, todayIso(), src);
  const preview = payIn(
    emp,
    range,
    time,
    { ...hr.extras, [runKey]: { ...(hr.extras[runKey] ?? {}), [emp.id]: { items } } },
    todayIso(),
    src,
  );

  const field = ({ k, label }: { k: PayItemKey; label: string }) => (
    <Field key={k} label={`${label} (บาท)`}>
      <Input
        value={raw[k] ?? ""}
        onChange={(e) => setRaw((v) => ({ ...v, [k]: commaInput(e.target.value) }))}
        inputMode="decimal"
        placeholder="0"
        aria-invalid={warn && num(raw[k] ?? "") === null ? true : undefined}
      />
    </Field>
  );

  return (
    <Sheet
      title={`แก้ไขค่าตอบแทน ${emp.name}`}
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
              if (!valid) return setWarn(true);
              saveExtra(runKey, emp.id, { items });
              onClose();
            }}
          >
            บันทึก
          </button>
        </>
      }
    >
      <p className="text-[12.5px] text-muted-foreground">
        {hrPos(emp.pos).label} · รอบ {payKeyLabel(runKey, thaiMonth)}
      </p>

      <p className="mt-4 text-[12.5px] font-semibold text-muted-foreground">รายได้</p>
      <div className="mt-1.5 grid gap-3 sm:grid-cols-2">{incomeItems.map(field)}</div>
      {now.com > 0 && (
        /* ค่าคอมจากยอดขายคิดอัตโนมัติอยู่แล้ว ช่อง ค่า commission คือยอดที่กรอกเพิ่ม — สลิปรวมสองก้อนในบรรทัดเดียว */
        <p className="mt-1.5 text-[12px] text-muted-foreground">
          ค่าคอมจากยอดขาย (คิดอัตโนมัติ) {baht(now.com)} บาท — ช่อง “ค่า commission” คือยอดที่กรอกเพิ่ม
        </p>
      )}

      <hr className="my-4 border-border" />

      <p className="text-[12.5px] font-semibold text-muted-foreground">รายการหัก</p>
      <div className="mt-1.5 grid gap-3 sm:grid-cols-2">{cutItems.map(field)}</div>
      <p className="mt-1.5 text-[12px] text-muted-foreground">
        หักมาสาย ประกันสังคม และภาษีหัก ณ ที่จ่าย คิดจากสูตร ไม่ต้องกรอก
      </p>

      {warn && !valid && (
        <p className="mt-2.5 rounded-[11px] border border-[rgba(192,18,31,.2)] bg-[var(--destructive-soft)] px-3.5 py-2.5 text-[12.5px] text-destructive">
          กรอกเป็นตัวเลขไม่ติดลบ หรือเว้นว่างไว้
        </p>
      )}

      <hr className="my-4 border-border" />

      <p className="num text-[13px]">
        ยอดสุทธิหลังแก้ ·{" "}
        <b className="text-[15px] text-primary">{valid ? baht(preview.net) : "—"}</b> บาท
        <span className="text-muted-foreground"> (เดิม {baht(now.net)})</span>
      </p>
    </Sheet>
  );
}

/** อ่านตัวเลขที่พิมพ์มา — ว่าง = 0 · อ่านไม่ได้ = null */
function num(raw: string) {
  const v = raw.replace(/,/g, "").trim();
  if (!v) return 0;
  return /^\d+(\.\d+)?$/.test(v) ? Number(v) : null;
}
