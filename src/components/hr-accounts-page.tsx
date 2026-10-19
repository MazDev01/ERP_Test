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
import { createAccount, resetAccount, setAccountRoles, setAccountStatus, useHr } from "@/lib/hr-store";
import { JobTags, jobLabel, PassBox, RolePicker, tempPass } from "./account-parts";
import { roleLabel, type Role } from "@/lib/role";
import { Sheet } from "./lead-dialogs";
import { Field, Input, Select } from "./ui";
import { SearchBox } from "./sales-ui";
import { Switch } from "./admin-ui";
import { PhoneCard, PhoneList } from "./acchr-phone";
import { stackNo } from "@/lib/stack-no";

type Filter = "all" | "active" | "suspended";

const FILTER_LABEL: Record<Filter, string> = {
  all: "ทั้งหมด",
  active: "ใช้งานอยู่",
  suspended: "ถูกระงับ",
};


export function HrAccountsPage() {
  const hr = useHr();
  const today = todayIso();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  /* กล่องเดียวใช้ทั้งสร้างบัญชีและตั้งรหัสใหม่ — ต่างกันแค่ว่ามีบัญชีอยู่แล้วหรือยัง */
  const [editing, setEditing] = useState<{ id: string; reset: boolean } | null>(null);
  /** กล่องเมนูที่ใช้ได้ (บทบาทของบัญชี) — ต้นแบบ hr-accounts.html mVeil */
  const [menuOf, setMenuOf] = useState<string | null>(null);

  /* ลำดับแบบกองซ้อน — นับจากบัญชีทั้งหมดก่อนกรองสถานะ/ค้นหา ตามวันที่สร้างบัญชี บัญชีล่าสุดเลขมากสุดอยู่บน (ผู้ใช้สั่ง 12 ต.ค. 2569) */
  const noOf = useMemo(
    () =>
      stackNo(
        hr.emp.filter((e) => e.status === "active" && e.account),
        (e) => e.account?.createdAt ?? "",
        (e) => e.id,
      ),
    [hr.emp],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hr.emp.filter((e) => {
      /* พนักงาน 1 คนมีบัญชี 1 บัญชี สร้างพร้อมข้อมูลพนักงาน — ตารางนี้จึงมีแต่คนที่มีบัญชี */
      if (e.status !== "active" || !e.account) return false;
      if (filter !== "all" && e.account.status !== filter) return false;
      if (q && !`${e.name} ${e.nick ?? ""} ${e.account?.user ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => (noOf.get(b.id) ?? 0) - (noOf.get(a.id) ?? 0));
  }, [hr.emp, query, filter, noOf]);

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
          <table className="data-table cards-sm min-w-[920px]">
            <thead>
              <tr>
                <th className="c" style={{ width: 60 }}>ลำดับ</th>
                <th>พนักงาน</th>
                <th style={{ width: 150 }}>ชื่อผู้ใช้</th>
                <th style={{ width: 170 }}>งานที่รับผิดชอบ</th>
                {/* สวิตช์แทนปุ่มระงับ/คืนสิทธิ์ และแทนคอลัมน์สถานะบัญชี (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
                <th style={{ width: 120 }}>สร้างเมื่อ</th>
                <th className="c" style={{ width: 300 }} aria-label="จัดการ" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    ไม่พบรายการ
                  </td>
                </tr>
              ) : (
                rows.map((e) => (
                  <AccountRow
                    key={e.id}
                    no={noOf.get(e.id) ?? 0}
                    emp={e}
                    onMenu={() => setMenuOf(e.id)}
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
                title={e.nick?.trim() || e.name}
                sub={`#${noOf.get(e.id)} · ${e.pos ? hrPos(e.pos).label : "ยังไม่ได้กรอกข้อมูล"}`}
                badge={
                  a ? (
                    /* มือถือก็ใช้สวิตช์ เปิด = ใช้งานอยู่ ปิด = ระงับ (ผู้ใช้สั่ง 13 ต.ค. 2569) */
                    <Switch
                      on={a.status === "active"}
                      onToggle={() =>
                        setAccountStatus(e.id, a.status === "active" ? "suspended" : "active")
                      }
                      label={`เปิดหรือปิดใช้บัญชี ${e.name}`}
                      title={st?.label}
                    />
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
                        { label: "งานที่รับผิดชอบ", value: <JobTags roles={a.roles} /> },
                        { label: "สร้างเมื่อ", value: thaiDate(a.createdAt) },
                      ]
                    : undefined
                }
                actions={
                  a ? (
                    <>
                      <button type="button" className="btn glass-thin" onClick={() => setMenuOf(e.id)}>
                        งานที่รับผิดชอบ
                      </button>
                      <button
                        type="button"
                        className="btn glass-thin"
                        onClick={() => setEditing({ id: e.id, reset: true })}
                      >
                        รีเซ็ตรหัสผ่าน
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

      {menuOf && hr.emp.find((x) => x.id === menuOf) && (
        <MenuDialog emp={hr.emp.find((x) => x.id === menuOf)!} onClose={() => setMenuOf(null)} />
      )}

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
  no,
  emp,
  onMenu,
  onReset,
  onToggle,
}: {
  no: number;
  emp: Employee;
  onMenu: () => void;
  onReset: () => void;
  onToggle: () => void;
}) {
  const a = emp.account;
  const st = a ? HR_ACC_STATUS[a.status] : null;
  return (
    <tr>
      <td data-label="ลำดับ" className="c num muted">{no}</td>
      <td data-label="พนักงาน">
        {/* ชื่อเล่นเป็นชื่อหลัก ไม่มีชื่อเล่นใช้ชื่อจริง (ผู้ใช้สั่ง 15 ต.ค. 2569) */}
        <b className="block text-[13.5px] font-semibold">{emp.nick?.trim() || emp.name}</b>
        {/* ยังไม่มีตำแหน่ง — ข้อความตาม mockup (posLabel) */}
        <span className="why">{emp.pos ? hrPos(emp.pos).label : "ยังไม่ได้กรอกข้อมูล"}</span>
      </td>
      <td data-label="ชื่อผู้ใช้" className="num">
        {a ? a.user : <span className="muted">ยังไม่มีบัญชี</span>}
      </td>
      <td data-label="งานที่รับผิดชอบ">
        <JobTags roles={a?.roles} />
      </td>
      <td data-label="สร้างเมื่อ" className="num muted">
        {a ? thaiDate(a.createdAt) : "—"}
      </td>
      <td data-label="จัดการ" className="c">
        {a ? (
          <span className="flex flex-wrap items-center justify-end gap-1.5">
            <button type="button" className="btn glass-thin btn-mini" onClick={onMenu}>
              งานที่รับผิดชอบ
            </button>
            <button type="button" className="btn glass-thin btn-mini" onClick={onReset}>
              รีเซ็ตรหัสผ่าน
            </button>
            {/* สวิตช์เปิด/ปิดบัญชีอยู่ตำแหน่งเดิมของปุ่มระงับบัญชี (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
            <Switch
              on={a.status === "active"}
              onToggle={onToggle}
              label={`เปิดหรือปิดใช้บัญชี ${emp.name}`}
              title={st?.label}
            />
          </span>
        ) : null}
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
  /* บัญชีใหม่: ฝ่ายบุคคลติกบทบาทเองตอนสร้าง (ผู้ใช้สั่ง 6 ต.ค. 2569)
     ลำดับที่ติกคือลำดับเมนูที่ผู้ใช้เห็น — ติกก่อนขึ้นก่อน · รีเซ็ตรหัสคงบทบาทเดิมไว้ */
  const [roles, setRoles] = useState<Role[]>(() => accountRoles(emp.account));
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
          <PassBox pass={pass} onNew={() => setPass(tempPass())} />
        </Field>
      </div>

      {!reset && (
        <fieldset className="mt-4">
          <legend className="mb-2 text-[12.5px] font-semibold text-muted-foreground">
            งานที่รับผิดชอบ
          </legend>
          <RolePicker roles={roles} onChange={setRoles} onWarn={setWarn} />
        </fieldset>
      )}

      {/* ไม่มีข้อความอธิบายการทำงานของระบบในกล่องนี้ (ผู้ใช้สั่ง 6 ต.ค. 2569) */}

      {warn && (
        <p className="mt-3 rounded-[11px] border border-[rgba(192,18,31,.2)] bg-[var(--destructive-soft)] px-3.5 py-2.5 text-[12.5px] text-destructive">
          {warn}
        </p>
      )}
    </Sheet>
  );
}

export type { EmpAccount };

/** บทบาทของบัญชีเป็นข้อความบรรทัดเดียว — การ์ดมือถือ */
function roleLine(roles?: Role[]) {
  return roles?.length ? roles.map(jobLabel).join(" · ") : "—";
}

/**
 * เมนูที่ใช้ได้ของบัญชีหนึ่ง = บทบาทของบัญชี เรียงตามลำดับที่ติก (ต้นแบบ hr-accounts.html mVeil)
 * เมนู "ของฉัน" ขึ้นตามประเภทพนักงานอยู่แล้ว ไม่อยู่ในรายการนี้
 */
function MenuDialog({ emp, onClose }: { emp: Employee; onClose: () => void }) {
  const [roles, setRoles] = useState<Role[]>(() => accountRoles(emp.account));
  const [warn, setWarn] = useState("");
  return (
    <Sheet
      title="งานที่รับผิดชอบ"
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
              setAccountRoles(emp.id, roles);
              onClose();
            }}
          >
            บันทึก
          </button>
        </>
      }
    >
      <p className="mb-3.5">
        <b className="block text-[14px] font-semibold">{emp.name}</b>
        <em className="mt-0.5 block text-[12px] text-muted-foreground not-italic">{hrPos(emp.pos).label}</em>
      </p>
      <RolePicker roles={roles} onChange={setRoles} onWarn={setWarn} />
      {warn && (
        <p className="mt-3 rounded-[11px] border border-[rgba(192,18,31,.2)] bg-[var(--destructive-soft)] px-3.5 py-2.5 text-[12.5px] text-destructive">
          {warn}
        </p>
      )}
    </Sheet>
  );
}
