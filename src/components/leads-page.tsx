"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  CHANGE_KIND,
  STALE_DAYS,
  type ChangeLog,
  type Customer,
  type CustomerStatus,
  CUSTOMER_STATUS,
} from "@/lib/crm-data";
import { useCrm } from "@/lib/crm-store";
import { daysBetween, thaiDate, todayIso } from "@/lib/format";
import { ClockIcon, PhoneIcon, PlusIcon } from "./icons";
import { LeadNewDialog } from "./lead-form";
import { ChangeFromTo, Pager, SearchBox, TabStrip, Who, usePaged } from "./sales-ui";

const PER_PAGE = 7;

type TabKey = "all" | CustomerStatus | "log";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "รอนัดหมาย", label: "รอนัดหมาย" },
  { key: "ปฏิเสธ", label: "ปฏิเสธ" },
  { key: "ปิดงาน", label: "ปิดงาน" },
  { key: "log", label: "ประวัติการเปลี่ยนแปลง" },
];

export function LeadsPage() {
  const crm = useCrm();
  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
  const [staleOnly, setStaleOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const today = todayIso();

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

  const isStale = (c: Customer) =>
    c.status === "รอนัดหมาย" &&
    daysBetween(lastContact[c.code] ?? "2000-01-01", today) > STALE_DAYS;

  const scoped = useMemo(() => {
    const q = query.trim().toLowerCase();
    return crm.customers.filter((c) => {
      if (staleOnly && !isStale(c)) return false;
      if (!q) return true;
      return `${c.name} ${c.contact} ${c.phone} ${c.code}`.toLowerCase().includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crm.customers, query, staleOnly, lastContact, today]);

  const logs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byCode = new Map(crm.customers.map((c) => [c.code, c.name]));
    return crm.changeLogs
      .filter((l) =>
        !q ||
        `${byCode.get(l.customerCode) ?? ""} ${l.customerCode} ${l.reason}`
          .toLowerCase()
          .includes(q),
      )
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((l) => ({ ...l, name: byCode.get(l.customerCode) ?? l.customerCode }));
  }, [crm.changeLogs, crm.customers, query]);

  const rows = tab === "all" || tab === "log" ? scoped : scoped.filter((c) => c.status === tab);
  const paged = usePaged<Customer | LogRow>(tab === "log" ? logs : rows, PER_PAGE);

  const counts: Record<string, number> = {
    all: scoped.length,
    รอนัดหมาย: scoped.filter((c) => c.status === "รอนัดหมาย").length,
    ปิดงาน: scoped.filter((c) => c.status === "ปิดงาน").length,
    ปฏิเสธ: scoped.filter((c) => c.status === "ปฏิเสธ").length,
    log: logs.length,
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
          <p>พบ {tab === "log" ? logs.length : rows.length} รายการ</p>
        </div>
        <div className="tools w-full flex-wrap sm:w-auto">
          <SearchBox
            value={query}
            onChange={(v) => {
              setQuery(v);
              paged.setPage(1);
            }}
            placeholder="ค้นหาชื่อ ผู้ติดต่อ เบอร์โทร หรือรหัส"
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
          {tab !== "log" && (
            <button
              type="button"
              onClick={() => {
                setStaleOnly((v) => !v);
                paged.setPage(1);
              }}
              aria-pressed={staleOnly}
              className={`btn my-2 ${staleOnly ? "bg-accent font-semibold text-primary" : "glass-thin"}`}
            >
              {/* ไอคอนนาฬิกาหน้าป้ายตัวกรอง ตามต้นแบบ leads.html */}
              <ClockIcon className="size-[13px]" strokeWidth={2} />
              ค้างติดตาม
            </button>
          )}
        </div>

        {tab === "log" ? (
          <LogTable rows={paged.list as LogRow[]} />
        ) : (
          <CustomerTable
            rows={paged.list as Customer[]}
            lastContact={lastContact}
            today={today}
            isStale={isStale}
          />
        )}

        <div className="foot flex-col items-stretch gap-3 text-center sm:flex-row sm:items-center sm:text-left">
          <span>{paged.range("รายการ")}</span>
          {/* ไม่มีผลลัพธ์ก็ไม่ต้องแสดงปุ่มแบ่งหน้า ตาม mockup */}
          {paged.list.length > 0 && (
            <Pager page={paged.page} maxPage={paged.maxPage} onChange={paged.setPage} />
          )}
        </div>
      </section>
    </div>
  );
}

function CustomerTable({
  rows,
  lastContact,
  today,
  isStale,
}: {
  rows: Customer[];
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
        <table className="data-table min-w-[900px]">
          <thead>
            <tr>
              <th style={{ width: 132 }}>รหัส</th>
              <th style={{ width: "26%" }}>ชื่อผู้สนใจ / บริษัท</th>
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
                  <td className="num muted">
                    <Link href={`/leads/${c.code}`} className="lnk-code">
                      {c.code}
                    </Link>
                  </td>
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
                <Who name={c.name} sub={c.code} />
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

/** แถวประวัติ = ChangeLog บวกชื่อลูกค้าที่หาไว้ล่วงหน้าแล้ว */
type LogRow = ChangeLog & { name: string };

function LogTable({ rows }: { rows: LogRow[] }) {
  if (!rows.length) {
    return <p className="px-5 py-14 text-center text-muted-foreground">ยังไม่มีประวัติการเปลี่ยนแปลง</p>;
  }
  return (
    <>
      <div className="scroll-stable hidden min-h-0 flex-1 overflow-auto md:block">
        <table className="data-table min-w-[880px]">
          <thead>
            <tr>
              <th style={{ width: 120 }}>วันที่</th>
              <th style={{ width: "24%" }}>ลูกค้า</th>
              <th style={{ width: 130 }}>ประเภท</th>
              <th style={{ width: "26%" }}>การเปลี่ยนแปลง</th>
              <th>เหตุผล</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="num muted">{thaiDate(l.at)}</td>
                <td>
                  <Link href={`/leads/${l.customerCode}`}>
                    <Who name={l.name} />
                  </Link>
                </td>
                <td className="muted">{CHANGE_KIND[l.kind]}</td>
                <td>
                  <ChangeFromTo log={l} />
                </td>
                <td className="muted">{l.reason || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border md:hidden">
        {rows.map((l) => (
          <li key={l.id} className="px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <Who name={l.name} />
              <span className="num shrink-0 text-xs text-muted-foreground">{thaiDate(l.at)}</span>
            </div>
            <p className="mt-1 text-[11.5px] text-muted-foreground">{CHANGE_KIND[l.kind]}</p>
            <p className="mt-2 flex flex-wrap items-center gap-1.5">
              <ChangeFromTo log={l} />
            </p>
            {l.reason && <p className="mt-1.5 text-sm break-words">{l.reason}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}
