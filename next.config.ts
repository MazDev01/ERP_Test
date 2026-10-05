import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // เปิดผ่าน IP เครือข่ายได้ (HMR ไม่ถูกบล็อก) ตอน dev
  allowedDevOrigins: ["26.224.66.120"],

  async headers() {
    return [
      {
        /* service worker ต้องไม่ถูกแคช ไม่งั้นตัวเก่าจะค้างอยู่หลัง deploy
           และต้องเสิร์ฟจากรากเว็บถึงจะคุมได้ทั้งไซต์ */
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
