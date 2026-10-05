"use client";

/*
 * บทบาทและสิทธิ์ — ผู้ดูแลระบบควบคุมการทำงานของแต่ละบทบาท
 *
 * ย้ายไปเป็นแท็บในหัวข้อ "ตำแหน่งและสายอนุมัติ" ของตั้งค่าระบบแล้ว (ผู้ใช้สั่ง 5 ต.ค. 2569)
 * ไฟล์นี้เหลือแค่เนื้อของแต่ละแท็บ — หน้าที่ประกอบแท็บคือ admin-positions-page.tsx
 * /admin/roles เดิมพาไป /admin/settings?s=positions&t=menu
 *
 *   เมนูที่ใช้ได้ — เปิด/ปิดหน้าของแต่ละบทบาท ปิดแล้วเมนูหาย เปิดตรงก็เข้าไม่ได้ กระดิ่งไม่เตือนเรื่องของหน้านั้น
 *   สายอนุมัติ   — ใบลา โอที ใบเบิก ของแต่ละบทบาทส่งไปให้ใครอนุมัติ
 *
 * เมนู "รายการรออนุมัติ" ไม่อยู่ในสวิตช์ เพราะโผล่เองกับบทบาทที่เป็นผู้อนุมัติตามสาย (nav.ts)
 * บทบาทผู้ดูแลระบบแก้ตัวเองไม่ได้ กันผู้ดูแลปิดหน้านี้แล้วกลับเข้ามาไม่ได้
 */

import { useEffect, useState } from "react";
import {
  configurableItems,
  resetMenuAccess,
  setMenuOpen,
  useMenuAccess,
  type NavItem,
} from "@/lib/nav";
import {
  approvers,
  DEFAULT_ROUTE,
  NO_REQUESTS,
  ROLES,
  approvesFor,
  canRoute,
  resetApprovalRoute,
  roleLabel,
  setApprover,
  useApprovalRoute,
  type ApproverKey,
  type RequestKind,
  type Role,
} from "@/lib/role";
import { logChange } from "@/lib/admin-log";
import { useAllLeave } from "@/lib/leave-store";
import { useAllOt } from "@/lib/ot-store";
import { useAllClaims } from "@/lib/expense-store";
import { HR_MAX_ROLES, accountRoles, hrPos } from "@/lib/hr-data";
import { setAccountRoles, useHr } from "@/lib/hr-store";
import { ConfirmDialog } from "./confirm-dialog";
import { PencilIcon } from "./icons";
import { Sheet } from "./lead-dialogs";
import { saveSection, settings } from "@/lib/system-settings";

/* แท็บเมนูตั้งค่าบทบาทผู้ดูแลระบบไม่ได้ — เมนูของผู้ดูแลระบบเปิดครบเสมอ (navItems) */
const EDITABLE = ROLES;
/*
 * บทบาทที่ยกให้บัญชีผู้ใช้ได้ — ไม่รวมผู้บริหารและผู้ดูแลระบบ (เจ้าของสั่ง 24 ก.ย. 2569)
 * สองบทบาทนี้ไม่ใช่สิทธิ์ที่แจกให้พนักงานคนไหนก็ได้จากหน้านี้
 * ผู้ดูแลระบบเป็นของฝ่ายบุคคล และผู้บริหารเป็นตัวสำรองตาม BR-09 กำหนดไว้ในระบบแล้ว
 */
const ACCOUNT_ROLES = ROLES.filter((r) => r.key !== "ceo");
/* สายอนุมัติตั้งได้เฉพาะบทบาทที่ยื่นคำขอ — ผู้บริหารไม่มีเมนู "ของฉัน" */
const ROUTE_ROLES = EDITABLE.filter((r) => !NO_REQUESTS.includes(r.key));

const KIND_LABEL: Record<RequestKind, string> = {
  leave: "ใบลา",
  ot: "โอที",
  expense: "ใบเบิกค่าใช้จ่าย",
};

// ─── เมนูที่ใช้ได้ ────────────────────────────────────────────────

