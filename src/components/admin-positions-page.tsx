"use client";

/*
 * ตำแหน่งและสายอนุมัติ (Full Proposal · M5) — หน้าตาตามต้นแบบ "ตั้งค่าระบบ — ERP MAZ.html" (HR-11)
 *
 *   ตารางเดียวแบบแท็บแผนก เรียงตามแผนก: ชื่อ · แผนก · ผู้อนุมัติ ลา/โอที/เบิก · สวิตช์เปิดใช้ · แก้/ลบ (ผู้ใช้สั่ง 12 ต.ค. 2569)
 *   ตำแหน่งสังกัดแผนก — เพิ่ม แก้ชื่อ ย้ายแผนก · ตำแหน่งที่มีพนักงานอยู่ลบไม่ได้ (ปิดใช้งานแทน)
 *   เลือกผู้อนุมัติ ลา โอที เบิกค่าใช้จ่าย ต่อตำแหน่งในกล่องแก้ไข — ไม่ตั้ง = ใช้สายตั้งต้นของบทบาท (แท็บสายอนุมัติเอาออกแล้ว ผู้ใช้สั่ง 6 ต.ค. 2569)
 *   ผู้อนุมัติอนุมัติคำขอของตนเองไม่ได้ — ตำแหน่งของผู้อนุมัติเองจึงเลือกตัวเองไม่ได้
 *
 * เก็บสองหมวด: catalog (ตำแหน่งและแผนก) และ posRoute (สายอนุมัติรายตำแหน่ง)
 * บันทึกทีเดียวทั้งสองหมวด เพราะผู้ใช้มองว่าเป็นหน้าเดียว
 */

import { nameOf } from "@/lib/emp-name";
import { AdminOptionsPage } from "./admin-options-page";
import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Catalog, PosRoute } from "@/lib/system-settings";
import { BUILTIN_HR_DEPT, BUILTIN_HR_POSITION, holdsPos, hrDept, hrPos } from "@/lib/hr-data";
import { merged } from "@/lib/catalog";
import { useHr } from "@/lib/hr-store";
import {
  approvers,
  personOfRole,
  positionOfRole,
  ROLES,
  roleLabel,
  useApprovalRoute,
  type ApprovalRoute,
  type ApproverKey,
  type RequestKind,
  type Role,
} from "@/lib/role";
import { AdminHead, IconBtn, Input2, SaveBar, Switch, inputCls, thCls, trCls, useSectionDraft } from "./admin-ui";
import { PencilIcon, PlusIcon, TrashIcon } from "./icons";
import { Sheet } from "./lead-dialogs";

const KINDS: { key: RequestKind; label: string }[] = [
  { key: "leave", label: "ลา" },
  { key: "ot", label: "โอที" },
  { key: "expense", label: "เบิกค่าใช้จ่าย" },
];

const APPROVER_KEYS: ApproverKey[] = ["pm", "acc", "hr", "gm", "exec"];
/** ผู้อนุมัติที่เลือกได้ในกล่องแก้ตำแหน่ง — GM กับ CEO เท่านั้น (ผู้ใช้สั่ง 6 ต.ค. 2569) */
const APPROVER_CHOICES: ApproverKey[] = ["gm", "exec"];

/** ชื่อสั้นของผู้อนุมัติที่ใช้บนป้ายในตาราง (ต้นแบบใช้ GM / CEO / HR) */
const APPR_SHORT: Record<ApproverKey, string> = {
  pm: "PM",
  acc: "บัญชี",
  hr: "HR",
  gm: "GM",
  exec: "CEO",
};

/** บทบาทที่นั่งอยู่ในตำแหน่งนี้ — ใช้กันไม่ให้ตั้งผู้อนุมัติเป็นตัวเอง */
function rolesOfPos(pos: string): Role[] {
  return ROLES.map((r) => r.key).filter((r) => positionOfRole(r) === pos);
}

/** ผู้อนุมัติรายนี้เป็นคนเดียวกับคนในตำแหน่งนี้หรือไม่ */
function isSelf(key: ApproverKey, pos: string) {
  const role = approvers()[key].role;
  if (!role) return false;
  return rolesOfPos(pos).some((r) => personOfRole(r) === personOfRole(role));
}

