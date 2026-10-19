"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  STALE_DAYS,
  type Customer,
  type CustomerStatus,
  CUSTOMER_STATUS,
  rejectInfo,
} from "@/lib/crm-data";
import { useCrm } from "@/lib/crm-store";
import { daysBetween, thaiDate, todayIso } from "@/lib/format";
import { stackNo } from "@/lib/stack-no";
import { createdKey, setSort, usePipePrefs, type SortDir } from "@/lib/pipeline-cols";
import { useProfile } from "@/lib/profile-data";
import { useRole } from "@/lib/role";
import { ClockIcon, PhoneIcon, PlusIcon } from "./icons";
import { LeadNewDialog } from "./lead-form";
import { LeadsFollowup } from "./leads-followup";
import { LeadsPipeline } from "./leads-pipeline";
import { Pager, SearchBox, TabStrip, Who, usePaged } from "./sales-ui";

const PER_PAGE = 7;

/* ปิดงานแล้ว = เป็นลูกค้า/ดีลไปแล้ว ไม่ขึ้นในหน้าผู้สนใจ ไม่มีแท็บปิดงาน (ผู้ใช้สั่ง 9 ต.ค. 2569) */
/* เอาแท็บประวัติการเปลี่ยนแปลงออก ข้อมูลยังเก็บอยู่ (ผู้ใช้สั่ง 9 ต.ค. 2569) */
type TabKey = "all" | Exclude<CustomerStatus, "ปิดงาน">;

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "รอนัดหมาย", label: "รอนัดหมาย" },
  { key: "ปฏิเสธ", label: "ปฏิเสธ" },
];

