"use client";

/*
 * โหมดดูอย่างเดียวของ GM ในหน้าของ PM — ตามต้นแบบ pm-*.html?as=gm (ชุด 22 ก.ย. 2569)
 * GM เห็นงานเข้าใหม่ โปรเจค งานรอตรวจ และแผนงาน แต่ PM เป็นคนจัดการ
 * ปุ่มที่เปลี่ยนข้อมูล (รับงาน ตรวจงาน แก้ชื่อ แชท วางแผน) จึงไม่แสดงให้ GM
 *
 * TODO: ของจริงต้องกันสิทธิ์ที่หลังบ้านด้วย (ตรวจบทบาทและ RLS) ไม่พึ่งการซ่อนปุ่มอย่างเดียว
 */

import { useRole } from "@/lib/role";

/*
 * GM สืบทอดงานทั้งหมดของ PM — รับงาน จัดคิว มอบหมาย ตรวจงานได้เหมือน PM ต่างแค่มีงานอนุมัติเพิ่ม
 * (ผู้ใช้สั่ง 5 ต.ค. 2569) จึงไม่มีบทบาทไหนเป็นโหมดดูอย่างเดียวในหน้าของ PM แล้ว
 */
export function usePmReadOnly() {
  return false;
}

export function ReadOnlyNote({ owner = "PM" }: { owner?: string }) {
  if (!usePmReadOnly()) return null;
  return (
    <p className="rounded-[10px] bg-muted px-3.5 py-[9px] text-[12.5px] font-semibold text-muted-foreground">
      ดูในฐานะ GM · ดูอย่างเดียว {owner}เป็นผู้จัดการงานในหน้านี้
    </p>
  );
}
