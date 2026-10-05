"use client";

/*
 * ตัวเลือกสุดท้ายในดรอปดาวน์ "+ เพิ่มตัวเลือกใหม่…" — กดแล้วเด้งป๊อปอัพให้พิมพ์ แล้วเลือกให้เลย
 * (ผู้ใช้สั่ง 18 ก.ย. 2569: ดรอปดาวน์ที่เป็นรายการต้องเพิ่มได้จากหน้าของแต่ละบทบาท)
 * 22 ก.ย. 2569 เคยจำกัดให้เพิ่มได้เฉพาะผู้ดูแลระบบ
 * 28 ก.ย. 2569 เจ้าของสั่งใหม่ว่า "ดรอปดาวน์พวกนี้ต้องเพิ่มข้อมูลเข้าไปได้" — เปิดให้ทุกบทบาทเพิ่มได้จากหน้างาน
 *   ทุกครั้งที่เพิ่มยังลงประวัติการตั้งค่าไว้ว่า "(จากหน้างาน)" ฝ่ายบุคคลจึงตามแก้/ลบทีหลังได้ที่ /admin/options
 * ที่เก็บเดียวกับหน้าผู้ดูแลระบบ /admin/options — ผู้ดูแลยังแก้ชื่อ เรียง หรือลบทีหลังได้
 *
 * ใช้คู่กับ select เดิมได้ทันที:
 *   const add = useAddOption({ list: "leadSource" }, setSource)
 *   <select onChange={(e) => add.pick(e.target.value) || setSource(e.target.value)}>
 *     ...ตัวเลือกเดิม...
 *     {add.option}
 *   </select>
 *   {add.dialog}
 */

import { useState } from "react";
import { addOption, type OptionKey } from "@/lib/options";
import { addCatalogItem, type AddCatalogKey } from "@/lib/catalog-add";
import { hrDepts } from "@/lib/hr-data";
import { useRole } from "@/lib/role";
import { Sheet } from "./lead-dialogs";

export const ADD_VALUE = "__add_option__";

export type AddTarget = { list: OptionKey } | { catalog: AddCatalogKey; dept?: string };

export function useAddOption(target: AddTarget, onAdded: (value: string) => void) {
  const [open, setOpen] = useState(false);
  /* ทุกบทบาทที่ล็อกอินอยู่เพิ่มตัวเลือกได้ — ฝ่ายบุคคลยังเป็นคนดูแลรายการรวมที่ /admin/options */
  const canAdd = Boolean(useRole());
  return {
    /** ผู้ดูแลระบบเท่านั้นที่เพิ่มตัวเลือกได้ — ใช้ซ่อนปุ่ม "+ เพิ่ม" ที่หน้าวาดเอง */
    canAdd,
    /** true = ผู้ใช้เลือก "+ เพิ่ม" (เปิดป๊อปอัพแล้ว ไม่ต้องตั้งค่าต่อ) */
    pick: (value: string) => {
      if (value !== ADD_VALUE || !canAdd) return false;
      setOpen(true);
      return true;
    },
    option: canAdd && (
      <option value={ADD_VALUE} className="font-semibold text-primary">
        ＋ เพิ่มตัวเลือกใหม่…
      </option>
    ),
    dialog: open && canAdd ? (
      <AddOptionDialog
        target={target}
        onClose={() => setOpen(false)}
        onAdded={(v) => {
          setOpen(false);
          onAdded(v);
        }}
      />
    ) : null,
  };
}

function AddOptionDialog({
  target,
  onClose,
  onAdded,
}: {
  target: AddTarget;
  onClose: () => void;
  onAdded: (value: string) => void;
}) {
  const [text, setText] = useState("");
  const isCat = "catalog" in target;
  const depts = hrDepts();
  const [dept, setDept] = useState(("dept" in target && target.dept) || depts[0]?.v || "");
  const [rate, setRate] = useState("3");
  const [req, setReq] = useState(false);
  const clean = text.trim();
  const nRate = Number(rate);
  const badRate = isCat && target.catalog === "whtTypes" && !(nRate >= 0 && nRate <= 15);

  function save() {
    if (!clean || badRate) return;
    if (isCat) {
      const res = addCatalogItem(target.catalog, clean, { dept, rate: nRate, req });
      if ("error" in res) return setErr(res.error);
      onAdded(res.value);
    } else {
      addOption(target.list, clean);
      onAdded(clean);
    }
  }
  const [err, setErr] = useState("");

  return (
    <Sheet
      title="เพิ่มตัวเลือกใหม่"
      narrow
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn solid btn-solid" disabled={!clean || badRate} onClick={save}>
            เพิ่มและเลือก
          </button>
        </>
      }
    >
      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">ชื่อตัวเลือก</span>
        <input
          autoFocus
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setErr("");
          }}
          onKeyDown={(e) => e.key === "Enter" && save()}
          className="field-control"
        />
      </label>
      {isCat && target.catalog === "positions" && (
        <label className="mt-3.5 block">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">แผนก</span>
          <select value={dept} onChange={(e) => setDept(e.target.value)} className="field-control cursor-pointer">
            {depts.map((d) => (
              <option key={d.v} value={d.v}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {isCat && target.catalog === "whtTypes" && (
        <label className="mt-3.5 block">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">อัตราหัก (%)</span>
          <input
            type="number"
            min={0}
            max={15}
            step={0.5}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="field-control num w-[120px] text-right"
          />
        </label>
      )}
      {isCat && target.catalog === "docs" && (
        <label className="mt-3.5 flex cursor-pointer items-center gap-2.5 text-[13.5px]">
          <input type="checkbox" checked={req} onChange={(e) => setReq(e.target.checked)} className="size-4 accent-[var(--primary)]" />
          ต้องมี — ขาดแล้วขึ้นเตือนว่าเอกสารไม่ครบ
        </label>
      )}
      {err && <p className="mt-2 text-[12.5px] text-destructive">{err}</p>}
      <p className="mt-3 rounded-[11px] bg-muted/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
        ตัวเลือกนี้ใช้ได้ทุกคนทันที · ผู้ดูแลระบบแก้ชื่อ เรียงลำดับ หรือลบได้ที่หน้า “ตัวเลือกในรายการ”
      </p>
    </Sheet>
  );
}
