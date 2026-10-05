"use client";

/*
 * บอกว่าคำขอที่ยื่นจากหน้านี้ไปถึงใคร
 *
 * สายอนุมัติกำหนดไว้ที่เดียวใน role.ts คอมโพเนนต์นี้แค่หยิบมาแสดง
 * ถ้าสายอนุมัติเปลี่ยน ข้อความตรงนี้เปลี่ยนตามเองโดยไม่ต้องแก้หน้า
 */

import { approverOf, hasNoApprover, useApprovalRoute, useRole, type RequestKind } from "@/lib/role";

export function ApproverNote({ kind }: { kind: RequestKind }) {
  const role = useRole();
  const route = useApprovalRoute();
  const boss = approverOf(role, kind, route);
  /* ผู้อนุมัติที่ตั้งไว้เป็นคนเดียวกับผู้ยื่น — ยื่นไม่ได้ ต้องบอกไปเลย
     ไม่ใช่ปล่อยให้ใบไปนอนอยู่ในคิวของตัวเอง (ผู้ใช้ตัดสิน 24 ก.ย. 2569) */
  if (hasNoApprover(role, kind, route)) {
    return (
      <p className="font-medium text-destructive">
        คำขอนี้ยังไม่มีผู้อนุมัติ — ผู้อนุมัติที่ตั้งไว้เป็นคนเดียวกับผู้ยื่น
        ให้ผู้ดูแลระบบแก้สายอนุมัติที่ตั้งค่าระบบ › ตำแหน่งและสายอนุมัติก่อน
      </p>
    );
  }
  return (
    <p>
      ยื่นถึง {boss.name} · {boss.title}
      {/* ผู้อนุมัติบางตำแหน่งยังไม่มีบทบาทให้ล็อกอิน ใบจะค้างรอไว้ก่อน
          บอกไว้ตรง ๆ ดีกว่าปล่อยให้ผู้ยื่นสงสัยว่าทำไมไม่มีใครกด */}
      {boss.role === null && (
        <span className="text-muted-foreground"> · ยังไม่เปิดใช้บทบาทนี้ในระบบ ใบจะค้างรอไว้ก่อน</span>
      )}
    </p>
  );
}
