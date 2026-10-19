"use client";

/*
 * ชิ้นส่วนบัญชีผู้ใช้ที่ใช้ร่วมกัน — ฟอร์มเพิ่มพนักงาน (สร้างบัญชีพร้อมกัน) และหน้าจัดการบัญชีผู้ใช้
 * พนักงาน 1 คนมีบัญชี 1 บัญชี สร้างพร้อมกันในฟอร์มเพิ่มพนักงาน (ต้นแบบ hr-employees-grid.html · ผู้ใช้สั่ง 6 ต.ค. 2569)
 */

import { useState } from "react";
import { roleLabel, type Role } from "@/lib/role";
import { Sheet } from "./lead-dialogs";

/** รหัสชั่วคราว — ตัดตัวอักษรที่อ่านสลับกันง่าย (O 0 I l 1) ออก จะได้อ่านทางโทรศัพท์ได้ */
export function tempPass() {
  const up = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const low = "abcdefghijkmnpqrstuvwxyz";
  const num = "23456789";
  const sym = "#@!";
  const pick = (s: string) => s.charAt(Math.floor(Math.random() * s.length));
  return pick(up) + pick(low) + pick(low) + pick(low) + pick(num) + pick(num) + pick(sym);
}

/**
 * งานที่รับผิดชอบ (ผู้ใช้สั่ง 6 ต.ค. 2569) — ตั้งชื่อตามงาน ไม่ใช่ชื่อบทบาท แต่ละอันเปิดเมนูของบทบาทนั้น
 * บทบาทอื่น (GM ผู้บริหาร ทีมก่อนการขาย ฯลฯ) ไม่อยู่ในรายการนี้ — บัญชีที่ถืออยู่แล้วยังคงไว้ ไม่ถูกลบ
 */
export const JOBS: { key: Role; label: string }[] = [
  { key: "staff", label: "รับงานโปรเจค" },
  { key: "pm", label: "จัดการโปรเจค" },
  { key: "sales", label: "งานขาย" },
  { key: "acc", label: "บัญชี" },
  { key: "hr", label: "บุคคล" },
];

/**
 * คำอธิบายย่อของแต่ละงาน — เปิดจากปุ่ม i ข้างช่องติก (ผู้ใช้สั่ง 13 ต.ค. 2569)
 * ผู้ใช้บอกว่าไม่เข้าใจว่าแต่ละงานใครควรได้ และเกี่ยวกับอะไร
 */
const JOB_INFO: Record<string, { who: string; does: string[] }> = {
  staff: {
    who: "ทีมงานที่ลงมือทำงานในโปรเจค เช่น Graphic, Content, Dev, Website, Media",
    does: ["รับงานที่ PM มอบหมาย", "ส่งผลงานให้ PM ตรวจ และแก้ตามที่ลูกค้าคอมเมนต์", "ดูตารางงานของตัวเอง"],
  },
  pm: {
    who: "ผู้จัดการโครงการ (PM) หรือผู้ที่ดูแลโปรเจคของลูกค้า",
    does: ["รับงานเข้าใหม่หลังลูกค้าชำระงวดแรก", "วางแผนงาน แบ่งงาน และมอบหมายให้ทีม", "ตรวจงานก่อนส่งลูกค้า และติดตามความคืบหน้า"],
  },
  sales: {
    who: "พนักงานขาย หรือ BD ที่ติดต่อลูกค้า",
    does: ["ดูแล Lead และบันทึกการติดต่อ", "ขอทำข้อเสนอ ออกใบเสนอราคา", "ส่งใบเสนอราคาไปวางบิลเมื่อลูกค้าตกลง"],
  },
  acc: {
    who: "พนักงานบัญชี",
    does: ["วางบิล ออกใบแจ้งหนี้และใบเสร็จ", "ติดตามลูกหนี้ค้างชำระ", "บันทึกภาษีหัก ณ ที่จ่าย"],
  },
  hr: {
    who: "ฝ่ายบุคคล",
    does: ["ดูแลข้อมูลพนักงานและบัญชีผู้ใช้", "ปิดรอบเวลาทำงาน คำนวณเงินเดือน ออกสลิป", "ตั้งค่าเวลาทำงาน วันหยุด และอัตราต่าง ๆ"],
  },
};

/** สีป้ายของงานที่รับผิดชอบ — ใช้ชุดสีป้ายเดิมของระบบ (ผู้ใช้สั่ง 15 ต.ค. 2569) */
const JOB_TAG: Partial<Record<Role, string>> = {
  staff: "t-info",
  pm: "t-job",
  sales: "t-early",
  acc: "t-ok",
  hr: "t-late",
};

/** งานที่รับผิดชอบเป็นป้ายสี เรียงตามลำดับที่ติก — ไม่มีงานขึ้นขีด */
export function JobTags({ roles }: { roles?: Role[] }) {
  if (!roles?.length) return <span className="muted">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {roles.map((r) => (
        <span key={r} className={`tag ${JOB_TAG[r] ?? "t-miss"}`}>
          <i />
          {jobLabel(r)}
        </span>
      ))}
    </span>
  );
}

