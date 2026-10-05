"use client";

/*
 * แก้ค่าตอบแทนที่ไม่มีสูตร — Incentive ค่าตำแหน่ง และรายการปรับปรุงด้วยมือ (BR-03)
 *
 * เดิมอยู่ในหน้าสลิปเงินเดือน ซึ่งเป็นขั้นที่ปิดรอบไปแล้ว เท่ากับเปิดทางให้แก้ตัวเลข
 * ของรอบที่ปิดและ CEO อนุมัติแล้วเงียบ ๆ (ผู้ใช้ทักไว้ 23 ก.ย. 2569)
 * จึงแยกออกมาเป็นกล่องกลาง ให้หน้าคำนวณเงินเดือนเรียกใช้ตอนรอบยังเปิดอยู่
 * ส่วนหน้าสลิปเหลือแค่ปุ่มที่กดไม่ลงพร้อมเหตุผล ไม่ใช่ซ่อนปุ่มจนไม่รู้ว่าทำไมแก้ไม่ได้
 */

import { useState } from "react";
import { baht, commaInput, commaInputSigned, thaiMonth, todayIso } from "@/lib/format";
import { extraOf, hrCycle, hrPos, payIn, type Adjust, type Employee, type Extra } from "@/lib/hr-data";
import { saveExtra, useHr } from "@/lib/hr-store";
import { useComSource, useHrTime } from "@/lib/hr-link";
import { Sheet } from "./lead-dialogs";
import { Field, Input } from "./ui";

export function EditExtra({
  emp,
  month,
  hr,
  time,
  onClose,
}: {
  emp: Employee;
  month: string;
  hr: ReturnType<typeof useHr>;
  time: ReturnType<typeof useHrTime>;
  onClose: () => void;
}) {
  const src = useComSource();
  const saved = extraOf(hr.extras, emp.id, month);
  const [inc, setInc] = useState(commaInput(String(saved.incentive)));
  const [allow, setAllow] = useState(commaInput(String(saved.allowance)));
  const [adjust, setAdjust] = useState<Adjust[]>(saved.adjust);
  const [amt, setAmt] = useState("");
  const [why, setWhy] = useState("");
  /** กดเพิ่ม/บันทึกทั้งที่กรอกไม่ถูก — ขึ้นคำเตือนตาม mockup แทนการกดไม่ลงเฉย ๆ */
  const [warn, setWarn] = useState(false);

  const incNum = num(inc);
  const allowNum = num(allow);
  const valid =
    incNum !== null && allowNum !== null && incNum >= 0 && allowNum >= 0;

  const amtNum = num(amt);
  /* ศูนย์ไม่ใช่การปรับปรุง และการปรับปรุงที่ไม่มีเหตุผลตรวจย้อนไม่ได้ */
  const canAdd = amtNum !== null && amtNum !== 0 && why.trim() !== "";

  const now = payIn(emp, hrCycle(month), time, hr.extras, todayIso(), src);
  const adjSum = adjust.reduce((a, x) => a + x.amt, 0);
  const savedSum = saved.adjust.reduce((a, x) => a + x.amt, 0);
  const preview =
    now.net -
    saved.incentive -
    saved.allowance -
    savedSum +
    (incNum ?? 0) +
    (allowNum ?? 0) +
    adjSum;

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
              const next: Extra = {
                incentive: incNum ?? 0,
                allowance: allowNum ?? 0,
                adjust,
              };
              saveExtra(month, emp.id, next);
              onClose();
            }}
          >
            บันทึก
          </button>
        </>
      }
    >
      <p className="text-[12.5px] text-muted-foreground">
        {hrPos(emp.pos).label} · รอบ {thaiMonth(month)}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Incentive (บาท)">
          <Input
            value={inc}
            onChange={(e) => setInc(commaInput(e.target.value))}
            inputMode="decimal"
          />
        </Field>
        <Field label="ค่าตำแหน่ง (บาท)">
          <Input
            value={allow}
            onChange={(e) => setAllow(commaInput(e.target.value))}
            inputMode="decimal"
          />
        </Field>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
        สองรายการนี้ไม่มีสูตร ขึ้นกับการพิจารณาของ CEO ฝ่ายบุคคลเป็นผู้บันทึก
      </p>

      <hr className="my-4 border-border" />

      <p className="text-[12.5px] font-semibold text-muted-foreground">
        รายการปรับปรุงด้วยมือ
      </p>
      <ul className="mt-1.5 text-[12.5px]">
        {adjust.length === 0 ? (
          <li className="py-1.5 text-muted-foreground">
            ยังไม่มีรายการปรับปรุง
          </li>
        ) : (
          adjust.map((a, i) => (
            <li
              key={`${a.why}-${a.amt}-${i}`}
              className="flex items-center justify-between gap-3 border-t border-border py-1.5"
            >
              <span className="min-w-0 flex-1 break-words">{a.why}</span>
              <b
                className={`num whitespace-nowrap ${a.amt < 0 ? "text-destructive" : ""}`}
              >
                {a.amt > 0 ? "+" : ""}
                {baht(a.amt)}
              </b>
              <button
                type="button"
                onClick={() => setAdjust((v) => v.filter((_, k) => k !== i))}
                aria-label={`ลบรายการ ${a.why}`}
                className="lnk flex-none"
              >
                ลบ
              </button>
            </li>
          ))
        )}
      </ul>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="จำนวนเงิน (ติดลบคือหัก)">
          <Input
            value={amt}
            onChange={(e) => setAmt(commaInputSigned(e.target.value))}
            inputMode="decimal"
            placeholder="เช่น -500"
          />
        </Field>
        <Field label="เหตุผล">
          <Input
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            placeholder="ต้องระบุทุกครั้ง"
          />
        </Field>
      </div>
      <button
        type="button"
        className="btn glass-thin mt-2.5"
        onClick={() => {
          if (!canAdd) return setWarn(true);
          setWarn(false);
          setAdjust((v) => [...v, { amt: amtNum!, why: why.trim() }]);
          setAmt("");
          setWhy("");
        }}
      >
        เพิ่มรายการปรับปรุง
      </button>
      {warn && (
        <p className="mt-2.5 rounded-[11px] border border-[rgba(192,18,31,.2)] bg-[var(--destructive-soft)] px-3.5 py-2.5 text-[12.5px] text-destructive">
          กรอกจำนวนเงินเป็นตัวเลข และระบุเหตุผลด้วย
        </p>
      )}

      <hr className="my-4 border-border" />

      <p className="num text-[13px]">
        ยอดสุทธิหลังแก้ ·{" "}
        <b className="text-[15px] text-primary">{baht(round2(preview))}</b> บาท
        <span className="text-muted-foreground"> (เดิม {baht(now.net)})</span>
      </p>
    </Sheet>
  );
}

/** อ่านตัวเลขที่พิมพ์มา — คืน null เมื่ออ่านไม่ได้ เพื่อให้ปุ่มบันทึกกดไม่ลง */
function num(raw: string) {
  const v = raw.replace(/,/g, "").trim();
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null;
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}
