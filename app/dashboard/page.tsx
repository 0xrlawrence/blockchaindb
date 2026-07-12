"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DashboardStats from "@/components/DashboardStats";
import type {
  CollectionInfo,
  DocumentRecord,
  StatusResponse,
} from "@/lib/types";

export default function DashboardPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [recent, setRecent] = useState<
    { collection: string; documents: DocumentRecord[] }[]
  >([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const statusRes = await fetch("/api/status").then((r) => r.json());
      setStatus(statusRes);

      if (statusRes?.configured?.contract) {
        const collectionsRes = await fetch("/api/collections").then((r) =>
          r.json()
        );
        const cols: CollectionInfo[] = collectionsRes.collections ?? [];
        setCollections(cols);

        const withDocs = cols.filter((c) => c.documentCount > 0).slice(0, 3);
        const docs = await Promise.all(
          withDocs.map(async (c) => {
            const res = await fetch(
              `/api/list?collection=${encodeURIComponent(c.name)}`
            ).then((r) => r.json());
            return {
              collection: c.name,
              documents: (res.documents ?? []).slice(-3).reverse(),
            };
          })
        );
        setRecent(docs);
      }
    } catch {
      // status card already reflects failures
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unconfigured = loaded && status && !status.configured.contract;

  return (
    <div className="space-y-8">
      <DashboardStats status={status} />

      {unconfigured && (
        <div className="rise rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm">
          <p className="font-medium text-amber-300">
            No contract configured yet
          </p>
          <p className="mt-1 text-ink-soft">
            Deploy Database.sol with{" "}
            <code className="font-mono text-xs">npm run deploy</code> and paste
            the address in{" "}
            <Link href="/settings" className="text-brand hover:underline">
              Settings
            </Link>
            .
          </p>
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Collections
          </h2>
          <Link
            href="/collections"
            className="text-xs text-brand hover:underline"
          >
            View all →
          </Link>
        </div>
        {!loaded ? (
          <div className="flex flex-wrap gap-2">
            {[88, 72, 96].map((width, i) => (
              <span
                key={i}
                className="skeleton h-9 rounded-lg"
                style={{ width }}
              />
            ))}
          </div>
        ) : collections.length === 0 ? (
          <p className="rounded-xl border border-dashed border-base-border p-6 text-sm text-ink-faint">
            No collections yet.{" "}
            <Link href="/collections" className="text-brand hover:underline">
              Create your first collection →
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {collections.map((c, i) => (
              <Link
                key={c.name}
                href={`/documents?collection=${encodeURIComponent(c.name)}`}
                className="rise pressable rounded-lg border border-base-border bg-base-panel px-4 py-2 text-sm hover:border-brand/40 hover:text-brand"
                style={{ "--rise-delay": Math.min(i, 8) } as React.CSSProperties}
              >
                📁 {c.name}
                <span className="ml-2 text-xs tabular-nums text-ink-faint">
                  {c.documentCount}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Recent Documents
        </h2>
        {!loaded ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-base-border bg-base-panel p-4"
              >
                <span className="skeleton mb-4 block h-4 w-28" />
                <span className="skeleton mb-2 block h-8" />
                <span className="skeleton block h-8" />
              </div>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="rounded-xl border border-dashed border-base-border p-6 text-sm text-ink-faint">
            Documents you create will show up here.{" "}
            <Link href="/playground" className="text-brand hover:underline">
              Try the Playground →
            </Link>
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {recent.map((group, i) => (
              <div
                key={group.collection}
                className="rise rounded-xl border border-base-border bg-base-panel p-4"
                style={{ "--rise-delay": i } as React.CSSProperties}
              >
                <p className="mb-3 text-sm font-semibold">
                  📁 {group.collection}
                </p>
                <ul className="space-y-2">
                  {group.documents.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-baseline gap-3 rounded-lg bg-base px-3 py-2"
                    >
                      <span className="font-mono text-xs tabular-nums text-ink-faint">
                        {doc.id}
                      </span>
                      <code className="truncate font-mono text-xs text-ink-soft">
                        {JSON.stringify(doc.data)}
                      </code>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
