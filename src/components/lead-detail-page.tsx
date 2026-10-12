"use client";

import { optionsOf } from "@/lib/options";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  CHANGE_KIND,
  CUSTOMER_STATUS,
  type CustomerStatus,
  DEAL_STATUS,
  PRESALES_STATUS,
  findParty,
  quotationStateOf,
  quotationTotals,
} from "@/lib/crm-data";
import {
  closeLead,
  logActivity,
  takeOverLead,
  updateCustomer,
  leadDeleteBlock,
  removeLead,
  useCrm,
} from "@/lib/crm-store";
import { CURRENT_USER } from "@/lib/mock-data";
import { baht, initials, thaiDate, todayIso } from "@/lib/format";
import {
  BanIcon,
  ChevronRightIcon,
  ClockIcon,
  DealsIcon,
  HandoverIcon,
  MenuIcon,
  PencilIcon,
  PlusIcon,
  QuotationIcon,
  TrashIcon,
} from "./icons";
import { ConfirmDialog } from "./confirm-dialog";
import { ActivityDialog, CloseLeadDialog, TakeOverDialog } from "./lead-dialogs";
import { ProfileFacts } from "./lead-facts";
import { ChangeFromTo } from "./sales-ui";
import { findLink } from "@/lib/deep-link";
import "@/styles/mobile/lead-detail.css";

const PANES = [
  { key: "timeline", label: "ไทม์ไลน์การติดต่อ" },
  { key: "log", label: "ประวัติการเปลี่ยนแปลง" },
] as const;

type Pane = (typeof PANES)[number]["key"];