export function MenuAccessPane() {
  const access = useMenuAccess();
  const route = useApprovalRoute();
  const [role, setRole] = useState<Role>("sales");
  const [resetting, setResetting] = useState(false);

  const items = configurableItems(role);
  const hidden = new Set(access[role] ?? []);
  const openCount = items.filter((i) => !hidden.has(i.href)).length;
  const groups = [...new Set(items.map((i) => i.group))];
  const approves = approvesFor(role, route).length > 0;

  return (
    <div className="grid gap-0 md:grid-cols-[240px_minmax(0,1fr)]">
      {/* รายชื่อบทบาท */}
      {/* จอแคบวางสองช่องต่อแถว เห็นบทบาททั้งหมดโดยไม่ต้องเลื่อนซ้ายขวา (เจ้าของสั่ง 25 ก.ย. 2569)
          เดิมเป็นแถวเดียวเลื่อนได้ บทบาทท้าย ๆ จึงอยู่นอกจอและไม่มีอะไรบอกว่ามีต่อ */}
      <ul className="grid grid-cols-2 gap-2 border-b border-border p-3 md:flex md:flex-col md:border-r md:border-b-0">
        {EDITABLE.map((r) => {
          const n = configurableItems(r.key).length;
          const off = (access[r.key] ?? []).length;
          const on = r.key === role;
          return (
            <li key={r.key} className="min-w-0">
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setRole(r.key)}
                className={`w-full rounded-[12px] border px-3.5 py-2.5 text-left transition-colors ${
                  on ? "border-primary bg-[var(--accent)]" : "border-transparent hover:bg-muted"
                }`}
              >
                <b className={`block text-[13.5px] font-semibold ${on ? "text-primary" : ""}`}>{r.label}</b>
                <span className="num block text-[12px] text-muted-foreground">
                  {off ? `เปิด ${n - off} จาก ${n} เมนู` : `เปิดครบ ${n} เมนู`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="min-w-0 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold">{roleLabel(role)}</h2>
            <p className="num mt-0.5 text-[12.5px] text-muted-foreground">
              เปิดใช้ {openCount} จาก {items.length} เมนู · ต้องเปิดไว้อย่างน้อย 1 เมนู
            </p>
          </div>
          <button
            type="button"
            className="btn glass-thin btn-mini max-sm:!h-10 max-sm:!px-3.5 max-sm:!text-[13px]"
            disabled={hidden.size === 0}
            onClick={() => setResetting(true)}
          >
            เปิดทั้งหมด
          </button>
        </div>

        {groups.map((g) => (
          <div key={g} className="mt-4">
            <h3 className="mb-1.5 text-[12px] font-semibold tracking-wide text-muted-foreground">{g}</h3>
            <ul className="divide-y divide-border rounded-[14px] border border-border bg-card">
              {items
                .filter((i) => i.group === g)
                .map((i) => (
                  <MenuRow
                    key={i.href}
                    item={i}
                    open={!hidden.has(i.href)}
                    last={openCount === 1 && !hidden.has(i.href)}
                    onToggle={(v) => {
                      setMenuOpen(role, i.href, v);
                      logChange("บทบาทและสิทธิ์", `${v ? "เปิด" : "ปิด"}เมนู ${i.label} ของ${roleLabel(role)}`);
                    }}
                  />
                ))}
            </ul>
          </div>
        ))}

        <p className="mt-4 rounded-[12px] bg-muted/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
          {approves
            ? "มีเมนู \"รายการรออนุมัติ\" ด้วย เพราะบทบาทนี้เป็นผู้อนุมัติตามสายอนุมัติ — เปลี่ยนได้ที่แท็บสายอนุมัติ"
            : "ไม่มีเมนู \"รายการรออนุมัติ\" เพราะบทบาทนี้ไม่ได้เป็นผู้อนุมัติของใคร"}
          {hidden.has("/") && " · ปิดเวลาทำงานไว้ บทบาทนี้จะตอกบัตรเข้า-ออกไม่ได้"}
        </p>
      </div>

      <ConfirmDialog
        open={resetting}
        title={`เปิดเมนูทั้งหมดของ${roleLabel(role)}`}
        description="เมนูที่ปิดไว้จะกลับมาใช้ได้ทั้งหมด"
        confirmLabel="เปิดทั้งหมด"
        onCancel={() => setResetting(false)}
        onConfirm={() => {
          resetMenuAccess(role);
          logChange("บทบาทและสิทธิ์", `เปิดเมนูทั้งหมดของ${roleLabel(role)}`);
          setResetting(false);
        }}
      />
    </div>
  );
}

function MenuRow({
  item,
  open,
  last,
  onToggle,
}: {
  item: NavItem;
  open: boolean;
  last: boolean;
  onToggle: (open: boolean) => void;
}) {
  return (
    <li className="flex items-center gap-3 px-3.5 py-2.5">
      <span className="min-w-0 flex-1">
        <b className={`block text-[13.5px] font-medium ${open ? "" : "text-muted-foreground"}`}>{item.label}</b>
        <span className="num block truncate text-[11.5px] text-muted-foreground">
          {item.sub ? item.sub.map((s) => s.label).join(" · ") : item.href}
        </span>
      </span>
      <Switch
        on={open}
        disabled={last}
        label={`เปิดใช้ ${item.label}`}
        title={last ? "ต้องเปิดไว้อย่างน้อย 1 เมนู" : undefined}
        onToggle={() => onToggle(!open)}
      />
    </li>
  );
}

// ─── สายอนุมัติ ──────────────────────────────────────────────────

/*
 * งานอนุมัติที่ไม่ได้ผ่านตารางสายอนุมัติ — ผู้ยื่นไม่มีบัญชีเข้าระบบ จึงไม่มีแถวในตาราง
 * ถ้าไม่บอกไว้ การ์ดของคนนั้นจะขึ้นว่า "ไม่ได้อนุมัติอะไร" ทั้งที่มีใบรออยู่จริง
 */
const OUTSIDE_ROUTE: Partial<Record<ApproverKey, string>> = {
  hr: "ใบลาของนักศึกษาฝึกงาน (อนุมัติที่แดชบอร์ดฝ่ายบุคคล)",
};

/** คำขอที่ยังไม่ถูกตัดสิน — ใบพวกนี้คือใบที่ย้ายไปหาผู้อนุมัติคนใหม่ทันทีที่เปลี่ยนสาย */
function usePendingCount() {
  const leaves = useAllLeave();
  const ots = useAllOt();
  const claims = useAllClaims();
  /* ตัดสินแล้ว ยกเลิก หรือยังเป็นร่าง = ไม่ได้รออนุมัติ เกณฑ์เดียวกับหน้าอนุมัติ */
  const waiting = (s: string) => s !== "อนุมัติแล้ว" && s !== "ไม่อนุมัติ" && s !== "ยกเลิก" && s !== "ร่าง";
  return (kind: RequestKind, from: Role) => {
    if (kind === "leave") return (leaves[from] ?? []).filter((v) => waiting(v.status)).length;
    if (kind === "ot") return (ots[from] ?? []).filter((v) => waiting(v.status)).length;
    return (claims[from] ?? []).filter((v) => waiting(v.status)).length;
  };
}

/** สายที่ผู้ดูแลกำลังจะเปลี่ยน — ถือไว้จนกว่าจะยืนยัน ยังไม่แตะสโตร์ */
type RouteEdit = { kind: RequestKind; role: Role; label: string; from: ApproverKey; to: ApproverKey };

export function RoutePane() {
  const route = useApprovalRoute();
  const [resetting, setResetting] = useState(false);
  /* เปลี่ยนสายอนุมัติแล้วคำขอที่ค้างอยู่ย้ายตามทันที ดรอปดาวน์เลื่อนพลาดครั้งเดียวจึงเปลี่ยนไม่ได้ */
  const [edit, setEdit] = useState<RouteEdit | null>(null);
  const pendingOf = usePendingCount();
  /* แก้ชื่อ/ตำแหน่งผู้อนุมัติ — คนเปลี่ยนตำแหน่งหรือลาออกก็แก้ได้เอง ไม่ต้องรอแก้โค้ด */
  const [naming, setNaming] = useState<ApproverKey | null>(null);
  const kinds = Object.keys(KIND_LABEL) as RequestKind[];
  const changed = kinds.some((k) => ROUTE_ROLES.some((r) => route[k][r.key] !== DEFAULT_ROUTE[k][r.key]));

  /* สรุปกลับด้าน — ใครต้องอนุมัติอะไรบ้าง ดูง่ายกว่าไล่อ่านตาราง */
  const loads = (Object.keys(approvers()) as ApproverKey[]).map((key) => {
    const a = approvers()[key];
    const jobs = kinds.flatMap((k) =>
      ROUTE_ROLES.filter((r) => route[k][r.key] === key).map((r) => `${KIND_LABEL[k]}ของ${r.label}`),
    );
    return { key, a, jobs, extra: OUTSIDE_ROUTE[key] };
  });

  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-[640px] text-[12.5px] leading-relaxed text-muted-foreground">
          {/* สองชั้น: ตารางนี้คือค่าตั้งต้นรายบทบาท · ตำแหน่งที่ตั้งผู้อนุมัติเองในแท็บตำแหน่งใช้ค่านั้นก่อน (role.ts routeKeyOf · ผู้ใช้สั่ง 5 ต.ค. 2569) */}
          สายอนุมัติตั้งต้นของแต่ละบทบาท · ตำแหน่งที่เลือกผู้อนุมัติไว้เองในแท็บตำแหน่งจะใช้ค่านั้นก่อน ·
          เลือกผู้อนุมัติคนใหม่แล้วต้องยืนยันก่อน · คำขอที่ยังรออนุมัติอยู่จะย้ายไปหาผู้อนุมัติใหม่ทันทีที่ยืนยัน · อนุมัติคำขอของบทบาทตัวเองไม่ได้
        </p>
        <button
          type="button"
          className="btn glass-thin btn-mini max-sm:!h-10 max-sm:!px-3.5 max-sm:!text-[13px]"
          disabled={!changed}
          onClick={() => setResetting(true)}
        >
          กลับเป็นค่าตั้งต้น
        </button>
      </div>

      {/* มือถือ: การ์ดละบทบาท ป้ายอยู่บน ดรอปดาวน์เต็มความกว้าง แทนตารางที่บีบช่องเลือก */}
      <ul className="mt-3 space-y-2.5 sm:hidden">
        {ROUTE_ROLES.map((r) => (
          <li key={r.key} className="rounded-[14px] border border-border bg-card px-3.5 py-3">
            <b className="block text-[14px] font-semibold">{r.label}</b>
            <div className="mt-2 space-y-2.5">
              {kinds.map((k) => (
                <label key={k} className="block">
                  <span className="mb-1 block text-[12.5px] font-semibold text-muted-foreground">{KIND_LABEL[k]}</span>
                  <RouteSelect kind={k} role={r.key} label={r.label} value={route[k][r.key]} onPick={setEdit} />
                </label>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 hidden overflow-x-auto sm:block">
        <table className="data-table cards-sm min-w-[720px]">
          <thead>
            <tr>
              <th style={{ width: 180 }}>ผู้ยื่น</th>
              {kinds.map((k) => (
                <th key={k}>{KIND_LABEL[k]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROUTE_ROLES.map((r) => (
              <tr key={r.key}>
                <td data-label="ผู้ยื่น" className="font-semibold">
                  {r.label}
                </td>
                {kinds.map((k) => (
                  <td key={k} data-label={KIND_LABEL[k]}>
                    <RouteSelect kind={k} role={r.key} label={r.label} value={route[k][r.key]} onPick={setEdit} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-5 mb-2 text-[13px] font-bold">ใครต้องอนุมัติอะไร</h3>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {loads.map(({ key, a, jobs, extra }) => (
          <li key={key} className="rounded-[14px] border border-border bg-card px-3.5 py-3">
            <span className="flex items-start justify-between gap-2">
              <b className="block text-[13.5px] font-semibold">{a.title}</b>
              <button
                type="button"
                aria-label={`แก้ชื่อผู้อนุมัติ ${a.title}`}
                onClick={() => setNaming(key)}
                className="iconbtn glass-thin text-muted-foreground hover:text-primary max-sm:!size-10"
                style={{ width: 28, height: 28 }}
              >
                <PencilIcon className="size-3.5" strokeWidth={1.9} />
              </button>
            </span>
            <span className="block text-[12px] text-muted-foreground">
              {a.name}
              {a.role === null && " · ยังไม่มีบทบาทให้ล็อกอิน"}
            </span>
            <p className="mt-1.5 text-[12.5px] leading-relaxed">
              {jobs.length ? jobs.join(" · ") : <span className="text-muted-foreground">ไม่ได้อนุมัติอะไรในตารางนี้</span>}
            </p>
            {extra && (
              /* งานอนุมัติที่ไม่ได้อยู่ในตารางสายอนุมัติ — ไม่บอกไว้จะดูเหมือนคนนี้ไม่ได้อนุมัติอะไรเลย */
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">นอกตารางนี้: {extra}</p>
            )}
          </li>
        ))}
      </ul>

      {naming && (
        <ApproverNameDialog
          key={naming}
          who={naming}
          onClose={() => setNaming(null)}
        />
      )}

      {/* ยืนยันก่อนเปลี่ยนสาย — บอกให้ครบว่าคำขอประเภทไหนของใคร ย้ายจากใครไปใคร และมีใบค้างกี่ใบที่ย้ายตาม */}
      {edit && (
        <ConfirmDialog
          open
          title="เปลี่ยนผู้อนุมัติ"
          description={`${KIND_LABEL[edit.kind]}ของ${edit.label}`}
          detail={
            <>
              <b className="block font-semibold">
                {approvers()[edit.from].title} → {approvers()[edit.to].title}
              </b>
              <span className="num mt-1 block text-[12.5px] text-muted-foreground">
                {pendingOf(edit.kind, edit.role) > 0
                  ? `คำขอที่รออนุมัติอยู่ ${pendingOf(edit.kind, edit.role)} ใบ จะย้ายไปหา ${approvers()[edit.to].title} ทันที`
                  : "ตอนนี้ไม่มีคำขอที่รออนุมัติค้างอยู่ · ใบที่ยื่นหลังจากนี้จะไปหาผู้อนุมัติคนใหม่"}
              </span>
            </>
          }
          confirmLabel="เปลี่ยนผู้อนุมัติ"
          onCancel={() => setEdit(null)}
          onConfirm={() => {
            const n = pendingOf(edit.kind, edit.role);
            setApprover(edit.kind, edit.role, edit.to);
            /* ลงประวัติว่าใครเปลี่ยนเมื่อไร พร้อมจำนวนใบที่ย้ายตาม — ใบที่หายไปจากคิวเดิมจะได้ตามได้ */
            logChange(
              "บทบาทและสิทธิ์",
              `ผู้อนุมัติ${KIND_LABEL[edit.kind]}ของ${edit.label} ${approvers()[edit.from].title} → ${approvers()[edit.to].title}` +
                (n > 0 ? ` · คำขอค้าง ${n} ใบย้ายตาม` : ""),
            );
            setEdit(null);
          }}
        />
      )}

      <ConfirmDialog
        open={resetting}
        title="คืนสายอนุมัติเป็นค่าตั้งต้น"
        description="ใบลาและโอทีกลับไปหาหัวหน้าสายงาน ใบเบิกกลับไปหาฝ่ายบัญชี"
        confirmLabel="คืนค่าตั้งต้น"
        onCancel={() => setResetting(false)}
        onConfirm={() => {
          resetApprovalRoute();
          logChange("บทบาทและสิทธิ์", "คืนสายอนุมัติเป็นค่าตั้งต้น");
          setResetting(false);
        }}
      />
    </div>
  );
}

/**
 * ดรอปดาวน์เลือกผู้อนุมัติของบทบาทหนึ่ง — ใช้ทั้งตาราง (จอใหญ่) และการ์ด (มือถือ)
 * เลื่อนดรอปดาวน์แล้วยังไม่บันทึก ส่งต่อให้ RoutePane ถามยืนยันก่อน
 * และดันค่าใน DOM กลับเป็นค่าเดิมทันที จอจะได้ไม่แสดงคนใหม่ทั้งที่ยังไม่เปลี่ยน
 */
function RouteSelect({
  kind: k,
  role,
  label,
  value: key,
  onPick,
}: {
  kind: RequestKind;
  role: Role;
  label: string;
  value: ApproverKey;
  onPick: (e: RouteEdit) => void;
}) {
  const moved = key !== DEFAULT_ROUTE[k][role];
  return (
    <>
      <select
        value={key}
        aria-label={`ผู้อนุมัติ${KIND_LABEL[k]}ของ${label}`}
        onChange={(e) => {
          const next = e.target.value as ApproverKey;
          e.currentTarget.value = key;
          if (next !== key) onPick({ kind: k, role, label, from: key, to: next });
        }}
        className={`field-control h-9 w-full cursor-pointer text-[13px] max-sm:!h-11 max-sm:!text-[15px] ${moved ? "border-primary" : ""}`}
      >
        {(Object.keys(approvers()) as ApproverKey[]).map((a) => (
          /* ห้ามเลือกคนที่เป็นคนเดียวกับผู้ยื่น — คนหนึ่งถือได้หลายบทบาท จึงดูที่ตัวคน ไม่ใช่ชื่อบทบาท */
          <option key={a} value={a} disabled={!canRoute(a, role)}>
            {approvers()[a].title}
            {!canRoute(a, role) ? " (คนเดียวกับผู้ยื่น)" : ""}
          </option>
        ))}
      </select>
      {/* ค่าที่ตั้งไว้ก่อนหน้านี้กลายเป็นคนเดียวกับผู้ยื่นได้ ถ้าคนนั้นรับบทบาทเพิ่มทีหลัง
          คำขอจะไม่เข้าคิวใครเลยจนกว่าจะแก้ตรงนี้ ต้องบอกให้เห็น ไม่ใช่ปล่อยเงียบ */}
      {!canRoute(key, role) ? (
        <span className="over">ผู้อนุมัติเป็นคนเดียวกับผู้ยื่น — คำขอจะไม่มีผู้อนุมัติ ต้องเปลี่ยน</span>
      ) : (
        approvers()[key].role === null && <span className="why">ยังไม่มีบทบาทนี้ในระบบ คำขอจะค้างรอ</span>
      )}
    </>
  );
}

function Switch({
  on,
  onToggle,
  label,
  disabled,
  title,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      title={title}
      onClick={onToggle}
      className={`relative h-[25px] w-11 shrink-0 rounded-[14px] transition-colors disabled:opacity-40 ${
        on ? "bg-primary" : "bg-[#dde2e9]"
      }`}
    >
      <span
        className={`absolute top-[3px] left-[3px] size-[19px] rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-[19px]" : ""
        }`}
      />
    </button>
  );
}

/*
 * บทบาทของบัญชีผู้ใช้ — คนหนึ่งควบได้สูงสุด HR_MAX_ROLES บทบาท (เช่น บัญชีและบุคคล)
 * บัญชีสร้างที่ฝ่ายบุคคล (/hr/accounts) ที่นี่แก้ได้เฉพาะว่าบัญชีนั้นเข้าใช้บทบาทไหนได้บ้าง
 * เลือกครบแล้วเลือกเพิ่มไม่ได้ ต้องเอาบทบาทเดิมออกก่อน — เดิมตัวที่เลือกไว้ก่อนสุดจะหลุดเงียบ ๆ
 * ซึ่งอันตราย เพราะคนตั้งค่าไม่รู้ว่าเพิ่งถอดสิทธิ์อะไรของใครออกไป
 * คนควบสองบทบาทต้องเห็นว่าบัญชีนี้ทำงานของตำแหน่งไหนได้บ้าง — แสดงตำแหน่งจริงในทะเบียน
 * และเมนูงานของแต่ละบทบาทที่เลือก (ไม่รวมกลุ่ม "ของฉัน" ที่ทุกบทบาทมีเหมือนกัน · เมนูที่ปิดไว้ไม่นับ)
 */
export function DualRolePane() {
  const hr = useHr();
  const access = useMenuAccess();
  const route = useApprovalRoute();
  /* เมนู "รายการรออนุมัติ" ไม่ได้อยู่ในรายการตายตัว โผล่เองกับบทบาทที่เป็นผู้อนุมัติของใครสักคน */
  const workOf = (role: Role) => {
    const hidden = new Set(access[role] ?? []);
    const items = configurableItems(role)
      .filter((i) => i.group !== "ของฉัน" && !hidden.has(i.href))
      .map((i) => i.label);
    return role !== "ceo" && approvesFor(role, route).length ? [...items, "รายการรออนุมัติ"] : items;
  };
  const rows = hr.emp.filter((e) => e.account);

  /* กดแล้วไม่เกิดอะไรโดยไม่บอกเหตุผล คือจุดที่คนตั้งค่าเดาไม่ออกว่าระบบพังหรือห้ามไว้
     ทุกครั้งที่ปฏิเสธจึงต้องขึ้นข้อความว่าทำไม — ขึ้นเป็นป็อบอัพลอย ไม่ดันตารางให้ขยับ
     และหายเองใน 5 วินาที ไม่ต้องกดปิด (เจ้าของสั่ง 24 ก.ย. 2569) */
  const [why, setWhy] = useState("");
  useEffect(() => {
    if (!why) return;
    const id = window.setTimeout(() => setWhy(""), 5000);
    return () => window.clearTimeout(id);
  }, [why]);

  function toggle(id: string, name: string, role: Role, now: Role[]) {
    const off = now.includes(role);
    if (!off && now.length >= HR_MAX_ROLES) {
      setWhy(`${name} ถือได้สูงสุด ${HR_MAX_ROLES} บทบาท — เอาบทบาทเดิมออกก่อนจึงเพิ่มบทบาทใหม่ได้`);
      return;
    }
    const next = off ? now.filter((r) => r !== role) : [...now, role];
    if (next.length === 0) {
      setWhy(`${name} ต้องมีอย่างน้อยหนึ่งบทบาท ไม่งั้นบัญชีนี้เข้าระบบแล้วไม่มีหน้าให้เปิด`);
      return;
    }
    /* ทุกปุ่มกดสลับได้อิสระ กดครั้งแรกติด กดซ้ำหลุด เหมือนปุ่มอื่นในหน้านี้ */
    setWhy("");
    setAccountRoles(id, next);
    logChange("บทบาทและสิทธิ์", `${name} · บทบาทของบัญชี ${next.map(roleLabel).join(" + ")}`);
  }

  return (
    <>
    {why && (
      <p
        role="status"
        className="fixed bottom-[calc(88px+env(safe-area-inset-bottom))] left-1/2 z-70 max-w-[min(520px,calc(100vw-32px))] -translate-x-1/2 rounded-[14px] bg-foreground px-5 py-3 text-[13px] leading-relaxed font-semibold text-background shadow-lg sm:bottom-8"
      >
        {why}
      </p>
    )}
    {/* มือถือ: การ์ดละบัญชี ชื่อเต็มแถว ปุ่มบทบาทเรียงสองคอลัมน์ กดง่าย */}
    <ul className="space-y-2.5 p-3 sm:hidden">
      {rows.length === 0 ? (
        <li className="py-10 text-center text-[13px] text-muted-foreground">
          ยังไม่มีบัญชีผู้ใช้ · ฝ่ายบุคคลสร้างบัญชีให้พนักงานที่หน้าจัดการบัญชีผู้ใช้
        </li>
      ) : (
        rows.map((e) => {
          const now = accountRoles(e.account);
          return (
            <li key={e.id} className="rounded-[14px] border border-border bg-card px-3.5 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <b className="block text-[14.5px] font-semibold">{e.name}</b>
                  <span className="block text-[12px] text-muted-foreground">
                    ตำแหน่ง {hrPos(e.pos).label} · <span className="num break-all">{e.account!.user}</span>
                  </span>
                </div>
                {now.length > 1 && (
                  <span className="flex-none rounded-full bg-[var(--info-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--info)]">
                    ควบ {now.length} บทบาท
                  </span>
                )}
              </div>
              <p className="mt-3 mb-1.5 text-[12px] font-semibold text-muted-foreground">
                บทบาทที่เข้าใช้ได้ (สูงสุด {HR_MAX_ROLES})
              </p>
              <div className="grid grid-cols-2 gap-2">
                {ACCOUNT_ROLES.map((r) => {
                  const on = now.includes(r.key);
                  return (
                    <button
                      key={r.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(e.id, e.name, r.key, now)}
                      className={`min-h-11 rounded-[11px] border px-2.5 py-1.5 text-[13px] leading-snug transition-colors ${
                        on ? "border-primary bg-primary text-white" : "border-border"
                      }`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 mb-1 text-[12px] font-semibold text-muted-foreground">งานของแต่ละบทบาท</p>
              {now.map((r) => (
                <p key={r} className="text-[12.5px] leading-relaxed">
                  <b className="font-semibold">{roleLabel(r)}</b>
                  <span className="text-muted-foreground">
                    {" · "}
                    {workOf(r).join(" · ") || "ไม่มีเมนูที่เปิดอยู่"}
                  </span>
                </p>
              ))}
            </li>
          );
        })
      )}
    </ul>
    <div className="scroll-stable hidden min-h-0 flex-1 overflow-auto sm:block">
      <table className="data-table cards-sm min-w-[820px]">
        <thead>
          <tr>
            <th style={{ width: 220 }}>บัญชีผู้ใช้</th>
            <th>บทบาทที่เข้าใช้ได้ (สูงสุด {HR_MAX_ROLES})</th>
            <th>งานของแต่ละบทบาท</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="py-12 text-center text-muted-foreground">
                ยังไม่มีบัญชีผู้ใช้ · ฝ่ายบุคคลสร้างบัญชีให้พนักงานที่หน้าจัดการบัญชีผู้ใช้
              </td>
            </tr>
          ) : (
            rows.map((e) => {
              const now = accountRoles(e.account);
              return (
                <tr key={e.id}>
                  <td data-label="บัญชีผู้ใช้">
                    <b className="block text-[13.5px] font-semibold">{e.name}</b>
                    <span className="why">ตำแหน่ง {hrPos(e.pos).label}</span>
                    <span className="why num">{e.account!.user}</span>
                    {now.length > 1 && (
                      <span className="mt-1 inline-block rounded-full bg-[var(--info-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--info)]">
                        ควบ {now.length} บทบาท
                      </span>
                    )}
                  </td>
                  <td data-label="บทบาทที่เข้าใช้ได้">
                    <span className="flex flex-wrap gap-2">
                      {ACCOUNT_ROLES.map((r) => {
                        const on = now.includes(r.key);
                        return (
                          <button
                            key={r.key}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggle(e.id, e.name, r.key, now)}
                            className={`rounded-[11px] border px-3 py-1.5 text-[12.5px] transition-colors ${
                              on ? "border-primary bg-primary text-white" : "border-border hover:border-primary/40"
                            }`}
                          >
                            {r.label}
                          </button>
                        );
                      })}
                    </span>
                  </td>
                  <td data-label="งานของแต่ละบทบาท">
                    <span className="flex flex-col gap-1.5">
                      {now.map((r) => (
                        <span key={r} className="text-[12.5px] leading-relaxed">
                          <b className="font-semibold">{roleLabel(r)}</b>
                          <span className="text-muted-foreground">
                            {" · "}
                            {workOf(r).join(" · ") || "ไม่มีเมนูที่เปิดอยู่"}
                          </span>
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
    </>
  );
}

/** แก้ชื่อและตำแหน่งของผู้อนุมัติ — บันทึกทันทีเหมือนส่วนอื่นของหน้านี้ */
function ApproverNameDialog({ who, onClose }: { who: ApproverKey; onClose: () => void }) {
  const saved = settings().approvers;
  const [name, setName] = useState(saved[who].name);
  const [title, setTitle] = useState(saved[who].title);
  const ok = name.trim() && title.trim();

  function save() {
    if (!ok) return;
    const was = saved[who];
    saveSection("approvers", { ...saved, [who]: { name: name.trim(), title: title.trim() } });
    logChange("บทบาทและสิทธิ์", `ผู้อนุมัติ ${was.title} (${was.name}) → ${title.trim()} (${name.trim()})`);
    onClose();
  }

  return (
    <Sheet
      title="แก้ไขผู้อนุมัติ"
      narrow
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn solid btn-solid" disabled={!ok} onClick={save}>
            บันทึก
          </button>
        </>
      }
    >
      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">ชื่อผู้อนุมัติ</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="field-control" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">ตำแหน่ง</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="field-control" />
        </label>
      </div>
      <p className="mt-3 rounded-[11px] bg-muted/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
        ชื่อนี้ขึ้นให้พนักงานเห็นว่ายื่นคำขอถึงใคร (ใบลา โอที ใบเบิก) และในข้อความแจ้งเตือน
      </p>
    </Sheet>
  );
}