/** ปิดใช้งานอยู่ไหม — ตำแหน่งตั้งต้นไม่มีคีย์นี้ */
function isOff(p: { v: string; label: string; dept: string; off?: boolean }) {
  return Boolean(p.off);
}

function describePos(a: Catalog, b: Catalog) {
  const was = a.positions ?? [];
  const now = b.positions ?? [];
  const out: string[] = [];
  for (const p of now) {
    const old = was.find((x) => x.v === p.v);
    if (!old) out.push(`เพิ่มตำแหน่ง ${p.label}`);
    else if (old.label !== p.label || old.dept !== p.dept)
      out.push(`แก้ตำแหน่ง ${old.label} → ${p.label} (${hrDept(p.dept).label})`);
    else if (isOff(old) !== isOff(p)) out.push(`${isOff(p) ? "ปิด" : "เปิด"}ใช้งานตำแหน่ง ${p.label}`);
  }
  for (const p of was) if (!now.some((x) => x.v === p.v)) out.push(`ลบตำแหน่ง ${p.label}`);

  const wasD = a.depts ?? [];
  const nowD = b.depts ?? [];
  for (const d of nowD) {
    const old = wasD.find((x) => x.v === d.v);
    if (!old) out.push(`เพิ่มแผนก ${d.label}`);
    else if (old.label !== d.label) out.push(`แก้แผนก ${old.label} → ${d.label}`);
  }
  for (const d of wasD) if (!nowD.some((x) => x.v === d.v)) out.push(`ลบแผนก ${d.label}`);
  return out;
}

function describeRoute(a: PosRoute, b: PosRoute) {
  const out: string[] = [];
  const names = approvers();
  const text = (v: string) => (v ? names[v as ApproverKey].name : "ตามบทบาท");
  for (const pos of [...new Set([...Object.keys(a), ...Object.keys(b)])]) {
    for (const k of KINDS) {
      const was = a[pos]?.[k.key] ?? "";
      const now = b[pos]?.[k.key] ?? "";
      if (was !== now) out.push(`${hrPos(pos).label} · ${k.label} ${text(was)} → ${text(now)}`);
    }
  }
  return out;
}

/*
 * ผู้อนุมัติที่ใช้จริงของตำแหน่งนี้แบบสั้น
 * ตั้งไว้รายตำแหน่ง = ใช้อันนั้น · ไม่ได้ตั้ง = ตกไปที่สายตามบทบาทของคนที่นั่งตำแหน่งนี้
 * ตำแหน่งที่ยังไม่มีบทบาทเข้าระบบ บอกว่า "ตามบทบาท" ไปก่อน
 */
function apprShort(route: PosRoute, byRole: ApprovalRoute, pos: string, kind: RequestKind) {
  const own = route[pos]?.[kind];
  if (own) return APPR_SHORT[own as ApproverKey] ?? own;
  const role = rolesOfPos(pos)[0];
  return role ? APPR_SHORT[byRole[kind][role]] : "ตามบทบาท";
}

/** ป้ายผู้อนุมัติในตาราง — GM น้ำเงิน · CEO ส้ม · ที่เหลือเขียว (ตามต้นแบบ) */
function ApprChip({ who, dim }: { who: string; dim?: boolean }) {
  const tone =
    who === "GM"
      ? "bg-[#E7ECF7] text-[#1A3E8C]"
      : who === "CEO"
        ? "bg-[var(--warning-soft)] text-[var(--warning)]"
        : who === "ตามบทบาท"
          ? "bg-muted text-muted-foreground"
          : "bg-[#E7F5EE] text-[#14875A]";
  return (
    <span
      className={`inline-flex justify-center rounded-full px-2.5 py-1 text-[12px] font-semibold ${tone} ${
        dim ? "opacity-55" : ""
      }`}
    >
      {who}
    </span>
  );
}

