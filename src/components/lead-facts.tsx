"use client";

import { useState } from "react";
import { branchLabel, HEAD_OFFICE, type Customer } from "@/lib/crm-data";
import { PencilIcon } from "./icons";
import { useAddOption } from "./add-option";

type Editable = Pick<
  Customer,
  "contact" | "phone" | "email" | "source" | "taxId" | "address"
> & {
  /* สามช่องของใบกำกับภาษี — ของเก่าไม่มี เก็บเป็นค่าว่างไว้ก่อน */
  legalName: string;
  legalAddress: string;
  branch: string;
};

const FIELDS: {
  key: keyof Editable;
  label: string;
  placeholder: string;
  wide?: boolean;
  num?: boolean;
  kind?: "select" | "text" | "branch";
  /** เฉพาะลูกค้านิติบุคคล — บุคคลธรรมดาไม่มีชื่อจดทะเบียนและไม่มีสาขา */
  juristic?: boolean;
}[] = [
  { key: "contact", label: "ผู้ติดต่อ", placeholder: "ยังไม่ได้กรอก" },
  { key: "phone", label: "เบอร์โทรศัพท์", placeholder: "ยังไม่ได้กรอก", num: true },
  { key: "email", label: "อีเมล", placeholder: "ยังไม่ได้กรอก" },
  { key: "source", label: "แหล่งที่มา", placeholder: "—", kind: "select" },
  {
    key: "taxId",
    label: "เลขประจำตัวผู้เสียภาษี",
    placeholder: "ยังไม่ได้กรอก",
    num: true,
  },
  {
    key: "address",
    label: "ที่อยู่",
    placeholder: "ยังไม่ได้กรอก — ต้องกรอกก่อนออกเอกสารการเงิน",
    wide: true,
  },
  /* สามช่องนี้คือสิ่งที่ใบกำกับภาษีบังคับ ขาดช่องใดช่องหนึ่งฝ่ายบัญชีออกใบกำกับภาษีให้ไม่ได้ */
  {
    key: "legalName",
    label: "ชื่อตามหนังสือรับรอง",
    placeholder: "ยังไม่ได้กรอก — ต้องกรอกก่อนออกใบกำกับภาษี เช่น บริษัท ตัวอย่าง จำกัด",
    wide: true,
    juristic: true,
  },
  {
    key: "legalAddress",
    label: "ที่อยู่จดทะเบียน",
    placeholder: "เว้นว่างได้ถ้าใช้ที่อยู่เดียวกับด้านบน",
    wide: true,
    juristic: true,
  },
  {
    key: "branch",
    label: "สำนักงานใหญ่ / สาขา",
    placeholder: "ยังไม่ได้ระบุ — ต้องระบุก่อนออกใบกำกับภาษี",
    kind: "branch",
    juristic: true,
  },
];

function formatPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length > 6) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length > 3) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return d;
}

/**
 * ข้อมูลติดต่อที่แก้ได้ในที่ ไม่ต้องเปิดหน้าใหม่
 * กดดินสอ → ช่องกลายเป็นช่องกรอก → บันทึกหรือยกเลิก
 */
