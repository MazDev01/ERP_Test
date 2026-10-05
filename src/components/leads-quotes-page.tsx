"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CloseLeadDialog } from "./lead-dialogs";
import { closeLead, reopenLead, useCrm } from "@/lib/crm-store";
import { quotationStateOf, quotationTotals, type Customer, type Quotation } from "@/lib/crm-data";
import { baht, initials, thaiDate, todayIso } from "@/lib/format";
import { serviceLabel } from "@/lib/pm-data";

/*
 * ผู้สนใจและใบเสนอราคา — เมนูรวมของฝ่ายขาย (ต้นแบบ quotations-mobile.html ผู้ใช้ส่งมา 29 ก.ย. 2569)
 * จัดลูกค้าตามขั้นของใบเสนอราคา: ยังไม่มีใบ → มีใบแล้ว · ส่วนที่พนักงานขายไม่ทำใบให้อยู่แท็บปฏิเสธแล้ว
 *
 * "ปฏิเสธ" ใช้สถานะลูกค้าเดิม (closeLead / reopenLead) ไม่ได้เก็บแยก — เหตุผลเลือกจากรายการที่ผู้ดูแลตั้ง (leadClose)
 * ลูกค้าที่ปิดงานไปแล้วโดยไม่มีใบ ไม่ขึ้นแท็บแรก เพราะไม่ได้รอให้ทำใบ
 */

type Tab = "todo" | "has" | "no";

const TABS: { key: Tab; label: string }[] = [
  { key: "todo", label: "ยังไม่มีใบ" },
  { key: "has", label: "มีใบแล้ว" },
  { key: "no", label: "ปฏิเสธแล้ว" },
];

const EMPTY: Record<Tab, string> = {
  todo: "ทำใบเสนอราคาครบทุกรายแล้ว",
  has: "ยังไม่มีลูกค้าที่มีใบเสนอราคา",
  no: "ยังไม่มีลูกค้าที่ปฏิเสธ",
};

/* สีพื้นตัวย่อชื่อ วนตามลำดับ — ตามต้นแบบ */
const TINTS = [
  "bg-[#FCE3E7] text-[#C0121F]",
  "bg-[#E3EEFC] text-[#1F6FD0]",
  "bg-[#DDF2E6] text-[#14875A]",
  "bg-[#FDEDD6] text-[#B4630B]",
  "bg-[#ECE6FA] text-[#5B3FBF]",
];

type Row = {
  c: Customer;
  tab: Tab;
  tint: string;
  /** ใบล่าสุดที่ยังไม่ถูกออกใบใหม่แทน */
  q?: Quotation;
  quoteCount: number;
  summary: string;
  followUp: string;
  /** วันที่ถูกปฏิเสธ — จากประวัติการเปลี่ยนสถานะ */
  declinedAt: string;
  /** ข้อความรวมของการ์ดสำหรับค้นหา (ตัวเล็ก ตัดช่องว่างกับขีดออก) */
  hay: string;
};

const norm = (s: string) => s.toLowerCase().replace(/[\s-]+/g, "");

