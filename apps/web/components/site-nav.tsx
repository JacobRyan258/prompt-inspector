"use client";

import { Github, SearchCode } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GITHUB_URL, SITE_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Playground" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/benchmarks", label: "Benchmarks" },
  { href: "/challenge", label: "Challenge" },
];

export function SiteNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/70 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2 text-zinc-100">
          <SearchCode className="size-4" strokeWidth={2.2} />
          <span className="font-mono text-sm font-medium tracking-tight">
            {SITE_NAME}
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub"
          className="ml-auto rounded-md p-2 text-zinc-400 transition-colors hover:text-zinc-100"
        >
          <Github className="size-4" />
        </a>
      </div>
    </header>
  );
}
