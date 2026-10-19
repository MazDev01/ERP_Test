"use client";

/*
 * "ประวัติแผนติดตาม" ของลูกค้าที่ปิดการขายแล้ว (ผู้ใช้สั่ง 14 ต.ค. 2569)
 * ลำดับคอลัมน์ที่การ์ดผ่าน วันที่ ผู้ย้าย และจำนวนวันในแต่ละคอลัมน์
 * รวมจากกระดานของพนักงานทุกคนในเครื่องนี้ · ตำแหน่งการ์ดบนกระดานไม่ถูกล้าง
 */

import { useMemo } from "react";
import { useCrm } from "@/lib/crm-store";
import { entryStampOf, followupTrail, useAllBoards } from "@/lib/followup-board";
import { bkkStamp, thaiStamp } from "@/lib/format";
import { useNameOf } from "@/lib/emp-name";

export function FollowupTrail({
  customerCode,
  until,
  card = false,
  noTitle = false,
}: {
  customerCode: string;
  /** วันที่ปิดการขาย — ว่าง = นับถึงตอนนี้ */
  until?: string;
  /** แบบการ์ดมือถือ (หัวข้อเล็ก) */
  card?: boolean;
  /** หน้าที่มีหัวข้อการ์ดของตัวเอง */
  noTitle?: boolean;
}) {
  const crm = useCrm();
  const all = useAllBoards();
  const empName = useNameOf();
  const steps = useMemo(() => {
    const c = crm.customers.find((x) => x.code === customerCode);
    const codes = [customerCode, c?.leadCode ?? ""].filter(Boolean);
    let first = "";
    for (const a of crm.activities) {
      if (codes.includes(a.customerCode) && (!first || a.date < first)) first = a.date;
    }
    return followupTrail(all, codes, entryStampOf(c?.createdAt, first), until || bkkStamp());
  }, [all, crm.customers, crm.activities, customerCode, until]);

  return (
    <div>
      {!noTitle && <p className={card ? "text-[11.5px] font-semibold text-muted-foreground" : "subttl"}>ประวัติแผนติดตาม</p>}
      {steps.length === 0 ? (
        <p className="py-2 text-[12.5px] text-muted-foreground">ไม่มีประวัติแผนติดตาม</p>
      ) : (
        <ol className="mt-1.5 divide-y divide-border">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start justify-between gap-3 py-2 text-[12.5px]">
              <span className="min-w-0">
                <b className="font-semibold">{s.name}</b>
                <span className="num mt-0.5 block text-muted-foreground">
                  {s.start ? thaiStamp(s.start) : "—"} – {i === steps.length - 1 && !until ? "ปัจจุบัน" : thaiStamp(s.end)}
                  {s.by && ` · ย้ายโดย ${empName(s.by)}`}
                </span>
              </span>
              <span className="num shrink-0 whitespace-nowrap text-muted-foreground">{s.days} วัน</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
