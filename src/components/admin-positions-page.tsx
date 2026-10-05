"use client";

/*
 * ตำแหน่งและสายอนุมัติ (Full Proposal · M5) — หน้าตาตามต้นแบบ "ตั้งค่าระบบ — ERP MAZ.html" (HR-11)
 *
 *   การ์ดพับได้รายแผนก ข้างในเป็นตารางตำแหน่ง: ชื่อ · ผู้อนุมัติ ลา/โอที/เบิก · สวิตช์เปิดใช้ · แก้/ลบ
 *   ตำแหน่งสังกัดแผนก — เพิ่ม แก้ชื่อ ย้ายแผนก · ตำแหน่งที่มีพนักงานอยู่ลบไม่ได้ (ปิดใช้งานแทน)
 *   เลือกผู้อนุมัติ ลา โอที เบิกค่าใช้จ่าย ต่อตำแหน่งในกล่องแก้ไข — ไม่ตั้ง = ใช้สายตามบทบาท (แท็บสายอนุมัติ ?t=approval)
 *   ผู้อนุมัติอนุมัติคำขอของตนเองไม่ได้ — ตำแหน่งของผู้อนุมัติเองจึงเลือกตัวเองไม่ได้
 *
 * เก็บสองหมวด: catalog (ตำแหน่งและแผนก) และ posRoute (สายอนุมัติรายตำแหน่ง)
 * บันทึกทีเดียวทั้งสองหมวด เพราะผู้ใช้มองว่าเป็นหน้าเดียว
 */

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DualRolePane, MenuAccessPane, RoutePane } from "./admin-roles-page";
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
import { Input2, SaveBar, Switch, inputCls, useSectionDraft } from "./admin-ui";
import { ChevronDownIcon, PencilIcon, PlusIcon, TrashIcon } from "./icons";
import { Sheet } from "./lead-dialogs";

const KINDS: { key: RequestKind; label: string }[] = [
  { key: "leave", label: "ลา" },
  { key: "ot", label: "โอที" },
  { key: "expense", label: "เบิกค่าใช้จ่าย" },
];

const APPROVER_KEYS: ApproverKey[] = ["pm", "acc", "hr", "gm", "exec"];

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
const POS_TABS = [
  { key: "positions", label: "ตำแหน่ง" },
  { key: "approval", label: "สายอนุมัติ" },
  { key: "menu", label: "เมนูที่ใช้ได้" },
  { key: "accounts", label: "บทบาทของบัญชีผู้ใช้" },
] as const;
type PosTab = (typeof POS_TABS)[number]["key"];

