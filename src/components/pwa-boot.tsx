"use client";

import { useEffect } from "react";
import { startPwa } from "@/lib/pwa";

/** จดทะเบียน service worker และเริ่มดักสัญญาณติดตั้ง — ไม่แสดงอะไรบนหน้าจอ */
export function PwaBoot() {
  useEffect(startPwa, []);
  return null;
}
