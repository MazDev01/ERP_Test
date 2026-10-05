"use client";

/*
 * ประวัติการตั้งค่า — ใครเปลี่ยนการตั้งค่าอะไรเมื่อไร (admin-log.ts) ล่าสุดขึ้นก่อน
 */

import { useState } from "react";
import { useAdminLog, type LogArea } from "@/lib/admin-log";
import { thaiDate } from "@/lib/format";
import { AdminHead } from "./admin-ui";
import { Pager, SearchBox, usePaged } from "./sales-ui";

const AREAS: LogArea[] = [
  "บัญชีผู้ใช้",
  "บทบาทและสิทธิ์",
  "เวลาทำงาน",
  "วันหยุดบริษัท",
  "การลา",
  "พื้นที่เข้างาน",
  "ข้อมูลบริษัท",
  "อัตราและภาษี",
  "เลขที่เอกสาร",
  "ข้อมูลตัวอย่าง",
  "การเชื่อมต่อ",
  "ตัวเลือกในรายการ",
];

export function AdminLogPage() {
  const log = useAdminLog();
  const [area, setArea] = useState<LogArea | "">("");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = log.filter(
    (e) => (!area || e.area === area) && (!q || `${e.area} ${e.detail} ${e.by}`.toLowerCase().includes(q)),
  );
  const paged = usePaged(shown, 15);

  return (
    <div className="space-y-4">
      <AdminHead title="ประวัติการตั้งค่า" desc="ทุกการเปลี่ยนแปลงการตั้งค่าที่มีผลกับบทบาทอื่น ล่าสุดขึ้นก่อน">
        <select
          value={area}
          onChange={(e) => setArea(e.target.value as LogArea | "")}
          aria-label="กรองตามหมวด"
          className="field-control h-10 w-full cursor-pointer text-[13.5px] sm:w-[190px]"
        >
          <option value="">ทุกหมวด</option>
          {AREAS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <SearchBox value={query} onChange={setQuery} placeholder="ค้นหาในรายละเอียด" />
      </AdminHead>

      <section className="panel glass flex flex-col">
        {/* มือถือ: เรียงเป็นฟีด หมวดกับเวลาอยู่บน รายละเอียดเต็มความกว้าง อ่านข้อความยาวได้สบาย */}
        <ul className="divide-y divide-border sm:hidden">
          {paged.list.length === 0 ? (
            <li className="py-10 text-center text-[13px] text-muted-foreground">
              {log.length === 0 ? "ยังไม่มีการเปลี่ยนการตั้งค่า" : "ไม่พบรายการที่ตรงกับตัวกรอง"}
            </li>
          ) : (
            paged.list.map((e) => {
              const [d, t] = e.at.split(" ");
              return (
                <li key={e.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="tag t-info">
                      <i />
                      {e.area}
                    </span>
                    <span className="num text-[12px] text-muted-foreground">
                      {thaiDate(d)} · {t} น.
                    </span>
                  </div>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed">{e.detail}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">โดย {e.by}</p>
                </li>
              );
            })
          )}
        </ul>
        <div className="scroll-stable hidden overflow-auto sm:block">
          <table className="data-table cards-sm min-w-[760px]">
            <thead>
              <tr>
                <th style={{ width: 170 }}>เวลา</th>
                <th style={{ width: 160 }}>หมวด</th>
                <th>รายละเอียด</th>
                <th style={{ width: 170 }}>ผู้เปลี่ยน</th>
              </tr>
            </thead>
            <tbody>
              {paged.list.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-muted-foreground">
                    {log.length === 0 ? "ยังไม่มีการเปลี่ยนการตั้งค่า" : "ไม่พบรายการที่ตรงกับตัวกรอง"}
                  </td>
                </tr>
              ) : (
                paged.list.map((e) => {
                  const [d, t] = e.at.split(" ");
                  return (
                    <tr key={e.id}>
                      <td data-label="เวลา" className="num">
                        {thaiDate(d)}
                        <span className="why">{t} น.</span>
                      </td>
                      <td data-label="หมวด">
                        <span className="tag t-info">
                          <i />
                          {e.area}
                        </span>
                      </td>
                      <td data-label="รายละเอียด" className="leading-relaxed">
                        {e.detail}
                      </td>
                      <td data-label="ผู้เปลี่ยน" className="muted">
                        {e.by}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {shown.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <span className="text-[12.5px] text-muted-foreground">{paged.range("รายการ")}</span>
            <Pager page={paged.page} maxPage={paged.maxPage} onChange={paged.setPage} />
          </div>
        )}
      </section>
    </div>
  );
}
