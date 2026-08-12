import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "词选｜北京河北中考英语2000词",
  description: "北京、河北中考适用的2000词合并词库，通过四选一识义与美式发音重复巩固错词。",
  openGraph: {
    title: "词选｜北京河北中考英语2000词",
    description: "北京、河北中考适用的2000词合并词库，四选一快速掌握词义。",
    type: "website",
    locale: "zh_CN",
    images: [{ url: "/og-card.png", width: 1731, height: 893, alt: "词选英语词义训练" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "词选｜北京河北中考英语2000词",
    description: "北京、河北中考适用的2000词合并词库，四选一快速掌握词义。",
    images: ["/og-card.png"],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "词选",
  },
};

export const viewport: Viewport = {
  themeColor: "#f6f4ee",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
