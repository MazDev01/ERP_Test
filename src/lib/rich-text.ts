/*
 * รายละเอียดงานในใบเสนอราคาเก็บเป็น HTML เล็ก ๆ เพราะลูกค้าวางมาจาก Word
 * อนุญาตเฉพาะแท็กที่จำเป็น ตัดสคริปต์และสไตล์ทิ้งทุกครั้งทั้งตอนวางและตอนแสดง
 * hr = จุดขึ้นหน้าใหม่ตอนพิมพ์
 */

/** แท็กที่เก็บไว้ นอกจากนี้ถูกถอดเหลือแต่ข้อความข้างใน */
const KEEP = new Set(["B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "P", "BR", "HR"]);

/** แท็กที่ต้องกลายเป็นย่อหน้า เพราะ Word ส่ง div/h1-h6 มาแทน p */
const AS_PARAGRAPH = new Set(["DIV", "H1", "H2", "H3", "H4", "H5", "H6"]);

type Flags = { b: boolean; i: boolean; u: boolean; pageBreak: boolean };

/** Word ใส่ตัวหนา/เอียงมาเป็น inline style ไม่ใช่แท็ก จึงต้องอ่านจาก style ด้วย */
function flagsOf(el: Element): Flags {
  const style = el.getAttribute("style") ?? "";
  return {
    b: /font-weight\s*:\s*(bold|[6-9]00)/i.test(style),
    i: /font-style\s*:\s*italic/i.test(style),
    u: /text-decoration[^;]*underline/i.test(style),
    pageBreak:
      /page-break-before\s*:\s*always/i.test(style) ||
      /mso-special-character\s*:\s*line-break/i.test(style),
  };
}

/**
 * Google Docs ห่อทั้งเอกสารด้วย <b style="font-weight:normal">
 * ถ้าเชื่อแท็กตรง ๆ ทั้งหน้าจะกลายเป็นตัวหนา จึงต้องดูสไตล์ที่ยกเลิกไว้ด้วย
 */
function cancels(tag: string, style: string) {
  if (tag === "B") return /font-weight\s*:\s*(normal|400)/i.test(style);
  if (tag === "I") return /font-style\s*:\s*normal/i.test(style);
  if (tag === "U") return /text-decoration[^;]*none/i.test(style);
  return false;
}

function walk(src: Node, dest: HTMLElement, doc: Document) {
  src.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      dest.appendChild(doc.createTextNode(node.nodeValue ?? ""));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "O:P") return;

    const f = flagsOf(el);
    if (f.pageBreak) dest.appendChild(doc.createElement("hr"));

    let target = dest;
    if (KEEP.has(tag)) {
      const name = tag === "STRONG" ? "b" : tag === "EM" ? "i" : tag.toLowerCase();
      if (!cancels(name.toUpperCase(), el.getAttribute("style") ?? "")) {
        const created = doc.createElement(name);
        target.appendChild(created);
        target = created;
      }
    } else if (AS_PARAGRAPH.has(tag)) {
      const p = doc.createElement("p");
      target.appendChild(p);
      target = p;
    }

    for (const [flag, name] of [
      [f.b, "b"],
      [f.i, "i"],
      [f.u, "u"],
    ] as const) {
      if (!flag) continue;
      const created = doc.createElement(name);
      target.appendChild(created);
      target = created;
    }

    if (tag === "BR" || tag === "HR") return;
    walk(el, target, doc);
  });
}

/** ล้าง HTML ให้เหลือเฉพาะแท็กที่อนุญาต ใช้ทั้งตอนวางและตอนบันทึก */
export function cleanHtml(html: string) {
  if (typeof document === "undefined") return "";
  const src = document.createElement("div");
  src.innerHTML = String(html).replace(/<!--[\s\S]*?-->/g, "");
  const out = document.createElement("div");
  walk(src, out, document);
  return out.innerHTML;
}

/** ข้อความล้วนหลายบรรทัด → HTML ย่อหน้าละบรรทัด ใช้ตอนวางข้อความธรรมดา */
export function textToHtml(text: string) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line) || "<br>"}</p>`)
    .join("");
}

export function escapeHtml(text: string) {
  return String(text ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

/** แบ่ง HTML เป็นหน้ากระดาษตาม <hr> ที่ผู้ใช้แทรกไว้ */
export function splitPages(html: string): string[] {
  const parts = String(html || "").split(/<hr\s*\/?>/i);
  const pages = parts.map((p) => p.trim()).filter((p, i) => p || i === 0);
  return pages.length ? pages : [""];
}

/** ตัวอักษรล้วนไว้เช็คว่าว่างไหม และใช้เป็นชื่อดีลตอนลูกค้ายอมรับ */
export function htmlToText(html: string) {
  if (typeof document === "undefined") {
    return String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  const el = document.createElement("div");
  el.innerHTML = String(html || "");
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** บรรทัดแรกที่มีตัวอักษร ใช้ตั้งชื่อดีลและใบงาน */
export function firstLine(html: string) {
  const text = htmlToText(html);
  return text.split(/\s{2,}|·/)[0]?.slice(0, 120) || text.slice(0, 120);
}
