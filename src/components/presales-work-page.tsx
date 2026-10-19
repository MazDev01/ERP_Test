"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { stackNo } from "@/lib/stack-no";
import {
  PRESALES_STATUS,
  type PresalesRequest,
  type PresalesStatus,
  type ProposalPlanPhase,
} from "@/lib/crm-data";
import {
  acceptPresales,
  askPresalesInfo,
  savePresalesPlan,
  submitPresalesRound,
  useCrm,
} from "@/lib/crm-store";
import { roleLabel as teamRoleLabel, teamRoles } from "@/lib/pm-data";
import { useFindParam } from "@/lib/deep-link";
import { thaiDate, thaiStamp, todayIso } from "@/lib/format";
import { countTemplateUse, useTemplates } from "@/lib/presales-templates";
import {
  addPsAsk,
  psActorName,
  psBucket as bucket,
  psKindText,
  psMine as mine,
  psOwner,
  psThreadOf,
  usePsThreads,
  type PsNote,
  type PsTab as Tab,
} from "@/lib/presales-work";
import { FileDrop, type PickedFile } from "./file-drop";
import { PaperclipIcon } from "./icons";
import { Sheet } from "./lead-dialogs";
import { ReadOnlyNote, usePmReadOnly } from "./pm-readonly";
import { SearchBox } from "./sales-ui";
import { useNameOf } from "@/lib/emp-name";

/*
 * งานก่อนการขายของ SA และ BD — ตามต้นแบบ presales-work.html (บทบาท ps)
 * กล่องเดียวรวมคำขอทั้ง SA และ BD (ผู้ใช้กำหนด 23 ก.ย. 2569) เพราะคำขอต้องมีคนเห็นเสมอ
 * ทุกแถวติดป้ายประเภทและบอกผู้รับผิดชอบไว้ ไม่ต้องเดาว่าเป็นงานของใคร
 *   รอรับงาน → รับงาน → กำลังทำ → ส่งงาน → ส่งแล้ว (ฝ่ายขายออกใบเสนอราคาต่อ)
 *                          ↘ ขอข้อมูลเพิ่ม → รอข้อมูลเพิ่ม (แท็บของตัวเอง ส่งงานต่อได้เลย)
 * ทีมก่อนการขายเป็นผู้รับคำขอฝ่ายเดียว (เมนู PM ไม่มีคำขอก่อนการขายตามต้นแบบ pm-*.html)
 * ตัวตนกับการแบ่งแท็บอยู่ที่ lib/presales-work.ts ใช้ร่วมกับแดชบอร์ดและตารางงาน
 */

const TABS: { key: Tab; label: string }[] = [
  { key: "todo", label: "รอรับงาน" },
  { key: "doing", label: "กำลังทำ" },
  { key: "wait", label: "รอข้อมูลเพิ่ม" },
  { key: "done", label: "ส่งแล้ว" },
];

/** ป้ายสถานะแบบเดียวกับหน้าคำขอก่อนการขายของฝ่ายขาย */
function StatusTag({ status }: { status: PresalesStatus }) {
  return (
    <span className={`tag ${PRESALES_STATUS[status]}`}>
      <i />
      {status}
    </span>
  );
}

/**
 * ป้ายประเภทคำขอ — บอกว่างานนี้เป็นงานอะไร (SA = วิเคราะห์เทคนิค · BD = ข้อเสนอธุรกิจ)
 * ประเภทเป็นของตัวงาน ไม่ใช่ของคนที่รับไปทำ จึงอ่านจาก r.kind เท่านั้น ห้ามเดาจากผู้รับผิดชอบ
 * full = มีที่พอเขียนยาว · ช่องแคบเหลือแค่ตัวย่อ แต่ยังมี title ให้รู้ว่าย่อมาจากงานอะไร
 */
function KindTag({ kind, full }: { kind: PresalesRequest["kind"]; full?: boolean }) {
  return (
    <span className={`tag ${kind === "BD" ? "t-job" : "t-info"}`} title={psKindText(kind)}>
      {full ? psKindText(kind) : kind}
    </span>
  );
}