export function LeadsPage() {
  const crm = useCrm();
  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
  const [staleOnly, setStaleOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  /* มุมมองรายการ | Pipeline — เป็นโหมดแสดงผลของหน้าเดียวกัน ไม่ใช่เมนูนำทาง (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  /* เพิ่มมุมมองแผนติดตาม เฉพาะพนักงานขาย — บทบาทอื่นไม่เห็นปุ่มนี้ (ผู้ใช้สั่ง 14 ต.ค. 2569) */
  const isSales = useRole() === "sales";
  const [viewPick, setView] = useState<"list" | "pipeline" | "followup">("list");
  const view = viewPick === "followup" && !isSales ? "list" : viewPick;
  const router = useRouter();
  const today = todayIso();
  /* ตัวเลือกการเรียงจำแยกตามพนักงาน ใช้ทั้ง Pipeline และรายการ (ผู้ใช้สั่ง 14 ต.ค. 2569) */
  const profile = useProfile();
  const user = profile.employeeId;
  const sort = usePipePrefs(user).sort;

  /** วันที่ติดต่อล่าสุดของลูกค้าแต่ละราย ใช้ทั้งแสดงผลและหาผู้สนใจที่ค้าง */
  const lastContact = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of crm.activities) {
      if (!map[a.customerCode] || a.date > map[a.customerCode]) {
        map[a.customerCode] = a.date;
      }
    }
    return map;
  }, [crm.activities]);

  /** วันติดต่อครั้งแรก — ใช้แทนวันที่สร้างซึ่งไม่มีในข้อมูลผู้สนใจ (ผู้ใช้สั่ง 14 ต.ค. 2569) */
  const firstContact = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of crm.activities) {
      if (!map[a.customerCode] || a.date < map[a.customerCode]) map[a.customerCode] = a.date;
    }
    return map;
  }, [crm.activities]);

  const isStale = (c: Customer) =>
    c.status === "รอนัดหมาย" &&
    daysBetween(lastContact[c.code] ?? "2000-01-01", today) > STALE_DAYS;

  /*
   * ลำดับแบบกองซ้อน — นับจากผู้สนใจทั้งหมดก่อนกรองแท็บ/ค้นหา ใหม่สุดเลขมากสุดอยู่บน (ผู้ใช้สั่ง 12 ต.ค. 2569)
   * ผู้สนใจไม่มีวันที่สร้าง ใช้รหัสเดิม (ปีเดือน-เลขรัน) แทนลำดับการสร้าง
   */
  const noOf = useMemo(
    () =>
      stackNo(
        crm.customers.filter((c) => c.status !== "ปิดงาน"),
        (c) => (c.leadCode ?? c.code).replace(/^[A-Z]+-/, ""),
        (c) => c.code,
      ),
    [crm.customers],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return crm.customers.filter((c) => {
      /* ลูกค้าที่ปิดการขายแล้ว (ปิดงาน) ไปอยู่ที่หน้าดีล — ข้อมูลยังอยู่ แค่ไม่แสดงที่นี่ (ผู้ใช้สั่ง 9 ต.ค. 2569) */
      if (c.status === "ปิดงาน") return false;
      if (staleOnly && !isStale(c)) return false;
      if (!q) return true;
      return `${c.name} ${c.contact} ${c.phone} ${c.code}`.toLowerCase().includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crm.customers, query, staleOnly, lastContact, today]);
  /* เรียงเป็นอาร์เรย์ใหม่ — Pipeline จับการเปลี่ยนลำดับได้ (ผู้ใช้สั่ง 14 ต.ค. 2569) */
  const scoped = useMemo(() => [...filtered].sort((a, b) => {
    /* ใหม่สุดอยู่บนเป็นค่าตั้งต้น (ผู้ใช้สั่ง 12 ต.ค. 2569) · สลับเป็นเก่าสุดก่อนได้ (ผู้ใช้สั่ง 14 ต.ค. 2569) */
    const ka = createdKey(a.code, a.leadCode, firstContact[a.code] ?? "", a.createdAt);
    const kb = createdKey(b.code, b.leadCode, firstContact[b.code] ?? "", b.createdAt);
    const d = kb.localeCompare(ka) || (noOf.get(b.code) ?? 0) - (noOf.get(a.code) ?? 0);
    return sort === "old" ? -d : d;
  }), [filtered, firstContact, noOf, sort]);

  const rows = tab === "all" ? scoped : scoped.filter((c) => c.status === tab);
  const paged = usePaged(rows, PER_PAGE);

  const counts: Record<string, number> = {
    all: scoped.length,
    รอนัดหมาย: scoped.filter((c) => c.status === "รอนัดหมาย").length,
    ปฏิเสธ: scoped.filter((c) => c.status === "ปฏิเสธ").length,
  };

  return (
    <div className="space-y-4">
      {adding && (
        <LeadNewDialog
          onClose={() => setAdding(false)}
          onCreated={(code) => {
            setAdding(false);
            router.push(`/leads/${code}`);
          }}
        />
      )}

      <div className="bar">
        <div>
          <h1>ผู้สนใจ</h1>
          <p>พบ {view === "list" ? rows.length : scoped.length} รายการ</p>
        </div>
        <div className="tools w-full flex-wrap sm:w-auto">
          <div className="seg glass-thin shrink-0" role="group" aria-label="มุมมอง">
            <button type="button" className={view === "list" ? "on" : ""} aria-pressed={view === "list"} onClick={() => setView("list")}>
              รายการ
            </button>
            <button type="button" className={view === "pipeline" ? "on" : ""} aria-pressed={view === "pipeline"} onClick={() => setView("pipeline")}>
              Pipeline
            </button>
            {isSales && (
              <button type="button" className={view === "followup" ? "on" : ""} aria-pressed={view === "followup"} onClick={() => setView("followup")}>
                แผนติดตาม
              </button>
            )}
          </div>
          <SearchBox
            value={query}
            onChange={(v) => {
              setQuery(v);
              paged.setPage(1);
            }}
            placeholder="ค้นหาชื่อ ผู้ติดต่อ หรือเบอร์โทร"
          />
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="btn solid btn-solid btn-block-mobile shrink-0"
          >
            <PlusIcon className="size-[15px]" strokeWidth={2.2} />
            เพิ่มผู้สนใจ
          </button>
        </div>
      </div>

      {view !== "list" ? (
        <>
          {/* Pipeline/แผนติดตาม ใช้ตัวค้นหา ตัวกรอง และการเรียงชุดเดียวกับรายการ แต่ไม่มีแท็บสถานะ เพราะคอลัมน์แทนแท็บแล้ว (ผู้ใช้สั่ง 14 ต.ค. 2569) */}
          <div className="flex flex-wrap justify-end gap-2">
            <SortSelect value={sort} onChange={(v) => setSort(user, v)} />
            <button
              type="button"
              onClick={() => setStaleOnly((v) => !v)}
              aria-pressed={staleOnly}
              className={`btn ${staleOnly ? "bg-accent font-semibold text-primary" : "glass-thin"}`}
            >
              <ClockIcon className="size-[13px]" strokeWidth={2} />
              ค้างติดตาม
            </button>
          </div>
          {view === "pipeline" ? (
            <LeadsPipeline crm={crm} rows={scoped} today={today} isStale={isStale} />
          ) : (
            <LeadsFollowup crm={crm} rows={scoped} today={today} user={user} by={profile.name} />
          )}
        </>
      ) : (
      <section className="panel glass flex flex-col">
        <div className="strip">
          <TabStrip
            tabs={TABS}
            value={tab}
            counts={counts}
            onChange={(k) => {
              setTab(k);
              paged.setPage(1);
            }}
          />
          <div className="my-2 flex items-center gap-2">
          <SortSelect
            value={sort}
            onChange={(v) => {
              setSort(user, v);
              paged.setPage(1);
            }}
          />
          <button
              type="button"
              onClick={() => {
                setStaleOnly((v) => !v);
                paged.setPage(1);
              }}
              aria-pressed={staleOnly}
              className={`btn ${staleOnly ? "bg-accent font-semibold text-primary" : "glass-thin"}`}
            >
              {/* ไอคอนนาฬิกาหน้าป้ายตัวกรอง ตามต้นแบบ leads.html */}
              <ClockIcon className="size-[13px]" strokeWidth={2} />
              ค้างติดตาม
            </button>
          </div>
        </div>

        <CustomerTable rows={paged.list} noOf={noOf} lastContact={lastContact} today={today} isStale={isStale} />

        <div className="foot flex-col items-stretch gap-3 text-center sm:flex-row sm:items-center sm:text-left">
          <span>{paged.range("รายการ")}</span>
          {/* ไม่มีผลลัพธ์ก็ไม่ต้องแสดงปุ่มแบ่งหน้า ตาม mockup */}
          {paged.list.length > 0 && (
            <Pager page={paged.page} maxPage={paged.maxPage} onChange={paged.setPage} />
          )}
        </div>
      </section>
      )}
    </div>
  );
}

