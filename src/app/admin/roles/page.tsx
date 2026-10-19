"use client";

/*
 * บทบาทและสิทธิ์รวมเข้าหัวข้อ "ตำแหน่งและสายอนุมัติ" ของตั้งค่าระบบแล้ว (ผู้ใช้สั่ง 5 ต.ค. 2569)
 * ที่อยู่นี้เก็บไว้ให้ลิงก์เก่าใช้ได้ — พาไปแท็บที่ตรงกันทันที (หน้าเดิมเปิดที่แท็บเมนูที่ใช้ได้)
 * สิทธิ์เข้าเท่ากับ /admin/settings (nav.ts MOVED) ฝ่ายบุคคลจึงไม่ถูกกันก่อนถูกพาต่อ
 * อ่าน ?t= จาก window ไม่ใช้ useSearchParams จะได้ไม่ต้องมี Suspense
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();
  useEffect(() => {
    /* แท็บเดิมของบทบาทและสิทธิ์ไม่มีแล้ว — พาไปแท็บตำแหน่งและสายอนุมัติ (ผู้ใช้สั่ง 13 ต.ค. 2569) */
    router.replace("/admin/settings?s=staff&t=positions");
  }, [router]);
  return <p className="py-10 text-center text-[13px] text-muted-foreground">กำลังเปิดตำแหน่งและสายอนุมัติ…</p>;
}
