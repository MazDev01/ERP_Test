"use client";

/*
 * CEO อนุมัติยอดเงินเดือน — กลับมาใช้ (ผู้ใช้สั่ง 19 ต.ค. 2569 · ยกเลิกคำสั่ง 13–14 ต.ค.)
 *
 * HR คำนวณ → ส่ง CEO → CEO อนุมัติ หรือไม่อนุมัติพร้อมเหตุผล → HR แก้แล้วส่งใหม่ → อนุมัติแล้ว HR ปิดรอบและออกสลิป
 * ใช้สองที่: หน้ายอดเงินเดือนของ CEO (/ceo/hr/payroll) ต่อรอบ และหน้าคำขออนุมัติ (/ceo/approvals) "ยอดเงินเดือนรออนุมัติ"
 *
 * ⚠️ ยอดที่แสดงและกดอนุมัติคือผลคำนวณของรอบตัวเดียวกับ /hr/payroll (usePayrollSumFn) ห้ามคิดเอง (ผู้ใช้กำหนด 23 ก.ย. 2569)
 * HR แก้ยอดหลังส่ง usePayrollAutoResubmit ส่งใหม่ให้เอง "แก้ไขแล้ว รออนุมัติใหม่" (ผู้ใช้สั่ง 19 ต.ค. 2569)
 * CEO เห็นป้าย "แก้ไขแล้วส่งใหม่ ครั้งที่ n" และรายการ "สิ่งที่เปลี่ยน" (ชื่อเล่น · ช่อง · ก่อน → หลัง)
 */

import Link from "next/link";
import { useState } from "react";
import { baht, bkkStamp, thaiMonth, thaiStamp } from "@/lib/format";
import { GROUP_LABEL, payApproval, payFieldLabel, payKeyLabel, payNamesOf, paySnapOf, probRoundLabel, dailyRoundRange, isDailyRoundKey, type CycleSum, type PayApproval, type PayGroup } from "@/lib/hr-data";
import { decidePayroll, useHr } from "@/lib/hr-store";
import { usePayrollAutoResubmit, usePayrollSumFn } from "@/lib/hr-link";
import { nameOf } from "@/lib/emp-name";
import { ConfirmDialog } from "./confirm-dialog";

/** ชื่อรอบ — รอบเดือน "กันยายน 2569" · ทดลองงาน "สัปดาห์ 13 – 19 ต.ค. 2569" */
export function payRunLabel(key: string) {
  return isDailyRoundKey(key) ? probRoundLabel(dailyRoundRange(key)) : payKeyLabel(key, thaiMonth);
}

/**
 * ป้ายสถานะ + ปุ่มอนุมัติ/ไม่อนุมัติของรอบหนึ่ง
 * ไม่อนุมัติต้องมีเหตุผล และอยู่คนละแถวห่างจากปุ่มอนุมัติ (นิ้วพลาดบนมือถือไปไม่ถึง)
 */