/** ชื่อที่แสดงของบทบาทในบัญชี — ใช้ชื่องานถ้ามี */
export function jobLabel(r: Role) {
  return JOBS.find((j) => j.key === r)?.label ?? roleLabel(r);
}

/**
 * ช่องติกงานที่รับผิดชอบของบัญชี — ลำดับที่ติกคือลำดับเมนูที่ผู้ใช้เห็น ติกก่อนขึ้นก่อน (ผู้ใช้สั่ง 6 ต.ค. 2569)
 * ติกเกินจำนวนสูงสุด ส่งข้อความกลับผ่าน onWarn แทนการกดไม่ลงเฉย ๆ
 */
export function RolePicker({
  roles,
  onChange,
  onWarn,
}: {
  roles: Role[];
  onChange: (next: Role[]) => void;
  onWarn: (msg: string) => void;
}) {
  function toggle(r: Role) {
    onWarn("");
    if (roles.includes(r)) return onChange(roles.filter((x) => x !== r));
    onChange([...roles, r]);
  }
  const [info, setInfo] = useState<Role | null>(null);
  const shown = info ? JOBS.find((j) => j.key === info) : undefined;
  const detail = info ? JOB_INFO[info] : undefined;
  return (
    <>
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {JOBS.map((r) => {
        const at = roles.indexOf(r.key);
        const on = at >= 0;
        return (
          <label
            key={r.key}
            className={`flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2 text-[13px] ${
              on ? "border-primary bg-[#FEF5F6] font-semibold text-primary" : "border-border"
            }`}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() => toggle(r.key)}
              className="size-4 flex-none accent-[var(--primary)]"
            />
            <span className="min-w-0 flex-1 truncate">{r.label}</span>
            {on && (
              <b className="num grid size-5 flex-none place-items-center rounded-full bg-primary text-[11px] text-white">
                {at + 1}
              </b>
            )}
            {/* ปุ่ม i เปิดคำอธิบายงาน — กดแล้วไม่ติก/เอาติกออก (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
            {JOB_INFO[r.key] && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setInfo((v) => (v === r.key ? null : r.key));
                }}
                className={`grid size-5 flex-none place-items-center rounded-full border text-[11px] font-bold italic leading-none ${
                  info === r.key ? "border-primary bg-primary text-white" : "border-border bg-white text-muted-foreground"
                }`}
                aria-label={`งาน${r.label}คืออะไร`}
                aria-expanded={info === r.key}
                title="ดูคำอธิบาย"
              >
                i
              </button>
            )}
          </label>
        );
      })}
    </div>
    {shown && detail && (
      <div className="mt-2 rounded-[12px] border border-border bg-muted/40 px-3.5 py-3 text-[12.5px] leading-relaxed">
        <div className="flex items-start justify-between gap-2">
          <b className="text-[13px] font-semibold">{shown.label}</b>
          <button type="button" className="text-[12px] text-muted-foreground" onClick={() => setInfo(null)}>
            ปิด
          </button>
        </div>
        <p className="mt-1">
          <span className="text-muted-foreground">เหมาะกับ: </span>
          {detail.who}
        </p>
        <ul className="mt-1 list-disc pl-5">
          {detail.does.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </div>
    )}
    </>
  );
}

/** รหัสชั่วคราวพร้อมปุ่มสุ่มใหม่ */
export function PassBox({ pass, onNew }: { pass: string; onNew: () => void }) {
  return (
    <span className="flex items-center gap-2">
      <span className="num flex h-9 flex-1 items-center rounded-[10px] border border-border bg-muted/60 px-3 text-[14px] font-bold tracking-wide">
        {pass}
      </span>
      <button type="button" className="btn glass-thin btn-mini" onClick={onNew}>
        สุ่มใหม่
      </button>
    </span>
  );
}

/** หลังบันทึก — แสดงชื่อผู้ใช้และรหัสชั่วคราวให้ฝ่ายบุคคลส่งต่อ (ต้นแบบ kVeil) */
export function CredentialsDialog({
  title,
  name,
  user,
  pass,
  onClose,
}: {
  title: string;
  name: string;
  user: string;
  pass: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    const txt = `ชื่อผู้ใช้: ${user}\nรหัสผ่าน: ${pass}`;
    navigator.clipboard?.writeText(txt).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={copy}>
            {copied ? "คัดลอกแล้ว" : "คัดลอก"}
          </button>
          <button type="button" className="btn solid btn-solid" onClick={onClose}>
            เสร็จ
          </button>
        </>
      }
    >
      <p className="mb-3.5 text-[14px] font-semibold">{name}</p>
      <dl className="grid grid-cols-[150px_1fr] items-center gap-x-4 gap-y-2.5 text-[13.5px]">
        <dt className="text-[12.5px] font-semibold text-muted-foreground">ชื่อผู้ใช้</dt>
        <dd className="num font-bold">{user}</dd>
        <dt className="text-[12.5px] font-semibold text-muted-foreground">รหัสผ่านชั่วคราว</dt>
        <dd>
          <span className="num inline-block rounded-[9px] border border-border bg-muted/60 px-3 py-1 text-[14px] font-bold tracking-wide">
            {pass}
          </span>
        </dd>
      </dl>
    </Sheet>
  );
}
