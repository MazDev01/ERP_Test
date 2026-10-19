"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useFindParam } from "@/lib/deep-link";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  PRESALES_OPEN,
  PRESALES_STATUS,
  type PresalesRequest,
  type PresalesRound,
  type PresalesStatus,
} from "@/lib/crm-data";
import { closePresales, replyPresalesInfo, useCrm } from "@/lib/crm-store";
import { daysBetween, thaiDate, thaiStamp, todayIso } from "@/lib/format";
import { psEventsOf, type PmEvent } from "@/lib/pm-schedule-data";
import { useSchedule } from "@/lib/pm-schedule-store";
import { psKindText, psLastAsk, psThreadOf, usePsThreads, addPsReply } from "@/lib/presales-work";
import { useNameOf } from "@/lib/emp-name";
import { ChevronDownIcon, ClockIcon, DownloadIcon, FileIcon, EyeIcon, LinkIcon, PlusIcon } from "./icons";
import { ConfirmDialog } from "./confirm-dialog";
import { FileDrop, type PickedFile } from "./file-drop";
import { Sheet } from "./lead-dialogs";
import { PsThread } from "./presales-work-page";
import { ProposalDialog, isCanva } from "./proposal-doc";
import { Pager, SearchBox, TabStrip, Who, usePaged } from "./sales-ui";
import { stackNo } from "@/lib/stack-no";

const PER_PAGE = 7;

type TabKey = "all" | PresalesStatus;

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "รอรับงาน", label: "รอรับงาน" },
  { key: "กำลังทำ", label: "กำลังทำ" },
  { key: "รอข้อมูลเพิ่ม", label: "รอข้อมูลเพิ่ม" },
  { key: "ส่งกลับแล้ว", label: "ส่งกลับแล้ว" },
  { key: "ปิดคำขอ", label: "ปิดคำขอ" },
];

