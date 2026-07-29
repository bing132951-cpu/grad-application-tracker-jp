import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "大学院申请记录看板",
  description: "记录日本大学院申请、教授联系和考试准备的本地工具。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
