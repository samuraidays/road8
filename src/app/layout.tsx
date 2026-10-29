import type { Metadata } from "next";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "road8",
  description: "OKR とタスク管理",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="bottom-right" />
        <footer className="flex justify-center gap-4 border-t px-4 py-3 text-xs text-muted-foreground">
          <Link href="/terms" className="hover:underline">
            利用規約
          </Link>
          <Link href="/privacy" className="hover:underline">
            プライバシーポリシー
          </Link>
        </footer>
      </body>
    </html>
  );
}
