import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { SiteNav } from "@/components/site-nav";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Prompt Inspector",
    template: "%s · Prompt Inspector",
  },
  description:
    "Before you spend money asking GPT-5.6… let Kimi inspect your prompt first. An OpenAI-compatible proxy that routes every prompt to the cheapest tier that can nail it.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geist.variable} ${geistMono.variable} min-h-screen bg-zinc-950 font-sans text-zinc-100 antialiased`}
      >
        <SiteNav />
        <main className="mx-auto w-full max-w-6xl px-6">{children}</main>
      </body>
    </html>
  );
}
