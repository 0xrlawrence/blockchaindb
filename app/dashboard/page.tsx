"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { NETWORKS, findByRpcUrl } from "@/lib/networks";
import { looseParse, coerceScalar } from "@/lib/looseJson";
import type {
  CollectionInfo,
  DocumentRecord,
  StatusResponse,
} from "@/lib/types";

type Tab = "collections" | "documents" | "network" | "settings";
type Side = "testnet" | "mainnet";
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
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [encKeyInput, setEncKeyInput] = useState("");
  const [savingEncKey, setSavingEncKey] = useState(false);
  const [showKeyHelp, setShowKeyHelp] = useState(false);
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
    if (!sideTouched && s?.network?.testnet === false) setSide("mainnet");
    const first = cols.find((c) => c.documentCount > 0) ?? cols[0];
    if (first) {
      setSelectedCollection(first.name);
      await loadDocuments(first.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadStatus, loadSettings, loadCollections, loadDocuments, sideTouched]);

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
  const currentPreset = useMemo(
    () => (settings ? findByRpcUrl(settings.rpcUrl) : undefined),
    [settings]
  );
  const sideNetworks = NETWORKS.filter((n) =>
    side === "testnet" ? n.testnet : !n.testnet
  );

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
      setMsg({ kind: "ok", text: "dashboard password created — this browser stays unlocked" });
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

  const setVisibility = async (visibility: "public" | "private") => {
    if (!settings || settings.dataVisibility === visibility) return;
    setSavingVisibility(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataVisibility: visibility }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      await Promise.all([loadSettings(), loadStatus()]);
      setMsg({
        kind: "ok",
        text:
          visibility === "private"
            ? "private — new documents are encrypted before they go on-chain"
            : "public — new documents go on-chain as readable plaintext",
      });
    } catch (err) {
      setMsg({
        kind: "error",
        text: err instanceof Error ? err.message : "save failed",
      });
    } finally {
      setSavingVisibility(false);
    }
  };

  const saveEncKey = async (key: string) => {
    setSavingEncKey(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encryptionKey: key }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      setEncKeyInput("");
      await Promise.all([loadSettings(), loadStatus()]);
      setMsg({
        kind: "ok",
        text: key
          ? "custom encryption key saved — keep a copy somewhere safe"
          : "custom key removed — back to the wallet-derived key",
      });
    } catch (err) {
      setMsg({
        kind: "error",
        text: err instanceof Error ? err.message : "save failed",
      });
    } finally {
      setSavingEncKey(false);
    }
  };

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
      const body = await readJson(res);
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
      const body = await readJson(res);
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

  const passwordDone = auth?.passwordSet ?? false;
  const connectionDone = Boolean(
    status?.configured.rpc &&
      status?.configured.wallet &&
      status?.configured.contract
  );
  const encryptionOn = status?.encryption.enabled ?? false;
  const visibility = settings?.dataVisibility ?? "private";
  const visibilityDone = settings
    ? visibility === "public" || encryptionOn
    : false;
  const onboardingNeeded =
    loaded && auth && status && settings
      ? !(passwordDone && connectionDone && visibilityDone)
      : false;

  const contractReady = status?.configured.contract ?? false;
  const walletReady = status?.configured.wallet ?? false;
  // Where can dashboard-managed settings (including the password) actually be
  // saved? A writable host, a provider token, or a deployed contract (on-chain
  // store). On a read-only host with none of those, the password has nowhere
  // to persist until the database is deployed — so gate it rather than error.
  const canPersistSettings = settings
    ? settings.hostWritable || settings.hostEnvManaged || contractReady
    : true;
  const passwordBlocked = !passwordDone && !canPersistSettings;
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
          <span className="bryl-mono mr-auto flex items-center gap-2 text-sm font-medium lowercase">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/starboar.webp"
              alt=""
              className="h-5 w-5 rounded object-contain"
            />
            starboardb
          </span>
          <div className="order-last flex w-full items-center gap-2 sm:order-none sm:w-auto">
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
              className="bryl-select min-w-0 flex-1 sm:flex-none"
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
          </div>
          {status?.contract?.address && (
            <span className="bryl-pill">
              {status.contract.address.slice(0, 6)}…
              {status.contract.address.slice(-4)}
            </span>
          )}
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

        {/* 00 — setup: smart-detected onboarding; hides once everything passes */}
        {onboardingNeeded && (
          <section className="mt-6 sm:mt-8">
            <h2
              className="bryl-section-header bryl-fade-up mb-2 sm:mb-3"
              style={fade(2)}
            >
              00 — setup
            </h2>
            <div
              className="bryl-card bryl-fade-up divide-y divide-[var(--gray-200)] bg-white"
              style={fade(2)}
            >
              {/* a — site password */}
              <div className="p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`bryl-pill ${passwordDone ? "bryl-pill-inverted" : ""}`}
                  >
                    {passwordDone ? "✓ done" : "action needed"}
                  </span>
                  <span className="text-sm font-medium lowercase">
                    site password
                  </span>
                </div>
                {passwordDone ? (
                  <p className="bryl-label mt-2 normal-case">
                    this dashboard is password-protected — use the lock pill in
                    the header to sign out
                  </p>
                ) : passwordBlocked ? (
                  <>
                    <p className="bryl-label mt-2 normal-case">
                      no password detected — anyone who can reach this url can
                      read and write your database. this host is read-only, so
                      your password (and settings) save on-chain — deploy your
                      database once and the password field unlocks right here.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className={`bryl-btn ${confirmDeploy ? "" : "bryl-btn--ghost"}`}
                        disabled={deploying || !walletReady || walletNeedsGas}
                        onClick={deploy}
                      >
                        {deploying
                          ? "deploying…"
                          : confirmDeploy
                            ? `confirm — deploy on ${net?.name?.toLowerCase() ?? "this chain"}`
                            : "deploy database"}
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
                    {!walletReady && (
                      <p className="bryl-label mt-2 normal-case">
                        set your wallet private key first — the chain connection
                        step below.
                      </p>
                    )}
                    {walletNeedsGas && (
                      <p className="bryl-label mt-2 normal-case">
                        wallet {shorten(status?.wallet?.address)} has no gas to
                        pay for the deploy
                        {net?.testnet && net.faucetUrl ? (
                          <>
                            {" — get free test "}
                            {net.currency}{" from the "}
                            <a
                              href={net.faucetUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="bryl-link"
                            >
                              faucet ↗
                            </a>
                            {", then reload"}
                          </>
                        ) : (
                          " — fund it, then reload"
                        )}
                      </p>
                    )}
                    {msg && (
                      <p
                        className={`bryl-mono mt-2 text-xs ${
                          msg.kind === "ok"
                            ? "text-[var(--gray-500)]"
                            : "text-red-600"
                        }`}
                      >
                        {msg.kind === "ok" ? "✓" : "✕"} {msg.text}
                      </p>
                    )}
                    <p className="bryl-label mt-2 normal-case">
                      prefer environment variables? set{" "}
                      <code className="bryl-mono">DASHBOARD_PASSWORD</code>{" "}
                      directly, or add a{" "}
                      <code className="bryl-mono">
                        {settings?.host === "netlify"
                          ? "NETLIFY_AUTH_TOKEN"
                          : "VERCEL_TOKEN"}
                      </code>{" "}
                      to manage every field from this dashboard — then redeploy.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="bryl-label mt-2 normal-case">
                      no password detected — anyone who can reach this url can
                      read and write your database. create one now.
                    </p>
                    <form
                      onSubmit={createPassword}
                      className="mt-3 flex flex-wrap gap-2"
                    >
                      <input
                        type="password"
                        autoComplete="new-password"
                        className="bryl-input min-w-0 flex-1"
                        placeholder="password (min 8 chars)"
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                      />
                      <input
                        type="password"
                        autoComplete="new-password"
                        className="bryl-input min-w-0 flex-1"
                        placeholder="repeat password"
                        value={newPw2}
                        onChange={(e) => setNewPw2(e.target.value)}
                      />
                      <button
                        type="submit"
                        className="bryl-btn"
                        disabled={authBusy || newPw.length < 8}
                      >
                        {authBusy ? "saving…" : "create password"}
                      </button>
                    </form>
                    {authMsg && (
                      <p className="bryl-mono mt-2 text-xs text-red-600">
                        ✕ {authMsg}
                      </p>
                    )}
                    {settings && !settings.hostWritable && (
                      <p className="bryl-label mt-2 normal-case">
                        this host is read-only — the password is stored on-chain
                        (encrypted). alternatively set{" "}
                        <code className="bryl-mono">DASHBOARD_PASSWORD</code> as
                        a hosting environment variable.
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* b — connection */}
              <div className="p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`bryl-pill ${connectionDone ? "bryl-pill-inverted" : ""}`}
                  >
                    {connectionDone ? "✓ done" : "action needed"}
                  </span>
                  <span className="text-sm font-medium lowercase">
                    chain connection
                  </span>
                </div>
                {connectionDone ? (
                  <p className="bryl-label mt-2 normal-case">
                    rpc, wallet and contract are configured
                  </p>
                ) : walletReady && !contractReady ? (
                  // wallet is set, only the contract is missing → deploy inline
                  <>
                    <p className="bryl-label mt-2 normal-case">
                      wallet connected on{" "}
                      {net?.name?.toLowerCase() ?? "the default network"} — now
                      deploy your database (one-time, costs a little gas).
                      switch chains anytime from the network dropdown up top.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className={`bryl-btn ${confirmDeploy ? "" : "bryl-btn--ghost"}`}
                        disabled={deploying || walletNeedsGas}
                        onClick={deploy}
                      >
                        {deploying
                          ? "deploying…"
                          : confirmDeploy
                            ? `confirm — deploy on ${net?.name?.toLowerCase() ?? "this chain"}`
                            : "deploy database"}
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
                        onClick={() => setTab("settings")}
                      >
                        or paste an existing address
                      </button>
                    </div>
                    {walletNeedsGas && (
                      <p className="bryl-label mt-2 normal-case">
                        wallet {shorten(status?.wallet?.address)} has no gas
                        {net?.testnet && net.faucetUrl ? (
                          <>
                            {" — get free test "}
                            {net.currency}
                            {" from the "}
                            <a
                              href={net.faucetUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="bryl-link"
                            >
                              faucet ↗
                            </a>
                            {", then reload"}
                          </>
                        ) : (
                          " — fund it, then reload"
                        )}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="bryl-label mt-2 normal-case">
                      missing:{" "}
                      {[
                        !status?.configured.rpc && "rpc url",
                        !status?.configured.wallet &&
                          "wallet private key (set it as a hosting env var)",
                        !status?.configured.contract && "contract (deploy it)",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <button
                      type="button"
                      className="bryl-btn bryl-btn--ghost mt-3"
                      onClick={() => setTab("settings")}
                    >
                      open settings
                    </button>
                  </>
                )}
              </div>

              {/* c — data visibility */}
              <div className="p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`bryl-pill ${visibilityDone ? "bryl-pill-inverted" : ""}`}
                  >
                    {visibilityDone ? "✓ done" : "choose"}
                  </span>
                  <span className="text-sm font-medium lowercase">
                    data visibility
                  </span>
                </div>
                <p className="bryl-label mt-2 normal-case">
                  how should your documents live on the blockchain?
                </p>
                <div className="bryl-tabs mt-3" role="group" aria-label="data visibility">
                  <button
                    type="button"
                    className="bryl-tab"
                    data-active={visibility === "private"}
                    disabled={savingVisibility}
                    onClick={() => setVisibility("private")}
                  >
                    private — encrypted
                  </button>
                  <button
                    type="button"
                    className="bryl-tab"
                    data-active={visibility === "public"}
                    disabled={savingVisibility}
                    onClick={() => setVisibility("public")}
                  >
                    public — plaintext
                  </button>
                </div>
                {visibility === "public" ? (
                  <p className="bryl-label mt-2 normal-case">
                    anyone can read on-chain data — don't store secrets in
                    public mode
                  </p>
                ) : (
                  <>
                    {status && !status.configured.wallet && (
                      <p className="bryl-label mt-2 normal-case">
                        private mode encrypts with a key derived from your
                        wallet private key — finish the chain connection step
                        to enable it
                      </p>
                    )}
                    <button
                      type="button"
                      className="bryl-link mt-2 block bg-transparent text-xs"
                      onClick={() => setShowKeyHelp((v) => !v)}
                    >
                      {showKeyHelp
                        ? "hide the key tutorial"
                        : "how to create your own encryption key"}
                    </button>
                    {showKeyHelp && (
                      <div className="mt-2 rounded-lg border border-dashed border-[var(--gray-300)] p-3">
                        <p className="bryl-label normal-case">
                          by default the encryption key is derived from your
                          wallet private key. to bring your own key instead:
                        </p>
                        <ol className="bryl-label mt-2 list-decimal space-y-1 pl-4 normal-case">
                          <li>
                            in a terminal, generate 32 random bytes:{" "}
                            <code className="bryl-mono">
                              openssl rand -hex 32
                            </code>
                          </li>
                          <li>
                            or{" "}
                            <button
                              type="button"
                              className="bryl-link bg-transparent"
                              onClick={() => setEncKeyInput(generateKeyHex())}
                            >
                              generate one in this browser
                            </button>
                          </li>
                          <li>
                            paste it below and save — then keep a copy
                            somewhere safe. without the key, encrypted
                            documents can never be read again.
                          </li>
                        </ol>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <input
                            className="bryl-input bryl-mono min-w-0 flex-1"
                            value={encKeyInput}
                            onChange={(e) => setEncKeyInput(e.target.value)}
                            placeholder="paste or generate a key (min 16 chars)"
                          />
                          <button
                            type="button"
                            className="bryl-btn"
                            disabled={
                              savingEncKey || encKeyInput.trim().length < 16
                            }
                            onClick={() => saveEncKey(encKeyInput.trim())}
                          >
                            {savingEncKey ? "saving…" : "save key"}
                          </button>
                        </div>
                        {settings?.encryptionKeySet && (
                          <p className="bryl-label mt-2 normal-case">
                            ✓ custom key active ·{" "}
                            <button
                              type="button"
                              className="bryl-link bg-transparent"
                              onClick={() => saveEncKey("")}
                            >
                              switch back to the wallet-derived key
                            </button>
                          </p>
                        )}
                        <p className="bryl-label mt-2 normal-case">
                          note: changing the key locks documents encrypted
                          with the previous key until it's restored.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
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
                switch chains from the dropdown in the header — the toggle picks
                testnet or mainnet presets
              </p>
            </div>
          )}

          {/* ---- settings ---- */}
          {tab === "settings" && (
            <div key="settings" className="bryl-panel bryl-card bg-white p-3 sm:p-4">
              <form onSubmit={saveSettings} className="flex flex-col gap-4">
                {settings && !settings.hostWritable && (
                  <p className="bryl-label rounded-lg border border-dashed border-[var(--gray-300)] p-3 normal-case">
                    {settings.hostEnvManaged ? (
                      <>
                        read-only host with a {settings.host} api token —
                        wallet key, rpc url and contract address save straight
                        to your {settings.host} environment from here (cold
                        starts pick them up after the automatic redeploy).
                        password, allowed domains, data visibility, api key and
                        the encryption key save on-chain.
                      </>
                    ) : settings.host === "vercel" ? (
                      <>
                        read-only host — password, allowed domains, data
                        visibility, api key and the encryption key already save
                        on-chain from here. only the wallet key, rpc url and
                        contract address need env vars — add a{" "}
                        <b>VERCEL_TOKEN</b> (vercel.com → account settings →
                        tokens; plus <b>VERCEL_TEAM_ID</b> for team projects and{" "}
                        <b>VERCEL_DEPLOY_HOOK_URL</b> for auto-redeploys) to edit
                        those here too, then redeploy once.
                      </>
                    ) : settings.host === "netlify" ? (
                      <>
                        read-only host — password, allowed domains, data
                        visibility, api key and the encryption key already save
                        on-chain from here. only the wallet key, rpc url and
                        contract address need env vars — add a{" "}
                        <b>NETLIFY_AUTH_TOKEN</b> (netlify → user settings →
                        applications → personal access tokens) to edit those
                        here too, then redeploy once.
                      </>
                    ) : (
                      <>
                        read-only host — password, allowed domains, data
                        visibility, api key and the encryption key save
                        on-chain from here. the wallet key, rpc url and contract
                        address must be set as environment variables on your
                        host.
                      </>
                    )}
                  </p>
                )}
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
                <div>
                  <label className="bryl-label mb-1.5 block">
                    data visibility
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="bryl-tabs" role="group" aria-label="data visibility">
                      <button
                        type="button"
                        className="bryl-tab"
                        data-active={settings?.dataVisibility !== "public"}
                        disabled={savingVisibility}
                        onClick={() => setVisibility("private")}
                      >
                        private — encrypted
                      </button>
                      <button
                        type="button"
                        className="bryl-tab"
                        data-active={settings?.dataVisibility === "public"}
                        disabled={savingVisibility}
                        onClick={() => setVisibility("public")}
                      >
                        public — plaintext
                      </button>
                    </div>
                    {settings?.encryptionKeySet && (
                      <span className="bryl-pill">custom key</span>
                    )}
                  </div>
                  {settings?.dataVisibility !== "public" && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input
                        className="bryl-input bryl-mono min-w-0 flex-1"
                        value={encKeyInput}
                        onChange={(e) => setEncKeyInput(e.target.value)}
                        placeholder={
                          settings?.encryptionKeySet
                            ? "custom key set — paste to replace"
                            : "custom encryption key (optional — wallet-derived by default)"
                        }
                      />
                      <button
                        type="button"
                        className="bryl-btn bryl-btn--ghost"
                        disabled={savingEncKey || encKeyInput.trim().length < 16}
                        onClick={() => saveEncKey(encKeyInput.trim())}
                      >
                        {savingEncKey ? "saving…" : "save key"}
                      </button>
                    </div>
                  )}
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

        <footer className="bryl-label mt-8 border-t border-[var(--gray-200)] pt-4 sm:mt-10">
          starboardb — self-hosted · one contract · any evm network
        </footer>
      </div>
    </div>
  );
}
