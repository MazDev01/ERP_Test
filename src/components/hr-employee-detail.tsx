"use client";

/*
 * กล่องประวัติพนักงาน — แบบหน้าโปรไฟล์ (โครงใหม่ 24 ก.ย. 2569)
 *
 * แบนเนอร์แดงของแอป + รูป + แถบข้อมูลสี่ช่อง + แท็บห้าอัน
 * เอาเฉพาะ "โครง" จากต้นแบบที่เจ้าของส่งมา สีและฟอนต์ยังเป็นของแอปเดิม (พื้นเรียบ ไม่มีกระจก)
 *
 * แท็บเงินเดือนเปิดให้เฉพาะฝ่ายบุคคลกับผู้บริหาร — เป็นข้อมูลค่าจ้างของคนอื่น
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { baht, thaiDate } from "@/lib/format";
import { useHydrated } from "@/lib/pwa";
import { lockScroll } from "@/lib/scroll-lock";
import { useRole } from "@/lib/role";
import {
  HR_EMPTYPE,
  HR_STATUS,
  empYears,
  hrDept,
  hrDocs,
  hrPos,
  probDaysLeft,
  probLine,
  type Employee,
} from "@/lib/hr-data";
import { useHr } from "@/lib/hr-store";
import { CloseIcon } from "./icons";

/**
 * ช่องรูปพนักงาน — ยังไม่มีที่ให้อัปโหลดรูป จึงเป็นกรอบว่างบอกตรง ๆ ว่ายังไม่มีรูป
 * ไม่เอารูปคนอื่นหรือรูปการ์ตูนมาแทน จะได้ไม่มีใครเข้าใจผิดว่าเป็นหน้าจริงของคนนั้น
 */
export function EmpPhoto({ className = "", note = true }: { className?: string; note?: boolean }) {
  return (
    <span
      className={`relative flex flex-none items-center justify-center overflow-hidden border border-border bg-muted/50 text-muted-foreground ${className}`}
      aria-hidden="true"
    >
      <svg
        width="30"
        height="30"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={note ? "mb-3" : ""}
      >
        <circle cx="12" cy="9" r="3.4" />
        <path d="M4.5 20c0-3.8 3.4-6.2 7.5-6.2s7.5 2.4 7.5 6.2" />
      </svg>
      {note && (
        <em className="absolute right-0 bottom-[7px] left-0 text-center text-[9.5px] leading-tight not-italic">
          ยังไม่มีรูป
        </em>
      )}
    </span>
  );
}