export function LeadsQuotesPage() {
  const crm = useCrm();
  const today = todayIso();
  const [tab, setTab] = useState<Tab>("todo");
  const [declining, setDeclining] = useState<Customer | null>(null);
  /* ค้นหาบนมือถือ (ต้นแบบ qm-search) — ตัวเลขบนแท็บนับก่อนกรองตามต้นแบบ */
  const [query, setQuery] = useState("");

  const hasDeal = useMemo(() => new Set(crm.deals.map((d) => d.quotationNo)), [crm.deals]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    crm.customers.forEach((c, i) => {
      const qs = crm.quotations
        .filter((q) => q.customerCode === c.code && !q.replacedBy)
        .sort((a, b) => ((a.issued || a.createdAt) < (b.issued || b.createdAt) ? 1 : -1));
      const tab: Tab | null =
        c.status === "ปฏิเสธ" ? "no" : qs.length ? "has" : c.status === "ปิดงาน" ? null : "todo";
      if (!tab) return;
      const acts = crm.activities
        .filter((a) => a.customerCode === c.code)
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      const declined = crm.changeLogs
        .filter((l) => l.customerCode === c.code && l.kind === "status" && l.to === "ปฏิเสธ")
        .sort((a, b) => (a.at < b.at ? 1 : -1))[0];
      out.push({
        c,
        tab,
        tint: TINTS[i % TINTS.length],
        q: qs[0],
        quoteCount: qs.length,
        summary: acts[0]?.summary ?? "",
        followUp: acts.find((a) => a.followUp)?.followUp ?? "",
        declinedAt: declined?.at ?? "",
        hay: norm(
          [
            c.name,
            c.contact,
            c.phone,
            c.code,
            c.source,
            acts[0]?.summary,
            c.closedReason,
            qs[0]?.no,
            qs[0]?.service ? serviceLabel(qs[0].service) : "",
          ]
            .filter(Boolean)
            .join(" "),
        ),
      });
    });
    return out;
  }, [crm.customers, crm.quotations, crm.activities, crm.changeLogs]);

  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.key, rows.filter((r) => r.tab === t.key).length])) as Record<Tab, number>,
    [rows],
  );
  const tabRows = rows.filter((r) => r.tab === tab);
  const needle = norm(query);
  const list = needle ? tabRows.filter((r) => r.hay.includes(needle)) : tabRows;

  return (
    <div>
      <div className="bar">
        <div>
          <h1>ผู้สนใจและใบเสนอราคา</h1>
          <p>ลูกค้าที่ยังไม่มีใบ ลูกค้าที่มีใบแล้ว และรายที่ไม่ทำใบให้</p>
        </div>
        <div className="tools">
          <Link href="/quotations/new" className="btn solid btn-solid">
            <PlusIcon /> สร้างใบเสนอราคา
          </Link>
        </div>
      </div>

      {/* ช่องค้นหา — เฉพาะมือถือ (ต้นแบบ qm-search) จอคอมคงเดิม */}
      <div className="mt-[10px] mb-[2px] flex h-11 items-center gap-2 rounded-full border border-[#EFE6E8] bg-white px-3.5 md:hidden">
        <span className="flex-none text-[#8A7E81]">
          <Svg size={18}>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </Svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อลูกค้า ผู้ติดต่อ หรือเบอร์โทร"
          aria-label="ค้นหาผู้สนใจและใบเสนอราคา"
          className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-[#2A1F22] outline-none placeholder:text-[#9A8E91] [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            aria-label="ล้างคำค้นหา"
            onClick={() => setQuery("")}
            className="grid size-[26px] flex-none place-items-center rounded-full bg-[#F3EEF0] text-[#6E6164]"
          >
            <Svg size={12}>
              <path d="M6 6l12 12M18 6 6 18" />
            </Svg>
          </button>
        )}
      </div>

      {/* แท็บเส้นใต้ — ตามต้นแบบ */}
      <nav role="tablist" aria-label="สถานะลูกค้า" className="grid grid-cols-3 border-b-[1.5px] border-[#F2E7E8]">
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.key)}
              className={`relative h-[46px] text-[14.5px] font-semibold ${on ? "text-primary" : "text-muted-foreground"}`}
            >
              {t.label}
              <span
                className={`ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-[10px] px-1.5 align-[1px] text-[11px] ${
                  on ? "bg-primary text-white" : "bg-[#F1E8EA] text-[#6E6164]"
                }`}
              >
                {counts[t.key]}
              </span>
              {on && <span className="absolute right-[18%] -bottom-[1.5px] left-[18%] h-[3px] rounded-t-[3px] bg-primary" />}
            </button>
          );
        })}
      </nav>

      <div role="tabpanel" className="grid gap-3.5 py-4 lg:grid-cols-2">
        {tabRows.length > 0 && list.length === 0 ? (
          <p className="mx-4 my-7 text-center text-sm text-[#9A8E91] lg:col-span-2">ไม่พบรายการที่ค้นหา</p>
        ) : list.length === 0 ? (
          <p className="py-12 text-center text-[13.5px] text-muted-foreground lg:col-span-2">
            <span className="mx-auto mb-3 grid size-14 place-items-center rounded-[18px] bg-[#DDF2E6] text-[#14875A]">
              <CheckCircleIcon />
            </span>
            {EMPTY[tab]}
          </p>
        ) : (
          list.map((r) => (
            <Card
              key={r.c.code}
              r={r}
              hasDeal={r.q ? hasDeal.has(r.q.no) : false}
              today={today}
              onDecline={() => setDeclining(r.c)}
            />
          ))
        )}
      </div>

      {declining && (
        <CloseLeadDialog
          customerName={declining.name}
          code={declining.code}
          onClose={() => setDeclining(null)}
          onSubmit={(reason) => {
            closeLead(declining.code, reason);
            setDeclining(null);
          }}
        />
      )}
    </div>
  );
}

