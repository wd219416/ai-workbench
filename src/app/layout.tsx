import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "典致 AI 内容创作工作台",
  description: "木盆电商 + 广告设计 · AI 作图与视频生产",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