export function PresalesWorkPage() {
  const crm = useCrm();
  const today = todayIso();
  /* GM เปิดหน้านี้ได้แบบดูอย่างเดียว และเห็นคำขอทุกใบ ไม่ใช่เฉพาะของทีมก่อนการขาย */
  const ro = usePmReadOnly();
  const inScope = (r: PresalesRequest) => ro || mine(r);
  /* ลิงก์จากการแจ้งเตือนหรือแดชบอร์ดเจาะมาที่คำขอเดียวได้ด้วย ?find=<เลขที่>
     ตรงกับคำขอของเราพอดี → ไปแท็บของงานนั้นแล้วเปิดหน้าต่างงานเลย (ต้นแบบ ?no=) */
  const find = useFindParam();
  const linked = find ? crm.presales.find((r) => r.no === find && inScope(r)) : undefined;
  /* ไม่ใส่เลขที่ลงช่องค้นหา — เปิดหน้าต่างงานให้แทน (ผู้ใช้สั่ง 14 ต.ค. 2569) */
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>(() => (linked ? bucket(linked) : "todo"));
  const [open, setOpen] = useState<string | null>(() => linked?.no ?? null);
  /* ปุ่มขอข้อมูลเพิ่ม / ส่งงานอยู่ในตาราง (ผู้ใช้สั่ง 5 ต.ค. 2569) — กดแล้วเปิดตรงฟอร์มนั้นเลย
     กดแถวยังเปิดดูรายละเอียดได้เหมือนเดิม (null) */
  const [startForm, setStartForm] = useState<"send" | "ask" | null>(null);
  const openRow = (no: string, form: "send" | "ask" | null = null) => {
    setStartForm(form);
    setOpen(no);
  };
  /* ปุ่มของแถว — มีเฉพาะงานที่กำลังทำ/รอข้อมูลเพิ่ม และไม่ใช่ GM ที่ดูอย่างเดียว */
  const rowActs = (r: PresalesRequest, phone = false) =>
    !ro && (r.status === "กำลังทำ" || r.status === "รอข้อมูลเพิ่ม") ? (
      <span className={`flex items-center justify-end gap-1.5 whitespace-nowrap ${phone ? "mt-2.5" : ""}`}>
        <button
          type="button"
          className={phone ? "btn glass-thin h-10 flex-1 justify-center" : "lnk"}
          onClick={(e) => {
            e.stopPropagation();
            openRow(r.no, "ask");
          }}
        >
          ขอข้อมูลเพิ่ม
        </button>
        <button
          type="button"
          className={phone ? "btn solid btn-solid h-10 flex-1 justify-center" : "btn solid btn-solid btn-mini"}
          onClick={(e) => {
            e.stopPropagation();
            openRow(r.no, "send");
          }}
        >
          ส่งงาน
        </button>
      </span>
    ) : null;
  /* คำขอที่เพิ่งสร้างอยู่ใน localStorage ตอนเรนเดอร์ครั้งแรกจึงยังหาไม่เจอ
     ค่าตั้งต้นด้านบนเลยเปิดให้ไม่ได้ ต้องรอสโตร์ hydrate แล้วค่อยเปิดให้ครั้งเดียว */
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || !linked) return;
    jumped.current = true;
    setTab(bucket(linked));
    setOpen(linked.no);
  }, [linked]);

  const nameOf = useMemo(() => new Map(crm.customers.map((c) => [c.code, c.name])), [crm.customers]);

  /*
   * ลำดับแบบกองซ้อน — นับจากงานทั้งหมดของเราก่อนแยกแท็บ/ค้นหา ตามวันที่ส่งคำขอ (ผู้ใช้สั่ง 12 ต.ค. 2569)
   * ตารางยังเรียงตามวันส่งงานเหมือนเดิม เลขจึงไม่ได้เรียงจากมากไปน้อยเสมอ
   */
  const noOf = stackNo(crm.presales.filter(inScope), (r) => r.createdAt, (r) => r.id);

  const listOf = (t: Tab) => {
    const q = query.trim().toLowerCase();
    return crm.presales
      .filter((r) => {
        if (!inScope(r) || bucket(r) !== t) return false;
        if (q && !`${r.no} ${nameOf.get(r.customerCode) ?? ""} ${r.problem}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => a.due.localeCompare(b.due));
  };
  const rows = listOf(tab);
  const current = open ? crm.presales.find((r) => r.no === open) : undefined;

  return (
    <div className="space-y-4">
      <div className="bar">
        <div>
          <h1>งานก่อนการขาย</h1>
          <p>พบ {rows.length} รายการ</p>
        </div>
        <div className="tools w-full flex-wrap sm:w-auto">
          <SearchBox value={query} onChange={setQuery} placeholder="ค้นหาผู้สนใจ หรือโจทย์" />
        </div>
      </div>
      <ReadOnlyNote owner="ทีมก่อนการขาย" />

      <section className="panel glass flex flex-col">
        <div className="strip">
          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={tab === t.key ? "on" : ""}
                onClick={() => setTab(t.key)}
              >
                {t.label} <b>{listOf(t.key).length}</b>
              </button>
            ))}
          </div>
        </div>

        {/* มือถือ — แสดงเป็นการ์ดทีละใบ กดทั้งใบเพื่อเปิดงาน ไม่ต้องเลื่อนตารางไปด้านข้าง */}
        <ul className="divide-y divide-border sm:hidden">
          {rows.length === 0 ? (
            <li className="py-7 text-center text-[13.5px] text-muted-foreground">ไม่มีงานในแท็บนี้</li>
          ) : (
            rows.map((r) => {
              const late = r.due < today && bucket(r) !== "done";
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => openRow(r.no)}
                    className="block w-full px-4 py-3.5 text-left active:bg-black/[0.03]"
                  >
                    <span className="flex items-start justify-between gap-2.5">
                      <b className="min-w-0 text-[14.5px] font-semibold">
                        {nameOf.get(r.customerCode) ?? "—"}
                      </b>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <KindTag kind={r.kind} />
                        <StatusTag status={r.status} />
                      </span>
                    </span>
                    <span className="num mt-0.5 block text-[12px] text-muted-foreground">#{noOf.get(r.id)}</span>
                    <span className="mt-1.5 line-clamp-2 block text-[13px] text-muted-foreground">{r.problem}</span>
                    <span className="mt-2 flex items-center justify-between gap-2.5 text-[12.5px]">
                      <span className="font-semibold text-muted-foreground">{r.urgency}</span>
                      <span className={`num ${late ? "font-semibold text-destructive" : ""}`}>
                        ส่งงาน {thaiDate(r.due)}
                      </span>
                    </span>
                  </button>
                  {rowActs(r, true) && <div className="flex px-4 pb-3.5">{rowActs(r, true)}</div>}
                </li>
              );
            })
          )}
        </ul>

        <div className="scroll-stable hidden min-h-0 flex-1 overflow-auto sm:block">
          <table className="data-table">
            <thead>
              <tr>
                <th className="c" style={{ width: 60 }}>ลำดับ</th>
                <th className="max-[1000px]:hidden" style={{ width: 78 }}>
                  ประเภท
                </th>
                <th className="min-w-[220px]">ผู้สนใจและโจทย์</th>
                <th className="max-[1000px]:hidden" style={{ width: 110 }}>
                  ความเร่งด่วน
                </th>
                <th style={{ width: 130 }}>วันส่งงาน</th>
                <th className="max-[1000px]:hidden" style={{ width: 140 }}>
                  สถานะ
                </th>
                <th style={{ width: 190 }} aria-label="จัดการ" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-7 text-center text-muted-foreground">
                    ไม่มีงานในแท็บนี้
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const late = r.due < today && bucket(r) !== "done";
                  return (
                    <tr
                      key={r.id}
                      tabIndex={0}
                      style={{ cursor: "pointer" }}
                      onClick={() => openRow(r.no)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openRow(r.no);
                        }
                      }}
                    >
                      <td className="c num muted">{noOf.get(r.id)}</td>
                      <td className="max-[1000px]:hidden">
                        <KindTag kind={r.kind} />
                      </td>
                      <td className="min-w-[220px]">
                        <b className="font-semibold">{nameOf.get(r.customerCode) ?? "—"}</b>
                        <span className="why">{r.problem}</span>
                        {/* ผู้รับผิดชอบดูได้ในหน้าต่างรายละเอียด — ตารางมีแค่ผู้สนใจกับโจทย์ (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
                        {/* จอแคบซ่อนคอลัมน์ความเร่งด่วนและสถานะ แล้วแสดงเป็นบรรทัดเล็กใต้ชื่อแทน ชื่อจะได้ไม่ถูกบีบ */}
                        <span className="mt-1.5 hidden items-center gap-1.5 text-[12px] font-semibold text-muted-foreground max-[1000px]:flex">
                          {r.urgency} <KindTag kind={r.kind} /> <StatusTag status={r.status} />
                        </span>
                      </td>
                      <td className="max-[1000px]:hidden">{r.urgency}</td>
                      <td className={`num ${late ? "font-semibold text-destructive" : ""}`}>{thaiDate(r.due)}</td>
                      <td className="max-[1000px]:hidden">
                        <StatusTag status={r.status} />
                      </td>
                      <td>{rowActs(r)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {current && (
        <WorkDialog
          key={`${current.no}-${startForm ?? "view"}`}
          request={current}
          start={startForm}
          customerName={nameOf.get(current.customerCode) ?? "—"}
          onClose={() => setOpen(null)}
          onMoved={(t, keepOpen) => {
            /* งานสำเร็จแล้วต้องไม่หายไปเฉย ๆ — สลับไปแท็บของขั้นใหม่เสมอ
               และถ้ายังมีงานให้ทำต่อ (เพิ่งรับงาน) ก็คาหน้าต่างเดิมไว้ตรงหน้าเลย */
            if (!keepOpen) setOpen(null);
            if (t) setTab(t);
          }}
        />
      )}
    </div>
  );
}

/**
 * หน้าต่างงาน — รายละเอียดคำขอ ข้อเสนอที่ส่งแล้ว และปุ่มตามขั้นของงาน
 * กดส่งงานหรือขอข้อมูลเพิ่มแล้วรายละเอียดหลบไป เหลือแค่ฟอร์ม (ต้นแบบ detail(false))
 * แต่ต้องกลับไปอ่านรายละเอียดได้ในหน้าต่างเดิม (ผู้ใช้กำหนด 23 ก.ย. 2569)
 * สิ่งที่พิมพ์ค้างไว้อยู่ในสเตตของหน้าต่างนี้ สลับไปมาจึงไม่ล้างของที่กรอกไว้
 */
function WorkDialog({
  request: r,
  start = null,
  customerName,
  onClose,
  onMoved,
}: {
  request: PresalesRequest;
  /** เปิดจากปุ่มในตาราง — ขึ้นฟอร์มนั้นเลย · null = ดูรายละเอียด */
  start?: "send" | "ask" | null;
  customerName: string;
  onClose: () => void;
  /** งานย้ายขั้นแล้ว — ส่งแท็บที่ต้องสลับไปมาด้วย (ไม่ส่ง = อยู่แท็บเดิม) · keepOpen = ไม่ปิดหน้าต่าง */
  onMoved: (tab?: Tab, keepOpen?: boolean) => void;
}) {
  const crm = useCrm();
  const templates = useTemplates();
  const rounds = crm.presalesRounds.filter((x) => x.requestNo === r.no).sort((a, b) => b.round - a.round);
  const [form] = useState<"send" | "ask" | null>(start);
  const ro = usePmReadOnly();
  /* ถามตอบกับฝ่ายขายทั้งสายของคำขอใบนี้ */
  const thread = psThreadOf(usePsThreads(), r);
  /* ไฟล์และลิงก์ที่แนบในรอบนี้ — ต้องมีอย่างน้อยหนึ่งรายการ */
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [ask, setAsk] = useState("");
  const [sendErr, setSendErr] = useState(false);
  /* ไฟล์ยังอัปโหลดไม่เสร็จแล้วกดส่ง = รอบนั้นได้ไฟล์ไม่ครบ ปุ่มส่งจึงต้องรอ */
  const [uploading, setUploading] = useState(false);
  const [askErr, setAskErr] = useState(false);
  /* เพิ่งกดรับงานในหน้าต่างนี้ — ต้องบอกว่าเกิดอะไรขึ้นและทำอะไรต่อ ไม่ใช่ให้แถวหายไปเฉย ๆ */
  const [took, setTook] = useState(false);
  const working = r.status === "กำลังทำ" || r.status === "รอข้อมูลเพิ่ม";

  function send() {
    if (!files.length) return setSendErr(true);
    if (uploading) return;
    const first = files[0];
    /* ชั่วโมงที่ใช้ไม่บังคับ (ต้นแบบไม่มีช่องนี้) แต่ยังเก็บไว้บวกเข้าชั่วโมงรวมของคำขอ */
    const h = parseFloat(hours);
    /* รายการที่มาจากคลังเทมเพลตมี id ขึ้นต้น tpl: — นับการใช้ให้เทมเพลตนั้น */
    countTemplateUse(files.filter((f) => f.id.startsWith("tpl:")).map((f) => f.id.split(":")[1]));
    submitPresalesRound(r.no, {
      by: psActorName(),
      hours: h > 0 ? h : 0,
      note: note.trim() || "—",
      /* รายการแรกเป็นตัวแทนของรอบ — ลิงก์ใช้ชนิด canva เพราะหน้าอื่นเปิดเป็นลิงก์ได้ */
      kind: first.url ? "canva" : "pdf",
      file: first.name,
      url: first.url ?? "",
      files: files.map((f) => (f.url ? { name: f.name, url: f.url } : { name: f.name })),
    });
    onMoved("done");
  }

  function askMore() {
    const t = ask.trim();
    if (!t) return setAskErr(true);
    askPresalesInfo(r.no, t);
    /* เก็บคำถามต่อท้ายสายสนทนาด้วย — ฝ่ายขายต้องเห็นคำถามตอนกดตอบ ไม่ใช่เห็นแค่ข้อความล่าสุด */
    addPsAsk(r.no, t);
    onMoved("wait");
  }

  const lb = "mb-1.5 block text-[12.5px] font-semibold text-muted-foreground";
  const dt = "text-[12.5px] font-semibold text-muted-foreground";

  return (
    <Sheet
      title={form === "send" ? `ส่งงาน · ${customerName}` : form === "ask" ? `ขอข้อมูลเพิ่ม · ${customerName}` : customerName}
      onClose={onClose}
      footer={
        /* GM เปิดดูได้อย่างเดียว ปุ่มรับงาน/ขอข้อมูลเพิ่ม/ส่งงาน จึงไม่มี */
        ro ? (
          <button type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={onClose}>
            ปิด
          </button>
        ) : r.status === "รอรับงาน" ? (
          <button
            type="button"
            className="btn solid btn-solid flex-1 justify-center sm:flex-none"
            onClick={() => {
              acceptPresales(r.no, psActorName());
              setTook(true);
              /* รับแล้วงานหายจากแท็บที่ยืนอยู่ — พาไปแท็บ "กำลังทำ" พร้อมคาใบเดิมไว้ตรงหน้า
                 หน้าต่างนี้จะกลายเป็นชุดปุ่มของขั้นถัดไป (ขอข้อมูลเพิ่ม / ส่งงาน) ทันที */
              onMoved("doing", true);
            }}
          >
            รับงาน
          </button>
        ) : working ? (
          <>
            {/* ปุ่มขอข้อมูลเพิ่ม / ส่งงานย้ายไปอยู่ในตาราง (ผู้ใช้สั่ง 5 ต.ค. 2569) — หน้าต่างรายละเอียดมีแค่ปุ่มปิด */}
            {form ? (
              <>
                <button type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={onClose}>
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="btn solid btn-solid flex-1 justify-center sm:flex-none"
                  disabled={form === "send" && uploading}
                  onClick={form === "send" ? send : askMore}
                >
                  {form === "send" ? (uploading ? "กำลังอัปโหลดไฟล์…" : "ยืนยันส่งงาน") : "ยืนยันขอข้อมูล"}
                </button>
              </>
            ) : (
              <button type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={onClose}>
                ปิด
              </button>
            )}
          </>
        ) : null
      }
    >
      {took && (
        <p
          role="status"
          className="mb-3.5 rounded-[11px] bg-[var(--success-soft)] px-3.5 py-3 text-[12.5px] leading-relaxed font-semibold text-[var(--success)]"
        >
          รับงานนี้แล้ว
        </p>
      )}

      {form === null && (
        <>
          <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-3.5 gap-y-2 text-[13.5px] max-sm:grid-cols-1">
            {/* ประเภทงานกับผู้รับผิดชอบเป็นคนละเรื่อง แยกบรรทัดกันไม่ให้อ่านปนกัน */}
            <dt className={dt}>ประเภทงาน</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <KindTag kind={r.kind} full />
            </dd>
            <dt className={dt}>ผู้รับผิดชอบ</dt>
            <dd className="break-words">{psOwner(r)}</dd>
            <dt className={dt}>โจทย์จากลูกค้า</dt>
            <dd className="break-words">{r.problem}</dd>
            <dt className={dt}>ความเร่งด่วน</dt>
            <dd>
              {r.urgency}
              {r.urgentReason ? ` · ${r.urgentReason}` : ""}
            </dd>
            <dt className={dt}>วันส่งงาน</dt>
            <dd className="num">{thaiDate(r.due)}</dd>
            <dt className={dt}>งบประมาณโดยประมาณ</dt>
            <dd className="num">{(r.budget || 0).toLocaleString("en-US")} บาท</dd>
            {r.attachments.length > 0 && (
              <>
                <dt className={dt}>ไฟล์แนบจากฝ่ายขาย</dt>
                <dd className="flex flex-col gap-0.5">
                  {r.attachments.map((a) =>
                    /^https?:\/\//.test(a) ? (
                      <a key={a} href={a} target="_blank" rel="noreferrer" className="break-all underline">
                        {a}
                      </a>
                    ) : (
                      <span key={a} className="break-all">
                        {a}
                      </span>
                    ),
                  )}
                </dd>
              </>
            )}
            <dt className={dt}>สถานะ</dt>
            <dd>
              <StatusTag status={r.status} />
            </dd>
          </dl>

          {/* แผนงานของข้อเสนอ (Full Proposal · M2) — วางเป็นช่วงสัปดาห์ PM แปลงเป็นวันจริงตอนรับงาน */}
          <ProposalPlan request={r} readOnly={ro} />

          {/* ถามตอบกับฝ่ายขายทั้งสาย — ทั้งสองฝั่งอ่านชุดเดียวกัน จะได้ไม่ต้องไปตามกันในไลน์ */}
          <PsThread notes={thread} />

          {rounds.length > 0 && (
            <>
              <p className="mt-[18px] mb-2 text-[13px] font-bold">ข้อเสนอที่ส่งแล้ว</p>
              <ul>
                {rounds.map((x) => {
                  const meta = [thaiDate(x.at)];
                  if (x.files && x.files.length > 1) meta.push(`แนบ ${x.files.length} รายการ`);
                  if (x.hours > 0) meta.push(`${x.hours} ชม.`);
                  if (x.note && x.note !== "—") meta.push(x.note);
                  return (
                    <li key={x.id} className="flex flex-col gap-0.5 border-t border-border py-[9px]">
                      <b className="text-[13px] font-semibold break-all">
                        รอบที่ {x.round} · {x.file}
                      </b>
                      <span className="text-[12px] text-muted-foreground">{meta.join(" · ")}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}

      {form === "send" && (
        <div>
          <p className="mb-2 text-[13px] font-bold">ส่งข้อเสนอรอบที่ {rounds.length + 1}</p>
          <FileDrop
            files={files}
            onChange={(next) => {
              setFiles(next);
              setSendErr(false);
            }}
            title="ลากไฟล์มาวาง หรือกดเพื่อเลือกไฟล์"
            hint="PDF, รูปภาพ หรือไฟล์เอกสาร เลือกได้หลายไฟล์"
            label="เลือกไฟล์ข้อเสนอ"
            links
            linkPlaceholder="หรือวางลิงก์ เช่น Canva, Google Drive"
            onBusy={setUploading}
          />
          {/* เลือกเทมเพลตจากคลัง (/presales-templates) มาแนบได้เลย ไม่ต้องหาไฟล์ใหม่ */}
          {templates.length > 0 && (
            <select
              value=""
              aria-label="เลือกจากคลังเทมเพลต"
              onChange={(e) => {
                const t = templates.find((x) => x.id === e.target.value);
                if (!t) return;
                setFiles([
                  ...files,
                  { id: `tpl:${t.id}:${Date.now()}`, name: t.url ?? t.file, size: t.url ? 0 : (t.size ?? 0), url: t.url },
                ]);
                setSendErr(false);
              }}
              className="field-control mt-3 cursor-pointer"
            >
              <option value="">เลือกจากคลังเทมเพลต</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <textarea
            rows={2}
            aria-label="ข้อความถึงฝ่ายขาย"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ข้อความถึงฝ่ายขาย (ไม่บังคับ)"
            className="field-control mt-3 resize-y py-2.5 leading-relaxed"
          />
          {/* ของเดิมที่เกินต้นแบบ — ชั่วโมงรวมของคำขอไปโผล่ในหน้าคำขอก่อนการขายของฝ่ายขาย */}
          <label htmlFor="w-hours" className={`${lb} mt-3`}>
            ชั่วโมงที่ใช้รอบนี้ (ไม่บังคับ)
          </label>
          <input
            id="w-hours"
            type="number"
            min={0.5}
            step={0.5}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="เช่น 4"
            className="field-control num max-w-[200px]"
          />
          {sendErr && <p className="mt-2 text-[12.5px] text-destructive">แนบไฟล์หรือลิงก์อย่างน้อย 1 รายการ</p>}
        </div>
      )}

      {form === "ask" && (
        <div>
          <p className="mb-3 text-[12.5px] text-muted-foreground">โจทย์: {r.problem}</p>
          <label htmlFor="w-ask" className={lb}>
            รายละเอียดที่ต้องการเพิ่มจากฝ่ายขาย
          </label>
          <textarea
            id="w-ask"
            autoFocus
            rows={3}
            value={ask}
            onChange={(e) => {
              setAsk(e.target.value);
              setAskErr(false);
            }}
            placeholder="เช่น จำนวนรถที่ใช้จริง และระบบบัญชีที่ใช้อยู่"
            className="field-control resize-y py-2.5 leading-relaxed"
          />
          {askErr && <p className="mt-2 text-[12.5px] text-destructive">บอกฝ่ายขายว่าต้องการข้อมูลอะไร</p>}
        </div>
      )}
    </Sheet>
  );
}

/**
 * สายถามตอบข้อมูลเพิ่ม — ใช้ทั้งฝั่งทีมก่อนการขาย (หน้านี้) และฝั่งฝ่ายขาย (presales-page)
 * คำถามของทีมอยู่ซ้าย คำตอบของฝ่ายขายอยู่ขวา พร้อมชื่อคนพิมพ์และเวลา
 * ไม่มีชื่อกับเวลาแล้วอ่านไม่ออกว่าใครถามและถามไว้นานแค่ไหน
 */
export function PsThread({ notes }: { notes: PsNote[] }) {
  const empName = useNameOf();
  if (notes.length === 0) return null;
  return (
    <section className="mt-[18px]">
      <p className="mb-2 text-[13px] font-bold">ถามตอบข้อมูลเพิ่ม</p>
      <ul className="flex flex-col gap-2">
        {notes.map((n, i) => (
          <li
            key={`${n.at}-${i}`}
            className={`rounded-[12px] px-3.5 py-2.5 ${
              n.side === "ps"
                ? "bg-[var(--warning-soft)]"
                : "bg-muted sm:ml-6"
            }`}
          >
            <p className="flex flex-wrap items-baseline gap-x-2 text-[11.5px] text-muted-foreground">
              <b className="font-semibold text-foreground">{empName(n.by)}</b>
              <span>{n.side === "ps" ? "ขอข้อมูลเพิ่ม" : "ตอบข้อมูล"}</span>
              {n.at && <span className="num">{thaiStamp(n.at)} น.</span>}
            </p>
            {n.tx && <p className="mt-1 text-[13px] leading-relaxed break-words">{n.tx}</p>}
            {n.files && n.files.length > 0 && (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {n.files.map((f) => (
                  <li
                    key={f.name}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-white px-2.5 py-0.5 text-[12px]"
                  >
                    <PaperclipIcon className="size-3 shrink-0" strokeWidth={2} />
                    {f.url ? (
                      <a href={f.url} target="_blank" rel="noopener" className="truncate hover:underline">
                        {f.name}
                      </a>
                    ) : (
                      <span className="truncate">{f.name}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/*
 * แผนงานของข้อเสนอ — BD/SA วางเป็นช่วงสัปดาห์ เพราะตอนทำข้อเสนอยังไม่รู้ว่าลูกค้าจะเริ่มวันไหน
 * PM เลือกวันเริ่มตอนรับงาน ระบบแปลงสัปดาห์เป็นวันที่จริงให้ (flow.ts buildInboxJob)
 * ไม่วางแผนไว้ก็ได้ — PM จะได้แม่แบบเฟสมาตรฐานไปจัดเอง
 */
function ProposalPlan({ request, readOnly }: { request: PresalesRequest; readOnly: boolean }) {
  const saved = request.plan ?? [];
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<ProposalPlanPhase[]>(saved);
  const roles = teamRoles();

  function start() {
    setRows(saved.length ? saved : [{ name: "", role: roles[0]?.key ?? "", fromWeek: 1, toWeek: 1, tasks: [] }]);
    setEditing(true);
  }
  function set(i: number, patch: Partial<ProposalPlanPhase>) {
    setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  }

  return (
    <section className="mt-[18px]">
      <div className="mb-2 flex items-center gap-2">
        <p className="text-[13px] font-bold">แผนงานของข้อเสนอ</p>
        {!readOnly && !editing && (
          <button type="button" className="btn glass-thin btn-mini ml-auto" onClick={start}>
            {saved.length ? "แก้แผนงาน" : "วางแผนงาน"}
          </button>
        )}
      </div>

      {!editing && saved.length === 0 && (
        <p className="text-[12.5px] text-muted-foreground">
          ยังไม่ได้วางแผนงาน
        </p>
      )}

      {!editing && saved.length > 0 && (
        <ul className="grid gap-1.5">
          {saved.map((x, i) => (
            <li key={i} className="rounded-[11px] border border-border bg-card px-3 py-2 text-[12.5px]">
              <b className="font-semibold">{x.name}</b>
              <span className="text-muted-foreground">
                {" · "}สัปดาห์ที่ {x.fromWeek}
                {x.toWeek > x.fromWeek ? `–${x.toWeek}` : ""} · {teamRoleLabel(x.role)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="grid gap-2">
          {rows.map((x, i) => (
            <div key={i} className="grid gap-2 rounded-[11px] border border-border bg-card p-2.5 sm:grid-cols-[minmax(0,1fr)_120px_86px_86px_36px]">
              <input
                value={x.name}
                onChange={(e) => set(i, { name: e.target.value })}
                placeholder="ชื่อเฟส เช่น ออกแบบหน้าจอ"
                aria-label={`ชื่อเฟสที่ ${i + 1}`}
                className="field-control"
              />
              <select
                value={x.role}
                aria-label={`ตำแหน่งที่ทำเฟสที่ ${i + 1}`}
                onChange={(e) => set(i, { role: e.target.value })}
                className="field-control cursor-pointer"
              >
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={x.fromWeek}
                aria-label={`สัปดาห์เริ่มของเฟสที่ ${i + 1}`}
                onChange={(e) => set(i, { fromWeek: Number(e.target.value) || 1 })}
                className="field-control num"
              />
              <input
                type="number"
                min={1}
                value={x.toWeek}
                aria-label={`สัปดาห์จบของเฟสที่ ${i + 1}`}
                onChange={(e) => set(i, { toWeek: Number(e.target.value) || 1 })}
                className="field-control num"
              />
              <button
                type="button"
                aria-label={`ลบเฟสที่ ${i + 1}`}
                onClick={() => setRows((r) => r.filter((_, k) => k !== i))}
                className="btn glass-thin justify-center text-destructive"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn glass-thin"
              onClick={() =>
                setRows((r) => [
                  ...r,
                  {
                    name: "",
                    role: roles[0]?.key ?? "",
                    fromWeek: (r[r.length - 1]?.toWeek ?? 0) + 1,
                    toWeek: (r[r.length - 1]?.toWeek ?? 0) + 1,
                    tasks: [],
                  },
                ])
              }
            >
              + เพิ่มเฟส
            </button>
            <button type="button" className="btn glass-thin ml-auto" onClick={() => setEditing(false)}>
              ยกเลิก
            </button>
            <button
              type="button"
              className="btn solid btn-solid"
              onClick={() => {
                savePresalesPlan(request.no, rows);
                setEditing(false);
              }}
            >
              บันทึกแผนงาน
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