export function PayApproveBar({ runKey, group, sum }: { runKey: string; group: PayGroup; sum: CycleSum }) {
  const hr = useHr();
  const ap = payApproval(hr.payApprove, runKey, group);
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [why, setWhy] = useState("");
  const [warn, setWarn] = useState(false);

  if (ap.status !== "waiting") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        {ap.status === "approved" ? (
          <span className="tag t-ok">
            <i />
            อนุมัติแล้ว {ap.at ? thaiStamp(ap.at) : ""}
          </span>
        ) : ap.status === "rejected" ? (
          <span className="tag t-late">
            <i />
            ไม่อนุมัติ: {ap.reason}
          </span>
        ) : (
          <span className="text-muted-foreground">ฝ่ายบุคคลยังไม่ได้ส่งยอดให้อนุมัติ</span>
        )}
      </div>
    );
  }

  return (
    <div>
      {(ap.ver ?? 0) > 0 && (
        <div className="mb-1.5">
          <span className="tag t-early">
            <i />
            แก้ไขแล้วส่งใหม่ ครั้งที่ {ap.ver}
          </span>
        </div>
      )}
      <p className="text-[12px] text-muted-foreground">
        {(ap.ver ?? 0) > 0 ? (ap.auto ? "ฝ่ายบุคคลแก้ยอดแล้ว ระบบส่งใหม่ให้" : "ฝ่ายบุคคลส่งใหม่") : "ฝ่ายบุคคลส่งมา"}{" "}
        {ap.sentAt ? thaiStamp(ap.sentAt) : ""}
        {ap.sentBy && ` โดย ${nameOf(ap.sentBy)}`}
        {ap.prev === "approved" && " · แก้หลังอนุมัติไปแล้ว ต้องอนุมัติยอดใหม่"}
      </p>
      {(ap.ver ?? 0) > 0 && <PayChangeList ap={ap} />}
      {!rejecting && (
        <>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn solid btn-solid max-sm:!h-12 max-sm:flex-1 max-sm:justify-center"
              onClick={() => setConfirming(true)}
            >
              อนุมัติยอดนี้
            </button>
          </div>
          <div className="mt-6 border-t border-border pt-3">
            <button
              type="button"
              className="btn glass-thin max-sm:!h-12 max-sm:w-full max-sm:justify-center"
              onClick={() => {
                setRejecting(true);
                setWhy("");
                setWarn(false);
              }}
            >
              ไม่อนุมัติ
            </button>
          </div>
        </>
      )}
      {rejecting && (
        <div className="mt-3 flex flex-wrap items-center gap-2 max-sm:grid max-sm:grid-cols-2">
          <input
            autoFocus
            value={why}
            onChange={(e) => {
              setWhy(e.target.value);
              if (e.target.value.trim()) setWarn(false);
            }}
            placeholder="เหตุผลที่ไม่อนุมัติ"
            aria-label="เหตุผลที่ไม่อนุมัติ"
            className="field-control h-9 min-w-[220px] flex-1 rounded-[10px] px-3 text-[13px] max-sm:col-span-2 max-sm:!h-11 max-sm:min-w-0 max-sm:!text-[16px]"
          />
          <button type="button" className="btn glass-thin max-sm:!h-12 max-sm:justify-center" onClick={() => setRejecting(false)}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid max-sm:!h-12 max-sm:justify-center"
            onClick={() => {
              if (!why.trim()) return setWarn(true);
              decidePayroll(runKey, group, false, why.trim(), bkkStamp());
              setRejecting(false);
            }}
          >
            ส่งไม่อนุมัติ
          </button>
          {warn && <p className="w-full text-[12.5px] text-destructive max-sm:col-span-2">ใส่เหตุผลก่อนส่ง</p>}
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          open
          title="อนุมัติยอดเงินเดือน"
          description={`รอบ ${payRunLabel(runKey)} · ${GROUP_LABEL[group]} · ${sum.n} คน`}
          detail={
            <>
              <b className="num block text-[17px] font-bold">{baht(sum.net)} บาท</b>
              <span className="block text-[12.5px] text-muted-foreground">
                ยอดจ่ายสุทธิ{sum.ss > 0 && ` · นำส่งประกันสังคม ${baht(sum.ss * 2)} บาท`}
              </span>
              <span className="mt-1 block text-[12.5px] text-muted-foreground">
                อนุมัติแล้วฝ่ายบุคคลปิดรอบ สร้างและเผยแพร่สลิปตามยอดนี้
              </span>
            </>
          }
          confirmLabel="อนุมัติยอดนี้"
          onCancel={() => setConfirming(false)}
          /* บันทึกเลขที่เห็นบนจอไปกับการอนุมัติ ขยับเมื่อไรจะรู้ว่าขยับจากอะไร */
          onConfirm={() => {
            decidePayroll(runKey, group, true, "", bkkStamp(), "CEO", {
              people: sum.n,
              net: sum.net,
              ss: sum.ss,
              lines: paySnapOf(sum),
              names: payNamesOf(sum),
            });
            setConfirming(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * "สิ่งที่เปลี่ยน" จากการส่งครั้งก่อน — รายคน: ชื่อเล่น · ช่อง · ก่อน → หลัง (ผู้ใช้สั่ง 19 ต.ค. 2569)
 * รอบที่ส่งไว้ก่อนมีการเก็บยอดรายคน บอกยอดสุทธิรวมก่อน → หลังแทน
 */
function PayChangeList({ ap }: { ap: PayApproval }) {
  const list = ap.changes ?? [];
  const who = (emp: string, name: string) => {
    const n = nameOf(emp);
    return n === emp ? nameOf(name) : n;
  };
  return (
    <div className="mt-2 rounded-[10px] border border-border px-3 py-2 text-[12.5px]">
      <p className="font-semibold">สิ่งที่เปลี่ยน</p>
      {list.length === 0 ? (
        <p className="mt-0.5 text-muted-foreground">
          {ap.prevNet !== undefined && ap.net !== undefined && Math.abs(ap.prevNet - ap.net) > 0.005
            ? `ยอดจ่ายสุทธิรวม ${baht(ap.prevNet)} → ${baht(ap.net)} บาท`
            : ap.prev === "draft" && ap.reason
              ? ap.reason
              : "ไม่มีตัวเลขเปลี่ยนจากครั้งก่อน"}
        </p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {list.map((c, i) => (
            <li key={`${c.emp}-${c.field}-${i}`} className={`flex flex-wrap gap-x-2 ${c.field === "net" ? "" : "pl-4 text-muted-foreground"}`}>
              {c.field === "net" && <b className="font-semibold">{who(c.emp, c.name)}</b>}
              <span>
                {c.kind === "add" ? "เพิ่มเข้ารอบ · " : c.kind === "drop" ? "ออกจากรอบ · " : ""}
                {payFieldLabel(c.field)}
              </span>
              <span className="num">
                {c.field === "days" ? c.was : baht(c.was)} → {c.field === "days" ? c.now : baht(c.now)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "ยอดเงินเดือนรออนุมัติ" ในหน้าคำขออนุมัติของ CEO — ขึ้นเฉพาะตอนมีรอบรออยู่ */
export function PayrollWaitingList() {
  const hr = useHr();
  const sumOf = usePayrollSumFn();
  usePayrollAutoResubmit();
  const waiting = Object.entries(hr.payApprove)
    .filter(([, a]) => a.status === "waiting")
    .map(([key]) => {
      const [runKey, group] = key.split("|") as [string, PayGroup];
      return { key, runKey, group, sum: sumOf(runKey, group), ver: hr.payApprove[key]?.ver ?? 0 };
    })
    .sort((x, y) => x.runKey.localeCompare(y.runKey) || (x.group === "month" ? -1 : 1));
  if (waiting.length === 0) return null;
  return (
    <section className="glass rounded-[14px]">
      <h2 className="px-5 pt-[15px] pb-2 text-[15px] font-bold">
        ยอดเงินเดือนรออนุมัติ <b className="ml-1 text-primary">{waiting.length}</b>
      </h2>
      {waiting.map(({ key, runKey, group, sum, ver }) => {
        const m = isDailyRoundKey(runKey) ? undefined : runKey;
        return (
          <div key={key} className="border-t border-border px-5 py-3.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <b className="text-[14px] font-semibold">
                รอบ {payRunLabel(runKey)} · {GROUP_LABEL[group]}
              </b>
              {ver > 0 && <span className="text-[12.5px] font-semibold text-primary">แก้ไขแล้ว รออนุมัติใหม่</span>}
              <Link
                href={m ? `/ceo/hr/payroll?m=${m}` : "/ceo/hr/payroll"}
                className="ml-auto text-[12.5px] font-semibold text-primary"
              >
                ดูรายละเอียด
              </Link>
            </div>
            <p className="mt-0.5 text-[13px]">
              {sum.n} คน · ยอดจ่ายสุทธิ {baht(sum.net)} บาท
              {sum.ss > 0 && ` · นำส่งประกันสังคม ${baht(sum.ss * 2)} บาท`}
            </p>
            <div className="mt-2">
              <PayApproveBar runKey={runKey} group={group} sum={sum} />
            </div>
          </div>
        );
      })}
    </section>
  );
}