export function PresalesPage() {
  const crm = useCrm();
  const empName = useNameOf();
  const threads = usePsThreads();
  /* นัดที่ทีมก่อนการขายตั้งไว้กับใบนี้ — ฝ่ายขายเจ้าของผู้สนใจต้องเห็น (เจ้าของตัดสิน 25 ก.ย. 2569) */
  const sc = useSchedule();
  const [tab, setTab] = useState<TabKey>("all");
  /* ลิงก์จากหน้าอื่นเจาะมาที่คำขอเดียวได้ด้วย ?find=<เลขที่> */
  const find = useFindParam();
  /* เลขที่คำขอจากลิงก์ใช้กรองเงียบ ๆ ไม่ใส่ลงช่องค้นหา — ห้ามโชว์รหัสบนจอ (ผู้ใช้สั่ง 14 ต.ค. 2569) */
  const [pin, setPin] = useState(find);
  const [query, setQuery] = useState("");
  const [lateOnly, setLateOnly] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    find ? { [find]: true } : {},
  );
  const params = useSearchParams();
  const router = useRouter();
  /* ลิงก์เดิม ?new=1&customer= — ฟอร์มย้ายไปเป็นหน้าเต็ม /presales/new ตามต้นแบบ presales-new.html */
  useEffect(() => {
    if (!params.get("new")) return;
    const customer = params.get("customer");
    router.replace(`/presales/new${customer ? `?customer=${encodeURIComponent(customer)}` : ""}`);
  }, [params, router]);
  /* เลขที่คำขอที่กำลังจะปิด — ปิดแล้วย้อนไม่ได้ จึงถามยืนยันก่อน */
  const [closing, setClosing] = useState<string | null>(null);
  /* ทีมก่อนการขายขอข้อมูลเพิ่ม — ฝ่ายขายตอบแล้วงานกลับไปที่ผู้รับคำขอ (เก็บทั้งใบ กล่องตอบจะได้แสดงคำถามได้) */
  const [replying, setReplying] = useState<PresalesRequest | null>(null);
  /* เอกสารข้อเสนอที่เปิดดูอยู่ — กดจากช่องข้อเสนอล่าสุดหรือไฟล์ในรอบการจัดทำ */
  const [doc, setDoc] = useState<{ request: PresalesRequest; round: PresalesRound } | null>(null);
  const today = todayIso();

  const nameOf = useMemo(
    () => new Map(crm.customers.map((c) => [c.code, c.name])),
    [crm.customers],
  );

  /** เลยกำหนดส่งแต่งานยังไม่จบ = ค้าง ต้องเห็นชัด */
  const isLate = (r: PresalesRequest) =>
    PRESALES_OPEN.includes(r.status) && daysBetween(today, r.due) < 0;

  /* ลำดับแบบกองซ้อน — นับจากคำขอทั้งหมดตามวันที่ส่ง ใหม่สุดเลขมากสุดอยู่บน (ผู้ใช้สั่ง 12 ต.ค. 2569) */
  const noOf = useMemo(() => stackNo(crm.presales, (r) => r.createdAt, (r) => r.id), [crm.presales]);

  const scoped = useMemo(() => {
    const q = (query.trim() || pin).toLowerCase();
    return crm.presales
      .filter((r) => {
        if (lateOnly && !isLate(r)) return false;
        if (!q) return true;
        const name = nameOf.get(r.customerCode) ?? "";
        return `${r.no} ${name} ${r.customerCode} ${r.problem}`.toLowerCase().includes(q);
      })
      .sort((a, b) => (noOf.get(b.id) ?? 0) - (noOf.get(a.id) ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crm.presales, query, pin, lateOnly, nameOf, today, noOf]);

  const rows = tab === "all" ? scoped : scoped.filter((r) => r.status === tab);
  const paged = usePaged(rows, PER_PAGE);

  const counts: Record<string, number> = { all: scoped.length };
  for (const t of TABS.slice(1)) {
    counts[t.key] = scoped.filter((r) => r.status === t.key).length;
  }

  /* ชั่วโมงรวมของคำขอ (ต้นแบบ presales.html hours) — ทีมก่อนการขายบวกเพิ่มทุกรอบที่ส่งข้อเสนอ */
  const totalHours = rows.reduce((sum, r) => sum + (r.hours ?? 0), 0);

  /* คำถามที่ค้างอยู่ของแต่ละใบ — อ่านจากสายถามตอบ ไม่ใช่จาก r.ask ที่ใบเก่าบางใบไม่มี */
  const askOf = (r: PresalesRequest) => psLastAsk(threads, r);

  /*
   * สายถามตอบของใบนั้น — เดิมอ่านได้เฉพาะตอนกล่อง "ตอบข้อมูลเพิ่ม" เปิดอยู่
   * พอตอบไปแล้วใบเปลี่ยนสถานะ ฝ่ายขายจึงย้อนอ่านไม่ได้ว่าเคยคุยอะไรกันไว้ (เจ้าของแจ้ง 25 ก.ย. 2569)
   */
  const threadOf = (r: PresalesRequest) => psThreadOf(threads, r);

  const meetsOf = (r: PresalesRequest) => psEventsOf(sc.events, r.no);

  const roundsOf = (no: string) =>
    crm.presalesRounds.filter((x) => x.requestNo === no).sort((a, b) => b.round - a.round);

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={closing !== null}
        title="ปิดคำขอก่อนการขาย"
        description={`ปิดคำขอ ${closing ?? ""} แล้วจะไม่อยู่ในคิวของทีมก่อนการขายอีก`}
        detail="ปิดแล้วเปิดใหม่ไม่ได้"
        confirmLabel="ปิดคำขอ"
        tone="destructive"
        onConfirm={() => {
          if (closing) closePresales(closing);
          setClosing(null);
        }}
        onCancel={() => setClosing(null)}
      />

      {replying && <ReplyDialog request={replying} onClose={() => setReplying(null)} />}

      {doc && (
        <ProposalDialog
          request={doc.request}
          round={doc.round}
          customerName={nameOf.get(doc.request.customerCode) ?? "—"}
          onClose={() => setDoc(null)}
        />
      )}


      <div className="bar">
        <div>
          <h1>ขอทำข้อเสนอ</h1>
          <p>
            พบ {rows.length} ใบงาน
            {pin && !query && (
              <button type="button" className="ml-2 font-semibold text-primary hover:underline" onClick={() => setPin("")}>
                ดูทั้งหมด
              </button>
            )}
          </p>
        </div>
        <div className="tools w-full flex-wrap sm:w-auto">
          <SearchBox
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPin("");
              paged.setPage(1);
            }}
            placeholder="ค้นหาผู้สนใจ หรือโจทย์"
          />
          <Link href="/presales/new" className="btn solid btn-solid btn-block-mobile shrink-0">
            <PlusIcon className="size-[15px]" strokeWidth={2.2} />
            ส่งโจทย์ใหม่
          </Link>
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
          <button
            type="button"
            onClick={() => {
              setLateOnly((v) => !v);
              paged.setPage(1);
            }}
            aria-pressed={lateOnly}
            className={`my-2 inline-flex h-[34px] items-center gap-2 rounded-[9px] border px-3 text-[12.5px] ${
              lateOnly
                ? "border-primary bg-accent font-semibold text-primary"
                : "glass-thin border-border text-muted-foreground"
            }`}
          >
            <ClockIcon className="size-[13px]" strokeWidth={2} />
            เลยกำหนด
          </button>
        </div>

        <div className="scroll-stable hidden min-h-0 flex-1 overflow-auto md:block">
          <table className="data-table min-w-[1100px]">
            <thead>
              <tr>
                {/* ความกว้างตามต้นแบบ · คอลัมน์ท้ายกว้างกว่าเพราะมีปุ่มตอบข้อมูล/ปิดคำขอเพิ่มจากต้นแบบ */}
                <th className="c" style={{ width: 60 }}>ลำดับ</th>
                <th>ผู้สนใจ</th>
                <th style={{ width: "24%" }}>โจทย์จากลูกค้า</th>
                <th style={{ width: 112 }}>ผู้รับผิดชอบ</th>
                <th style={{ width: 124 }}>ต้องการวันที่</th>
                <th style={{ width: 120 }}>สถานะ</th>
                <th style={{ width: 130 }}>ข้อเสนอล่าสุด</th>
                <th style={{ width: 196 }} aria-label="จัดการ" />
              </tr>
            </thead>
            <tbody>
              {paged.list.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-[50px] text-center text-muted-foreground">
                    ไม่พบคำขอที่ตรงกับเงื่อนไข
                  </td>
                </tr>
              ) : (
                paged.list.map((r) => {
                  const rounds = roundsOf(r.no);
                  const thread = threadOf(r);
                  const meets = meetsOf(r);
                  /* กางแถวได้ถ้ามีรอบการจัดทำ สายถามตอบ หรือนัดหมายให้ดู */
                  const hasMore = rounds.length > 0 || thread.length > 0 || meets.length > 0;
                  const isOpen = Boolean(open[r.no]);
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className={isOpen ? "open" : ""}
                        onClick={() => hasMore && setOpen((o) => ({ ...o, [r.no]: !o[r.no] }))}
                        style={{ cursor: hasMore ? "pointer" : "default" }}
                      >
                        {/* เลขที่ใบงานเก็บไว้ในข้อมูลอย่างเดียว ไม่ขึ้นในตาราง (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
                        <td className="c num muted">{noOf.get(r.id)}</td>
                        <td>
                          <Link href={`/leads/${r.customerCode}`} onClick={(e) => e.stopPropagation()}>
                            {/* ไม่แสดงรหัสผู้สนใจใต้ชื่อ — ค้นด้วยรหัสยังได้ (ผู้ใช้สั่ง 14 ต.ค. 2569) */}
                            <Who name={nameOf.get(r.customerCode) ?? "—"} />
                          </Link>
                        </td>
                        <td className="muted">
                          {/* ตารางแสดงแค่หัวข้อโจทย์ (ผู้ใช้สั่ง 5 ต.ค. 2569) — ข้อความที่ทีมขอข้อมูลดูได้ตอนกางแถว */}
                          <span className="line-clamp-2" title={r.problem}>{r.problem}</span>
                          {/* ระดับความเร่งด่วนเป็นข้อมูลของฝั่ง SA/BD ฝั่งขายไม่ต้องเห็น (ต้นแบบ presales.html) */}
                        </td>
                        <td className="muted">
                          <span className="clip">{empName(r.assignee)}</span>
                        </td>
                        <td className="num muted">
                          <span className="whitespace-nowrap">{thaiDate(r.due)}</span>
                          {isLate(r) && (
                            <span className="ml-2 inline-flex items-center rounded-2xl bg-[var(--destructive-soft)] px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-destructive">
                              เลย {Math.abs(daysBetween(today, r.due))} วัน
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`tag ${PRESALES_STATUS[r.status]}`}>
                            <i />
                            {r.status}
                          </span>
                        </td>
                        <td className="muted" onClick={(e) => e.stopPropagation()}>
                          {rounds.length > 0 ? (
                            <LatestButton round={rounds[0]} onOpen={() => setDoc({ request: r, round: rounds[0] })} />
                          ) : (
                            <span className="text-xs text-muted-foreground/70">ยังไม่มีข้อเสนอ</span>
                          )}
                        </td>
                        {/* ชิดขวาทุกแถว — ปุ่มปิดคำขออยู่ตำแหน่งเดียวกันทุกแถว (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
                        <td onClick={(e) => e.stopPropagation()}>
                          <span className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                            {/* ดูข้อเสนอล่าสุด (รายละเอียด + ดาวน์โหลดไฟล์ส่งให้ลูกค้าพิจารณา)
                                ไม่มีทางลัดสร้างใบเสนอราคาจากคำขอ — ลูกค้าตกลงแล้วค่อยไปออกที่หน้าใบเสนอราคา (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
                            {rounds.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setDoc({ request: r, round: rounds[0] })}
                                className="grid size-[30px] place-items-center rounded-lg border border-border bg-white text-muted-foreground transition-colors hover:border-primary hover:bg-accent hover:text-primary"
                                aria-label="ดูรายละเอียดข้อเสนอ"
                                title="ดูรายละเอียดข้อเสนอ"
                              >
                                <EyeIcon className="size-3.5" strokeWidth={2} />
                              </button>
                            )}
                            {r.status === "รอข้อมูลเพิ่ม" && (
                              <button type="button" className="lnk" onClick={() => setReplying(r)}>
                                ตอบข้อมูล
                              </button>
                            )}
                            {/* ปิดคำขอที่ไม่ได้ไปต่อ ไม่งั้นค้างอยู่ในคิวของทีมก่อนการขายตลอด */}
                            {r.status !== "ปิดคำขอ" && (
                              <button
                                type="button"
                                className="lnk quiet"
                                onClick={() => setClosing(r.no)}
                              >
                                ปิดคำขอ
                              </button>
                            )}
                            {r.status === "ปิดคำขอ" && "—"}
                          </span>
                        </td>
                      </tr>
                      {isOpen && hasMore && (
                        <tr className="sub">
                          <td colSpan={8}>
                            {rounds.length > 0 && (
                              <RoundTable rounds={rounds} onOpen={(x) => setDoc({ request: r, round: x })} />
                            )}
                            {meets.length > 0 && <PsMeetings events={meets} />}
                            {thread.length > 0 && <PsThread notes={thread} />}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-border md:hidden">
          {paged.list.length === 0 ? (
            <li className="px-5 py-12 text-center text-muted-foreground">
              ไม่พบคำขอที่ตรงกับเงื่อนไข
            </li>
          ) : (
            paged.list.map((r) => {
              const rounds = roundsOf(r.no);
              const thread = threadOf(r);
              const meets = meetsOf(r);
              const hasMore = rounds.length > 0 || thread.length > 0 || meets.length > 0;
              return (
                <li key={r.id} className="px-5 py-4 max-sm:px-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/leads/${r.customerCode}`} className="min-w-0">
                      <Who name={nameOf.get(r.customerCode) ?? "—"} sub={`#${noOf.get(r.id)}`} />
                    </Link>
                    <span className={`tag shrink-0 ${PRESALES_STATUS[r.status]}`}>
                      <i />
                      {r.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm break-words">{r.problem}</p>
                  {r.status === "รอข้อมูลเพิ่ม" && askOf(r) && (
                    <p className="mt-1 text-xs text-[var(--warning)]">ทีมขอข้อมูล: {askOf(r)?.tx}</p>
                  )}
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {psKindText(r.kind)} · ผู้รับผิดชอบ {empName(r.assignee)} · กำหนดส่ง {thaiDate(r.due)}
                    {isLate(r) && (
                      <span className="font-semibold text-destructive">
                        {" "}· เลย {Math.abs(daysBetween(today, r.due))} วัน
                      </span>
                    )}
                  </p>
                  {rounds.length > 0 && (
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      ส่งกลับแล้ว {rounds.length} รอบ · ล่าสุด {thaiDate(rounds[0].at)}
                      <LatestButton round={rounds[0]} onOpen={() => setDoc({ request: r, round: rounds[0] })} />
                    </p>
                  )}
                  {/* มือถือ: กางดูรอบการจัดทำและสายถามตอบได้เหมือนกดแถวในตาราง แต่เรียงลงเป็นการ์ด */}
                  {hasMore && (
                    <button
                      type="button"
                      onClick={() => setOpen((o) => ({ ...o, [r.no]: !o[r.no] }))}
                      aria-expanded={Boolean(open[r.no])}
                      className="mt-3 flex h-10 w-full items-center justify-between rounded-[10px] bg-muted px-3.5 text-[13px] font-semibold sm:hidden"
                    >
                      {rounds.length > 0
                        ? `รอบการจัดทำ ${rounds.length} รอบ`
                        : thread.length > 0
                          ? "สายถามตอบกับทีม"
                          : "นัดหมายของใบนี้"}
                      <ChevronDownIcon
                        className={`size-3.5 transition-transform ${open[r.no] ? "rotate-180" : ""}`}
                        strokeWidth={2.4}
                      />
                    </button>
                  )}
                  {open[r.no] && rounds.length > 0 && (
                    <RoundCards rounds={rounds} onOpen={(x) => setDoc({ request: r, round: x })} />
                  )}
                  {open[r.no] && meets.length > 0 && <PsMeetings events={meets} />}
                  {open[r.no] && thread.length > 0 && <PsThread notes={thread} />}
                  {/* มือถือ: ปุ่มสูง 40px งานหลักเป็นปุ่มทึบกว้างเต็มแถว */}
                  {r.status !== "ปิดคำขอ" && (
                    <div className="mt-3 flex flex-wrap gap-2 sm:hidden">
                      {rounds.length > 0 && (
                        <button
                          type="button"
                          className="btn solid btn-solid h-10 w-full justify-center"
                          onClick={() => setDoc({ request: r, round: rounds[0] })}
                        >
                          <EyeIcon className="size-4" strokeWidth={2} />
                          ดูข้อเสนอ
                        </button>
                      )}
                      {r.status === "รอข้อมูลเพิ่ม" && (
                        <button
                          type="button"
                          className="btn solid btn-solid h-10 flex-1 justify-center"
                          onClick={() => setReplying(r)}
                        >
                          ตอบข้อมูล
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn glass-thin h-10 flex-1 justify-center !text-muted-foreground"
                        onClick={() => setClosing(r.no)}
                      >
                        ปิดคำขอ
                      </button>
                    </div>
                  )}
                  <span className="mt-2.5 flex flex-wrap gap-2 max-sm:hidden">
                    {rounds.length > 0 && (
                      <button type="button" className="lnk" onClick={() => setDoc({ request: r, round: rounds[0] })}>
                        ดูข้อเสนอ
                      </button>
                    )}
                    {r.status === "รอข้อมูลเพิ่ม" && (
                      <button type="button" className="lnk" onClick={() => setReplying(r)}>
                        ตอบข้อมูล
                      </button>
                    )}
                    {r.status !== "ปิดคำขอ" && (
                      <button type="button" className="lnk quiet" onClick={() => setClosing(r.no)}>
                        ปิดคำขอ
                      </button>
                    )}
                  </span>
                </li>
              );
            })
          )}
        </ul>

        <div className="foot flex-col items-stretch gap-3 text-center sm:flex-row sm:items-center sm:text-left">
          <span>{paged.range("ใบงาน")}</span>
          <span className="sum">
            ชั่วโมงที่ใช้รวม<b>{totalHours.toFixed(1)}</b> ชม.
          </span>
          {/* ไม่มีผลลัพธ์ก็ไม่ต้องแสดงปุ่มแบ่งหน้า ตาม mockup */}
          {paged.list.length > 0 && (
            <Pager page={paged.page} maxPage={paged.maxPage} onChange={paged.setPage} />
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * ตอบข้อมูลที่ทีมก่อนการขายขอเพิ่ม
 *
 * คำถามต้องอยู่ตรงที่พิมพ์คำตอบ — เดิมกล่องนี้เปิดมาเป็นช่องเปล่า
 * ฝ่ายขายไม่รู้ว่าทีมถามอะไร เลยไปถามซ้ำกันในไลน์แทนที่จะตอบในระบบ
 * สายถามตอบทั้งหมดขึ้นด้วย จะได้รู้ว่าเคยตอบอะไรไปแล้ว ไม่ตอบซ้ำของเดิม
 */
function ReplyDialog({ request, onClose }: { request: PresalesRequest; onClose: () => void }) {
  const no = request.no;
  const threads = usePsThreads();
  const thread = psThreadOf(threads, request);
  const ask = psLastAsk(threads, request);
  const empName = useNameOf();
  const [reply, setReply] = useState("");
  /* แนบไฟล์ประกอบคำตอบได้ (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [warn, setWarn] = useState(false);
  return (
    /* เลขที่ใบงานไม่ขึ้นที่หัวกล่อง — เก็บในข้อมูลอย่างเดียว (ผู้ใช้สั่ง 5 ต.ค. 2569) */
    <Sheet
      title="ตอบข้อมูลเพิ่ม"
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
              /* ส่งได้เมื่อมีรายละเอียดหรือไฟล์อย่างใดอย่างหนึ่ง */
              if (!reply.trim() && !files.length) return setWarn(true);
              const sent = files.map((f) => ({ name: f.name, url: f.url?.startsWith("http") ? f.url : undefined }));
              const tx = reply.trim();
              replyPresalesInfo(no, tx || `แนบไฟล์ ${sent.map((f) => f.name).join(", ")}`);
              addPsReply(no, tx, sent);
              onClose();
            }}
          >
            ส่งให้ทีม
          </button>
        </>
      }
    >
      {/* คำถามที่ยังค้างอยู่ — อยู่บนสุดเพราะเป็นสิ่งเดียวที่ต้องอ่านก่อนพิมพ์ */}
      {ask ? (
        <div className="rounded-[11px] bg-[var(--warning-soft)] px-3.5 py-2.5">
          <p className="flex flex-wrap items-baseline gap-x-2 text-[11.5px] text-muted-foreground">
            <b className="font-semibold text-foreground">{empName(ask.by)}</b>
            <span>ขอข้อมูลเพิ่ม</span>
            {ask.at && <span className="num">{thaiStamp(ask.at)} น.</span>}
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed break-words">{ask.tx}</p>
        </div>
      ) : (
        <p className="rounded-[11px] bg-muted px-3.5 py-2.5 text-[13px] text-muted-foreground">
          ทีมยังไม่ได้เขียนว่าต้องการข้อมูลอะไร
        </p>
      )}

      {/* คุยกันไปแล้วกี่รอบ — ตอบซ้ำของเดิมไม่ช่วยใคร */}
      {thread.length > 1 && <PsThread notes={thread} />}

      <p className="mt-3.5 mb-1.5 text-[12.5px] font-semibold text-muted-foreground">แนบไฟล์</p>
      <FileDrop
        files={files}
        onChange={(next) => {
          setFiles(next);
          if (next.length) setWarn(false);
        }}
        title="ลากไฟล์มาวาง หรือกดเพื่อเลือกไฟล์"
        hint="PDF, รูปภาพ หรือไฟล์เอกสาร เลือกได้หลายไฟล์"
        label="เลือกไฟล์แนบ"
      />

      <label className="mt-3.5 block text-[12.5px] font-semibold text-muted-foreground" htmlFor="ps-reply">
        รายละเอียด
      </label>
      <textarea
        id="ps-reply"
        value={reply}
        onChange={(e) => {
          setReply(e.target.value);
          if (e.target.value.trim()) setWarn(false);
        }}
        rows={3}
        className="field-control mt-1.5 w-full rounded-[11px] px-3 py-2.5 text-[13.5px]"
      />
      {warn && <p className="mt-2 text-[12.5px] text-destructive">แนบไฟล์หรือพิมพ์รายละเอียดก่อนส่ง</p>}
    </Sheet>
  );
}

/**
 * ช่องข้อเสนอล่าสุด (ต้นแบบ presales.html latestCell) — ข้อเสนอส่งกลับได้สองแบบ ปุ่มจึงต่างกัน
 * PDF = ปุ่มกรอบแดงเปิดกล่องเอกสาร · Canva = ลิงก์กรอบฟ้าอมเขียวเปิดแท็บใหม่
 */
function LatestButton({ round, onOpen }: { round: PresalesRound; onOpen: () => void }) {
  const cls =
    "inline-flex h-[30px] items-center gap-[7px] rounded-[9px] border bg-white px-3 text-xs font-semibold whitespace-nowrap transition-colors";
  if (isCanva(round)) {
    return (
      <a
        href={round.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${cls} border-[#00c4cc] text-[#0b8f95] hover:bg-[#e7fbfc]`}
      >
        <LinkIcon className="size-[13px] shrink-0" strokeWidth={2} />
        <span>รอบ {round.round} Canva</span>
      </a>
    );
  }
  return (
    <button type="button" className={`${cls} border-primary text-primary hover:bg-accent`} onClick={onOpen}>
      <DownloadIcon className="size-[13px] shrink-0" strokeWidth={2} />
      <span>รอบ {round.round} PDF</span>
    </button>
  );
}

/** ไฟล์ข้อเสนอในตารางรอบ — PDF เปิดกล่องเอกสาร · Canva เปิดลิงก์ในแท็บใหม่ */
function FileButton({ round, onOpen }: { round: PresalesRound; onOpen: () => void }) {
  const canva = isCanva(round);
  const text = round.file;
  const cls = "inline-flex max-w-full items-center gap-1.5 font-semibold text-primary hover:underline";
  if (canva) {
    return (
      <a href={round.url} target="_blank" rel="noopener noreferrer" className={cls}>
        <LinkIcon className="size-3.5 shrink-0" strokeWidth={2} />
        <span className="truncate">{text}</span>
      </a>
    );
  }
  return (
    <button type="button" className={cls} onClick={onOpen}>
      <FileIcon className="size-3.5 shrink-0" strokeWidth={2} />
      <span className="truncate">{text}</span>
    </button>
  );
}

/** รอบการจัดทำบนมือถือ — ข้อมูลเดียวกับ RoundTable เรียงเป็นรายการ ไม่ต้องเลื่อนตารางด้านข้าง */
function RoundCards({ rounds, onOpen }: { rounds: PresalesRound[]; onOpen: (r: PresalesRound) => void }) {
  const empName = useNameOf();
  return (
    <ol className="mt-2 divide-y divide-border rounded-[10px] border border-border sm:hidden">
      {rounds.map((x, i) => (
        <li key={x.id} className={`px-3.5 py-3 text-[12.5px] ${i === 0 ? "bg-[#fef7f8]" : ""}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span
                className={`inline-flex h-[23px] min-w-[30px] items-center justify-center rounded-[7px] px-2 text-[11.5px] font-semibold ${
                  i === 0 ? "bg-primary text-white" : "glass-thin"
                }`}
              >
                {x.round}
              </span>
              <span className="num text-muted-foreground">{thaiDate(x.at)}</span>
            </span>
            <span className="num text-muted-foreground">{x.hours} ชม.</span>
          </div>
          <p className="mt-1.5 break-words">
            {i === 0 && <b className="font-semibold">รอบล่าสุด · </b>}
            {x.note}
          </p>
          <p className="mt-0.5 text-muted-foreground">{empName(x.by)}</p>
          <div className="mt-1.5 min-w-0">
            <FileButton round={x} onOpen={() => onOpen(x)} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function RoundTable({ rounds, onOpen }: { rounds: PresalesRound[]; onOpen: (r: PresalesRound) => void }) {
  const empName = useNameOf();
  return (
    <div className="subwrap">
      <h4>รอบการจัดทำ {rounds.length} รอบ</h4>
      <table className="inner">
        <thead>
          <tr>
            <th style={{ width: 60 }}>รอบ</th>
            <th style={{ width: 110 }}>วันที่ส่งกลับ</th>
            <th>สรุป</th>
            <th style={{ width: 130 }}>ผู้รับผิดชอบ</th>
            <th className="r" style={{ width: 80 }}>ชั่วโมง</th>
            <th style={{ width: 210 }}>ไฟล์ข้อเสนอ</th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((x, i) => (
            <tr key={x.id} className={i === 0 ? "bg-[#fef7f8]" : ""}>
              <td>
                <span
                  className={`inline-flex h-[23px] min-w-[30px] items-center justify-center rounded-[7px] px-2 text-[11.5px] font-semibold ${
                    i === 0 ? "bg-primary text-white" : "glass-thin"
                  }`}
                >
                  {x.round}
                </span>
              </td>
              <td className="muted num">{thaiDate(x.at)}</td>
              <td>
                {i === 0 && <b className="font-semibold">รอบล่าสุด · </b>}
                {x.note}
              </td>
              <td className="muted">{empName(x.by)}</td>
              <td className="r num">{x.hours} ชม.</td>
              <td>
                <span className="clip">
                  <FileButton round={x} onOpen={() => onOpen(x)} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/*
 * นัดที่ทีมก่อนการขายตั้งไว้กับคำขอใบนี้ (เจ้าของตัดสิน 25 ก.ย. 2569)
 *
 * ฝ่ายขายเป็นเจ้าของผู้สนใจรายนั้น จึงต้องรู้ว่าทีมนัดลูกค้าไปวันไหน
 * แต่ฝ่ายขายไม่มีหน้าปฏิทินของตัวเอง นัดจึงมาขึ้นที่ใบคำขอซึ่งเป็นที่ที่ฝ่ายขายเปิดอยู่แล้ว
 * ดูอย่างเดียว — คนตั้งนัดเป็นคนแก้และยกเลิก
 */
function PsMeetings({ events }: { events: PmEvent[] }) {
  return (
    <div className="mt-3">
      <h4 className="mb-1.5 text-[12.5px] font-bold">นัดหมายของใบนี้ {events.length} นัด</h4>
      <ul className="space-y-1.5">
        {events.map((e) => (
          <li
            key={e.id}
            className="rounded-[11px] border border-border bg-card px-3 py-2 text-[12.5px] leading-relaxed"
          >
            <b className={`font-semibold ${e.cancel ? "text-muted-foreground line-through" : ""}`}>
              {e.title}
            </b>
            <span className="num ml-2 text-muted-foreground">
              {thaiDate(e.date)} {e.from}–{e.to}
            </span>
            <span className="block text-[11.5px] text-muted-foreground">
              {e.place || "ยังไม่ระบุสถานที่"}
              {e.cancel ? ` · ยกเลิกแล้ว: ${e.cancel.why}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
