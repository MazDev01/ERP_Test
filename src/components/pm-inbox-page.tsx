"use client";

/*
 * งานเข้าใหม่ (ตามต้นแบบ pm-inbox.html) — งานที่ลูกค้าชำระงวดแรกแล้ว
 *
 * GM มอบหมายงานให้ PM ทีละงาน PM กดรับงานเองไม่ได้แล้ว (ผู้ใช้สั่ง 27 ต.ค. 2569)
 * — แทนกระดานรับงานกลาง "ใครกดรับก่อนได้ก่อน" เดิม (5 ต.ค. 2569)
 *
 * GM เห็นทุกงาน: รอมอบหมาย → ปุ่ม "มอบหมาย PM" · มอบหมายแล้วแต่ยังไม่ยืนยันแผน → ปุ่ม "เปลี่ยน PM" (กล่องเดียวกัน)
 *   ยืนยันแผนแล้วงานออกจากกล่องไปเป็นโปรเจค — เปลี่ยนคนดูแลผ่าน "โอนโปรเจค" ที่หน้าโปรเจค ไม่ใช่ที่นี่
 * PM เห็นเฉพาะงานที่ GM มอบหมายให้ตัวเอง → ปุ่ม "วางแผนงาน" ไปหน้าวางแผนของงานนั้น · งานที่ยังไม่มอบหมายไม่ขึ้น
 * เอกสารของงาน (ใบเสนอราคา/ข้อเสนอ เฟส ยอดรวม ไฟล์แนบ) ดูได้จากปุ่มรูปตา "ดูรายละเอียด" ทุกแถว — ดูอย่างเดียว
 * ทุกลิงก์ในหน้านี้อยู่ในหน้าของ PM เท่านั้น ไม่พาข้ามไปหน้าของบทบาทอื่น
 */

import Link from "next/link";
import { useState } from "react";
import { useFindParam } from "@/lib/deep-link";
import { thaiDate } from "@/lib/format";
import { holdsPos } from "@/lib/hr-data";
import { useHr } from "@/lib/hr-store";
import { isAssignedJob, isJobOf, isRef, planHref, projectHref, serviceLabel, type InboxJob } from "@/lib/pm-data";
import { assignInboxJob, markInboxSeen, pmIdOf, usePm } from "@/lib/pm-store";
import { USERS } from "@/lib/mock-data";
import { displayName, useNameOf } from "@/lib/emp-name";
import { useRole } from "@/lib/role";
import { Sheet } from "./lead-dialogs";
import { ProposalPreview, QuotationPreview } from "./pm-docs";
import { SearchBox } from "./sales-ui";
import { ReadOnlyNote, usePmReadOnly } from "./pm-readonly";
import { EyeIcon, FileIcon } from "./icons";
import "@/styles/mobile/pm-inbox.css";
import { stackNo } from "@/lib/stack-no";

type Lookup = ReturnType<typeof useNameOf>;

/* ข้อความบอกว่างานนี้อยู่กับใคร — โชว์ในรายละเอียดงาน (ผู้ใช้สั่ง 27 ต.ค. 2569) */
function ownerNote(j: InboxJob, nameOfEmp: Lookup) {
  if (!isAssignedJob(j) || !j.takenBy) return "";
  const who = nameOfEmp(j.takenBy);
  if (!j.assignedBy) return `ดูแลโดย ${who}${j.takenAt ? ` ตั้งแต่ ${thaiDate(j.takenAt)}` : ""}`;
  return `มอบหมายให้ ${who}${j.assignedAt ? ` เมื่อ ${thaiDate(j.assignedAt)}` : ""} · โดย ${nameOfEmp(j.assignedBy)}`;
}

