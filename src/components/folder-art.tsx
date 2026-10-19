/*
 * รูปโฟลเดอร์สองชั้น (หลัง/หน้า) — ใช้ร่วมกันระหว่างหน้าโปรเจคของ PM กับแฟ้มเอกสารในหน้าดีล
 * ให้หน้าตาโฟลเดอร์เหมือนกันทั้งระบบ (ผู้ใช้สั่ง 15 ต.ค. 2569)
 */

/* สีโฟลเดอร์ = สีสถานะของโปรเจค ไม่มีจุดสถานะแยก (ผู้ใช้สั่ง 8 ต.ค. 2569) */
export const FOLDER_TONE: Record<"plan" | "run" | "late" | "done" | "cancelled", { back: string; front: string }> = {
  plan: { back: "#FBE3BF", front: "#F2B45C" },
  run: { back: "#C7D4F2", front: "#8FA6E8" },
  late: { back: "#F8C9C9", front: "#EC8A8A" },
  done: { back: "#BFE6D2", front: "#7FCFA7" },
  cancelled: { back: "#E3E5E9", front: "#C3C8D0" },
};

export function FolderArt({
  tone,
  width = 76,
  height = 62,
}: {
  tone: { back: string; front: string };
  width?: number;
  height?: number;
}) {
  return (
    <svg viewBox="0 0 64 52" width={width} height={height} aria-hidden="true" className="block">
      <path
        fill={tone.back}
        d="M2 8a6 6 0 0 1 6-6h16l6 7h26a6 6 0 0 1 6 6v31a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6Z"
      />
      <path fill={tone.front} d="M2 17h60v25a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6Z" />
    </svg>
  );
}
