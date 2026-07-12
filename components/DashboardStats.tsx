"use client";

import Link from "next/link";
import type { StatusResponse } from "@/lib/types";

function shorten(hash: string | null | undefined): string {
  if (!hash) return "—";
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

interface StatCard {
  label: string;
  value: string;
  href?: string;
  mono?: boolean;
  dot?: "ok" | "bad";
}

export default function DashboardStats({
  status,
}: {
  status: StatusResponse | null;
}) {
  const loading = status === null;

  const cards: StatCard[] = [
    {
      label: "Collections",
      value: status?.stats ? String(status.stats.collections) : "—",
      href: "/collections",
    },
    {
      label: "Documents",
      value: status?.stats ? String(status.stats.documents) : "—",
      href: "/documents",
    },
    {
      label: "Current Network",
      value: status?.network?.name ?? "—",
      href: "/network",
    },
    {
      label: "Contract",
      value: shorten(status?.contract?.address),
      href: "/contract",
      mono: true,
    },
    {
      label: "Encryption",
      value: status?.encryption.enabled ? "On" : "Off (no key)",
      href: "/settings",
      dot: status?.encryption.enabled ? "ok" : undefined,
    },
    {
      label: "Status",
      value: status?.connected ? "Connected" : "Offline",
      dot: status?.connected ? "ok" : "bad",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((card, i) => {
        const className = `rise rounded-xl border border-base-border bg-base-panel p-4 ${
          card.href ? "pressable hover:border-brand/40" : ""
        }`;
        const style = { "--rise-delay": i } as React.CSSProperties;

        const content = (
          <>
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
              {card.label}
            </p>
            {loading ? (
              <span className="skeleton mt-3 block h-5 w-16" />
            ) : (
              <p
                className={`mt-2 truncate text-lg font-semibold tracking-tight tabular-nums ${
                  card.mono ? "font-mono text-sm leading-7" : ""
                }`}
                title={card.value}
              >
                {card.dot && (
                  <span
                    className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${
                      card.dot === "ok" ? "dot-pulse bg-brand" : "bg-red-500"
                    }`}
                  />
                )}
                {card.value}
              </p>
            )}
          </>
        );

        return card.href ? (
          <Link key={card.label} href={card.href} className={className} style={style}>
            {content}
          </Link>
        ) : (
          <div key={card.label} className={className} style={style}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