export function PmInboxPage() {
  const pm = usePm();
  const role = useRole();
  const me = USERS[role]?.name ?? "";
  const nameOfEmp = useNameOf();
  /* GM เป็นคนมอบหมาย — บทบาทอื่นที่เปิดหน้านี้ (PM) เห็นเฉพาะงานของตัวเอง (ผู้ใช้สั่ง 27 ต.ค. 2569) */
  const gm = role === "gm";
  const ro = usePmReadOnly();
  const canAssign = gm && !ro;
  /* งานที่คนนี้เห็นได้ — GM ทุกงานในกล่อง · PM เฉพาะที่ GM มอบหมายให้ */
  const visible = (j: InboxJob) => (gm ? j.stage === "new" || j.stage === "plan" : isJobOf(j, me));
  /*
   * ลิงก์จากหน้าอื่น ?find=<เลขที่โปรเจค> (ลิงก์เก่าส่งเลขที่ดีล — หาเจอทั้งคู่ · 5 ต.ค. 2569) ต้อง "กรอง" ให้เหลืองานนั้น (ผู้ใช้กำหนด 23 ก.ย. 2569)
   * ส่งเลขเอกสารมากับลิงก์แล้วไม่กรอง เท่ากับให้คนไปหาเองในรายการ
   * และต้องบอกได้ว่าตอนนี้งานอยู่ขั้นไหน ไม่ใช่ขึ้นว่าไม่พบ
   */
  const find = useFindParam();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState(find);
  const [viewing, setViewing] = useState<string | null>(() =>
    pm.inbox.find((j) => isRef(j, find) && visible(j))?.pj ?? null,
  );
  /* งานที่กำลังมอบหมาย/เปลี่ยน PM — กล่องเลือก PM (ผู้ใช้สั่ง 27 ต.ค. 2569) */
  const [assigning, setAssigning] = useState<string | null>(null);

  const board = pm.inbox.filter((j) => visible(j) && (!filter || isRef(j, filter)));
  /* งานที่วางแผนจบแล้วออกจากกล่องไปเป็นโปรเจค — ลิงก์ที่เจาะมาต้องยังบอกได้ว่าอยู่ที่ไหน */
  const project = filter ? pm.projects.find((p) => isRef(p, filter)) : undefined;
  const term = q.trim().toLowerCase();
  /* ตัวกรองต่อท้ายช่องค้นหา — ประเภทบริการ และสถานะ (ผู้ใช้สั่ง 8 ต.ค. 2569) · สถานะมีเฉพาะมุมมอง GM */
  const [svc, setSvc] = useState("");
  const [stage, setStage] = useState<"" | "wait" | "done">("");
  const services = [...new Set(board.map((j) => j.service))];
  /*
   * ลำดับแบบกองซ้อน — นับจากงานเข้าทั้งหมด (รวมที่ออกไปเป็นโปรเจคแล้ว) ตามวันที่เข้า งานล่าสุดเลขมากสุด (ผู้ใช้สั่ง 12 ต.ค. 2569)
   */
  const noOf = stackNo(pm.inbox, (j) => j.sentAt, (j) => j.pj);
  /* งานรอมอบหมายขึ้นก่อน งานที่มอบหมายแล้วต่อท้าย — ในแต่ละกลุ่มล่าสุดอยู่บน เพราะเป็นกล่องงานเข้า */
  const rows = board
    .filter((j) => !term || `${j.scope} ${j.cus} ${j.pj} ${j.deal ?? ""} ${j.takenBy ?? ""} ${j.takenBy ? nameOfEmp(j.takenBy) : ""}`.toLowerCase().includes(term))
    .filter((j) => (!svc || j.service === svc) && (!stage || (stage === "done") === isAssignedJob(j)))
    .sort((a, b) => Number(isAssignedJob(a)) - Number(isAssignedJob(b)) || b.sentAt.localeCompare(a.sentAt));

  const job = viewing ? pm.inbox.find((j) => j.pj === viewing) : undefined;
  const assignJob = assigning ? pm.inbox.find((j) => j.pj === assigning) : undefined;
  const empty = q ? "ไม่พบงานที่ค้นหา" : filter ? "ไม่พบงานของโปรเจคนี้" : gm ? "ไม่มีงานรอมอบหมาย" : "ยังไม่มีงานที่ GM มอบหมายให้คุณ";

  /* ปุ่มตา "ดูรายละเอียด" — เปิดเอกสารดูอย่างเดียวทุกงาน · PM เปิดงานของตัวเองแล้วถือว่าอ่านแล้ว */
  function view(j: InboxJob) {
    if (!gm && !j.seen) markInboxSeen(j.pj);
    setViewing(j.pj);
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

  /* ปุ่มหลักของแถว — GM: มอบหมาย/เปลี่ยน PM · PM: วางแผนงาน (ผู้ใช้สั่ง 27 ต.ค. 2569) */
  function actionButton(j: InboxJob) {
    if (gm) {
      if (!canAssign) return null;
      return (
        <button
          type="button"
          className={isAssignedJob(j) ? "btn glass-thin" : "btn solid btn-solid"}
          onClick={(e) => {
            e.stopPropagation();
            setAssigning(j.pj);
          }}
        >
          {isAssignedJob(j) ? "เปลี่ยน PM" : "มอบหมาย PM"}
        </button>
      );
    }
    if (ro) return null;
    return (
      <Link href={planHref(j.pj)} className="btn solid btn-solid" onClick={(e) => e.stopPropagation()}>
        วางแผนงาน
      </Link>
    );
  }

  function statusTag(j: InboxJob) {
    return isAssignedJob(j) ? (
      <span className="tag t-ok">
        <i />
        มอบหมายแล้ว
      </span>
    ) : (
      <span className="tag t-early">
        <i />
        รอมอบหมาย
      </span>
    );
  }

  return (
    <div className="ib-m space-y-4">
      {/* มือถือ: ซ่อนหัวหน้าและตัวนับ — ชื่อหน้าอยู่ที่แถบหัวของ shell แล้ว (ต้นแบบ ib-mobile) */}
      {/* ชื่อหน้ามุมซ้ายบน — แถบบนจอคอมเป็นเส้นทางแล้ว (ผู้ใช้สั่ง 12 ต.ค. 2569) */}
      <h1 className="page-h1">งานเข้าใหม่</h1>
      {/* ไม่มีตัวนับ — สถานะอยู่ในตารางแล้ว (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
      <ReadOnlyNote />

      {filter && (
        <div className="glass flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] px-4 py-3 text-[13px]">
          <span className="min-w-0">
            กรองเฉพาะโปรเจค <b>{project ? project.name || project.cus : board[0]?.cus ?? "ที่ลิงก์มา"}</b>
            {project && (
              <span className="text-muted-foreground"> · วางแผนแล้ว · เปิดเป็นโปรเจคแล้ว</span>
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

      <div className="flex flex-wrap items-center gap-2.5 sm:flex-nowrap">
        <div className="min-w-0 max-sm:w-full">
          <SearchBox value={q} onChange={setQ} placeholder={gm ? "ค้นหางาน ลูกค้า หรือ PM" : "ค้นหางาน หรือลูกค้า"} />
        </div>
        <select
          value={svc}
          onChange={(e) => setSvc(e.target.value)}
          aria-label="กรองตามประเภทบริการ"
          style={{ width: "auto" }}
          className="field-control h-10 cursor-pointer text-[13.5px] max-sm:flex-1"
        >
          <option value="">ทุกประเภทบริการ</option>
          {services.map((v) => (
            <option key={v} value={v}>
              {serviceLabel(v)}
            </option>
          ))}
        </select>
        {/* PM เห็นแต่งานที่มอบหมายให้แล้ว ตัวกรองสถานะจึงมีเฉพาะ GM (ผู้ใช้สั่ง 27 ต.ค. 2569) */}
        {gm && (
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as "" | "wait" | "done")}
            aria-label="กรองตามสถานะ"
            style={{ width: "auto" }}
            className="field-control h-10 cursor-pointer text-[13.5px] max-sm:flex-1"
          >
            <option value="">ทุกสถานะ</option>
            <option value="wait">รอมอบหมาย</option>
            <option value="done">มอบหมายแล้ว</option>
          </select>
        )}
      </div>

      {/* มือถือ (ต้นแบบ ib-mobile): การ์ดต่องาน — ไอคอนกล่องงานเข้า | ลูกค้า / ชื่องาน / บริการ
          เส้นประ · แหล่งที่มา + วันที่เข้า ซ้าย ปุ่มตา + ปุ่มหลักขวา · แตะการ์ดเปิดรายละเอียดดูอย่างเดียว
          GM: งานที่มอบหมายแล้วการ์ดจาง บอกชื่อ PM ต่อท้ายลูกค้า ปุ่ม "เปลี่ยน PM" (ผู้ใช้สั่ง 27 ต.ค. 2569) */}
      <ul className="ib-m-list md:hidden">
        {rows.length === 0 ? (
          <li className="ib-m-empty">{empty}</li>
        ) : (
          rows.map((j) => {
            const done = isAssignedJob(j);
            return (
              <li
                key={j.pj}
                className={`ib-m-card tap${gm && done ? " taken" : ""}`}
                onClick={() => view(j)}
              >
                <span className="ib-m-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 13h5l2 3h4l2-3h5" />
                    <path d="M5 5h14l2 8v6H3v-6z" />
                  </svg>
                </span>
                <span className="ib-m-cus">
                  #{noOf.get(j.pj)} · {j.cus}
                  {gm && (done && j.takenBy ? ` · PM ${nameOfEmp(j.takenBy)}` : " · รอมอบหมาย")}
                </span>
                <b className="ib-m-name">
                  {/* จุดแดง = GM เพิ่งมอบหมายมาและ PM ยังไม่ได้เปิดดู (ผู้ใช้สั่ง 27 ต.ค. 2569) */}
                  {!gm && Boolean(j.assignedBy) && !j.seen && <i className="ib-m-unread" aria-label="ยังไม่ได้เปิดดู" />}
                  {j.scope}
                </b>
                <span className="ib-m-svc">{serviceLabel(j.service)}</span>
                <span className="ib-m-line" aria-hidden="true" />
                <span className="ib-m-src">
                  <FileIcon strokeWidth={2.2} />
                  {j.proposal?.no ? `Proposal รอบที่ ${j.proposal.round}` : `ใบเสนอราคา ${j.quo}`}
                </span>
                <span className="ib-m-day num">เข้า {thaiDate(j.sentAt)}</span>
                {/* ปุ่มตา "ดูรายละเอียด" ทุกการ์ด ก่อนปุ่มหลัก (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
                <span className="ib-m-take">
                  {eyeButton(j)}
                  {actionButton(j)}
                </span>
              </li>
            );
          })
        )}
      </ul>

      <section className="panel glass flex flex-col max-md:hidden">
        <div className="scroll-stable min-h-0 flex-1 overflow-auto">
          <table className="data-table cards-sm min-w-[890px]">
            <thead>
              <tr>
                {/* ไม่มีคอลัมน์รหัสโปรเจค — รหัสอยู่ในฐานข้อมูลเท่านั้น (ผู้ใช้สั่ง 14 ต.ค. 2569) */}
                <th className="c" style={{ width: 60 }}>ลำดับ</th>
                <th style={{ width: 170 }}>ลูกค้า</th>
                <th style={{ width: 140 }}>บริการ</th>
                <th style={{ width: 110 }}>วันที่เข้า</th>
                {/* สถานะกับผู้รับผิดชอบแยกคอลัมน์ (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
                <th style={{ width: 120 }}>สถานะ</th>
                {/* PM เห็นแค่งานของตัวเอง ไม่ต้องมีคอลัมน์ผู้รับผิดชอบ — GM ยังมี (ผู้ใช้สั่ง 29 ต.ค. 2569) */}
                {gm && <th style={{ width: 160 }}>ผู้รับผิดชอบ</th>}
                <th className="c" style={{ width: 160 }} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={gm ? 7 : 6} className="py-[50px] text-center text-muted-foreground">
                    {empty}
                  </td>
                </tr>
              ) : (
                rows.map((j) => {
                  const done = isAssignedJob(j);
                  return (
                    <tr
                      key={j.pj}
                      className={gm && done ? "cursor-pointer bg-muted/50 text-muted-foreground" : "cursor-pointer"}
                      onClick={() => view(j)}
                    >
                      <td data-label="ลำดับ" className="c num muted">{noOf.get(j.pj)}</td>
                      <td data-label="ลูกค้า">{j.cus}</td>
                      <td data-label="บริการ">{serviceLabel(j.service)}</td>
                      <td data-label="วันที่เข้า" className="num muted">
                        {thaiDate(j.sentAt)}
                      </td>
                      <td data-label="สถานะ">{statusTag(j)}</td>
                      {gm && (
                        <td data-label="ผู้รับผิดชอบ" className={done && j.takenBy ? undefined : "muted"}>
                          {done && j.takenBy ? nameOfEmp(j.takenBy) : "—"}
                        </td>
                      )}
                      {/* ปุ่มตา "ดูรายละเอียด" ทุกแถวอยู่ก่อนปุ่มหลัก (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
                      <td className="c">
                        <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                          {eyeButton(j)}
                          {actionButton(j)}
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

      {/* เอางานที่ทีมเสนอและงานนอกโปรเจคออกจากหน้านี้ — หน้านี้มีแค่งานเข้าใหม่ (ผู้ใช้สั่ง 27 ต.ค. 2569) */}

      {job && (
        <DetailSheet
          job={job}
          ownerText={ownerNote(job, nameOfEmp)}
          onClose={() => setViewing(null)}
        />
      )}

      {assignJob && (
        <AssignSheet
          key={assignJob.pj}
          job={assignJob}
          onClose={() => setAssigning(null)}
        />
      )}
    </div>
  );
}

/**
 * กล่องมอบหมาย PM (ผู้ใช้สั่ง 27 ต.ค. 2569) — ใช้ทั้งมอบหมายครั้งแรกและเปลี่ยน PM
 * รายชื่อจากทะเบียนฝ่ายบุคคล: ตำแหน่ง PM (นับตำแหน่งควบ) ที่ยังทำงานอยู่
 * แต่ละคนบอกจำนวนโปรเจคที่กำลังดูแล และงานที่รอวางแผนอยู่ในมือ · ข้อความถึง PM ไม่บังคับ
 */
function AssignSheet({ job, onClose }: { job: InboxJob; onClose: () => void }) {
  const hr = useHr();
  const pm = usePm();
  const nameOfEmp = useNameOf();
  const again = isAssignedJob(job);
  const people = hr.emp.filter((e) => e.status === "active" && holdsPos(e, "pm"));
  const [to, setTo] = useState(() => (again ? job.takenBy ?? "" : ""));
  const [note, setNote] = useState(() => (again ? job.assignNote ?? "" : ""));
  const [touched, setTouched] = useState(false);
  const missTo = !to;

  function save() {
    setTouched(true);
    if (missTo) return;
    if (assignInboxJob(job.pj, to, note)) onClose();
  }

  return (
    <Sheet
      title={again ? "เปลี่ยน PM" : "มอบหมาย PM"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn solid btn-solid" onClick={save}>
            {again ? "เปลี่ยน PM" : "มอบหมาย"}
          </button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        <b className="font-semibold text-foreground">{job.cus}</b> · {job.scope}
        {again && job.takenBy && (
          <>
            <br />
            ตอนนี้ดูแลโดย <b className="font-semibold text-foreground">{nameOfEmp(job.takenBy)}</b>
          </>
        )}
      </p>

      <p className="mt-4 text-[12.5px] font-semibold">เลือก PM</p>
      {people.length === 0 ? (
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">ยังไม่มีพนักงานตำแหน่ง PM ในทะเบียน</p>
      ) : (
        <div role="radiogroup" aria-label="เลือก PM" className="mt-1.5 flex flex-col gap-2">
          {people.map((e) => {
            const running = pm.projects.filter((p) => p.status === "running" && pmIdOf(p.pm) === e.id).length;
            const waiting = pm.inbox.filter((j) => j.pj !== job.pj && isJobOf(j, e.name)).length;
            const on = to === e.name;
            return (
              <button
                key={e.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTo(e.name)}
                className={`flex items-center gap-3 rounded-[12px] border px-3.5 py-2.5 text-left transition-colors ${
                  on ? "border-primary bg-accent" : "border-border bg-white hover:border-primary"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`grid size-4 flex-none place-items-center rounded-full border-2 ${on ? "border-primary" : "border-border"}`}
                >
                  {on && <span className="size-2 rounded-full bg-primary" />}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13.5px] font-semibold">{displayName(e)}</b>
                  <span className="block text-[12px] text-muted-foreground">
                    ดูแลอยู่ {running} โปรเจค{waiting > 0 ? ` · รอวางแผน ${waiting} งาน` : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {touched && missTo && (
        <p className="mt-1.5 text-[12px] font-semibold text-destructive">เลือก PM ก่อน</p>
      )}

      <label htmlFor="asNote" className="mt-4 block text-[12.5px] font-semibold">
        ข้อความถึง PM <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span>
      </label>
      <textarea
        id="asNote"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="เช่น ลูกค้าขอเริ่มงานภายในต้นเดือนหน้า"
        className="field-control mt-1.5 h-[84px] resize-y py-2.5 leading-relaxed"
      />
    </Sheet>
  );
}

/**
 * รายละเอียดงาน ดูอย่างเดียว (ผู้ใช้สั่ง 5 ต.ค. 2569) — ใบเสนอราคา/ข้อเสนอ เฟส ยอดรวม ไฟล์แนบ หมายเหตุ
 * ไม่มีปุ่มมอบหมาย/วางแผนในนี้ — ใช้ปุ่มในตาราง/การ์ด · ownerText มีค่า = มี PM ดูแลแล้ว (ผู้ใช้สั่ง 27 ต.ค. 2569)
 */
function DetailSheet({
  job,
  ownerText = "",
  onClose,
}: {
  job: InboxJob;
  ownerText?: string;
  onClose: () => void;
}) {
  return (
    <Sheet
      wide
      className="ib-take-dlg"
      title={job.cus}
      onClose={onClose}
      footer={
        <button type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={onClose}>
          ปิด
        </button>
      }
    >
      <div className="ib-take">
      {ownerText && (
        <div className="mb-3.5 rounded-[11px] border border-border bg-muted px-3.5 py-3 text-[13px]">
          <p className="font-semibold">{ownerText}</p>
          {job.assignNote && (
            <p className="mt-1 whitespace-pre-line leading-relaxed text-muted-foreground">ข้อความจาก GM: {job.assignNote}</p>
          )}
        </div>
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
      ) : null}
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
