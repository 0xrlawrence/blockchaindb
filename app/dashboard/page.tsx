"use client";

import { useCallback, useEffect, useState } from "react";
import { looseParse, coerceScalar } from "@/lib/looseJson";
import type {
  CollectionInfo,
  DocumentRecord,
  StatusResponse,
} from "@/lib/types";

type Tab = "collections" | "documents" | "network" | "settings";
type DocMode = "fields" | "raw";
interface Field {
  key: string;
  value: string;
}

interface SettingsState {
  rpcUrl: string;
  contractAddress: string;
  privateKeySet: boolean;
  allowedOrigins: string;
  dataVisibility: "public" | "private";
  encryptionKeySet: boolean;
  hostWritable: boolean;
  host: "vercel" | "netlify" | "local";
  hostEnvManaged: boolean;
}

interface AuthState {
  passwordSet: boolean;
  authed: boolean;
}

/** 32 random bytes as hex — a browser-side `openssl rand -hex 32`. */
function generateKeyHex(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
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

/** Parse a response body without throwing on non-JSON error pages (a 500
 *  from a serverless host can be HTML/plaintext). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return { error: `unexpected ${res.status} response from the server` };
  }
}

export default function DashboardPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<{
    kind: "ok" | "error";
    text: string;
    txHash?: string | null;
  } | null>(null);

  // workspace
  const [tab, setTab] = useState<Tab>("documents");

  // documents
  const [selectedCollection, setSelectedCollection] = useState("");
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [docMode, setDocMode] = useState<DocMode>("fields");
  const [fields, setFields] = useState<Field[]>([
    { key: "", value: "" },
    { key: "", value: "" },
  ]);
  const [newDocJson, setNewDocJson] = useState("");
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [busyDocId, setBusyDocId] = useState<number | null>(null);

  // collections
  const [newColName, setNewColName] = useState("");
  const [creatingCol, setCreatingCol] = useState(false);

  // settings
  const [privateKey, setPrivateKey] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [allowedOrigins, setAllowedOrigins] = useState("");

  // site access + onboarding
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [unlockPw, setUnlockPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [setupOpen, setSetupOpen] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [refreshingBal, setRefreshingBal] = useState(false);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500);
    } catch {
      // clipboard blocked — the address is still visible to select manually
    }
  };

  // Re-check the wallet balance after the user tops up (no full reload).
  const refreshBalance = async () => {
    setRefreshingBal(true);
    try {
      await loadStatus();
    } finally {
      setRefreshingBal(false);
    }
  };
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
      allowedOrigins: s.allowedOrigins ?? "",
      dataVisibility: s.dataVisibility === "public" ? "public" : "private",
      encryptionKeySet: Boolean(s.encryptionKeySet),
      hostWritable: s.hostWritable !== false,
      host: s.host === "vercel" || s.host === "netlify" ? s.host : "local",
      hostEnvManaged: Boolean(s.hostEnvManaged),
    };
    setSettings(next);
    setContractAddress(next.contractAddress);
    setAllowedOrigins(next.allowedOrigins.split(",").filter(Boolean).join("\n"));
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

  const loadAll = useCallback(async () => {
    const [s, , cols] = await Promise.all([
      loadStatus(),
      loadSettings(),
      loadCollections(),
    ]);
    void s;
    const first = cols.find((c) => c.documentCount > 0) ?? cols[0];
    if (first) {
      setSelectedCollection(first.name);
      await loadDocuments(first.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadStatus, loadSettings, loadCollections, loadDocuments]);

  useEffect(() => {
    (async () => {
      try {
        // Smart detection first: is this instance password-protected, and is
        // this browser unlocked? A locked dashboard loads nothing else.
        const a: AuthState = await fetch("/api/auth").then((r) => r.json());
        setAuth(a);
        if (a.passwordSet && !a.authed) return;
        await loadAll();
      } catch {
        setAuth({ passwordSet: false, authed: true });
      } finally {
        setLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connected = status?.connected ?? false;

  /* ---- site access + onboarding actions ---- */

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    setAuthMsg(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", password: unlockPw }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error ?? "Login failed");
      setUnlockPw("");
      setAuth({ passwordSet: true, authed: true });
      setLoaded(false);
      await loadAll();
      setLoaded(true);
    } catch (err) {
      setAuthMsg(err instanceof Error ? err.message : "login failed");
    } finally {
      setAuthBusy(false);
    }
  };

  const createPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== newPw2) {
      setAuthMsg("passwords don't match");
      return;
    }
    setAuthBusy(true);
    setAuthMsg(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup", password: newPw }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error ?? "Setup failed");
      setNewPw("");
      setNewPw2("");
      setAuth({ passwordSet: true, authed: true });
      setMsg({
        kind: "ok",
        text: "dashboard password created — this browser stays unlocked",
        txHash: body.txHash,
      });
    } catch (err) {
      setAuthMsg(err instanceof Error ? err.message : "setup failed");
    } finally {
      setAuthBusy(false);
    }
  };

  const lockDashboard = async () => {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    }).catch(() => {});
    setAuth((a) => (a ? { ...a, authed: false } : a));
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
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error ?? "Transaction failed");
      setNewColName("");
      const cols = await loadCollections();
      loadStatus();
      if (!selectedCollection && cols[0]) setSelectedCollection(cols[0].name);
      setMsg({
        kind: "ok",
        text: "collection created on-chain",
        txHash: body.txHash,
      });
    } catch (err) {
      setMsg({
        kind: "error",
        text: err instanceof Error ? err.message : "transaction failed",
      });
    } finally {
      setCreatingCol(false);
    }
  };

  // Build the document payload from whichever editor mode is active.
  const buildDocData = (): { ok: true; data: unknown } | { ok: false; error: string } => {
    if (docMode === "fields") {
      const named = fields.filter((f) => f.key.trim());
      if (named.length === 0) {
        return { ok: false, error: "add at least one field" };
      }
      const obj: Record<string, unknown> = {};
      for (const f of named) obj[f.key.trim()] = coerceScalar(f.value);
      return { ok: true, data: obj };
    }
    const parsed = looseParse(newDocJson);
    return parsed.ok
      ? { ok: true, data: parsed.value }
      : { ok: false, error: parsed.error };
  };

  const createDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCollection) return;
    const built = buildDocData();
    if (!built.ok) {
      setMsg({ kind: "error", text: built.error });
      return;
    }
    const data = built.data;
    setCreatingDoc(true);
    setMsg(null);
    try {
      const res = await fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: selectedCollection, data }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error ?? "Transaction failed");
      setNewDocJson("");
      setFields([
        { key: "", value: "" },
        { key: "", value: "" },
      ]);
      setNewDocOpen(false);
      await Promise.all([
        loadDocuments(selectedCollection),
        loadCollections(),
        loadStatus(),
      ]);
      setMsg({
        kind: "ok",
        text: "document written on-chain",
        txHash: body.txHash,
      });
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
      const body = await readJson(res);
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
        allowedOrigins,
      };
      if (privateKey.trim()) payload.privateKey = privateKey.trim();
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      setPrivateKey("");
      await Promise.all([loadSettings(), loadStatus()]);
      setMsg({
        kind: "ok",
        text: typeof body.note === "string" && body.note ? body.note : "saved",
        txHash: body.txHash,
      });
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
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error ?? "Deploy failed");
      setContractAddress(body.address);
      await Promise.all([loadSettings(), loadStatus(), loadCollections()]);
      setMsg({
        kind: "ok",
        text: `deployed ${shorten(body.address)} on ${String(body.network ?? "chain").toLowerCase()}`,
        txHash: body.txHash,
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
  const txnUrl = (hash?: string | null) =>
    hash && net?.explorerUrl ? `${net.explorerUrl}/tx/${hash}` : null;

  // Success/error line with an optional "view txn ↗" link to the explorer.
  const renderMsg = (className = "") => {
    if (!msg) return null;
    const url = txnUrl(msg.txHash);
    return (
      <p
        className={`bryl-mono text-xs ${className} ${
          msg.kind === "ok" ? "text-[var(--gray-500)]" : "text-red-600"
        }`}
      >
        {msg.kind === "ok" ? "✓" : "✕"} {msg.text}
        {url && (
          <>
            {" · "}
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="bryl-link"
            >
              view txn ↗
            </a>
          </>
        )}
      </p>
    );
  };
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

  const passwordDone = auth?.passwordSet ?? false;
  const connectionDone = Boolean(
    status?.configured.rpc &&
      status?.configured.wallet &&
      status?.configured.contract
  );
  // Setup is a two-step wizard: (1) deploy your database, (2) set a password.
  const onboardingNeeded =
    loaded && auth && status && settings
      ? !(passwordDone && connectionDone)
      : false;
  const setupStep = !connectionDone ? 1 : 2; // deploy → password

  const contractReady = status?.configured.contract ?? false;
  const walletReady = status?.configured.wallet ?? false;
  const walletNeedsGas = Boolean(
    walletReady &&
      status?.wallet &&
      Number(status.wallet.balance) === 0
  );

  // Locked instance: nothing renders until the owner enters the password.
  if (auth?.passwordSet && !auth.authed) {
    return (
      <div className="bryl relative flex min-h-screen items-center justify-center px-4">
        <div aria-hidden className="bryl-dotbg" />
        <form
          onSubmit={unlock}
          className="bryl-card bryl-fade-up relative z-[1] flex w-full max-w-xs flex-col gap-3 bg-white p-6"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/starboar.webp"
            alt=""
            className="h-10 w-10 rounded-lg object-contain"
          />
          <div>
            <p className="bryl-mono text-sm font-medium lowercase">starboardb</p>
            <p className="bryl-label mt-1">dashboard is locked</p>
          </div>
          <input
            type="password"
            autoFocus
            className="bryl-input w-full"
            value={unlockPw}
            onChange={(e) => setUnlockPw(e.target.value)}
            placeholder="password"
          />
          <button
            type="submit"
            className="bryl-btn"
            disabled={authBusy || !unlockPw}
          >
            {authBusy ? "unlocking…" : "unlock"}
          </button>
          {authMsg && (
            <p className="bryl-mono text-xs text-red-600">✕ {authMsg}</p>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="bryl relative min-h-screen">
      <div aria-hidden className="bryl-dotbg" />
      <div className="relative z-[1] mx-auto max-w-[56rem] px-3 py-4 sm:px-6 sm:py-6">
        {/* header: wordmark + live pill; chain controls drop to their own
            full-width row on mobile */}
        <header
          className="bryl-fade-up flex flex-wrap items-center gap-2"
          style={fade(0)}
        >
          <span className="bryl-mono mr-auto flex items-center gap-2.5 text-lg font-semibold lowercase sm:text-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/starboar.webp"
              alt=""
              className="h-9 w-9 rounded-lg object-contain sm:h-10 sm:w-10"
            />
            starboardb
          </span>
          <span className="bryl-pill">
            {(net?.name ?? "polygon amoy").toLowerCase()} · testnet
          </span>
          {status?.contract?.address && (
            <button
              type="button"
              className="bryl-pill cursor-pointer"
              onClick={() => copy(status.contract!.address)}
              title="copy contract address"
            >
              {copied === status.contract.address ? (
                <span className="bryl-copied">copied ✓</span>
              ) : (
                <>
                  {status.contract.address.slice(0, 6)}…
                  {status.contract.address.slice(-4)}
                </>
              )}
            </button>
          )}
          <span className={`bryl-pill ${connected ? "bryl-pill-inverted" : ""}`}>
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                connected
                  ? "dot-pulse bg-white"
                  : "border border-[var(--gray-400)]"
              }`}
            />
            {status === null ? "connecting" : connected ? "live" : "offline"}
          </span>
          {auth?.passwordSet && (
            <button
              type="button"
              onClick={lockDashboard}
              className="bryl-pill cursor-pointer"
              title="lock the dashboard (sign out)"
            >
              lock
            </button>
          )}
        </header>

        {/* title */}
        <div className="bryl-fade-up mt-5 sm:mt-8" style={fade(1)}>
          <h1 className="bryl-title text-[1.6rem] sm:text-[2.5rem]">
            dashboard
          </h1>
          <p className="bryl-label mt-1.5 sm:mt-2">
            the blockchain is your database
          </p>
        </div>

        {/* 00 — setup: floating step-by-step wizard (deploy → password) */}
        {onboardingNeeded && setupOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div
              aria-hidden
              className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
              onClick={() => setSetupOpen(false)}
            />
            <div className="bryl-card bryl-fade-up relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto bg-white p-5 sm:p-6">
              {/* header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/starboar.webp"
                    alt=""
                    className="h-8 w-8 rounded-lg object-contain"
                  />
                  <div>
                    <p className="bryl-mono text-sm font-medium lowercase">
                      setup
                    </p>
                    <p className="bryl-label mt-0.5">step {setupStep} of 2</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="bryl-mono text-sm text-[var(--gray-400)] hover:text-[var(--ink)]"
                  onClick={() => setSetupOpen(false)}
                  title="close (you can finish setup later)"
                >
                  ✕
                </button>
              </div>

              {/* step progress */}
              <div className="mt-4 flex gap-1.5">
                {[1, 2].map((n) => (
                  <span
                    key={n}
                    className={`h-1 flex-1 rounded-full ${
                      n <= setupStep ? "bg-[var(--ink)]" : "bg-[var(--gray-200)]"
                    }`}
                  />
                ))}
              </div>

              {/* NO FUNDS — always on top when the wallet can't pay for deploy */}
              {walletNeedsGas && !connectionDone && (
                <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-50 p-3">
                  <p className="bryl-mono text-xs font-medium uppercase tracking-wider text-amber-700">
                    ⚠ no funds detected
                  </p>
                  <p className="bryl-label mt-1.5 normal-case text-amber-800">
                    this wallet needs {net?.currency ?? "gas"} to deploy.
                    {net?.testnet && net.faucetUrl ? (
                      <>
                        {" send test "}
                        {net.currency}
                        {" to the address below — get it free from the "}
                        <a
                          href={net.faucetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="bryl-link"
                        >
                          faucet ↗
                        </a>
                        {", then refresh below."}
                      </>
                    ) : (
                      " send funds to the address below, then refresh."
                    )}
                  </p>
                  {status?.wallet?.address && (
                    <div className="mt-2 flex items-stretch gap-2">
                      <code className="bryl-mono min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded border border-amber-500/30 bg-white px-2 py-1.5 text-xs text-[var(--ink)]">
                        {status.wallet.address}
                      </code>
                      <button
                        type="button"
                        className="bryl-btn shrink-0"
                        onClick={() => copy(status.wallet!.address)}
                        title="copy wallet address"
                      >
                        {copied === status.wallet.address ? "copied ✓" : "copy"}
                      </button>
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      className="bryl-btn bryl-btn--ghost"
                      onClick={refreshBalance}
                      disabled={refreshingBal}
                    >
                      {refreshingBal ? (
                        <>
                          <span className="bryl-spin mr-1.5" />
                          checking…
                        </>
                      ) : (
                        "↻ i've topped up — check balance"
                      )}
                    </button>
                    <span className="bryl-label normal-case">
                      balance:{" "}
                      {status?.wallet
                        ? `${Number(status.wallet.balance).toFixed(4)} ${net?.currency ?? ""}`
                        : "—"}
                    </span>
                  </div>
                </div>
              )}

              {/* STEP 1 — deploy your database */}
              {setupStep === 1 && (
                <div className="mt-4">
                  <p className="text-sm font-medium lowercase">
                    deploy your database
                  </p>
                  {walletReady ? (
                    <>
                      <p className="bryl-label mt-2 normal-case">
                        wallet connected on{" "}
                        {net?.name?.toLowerCase() ?? "the default network"} —
                        deploy your database once (costs a little gas).
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className={`bryl-btn ${confirmDeploy ? "" : "bryl-btn--ghost"}`}
                          disabled={deploying || walletNeedsGas}
                          onClick={deploy}
                        >
                          {deploying ? (
                            <>
                              <span className="bryl-spin mr-1.5" />
                              deploying…
                            </>
                          ) : confirmDeploy ? (
                            `confirm — deploy on ${net?.name?.toLowerCase() ?? "this chain"}`
                          ) : (
                            "deploy database"
                          )}
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
                        <button
                          type="button"
                          className="bryl-link bg-transparent text-xs"
                          onClick={() => {
                            setSetupOpen(false);
                            setTab("settings");
                          }}
                        >
                          or paste an existing contract
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="bryl-label mt-2 normal-case">
                      no wallet key detected — set{" "}
                      <code className="bryl-mono">PRIVATE_KEY</code> as a hosting
                      environment variable and redeploy.
                    </p>
                  )}
                  {renderMsg("mt-3")}
                </div>
              )}

              {/* STEP 2 — set a site password */}
              {setupStep === 2 && (
                <div className="mt-4">
                  <p className="text-sm font-medium lowercase">
                    set a site password
                  </p>
                  <p className="bryl-label mt-2 normal-case">
                    no password detected — anyone who can reach this url can read
                    and write your database. create one now.
                  </p>
                  <form
                    onSubmit={createPassword}
                    className="mt-3 flex flex-col gap-2"
                  >
                    <input
                      type="password"
                      autoComplete="new-password"
                      autoFocus
                      className="bryl-input w-full"
                      placeholder="password (min 8 chars)"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                    />
                    <input
                      type="password"
                      autoComplete="new-password"
                      className="bryl-input w-full"
                      placeholder="repeat password"
                      value={newPw2}
                      onChange={(e) => setNewPw2(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="bryl-btn self-start"
                      disabled={authBusy || newPw.length < 8}
                    >
                      {authBusy ? (
                        <>
                          <span className="bryl-spin mr-1.5" />
                          saving…
                        </>
                      ) : (
                        "create password"
                      )}
                    </button>
                  </form>
                  {authMsg && (
                    <p className="bryl-mono mt-2 text-xs text-red-600">
                      ✕ {authMsg}
                    </p>
                  )}
                  {settings && !settings.hostWritable && (
                    <p className="bryl-label mt-2 normal-case">
                      stored on-chain (encrypted), scoped to this deployment. or
                      set <code className="bryl-mono">DASHBOARD_PASSWORD</code> as
                      a hosting environment variable.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 01 — status strip: every cell jumps to its tab below */}
        <section className="mt-6 sm:mt-8">
          <h2
            className="bryl-section-header bryl-fade-up mb-2 sm:mb-3"
            style={fade(2)}
          >
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
        <section className="mt-6 sm:mt-8">
          <div
            className="bryl-fade-up mb-2 flex flex-wrap items-center justify-between gap-2 sm:mb-3"
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

          {renderMsg("mb-3")}

          {/* ---- collections ---- */}
          {tab === "collections" && (
            <div key="collections" className="bryl-panel bryl-card bg-white p-3 sm:p-4">
              <form onSubmit={createCollection} className="mb-3 flex gap-2 sm:mb-4">
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
                  {creatingCol ? (
                    <>
                      <span className="bryl-spin mr-1.5" />
                      creating…
                    </>
                  ) : (
                    "create"
                  )}
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
            <div key="documents" className="bryl-panel bryl-card bg-white p-3 sm:p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2 sm:mb-4">
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
                <form
                  onSubmit={createDocument}
                  className="mb-4 flex flex-col gap-2 rounded-lg border border-[var(--gray-200)] bg-[var(--gray-50)] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="bryl-tabs" role="group" aria-label="editor mode">
                      <button
                        type="button"
                        className="bryl-tab"
                        data-active={docMode === "fields"}
                        onClick={() => setDocMode("fields")}
                      >
                        fields
                      </button>
                      <button
                        type="button"
                        className="bryl-tab"
                        data-active={docMode === "raw"}
                        onClick={() => setDocMode("raw")}
                      >
                        json
                      </button>
                    </div>
                    <span className="bryl-label">
                      {docMode === "fields"
                        ? "plain fields — no quotes needed"
                        : "paste json (loose ok)"}
                    </span>
                  </div>

                  {docMode === "fields" ? (
                    <>
                      {fields.map((f, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            className="bryl-input w-1/3 min-w-0"
                            placeholder="field"
                            value={f.key}
                            onChange={(e) =>
                              setFields((fs) =>
                                fs.map((x, j) =>
                                  j === i ? { ...x, key: e.target.value } : x
                                )
                              )
                            }
                          />
                          <input
                            className="bryl-input min-w-0 flex-1"
                            placeholder="value"
                            value={f.value}
                            onChange={(e) =>
                              setFields((fs) =>
                                fs.map((x, j) =>
                                  j === i ? { ...x, value: e.target.value } : x
                                )
                              )
                            }
                          />
                          <button
                            type="button"
                            className="bryl-mono px-1 text-xs text-[var(--gray-400)] hover:text-red-600"
                            onClick={() =>
                              setFields((fs) =>
                                fs.length > 1
                                  ? fs.filter((_, j) => j !== i)
                                  : [{ key: "", value: "" }]
                              )
                            }
                            title="remove field"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="bryl-link self-start bg-transparent text-xs"
                        onClick={() =>
                          setFields((fs) => [...fs, { key: "", value: "" }])
                        }
                      >
                        + add field
                      </button>
                    </>
                  ) : (
                    <>
                      <textarea
                        className="bryl-input bryl-mono w-full"
                        rows={4}
                        value={newDocJson}
                        onChange={(e) => setNewDocJson(e.target.value)}
                        placeholder={
                          "name: ada\nrole: admin\nage: 30\n\n— or —  {\"name\": \"ada\", \"age\": 30}"
                        }
                      />
                      {newDocJson.trim() &&
                        (() => {
                          const p = looseParse(newDocJson);
                          return p.ok ? (
                            <p className="bryl-mono truncate text-xs text-[var(--gray-500)]">
                              → {JSON.stringify(p.value)}
                            </p>
                          ) : (
                            <p className="bryl-mono text-xs text-red-600">
                              ✕ {p.error}
                            </p>
                          );
                        })()}
                    </>
                  )}

                  <button
                    type="submit"
                    className="bryl-btn self-start"
                    disabled={creatingDoc}
                  >
                    {creatingDoc ? (
                      <>
                        <span className="bryl-spin mr-1.5" />
                        writing on-chain…
                      </>
                    ) : (
                      "write document"
                    )}
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
                <>
                  {/* mobile: compact card list — the table is desktop-only */}
                  <div className="sm:hidden">
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="bryl-doc-card"
                        onClick={() =>
                          setExpandedId(expandedId === doc.id ? null : doc.id)
                        }
                      >
                        <div className="bryl-mono flex items-center gap-2 text-[0.6875rem]">
                          <span className="tabular-nums text-[var(--gray-400)]">
                            #{doc.id}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[var(--gray-500)]">
                            {fmtTime(doc.updatedAt)}
                          </span>
                          <button
                            type="button"
                            className="bryl-mono px-1 text-xs text-[var(--gray-400)]"
                            disabled={busyDocId === doc.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteDocument(doc);
                            }}
                            title="delete document"
                          >
                            {busyDocId === doc.id ? "…" : "✕"}
                          </button>
                        </div>
                        {expandedId === doc.id ? (
                          <pre className="bryl-mono mt-1.5 overflow-x-auto whitespace-pre-wrap rounded bg-[var(--gray-50)] p-2 text-[0.6875rem] leading-5">
                            {JSON.stringify(doc.data, null, 2)}
                          </pre>
                        ) : (
                          <p className="bryl-mono mt-1 truncate text-[0.6875rem] text-[var(--ink)]">
                            {doc.locked
                              ? "🔒 encrypted"
                              : JSON.stringify(doc.data)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  <table className="bryl-table hidden sm:table">
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
                </>
              )}
            </div>
          )}

          {/* ---- network ---- */}
          {tab === "network" && (
            <div key="network" className="bryl-panel bryl-card overflow-x-auto bg-white p-3 sm:p-4">
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
                      <td className="w-24 uppercase tracking-wider text-[var(--gray-400)] sm:w-36">
                        {label}
                      </td>
                      <td className="break-all text-[var(--ink)]">{value}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="w-24 uppercase tracking-wider text-[var(--gray-400)] sm:w-36">
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
                    <td className="w-24 uppercase tracking-wider text-[var(--gray-400)] sm:w-36">
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
                      <td className="w-24 uppercase tracking-wider text-[var(--gray-400)] sm:w-36">
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
                network is fixed to polygon amoy testnet for this deployment
              </p>
            </div>
          )}

          {/* ---- settings ---- */}
          {tab === "settings" && (
            <div key="settings" className="bryl-panel bryl-card bg-white p-3 sm:p-4">
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
                <div>
                  <label className="bryl-label mb-1.5 block">
                    allowed domains
                  </label>
                  <textarea
                    className="bryl-input w-full"
                    rows={3}
                    value={allowedOrigins}
                    onChange={(e) => setAllowedOrigins(e.target.value)}
                    placeholder={
                      "https://yourapp.com\nhttps://*.yourbusiness.ph"
                    }
                  />
                  <p className="bryl-label mt-1.5 normal-case">
                    one origin per line — only these sites may call the data
                    api from a browser (like firebase authorized domains).
                    empty allows any site. servers and terminals without a
                    listed origin must send the api key.
                  </p>
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
                    {deploying ? (
                      <>
                        <span className="bryl-spin mr-1.5" />
                        deploying…
                      </>
                    ) : confirmDeploy ? (
                      `confirm deploy on ${net?.name?.toLowerCase() ?? "this chain"}`
                    ) : (
                      "deploy database.sol"
                    )}
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
                </div>
                {renderMsg()}
              </form>
            </div>
          )}
        </section>

        <footer className="bryl-label mt-8 border-t border-[var(--gray-200)] pt-4 sm:mt-10">
          starboardb — self-hosted · one contract · any evm network
        </footer>
      </div>
    </div>
  );
}