/*
 * แท็บของหัวข้อนี้ — รวมหน้าบทบาทและสิทธิ์ (/admin/roles) เข้ามาไว้ที่เดียว (ผู้ใช้สั่ง 5 ต.ค. 2569)
 *   ตำแหน่ง       — สายอนุมัติรายตำแหน่ง (ตั้งในกล่องแก้ตำแหน่ง) มาก่อนเสมอ
 *   สายอนุมัติ     — ค่าตั้งต้นรายบทบาท ใช้เมื่อตำแหน่งไม่ได้ตั้งของตัวเอง + ชื่อผู้อนุมัติ
 *   เมนูที่ใช้ได้ · บทบาทของบัญชีผู้ใช้ — ยกมาจากหน้าบทบาทและสิทธิ์เดิมทั้งก้อน
 * แท็บที่เปิดอยู่อยู่ใน ?t= (ไม่มี = ตำแหน่ง) ลิงก์ตรงเข้าแท็บได้ · หน้าที่เรียกต้องมี Suspense คร่อม (page.tsx มีแล้ว)
 */
/* แผนกอยู่แท็บแรก ย้ายมาจากข้อมูลหลัก (ผู้ใช้สั่ง 6 ต.ค. 2569) */
const POS_TABS = [
  { key: "depts", label: "แผนก" },
  { key: "positions", label: "ตำแหน่ง" },
] as const;
type PosTab = (typeof POS_TABS)[number]["key"];

/** ตารางตำแหน่งอย่างเดียว ไม่มีแถบแท็บของตัวเอง — แท็บของตั้งค่าระบบแยกแผนกกับตำแหน่งแล้ว (ผู้ใช้สั่ง 13 ต.ค. 2569) */
export function AdminPositionsPane() {
  return <PositionsPane tabs={null} />;
}