export function ProfileFacts({
  customer,
  sources,
  onSave,
}: {
  customer: Customer;
  sources: string[];
  onSave: (patch: Partial<Editable>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Editable>(() => pick(customer));
  const fields = FIELDS.filter((f) => !f.juristic || customer.type === "juristic");
  const addSource = useAddOption({ list: "leadSource" }, (v) => setDraft((d) => ({ ...d, source: v })));
  /* รายการที่เพิ่งเพิ่มจากตรงนี้ ยังไม่อยู่ใน props ที่หน้าแม่ส่งมา — ต่อท้ายให้เห็นทันที */
  const sourceList = draft.source && !sources.includes(draft.source) ? [...sources, draft.source] : sources;

  function start() {
    setDraft(pick(customer));
    setEditing(true);
  }

  function save() {
    onSave({ ...draft, phone: formatPhone(draft.phone) });
    setEditing(false);
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 lg:hidden">
        <h3 className="text-[15px] font-semibold">ข้อมูลติดต่อ</h3>
        {!editing && (
          <button
            type="button"
            onClick={start}
            className="btn glass-thin btn-mini ml-auto"
          >
            <PencilIcon className="size-4" strokeWidth={1.9} />
            แก้ไข
          </button>
        )}
      </div>

      {addSource.dialog}
      <dl className="grid gap-4 sm:grid-cols-2 sm:gap-x-[22px]">
        {fields.map((f) => (
          <div key={f.key} className={f.wide ? "sm:col-span-2" : undefined}>
            <dt className="text-[11.5px] text-muted-foreground">{f.label}</dt>
            <dd className="mt-[3px]">
              {editing ? (
                f.kind === "branch" ? (
                  <BranchInput
                    value={draft.branch}
                    onChange={(v) => setDraft((d) => ({ ...d, branch: v }))}
                  />
                ) : f.kind === "select" ? (
                  <select
                    value={draft.source}
                    onChange={(e) => addSource.pick(e.target.value) || setDraft((d) => ({ ...d, source: e.target.value }))}
                    aria-label={f.label}
                    className="field-control h-9 cursor-pointer text-[13.5px]"
                  >
                    <option value="">— เลือก —</option>
                    {sourceList.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                    {addSource.option}
                  </select>
                ) : (
                  <input
                    value={draft[f.key]}
                    inputMode={f.num ? "numeric" : undefined}
                    aria-label={f.label}
                    placeholder={f.placeholder}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        [f.key]:
                          f.key === "taxId"
                            ? e.target.value.replace(/\D/g, "").slice(0, 13)
                            : e.target.value,
                      }))
                    }
                    className={`field-control h-9 text-[13.5px] ${f.num ? "num" : ""}`}
                  />
                )
              ) : (
                <span
                  className={`block text-sm break-words ${f.num ? "num" : ""} ${
                    shown(customer, f.key) ? "font-medium" : "text-muted-foreground"
                  }`}
                >
                  {shown(customer, f.key) || f.placeholder}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex justify-end gap-2">
        {editing ? (
          <>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="btn glass-thin flex-1 justify-center sm:flex-none"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={save}
              className="btn solid btn-solid flex-1 justify-center sm:flex-none"
            >
              บันทึก
            </button>
          </>
        ) : (
          /* .btn ประกาศ display เอง คลาส hidden จึงชนะ lg:inline-flex แล้วปุ่มหายไปทั้งบนจอคอม
             (เจ้าของทัก 28 ก.ย. 2569 ว่าแก้ข้อมูลไม่ได้) ต้องซ่อนที่กล่องนอกแทน */
          <div className="hidden lg:block">
            <button
              type="button"
              onClick={start}
              aria-label="แก้ไขข้อมูลติดต่อ"
              className="btn glass-thin btn-mini"
            >
              <PencilIcon className="size-4" strokeWidth={1.9} />
              แก้ไขข้อมูล
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** ค่าที่โชว์ตอนไม่ได้แก้ไข — สาขาโชว์เป็นคำที่พิมพ์บนเอกสารจริง ไม่ใช่รหัสห้าหลัก */
function shown(c: Customer, key: keyof Editable) {
  if (key === "branch") return branchLabel(c.branch ?? "");
  return c[key] ?? "";
}

function pick(c: Customer): Editable {
  return {
    contact: c.contact,
    phone: c.phone,
    email: c.email,
    source: c.source,
    taxId: c.taxId,
    address: c.address,
    legalName: c.legalName ?? "",
    legalAddress: c.legalAddress ?? "",
    branch: c.branch ?? "",
  };
}

/**
 * สำนักงานใหญ่หรือสาขา — เลือกจากดรอปดาวน์ก่อน เป็นสาขาค่อยกรอกเลขห้าหลัก
 * ปล่อยให้พิมพ์รหัสเองทั้งช่องจะได้ "00000" ผิด ๆ แล้วเอกสารขึ้นว่าสำนักงานใหญ่ทั้งที่เป็นสาขา
 */
export function BranchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isSub = Boolean(value) && value !== HEAD_OFFICE;
  const [sub, setSub] = useState(isSub);

  return (
    <div className="flex gap-2">
      <select
        value={sub ? "sub" : value === HEAD_OFFICE ? HEAD_OFFICE : ""}
        aria-label="สำนักงานใหญ่ / สาขา"
        onChange={(e) => {
          const v = e.target.value;
          setSub(v === "sub");
          onChange(v === "sub" ? (isSub ? value : "") : v);
        }}
        className="field-control h-9 min-w-0 flex-1 cursor-pointer text-[13.5px]"
      >
        <option value="">— เลือก —</option>
        <option value={HEAD_OFFICE}>สำนักงานใหญ่</option>
        <option value="sub">สาขา</option>
      </select>
      {sub && (
        <input
          value={value === HEAD_OFFICE ? "" : value}
          inputMode="numeric"
          aria-label="เลขที่สาขา"
          placeholder="เลขสาขา 5 หลัก"
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 5))}
          className="field-control num h-9 max-w-[130px] shrink-0 text-[13.5px]"
        />
      )}
    </div>
  );
}