/** ตัวเลือกการเรียงตามวันที่สร้าง (ใช้วันติดต่อครั้งแรกแทน) (ผู้ใช้สั่ง 14 ต.ค. 2569) */
function SortSelect({ value, onChange }: { value: SortDir; onChange: (v: SortDir) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortDir)}
      aria-label="เรียงลำดับ"
      className="field-control h-9 !w-[150px] flex-none cursor-pointer pr-8 text-[13px]"
    >
      <option value="new">ล่าสุด → เก่าสุด</option>
      <option value="old">เก่าสุด → ล่าสุด</option>
    </select>
  );
}

function CustomerTable({
  rows,
  noOf,
  lastContact,
  today,
  isStale,
}: {
  rows: Customer[];
  noOf: Map<string, number>;
  lastContact: Record<string, string>;
  today: string;
  isStale: (c: Customer) => boolean;
}) {
  const router = useRouter();
  if (!rows.length) {
    return <p className="px-5 py-14 text-center text-muted-foreground">ไม่พบรายการที่ตรงกับเงื่อนไข</p>;
  }
  return (
    <>
      <div className="scroll-stable hidden min-h-0 flex-1 overflow-auto md:block">
        <table className="data-table min-w-[840px]">
          <thead>
            <tr>
              <th className="c" style={{ width: 60 }}>ลำดับ</th>
              {/* ไม่มีคอลัมน์รหัส — รหัสอยู่ในฐานข้อมูลเท่านั้น (ผู้ใช้สั่ง 14 ต.ค. 2569) */}
              <th style={{ width: "32%" }}>ชื่อผู้สนใจ / บริษัท</th>
              <th style={{ width: "18%" }}>ผู้ติดต่อ</th>
              <th style={{ width: "15%" }}>เบอร์โทรศัพท์</th>
              <th style={{ width: "18%" }}>ติดต่อล่าสุด</th>
              <th style={{ width: 120 }}>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const last = lastContact[c.code] ?? "";
              return (
                /* กดได้ทั้งแถวตามต้นแบบ — เปิดหน้ารายละเอียดของรายนั้น */
                <tr
                  key={c.code}
                  tabIndex={0}
                  style={{ cursor: "pointer" }}
                  onClick={() => router.push(`/leads/${c.code}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") router.push(`/leads/${c.code}`);
                  }}
                >
                  <td className="c num muted">{noOf.get(c.code)}</td>
                  <td>
                    <Link href={`/leads/${c.code}`}>
                      <Who name={c.name} />
                    </Link>
                  </td>
                  {/* clip เป็น display:block ใส่บน td ไม่ได้ ช่องจะหลุดออกจากตาราง ต้องหุ้มด้วย span */}
                  <td className="muted">
                    <span className="clip">{c.contact || "—"}</span>
                  </td>
                  <td className="num muted">{c.phone || "—"}</td>
                  <td className="num muted">
                    {last ? thaiDate(last) : "—"}
                    {isStale(c) && (
                      <span className="diff late">{daysBetween(last, today)} วัน</span>
                    )}
                  </td>
                  {/* ตามต้นแบบ leads.html — ป้ายสถานะธรรมดา เปลี่ยนสถานะได้ที่หน้ารายละเอียด */}
                  <td>
                    <span className={`tag ${CUSTOMER_STATUS[c.status]}`}>
                      <i />
                      {c.status}
                    </span>
                    {/* เหตุผลที่ปฏิเสธดูได้ในหน้ารายละเอียด ไม่แสดงในตาราง (ผู้ใช้สั่ง 16 ต.ค. 2569) */}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border md:hidden">
        {rows.map((c) => (
          <li key={c.code} className="relative">
            <span className={`tag absolute top-4 right-5 z-[1] ${CUSTOMER_STATUS[c.status]}`}>
              <i />
              {c.status}
            </span>
            <Link href={`/leads/${c.code}`} className="block px-5 py-4 max-sm:pr-16 max-sm:pl-4">
              <div className="flex items-start justify-between gap-3 pr-28">
                <Who name={c.name} sub={`#${noOf.get(c.code)}`} />
              </div>
              <p className="mt-2 text-[13px] text-muted-foreground">
                {c.contact || "ยังไม่ได้กรอกผู้ติดต่อ"}
                {c.phone && <span className="num"> · {c.phone}</span>}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                ติดต่อล่าสุด {lastContact[c.code] ? thaiDate(lastContact[c.code]) : "—"}
                {isStale(c) && (
                  <span className="font-semibold text-destructive">
                    {" "}· ค้าง {daysBetween(lastContact[c.code] ?? "", today)} วัน
                  </span>
                )}
              </p>
            </Link>
            {/* มือถือ: ปุ่มโทรออกท้ายการ์ด กดโทรหาผู้ติดต่อได้เลยไม่ต้องเข้าหน้ารายละเอียด */}
            {c.phone && (
              <a
                href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}
                aria-label={`โทรหา ${c.contact || c.name}`}
                className="absolute right-4 bottom-4 z-[1] grid size-10 place-items-center rounded-full border border-border bg-card text-primary sm:hidden"
              >
                <PhoneIcon className="size-[17px]" strokeWidth={2} />
              </a>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
