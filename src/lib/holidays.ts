import { settings } from "./system-settings";

/*
 * วันหยุดราชการ ปี 2569 — แหล่งเดียวของทั้งระบบ
 * ใช้ร่วมกันทั้งการนับวันลา อัตราโอทีวันหยุด และแถบวันหยุดในตารางงาน
 * ถ้าแยกเก็บคนละที่ จะมีวันที่ตารางงานบอกว่าหยุด แต่ใบลากลับนับเป็นวันทำงาน
 *
 * วันที่ตามปฏิทินจันทรคติ (มาฆะ วิสาขะ อาสาฬหะ เข้าพรรษา) และวันหยุดชดเชย
 * ครม. ประกาศเพิ่มทุกปี ต้องเทียบกับประกาศราชการอีกครั้ง
 * ค่าเก็บใน system-settings.ts ผู้ดูแลระบบแก้ได้เองรายปี
 */
/** วันหยุดบริษัท — ผู้ดูแลระบบแก้ได้ที่ /admin/holidays อ่านใหม่ทุกครั้ง ห้ามเก็บเป็นค่าคงที่ */
export function holidays(): Record<string, string> {
  return settings().holidays;
}

export function isHoliday(iso: string) {
  return Boolean(holidays()[iso]);
}

/** วันทำงานจริง = ไม่ใช่เสาร์-อาทิตย์ และไม่ใช่วันหยุดราชการ */
export function isWorkday(date: Date, iso: string) {
  const w = date.getDay();
  return w !== 0 && w !== 6 && !isHoliday(iso);
}

/** วันหยุดที่ตกอยู่ระหว่างสองวัน (รวมหัวท้าย) เรียงตามวันที่ */
export function holidaysBetween(from: string, to: string): [string, string][] {
  return Object.entries(holidays())
    .filter(([d]) => d >= from && d <= to)
    .sort(([a], [b]) => a.localeCompare(b));
}
