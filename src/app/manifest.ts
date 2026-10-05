import type { MetadataRoute } from "next";

/** ให้ติดตั้งลงหน้าจอโฮมได้เหมือนแอป — ตรงกับ manifest ในแบบ UI */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ERP MAZ",
    short_name: "ERP MAZ",
    description: "ระบบ ERP งานขายและงานบุคคลของ MAZ",
    lang: "th",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f5f7",
    theme_color: "#db0000",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
