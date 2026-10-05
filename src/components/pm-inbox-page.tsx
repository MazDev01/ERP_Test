"use client";

/*
 * งานเข้าใหม่ของ PM (ตามต้นแบบ pm-inbox.html)
 *
 * กระดานรับงานกลาง (ผู้ใช้สั่ง 5 ต.ค. 2569) — PM ทุกคนและ GM เห็นตารางเดียวกัน ใครกดรับก่อนได้งาน
 * งานที่รับแล้วยังอยู่บนกระดาน (จาง ป้าย "รับแล้ว · ชื่อ") จนวางแผนเสร็จแล้วออกไปเป็นโปรเจค
 * ทุกงานที่รับเข้ามาเป็นโปรเจคเหมือนกัน ต่างกันแค่มีข้อเสนอเป็นโครงเฟสตั้งต้นหรือต้องสร้างเฟสเอง
 *
 * กด "รับงาน" → กล่องยืนยันเล็ก ๆ (เลือกวันเริ่มโครงการอย่างเดียว) → รับงาน (ผู้ใช้สั่ง 5 ต.ค. 2569)
 * ไม่ถามชื่อโปรเจคตอนรับแล้ว — ตั้งต้นเป็นชื่อลูกค้า แล้วแก้ชื่อที่หน้าจัดคิวงาน/หน้าโปรเจค (ปุ่ม "แก้ชื่อโปรเจค")
 * เอกสารของงาน (ใบเสนอราคา/ข้อเสนอ เฟส ยอดรวม ไฟล์แนบ) ดูได้จากปุ่มรูปตา "ดูรายละเอียด" ทุกแถว — ดูอย่างเดียว
 * รับแล้วพาไปหน้าวางแผนของโปรเจคนั้นทันที ไม่ทิ้งคนไว้กับกล่องเปล่า — จัดคิวคือสิ่งที่ต้องทำต่อ
 * ทุกลิงก์ในหน้านี้อยู่ในหน้าของ PM เท่านั้น ไม่พาข้ามไปหน้าของบทบาทอื่น
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFindParam } from "@/lib/deep-link";
import { addDays, daysBetween, thaiDate, todayIso } from "@/lib/format";
import { isRef, planHref, projectHref, serviceLabel, type InboxJob } from "@/lib/pm-data";
import { acceptInboxJob, markInboxSeen, usePm } from "@/lib/pm-store";
import { USERS } from "@/lib/mock-data";
import { useRole } from "@/lib/role";
import { Sheet } from "./lead-dialogs";
import { ProposalPreview, QuotationPreview } from "./pm-docs";
import { SearchBox } from "./sales-ui";
import { ReadOnlyNote, usePmReadOnly } from "./pm-readonly";
import { ThaiDatePicker } from "./thai-date-picker";
import { ConfirmDialog } from "./confirm-dialog";
import { EyeIcon, FileIcon } from "./icons";
import "@/styles/mobile/pm-inbox.css";

/** ขั้นของงานตอนนี้ — ลิงก์ที่เจาะมาต้องบอกได้ว่างานนั้นไปถึงไหนแล้ว */
function stageText(j: InboxJob) {
  return j.stage === "new" ? "รอ PM รับงาน" : "PM รับงานแล้ว · รอจัดคิวในหน้าวางแผน";
}

/* ป้ายงานที่มีคนรับไปแล้ว — ข้อมูลเก่าที่ไม่มีชื่อคนรับขึ้นแค่ "รับแล้ว" (ผู้ใช้สั่ง 5 ต.ค. 2569) */
function takenTag(j: InboxJob) {
  return j.takenBy ? `รับแล้ว · ${j.takenBy}` : "รับแล้ว";
}

