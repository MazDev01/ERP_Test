"use client";

/*
 * เลขที่เอกสารย้ายเข้าแท็บของตั้งค่าระบบแล้ว (ผู้ใช้สั่ง 13 ต.ค. 2569)
 * ที่อยู่นี้เก็บไว้ให้ลิงก์เก่าใช้ได้ — สิทธิ์เข้าเท่ากับ /admin/settings (nav.ts MOVED)
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/settings?s=acc&t=docnum");
  }, [router]);
  return null;
}
