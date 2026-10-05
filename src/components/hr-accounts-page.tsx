"use client";

/*
 * จัดการบัญชีผู้ใช้ของพนักงาน (ตามต้นแบบ dose-erp-maz/hr-accounts.html)
 *
 * ฝ่ายบุคคลเป็นคนสร้างบัญชีให้พนักงาน เพราะบริษัทไม่มีอีเมลพนักงาน
 * ชื่อผู้ใช้ระบบเสนอให้จากชื่อจริง แก้ได้ก่อนสร้าง และห้ามซ้ำกับคนอื่น
 *
 * รหัสที่ให้ไปเป็นรหัสชั่วคราว เข้าระบบครั้งแรกต้องตั้งรหัสใหม่เอง
 * ⚠️ ยังไม่มี backend — หน้านี้เก็บแค่ชื่อผู้ใช้กับสถานะ ไม่ได้เก็บรหัสผ่านไว้ที่ไหน
 *    ของจริงต้องสร้างบัญชีที่ระบบยืนยันตัวตนแล้วส่งรหัสชั่วคราวให้พนักงาน
 */

import { useMemo, useState } from "react";
import { thaiDate, todayIso } from "@/lib/format";
import {
  HR_ACC_STATUS,
  accountRoles,
  hrPos,
  suggestUser,
  type EmpAccount,
  type Employee,
} from "@/lib/hr-data";
import { createAccount, resetAccount, setAccountStatus, useHr } from "@/lib/hr-store";
import { Sheet } from "./lead-dialogs";
import { Field, Input, Select } from "./ui";
import { SearchBox } from "./sales-ui";
import { PhoneCard, PhoneList } from "./acchr-phone";

type Filter = "all" | "active" | "suspended" | "none";

const FILTER_LABEL: Record<Filter, string> = {
  all: "ทั้งหมด",
  active: "ใช้งานอยู่",
  suspended: "ถูกระงับ",
  none: "ยังไม่มีบัญชี",
};

/** รหัสชั่วคราว — ตัดตัวอักษรที่อ่านสลับกันง่าย (O 0 I l 1) ออก จะได้อ่านทางโทรศัพท์ได้ */
function tempPass() {
  const up = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const low = "abcdefghijkmnpqrstuvwxyz";
  const num = "23456789";
  const sym = "#@!";
  const pick = (s: string) => s.charAt(Math.floor(Math.random() * s.length));
  return pick(up) + pick(low) + pick(low) + pick(low) + pick(num) + pick(num) + pick(sym);
}

