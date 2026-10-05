"use client";

/*
 * ป้ายสถานะผู้สนใจที่กดเปลี่ยนสถานะได้ (ดรอปดาวน์)
 *
 *   รอนัดหมาย → เปิดรับพิจารณาใหม่ (ถามยืนยัน)
 *   ปฏิเสธ    → ต้องเลือกเหตุผล (กล่องเดียวกับปุ่มปฏิเสธ)
 *   ปิดงาน    → ถามยืนยัน ปกติเกิดเองเมื่อลูกค้าตอบรับใบเสนอราคา
 *
 * ทุกการเปลี่ยนลงประวัติการเปลี่ยนแปลงผ่าน moveCustomer ใน crm-store
 */

import { useState } from "react";
import { CUSTOMER_STATUS, type CustomerStatus } from "@/lib/crm-data";
import { closeLead, markLeadWon, reopenLead } from "@/lib/crm-store";
import { ConfirmDialog } from "./confirm-dialog";
import { CloseLeadDialog } from "./lead-dialogs";
import { StatusMenu } from "./status-menu";

const ORDER: CustomerStatus[] = ["รอนัดหมาย", "ปฏิเสธ", "ปิดงาน"];

export function LeadStatusMenu({
  code,
  name,
  status,
}: {
  code: string;
  name: string;
  status: CustomerStatus;
}) {
  const [pick, setPick] = useState<CustomerStatus | null>(null);

  return (
    <>
      <StatusMenu
        current={status}
        options={ORDER.map((s) => ({ value: s, cls: CUSTOMER_STATUS[s] }))}
        onPick={setPick}
      />

      {pick === "ปฏิเสธ" && (
        <CloseLeadDialog
          customerName={name}
          code={code}
          onClose={() => setPick(null)}
          onSubmit={(reason) => {
            closeLead(code, reason);
            setPick(null);
          }}
        />
      )}
      <ConfirmDialog
        open={pick === "รอนัดหมาย" || pick === "ปิดงาน"}
        title={`เปลี่ยนสถานะเป็น ${pick ?? ""}`}
        description={`${name} (${code}) · ${status} → ${pick ?? ""}`}
        detail={
          pick === "ปิดงาน"
            ? "ปกติระบบเปลี่ยนให้เองเมื่อลูกค้าตอบรับใบเสนอราคา ใช้เมื่อปิดการขายนอกระบบ"
            : "กลับมาอยู่ในรายการที่ต้องติดตาม"
        }
        confirmLabel="เปลี่ยนสถานะ"
        onConfirm={() => {
          if (pick === "ปิดงาน") markLeadWon(code, "เปลี่ยนสถานะเป็นปิดงานเอง");
          if (pick === "รอนัดหมาย") reopenLead(code);
          setPick(null);
        }}
        onCancel={() => setPick(null)}
      />
    </>
  );
}
