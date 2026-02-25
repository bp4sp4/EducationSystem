import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "교육원 통합 관리 시스템",
  description: "교육원 통합 관리 시스템",
  openGraph: {
    title: "교육원 통합 관리 시스템",
    description: "교육원 통합 관리 시스템",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "한평생교육",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "교육원 통합 관리 시스템",
    description: "교육원 통합 관리 시스템",
    images: ["/og-image.png"],
  },
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