export function AdminPositionsPage() {
  const q = useSearchParams();
  const here = usePathname();
  const router = useRouter();
  const tab: PosTab = POS_TABS.find((x) => x.key === q.get("t"))?.key ?? "positions";

  function go(t: PosTab) {
    const next = new URLSearchParams(q.toString());
    next.set("s", "positions");
    if (t === "positions") next.delete("t");
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

  if (tab === "positions") return <PositionsPane tabs={tabs} />;
  return (
    <div className="space-y-4">
      <h1 className="sr-only">ตำแหน่งและสายอนุมัติ</h1>
      <section className="panel glass flex flex-col">
        <div className="strip">{tabs}</div>
        {tab === "approval" ? <RoutePane /> : tab === "menu" ? <MenuAccessPane /> : <DualRolePane />}
      </section>
    </div>
  );
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
  /* แผนกที่พับไว้ — ต้นแบบกางทุกแผนกเป็นค่าตั้งต้น */
  const [shut, setShut] = useState<string[]>([]);

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

  return (
    <div className="space-y-4">
      <h1 className="sr-only">ตำแหน่งและสายอนุมัติ</h1>
      {/* แถบแท็บ + ปุ่มเพิ่มตำแหน่งอยู่แถวเดียวกัน (เดิมปุ่มอยู่แถวเครื่องมือของ AdminHead · ผู้ใช้สั่ง 5 ต.ค. 2569) */}
      <section className="panel glass">
        <div className="strip">
          {tabs}
          <button
            type="button"
            className="btn solid btn-solid my-1.5"
            onClick={() => setEditing("")}
          >
            <PlusIcon className="size-4" strokeWidth={2.4} />
            เพิ่มตำแหน่ง
          </button>
        </div>
      </section>

      {(
        <div className="grid gap-3">
          {depts.map((dp) => {
            const inDept = list.filter((p) => p.dept === dp.v);
            const open = !shut.includes(dp.v);
            return (
              <section key={dp.v} className="glass overflow-hidden rounded-[16px]">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setShut((v) => (open ? [...v, dp.v] : v.filter((x) => x !== dp.v)))}
                  className="flex w-full items-center gap-2.5 px-5 py-4 text-left hover:bg-muted/40"
                >
                  <span className="size-2.5 flex-none rounded-full bg-primary" />
                  <b className="text-[15px] font-bold">{dp.label}</b>
                  <span className="text-[13px] text-muted-foreground">({inDept.length} ตำแหน่ง)</span>
                  <ChevronDownIcon
                    className={`ml-auto size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                    strokeWidth={2.2}
                  />
                </button>

                {open && (
                  <div className="border-t border-border px-5 pt-3 pb-4">
                    {inDept.length === 0 ? (
                      <p className="py-5 text-center text-[13px] text-muted-foreground">แผนกนี้ยังไม่มีตำแหน่ง</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-[minmax(0,1.5fr)_84px_84px_104px_58px_84px] items-center gap-2 pb-1.5 text-[11.5px] font-bold text-muted-foreground max-md:hidden">
                          <span>ตำแหน่ง</span>
                          <span className="text-center">ลา</span>
                          <span className="text-center">โอที</span>
                          <span className="text-center">เบิกค่าใช้จ่าย</span>
                          <span className="text-center">เปิดใช้</span>
                          <span />
                        </div>
                        {inDept.map((p) => {
                          const off = isOff(p);
                          const n = hr.emp.filter((e) => holdsPos(e, p.v)).length;
                          const why = blockOf(p.v);
                          return (
                            <div
                              key={p.v}
                              className="grid grid-cols-[minmax(0,1fr)_58px_84px] items-center gap-2 border-b border-border py-2.5 last:border-b-0 md:grid-cols-[minmax(0,1.5fr)_84px_84px_104px_58px_84px]"
                            >
                              <div className="min-w-0">
                                <b
                                  className={`block text-[13.5px] ${
                                    off ? "font-medium text-muted-foreground" : "font-semibold"
                                  }`}
                                >
                                  {p.label}
                                  {off && (
                                    <em className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground not-italic">
                                      ปิดใช้งาน
                                    </em>
                                  )}
                                </b>
                                <small className="block text-[11.5px] text-muted-foreground">
                                  {n ? `พนักงานอยู่ ${n} คน` : "ยังไม่มีพนักงาน"}
                                </small>
                                {/* จอแคบไม่มีคอลัมน์ป้าย เอาสายอนุมัติมาไว้ใต้ชื่อแทน */}
                                <small className="mt-0.5 block text-[11.5px] text-muted-foreground md:hidden">
                                  ลา {apprShort(route.draft, byRole, p.v, "leave")} · โอที {apprShort(route.draft, byRole, p.v, "ot")} ·
                                  เบิก {apprShort(route.draft, byRole, p.v, "expense")}
                                </small>
                              </div>
                              {KINDS.map((k) => (
                                <span key={k.key} className="text-center max-md:hidden">
                                  <ApprChip who={apprShort(route.draft, byRole, p.v, k.key)} dim={off} />
                                </span>
                              ))}
                              <span className="flex justify-center">
                                <Switch
                                  on={!off}
                                  onToggle={() => togglePos(p.v)}
                                  label={`เปิดหรือปิดใช้งานตำแหน่ง ${p.label}`}
                                />
                              </span>
                              <span className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  aria-label={`แก้ไข ${p.label}`}
                                  className="btn glass-thin btn-mini"
                                  onClick={() => setEditing(p.v)}
                                >
                                  <PencilIcon className="size-4" strokeWidth={2.2} />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`ลบ ${p.label}`}
                                  title={why}
                                  disabled={Boolean(why)}
                                  className="btn glass-thin btn-mini disabled:opacity-40"
                                  onClick={() => removePos(p.v)}
                                >
                                  <TrashIcon className="size-4" strokeWidth={2.2} />
                                </button>
                              </span>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

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
  const bad = !label.trim() ? "ใส่ชื่อแผนก" : "";
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
            disabled={Boolean(bad)}
            onClick={() => onSave(label)}
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
  const [appr, setAppr] = useState<Partial<Record<RequestKind, string>>>(route);
  const bad = !label.trim() ? "ใส่ชื่อตำแหน่ง" : "";
  const pos = initial?.v ?? "";

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
            disabled={Boolean(bad)}
            onClick={() => onSave(label, dept, appr)}
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
                <option value="">ตามบทบาท</option>
                {APPROVER_KEYS.filter((a) => !pos || !isSelf(a, pos)).map((a) => (
                  <option key={a} value={a}>
                    {names[a].name} · {names[a].title}
                  </option>
                ))}
              </select>
            </Input2>
          ))}
        </div>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          ไม่เลือก = ใช้สายอนุมัติตามบทบาทในแท็บสายอนุมัติ · ผู้อนุมัติอนุมัติคำขอของตนเองไม่ได้ จึงไม่ขึ้นให้เลือกในตำแหน่งของตัวเอง
          {pos && rolesOfPos(pos).length > 0 && ` · ตำแหน่งนี้เข้าระบบด้วยบทบาท ${rolesOfPos(pos).map(roleLabel).join(" · ")}`}
        </p>
      </div>
    </Sheet>
  );
}