function Card({
  r,
  hasDeal,
  today,
  onDecline,
}: {
  r: Row;
  hasDeal: boolean;
  today: string;
  onDecline: () => void;
}) {
  const { c, q } = r;
  const leadHref = `/leads/${encodeURIComponent(c.code)}`;

  let side: React.ReactNode = null;
  let body: React.ReactNode;
  let acts: React.ReactNode;

  if (r.tab === "has" && q) {
    const st = quotationStateOf(q, hasDeal, today);
    /* ไม่มีร่างแล้ว ทุกใบมีเลขที่ (ผู้ใช้สั่ง 5 ต.ค. 2569) */
    const viewHref = `/quotations/${encodeURIComponent(q.no)}`;
    side = (
      <span className="flex-none text-right text-sm font-bold whitespace-nowrap tabular-nums">
        {baht(quotationTotals(q).grand)} ฿<small className="block text-[10.5px] font-medium text-muted-foreground">ใบล่าสุด</small>
      </span>
    );
    body = (
      <>
        <Meta icon={<DocIcon />}>
          <span className="truncate">{q.no}</span>
          {q.service && (
            <>
              <i className="size-1 flex-none rounded-full bg-[#A3979A]" />
              <span className="truncate">{serviceLabel(q.service)}</span>
            </>
          )}
        </Meta>
        <Meta icon={<UserIcon />}>
          <span className="truncate">
            {c.contact} · {c.phone}
          </span>
        </Meta>
        <span className={`tag ${st.cls} mt-1.5`}>
          {st.label}
          {r.quoteCount > 1 ? ` · ทั้งหมด ${r.quoteCount} ใบ` : ""}
        </span>
      </>
    );
    acts = (
      <div className="mt-3.5 grid grid-cols-2 gap-2.5 max-md:flex max-md:justify-center max-md:gap-2">
        <ActLink href={viewHref}>ดูรายละเอียด</ActLink>
        <ActLink href={`/quotations/new?from=${encodeURIComponent(q.no)}`} primary>
          สร้างฉบับใหม่
        </ActLink>
      </div>
    );
  } else {
    if (r.followUp)
      side = (
        <span className="flex-none text-right text-[11px] whitespace-nowrap text-muted-foreground">
          นัดติดตาม<b className="block text-[13px] text-foreground">{thaiDate(r.followUp)}</b>
        </span>
      );
    body = (
      <>
        <Meta icon={<UserIcon />}>
          <span className="truncate">
            {c.contact} · {c.phone}
          </span>
        </Meta>
        <Meta icon={<NoteIcon />}>
          <span className="truncate">{r.summary || "ยังไม่มีบันทึกการติดต่อ"}</span>
        </Meta>
        <span className="mt-1.5 inline-block rounded-lg bg-[#ECE6FA] px-2.5 py-[3px] text-[11.5px] font-bold text-[#5B3FBF]">
          มาจาก {c.source || "ไม่ระบุ"}
        </span>
        {r.tab === "no" && (
          <p className="mt-2.5 rounded-xl bg-[#FBF5F5] px-3 py-2.5 text-[12.5px] text-[#6E6164]">
            <b>เหตุผล:</b> {c.closedReason || "—"}
            {r.declinedAt && (
              <small className="block text-muted-foreground">ปฏิเสธเมื่อ {thaiDate(r.declinedAt.slice(0, 10))}</small>
            )}
          </p>
        )}
      </>
    );
    acts =
      r.tab === "todo" ? (
        <div className="mt-3.5 grid grid-cols-2 gap-2.5 max-md:flex max-md:justify-center max-md:gap-2">
          <ActButton onClick={onDecline}>ปฏิเสธ</ActButton>
          <ActLink href={`/quotations/new?customer=${encodeURIComponent(c.code)}`} primary>
            สร้างใบเสนอราคา
          </ActLink>
        </div>
      ) : (
        <div className="mt-3.5 grid max-md:flex max-md:justify-center">
          <ActButton onClick={() => reopenLead(c.code)}>ยกเลิกการปฏิเสธ</ActButton>
        </div>
      );
  }

  return (
    <article className="rounded-[22px] bg-card p-3.5 shadow-[0_1px_2px_rgba(120,20,35,.05),0_12px_28px_-18px_rgba(120,20,35,.3)]">
      {/* มือถือ: แตะส่วนบนของการ์ดเปิดหน้า Lead (ต้นแบบ qm-lead-link) — จอคอมกดที่ชื่อเหมือนเดิม */}
      <div className="relative grid grid-cols-[78px_minmax(0,1fr)] gap-3.5 max-md:cursor-pointer">
        <Link href={leadHref} tabIndex={-1} aria-hidden="true" className="absolute inset-0 z-[1] md:hidden" />
        <span className="pointer-events-none absolute top-[2px] right-0 z-[2] text-[#B3A7AA] md:hidden">
          <Svg size={16}>
            <path d="m9 6 6 6-6 6" />
          </Svg>
        </span>
        <span className={`grid size-[78px] place-items-center rounded-[20px] text-[22px] font-bold ${r.tint}`}>
          {initials(c.name)}
        </span>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2 max-md:pr-[18px]">
            <Link href={leadHref} className="line-clamp-2 min-w-0 text-[15.5px] leading-[1.35] font-bold hover:text-primary">
              {c.name}
            </Link>
            {side}
          </div>
          {body}
        </div>
      </div>
      {acts}
    </article>
  );
}

