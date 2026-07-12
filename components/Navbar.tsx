"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { StatusResponse } from "@/lib/types";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/collections": "Collections",
  "/documents": "Documents",
  "/network": "Network",
  "/contract": "Smart Contract",
  "/settings": "Settings",
  "/developers": "API",
  "/playground": "Playground",
};

export default function Navbar() {
  const pathname = usePathname();
  const [status, setStatus] = useState<StatusResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/status")
        .then((r) => r.json())
        .then((s) => {
          if (!cancelled) setStatus(s);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const title =
    Object.entries(TITLES).find(([p]) => pathname.startsWith(p))?.[1] ?? "";
  const connected = status?.connected ?? false;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-base-border bg-base-panel px-6">
      <h1 className="text-sm font-medium text-ink-soft">{title}</h1>
      <div className="flex items-center gap-3">
        {status?.contract?.address && (
          <span className="hidden rounded-md border border-base-border bg-base-raised px-2.5 py-1 font-mono text-xs text-ink-soft md:inline">
            {status.contract.address.slice(0, 6)}…
            {status.contract.address.slice(-4)}
          </span>
        )}
        <span className="flex items-center gap-2 rounded-full border border-base-border bg-base-raised px-3 py-1.5 text-xs font-medium">
          <span
            className={`h-2 w-2 rounded-full ${
              connected ? "dot-pulse bg-brand" : "bg-red-500"
            }`}
          />
          {status === null
            ? "Connecting…"
            : connected
              ? (status.network?.name ?? "Connected")
              : "Disconnected"}
          {connected && status?.network?.testnet === true && (
            <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
              testnet
            </span>
          )}
          {connected && status?.network?.testnet === false && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
              mainnet
            </span>
          )}
        </span>
      </div>
    </header>
  );
}
