import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "词选｜初中英语四选一识义训练",
  description: "自动播放美式发音，通过四选一快速练习初中英语词义，并重复巩固错词。",
  openGraph: {
    title: "词选｜初中英语四选一识义训练",
    description: "自动播放美式发音，四选一快速掌握初中英语词义。",
    type: "website",
    locale: "zh_CN",
    images: [{ url: "/og-card.png", width: 1731, height: 893, alt: "词选英语词义训练" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "词选｜初中英语四选一识义训练",
    description: "自动播放美式发音，四选一快速掌握初中英语词义。",
    images: ["/og-card.png"],
  },
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