export function PmInboxPage() {
  const pm = usePm();
  const router = useRouter();
  /* ชื่อคนที่ใช้อยู่ — คนรับงานเองเห็นลิงก์ไปหน้าวางแผน คนอื่นเห็นแค่เอกสาร (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  const role = useRole();
  const me = USERS[role]?.name ?? "";
  /*
   * ลิงก์จากหน้าอื่น ?find=<เลขที่โปรเจค> (ลิงก์เก่าส่งเลขที่ดีล — หาเจอทั้งคู่ · 5 ต.ค. 2569) ต้อง "กรอง" ให้เหลืองานนั้น (ผู้ใช้กำหนด 23 ก.ย. 2569)
   * ส่งเลขเอกสารมากับลิงก์แล้วไม่กรอง เท่ากับให้คนไปหาเองในรายการ
   * และต้องเห็นงานนั้นแม้ PM รับไปแล้ว พร้อมบอกว่าตอนนี้อยู่ขั้นไหน ไม่ใช่ขึ้นว่าไม่พบ
   */
  const find = useFindParam();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState(find);
  const [viewing, setViewing] = useState<string | null>(() =>
    pm.inbox.find((j) => isRef(j, find) && j.stage === "new")?.pj ?? null,
  );
  /* งานที่กำลังยืนยันรับ — กล่องยืนยันเล็ก ไม่ใช่เอกสาร (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  const [taking, setTaking] = useState<string | null>(null);
  /* รับไม่ทัน (เช่นเปิดแท็บค้างไว้แล้วมีคนรับไปก่อน) — บอกชื่อคนที่รับไป */
  const [notice, setNotice] = useState("");

  /*
   * กระดานรับงาน (ผู้ใช้สั่ง 5 ต.ค. 2569) — PM ทุกคนและ GM เห็นตารางเดียวกัน
   * มีทั้งงานรอรับ และงานที่มีคนรับไปแล้วแต่ยังไม่ได้เปิดเป็นโปรเจค (ขั้น "plan")
   * ทุกคนจึงเห็นว่าใครรับอะไรไป · ยืนยันแผนแล้วงานออกจากกล่องไปเป็นโปรเจค
   */
  const board = filter
    ? pm.inbox.filter((j) => isRef(j, filter))
    : pm.inbox.filter((j) => j.stage === "new" || j.stage === "plan");
  /* งานที่วางแผนจบแล้วออกจากกล่องไปเป็นโปรเจค — ลิงก์ที่เจาะมาต้องยังบอกได้ว่าอยู่ที่ไหน */
  const project = filter ? pm.projects.find((p) => isRef(p, filter)) : undefined;
  const term = q.trim().toLowerCase();
  /* งานรอรับขึ้นก่อน งานที่รับแล้วต่อท้าย — ในแต่ละกลุ่มล่าสุดอยู่บน เพราะเป็นกล่องงานเข้า */
  const rows = board
    .filter((j) => !term || `${j.scope} ${j.cus} ${j.pj} ${j.deal ?? ""} ${j.takenBy ?? ""}`.toLowerCase().includes(term))
    .sort((a, b) => Number(a.stage !== "new") - Number(b.stage !== "new") || b.sentAt.localeCompare(a.sentAt));
  const waitN = rows.filter((j) => j.stage === "new").length;
  const takenN = rows.length - waitN;

  const job = viewing ? pm.inbox.find((j) => j.pj === viewing) : undefined;
  const takeJob = taking ? pm.inbox.find((j) => j.pj === taking) : undefined;

  /* GM มีสิทธิ์เท่า PM แล้ว รับงานจากกระดานเดียวกันได้ (usePmReadOnly คืน false) */
  const ro = usePmReadOnly();

  /* ปุ่มตา "ดูรายละเอียด" — เปิดเอกสารดูอย่างเดียวทุกงาน (ถือว่าอ่านแล้ว จุดแดงหาย) */
  function view(j: InboxJob) {
    setNotice("");
    if (j.stage === "new") markInboxSeen(j.pj);
    setViewing(j.pj);
  }

  /* แตะแถว/การ์ด: งานที่ตัวเองรับไป → หน้าวางแผน · นอกนั้นเปิดรายละเอียดดูอย่างเดียว */
  function open(j: InboxJob) {
    if (j.stage !== "new" && j.takenBy && j.takenBy === me) {
      setNotice("");
      router.push(planHref(j.pj));
      return;
    }
    view(j);
  }

  /* ปุ่ม "รับงาน" → กล่องยืนยันเล็ก (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  function take(j: InboxJob) {
    setNotice("");
    setTaking(j.pj);
  }

  /* ปุ่มรูปตาสไตล์ระบบ 30px — ใช้ทั้งตารางและการ์ดมือถือ */
  function eyeButton(j: InboxJob) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          view(j);
        }}
        className="grid size-[30px] flex-none place-items-center rounded-lg border border-border bg-white text-muted-foreground transition-colors hover:border-primary hover:bg-accent hover:text-primary"
        aria-label="ดูรายละเอียด"
        title="ดูรายละเอียด"
      >
        <EyeIcon className="size-3.5" strokeWidth={2} />
      </button>
    );
  }

  return (
    <div className="ib-m space-y-4">
      {/* มือถือ: ซ่อนหัวหน้าและตัวนับ — ชื่อหน้าอยู่ที่แถบหัวของ shell แล้ว (ต้นแบบ ib-mobile) */}
      <div className="bar ib-m-bar">
        <div>
          <h1>งานเข้าใหม่</h1>
          <p>กระดานรับงานของ PM และ GM · ใครรับก่อนได้งาน</p>
        </div>
        <div className="tools">
          <span className="text-[13px] text-muted-foreground">
            {rows.length ? (
              <>
                {filter && "งานที่กรองอยู่ · "}รอรับ <b className="num text-primary">{waitN}</b> · รับแล้ว{" "}
                <b className="num">{takenN}</b>
              </>
            ) : filter ? (
              "ไม่มีงานในกล่องนี้"
            ) : (
              "ไม่มีงานรอรับ"
            )}
          </span>
        </div>
      </div>
      <ReadOnlyNote />

      {notice && (
        <p
          role="alert"
          className="glass flex items-center gap-3 rounded-[14px] px-4 py-3 text-[13px] font-semibold text-destructive"
        >
          <span className="min-w-0 flex-1">{notice}</span>
          <button type="button" className="btn glass-thin h-8" onClick={() => setNotice("")}>
            ปิด
          </button>
        </p>
      )}

      {filter && (
        <div className="glass flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] px-4 py-3 text-[13px]">
          <span className="min-w-0">
            กรองเฉพาะโปรเจค <b className="num">{project?.pj ?? board[0]?.pj ?? filter}</b>
            {project && (
              <span className="text-muted-foreground"> · รับงานแล้ว · เปิดเป็นโปรเจคแล้ว</span>
            )}
            {!project && rows.length === 0 && (
              <span className="text-muted-foreground"> · ไม่พบงานของโปรเจคนี้ในกล่องงานเข้า</span>
            )}
          </span>
          {project && (
            <Link
              href={projectHref(project.pj)}
              className="text-[12.5px] font-semibold text-primary hover:underline"
            >
              เปิดโปรเจค
            </Link>
          )}
          <button
            type="button"
            className="btn glass-thin ml-auto h-9"
            onClick={() => setFilter("")}
          >
            ล้างตัวกรอง
          </button>
        </div>
      )}

      <SearchBox value={q} onChange={setQ} placeholder="ค้นหางาน ลูกค้า หรือคนรับงาน" />

      {/* มือถือ (ต้นแบบ ib-mobile): การ์ดต่องาน — ไอคอนกล่องงานเข้า | ลูกค้า / ชื่องาน / บริการ
          เส้นประ · แหล่งที่มา + วันที่เข้า ซ้าย ปุ่มตา + ปุ่มรับงานขวา · แตะการ์ดเปิดรายละเอียดดูอย่างเดียว · รับงานเปิดกล่องยืนยัน
          งานที่มีคนรับไปแล้ว: การ์ดจาง ป้าย "รับแล้ว · ชื่อ" แทนปุ่ม แตะดูเอกสารได้ (คนรับเองไปหน้าวางแผน) */}
      <ul className="ib-m-list md:hidden">
        {rows.length === 0 ? (
          <li className="ib-m-empty">
            {q ? "ไม่พบงานที่ค้นหา" : filter ? "ไม่พบงานของโปรเจคนี้" : "ไม่มีงานรอรับ"}
          </li>
        ) : (
          rows.map((j) => {
            const waiting = j.stage === "new";
            const canTake = !ro && waiting;
            const mine = !waiting && Boolean(j.takenBy) && j.takenBy === me;
            return (
              <li
                key={j.pj}
                className={`ib-m-card tap${waiting ? "" : " taken"}`}
                onClick={() => open(j)}
              >
                <span className="ib-m-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 13h5l2 3h4l2-3h5" />
                    <path d="M5 5h14l2 8v6H3v-6z" />
                  </svg>
                </span>
                <span className="ib-m-cus">{j.cus}</span>
                <b className="ib-m-name">
                  {waiting && !j.seen && <i className="ib-m-unread" aria-label="ยังไม่ได้เปิดดู" />}
                  {j.scope}
                </b>
                <span className="ib-m-svc">{serviceLabel(j.service)}</span>
                <span className="ib-m-line" aria-hidden="true" />
                <span className="ib-m-src">
                  <FileIcon strokeWidth={2.2} />
                  {j.proposal?.no ? `Proposal ${j.proposal.no}` : `ใบเสนอราคา ${j.quo}`}
                </span>
                <span className="ib-m-day num">เข้า {thaiDate(j.sentAt)}</span>
                {/* ปุ่มตา "ดูรายละเอียด" ทุกการ์ด ก่อนปุ่มรับงาน/ป้ายสถานะ (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
                <span className="ib-m-take">
                  {eyeButton(j)}
                  {canTake ? (
                    <button
                      type="button"
                      className="btn solid btn-solid"
                      onClick={(e) => {
                        e.stopPropagation();
                        take(j);
                      }}
                    >
                      รับงาน
                    </button>
                  ) : waiting ? (
                    <span className="ib-m-stage">{stageText(j)}</span>
                  ) : (
                    <span className="ib-m-stage">
                      {takenTag(j)}
                      {mine && <span className="block text-primary">ไปหน้าวางแผน</span>}
                    </span>
                  )}
                </span>
              </li>
            );
          })
        )}
      </ul>

      <section className="panel glass flex flex-col max-md:hidden">
        <div className="scroll-stable min-h-0 flex-1 overflow-auto">
          <table className="data-table cards-sm min-w-[1000px]">
            <thead>
              <tr>
                {/* คอลัมน์แรกเป็นรหัสโปรเจค — ชื่องานยังไม่มี PM ตั้งเองในหน้าโปรเจค · ไม่มีแหล่งที่มาในตาราง (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
                <th style={{ width: 170 }}>รหัสโปรเจค</th>
                <th style={{ width: 170 }}>ลูกค้า</th>
                <th style={{ width: 140 }}>บริการ</th>
                <th style={{ width: 110 }}>วันที่เข้า</th>
                {/* สถานะกับผู้รับผิดชอบแยกคอลัมน์ (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
                <th style={{ width: 120 }}>สถานะ</th>
                <th style={{ width: 160 }}>ผู้รับผิดชอบ</th>
                <th className="c" style={{ width: 150 }} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-[50px] text-center text-muted-foreground">
                    {q ? "ไม่พบงานที่ค้นหา" : filter ? "ไม่พบงานของโปรเจคนี้" : "ไม่มีงานรอรับ"}
                  </td>
                </tr>
              ) : (
                rows.map((j) => {
                  const waiting = j.stage === "new";
                  const mine = !waiting && Boolean(j.takenBy) && j.takenBy === me;
                  return (
                    <tr
                      key={j.pj}
                      className={waiting ? "cursor-pointer" : "cursor-pointer bg-muted/50 text-muted-foreground"}
                      onClick={() => open(j)}
                    >
                      <td data-label="รหัสโปรเจค">
                        <span className="num inline-flex items-center gap-2 font-semibold whitespace-nowrap">
                          {waiting && !j.seen && (
                            <i
                              className="size-2 flex-none rounded-full bg-primary"
                              aria-label="ยังไม่ได้เปิดดู"
                            />
                          )}
                          {j.pj}
                        </span>
                      </td>
                      <td data-label="ลูกค้า">{j.cus}</td>
                      <td data-label="บริการ">{serviceLabel(j.service)}</td>
                      <td data-label="วันที่เข้า" className="num muted">
                        {thaiDate(j.sentAt)}
                      </td>
                      <td data-label="สถานะ">
                        {waiting ? (
                          <span className="tag t-early">
                            <i />
                            รอรับงาน
                          </span>
                        ) : (
                          <span className="tag t-ok">
                            <i />
                            รับแล้ว
                          </span>
                        )}
                      </td>
                      <td data-label="ผู้รับผิดชอบ" className={waiting || !j.takenBy ? "muted" : undefined}>
                        {waiting ? "—" : (j.takenBy ?? "—")}
                      </td>
                      {/* ปุ่มตา "ดูรายละเอียด" ทุกแถวอยู่ก่อนปุ่มรับงาน · แถวที่รับแล้วใช้แทนข้อความ "ดูเอกสาร" (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
                      <td className="c">
                        <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                          {eyeButton(j)}
                          {waiting
                            ? !ro && (
                                <button
                                  type="button"
                                  className="btn solid btn-solid"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    take(j);
                                  }}
                                >
                                  รับงาน
                                </button>
                              )
                            : mine && (
                                <Link
                                  href={planHref(j.pj)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[12px] font-semibold text-primary hover:underline"
                                >
                                  ไปหน้าวางแผน
                                </Link>
                              )}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {job && (
        <DetailSheet
          job={job}
          takenNote={
            job.stage === "new"
              ? ""
              : job.takenBy
                ? `งานนี้ถูกรับไปแล้วโดย ${job.takenBy}${job.takenAt ? ` เมื่อ ${thaiDate(job.takenAt)}` : ""}`
                : "งานนี้ถูกรับไปแล้ว"
          }
          onClose={() => setViewing(null)}
        />
      )}

      {takeJob && (
        <TakeConfirm
          key={takeJob.pj}
          job={takeJob}
          onCancel={() => setTaking(null)}
          onAccept={(start) => {
            /* ไม่ส่งชื่อ — สโตร์ตั้งต้นเป็นชื่อลูกค้า แล้ว PM แก้ที่หน้าจัดคิวงาน/หน้าโปรเจค (ผู้ใช้สั่ง 5 ต.ค. 2569)
               รับไม่ทัน — อีกคนกดรับไปก่อน (แท็บค้าง) สโตร์ปฏิเสธ บอกชื่อคนที่รับไป ไม่พาไปหน้าวางแผน */
            const res = acceptInboxJob(takeJob.pj, start);
            if (!res.ok) {
              if (res.reason === "taken") {
                setTaking(null);
                setNotice(res.takenBy ? `งานนี้ถูกรับไปแล้วโดย ${res.takenBy}` : "งานนี้ถูกรับไปแล้ว");
              }
              return;
            }
            setTaking(null);
            /* รับแล้วพาไปหน้าวางแผนของโปรเจคที่เพิ่งเปิด
               เพราะจัดคิวงานคือขั้นถัดไปที่ต้องทำแน่ ๆ ไม่ใช่ให้ไปหาเองจากหน้าโปรเจค */
            router.push(planHref(takeJob.pj));
          }}
        />
      )}
    </div>
  );
}

/**
 * กล่องยืนยันรับงาน (ผู้ใช้สั่ง 5 ต.ค. 2569) — ใช้ ConfirmDialog กลางของระบบ ไม่เปิดเอกสาร
 * ช่องเดียวที่ต้องเลือกคือวันเริ่มโครงการ · มีโครงเฟสบอกสรุปเฟส/ระยะ/วันคาดส่งมอบ
 */
function TakeConfirm({
  job,
  onCancel,
  onAccept,
}: {
  job: InboxJob;
  onCancel: () => void;
  onAccept: (start: string) => void;
}) {
  const today = todayIso();
  /* ตามต้นแบบ: ตั้งต้นเป็นวันเริ่มตามข้อเสนอเสมอ (แม้เลยมาแล้ว) ไม่มีจึงใช้วันนี้ — ส่วนปฏิทินยังเลือกย้อนหลังไม่ได้ */
  const [start, setStart] = useState(() => job.planStart || today);
  const [pick, setPick] = useState(false);
  const hasPlan = job.phases.length > 0 && Boolean(job.planStart);
  const shift = hasPlan && start ? daysBetween(job.planStart, start) : 0;

  return (
    <ConfirmDialog
      open
      title="ยืนยันรับงาน"
      description={
        <>
          รับงาน <b className="num text-foreground">{job.pj}</b> · {job.cus}?
        </>
      }
      detail={
        <div className="text-[13px]">
          <label htmlFor="qStart" className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">
            วันเริ่มโครงการ
          </label>
          <ThaiDatePicker
            id="qStart"
            value={start}
            min={today}
            open={pick}
            label="วันเริ่มโครงการ"
            onToggle={() => setPick((v) => !v)}
            onPick={(iso) => {
              setStart(iso);
              setPick(false);
            }}
          />
          <p className="mt-2.5 text-[12.5px] leading-relaxed">
            {!start ? (
              <span className="font-semibold text-destructive">เลือกวันเริ่มโครงการก่อน</span>
            ) : !hasPlan ? (
              <>
                งานนี้ไม่มีโครงเฟสมาให้ เริ่มโครงการ <b>{thaiDate(start)}</b> แล้วสร้างเฟสเองในหน้าวางแผน
              </>
            ) : (
              <>
                เริ่ม <b>{thaiDate(start)}</b> · {job.phases.length} เฟส · ระยะ {job.durationDays} วัน · คาดส่งมอบ{" "}
                <b>{thaiDate(addDays(job.planEnd, shift))}</b>
                {shift !== 0 && (
                  <span className="ml-1.5 text-muted-foreground">
                    (เลื่อนจากข้อเสนอ {shift > 0 ? "+" : ""}
                    {shift} วัน)
                  </span>
                )}
              </>
            )}
          </p>
        </div>
      }
      confirmLabel="รับงาน"
      cancelLabel="ยกเลิก"
      onCancel={onCancel}
      onConfirm={() => {
        if (start) onAccept(start);
      }}
    />
  );
}

/**
 * รายละเอียดงาน ดูอย่างเดียว (ผู้ใช้สั่ง 5 ต.ค. 2569) — ใบเสนอราคา/ข้อเสนอ เฟส ยอดรวม ไฟล์แนบ หมายเหตุ
 * ไม่มีปุ่มรับงานในนี้ — รับงานจากปุ่ม "รับงาน" ในตาราง/การ์ด · takenNote มีค่า = มีคนรับไปแล้ว
 */
function DetailSheet({
  job,
  takenNote = "",
  onClose,
}: {
  job: InboxJob;
  takenNote?: string;
  onClose: () => void;
}) {
  return (
    <Sheet
      wide
      className="ib-take-dlg"
      title={`${job.cus} (${job.pj})`}
      onClose={onClose}
      footer={
        <button type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={onClose}>
          ปิด
        </button>
      }
    >
      <div className="ib-take">
      {takenNote && (
        <p className="mb-3.5 rounded-[11px] border border-border bg-muted px-3.5 py-3 text-[13px] font-semibold">
          {takenNote}
        </p>
      )}
      <QuotationPreview job={job} />

      {job.proposal?.no ? (
        <div className="mt-4">
          <ProposalPreview job={job} variant="inbox" />
          {job.proposal.note && <Note>{job.proposal.note}</Note>}
        </div>
      ) : job.proposal ? (
        /* หาเอกสารข้อเสนอไม่เจอจริง ๆ — บอกไปตรง ๆ ว่าไม่มี ไม่ใช่โชว์เอกสารเปล่า */
        <Note>{job.proposal.note}</Note>
      ) : (
        <Note className="max-md:hidden">
          งานเดี่ยว รับจ้างเป็นชิ้น ไม่มีข้อเสนอจึงไม่มีเฟสและกรอบเวลา
          ผู้จัดการโครงการจับคนและกำหนดวันส่งได้เลย ไม่ต้องเปิดเป็นโปรเจค
        </Note>
      )}
      </div>
    </Sheet>
  );
}

function Note({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`${className} mt-3.5 rounded-[11px] border border-border bg-card px-3.5 py-3 text-[12.5px] leading-relaxed text-muted-foreground`}>
      {children}
    </p>
  );
}
