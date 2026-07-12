"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { NETWORKS, findByRpcUrl } from "@/lib/networks";
import type {
  CollectionInfo,
  DocumentRecord,
  StatusResponse,
} from "@/lib/types";

type Tab = "collections" | "documents" | "network" | "settings";
type Side = "testnet" | "mainnet";

interface SettingsState {
  rpcUrl: string;
  contractAddress: string;
  privateKeySet: boolean;
}

function shorten(hash: string | null | undefined): string {
  if (!hash) return "—";
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function fmtTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString([], {
    dateStyle: "short",
    timeStyle: "short",
  });
}

const fade = (i: number) => ({ "--fade-delay": i }) as React.CSSProperties;

export default function DashboardPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null
  );

  // workspace
  const [tab, setTab] = useState<Tab>("documents");
  const [side, setSide] = useState<Side>("testnet");
  const [sideTouched, setSideTouched] = useState(false);
  const [switching, setSwitching] = useState(false);

  // documents
  const [selectedCollection, setSelectedCollection] = useState("");
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [newDocJson, setNewDocJson] = useState("");
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [busyDocId, setBusyDocId] = useState<number | null>(null);

  // collections
  const [newColName, setNewColName] = useState("");
  const [creatingCol, setCreatingCol] = useState(false);

  // settings
  const [privateKey, setPrivateKey] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [confirmDeploy, setConfirmDeploy] = useState(false);

  const loadStatus = useCallback(async () => {
    const s: StatusResponse = await fetch("/api/status").then((r) => r.json());
    setStatus(s);
    return s;
  }, []);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/settings");
    if (!res.ok) return null;
    const s = await res.json();
    const next: SettingsState = {
      rpcUrl: s.rpcUrl ?? "",
      contractAddress: s.contractAddress ?? "",
      privateKeySet: Boolean(s.privateKeySet),
    };
    setSettings(next);
    setContractAddress(next.contractAddress);
    return next;
  }, []);

  const loadCollections = useCallback(async () => {
    try {
      const res = await fetch("/api/collections").then((r) => r.json());
      const cols: CollectionInfo[] = res.collections ?? [];
      setCollections(cols);
      return cols;
    } catch {
      return [];
    }
  }, []);

  const loadDocuments = useCallback(async (collection: string) => {
    if (!collection) {
      setDocuments([]);
      return;
    }
    setDocsLoading(true);
    try {
      const res = await fetch(
        `/api/list?collection=${encodeURIComponent(collection)}`
      ).then((r) => r.json());
      setDocuments(res.error ? [] : (res.documents ?? []));
    } catch {
      setDocuments([]);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [s, , cols] = await Promise.all([
          loadStatus(),
          loadSettings(),
          loadCollections(),
        ]);
        if (!sideTouched && s?.network?.testnet === false) setSide("mainnet");
        const first = cols.find((c) => c.documentCount > 0) ?? cols[0];
        if (first) {
          setSelectedCollection(first.name);
          await loadDocuments(first.name);
        }
      } finally {
        setLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connected = status?.connected ?? false;
  const currentPreset = useMemo(
    () => (settings ? findByRpcUrl(settings.rpcUrl) : undefined),
    [settings]
  );
  const sideNetworks = NETWORKS.filter((n) =>
    side === "testnet" ? n.testnet : !n.testnet
  );

  /** Header dropdown: switch the whole database to another chain. */
  const switchNetwork = async (rpcUrl: string) => {
    if (!rpcUrl || !settings) return;
    setSwitching(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rpcUrl }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Switch failed");
      const [, next] = await Promise.all([loadSettings(), loadStatus()]);
      const cols = await loadCollections();
      const first = cols.find((c) => c.documentCount > 0) ?? cols[0];
      setSelectedCollection(first?.name ?? "");
      await loadDocuments(first?.name ?? "");
      setMsg({
        kind: "ok",
        text: `switched to ${next?.network?.name?.toLowerCase() ?? findByRpcUrl(rpcUrl)?.name.toLowerCase() ?? "network"}`,
      });
    } catch (err) {
      setMsg({
        kind: "error",
        text: err instanceof Error ? err.message : "switch failed",
      });
    } finally {
      setSwitching(false);
    }
  };

  const createCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;
    setCreatingCol(true);
    setMsg(null);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newColName.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Transaction failed");
      setNewColName("");
      const cols = await loadCollections();
      loadStatus();
      if (!selectedCollection && cols[0]) setSelectedCollection(cols[0].name);
      setMsg({ kind: "ok", text: "collection created on-chain" });
    } catch (err) {
      setMsg({
        kind: "error",
        text: err instanceof Error ? err.message : "transaction failed",
      });
    } finally {
      setCreatingCol(false);
    }
  };

  const createDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCollection) return;
    let data: unknown;
    try {
      data = JSON.parse(newDocJson);
    } catch {
      setMsg({ kind: "error", text: "invalid json" });
      return;
    }
    setCreatingDoc(true);
    setMsg(null);
    try {
      const res = await fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: selectedCollection, data }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Transaction failed");
      setNewDocJson("");
      setNewDocOpen(false);
      await Promise.all([
        loadDocuments(selectedCollection),
        loadCollections(),
        loadStatus(),
      ]);
      setMsg({ kind: "ok", text: "document written on-chain" });
    } catch (err) {
      setMsg({
        kind: "error",
        text: err instanceof Error ? err.message : "transaction failed",
      });
    } finally {
      setCreatingDoc(false);
    }
  };

  const deleteDocument = async (doc: DocumentRecord) => {
    setBusyDocId(doc.id);
    setMsg(null);
    try {
      const res = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: selectedCollection, id: doc.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Transaction failed");
      await Promise.all([
        loadDocuments(selectedCollection),
        loadCollections(),
        loadStatus(),
      ]);
    } catch (err) {
      setMsg({
        kind: "error",
        text: err instanceof Error ? err.message : "transaction failed",
      });
    } finally {
      setBusyDocId(null);
    }
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSavingSettings(true);
    setMsg(null);
    try {
      const payload: Record<string, string> = {
        rpcUrl: settings.rpcUrl,
        contractAddress,
      };
      if (privateKey.trim()) payload.privateKey = privateKey.trim();
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      setPrivateKey("");
      await Promise.all([loadSettings(), loadStatus()]);
      setMsg({ kind: "ok", text: "saved to .env.local" });
    } catch (err) {
      setMsg({
        kind: "error",
        text: err instanceof Error ? err.message : "save failed",
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const deploy = async () => {
    if (!confirmDeploy) {
      setConfirmDeploy(true);
      return;
    }
    setConfirmDeploy(false);
    setDeploying(true);
    setMsg(null);
    try {
      const payload: Record<string, string> = { contractAddress };
      if (privateKey.trim()) payload.privateKey = privateKey.trim();
      const saveRes = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const saveBody = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveBody.error ?? "Save failed");
      setPrivateKey("");

      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Deploy failed");
      setContractAddress(body.address);
      await Promise.all([loadSettings(), loadStatus(), loadCollections()]);
      setMsg({
        kind: "ok",
        text: `deployed ${shorten(body.address)} on ${String(body.network ?? "chain").toLowerCase()}`,
      });
    } catch (err) {
      setMsg({
        kind: "error",
        text: err instanceof Error ? err.message : "deploy failed",
      });
    } finally {
      setDeploying(false);
    }
  };

  const net = status?.network;
  const strip: {
    label: string;
    value: string;
    mono?: boolean;
    goto: Tab;
  }[] = [
    {
      label: "collections",
      value: status?.stats ? String(status.stats.collections) : "—",
      goto: "collections",
    },
    {
      label: "documents",
      value: status?.stats ? String(status.stats.documents) : "—",
      goto: "documents",
    },
    {
      label: "network",
      value: (net?.name ?? "—").toLowerCase(),
      goto: "network",
    },
    {
      label: "block",
      value: net ? net.blockNumber.toLocaleString() : "—",
      goto: "network",
    },
    {
      label: "balance",
      value: status?.wallet
        ? `${Number(status.wallet.balance).toFixed(3)} ${net?.currency ?? ""}`.toLowerCase()
        : "—",
      goto: "network",
    },
    {
      label: "contract",
      value: shorten(status?.contract?.address),
      mono: true,
      goto: "settings",
    },
  ];

  return (
    <div className="bryl relative min-h-screen">
      <div aria-hidden className="bryl-dotbg" />
      <div className="relative z-[1] mx-auto max-w-[56rem] px-4 py-6 sm:px-6">
        {/* header: wordmark · testnet/mainnet toggle · network dropdown · live pill */}
        <header
          className="bryl-fade-up flex flex-wrap items-center justify-between gap-3"
          style={fade(0)}
        >
          <span className="bryl-mono text-sm font-medium lowercase">
            ⛓ blockchaindb
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <div className="bryl-tabs" role="group" aria-label="chain type">
              {(["testnet", "mainnet"] as Side[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="bryl-tab"
                  data-active={side === s}
                  onClick={() => {
                    setSide(s);
                    setSideTouched(true);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <select
              className="bryl-select"
              value={
                currentPreset && currentPreset.testnet === (side === "testnet")
                  ? currentPreset.rpcUrl
                  : ""
              }
              disabled={switching || !settings}
              onChange={(e) => switchNetwork(e.target.value)}
              aria-label="switch network"
            >
              <option value="" disabled>
                {switching
                  ? "switching…"
                  : currentPreset
                    ? `switch ${side}…`
                    : "custom rpc — switch…"}
              </option>
              {sideNetworks.map((n) => (
                <option key={n.id} value={n.rpcUrl}>
                  {n.name.toLowerCase()} · {n.chainId}
                </option>
              ))}
            </select>
            <span className={`bryl-pill ${connected ? "bryl-pill-inverted" : ""}`}>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  connected
                    ? "dot-pulse bg-white"
                    : "border border-[var(--gray-400)]"
                }`}
              />
              {status === null
                ? "connecting"
                : switching
                  ? "switching"
                  : connected
                    ? "live"
                    : "offline"}
            </span>
          </div>
        </header>

        {/* title */}
        <div className="bryl-fade-up mt-8" style={fade(1)}>
          <h1 className="bryl-title text-[2rem] sm:text-[2.5rem]">dashboard</h1>
          <p className="bryl-label mt-2">the blockchain is your database</p>
        </div>

        {/* 01 — status strip: every cell jumps to its tab below */}
        <section className="mt-8">
          <h2 className="bryl-section-header bryl-fade-up mb-3" style={fade(2)}>
            01 — status
          </h2>
          <div className="bryl-strip bryl-fade-up" style={fade(2)}>
            {strip.map((cell) => (
              <button
                key={cell.label}
                type="button"
                onClick={() => setTab(cell.goto)}
                title={`open ${cell.goto}`}
              >
                <span className="bryl-label">{cell.label}</span>
                {!loaded ? (
                  <span className="skeleton block h-5 w-12" />
                ) : (
                  <span
                    className={`truncate ${
                      cell.mono
                        ? "bryl-mono text-sm leading-5"
                        : "bryl-stat-value !text-[1.125rem]"
                    }`}
                    title={cell.value}
                  >
                    {cell.value}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* 02 — workspace: tabbed panels, all data inline */}
        <section className="mt-8">
          <div
            className="bryl-fade-up mb-3 flex flex-wrap items-center justify-between gap-2"
            style={fade(3)}
          >
            <h2 className="bryl-section-header">02 — workspace</h2>
            <div className="bryl-tabs" role="tablist">
              {(["collections", "documents", "network", "settings"] as Tab[]).map(
                (t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    className="bryl-tab"
                    data-active={tab === t}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                )
              )}
            </div>
          </div>

          {msg && (
            <p
              className={`bryl-mono mb-3 text-xs ${
                msg.kind === "ok" ? "text-[var(--gray-500)]" : "text-red-600"
              }`}
            >
              {msg.kind === "ok" ? "✓" : "✕"} {msg.text}
            </p>
          )}

          {/* ---- collections ---- */}
          {tab === "collections" && (
            <div key="collections" className="bryl-panel bryl-card bg-white p-4">
              <form onSubmit={createCollection} className="mb-4 flex gap-2">
                <input
                  className="bryl-input flex-1"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  placeholder="new collection, e.g. users"
                />
                <button
                  type="submit"
                  className="bryl-btn"
                  disabled={creatingCol || !newColName.trim()}
                >
                  {creatingCol ? "creating…" : "create"}
                </button>
              </form>
              {!loaded ? (
                <div className="space-y-2">
                  {[0, 1].map((i) => (
                    <span key={i} className="skeleton block h-8" />
                  ))}
                </div>
              ) : collections.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--gray-300)] p-5 text-sm text-[var(--gray-500)]">
                  no collections yet — create one above; <b>users</b> is a good
                  start
                </p>
              ) : (
                <table className="bryl-table">
                  <thead>
                    <tr>
                      <th>name</th>
                      <th>documents</th>
                      <th className="w-28"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {collections.map((c) => (
                      <tr key={c.name}>
                        <td className="lowercase text-[var(--ink)]">{c.name}</td>
                        <td className="tabular-nums">{c.documentCount}</td>
                        <td>
                          <button
                            type="button"
                            className="bryl-link bg-transparent"
                            onClick={() => {
                              setSelectedCollection(c.name);
                              loadDocuments(c.name);
                              setTab("documents");
                            }}
                          >
                            view data
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ---- documents ---- */}
          {tab === "documents" && (
            <div key="documents" className="bryl-panel bryl-card bg-white p-4">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <select
                  className="bryl-select"
                  value={selectedCollection}
                  onChange={(e) => {
                    setSelectedCollection(e.target.value);
                    setExpandedId(null);
                    loadDocuments(e.target.value);
                  }}
                  aria-label="collection"
                >
                  {selectedCollection === "" && (
                    <option value="">select collection…</option>
                  )}
                  {collections.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.documentCount})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="bryl-btn--ghost bryl-btn"
                  disabled={!selectedCollection}
                  onClick={() => setNewDocOpen((v) => !v)}
                >
                  {newDocOpen ? "cancel" : "+ new document"}
                </button>
              </div>

              {newDocOpen && (
                <form onSubmit={createDocument} className="mb-4 flex flex-col gap-2">
                  <textarea
                    className="bryl-input w-full"
                    rows={3}
                    value={newDocJson}
                    onChange={(e) => setNewDocJson(e.target.value)}
                    placeholder='{"name": "ada", "role": "admin"}'
                  />
                  <button
                    type="submit"
                    className="bryl-btn self-start"
                    disabled={creatingDoc || !newDocJson.trim()}
                  >
                    {creatingDoc ? "writing on-chain…" : "write document"}
                  </button>
                </form>
              )}

              {!selectedCollection ? (
                <p className="rounded-lg border border-dashed border-[var(--gray-300)] p-5 text-sm text-[var(--gray-500)]">
                  create a collection first, then add documents to it
                </p>
              ) : docsLoading || !loaded ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="skeleton block h-8" />
                  ))}
                </div>
              ) : documents.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--gray-300)] p-5 text-sm text-[var(--gray-500)]">
                  no documents in <b>{selectedCollection}</b> yet — write the
                  first one above
                </p>
              ) : (
                <table className="bryl-table">
                  <thead>
                    <tr>
                      <th className="w-14">id</th>
                      <th>data</th>
                      <th className="w-36">updated</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <>
                        <tr
                          key={doc.id}
                          className="cursor-pointer transition-colors duration-150 hover:bg-[var(--gray-50)]"
                          onClick={() =>
                            setExpandedId(expandedId === doc.id ? null : doc.id)
                          }
                          title="click to expand"
                        >
                          <td className="tabular-nums">{doc.id}</td>
                          <td className="max-w-[22rem] truncate">
                            {doc.locked ? "🔒 encrypted" : JSON.stringify(doc.data)}
                          </td>
                          <td className="whitespace-nowrap">
                            {fmtTime(doc.updatedAt)}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="bryl-mono text-xs text-[var(--gray-400)] transition-colors duration-150 hover:text-red-600"
                              disabled={busyDocId === doc.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteDocument(doc);
                              }}
                              title="delete document"
                            >
                              {busyDocId === doc.id ? "…" : "✕"}
                            </button>
                          </td>
                        </tr>
                        {expandedId === doc.id && (
                          <tr key={`${doc.id}-expanded`}>
                            <td colSpan={4} className="bg-[var(--gray-50)]">
                              <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-5">
                                {JSON.stringify(doc.data, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ---- network ---- */}
          {tab === "network" && (
            <div key="network" className="bryl-panel bryl-card overflow-x-auto bg-white p-4">
              <table className="bryl-table">
                <tbody>
                  {(
                    [
                      ["network", net?.name?.toLowerCase() ?? "—"],
                      ["chain id", net ? String(net.chainId) : "—"],
                      ["current block", net ? net.blockNumber.toLocaleString() : "—"],
                      ["rpc url", net?.rpcUrl ?? settings?.rpcUrl ?? "—"],
                      ["wallet", status?.wallet?.address ?? "not configured"],
                      [
                        "balance",
                        status?.wallet
                          ? `${Number(status.wallet.balance).toFixed(4)} ${net?.currency ?? ""}`
                          : "—",
                      ],
                    ] as [string, string][]
                  ).map(([label, value]) => (
                    <tr key={label}>
                      <td className="w-36 uppercase tracking-wider text-[var(--gray-400)]">
                        {label}
                      </td>
                      <td className="break-all text-[var(--ink)]">{value}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="w-36 uppercase tracking-wider text-[var(--gray-400)]">
                      type
                    </td>
                    <td>
                      {net === undefined || net === null ? (
                        "—"
                      ) : net.testnet === null ? (
                        <span className="bryl-pill">custom chain</span>
                      ) : net.testnet ? (
                        <span className="bryl-pill">testnet</span>
                      ) : (
                        <span className="bryl-pill bryl-pill-inverted">
                          mainnet — real funds
                        </span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="w-36 uppercase tracking-wider text-[var(--gray-400)]">
                      explorer
                    </td>
                    <td>
                      {net?.explorerUrl ? (
                        <a
                          href={net.explorerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="bryl-link"
                        >
                          {net.explorerUrl.replace("https://", "")} ↗
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                  {net?.testnet && net.faucetUrl && (
                    <tr>
                      <td className="w-36 uppercase tracking-wider text-[var(--gray-400)]">
                        faucet
                      </td>
                      <td>
                        <a
                          href={net.faucetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="bryl-link"
                        >
                          get test {net.currency} ↗
                        </a>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <p className="bryl-label mt-3">
                switch chains from the dropdown in the header — the toggle picks
                testnet or mainnet presets
              </p>
            </div>
          )}

          {/* ---- settings ---- */}
          {tab === "settings" && (
            <div key="settings" className="bryl-panel bryl-card bg-white p-4">
              <form onSubmit={saveSettings} className="flex flex-col gap-4">
                <div>
                  <label className="bryl-label mb-1.5 block">
                    wallet private key
                  </label>
                  <input
                    type="password"
                    autoComplete="off"
                    className="bryl-input w-full"
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    placeholder={
                      settings?.privateKeySet
                        ? "•••••••• (already set — type to replace)"
                        : "0x…"
                    }
                  />
                </div>
                <div>
                  <label className="bryl-label mb-1.5 block">
                    contract address
                  </label>
                  <input
                    className="bryl-input w-full"
                    value={contractAddress}
                    onChange={(e) => setContractAddress(e.target.value)}
                    placeholder="0x… (or deploy below)"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    className="bryl-btn"
                    disabled={savingSettings || deploying || !settings}
                  >
                    {savingSettings ? "saving…" : "save"}
                  </button>
                  <button
                    type="button"
                    className={`bryl-btn ${confirmDeploy ? "" : "bryl-btn--ghost"}`}
                    disabled={deploying || savingSettings || !settings}
                    onClick={deploy}
                  >
                    {deploying
                      ? "deploying…"
                      : confirmDeploy
                        ? `confirm deploy on ${net?.name?.toLowerCase() ?? "this chain"}`
                        : "deploy database.sol"}
                  </button>
                  {confirmDeploy && !deploying && (
                    <button
                      type="button"
                      className="bryl-link bg-transparent text-xs"
                      onClick={() => setConfirmDeploy(false)}
                    >
                      cancel
                    </button>
                  )}
                  <span className="bryl-pill">
                    encryption {status?.encryption.enabled ? "on" : "off"}
                  </span>
                </div>
                <p className="bryl-label">
                  settings persist to .env.local and apply immediately — the key
                  never leaves this machine
                </p>
              </form>
            </div>
          )}
        </section>

        <footer className="bryl-label mt-10 border-t border-[var(--gray-200)] pt-4">
          blockchaindb — self-hosted · one contract · any evm network
        </footer>
      </div>
    </div>
  );
}