export function HrAccountsPage() {
  const hr = useHr();
  const today = todayIso();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  /* กล่องเดียวใช้ทั้งสร้างบัญชีและตั้งรหัสใหม่ — ต่างกันแค่ว่ามีบัญชีอยู่แล้วหรือยัง */
  const [editing, setEditing] = useState<{ id: string; reset: boolean } | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hr.emp.filter((e) => {
      if (e.status !== "active") return false;
      const st: Filter = e.account ? e.account.status : "none";
      if (filter !== "all" && st !== filter) return false;
      if (q && !`${e.name} ${e.account?.user ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [hr.emp, query, filter]);

  const target = editing ? hr.emp.find((e) => e.id === editing.id) : undefined;

  return (
    <div className="space-y-4">
      <div className="bar">
        <div>
          <h1>จัดการบัญชีผู้ใช้</h1>
        </div>
        <div className="tools w-full flex-wrap items-end sm:w-auto">
          <Field label="ค้นหา" className="max-sm:w-full">
            <SearchBox value={query} onChange={setQuery} placeholder="ชื่อ หรือชื่อผู้ใช้" />
          </Field>
          <Field label="บัญชี" className="max-sm:w-full">
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              aria-label="กรองตามสถานะบัญชี"
              className="w-auto min-w-[150px] max-sm:w-full"
            >
              {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
                <option key={f} value={f}>
                  {FILTER_LABEL[f]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <section className="panel glass flex flex-col">
        <div className="scroll-stable min-h-0 flex-1 overflow-auto max-sm:hidden">
          <table className="data-table cards-sm min-w-[860px]">
            <thead>
              <tr>
                <th>พนักงาน</th>
                <th style={{ width: 190 }}>ชื่อผู้ใช้</th>
                <th style={{ width: 150 }}>สถานะบัญชี</th>
                <th style={{ width: 150 }}>สร้างเมื่อ</th>
                <th className="c" style={{ width: 240 }} aria-label="จัดการ" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    ไม่พบรายการ
                  </td>
                </tr>
              ) : (
                rows.map((e) => (
                  <AccountRow
                    key={e.id}
                    emp={e}
                    onNew={() => setEditing({ id: e.id, reset: false })}
                    onReset={() => setEditing({ id: e.id, reset: true })}
                    onToggle={() =>
                      setAccountStatus(e.id, e.account?.status === "active" ? "suspended" : "active")
                    }
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* มือถือ: การ์ดย่อคนละใบ ปุ่มจัดการบัญชีเต็มความกว้างการ์ด */}
        <PhoneList empty={rows.length === 0 ? "ไม่พบรายการ" : undefined}>
          {rows.map((e) => {
            const a = e.account;
            const st = a ? HR_ACC_STATUS[a.status] : null;
            return (
              <PhoneCard
                key={e.id}
                title={e.name}
                sub={e.pos ? hrPos(e.pos).label : "ยังไม่ได้กรอกข้อมูล"}
                badge={
                  st ? (
                    <span className={`tag ${st.cls}`}>
                      <i />
                      {st.label}
                    </span>
                  ) : (
                    <span className="tag t-miss">
                      <i />
                      ยังไม่มีบัญชี
                    </span>
                  )
                }
                stats={
                  a
                    ? [
                        { label: "ชื่อผู้ใช้", value: a.user },
                        { label: "สร้างเมื่อ", value: thaiDate(a.createdAt) },
                      ]
                    : undefined
                }
                actions={
                  a ? (
                    <>
                      <button
                        type="button"
                        className="btn glass-thin"
                        onClick={() => setEditing({ id: e.id, reset: true })}
                      >
                        รีเซ็ตรหัสผ่าน
                      </button>
                      <button
                        type="button"
                        className="btn glass-thin"
                        onClick={() =>
                          setAccountStatus(e.id, a.status === "active" ? "suspended" : "active")
                        }
                      >
                        {a.status === "active" ? "ระงับบัญชี" : "คืนสิทธิ์"}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn solid btn-solid"
                      onClick={() => setEditing({ id: e.id, reset: false })}
                    >
                      สร้างบัญชี
                    </button>
                  )
                }
              />
            );
          })}
        </PhoneList>
      </section>

      {target && editing && (
        <AccountDialog
          key={`${target.id}-${editing.reset}`}
          emp={target}
          reset={editing.reset}
          taken={hr.emp
            .filter((x) => x.id !== target.id && x.account)
            .map((x) => x.account!.user)}
          today={today}
          onClose={() => setEditing(null)}
        />
      )}

    </div>
  );
}

function AccountRow({
  emp,
  onNew,
  onReset,
  onToggle,
}: {
  emp: Employee;
  onNew: () => void;
  onReset: () => void;
  onToggle: () => void;
}) {
  const a = emp.account;
  const st = a ? HR_ACC_STATUS[a.status] : null;
  return (
    <tr>
      <td data-label="พนักงาน">
        <b className="block text-[13.5px] font-semibold">{emp.name}</b>
        {/* ยังไม่มีตำแหน่ง — ข้อความตาม mockup (posLabel) */}
        <span className="why">{emp.pos ? hrPos(emp.pos).label : "ยังไม่ได้กรอกข้อมูล"}</span>
      </td>
      <td data-label="ชื่อผู้ใช้" className="num">
        {a ? a.user : <span className="muted">ยังไม่มีบัญชี</span>}
      </td>
      <td data-label="สถานะบัญชี">
        {st ? (
          <span className={`tag ${st.cls}`}>
            <i />
            {st.label}
          </span>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td data-label="สร้างเมื่อ" className="num muted">
        {a ? thaiDate(a.createdAt) : "—"}
      </td>
      <td data-label="จัดการ" className="c">
        {a ? (
          <span className="flex flex-wrap justify-center gap-1.5">
            <button type="button" className="btn glass-thin btn-mini" onClick={onReset}>
              รีเซ็ตรหัสผ่าน
            </button>
            <button type="button" className="btn glass-thin btn-mini" onClick={onToggle}>
              {a.status === "active" ? "ระงับบัญชี" : "คืนสิทธิ์"}
            </button>
          </span>
        ) : (
          <button type="button" className="btn solid btn-solid btn-mini" onClick={onNew}>
            สร้างบัญชี
          </button>
        )}
      </td>
    </tr>
  );
}

/** สร้างบัญชีใหม่ หรือตั้งรหัสใหม่ให้บัญชีเดิม */
function AccountDialog({
  emp,
  reset,
  taken,
  today,
  onClose,
}: {
  emp: Employee;
  reset: boolean;
  taken: string[];
  today: string;
  onClose: () => void;
}) {
  const [user, setUser] = useState(
    reset ? (emp.account?.user ?? "") : suggestUser(emp.name, taken),
  );
  const [pass, setPass] = useState(tempPass);
  /* ต้นแบบไม่มีตัวเลือกบทบาทในกล่องนี้ — บทบาทของบัญชีกำหนดที่ /admin/settings?s=positions&t=accounts (แท็บ "บทบาทของบัญชีผู้ใช้")
     รีเซ็ตรหัสคงบทบาทเดิมไว้ · บัญชีใหม่ยังไม่มีบทบาทจนกว่าผู้ดูแลระบบจะกำหนด */
  const roles = accountRoles(emp.account);
  const [warn, setWarn] = useState("");

  function save() {
    const name = user.trim();
    if (name.length < 4) return setWarn("ชื่อผู้ใช้ต้องยาวอย่างน้อย 4 ตัวอักษร");
    if (taken.includes(name)) return setWarn("ชื่อผู้ใช้นี้มีคนใช้แล้ว");
    /* TODO: ต่อ backend แล้วต้องสร้าง/รีเซ็ตบัญชีที่ระบบยืนยันตัวตนจริง แล้วบังคับตั้งรหัสใหม่ครั้งแรก */
    if (reset) resetAccount(emp.id, name, roles);
    else createAccount(emp.id, name, today, roles);
    onClose();
  }

  return (
    <Sheet
      title={reset ? "รีเซ็ตรหัสผ่าน" : "สร้างบัญชีผู้ใช้"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn solid btn-solid" onClick={save}>
            {reset ? "ตั้งรหัสใหม่" : "สร้างบัญชี"}
          </button>
        </>
      }
    >
      <Field label="พนักงาน">
        <p className="text-[14px] font-semibold">
          {emp.name}
          <span className="ml-2 text-[12.5px] font-normal text-muted-foreground">
            {hrPos(emp.pos).label}
          </span>
        </p>
      </Field>

      <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
        <Field label="ชื่อผู้ใช้" required>
          <Input
            value={user}
            onChange={(e) => {
              setUser(e.target.value);
              setWarn("");
            }}
            aria-label="ชื่อผู้ใช้"
            placeholder="ระบบเสนอให้จากชื่อ"
            className="num"
          />
        </Field>
        <Field label="รหัสผ่านชั่วคราว">
          <span className="flex items-center gap-2">
            <span className="num flex h-9 flex-1 items-center rounded-[10px] border border-border bg-muted/60 px-3 text-[14px] font-bold tracking-wide">
              {pass}
            </span>
            <button
              type="button"
              className="btn glass-thin btn-mini"
              onClick={() => setPass(tempPass())}
            >
              สุ่มใหม่
            </button>
          </span>
        </Field>
      </div>

      <p className="mt-3 rounded-[11px] bg-muted/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed">
        ส่งชื่อผู้ใช้และรหัสผ่านนี้ให้พนักงาน เมื่อเข้าระบบครั้งแรกจะให้ตั้งรหัสใหม่เอง
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        ระบบยังไม่มีฐานข้อมูล จึงเก็บเฉพาะชื่อผู้ใช้กับสถานะ ไม่ได้เก็บรหัสผ่านไว้
        ต้องคัดลอกรหัสนี้ไปให้พนักงานก่อนปิดกล่อง
      </p>

      {warn && (
        <p className="mt-3 rounded-[11px] border border-[rgba(192,18,31,.2)] bg-[var(--destructive-soft)] px-3.5 py-2.5 text-[12.5px] text-destructive">
          {warn}
        </p>
      )}
    </Sheet>
  );
}

export type { EmpAccount };
