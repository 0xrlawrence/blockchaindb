"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { looseParse, coerceScalar } from "@/lib/looseJson";
import type { CollectionInfo, DocumentRecord, StatusResponse } from "@/lib/types";

interface AuthState {
  passwordSet: boolean;
  authed: boolean;
}

interface Field {
  key: string;
  value: string;
}

type DocMode = "fields" | "raw";

type Editor =
  | { mode: "closed" }
  | { mode: "new" }
  | { mode: "edit"; doc: DocumentRecord };

interface LogEntry {
  id: number;
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  status: number | null;
  ok: boolean;
  response: unknown;
  ms: number;
  ts: number;
}

const fade = (i: number) => ({ "--fade-delay": i }) as React.CSSProperties;

/** Parse a response body without throwing on non-JSON error pages. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return { error: `unexpected ${res.status} response from the server` };
  }
}

function docToFields(data: unknown): Field[] {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length) {
      return entries.map(([key, value]) => ({
        key,
        value: typeof value === "string" ? value : JSON.stringify(value),
      }));
    }
  }
  return [{ key: "", value: "" }];
}

/**
 * /showcase — a live console for the data API: every button here fires a
 * real request against the endpoints an external site would call (GET/POST
 * /api/create|list|get|update|delete|collections), with the exact method,
 * headers and body echoed into a request/response log below. Password-gated
 * like /dashboard, since writes here spend real gas from the owner's wallet.
 */
