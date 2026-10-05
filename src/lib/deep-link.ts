"use client";

/*
 * ลิงก์ข้ามหน้าแบบเจาะถึงรายการเดียว — ?find=<เลขที่เอกสาร>
 *
 * ใช้ช่องค้นหาที่แต่ละหน้ามีอยู่แล้วเป็นตัวกรอง ไม่ได้เพิ่มกลไกใหม่
 * ข้อดีคือรายการที่ลิงก์มาถึงจะโผล่แน่นอน ไม่ว่าจะอยู่แท็บไหนหรือหน้าที่เท่าไร
 */

import { useSearchParams } from "next/navigation";

/** ประกอบลิงก์ไปหารายการเดียวในหน้ารายการ */
export function findLink(path: string, no: string) {
  return `${path}?find=${encodeURIComponent(no)}`;
}

/**
 * เลขที่เอกสารที่ถูกลิงก์มา — อ่านครั้งเดียวตอนหน้าเปิด
 * หลังจากนั้นผู้ใช้พิมพ์ค้นหาเองได้ตามปกติ ค่านี้ไม่ไปยุ่งอีก
 */
export function useFindParam() {
  return useSearchParams().get("find") ?? "";
}