export function LeadDetailPage({ code }: { code: string }) {
  const crm = useCrm();
  const router = useRouter();
  const [pane, setPane] = useState<Pane>("timeline");
  const [logOpen, setLogOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [takeOverOpen, setTakeOverOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const today = todayIso();

  const customer = crm.customers.find((c) => c.code === code);
  /* เหตุผลที่ลบไม่ได้ — ว่างคือลบได้ */
  const blockWhy = leadDeleteBlock(crm, code);
  /* เปิดด้วยรหัสผู้สนใจเดิม — รายที่ปิดการขายไปแล้วเปลี่ยนหัวรหัสเป็น CUS- ลิงก์เก่าต้องยังไปถึงรายเดิม */
  const moved = customer ? undefined : findParty(crm.customers, code);
  /* พาไปที่รหัสปัจจุบัน ลิงก์ที่คัดลอกต่อจะได้เป็นรหัสลูกค้า */
  const movedTo = moved?.code;
  useEffect(() => {
    if (movedTo) router.replace(`/leads/${encodeURIComponent(movedTo)}`);
  }, [movedTo, router]);

  /* รายการของตัวเองไม่ต้องรับช่วง — ปุ่มจึงขึ้นเฉพาะของคนอื่น */
  const mine = customer?.owner === CURRENT_USER.name;

  const acts = useMemo(
    () =>
      crm.activities
        .filter((a) => a.customerCode === code)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [crm.activities, code],
  );
  const quotes = useMemo(
    () => crm.quotations.filter((q) => q.customerCode === code),
    [crm.quotations, code],
  );
  const requests = useMemo(
    () => crm.presales.filter((p) => p.customerCode === code),
    [crm.presales, code],
  );
  const deals = useMemo(
    () => crm.deals.filter((d) => d.customerCode === code),
    [crm.deals, code],
  );
  const logs = useMemo(
    () =>
      crm.changeLogs
        .filter((l) => l.customerCode === code)
        .sort((a, b) => b.at.localeCompare(a.at)),
    [crm.changeLogs, code],
  );

  /*
   * ชื่อแท็บ "<ชื่อ> — ผู้สนใจ" ตาม mockup — ชื่ออยู่ในเครื่องผู้ใช้ จึงตั้งฝั่งหน้าจอ
   * metadata ของ Next ส่งตามมาทีหลังแล้วเขียนทับ จึงคอยตั้งกลับเมื่อ <head> เปลี่ยน
   * เฉพาะตอนยังอยู่หน้านี้ (ย้ายหน้าแล้ว URL เปลี่ยนก่อน จะไม่ไปทับชื่อของหน้าถัดไป)
   */
  const customerName = customer?.name;
  useEffect(() => {
    if (!customerName) return;
    const want = `${customerName} — ผู้สนใจ`;
    const path = window.location.pathname;
    const apply = () => {
      if (window.location.pathname === path && document.title !== want) document.title = want;
    };
    apply();
    const watch = new MutationObserver(apply);
    watch.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => watch.disconnect();
  }, [customerName]);

  if (!customer) {
    return (
      <div className="panel glass px-6 py-16 text-center">
        <p className="text-lg font-semibold">
          {moved ? `${code} เปลี่ยนเป็นรหัสลูกค้า ${moved.code} แล้ว` : `ไม่พบลูกค้ารหัส ${code}`}
        </p>
        <Link
          href={moved ? `/leads/${encodeURIComponent(moved.code)}` : "/leads"}
          className="btn solid btn-solid mt-6 inline-flex"
        >
          {moved ? `ไปที่ ${moved.name}` : "กลับไปหน้ารายชื่อ"}
        </Link>
      </div>
    );
  }

  const last = acts[0]?.date ?? "";
  /** นัดติดตามครั้งถัดไป — วันนัดที่ไกลที่สุดจากทุกบันทึก ตามต้นแบบ lead-detail.html (nextFollow) */
  const nextFollow = acts
    .map((a) => a.followUp)
    .filter(Boolean)
    .sort()
    .at(-1);
  /** วันที่สร้างรายการ — ยังไม่มีช่องวันที่สร้าง ใช้การติดต่อครั้งแรกแทน */
  const createdAt = acts.at(-1)?.date ?? "";
  const hasDeal = (no: string) => crm.deals.some((d) => d.quotationNo === no);

  /* ปุ่มลบย้ายไปอยู่ในโหมดแก้ไขข้อมูล ไม่อยู่บนแถบหัวเรื่อง (ผู้ใช้สั่ง 9 ต.ค. 2569)
     ลบได้เฉพาะรายที่ยังไม่มีเอกสารผูกอยู่ — มีแล้วปุ่มกดไม่ได้ พร้อมบอกเหตุผล */
  const deleteButton = (
    <button
      type="button"
      className="btn glass-thin text-destructive disabled:cursor-not-allowed disabled:opacity-45"
      disabled={Boolean(blockWhy)}
      title={blockWhy || undefined}
      onClick={() => setDelOpen(true)}
    >
      <TrashIcon className="size-[15px]" strokeWidth={2.2} />
      ลบผู้สนใจ
    </button>
  );

  /* ปฏิเสธ · รับช่วงดูแล · ลบ ย้ายไปท้ายโหมดแก้ไข (กดดินสอ) ไม่อยู่บนหัวเรื่อง (ผู้ใช้สั่ง 9 ต.ค. 2569)
     มือถือยังมีปฏิเสธ/รับช่วงที่ท้ายหน้า จึงซ่อนสองปุ่มนี้บนมือถือ กันซ้ำ */
  const editExtras = (
    <>
      {/* .btn ตั้ง display เอง คลาส hidden บนปุ่มไม่ชนะ จึงซ่อนที่กล่องนอก */}
      <span className="contents max-md:hidden">
      {customer.status === "รอนัดหมาย" && (
        <button
          type="button"
          className="btn text-destructive"
          style={{ background: "var(--destructive-soft)" }}
          onClick={() => setCloseOpen(true)}
        >
          <BanIcon className="size-[15px]" strokeWidth={2.2} />
          ปฏิเสธ
        </button>
      )}
      {!mine && (
        <button type="button" className="btn glass-thin" onClick={() => setTakeOverOpen(true)}>
          <HandoverIcon className="size-[15px]" strokeWidth={2.2} />
          รับช่วงดูแล
        </button>
      )}
      </span>
      {deleteButton}
    </>
  );

  /* ปุ่มรอง (ปฏิเสธ · รับช่วง · บันทึกการติดต่อ) — จอคอมอยู่บนแถบหัวเรื่อง มือถืออยู่ท้ายหน้าตามต้นแบบ */
  const secondaryActions = (
    <>
      {/* ปฏิเสธได้เฉพาะรายการที่ยังเป็นผู้สนใจ · พื้นแดงอ่อนตาม mockup (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
      {customer.status === "รอนัดหมาย" && (
        <button
          type="button"
          className="btn text-destructive"
          style={{ background: "var(--destructive-soft)" }}
          onClick={() => setCloseOpen(true)}
        >
          <BanIcon className="size-[15px]" strokeWidth={2.2} />
          ปฏิเสธ
        </button>
      )}
      {!mine && (
        <button
          type="button"
          className="btn glass-thin"
          onClick={() => setTakeOverOpen(true)}
        >
          <HandoverIcon className="size-[15px]" strokeWidth={2.2} />
          รับช่วงดูแล
        </button>
      )}
      <button type="button" className="btn glass-thin" onClick={() => setLogOpen(true)}>
        <PlusIcon className="size-[15px]" strokeWidth={2.2} />
        บันทึกการติดต่อ
      </button>
    </>
  );

  return (
    <div className="ld-m space-y-4 max-md:space-y-3">
      {/* มือถือ: ชื่อ + ป้ายสถานะซ้าย ปุ่มสร้างใบเสนอราคาขวา (ต้นแบบ .title ≤760px) */}
      <div className="md:hidden">
        <div className="ld-title">
          <h1>{customer.name}</h1>
          <span className="ld-tg">
            <StatusTag status={customer.status} />
          </span>
          <Link
            href={`/quotations/new?customer=${encodeURIComponent(code)}`}
            className="btn solid btn-solid ld-q shrink-0"
          >
            <QuotationIcon className="size-[15px]" strokeWidth={2.2} />
            สร้างใบเสนอราคา
          </Link>
        </div>
      </div>

      {/* จอคอม: เส้นทาง · ชื่อ + ป้ายสถานะ + ปุ่มสร้างใบเสนอราคาต่อท้ายแถวเดียวกัน ไม่มีปุ่มอื่น (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
      <div className="max-md:hidden">
        <p className="mb-2 flex min-w-0 items-center gap-[7px] text-[13px] text-muted-foreground">
          {/* ปิดงานแล้วไม่อยู่ในรายชื่อผู้สนใจ — ย้อนไปหน้าดีลแทน (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
          <Link
            href={customer.status === "ปิดงาน" ? `/deals?find=${encodeURIComponent(customer.code)}` : "/leads"}
            className="shrink-0 hover:text-primary"
          >
            {customer.status === "ปิดงาน" ? "ดีล" : "ผู้สนใจ"}
          </Link>
          <ChevronRightIcon className="size-[13px] shrink-0" strokeWidth={2.4} />
          <span className="truncate">{customer.name}</span>
        </p>
        <div className="flex flex-wrap items-center gap-3.5">
          <h1 className="min-w-0 leading-tight" style={{ fontSize: 30, fontWeight: 700 }}>
            {customer.name}
          </h1>
          <StatusTag status={customer.status} big />
          <Link
            href={`/quotations/new?customer=${encodeURIComponent(code)}`}
            /* ชิดขวาของแถว (ผู้ใช้สั่ง 9 ต.ค. 2569) */
            className="btn solid btn-solid ml-auto shrink-0"
          >
            <QuotationIcon className="size-[15px]" strokeWidth={2.2} />
            สร้างใบเสนอราคา
          </Link>
        </div>
      </div>

      {customer.status === "ปฏิเสธ" && customer.closedReason && (
        <p className="rounded-xl border border-[var(--neutral)]/20 bg-[var(--neutral-soft)] px-4 py-3 text-sm text-muted-foreground">
          ปฏิเสธเพราะ {customer.closedReason}
        </p>
      )}

      {/* กริดตามภาพอ้างอิง: ซ้าย 2fr ขวา 1fr ห่าง 28px · แคบกว่า 980px เหลือคอลัมน์เดียว (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
      <div className="grid items-start gap-[18px] max-md:!gap-3 md:gap-7 min-[980px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-[18px] max-md:!gap-3 md:gap-7">
          {/* ── การ์ดโปรไฟล์: ตัวตนลูกค้าซ้าย ข้อมูลติดต่อที่แก้ได้ขวา ── */}
          <section className="ld-card glass relative rounded-2xl px-4 py-5 sm:px-[22px] md:rounded-[20px] md:p-7">
            <div className="grid gap-[22px] md:gap-7 min-[980px]:grid-cols-[280px_minmax(0,1fr)]">
              {/* จอแคบเส้นคั่นอยู่ล่าง จอกว้างอยู่ขวา · ไม่มีบรรทัดรหัส (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
              <div className="border-b border-border pb-[18px] text-center min-[980px]:border-r min-[980px]:border-b-0 min-[980px]:pr-7 min-[980px]:pb-0">
                <span
                  className="mx-auto grid size-[84px] place-items-center rounded-full text-[28px] font-semibold text-primary md:size-[125px] md:text-[34px]"
                  style={{ background: "var(--destructive-soft)" }}
                >
                  {initials(customer.name)}
                </span>
                <h2 className="mt-3 text-[17px] leading-snug font-semibold md:mt-4 md:text-[22px]">{customer.name}</h2>
                <span className="mt-3 inline-block">
                  <StatusTag status={customer.status} big />
                </span>
                {/* ครั้งที่ติดต่อ · ติดต่อล่าสุด แทนวันที่ค้าง (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
                <div className="mt-4 flex border-t border-border pt-3.5 md:mt-6 md:pt-5">
                  <div className="flex-1">
                    <b className="num block text-xl font-semibold md:text-[26px] md:leading-tight">{acts.length}</b>
                    <span className="mt-0.5 block text-[11.5px] text-muted-foreground md:mt-1 md:text-[13px]">
                      ครั้งที่ติดต่อ
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col justify-end border-l border-border">
                    <b className="num block text-base font-semibold md:text-[22px] md:leading-tight">
                      {last ? thaiDate(last) : "—"}
                    </b>
                    <span className="mt-0.5 block text-[11.5px] text-muted-foreground md:mt-1 md:text-[13px]">
                      ติดต่อล่าสุด
                    </span>
                  </div>
                </div>
              </div>

              {/* จอคอมโชว์แค่หกช่อง · ช่องอื่นแก้ได้ในโหมดแก้ไข · ผู้ดูแลโชว์เฉพาะมือถือ (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
              <ProfileFacts
                customer={customer}
                sources={optionsOf("leadSource")}
                onSave={(patch) => updateCustomer(code, patch)}
                editing={editing}
                onEditingChange={setEditing}
                facts={[{ label: "ผู้ดูแล", value: `${customer.owner}${mine ? " (คุณ)" : ""}` }]}
                editExtra={editExtras}
                desktopKeys={["contact", "phone", "email", "source", "taxId", "address"]}
              />
            </div>
            {/* ปุ่มดินสอมุมขวาล่างในการ์ด ไม่มีข้อความ (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
            {!editing && (
              <div className="absolute right-5 bottom-5 max-md:hidden">
                <button
                  type="button"
                  aria-label="แก้ไขข้อมูล"
                  title="แก้ไขข้อมูล"
                  className="btn glass-thin size-9 justify-center !p-0"
                  onClick={() => setEditing(true)}
                >
                  <PencilIcon className="size-4" strokeWidth={2} />
                </button>
              </div>
            )}
          </section>

          <section
            id="lead-timeline"
            className="ld-card glass rounded-2xl px-4 pb-5 sm:px-[22px] md:rounded-[20px] md:px-7 md:pb-7"
          >
            <div className="relative">
            <div className="tabs -mx-4 mb-4 border-b border-border px-4 sm:-mx-[22px] sm:px-[22px] md:-mx-7 md:pr-48 md:pl-7">
              {PANES.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={pane === p.key ? "on" : ""}
                  onClick={() => setPane(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {/* บันทึกการติดต่อย้ายจากหัวเรื่องมาขวาของแถวแท็บ · มือถือยังอยู่ท้ายหน้า (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
            <button
              type="button"
              className="absolute top-0 right-0 bottom-4 flex items-center gap-1 text-[14px] font-semibold text-primary hover:underline max-md:hidden"
              onClick={() => setLogOpen(true)}
            >
              <PlusIcon className="size-[15px]" strokeWidth={2.4} />
              บันทึกการติดต่อ
            </button>
            </div>

            {pane === "timeline" ? (
              <>
              {/* มือถือ: ไทม์ไลน์แนวนอน เก่าซ้าย ใหม่/นัดถัดไปขวา (ต้นแบบ #tl ≤760px) */}
              <div className="md:hidden">
                {acts.length === 0 && !nextFollow ? (
                  <p className="py-6 text-[13px] text-muted-foreground">ยังไม่มีบันทึกการติดต่อ</p>
                ) : (
                  <div className="ld-tl">
                    {nextFollow && (
                      <div className="ev next">
                        <p className="when">
                          {thaiDate(nextFollow)}
                          <span className="chan">นัดติดตามครั้งถัดไป</span>
                        </p>
                        <p className="sum">{nextFollow >= today ? "ยังไม่ถึงกำหนด" : "เลยกำหนดแล้ว"}</p>
                      </div>
                    )}
                    {acts.map((a) => (
                      <div key={a.id} className="ev">
                        <p className="when">
                          {thaiDate(a.date)}
                          {a.channel && <span className="chan">{a.channel}</span>}
                        </p>
                        <p className="sum">{a.summary}</p>
                        {a.nextAction && (
                          <p className="na">
                            <span>สิ่งที่ต้องทำต่อ</span>
                            {a.nextAction}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative pl-[26px] max-md:hidden">
                <span className="absolute top-1.5 bottom-1.5 left-1.5 w-0.5 bg-border" />
                {nextFollow && (
                  <Event
                    tone="next"
                    when={`${thaiDate(nextFollow)} · นัดติดตามครั้งถัดไป`}
                    body={nextFollow >= today ? "ยังไม่ถึงกำหนด" : "เลยกำหนดแล้ว"}
                  />
                )}
                {acts.length === 0 ? (
                  <p className="py-6 text-muted-foreground">ยังไม่มีบันทึกการติดต่อ</p>
                ) : (
                  acts.map((a) => (
                    <Event
                      key={a.id}
                      tone="done"
                      when={thaiDate(a.date)}
                      channel={a.channel}
                      body={a.summary}
                      next={a.nextAction}
                    />
                  ))
                )}
              </div>
              </>
            ) : (
              <div className="divide-y divide-border">
                {logs.map((l) => (
                    <div key={l.id} className="flex flex-wrap items-center gap-2 py-3">
                      <span className="num w-[104px] shrink-0 text-[12.5px] text-muted-foreground">
                        {thaiDate(l.at)}
                      </span>
                      <ChangeFromTo log={l} />
                      <span className="w-full text-[12.5px] text-muted-foreground sm:w-auto">
                        {CHANGE_KIND[l.kind]}
                        {l.reason ? ` · ${l.reason}` : ""}
                      </span>
                    </div>
                  ))}
                {/* แถวต้นทาง — การสร้างรายการ ตามต้นแบบ lead-detail.html อยู่ล่างสุดเสมอ */}
                <div className="flex flex-wrap items-start gap-2 py-3">
                  <span className="num w-[104px] shrink-0 text-[12.5px] text-muted-foreground">
                    {createdAt ? thaiDate(createdAt) : "—"}
                  </span>
                  <span className="min-w-0 text-[13.5px]">
                    <b className="font-semibold">สร้างรายการผู้สนใจ</b>
                    {customer.source && (
                      <span className="block text-[12.5px] text-muted-foreground">บันทึกจาก{customer.source}</span>
                    )}
                    <span className="block text-[12.5px] text-muted-foreground">สถานะเริ่มต้น รอนัดหมาย</span>
                  </span>
                </div>
                {logs.length === 0 && (
                  <p className="py-4 text-center text-[13px] text-muted-foreground">
                    ยังไม่มีการเปลี่ยนสถานะหรือรับช่วงดูแลหลังจากนั้น
                  </p>
                )}
              </div>
            )}
          </section>
        </div>

        {/* คอลัมน์ขวา การ์ดเรียงห่าง 28px (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
        <div className="flex flex-col gap-[18px] max-md:!gap-3 md:gap-7">
          <section className={CARD}>
            <h2 className={HEAD}>
              <MenuIcon className={HEAD_ICON} strokeWidth={2} />
              บันทึกล่าสุด
              {/* ตามต้นแบบ — พาไปดูไทม์ไลน์การติดต่อทั้งหมด */}
              {acts.length > 0 && (
                <button
                  type="button"
                  className={HEAD_LINK}
                  onClick={() => {
                    setPane("timeline");
                    document.getElementById("lead-timeline")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  ดูทั้งหมด
                </button>
              )}
            </h2>
            {acts.slice(0, 2).map((a) => (
              <div key={a.id} className="glass-thin mt-3 rounded-xl px-3.5 py-3 md:mt-4 md:px-4 md:py-3.5">
                <p className="text-[13.5px] leading-relaxed break-words md:text-[15px]">{a.summary}</p>
                <span className="mt-2 block text-[11.5px] text-muted-foreground md:text-[13px]">
                  จากการติดต่อ {thaiDate(a.date)}
                </span>
              </div>
            ))}
            {acts.length === 0 && (
              <p className="mt-3 text-[13px] text-muted-foreground md:mt-4 md:text-[14px]">ยังไม่มีบันทึกการติดต่อ</p>
            )}
          </section>

          <DocCard
            title="ใบเสนอราคา"
            icon={<QuotationIcon className={HEAD_ICON} strokeWidth={2} />}
            action={{ label: "สร้างใหม่", href: `/quotations/new?customer=${encodeURIComponent(code)}` }}
            empty="ยังไม่เคยออกใบเสนอราคาให้ลูกค้ารายนี้"
            rows={quotes.map((q) => {
              const st = quotationStateOf(q, hasDeal(q.no), today);
              return {
                key: q.id,
                /* ไม่มีร่างแล้ว ทุกใบมีเลขที่ (ผู้ใช้สั่ง 5 ต.ค. 2569) */
                href: `/quotations/${encodeURIComponent(q.no)}`,
                main: q.no,
                sub: `${baht(quotationTotals(q).grand)} บาท`,
                tag: st.label,
                cls: st.cls,
              };
            })}
          />

          <DocCard
            title="คำขอก่อนการขาย"
            icon={<ClockIcon className={HEAD_ICON} strokeWidth={2} />}
            action={{ label: "ส่งคำขอ", href: `/presales/new?customer=${encodeURIComponent(code)}` }}
            empty="ยังไม่มีคำขอก่อนการขาย"
            rows={requests.map((r) => ({
              key: r.id,
              href: findLink("/presales", r.no),
              main: r.no,
              sub: `${r.kind} · กำหนดส่ง ${thaiDate(r.due)}`,
              tag: r.status,
              cls: PRESALES_STATUS[r.status],
            }))}
          />

          {/* หน้าผู้สนใจไม่มีดีล — โชว์การ์ดดีลเฉพาะรายที่มีดีลแล้ว (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
          {deals.length > 0 && (
          <DocCard
            title="ดีล"
            icon={<DealsIcon className={HEAD_ICON} strokeWidth={2} />}
            empty="ยังไม่มีดีล"
            rows={deals.map((d) => ({
              key: d.id,
              href: findLink("/deals", d.no),
              main: d.no,
              sub: `${baht(d.total)} บาท · ปิดเมื่อ ${thaiDate(d.closedAt)}`,
              tag: d.status,
              cls: DEAL_STATUS[d.status],
            }))}
          />
          )}
        </div>

        {/* มือถือ: ปุ่มรองย้ายมาท้ายหน้า ต่อจากการ์ดทั้งหมด (ต้นแบบ .m-ld-bottom)
           อยู่ในกริดเพื่อให้จอคอมไม่มีระยะท้ายหน้าเพิ่ม (display:none ไม่กินช่องกริด) */}
        <div className="md:hidden">
          <div className="ld-bottom">{secondaryActions}</div>
        </div>
      </div>

      {logOpen && (
        <ActivityDialog
          customerName={customer.name}
          channels={optionsOf("leadChannel")}
          onClose={() => setLogOpen(false)}
          onSubmit={(v) => {
            logActivity({ customerCode: code, ...v });
            setLogOpen(false);
          }}
        />
      )}
      {takeOverOpen && (
        <TakeOverDialog
          customerName={customer.name}
          currentOwner={customer.owner}
          onClose={() => setTakeOverOpen(false)}
          onSubmit={(reason) => {
            takeOverLead(code, reason);
            setTakeOverOpen(false);
          }}
        />
      )}
      {closeOpen && (
        <CloseLeadDialog
          customerName={customer.name}
          code={customer.code}
          onClose={() => setCloseOpen(false)}
          onSubmit={(reason) => {
            closeLead(code, reason);
            setCloseOpen(false);
          }}
        />
      )}

      {/* ลบแล้วเรียกคืนไม่ได้ ต้องถามก่อนเสมอ แล้วพากลับไปหน้ารายชื่อ เพราะหน้านี้จะไม่มีข้อมูลแล้ว */}
      <ConfirmDialog
        open={delOpen}
        tone="destructive"
        title={`ลบ ${customer.name} ออกจากรายชื่อ`}
        description="บันทึกการติดต่อและประวัติการเปลี่ยนแปลงของรายนี้จะถูกลบไปด้วย"
        detail="ลบแล้วเรียกคืนไม่ได้"
        confirmLabel="ลบผู้สนใจ"
        onCancel={() => setDelOpen(false)}
        onConfirm={() => {
          setDelOpen(false);
          if (removeLead(code)) router.push("/leads");
        }}
      />
    </div>
  );
}

/* การ์ดคอลัมน์ขวา: มุม 20px ใน 28px หัวข้อ 20px มีไอคอน ลิงก์แดงขวา — มือถือคงเดิม (ผู้ใช้สั่ง 9 ต.ค. 2569) */
const CARD = "ld-card glass rounded-2xl px-4 py-5 sm:px-[22px] md:rounded-[20px] md:p-7";
const HEAD = "flex items-center gap-2 text-[15px] font-semibold md:gap-2.5 md:text-[20px]";
const HEAD_ICON = "size-4 shrink-0 text-primary md:size-5";
const HEAD_LINK = "ml-auto text-[12.5px] font-semibold text-primary hover:underline md:text-[14px]";

function Event({
  tone,
  when,
  channel,
  body,
  next,
}: {
  tone: "next" | "done";
  when: string;
  channel?: string;
  body: string;
  next?: string;
}) {
  /* นัดถัดไป = จุดเหลือง ติดต่อแล้ว = จุดเขียว ตาม mockup (ผู้ใช้สั่ง 9 ต.ค. 2569) */
  const dot = tone === "next" ? "border-[var(--warning)]" : "border-[var(--success)]";
  return (
    <div className="relative pb-[18px]">
      <span
        className={`absolute top-1 -left-[26px] size-3.5 rounded-full border-[3px] bg-white ${dot}`}
      />
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {when}
        {channel && (
          <span className="glass-thin rounded-full px-2 py-px text-[11px]">{channel}</span>
        )}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed break-words">{body}</p>
      {next && (
        <p className="mt-1.5 inline-block rounded-lg bg-[var(--warning-soft)] px-2.5 py-1 text-[12.5px] text-[var(--warning)]">
          สิ่งที่ต้องทำต่อ · {next}
        </p>
      )}
    </div>
  );
}

function DocCard({
  title,
  icon,
  action,
  empty,
  rows,
}: {
  title: string;
  icon?: ReactNode;
  action?: { label: string; href: string };
  empty: string;
  rows: { key: string; href: string; main: string; sub: string; tag: string; cls: string }[];
}) {
  return (
    <section className={CARD}>
      <h2 className={HEAD}>
        {icon}
        {title}
        {action && (
          <Link href={action.href} className={HEAD_LINK}>
            {action.label}
          </Link>
        )}
      </h2>
      {rows.length === 0 ? (
        <p className="py-5 text-center text-[13px] text-muted-foreground md:py-7 md:text-[14px]">{empty}</p>
      ) : (
        <div className="mt-1 divide-y divide-border md:mt-2">
          {rows.map((r) => (
            <Link
              key={r.key}
              href={r.href}
              className="flex items-center gap-3 py-2.5 transition-colors hover:text-primary md:py-3"
            >
              <span className="min-w-0 flex-1">
                <b className="num block text-[13.5px] font-medium md:text-[15px]">{r.main}</b>
                <span className="block text-[11.5px] text-muted-foreground md:text-[13px]">{r.sub}</span>
              </span>
              <span className={`tag shrink-0 ${r.cls}`}>
                <i />
                {r.tag}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/** ป้ายสถานะธรรมดา — สถานะระบบตั้งเอง ไม่ให้เลือกเอง (ผู้ใช้สั่ง 9 ต.ค. 2569) */
function StatusTag({ status, big }: { status: CustomerStatus; big?: boolean }) {
  return (
    <span
      className={`tag ${CUSTOMER_STATUS[status]}`}
      /* ป้ายขนาดปกติบนจอคอม ไม่ใช่ป้ายจิ๋ว 11px (ผู้ใช้สั่ง 9 ต.ค. 2569) */
      style={big ? { fontSize: 13, padding: "5px 12px", gap: 7 } : undefined}
    >
      <i />
      {status}
    </span>
  );
}