export function AdminPositionsPage() {
  const q = useSearchParams();
  const here = usePathname();
  const router = useRouter();
  const tab: PosTab = POS_TABS.find((x) => x.key === q.get("t"))?.key ?? "depts";

  function go(t: PosTab) {
    const next = new URLSearchParams(q.toString());
    next.set("s", "positions");
    if (t === "depts") next.delete("t");
    else next.set("t", t);
    router.replace(`${here}?${next.toString()}`, { scroll: false });
  }

  const tabs = (
    <div className="tabs wrap" role="tablist" aria-label="ตำแหน่งและสายอนุมัติ">
      {POS_TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={tab === t.key}
          className={tab === t.key ? "on" : ""}
          onClick={() => go(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  if (tab === "depts") return <AdminOptionsPage only="depts" topTabs={tabs} />;
  /* แท็บเมนูที่ใช้ได้เอาออก — เมนูกำหนดจาก "งานที่รับผิดชอบ" ของบัญชีแล้ว (ผู้ใช้สั่ง 6 ต.ค. 2569) */
  return <PositionsPane tabs={tabs} />;
}

function PositionsPane({ tabs }: { tabs: ReactNode }) {
  const cat = useSectionDraft("catalog", "ตำแหน่งและสายอนุมัติ", describePos);
  const route = useSectionDraft("posRoute", "ตำแหน่งและสายอนุมัติ", describeRoute);
  const hr = useHr();
  /* สายอนุมัติรายบทบาท — ใช้เป็นค่าที่ตกไปถึงเมื่อตำแหน่งไม่ได้ตั้งของตัวเอง */
  const byRole = useApprovalRoute();
  /* กล่องเพิ่ม/แก้ตำแหน่ง — null = ปิด · "" = เพิ่มใหม่ · รหัสตำแหน่ง = แก้ */
  const [editing, setEditing] = useState<string | null>(null);
  const [deptEditing, setDeptEditing] = useState<{ v: string; label: string } | null>(null);

  /* ตำแหน่งและแผนกต้องมาจากร่าง ไม่ใช่ค่าที่บันทึกแล้ว — ไม่งั้นที่เพิ่ม/ลบไว้จะยังไม่ขึ้นก่อนกดบันทึก */
  const list = merged(cat.draft.positions, BUILTIN_HR_POSITION, (p) => p.v);
  const depts = merged(cat.draft.depts, BUILTIN_HR_DEPT, (d) => d.v);
  const names = approvers();

  function savePos(prev: string, label: string, dept: string) {
    const v = prev || label.trim().toLowerCase().replace(/\s+/g, "_");
    const next = prev
      ? list.map((p) => (p.v === prev ? { ...p, label: label.trim(), dept } : p))
      : [...list, { v, label: label.trim(), dept }];
    cat.setDraft({ ...cat.draft, positions: next });
    setEditing(null);
  }

  function removePos(v: string) {
    cat.setDraft({ ...cat.draft, positions: list.filter((p) => p.v !== v) });
  }

  function togglePos(v: string) {
    cat.setDraft({
      ...cat.draft,
      positions: list.map((p) => (p.v === v ? { ...p, off: !isOff(p) } : p)),
    });
  }

  function saveDept(prev: string, label: string) {
    const v = prev || label.trim().toLowerCase().replace(/\s+/g, "_");
    const next = prev
      ? depts.map((d) => (d.v === prev ? { ...d, label: label.trim() } : d))
      : [...depts, { v, label: label.trim() }];
    cat.setDraft({ ...cat.draft, depts: next });
    setDeptEditing(null);
  }

  /* ตั้งผู้อนุมัติของตำแหน่งทีเดียวทั้งสามประเภท — เรียกทีละประเภทจะทับกันเอง (ร่างเดิมค้างใน closure) */
  function setApproversOf(pos: string, appr: Partial<Record<RequestKind, string>>) {
    const cur: Record<string, string> = {};
    for (const k of KINDS) if (appr[k.key]) cur[k.key] = appr[k.key] as string;
    const next = { ...route.draft };
    if (Object.keys(cur).length) next[pos] = cur;
    else delete next[pos];
    route.setDraft(next);
  }

  /* ตำแหน่งที่มีพนักงานอยู่ลบไม่ได้ — ข้อมูลเก่าจะไม่มีชื่อตำแหน่งให้แสดง ให้ปิดใช้งานแทน */
  const blockOf = (v: string) => {
    if (BUILTIN_HR_POSITION.some((p) => p.v === v)) return "ตำแหน่งตั้งต้นของระบบ ลบไม่ได้ — ปิดใช้งานแทน";
    if (hr.emp.some((e) => holdsPos(e, v))) return "ยังมีพนักงานในตำแหน่งนี้ — ปิดใช้งานแทน";
    return "";
  };

  const cur = editing ? list.find((p) => p.v === editing) : undefined;

  /* ตารางเดียว เรียงตามลำดับแผนกก่อน แล้วตามลำดับตำแหน่งในแผนก — แผนกที่หาไม่เจอไว้ท้าย (ผู้ใช้สั่ง 12 ต.ค. 2569) */
  const deptIdx = (v: string) => {
    const i = depts.findIndex((d) => d.v === v);
    return i < 0 ? depts.length : i;
  };
  const rows = list
    .map((p, i) => ({ p, i }))
    .sort((a, b) => deptIdx(a.p.dept) - deptIdx(b.p.dept) || a.i - b.i)
    .map((x) => x.p);

  return (
    <div className="space-y-4">
      {/* หัวหน้าแบบเดียวกับแท็บแผนก: ชื่อแท็บซ้าย ปุ่มเพิ่มขวา (ผู้ใช้สั่ง 12 ต.ค. 2569) */}
      <AdminHead title="ตำแหน่ง" desc="เพิ่ม แก้ชื่อ ย้ายแผนก ตั้งผู้อนุมัติ และปิดใช้งานตำแหน่ง">
        <button type="button" className="btn solid btn-solid" onClick={() => setEditing("")}>
          <PlusIcon className="size-4" strokeWidth={2.4} />
          เพิ่มตำแหน่ง
        </button>
      </AdminHead>

      {/* การ์ดเดียว: แถบแท็บ + ตารางเดียวเรียงตามแผนก แทนการ์ดพับรายแผนก (ผู้ใช้สั่ง 12 ต.ค. 2569) */}
      <section className="glass overflow-hidden rounded-[18px]">
        {tabs && <div className="border-b border-border px-3">{tabs}</div>}

        <div className="px-4 pt-3.5 pb-4 sm:px-5">
          <div className={`grid grid-cols-[minmax(0,1fr)_58px_84px] md:grid-cols-[28px_minmax(0,1.4fr)_minmax(0,1fr)_72px_72px_96px_58px_84px] ${thCls}`}>
            <span className="text-center max-md:hidden">#</span>
            <span>ชื่อตำแหน่ง</span>
            <span className="max-md:hidden">แผนก</span>
            {KINDS.map((k) => (
              <span key={k.key} className="text-center max-md:hidden">
                {k.label}
              </span>
            ))}
            <span className="text-center">เปิดใช้</span>
            <span />
          </div>

          {rows.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted-foreground">ยังไม่มีตำแหน่ง</p>
          ) : (
            rows.map((p, i) => {
              const off = isOff(p);
              const n = hr.emp.filter((e) => holdsPos(e, p.v)).length;
              const why = blockOf(p.v);
              const deptName = depts.find((d) => d.v === p.dept)?.label ?? hrDept(p.dept).label;
              return (
                <div
                  key={p.v}
                  className={`grid grid-cols-[minmax(0,1fr)_58px_84px] md:grid-cols-[28px_minmax(0,1.4fr)_minmax(0,1fr)_72px_72px_96px_58px_84px] ${trCls} ${off ? "opacity-50" : ""}`}
                >
                  <span className="num text-center text-[12px] text-muted-foreground max-md:hidden">{i + 1}</span>
                  <span className="min-w-0">
                    {/* ปิดใช้แล้วจางทั้งแถว ไม่มีป้าย (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
                    <b className="block truncate text-[13.5px] font-semibold">{p.label}</b>
                    {/* จอแคบไม่มีคอลัมน์แผนกและป้าย เอามาไว้ใต้ชื่อแทน */}
                    <small className="mt-0.5 block text-[11.5px] text-muted-foreground md:hidden">
                      {deptName} · ลา {apprShort(route.draft, byRole, p.v, "leave")} · โอที{" "}
                      {apprShort(route.draft, byRole, p.v, "ot")} · เบิก {apprShort(route.draft, byRole, p.v, "expense")}
                    </small>
                  </span>
                  <span className="truncate text-[13px] max-md:hidden">{deptName}</span>
                  {KINDS.map((k) => (
                    <span key={k.key} className="text-center max-md:hidden">
                      <ApprChip who={apprShort(route.draft, byRole, p.v, k.key)} />
                    </span>
                  ))}
                  <span className="flex justify-center">
                    <Switch on={!off} onToggle={() => togglePos(p.v)} label={`เปิดหรือปิดใช้งานตำแหน่ง ${p.label}`} />
                  </span>
                  <span className="flex justify-end gap-1.5">
                    <IconBtn label={`แก้ไข ${p.label}`} title="แก้ไข" onClick={() => setEditing(p.v)}>
                      <PencilIcon className="size-3.5" strokeWidth={1.9} />
                    </IconBtn>
                    {/* ลบไม่ได้ก็ไม่ต้องมีปุ่มลบ (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
                    {!why && (
                      <IconBtn label={`ลบ ${p.label}`} title="ลบ" danger onClick={() => removePos(p.v)}>
                        <TrashIcon className="size-3.5" strokeWidth={1.9} />
                      </IconBtn>
                    )}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>

      <SaveBar
        dirty={cat.dirty || route.dirty}
        isDefault={!(cat.saved.positions?.length ?? 0) && !Object.keys(route.saved).length}
        onSave={() => {
          if (cat.dirty) cat.save();
          if (route.dirty) route.save();
        }}
        onCancel={() => {
          cat.cancel();
          route.cancel();
        }}
        onDefault={() => {
          cat.setDraft({ ...cat.draft, positions: [], depts: [] });
          route.toDefault();
        }}
      />

      {deptEditing && (
        <DeptSheet
          initial={deptEditing.v ? deptEditing : undefined}
          onClose={() => setDeptEditing(null)}
          onSave={(label) => saveDept(deptEditing.v, label)}
        />
      )}

      {editing !== null && (
        <PosSheet
          initial={cur}
          depts={depts}
          names={names}
          route={route.draft[editing] ?? {}}
          onClose={() => setEditing(null)}
          onSave={(label, dept, appr) => {
            const v = editing || label.trim().toLowerCase().replace(/\s+/g, "_");
            savePos(editing, label, dept);
            setApproversOf(v, appr);
          }}
        />
      )}
    </div>
  );
}

function DeptSheet({
  initial,
  onClose,
  onSave,
}: {
  initial?: { v: string; label: string };
  onClose: () => void;
  onSave: (label: string) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  /* ขึ้นเตือนเฉพาะหลังกดบันทึกตอนยังไม่กรอก (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  const [tried, setTried] = useState(false);
  const bad = tried && !label.trim() ? "ใส่ชื่อแผนก" : "";
  return (
    <Sheet
      title={initial ? "แก้แผนก" : "เพิ่มแผนก"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid disabled:opacity-45"
            onClick={() => (label.trim() ? onSave(label) : setTried(true))}
          >
            บันทึก
          </button>
        </>
      }
    >
      <Input2 label="ชื่อแผนก" error={bad}>
        <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} />
      </Input2>
    </Sheet>
  );
}

function PosSheet({
  initial,
  depts,
  names,
  route,
  onClose,
  onSave,
}: {
  initial?: { v: string; label: string; dept: string };
  depts: { v: string; label: string }[];
  names: ReturnType<typeof approvers>;
  route: Partial<Record<RequestKind, string>>;
  onClose: () => void;
  onSave: (label: string, dept: string, appr: Partial<Record<RequestKind, string>>) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [dept, setDept] = useState(initial?.dept ?? depts[0]?.v ?? "");
  const pos = initial?.v ?? "";
  /* ผู้อนุมัติเลือกได้แค่ GM กับ CEO (ผู้ใช้สั่ง 6 ต.ค. 2569) — อนุมัติคำขอของตนเองไม่ได้ จึงตัดตำแหน่งของตัวเองออก
     ค่าเดิมที่ไม่ใช่สองตัวนี้ (หรือยังไม่ได้ตั้ง) ตั้งต้นเป็นตัวแรกที่เลือกได้ */
  const choices = APPROVER_CHOICES.filter((a) => !pos || !isSelf(a, pos));
  const [appr, setAppr] = useState<Partial<Record<RequestKind, string>>>(() =>
    Object.fromEntries(
      KINDS.map((k) => [k.key, choices.includes(route[k.key] as ApproverKey) ? route[k.key] : choices[0]]),
    ),
  );
  /* ขึ้นเตือนเฉพาะหลังกดบันทึกตอนยังไม่กรอก (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  const [tried, setTried] = useState(false);
  const bad = tried && !label.trim() ? "ใส่ชื่อตำแหน่ง" : "";

  return (
    <Sheet
      title={initial ? "แก้ตำแหน่ง" : "เพิ่มตำแหน่ง"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid disabled:opacity-45"
            onClick={() => (label.trim() ? onSave(label, dept, appr) : setTried(true))}
          >
            บันทึก
          </button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input2 label="ชื่อตำแหน่ง" error={bad}>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} />
          </Input2>
          <Input2 label="แผนก">
            <select value={dept} onChange={(e) => setDept(e.target.value)} className={inputCls}>
              {depts.map((d) => (
                <option key={d.v} value={d.v}>
                  {d.label}
                </option>
              ))}
            </select>
          </Input2>
        </div>

        <p className="mt-1 text-[12.5px] font-bold text-muted-foreground">ผู้อนุมัติของคำขอแต่ละประเภท</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {KINDS.map((k) => (
            <Input2 key={k.key} label={k.label}>
              <select
                value={appr[k.key] ?? ""}
                aria-label={`ผู้อนุมัติ${k.label}ของตำแหน่ง ${label || "ใหม่"}`}
                onChange={(e) => setAppr((v) => ({ ...v, [k.key]: e.target.value }))}
                className={inputCls}
              >
                {choices.map((a) => (
                  <option key={a} value={a}>
                    {nameOf(names[a].name)} ({names[a].title})
                  </option>
                ))}
              </select>
            </Input2>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
