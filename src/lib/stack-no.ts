/**
 * เลขลำดับแบบกองซ้อน (ผู้ใช้สั่ง 12 ต.ค. 2569)
 * — แถวที่สร้างก่อนสุดได้ 1 แถวใหม่ล่าสุดได้เลขมากสุด ตารางเรียงใหม่อยู่บน จึงเห็น 10, 9, 8 … 1
 * — คิดจากข้อมูลทั้งชุดของตารางก่อนกรองแท็บ/ค้นหา เลขของแต่ละรายการจึงคงที่ ไม่เลื่อนเมื่อมีรายการใหม่
 * — เรียงจากเก่าไปใหม่ด้วยวันที่สร้าง/ออก/ยื่น (key) แล้วตามด้วยรหัส (id) เมื่อวันที่เท่ากัน
 */
export function stackNo<T>(
  all: readonly T[],
  key: (x: T) => string,
  id: (x: T) => string,
): Map<string, number> {
  const sorted = [...all].sort(
    (a, b) =>
      (key(a) || "").localeCompare(key(b) || "") ||
      id(a).localeCompare(id(b), undefined, { numeric: true }),
  );
  const map = new Map<string, number>();
  sorted.forEach((x, i) => map.set(id(x), i + 1));
  return map;
}