function Meta({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="mt-[5px] flex min-w-0 items-center gap-1.5 text-[12.5px] text-[#6E6164]">
      <span className="flex-none text-primary">{icon}</span>
      {children}
    </p>
  );
}

/* มือถือ: ปุ่มเล็กลงและจัดกลาง (ต้นแบบ .qc .acts) — จอคอมเป็นปุ่มเต็มช่องเหมือนเดิม */
const ACT =
  "flex h-11 items-center justify-center rounded-[14px] text-sm font-semibold active:scale-[.98] max-md:h-9 max-md:w-auto max-md:rounded-[10px] max-md:px-3.5 max-md:text-[13px]";
const ACT_SEC = "bg-[#F7EFF1] text-foreground";
const ACT_PRI = "bg-primary text-white shadow-[0_10px_18px_-12px_rgba(208,2,27,.9)] max-md:shadow-none";

function ActLink({ href, primary, children }: { href: string; primary?: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`${ACT} ${primary ? ACT_PRI : ACT_SEC}`}>
      {children}
    </Link>
  );
}

function ActButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`${ACT} ${ACT_SEC}`}>
      {children}
    </button>
  );
}

/* ไอคอนเส้นขนาดเล็กตามต้นแบบ */
function Svg({ children, size = 15 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
const UserIcon = () => (
  <Svg>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
  </Svg>
);
const DocIcon = () => (
  <Svg>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Svg>
);
const NoteIcon = () => (
  <Svg>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="m13 7 4 4" />
  </Svg>
);
const PlusIcon = () => (
  <Svg size={16}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
const CheckCircleIcon = () => (
  <Svg size={26}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.2 2.4 2.4 4.6-4.8" />
  </Svg>
);
