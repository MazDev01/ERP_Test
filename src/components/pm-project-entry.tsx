"use client";

/*
 * ทางเข้าหน้าโปรเจคจากเมนูซ้าย
 *
 * ไม่ระบุ ?pj= = หน้ารายการโปรเจคแบบโฟลเดอร์ · ระบุ = รายละเอียดโปรเจคใบนั้น
 * โปรเจคมีเลขของตัวเอง (PJ-) ผูกกับวางบิลงวดแรก (ผู้ใช้สั่ง 5 ต.ค. 2569)
 * ลิงก์เก่า ?deal= ยังเปิดได้ — หน้ารายละเอียดหาโปรเจคได้ทั้งจากเลข PJ และเลขดีล (isRef)
 */

import { useSearchParams } from "next/navigation";
import { PmProjectPage } from "./pm-project-page";
import { PmProjectsPage } from "./pm-projects-page";

export function PmProjectEntry() {
  const params = useSearchParams();
  const ref = params.get("pj") ?? params.get("deal");
  return ref ? <PmProjectPage pj={ref} /> : <PmProjectsPage />;
}
