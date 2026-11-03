import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "题库知识库",
  description: "私有云同步的模拟卷与题目管理工具",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
