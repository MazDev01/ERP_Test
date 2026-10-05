/*
 * ส่งออกรายงานการขายเป็นไฟล์ CSV ที่ Excel เปิดได้ตรง ๆ
 * ใช้ตัวเลขชุดเดียวกับที่แสดงบนแดชบอร์ด (buildReport) ไม่ได้คิดใหม่
 */

import { thaiDate } from "./format";
import type { buildReport } from "./sales-report";

type Report = ReturnType<typeof buildReport>;

/** ครอบค่าที่มีจุลภาคหรือเครื่องหมายคำพูดให้ปลอดภัยตามมาตรฐาน CSV */
function cell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** แปลงตารางเป็นข้อความ CSV — ใช้ร่วมกันทุกที่ที่ส่งออกไฟล์ จะได้หนีอักขระแบบเดียวกัน */
export function toCsv(lines: (string | number)[][]) {
  return rows(lines);
}

function rows(lines: (string | number)[][]) {
  return lines.map((line) => line.map(cell).join(",")).join("\r\n");
}

export function reportCsv(report: Report, rangeLabel: string) {
  const lines: (string | number)[][] = [
    ["รายงานการขาย MAZ"],
    ["ช่วงเวลา", rangeLabel, `${thaiDate(report.from)} – ${thaiDate(report.to)}`],
    [],
    ["ตัวเลขสำคัญ", "ค่า", "เทียบช่วงก่อน (%)"],
    ["มูลค่าที่ปิดได้ (บาท)", report.won, report.dWon ?? "—"],
    ["จำนวนดีลที่ปิดได้", report.wonDeals, ""],
    ["ผู้สนใจใหม่ (ราย)", report.leads, report.dLead ?? "—"],
    ["ใบเสนอราคาที่ออก (ฉบับ)", report.quotes, ""],
    ["มูลค่าที่เสนอไป (บาท)", report.quoted, ""],
    ["อัตราปิดการขาย (%)", report.rate, report.dRate ?? "—"],
    ["ระยะเวลาปิดเฉลี่ย (วัน)", report.avgDays || "—", ""],
    ["ชั่วโมงงานก่อนการขาย", report.presalesHours, ""],
    [],
    ["ช่วง", "มูลค่าที่ปิดได้ (บาท)"],
    ...report.series.map(([label, value]) => [label, value]),
    [],
    ["สัดส่วนตามสถานะ", "จำนวน (ราย)"],
    ...report.statusSlices.map((s) => [s.label, s.value]),
    [],
    ["สัดส่วนตามแหล่งที่มา", "จำนวน (ราย)"],
    ...report.sourceSlices.map((s) => [s.label, s.value]),
    [],
    ["เหตุผลที่ไม่ตกลง", "จำนวน (ราย)"],
    ...report.lostSlices.map((s) => [s.label, s.value]),
    [],
    ["ลูกค้าที่ปิดได้สูงสุด", "มูลค่า (บาท)"],
    ...report.rank.map((r) => [r.name, r.value]),
  ];
  return rows(lines);
}

/**
 * โยนไฟล์ให้เบราว์เซอร์ดาวน์โหลด
 * ต้องมี BOM ไม่งั้น Excel บนวินโดวส์อ่านภาษาไทยเป็นตัวยึกยือ
 */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