export default function ShowcasePage() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [unlockPw, setUnlockPw] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMsg, setAuthMsg] = useState<string | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const apiKeyRef = useRef<string | null>(null);

  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [selectedCollection, setSelectedCollection] = useState("");
  const [newColName, setNewColName] = useState("");
  const [creatingCol, setCreatingCol] = useState(false);

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [busyDocId, setBusyDocId] = useState<number | null>(null);

  const [editor, setEditor] = useState<Editor>({ mode: "closed" });
  const [docMode, setDocMode] = useState<DocMode>("fields");
  const [fields, setFields] = useState<Field[]>([{ key: "", value: "" }]);
  const [rawJson, setRawJson] = useState("");
  const [savingDoc, setSavingDoc] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [getId, setGetId] = useState("");
  const [getBusy, setGetBusy] = useState(false);
  const [getResult, setGetResult] = useState<DocumentRecord | null>(null);
  const [getError, setGetError] = useState<string | null>(null);

  const [log, setLog] = useState<LogEntry[]>([]);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  const nextLogId = useRef(1);
  const logEndRef = useRef<HTMLDivElement>(null);

  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500);
    } catch {
      // clipboard blocked — text is still visible to select manually
    }
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  // Every call here is logged verbatim — same endpoint, headers and body an
  // external integrator would send. Reads apiKey from a ref, not state, so
  // the very first calls right after boot never miss the header to a stale
  // closure.
  const call = useCallback(
    async (method: string, path: string, body?: unknown) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKeyRef.current) headers["x-api-key"] = apiKeyRef.current;
      const id = nextLogId.current++;
      const t0 = performance.now();
      let statusCode: number | null = null;
      let ok = false;
      let respBody: unknown = null;
      try {
        const res = await fetch(path, {
          method,
          headers,
          body: method !== "GET" && body !== undefined ? JSON.stringify(body) : undefined,
        });
        statusCode = res.status;
        ok = res.ok;
        respBody = await readJson(res);
      } catch (err) {
        respBody = { error: err instanceof Error ? err.message : "network error" };
      }
      const ms = Math.round(performance.now() - t0);
      setLog((l) =>
        [
          ...l,
          { id, method, path, headers, body, status: statusCode, ok, response: respBody, ms, ts: Date.now() },
        ].slice(-50)
      );
      return { ok, status: statusCode, body: respBody as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    },
    []
  );

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [log.length]);

  const refreshCollections = useCallback(async () => {
    const r = await call("GET", "/api/collections");
    if (r.ok) setCollections(r.body.collections ?? []);
    return r;
  }, [call]);

  const refreshDocuments = useCallback(
    async (col: string) => {
      if (!col) {
        setDocuments([]);
        return;
      }
      setDocsLoading(true);
      const r = await call("GET", `/api/list?collection=${encodeURIComponent(col)}`);
      if (r.ok) setDocuments(r.body.documents ?? []);
      setDocsLoading(false);
    },
    [call]
  );

  const bootstrap = useCallback(async () => {
    const [s, k] = await Promise.all([
      fetch("/api/status").then((r) => r.json()).catch(() => null),
      fetch("/api/apikey").then((r) => r.json()).catch(() => ({ apiKey: null })),
    ]);
    setStatus(s);
    const key = k?.apiKey ?? null;
    apiKeyRef.current = key;
    setApiKey(key);
    const r = await refreshCollections();
    if (r.ok) {
      const cols: CollectionInfo[] = r.body.collections ?? [];
      if (cols[0]) {
        setSelectedCollection(cols[0].name);
        await refreshDocuments(cols[0].name);
      }
    }
  }, [refreshCollections, refreshDocuments]);

  useEffect(() => {
    (async () => {
      try {
        const a: AuthState = await fetch("/api/auth").then((r) => r.json());
        setAuth(a);
        if (a.passwordSet && !a.authed) return;
        await bootstrap();
      } catch {
        setAuth({ passwordSet: false, authed: true });
      } finally {
        setLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      await bootstrap();
      setLoaded(true);
    } catch (err) {
      setAuthMsg(err instanceof Error ? err.message : "login failed");
    } finally {
      setAuthBusy(false);
    }
  };

  const createCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newColName.trim();
    if (!name) return;
    setCreatingCol(true);
    const r = await call("POST", "/api/collections", { name });
    setCreatingCol(false);
    if (r.ok) {
      setNewColName("");
      await refreshCollections();
      setSelectedCollection(name);
      await refreshDocuments(name);
    }
  };

  const openNew = () => {
    setFields([{ key: "", value: "" }]);
    setRawJson("");
    setDocMode("fields");
    setFormError(null);
    setEditor({ mode: "new" });
  };

  const openEdit = (doc: DocumentRecord) => {
    setFields(docToFields(doc.data));
    setRawJson(JSON.stringify(doc.data, null, 2));
    setDocMode("fields");
    setFormError(null);
    setEditor({ mode: "edit", doc });
  };

  const buildDocData = (): { ok: true; data: unknown } | { ok: false; error: string } => {
    if (docMode === "fields") {
      const named = fields.filter((f) => f.key.trim());
      if (named.length === 0) return { ok: false, error: "add at least one field" };
      const obj: Record<string, unknown> = {};
      for (const f of named) obj[f.key.trim()] = coerceScalar(f.value);
      return { ok: true, data: obj };
    }
    const parsed = looseParse(rawJson);
    return parsed.ok ? { ok: true, data: parsed.value } : { ok: false, error: parsed.error };
  };

  const submitDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCollection || editor.mode === "closed") return;
    const built = buildDocData();
    if (!built.ok) {
      setFormError(built.error);
      return;
    }
    setSavingDoc(true);
    setFormError(null);
    const r =
      editor.mode === "edit"
        ? await call("POST", "/api/update", {
            collection: selectedCollection,
            id: editor.doc.id,
            data: built.data,
          })
        : await call("POST", "/api/create", { collection: selectedCollection, data: built.data });
    setSavingDoc(false);
    if (!r.ok) {
      setFormError(r.body?.error ?? "request failed");
      return;
    }
    setEditor({ mode: "closed" });
    await Promise.all([refreshDocuments(selectedCollection), refreshCollections()]);
  };

  const deleteDoc = async (doc: DocumentRecord) => {
    setBusyDocId(doc.id);
    const r = await call("POST", "/api/delete", { collection: selectedCollection, id: doc.id });
    setBusyDocId(null);
    if (r.ok) await Promise.all([refreshDocuments(selectedCollection), refreshCollections()]);
  };

  const fetchById = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = Number(getId);
    if (!selectedCollection || !Number.isInteger(id) || id < 1) return;
    setGetBusy(true);
    setGetError(null);
    setGetResult(null);
    const r = await call(
      "GET",
      `/api/get?collection=${encodeURIComponent(selectedCollection)}&id=${id}`
    );
    setGetBusy(false);
    if (r.ok) setGetResult(r.body.document);
    else setGetError(r.body?.error ?? "not found");
  };

  const keyForExample = apiKey ?? "YOUR_API_KEY";
  const col = selectedCollection || "users";
  const snippets: { label: string; method: string; code: string }[] = [
    {
      label: "list",
      method: "GET",
      code: `curl "${baseUrl}/api/list?collection=${col}" \\\n  -H "x-api-key: ${keyForExample}"`,
    },
    {
      label: "get one",
      method: "GET",
      code: `curl "${baseUrl}/api/get?collection=${col}&id=1" \\\n  -H "x-api-key: ${keyForExample}"`,
    },
    {
      label: "create",
      method: "POST",
      code: `curl -X POST ${baseUrl}/api/create \\\n  -H "Content-Type: application/json" -H "x-api-key: ${keyForExample}" \\\n  -d '{"collection":"${col}","data":{"name":"ada"}}'`,
    },
    {
      label: "update",
      method: "POST",
      code: `curl -X POST ${baseUrl}/api/update \\\n  -H "Content-Type: application/json" -H "x-api-key: ${keyForExample}" \\\n  -d '{"collection":"${col}","id":1,"data":{"name":"ada v2"}}'`,
    },
    {
      label: "delete",
      method: "POST",
      code: `curl -X POST ${baseUrl}/api/delete \\\n  -H "Content-Type: application/json" -H "x-api-key: ${keyForExample}" \\\n  -d '{"collection":"${col}","id":1}'`,
    },
  ];

  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour12: false });

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
          <img src="/starboar.webp" alt="" className="h-10 w-10 rounded-lg object-contain" />
          <div>
            <p className="bryl-mono text-sm font-medium lowercase">showcase</p>
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
          <button type="submit" className="bryl-btn" disabled={authBusy || !unlockPw}>
            {authBusy ? "unlocking…" : "unlock"}
          </button>
          {authMsg && <p className="bryl-mono text-xs text-red-600">✕ {authMsg}</p>}
        </form>
      </div>
    );
  }

  const notReady = status && !status.configured.contract;

  return (
    <div className="bryl relative min-h-screen">
      <div aria-hidden className="bryl-dotbg" />
      <div className="relative z-[1] mx-auto max-w-[64rem] px-3 py-4 sm:px-6 sm:py-6">
        {/* header */}
        <header className="bryl-fade-up flex flex-wrap items-center gap-2" style={fade(0)}>
          <Link
            href="/dashboard"
            className="bryl-mono mr-auto flex items-center gap-2.5 text-lg font-semibold lowercase sm:text-xl"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/starboar.webp" alt="" className="h-9 w-9 rounded-lg object-contain sm:h-10 sm:w-10" />
            starboardb
          </Link>
          <Link href="/dashboard" className="bryl-pill cursor-pointer">
            ← dashboard
          </Link>
          <span className="bryl-pill">
            {(status?.network?.name ?? "polygon amoy").toLowerCase()} · testnet
          </span>
          <span className={`bryl-pill ${apiKey ? "bryl-pill-inverted" : ""}`}>
            {apiKey ? `key: ${apiKey.slice(0, 8)}…` : "api open"}
          </span>
        </header>

        {/* title */}
        <div className="bryl-fade-up mt-5 sm:mt-8" style={fade(1)}>
          <h1 className="bryl-title text-[1.6rem] sm:text-[2.5rem]">showcase</h1>
          <p className="bryl-label mt-1.5 sm:mt-2">
            every crud call your data api supports — live, against the real chain
          </p>
        </div>

        {notReady ? (
          <div className="bryl-card bryl-fade-up mt-6 bg-white p-5 sm:mt-8" style={fade(2)}>
            <p className="bryl-mono text-sm">no contract configured yet</p>
            <p className="bryl-label mt-2 normal-case">
              finish setup on the{" "}
              <Link href="/dashboard" className="bryl-link bg-transparent">
                dashboard
              </Link>{" "}
              first, then come back to try the api.
            </p>
          </div>
        ) : (
          <>
            {/* 00 — base url / key */}
            <section className="bryl-fade-up mt-6 sm:mt-8" style={fade(2)}>
              <h2 className="bryl-section-header mb-2 sm:mb-3">00 — base url</h2>
              <div className="bryl-card flex flex-wrap items-center gap-2 bg-white p-3 sm:p-4">
                <code className="bryl-mono flex-1 truncate text-xs sm:text-sm">{baseUrl}</code>
                <button type="button" className="bryl-btn--ghost bryl-btn" onClick={() => copy(baseUrl)}>
                  {copied === baseUrl ? "copied ✓" : "copy"}
                </button>
              </div>
              <p className="bryl-label mt-2 normal-case">
                {apiKey
                  ? "every call below sends x-api-key exactly like an external caller would need to."
                  : "no api key is set — the data api is open. generate one in dashboard → settings before exposing this publicly."}
              </p>
            </section>

            {/* 01 — try it */}
            <section className="bryl-fade-up mt-6 sm:mt-8" style={fade(3)}>
              <h2 className="bryl-section-header mb-2 sm:mb-3">01 — try it</h2>
              <div className="bryl-card bryl-panel bg-white p-3 sm:p-4">
                {/* collection picker */}
                <div className="mb-3 flex flex-wrap items-center gap-2 sm:mb-4">
                  {collections.length > 0 ? (
                    <select
                      className="bryl-select"
                      value={selectedCollection}
                      onChange={(e) => {
                        setSelectedCollection(e.target.value);
                        setExpandedId(null);
                        setGetResult(null);
                        refreshDocuments(e.target.value);
                      }}
                      aria-label="collection"
                    >
                      {collections.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name} ({c.documentCount})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="bryl-label normal-case">no collections yet —</span>
                  )}
                  <form onSubmit={createCollection} className="flex items-center gap-2">
                    <input
                      className="bryl-input"
                      value={newColName}
                      onChange={(e) => setNewColName(e.target.value)}
                      placeholder="new collection"
                    />
                    <button
                      type="submit"
                      className="bryl-btn--ghost bryl-btn"
                      disabled={creatingCol || !newColName.trim()}
                    >
                      {creatingCol ? (
                        <>
                          <span className="bryl-spin mr-1.5" />
                          creating…
                        </>
                      ) : (
                        "+ create"
                      )}
                    </button>
                  </form>
                  <button
                    type="button"
                    className="bryl-btn ml-auto"
                    disabled={!selectedCollection}
                    onClick={openNew}
                  >
                    + new document
                  </button>
                </div>

                {/* create/edit form */}
                {editor.mode !== "closed" && (
                  <form
                    onSubmit={submitDoc}
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
                        {editor.mode === "edit" ? `editing #${editor.doc.id}` : "new document"}
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
                                  fs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x))
                                )
                              }
                            />
                            <input
                              className="bryl-input min-w-0 flex-1"
                              placeholder="value"
                              value={f.value}
                              onChange={(e) =>
                                setFields((fs) =>
                                  fs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x))
                                )
                              }
                            />
                            <button
                              type="button"
                              className="bryl-mono px-1 text-xs text-[var(--gray-400)] hover:text-red-600"
                              onClick={() =>
                                setFields((fs) =>
                                  fs.length > 1 ? fs.filter((_, j) => j !== i) : [{ key: "", value: "" }]
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
                          onClick={() => setFields((fs) => [...fs, { key: "", value: "" }])}
                        >
                          + add field
                        </button>
                      </>
                    ) : (
                      <textarea
                        className="bryl-input bryl-mono w-full"
                        rows={5}
                        value={rawJson}
                        onChange={(e) => setRawJson(e.target.value)}
                        placeholder={'{"name": "ada", "age": 30}'}
                      />
                    )}

                    {formError && <p className="bryl-mono text-xs text-red-600">✕ {formError}</p>}

                    <div className="flex items-center gap-2">
                      <button type="submit" className="bryl-btn" disabled={savingDoc}>
                        {savingDoc ? (
                          <>
                            <span className="bryl-spin mr-1.5" />
                            {editor.mode === "edit" ? "updating…" : "creating…"}
                          </>
                        ) : editor.mode === "edit" ? (
                          "save (POST /api/update)"
                        ) : (
                          "create (POST /api/create)"
                        )}
                      </button>
                      <button
                        type="button"
                        className="bryl-mono text-xs text-[var(--gray-500)] hover:text-[var(--ink)]"
                        onClick={() => setEditor({ mode: "closed" })}
                      >
                        cancel
                      </button>
                    </div>
                  </form>
                )}

                {/* GET by id */}
                <form onSubmit={fetchById} className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="bryl-label">get one:</span>
                  <input
                    className="bryl-input w-20"
                    type="number"
                    min={1}
                    value={getId}
                    onChange={(e) => setGetId(e.target.value)}
                    placeholder="id"
                  />
                  <button
                    type="submit"
                    className="bryl-btn--ghost bryl-btn"
                    disabled={getBusy || !selectedCollection || !getId}
                  >
                    {getBusy ? "…" : "GET /api/get"}
                  </button>
                  {getResult && (
                    <code className="bryl-mono truncate text-xs text-[var(--gray-600)]">
                      → {JSON.stringify(getResult.data)}
                    </code>
                  )}
                  {getError && <span className="bryl-mono text-xs text-red-600">✕ {getError}</span>}
                </form>

                {/* documents table */}
                {!selectedCollection ? (
                  <p className="rounded-lg border border-dashed border-[var(--gray-300)] p-5 text-sm text-[var(--gray-500)]">
                    create a collection above to start adding documents
                  </p>
                ) : docsLoading || !loaded ? (
                  <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="skeleton block h-8" />
                    ))}
                  </div>
                ) : documents.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[var(--gray-300)] p-5 text-sm text-[var(--gray-500)]">
                    no documents in <b>{selectedCollection}</b> yet — create one above
                  </p>
                ) : (
                  <table className="bryl-table">
                    <thead>
                      <tr>
                        <th className="w-14">id</th>
                        <th>data</th>
                        <th className="w-36">updated</th>
                        <th className="w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((doc) => (
                        <>
                          <tr
                            key={doc.id}
                            className="cursor-pointer transition-colors duration-150 hover:bg-[var(--gray-50)]"
                            onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
                          >
                            <td className="tabular-nums">{doc.id}</td>
                            <td className="max-w-[20rem] truncate">
                              {doc.locked ? "🔒 encrypted" : JSON.stringify(doc.data)}
                            </td>
                            <td className="whitespace-nowrap">
                              {new Date(doc.updatedAt * 1000).toLocaleString([], {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </td>
                            <td className="whitespace-nowrap">
                              <button
                                type="button"
                                className="bryl-mono px-1 text-xs text-[var(--gray-400)] hover:text-[var(--ink)]"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEdit(doc);
                                }}
                                title="edit document"
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                className="bryl-mono px-1 text-xs text-[var(--gray-400)] hover:text-red-600"
                                disabled={busyDocId === doc.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteDoc(doc);
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
            </section>

            {/* 02 — request log */}
            <section className="bryl-fade-up mt-6 sm:mt-8" style={fade(4)}>
              <div className="mb-2 flex items-center justify-between sm:mb-3">
                <h2 className="bryl-section-header">02 — request log</h2>
                {log.length > 0 && (
                  <button
                    type="button"
                    className="bryl-mono text-xs text-[var(--gray-500)] hover:text-[var(--ink)]"
                    onClick={() => setLog([])}
                  >
                    clear
                  </button>
                )}
              </div>
              <div
                role="log"
                aria-label="api request log"
                className="bryl-card bryl-card--inverted bryl-mono max-h-96 overflow-y-auto p-3 text-[0.6875rem] leading-relaxed sm:text-xs"
              >
                {log.length === 0 ? (
                  <p className="text-white/35">// no requests yet — try an action above</p>
                ) : (
                  <>
                    {log.map((entry) => (
                      <div key={entry.id} className="border-b border-white/10 py-1.5 last:border-none">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 text-left"
                          onClick={() =>
                            setExpandedLogId(expandedLogId === entry.id ? null : entry.id)
                          }
                        >
                          <span className="text-white/30">{fmtTime(entry.ts)}</span>
                          <span
                            className={`w-10 shrink-0 ${
                              entry.method === "GET" ? "text-white/60" : "text-white"
                            }`}
                          >
                            {entry.method}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-white/90">{entry.path}</span>
                          <span className={entry.ok ? "text-white/60" : "text-red-400"}>
                            {entry.status ?? "err"}
                          </span>
                          <span className="w-14 shrink-0 text-right text-white/30">{entry.ms}ms</span>
                        </button>
                        {expandedLogId === entry.id && (
                          <div className="mt-1.5 space-y-1.5 pl-2 text-white/70">
                            <div>
                              <span className="text-white/40">headers </span>
                              {JSON.stringify(entry.headers)}
                            </div>
                            {entry.body !== undefined && (
                              <div>
                                <span className="text-white/40">body </span>
                                {JSON.stringify(entry.body)}
                              </div>
                            )}
                            <div>
                              <span className="text-white/40">response </span>
                              {JSON.stringify(entry.response)}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={logEndRef} />
                  </>
                )}
              </div>
            </section>

            {/* 03 — code */}
            <section className="bryl-fade-up mt-6 sm:mt-8" style={fade(5)}>
              <h2 className="bryl-section-header mb-2 sm:mb-3">03 — code</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {snippets.map((s) => (
                  <div key={s.label} className="bryl-card bg-white p-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="bryl-label">
                        {s.method} · {s.label}
                      </span>
                      <button
                        type="button"
                        className="bryl-mono text-xs text-[var(--gray-500)] hover:text-[var(--ink)]"
                        onClick={() => copy(s.code)}
                      >
                        {copied === s.code ? "copied ✓" : "copy"}
                      </button>
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all bg-[var(--gray-50)] p-2 text-[0.6875rem] leading-relaxed">
                      {s.code}
                    </pre>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <footer className="bryl-label mt-8 border-t border-[var(--gray-200)] pt-4 sm:mt-10">
          starboardb — self-hosted · one contract · any evm network
        </footer>
      </div>
    </div>
  );
}
