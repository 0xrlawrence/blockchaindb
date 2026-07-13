"use client";

import { useCallback, useEffect, useState } from "react";

interface Endpoint {
  method: string;
  path: string;
  body?: string;
}

const ENDPOINTS: Endpoint[] = [
  { method: "GET", path: "/api/health" },
  { method: "GET", path: "/api/collections" },
  { method: "POST", path: "/api/collections", body: `{ "name": "guestbook" }` },
  {
    method: "POST",
    path: "/api/create",
    body: `{ "collection": "guestbook", "data": { "name": "Ada", "message": "hi" } }`,
  },
  { method: "GET", path: "/api/list?collection=guestbook" },
  { method: "GET", path: "/api/get?collection=guestbook&id=1" },
  {
    method: "POST",
    path: "/api/update",
    body: `{ "collection": "guestbook", "id": 1, "data": { "message": "edited" } }`,
  },
  {
    method: "POST",
    path: "/api/delete",
    body: `{ "collection": "guestbook", "id": 1 }`,
  },
];

export default function DevelopersPage() {
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState("");

  const loadKey = useCallback(async () => {
    try {
      const res = await fetch("/api/apikey");
      if (!res.ok) return;
      const body = await res.json();
      setApiKey(body.apiKey ?? null);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setBaseUrl(window.location.origin);
    setRepoUrl(localStorage.getItem("bdb_repo") || "");
    loadKey();
  }, [loadKey]);

  const saveRepo = (url: string) => {
    setRepoUrl(url);
    localStorage.setItem("bdb_repo", url);
  };

  const repo = repoUrl.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const repoValid = /^https?:\/\/(github|gitlab)\.com\/.+\/.+/.test(repo);
  const vercelUrl = repoValid
    ? `https://vercel.com/new/clone?repository-url=${encodeURIComponent(
        repo
      )}&env=PRIVATE_KEY&envDescription=${encodeURIComponent(
        "Wallet private key that signs writes — use a dedicated key. Network, contract, API key and password are all configured from the dashboard after deploying."
      )}&project-name=starboardb&repository-name=starboardb`
    : "";
  const netlifyUrl = repoValid
    ? `https://app.netlify.com/start/deploy?repository=${encodeURIComponent(repo)}`
    : "";

  const generate = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/apikey", { method: "POST" });
      const body = await res.json();
      setApiKey(body.apiKey ?? null);
      setRevealed(true);
    } finally {
      setBusy(false);
    }
  };

  const clearKey = async () => {
    if (!confirm("Remove the API key? The API becomes open to anyone who can reach this server.")) return;
    setBusy(true);
    try {
      await fetch("/api/apikey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      setApiKey(null);
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
  };

  const keyForExample = apiKey ?? "YOUR_API_KEY";
  const curlExample = `curl -X POST ${baseUrl}/api/create \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${keyForExample}" \\
  -d '{"collection":"guestbook","data":{"name":"Ada","message":"hi"}}'`;

  const jsExample = `const BASE = "${baseUrl}";
const KEY  = "${keyForExample}";

async function db(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}

// create
await db("/api/create", {
  method: "POST",
  body: JSON.stringify({ collection: "guestbook", data: { name: "Ada", message: "hi" } }),
});
// read
const { documents } = await db("/api/list?collection=guestbook");`;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">API</h2>
        <p className="mt-0.5 text-sm text-ink-faint">
          Use StarBoarDB as the CRUD backend for any website or app — call
          these endpoints from your frontend or server.
        </p>
      </div>

      {/* Base URL */}
      <section className="rounded-xl border border-base-border bg-base-panel p-5">
        <h3 className="text-sm font-semibold">Base URL</h3>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 rounded-lg bg-base px-3 py-2 font-mono text-sm">
            {baseUrl || "…"}
          </code>
          <button
            onClick={() => copy(baseUrl, "base")}
            className="rounded-lg border border-base-border px-3 py-2 text-xs text-ink-soft hover:text-ink"
          >
            {copied === "base" ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          Locally that&rsquo;s <code>http://localhost:3000</code>. Deploy this app
          (Vercel, a VPS, anywhere Next.js runs) and use that public URL instead.
        </p>
      </section>

      {/* Deploy your own */}
      <section className="rounded-xl border border-base-border bg-base-panel p-5">
        <h3 className="text-sm font-semibold">Deploy your own instance</h3>
        <p className="mt-0.5 text-xs text-ink-faint">
          Push this project to GitHub, paste the repo URL, and deploy in one
          click. Set <code>RPC_URL</code>, <code>PRIVATE_KEY</code>,{" "}
          <code>CONTRACT_ADDRESS</code> and (optional) <code>API_KEY</code> when
          the host prompts you.
        </p>

        <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-ink-faint">
          Your Git repo URL
        </label>
        <input
          value={repoUrl}
          onChange={(e) => saveRepo(e.target.value)}
          placeholder="https://github.com/your-username/blockchaindb"
          className="mt-1.5 w-full rounded-lg border border-base-border bg-base px-3 py-2 font-mono text-[13px] outline-none focus:border-brand/60"
        />

        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={repoValid ? vercelUrl : undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!repoValid}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity ${
              repoValid
                ? "bg-black text-white hover:opacity-90"
                : "pointer-events-none bg-black/40 text-white/40"
            }`}
          >
            <span className="text-base leading-none">▲</span> Deploy to Vercel
          </a>
          <a
            href={repoValid ? netlifyUrl : undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!repoValid}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity ${
              repoValid
                ? "bg-[#00AD9F] text-white hover:opacity-90"
                : "pointer-events-none bg-[#00AD9F]/30 text-white/50"
            }`}
          >
            ◈ Deploy to Netlify
          </a>
          {!repoValid && (
            <span className="self-center text-xs text-ink-faint">
              Enter a GitHub/GitLab repo URL to enable the buttons.
            </span>
          )}
        </div>

        <div className="mt-4 rounded-lg border border-sky-500/25 bg-sky-500/5 px-3 py-2.5 text-xs text-ink-soft">
          <p className="font-medium text-sky-300">
            Heads-up: serverless hosts have a read-only filesystem
          </p>
          <p className="mt-1">
            On Vercel/Netlify the app can&rsquo;t write <code>.env.local</code>,
            so the Settings page, the one-click Deploy button, and the API-key
            generator won&rsquo;t save there. Configure everything through the
            host&rsquo;s <strong>environment variables</strong> instead — the API
            and dashboard read from them and work fully. (Deploy your contract
            locally first, then set <code>CONTRACT_ADDRESS</code>.)
          </p>
        </div>
      </section>

      {/* API key */}
      <section className="rounded-xl border border-base-border bg-base-panel p-5">
        <h3 className="text-sm font-semibold">API key</h3>
        {apiKey ? (
          <>
            <p className="mt-0.5 text-xs text-ink-faint">
              Send this on every external request as an <code>x-api-key</code>{" "}
              header. The dashboard itself doesn&rsquo;t need it.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg bg-base px-3 py-2 font-mono text-sm">
                {revealed ? apiKey : "•".repeat(Math.min(apiKey.length, 40))}
              </code>
              <button
                onClick={() => setRevealed((v) => !v)}
                className="rounded-lg border border-base-border px-3 py-2 text-xs text-ink-soft hover:text-ink"
              >
                {revealed ? "Hide" : "Reveal"}
              </button>
              <button
                onClick={() => copy(apiKey, "key")}
                className="rounded-lg border border-base-border px-3 py-2 text-xs text-ink-soft hover:text-ink"
              >
                {copied === "key" ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={generate}
                disabled={busy}
                className="rounded-lg border border-base-border px-3 py-1.5 text-xs text-ink-soft hover:text-ink disabled:opacity-40"
              >
                Rotate
              </button>
              <button
                onClick={clearKey}
                disabled={busy}
                className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-40"
              >
                Remove key (make open)
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              No API key set — the API is <strong>open</strong>: anyone who can
              reach this server can read and write. Fine for local testing;
              generate a key before you expose it publicly.
            </div>
            <button
              onClick={generate}
              disabled={busy}
              className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-base hover:bg-brand-dim disabled:opacity-40"
            >
              {busy ? "Generating…" : "Generate API key"}
            </button>
          </>
        )}
      </section>

      {/* Endpoints */}
      <section className="rounded-xl border border-base-border bg-base-panel">
        <div className="border-b border-base-border px-5 py-3">
          <h3 className="text-sm font-semibold">Endpoints</h3>
        </div>
        <ul className="divide-y divide-base-border">
          {ENDPOINTS.map((e) => (
            <li key={e.method + e.path} className="px-5 py-3">
              <div className="flex items-center gap-3">
                <span
                  className={`w-12 rounded px-2 py-0.5 text-center text-[11px] font-semibold ${
                    e.method === "GET"
                      ? "bg-sky-500/10 text-sky-300"
                      : "bg-brand-faint text-brand"
                  }`}
                >
                  {e.method}
                </span>
                <code className="font-mono text-[13px]">{e.path}</code>
              </div>
              {e.body && (
                <code className="mt-1.5 block pl-[3.75rem] font-mono text-xs text-ink-faint">
                  {e.body}
                </code>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Examples */}
      <section className="rounded-xl border border-base-border bg-base-panel p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Quick start — cURL</h3>
          <button
            onClick={() => copy(curlExample, "curl")}
            className="rounded-lg border border-base-border px-3 py-1 text-xs text-ink-soft hover:text-ink"
          >
            {copied === "curl" ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="overflow-x-auto rounded-lg bg-base p-3 font-mono text-xs text-ink">
          {curlExample}
        </pre>
      </section>

      <section className="rounded-xl border border-base-border bg-base-panel p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Quick start — JavaScript</h3>
          <button
            onClick={() => copy(jsExample, "js")}
            className="rounded-lg border border-base-border px-3 py-1 text-xs text-ink-soft hover:text-ink"
          >
            {copied === "js" ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="overflow-x-auto rounded-lg bg-base p-3 font-mono text-xs leading-relaxed text-ink">
          {jsExample}
        </pre>
        <p className="mt-3 text-xs text-ink-faint">
          A complete, ready-to-open example site lives at{" "}
          <code>examples/basic-crud-site.html</code> in the repo — a guestbook
          with full create / read / update / delete against these endpoints.
        </p>
      </section>
    </div>
  );
}
