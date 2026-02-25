import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "교육원 통합 관리 시스템",
  description: "교육원 통합 관리 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