/** ป้ายสถานะ เขียว = ปฏิบัติงานอยู่ · เทา = พ้นสภาพ */
export function StatusPill({ emp, big }: { emp: Employee; big?: boolean }) {
  const gone = emp.status === "left";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[20px] font-semibold ${
        big ? "px-3 py-[4px] text-[12.5px]" : "px-[11px] py-[3px] text-xs"
      } ${gone ? "bg-muted text-muted-foreground" : "bg-[var(--success-soft)] text-[var(--success)]"}`}
    >
      <i className="size-[7px] rounded-full bg-current" />
      {HR_STATUS[emp.status].label}
    </span>
  );
}

type TabKey = "over" | "person" | "work" | "docs" | "pay";

const TABS: { k: TabKey; label: string }[] = [
  { k: "over", label: "ภาพรวม" },
  { k: "person", label: "ข้อมูลส่วนตัว" },
  { k: "work", label: "ข้อมูลงาน" },
  { k: "docs", label: "เอกสาร" },
  { k: "pay", label: "เงินเดือน" },
];

export function EmployeeDetail({
  emp,
  today,
  onPass,
  onEdit,
  onClose,
}: {
  emp: Employee;
  today: string;
  onPass: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const hydrated = useHydrated();
  const role = useRole();
  const hr = useHr();
  const [tab, setTab] = useState<TabKey>("over");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const unlock = lockScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
    };
  }, [onClose]);

  if (!hydrated) return null;

  const p = hrPos(emp.pos);
  /* ตำแหน่งควบ (ถ้ามี) — เงินเดือนกับสายอนุมัติยังอิงตำแหน่งหลัก */
  const more = (emp.posMore ?? []).map((v) => hrPos(v).label).join(" · ");
  const cur = emp.history[emp.history.length - 1];
  const bossName = emp.boss ? hr.emp.find((e) => e.id === emp.boss)?.name : "";
  /* เงินเดือนเป็นข้อมูลค่าจ้างของคนอื่น — เปิดให้เฉพาะฝ่ายบุคคลกับผู้บริหาร */
  const seePay = role === "hr" || role === "ceo";
  const tabs = TABS.filter((t) => t.k !== "pay" || seePay);
  const onProbation = emp.type === "probat" && emp.status === "active";

  return createPortal(
    <div
      /* he-detail — มือถือเป็นแผ่นเต็มความกว้างจากด้านล่าง (styles/mobile/hr-employees.css) */
      className="he-detail fixed inset-0 z-80 flex items-end justify-center bg-black/50 sm:items-start sm:p-6 sm:pt-[max(24px,7vh)]"
      role="dialog"
      aria-modal="true"
      aria-label={`ประวัติของ ${emp.name}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="glass-solid flex max-h-[92dvh] w-full max-w-[900px] flex-col overflow-hidden rounded-t-[18px] sm:max-h-full sm:rounded-[18px]">
        {/* แบนเนอร์แดงของแอป มีวงกลมจาง ๆ ประดับ ปุ่มปิดอยู่มุมขวาบนบนแบนเนอร์ */}
        <div
          /* เจ้าของทัก 28 ก.ย. 2569 ว่าแถบบนใหญ่ไป — ลดเหลือ 56px ขอบล่างตรงเหมือนเดิม
             รูปลอยทับแค่นิดเดียว เว้นระยะจากขอบบนให้เห็นชัด */
          className="relative h-[56px] flex-none overflow-hidden"
          style={{ background: "linear-gradient(105deg,var(--primary) 0%,var(--primary-hover) 100%)" }}
        >
          <span className="pointer-events-none absolute -top-8 -right-6 size-[100px] rounded-full bg-white/10" />
          <span className="pointer-events-none absolute -bottom-10 left-16 size-[86px] rounded-full bg-white/[.07]" />
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            /* ปุ่มปิดเป็นสี่เหลี่ยมมนมีเส้นขอบ ไม่ใช่วงกลม (เจ้าของสั่ง 28 ก.ย. 2569) */
            className="absolute top-2.5 right-3 flex size-8 items-center justify-center rounded-[10px] border border-white/45 bg-white/15 text-white hover:bg-white/30"
          >
            <CloseIcon className="size-[15px]" strokeWidth={2.2} />
          </button>
        </div>

        <div className="he-dbody scroll-stable min-h-0 flex-1 overflow-auto px-4 pb-4 sm:px-5 sm:pb-[18px]">
          {/* รูปลอยขึ้นมาทับแบนเนอร์ */}
          <div className="flex items-end gap-3.5">
            <EmpPhoto
              note={false}
              className="mt-2 size-[68px] rounded-[16px] border-[3px]! border-white! shadow-[0_4px_14px_rgba(28,20,45,.18)]"
            />
            <div className="min-w-0 flex-1 pb-1">
              <h2 className="truncate text-[17px] font-bold">
                {emp.name}
                {emp.nick && <span className="ml-1.5 text-[13px] font-normal text-muted-foreground">({emp.nick})</span>}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StatusPill emp={emp} big />
                <span className="text-[12.5px] text-muted-foreground">{p.label}</span>
              </div>
            </div>
          </div>

          {/* แถบข้อมูลสี่ช่อง — มือถือเหลือสองคอลัมน์ */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <InfoBox k="แผนก" v={hrDept(p.dept).label} />
            <InfoBox k="ประเภทพนักงาน" v={HR_EMPTYPE[emp.type].label} />
            <InfoBox k="อีเมล" v={emp.email || "—"} />
            <InfoBox k="โทรศัพท์" v={emp.phone || "—"} num />
          </div>

          <div
            className="seg mt-4 w-full overflow-x-auto whitespace-nowrap"
            role="tablist"
            aria-label="ข้อมูลพนักงาน"
          >
            {tabs.map((t) => (
              <button
                key={t.k}
                type="button"
                role="tab"
                aria-selected={tab === t.k}
                className={tab === t.k ? "on" : ""}
                style={{ flex: "none" }}
                onClick={() => setTab(t.k)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-3.5">
            {tab === "over" && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Sect title="สรุปการจ้างงาน">
                    <Kv>
                      <Row k="ตำแหน่ง" v={p.label} />
                      {more && <Row k="ตำแหน่งควบ" v={more} />}
                      <Row k="แผนก" v={hrDept(p.dept).label} />
                      <Row k="ประเภทพนักงาน" v={HR_EMPTYPE[emp.type].label} />
                      <Row k="วันเริ่มงาน" v={thaiDate(emp.startedAt)} num />
                      <Row
                        k={emp.leftAt ? "ทำงานรวม" : "ทำงานมาแล้ว"}
                        v={empYears(emp.startedAt, today, emp.leftAt)}
                      />
                      {/* ไม่แสดงผู้บังคับบัญชาในหน้าข้อมูลพนักงาน (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
                    </Kv>
                  </Sect>
                  <Sect title="สรุปส่วนตัว">
                    <Kv>
                      <Row k="ชื่อเล่น" v={emp.nick || "—"} />
                      <Row k="เพศ" v={emp.sex} />
                      <Row k="วันเกิด" v={emp.birth ? thaiDate(emp.birth) : "—"} num />
                      <Row k="วุฒิการศึกษา" v={emp.edu || "—"} />
                      <Row k="โทรศัพท์" v={emp.phone || "—"} num />
                      <Row k="อีเมล" v={emp.email || "ไม่มี"} muted={!emp.email} />
                    </Kv>
                  </Sect>
                </div>

                {onProbation && (
                  <div className="mt-3 rounded-[12px] border border-border bg-muted/50 px-3.5 py-3">
                    <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                      ตอนนี้จ่ายค่าจ้างรายวัน ผ่านทดลองงานแล้วจะเปลี่ยนเป็นพนักงานประจำจ่ายรายเดือน
                      ฝ่ายบุคคลต้องระบุเงินเดือนที่จะใช้ตั้งแต่วันที่มีผล
                    </p>
                    <button type="button" className="btn solid btn-solid mt-2.5" onClick={onPass}>
                      บันทึกผ่านทดลองงาน
                    </button>
                  </div>
                )}

                {emp.edited && (
                  <p className="mt-3 text-[12px] text-muted-foreground">
                    แก้ไขข้อมูลล่าสุดโดย {emp.edited.by} · {thaiDate(emp.edited.at.slice(0, 10))}{" "}
                    {emp.edited.at.slice(11)} น.
                  </p>
                )}
              </>
            )}

            {tab === "person" && (
              <div className="space-y-3">
                <Sect title="ประวัติส่วนตัว">
                  <Kv>
                    <Row k="ชื่อ-สกุล" v={emp.nick ? `${emp.name} (${emp.nick})` : emp.name} />
                    <Row k="เพศ" v={emp.sex} />
                    <Row k="วันเกิด" v={emp.birth ? thaiDate(emp.birth) : "—"} num />
                    <Row k="วุฒิการศึกษา" v={emp.edu || "—"} />
                    <dt className="text-[12.5px] font-semibold text-muted-foreground">ประสบการณ์ทำงาน</dt>
                    <dd className="leading-relaxed">
                      {emp.exp.length ? (
                        <ul className="list-disc pl-5">
                          {emp.exp.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted-foreground">ไม่มี</span>
                      )}
                    </dd>
                  </Kv>
                </Sect>
                <Sect title="ข้อมูลติดต่อ">
                  <Kv>
                    <Row k="โทรศัพท์" v={emp.phone || "—"} num />
                    <Row k="อีเมล" v={emp.email || "ไม่มี"} muted={!emp.email} />
                    <Row k="ที่อยู่" v={emp.address || "—"} />
                    <Row
                      k="ผู้ติดต่อฉุกเฉิน"
                      v={
                        emp.sos.name
                          ? `${emp.sos.name}${emp.sos.rel ? ` (${emp.sos.rel})` : ""}${
                              emp.sos.phone ? ` · ${emp.sos.phone}` : ""
                            }`
                          : "ยังไม่ได้บันทึก"
                      }
                      muted={!emp.sos.name}
                    />
                  </Kv>
                </Sect>
              </div>
            )}

            {tab === "work" && (
              <div className="space-y-3">
                <Sect title="ข้อมูลการจ้างงาน">
                  <Kv>
                    <Row k="ตำแหน่ง" v={p.label} />
                    <Row k="แผนก" v={hrDept(p.dept).label} />
                    {/* ไม่แสดงผู้บังคับบัญชาในหน้าข้อมูลพนักงาน (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
                    <Row k="ประเภทพนักงาน" v={HR_EMPTYPE[emp.type].label} />
                    <Row k="วันเริ่มงาน" v={thaiDate(emp.startedAt)} num />
                  </Kv>
                </Sect>
                <Sect title="สถานะการทำงาน">
                  <Kv>
                    <Row k="สถานะ" v={HR_STATUS[emp.status].label} />
                    {emp.type === "probat" && (
                      <Row
                        k="ครบกำหนดทดลองงาน"
                        v={probLine(emp.startedAt, today)}
                        num
                        bad={probDaysLeft(emp.startedAt, today) < 0}
                      />
                    )}
                    <Row
                      k={emp.leftAt ? "ทำงานรวม" : "ทำงานมาแล้ว"}
                      v={empYears(emp.startedAt, today, emp.leftAt)}
                    />
                    {emp.leftAt && (
                      <Row k="พ้นสภาพ" v={`${thaiDate(emp.leftAt)} · ${emp.leftWhy ?? ""}`} num />
                    )}
                  </Kv>
                </Sect>
              </div>
            )}

            {tab === "docs" && (
              <Sect title="เอกสารประกอบ">
                <Docs emp={emp} />
              </Sect>
            )}

            {tab === "pay" && seePay && (
              <Sect title="ประวัติตำแหน่งและเงินเดือน">
                <p className="mb-2.5 text-[12.5px] text-muted-foreground">
                  เงินเดือนปัจจุบัน <b className="num text-foreground">{baht(cur.salary)}</b> บาท ·
                  เพิ่มเป็นแถวใหม่ทุกครั้งที่ปรับ ไม่ทับของเดิม
                </p>
                <History emp={emp} />
              </Sect>
            )}
          </div>
        </div>

        <div className="he-dfoot flex flex-none items-center gap-2.5 border-t border-border px-4 py-3.5 pb-[max(14px,env(safe-area-inset-bottom))] sm:justify-end sm:px-5">
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ปิด
          </button>
          <button type="button" className="btn solid btn-solid" onClick={onEdit}>
            แก้ไขข้อมูล
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── ชิ้นส่วนย่อย ─────────────────────────────────────────────────

function InfoBox({ k, v, num }: { k: string; v: string; num?: boolean }) {
  return (
    <div className="min-w-0 rounded-[10px] border border-border bg-muted/50 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{k}</div>
      <div className={`truncate text-[13px] font-semibold ${num ? "num" : ""}`} title={v}>
        {v}
      </div>
    </div>
  );
}

export function Sect({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="he-sect rounded-[12px] border border-border bg-muted/40 px-3.5 py-3">
      <h3 className="mb-2.5 text-[12.5px] font-bold text-primary">{title}</h3>
      {children}
    </section>
  );
}

function Kv({ children }: { children: React.ReactNode }) {
  return (
    <dl className="he-kv grid gap-2 text-[13.5px] sm:grid-cols-[130px_minmax(0,1fr)] sm:gap-x-3">{children}</dl>
  );
}

function Row({
  k,
  v,
  num,
  muted,
  bad,
}: {
  k: string;
  v: string;
  num?: boolean;
  muted?: boolean;
  bad?: boolean;
}) {
  return (
    <>
      <dt className="text-[12.5px] font-semibold text-muted-foreground">{k}</dt>
      <dd
        className={`leading-relaxed ${num ? "num font-semibold" : ""} ${
          bad ? "text-destructive" : muted ? "text-muted-foreground" : ""
        }`}
      >
        {v}
      </dd>
    </>
  );
}

/**
 * เอกสารประกอบ — บอกว่าขาดอะไรบ้าง ไม่ได้กันไม่ให้ทำอะไรต่อ (S-5)
 * เอกสารไม่ครบเป็นเรื่องที่ต้องตามเก็บ ไม่ใช่เหตุให้พนักงานใช้ระบบไม่ได้
 */
function Docs({ emp }: { emp: Employee }) {
  const missing = hrDocs().filter((d) => d.req && !emp.docs.includes(d.v));
  return (
    <>
      <ul className="text-[13px]">
        {hrDocs().map((d) => {
          const has = emp.docs.includes(d.v);
          const skin = has
            ? "bg-[var(--success-soft)] ring-[var(--success)]"
            : d.req
              ? "bg-[var(--destructive-soft)] ring-destructive"
              : "bg-muted ring-muted-foreground";
          return (
            <li
              key={d.v}
              className={`flex items-center gap-2.5 py-1.5 ${!has && !d.req ? "text-muted-foreground" : ""}`}
            >
              <i className={`size-4 flex-none rounded-full ring-[1.5px] ring-inset ${skin}`} />
              {d.label}
              {!has && (d.req ? " — ยังไม่ได้เก็บ" : " — ไม่มี")}
            </li>
          );
        })}
      </ul>
      <p
        className={`mt-2.5 rounded-[11px] border px-3.5 py-2.5 text-[12.5px] ${
          missing.length
            ? "border-[rgba(192,18,31,.2)] bg-[var(--destructive-soft)] text-destructive"
            : "border-border bg-card text-muted-foreground"
        }`}
      >
        {missing.length ? `ยังขาดเอกสารที่ต้องเก็บ ${missing.length} รายการ` : "เอกสารที่ต้องเก็บครบแล้ว"}
      </p>
    </>
  );
}

/** เรียงใหม่สุดขึ้นก่อน (BR-03) เพราะสิ่งที่ถามบ่อยที่สุดคือความเปลี่ยนแปลงล่าสุด */
function History({ emp }: { emp: Employee }) {
  const rows = [...emp.history].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="scroll-stable overflow-x-auto">
      <table className="data-table min-w-[420px] text-[12.5px]">
        <thead>
          <tr>
            <th style={{ width: 120 }}>วันที่มีผล</th>
            <th style={{ width: 120 }}>ตำแหน่ง</th>
            <th className="r" style={{ width: 110 }}>
              เงินเดือน
            </th>
            <th>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.at}-${r.salary}-${r.note}`}>
              <td className="num muted">{thaiDate(r.at)}</td>
              <td>{hrPos(r.pos).label}</td>
              <td className="r num font-semibold">{baht(r.salary)}</td>
              <td className="muted">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
