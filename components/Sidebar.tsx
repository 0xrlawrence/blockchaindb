"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", icon: "🏠", label: "Dashboard" },
  { href: "/collections", icon: "📁", label: "Collections" },
  { href: "/documents", icon: "📄", label: "Documents" },
  { href: "/network", icon: "🌐", label: "Network" },
  { href: "/contract", icon: "📜", label: "Smart Contract" },
  { href: "/settings", icon: "⚙️", label: "Settings" },
  { href: "/developers", icon: "🔌", label: "API" },
  { href: "/playground", icon: "🧪", label: "Playground" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-base-border bg-base-panel">
      <Link href="/" className="flex items-center gap-2.5 px-5 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/starboar.webp"
          alt=""
          className="h-8 w-8 rounded-lg object-contain"
        />
        <span className="text-[15px] font-semibold tracking-tight">
          StarBoarDB
        </span>
      </Link>

      <nav className="mt-2 flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`pressable flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                active
                  ? "bg-brand-faint font-medium text-brand"
                  : "text-ink-soft hover:bg-base-raised hover:text-ink"
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-base-border px-5 py-4 text-xs text-ink-faint">
        The blockchain is your database.
      </div>
    </aside>
  );
}
