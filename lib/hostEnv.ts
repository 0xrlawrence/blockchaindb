/**
 * Hosting-provider environment management — the escape hatch for bootstrap
 * secrets on read-only hosts.
 *
 * Dashboard-managed settings live on-chain (settingsStore), but the chain
 * bootstrap secrets (RPC_URL, PRIVATE_KEY, CONTRACT_ADDRESS, ENCRYPTION_KEY)
 * can't — they're what everything else is derived from. On Vercel/Netlify
 * they normally have to be typed into the hosting dashboard. Setting ONE
 * token env var opts into managing them from the deployed StarBoarDB
 * dashboard instead:
 *
 *   Vercel:  VERCEL_TOKEN   (vercel.com → Account Settings → Tokens)
 *            optional VERCEL_TEAM_ID (team projects),
 *            optional VERCEL_DEPLOY_HOOK_URL (auto-redeploy on save)
 *   Netlify: NETLIFY_AUTH_TOKEN (User settings → Applications → PAT)
 *
 * Saves PATCH the project's real env vars via the provider API and apply to
 * the running instance immediately (process.env); a redeploy propagates them
 * to future cold starts — automatic on Netlify (builds API) and via the
 * optional deploy hook on Vercel.
 */

export type Host = "vercel" | "netlify" | "local";

export function detectHost(): Host {
  if (process.env.VERCEL) return "vercel";
  if (process.env.NETLIFY) return "netlify";
  return "local";
}

function vercelProjectRef(): string | null {
  const id = (process.env.VERCEL_PROJECT_ID ?? "").trim();
  if (id) return id;
  // project name from the system env var myproject.vercel.app
  const url = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim();
  if (url.endsWith(".vercel.app")) return url.slice(0, -".vercel.app".length);
  return null;
}

function netlifySiteId(): string | null {
  return (
    (process.env.SITE_ID ?? "").trim() ||
    (process.env.NETLIFY_SITE_ID ?? "").trim() ||
    null
  );
}

/** True when the provider API is usable from this instance. */
export function canManageHostEnv(): boolean {
  const host = detectHost();
  if (host === "vercel")
    return Boolean((process.env.VERCEL_TOKEN ?? "").trim() && vercelProjectRef());
  if (host === "netlify")
    return Boolean((process.env.NETLIFY_AUTH_TOKEN ?? "").trim() && netlifySiteId());
  return false;
}

export interface HostEnvResult {
  redeployed: boolean;
  note: string;
}

async function vercelUpsert(vars: Record<string, string>): Promise<HostEnvResult> {
  const token = (process.env.VERCEL_TOKEN ?? "").trim();
  const ref = vercelProjectRef();
  if (!token || !ref) throw new Error("VERCEL_TOKEN / project not configured.");
  const teamId = (process.env.VERCEL_TEAM_ID ?? "").trim();
  const query = `?upsert=true${teamId ? `&teamId=${encodeURIComponent(teamId)}` : ""}`;

  for (const [key, value] of Object.entries(vars)) {
    const res = await fetch(
      `https://api.vercel.com/v10/projects/${encodeURIComponent(ref)}/env${query}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key,
          value,
          type: "encrypted",
          target: ["production", "preview"],
        }),
      }
    );
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`Vercel env update for ${key} failed (${res.status}): ${detail}`);
    }
  }

  const hook = (process.env.VERCEL_DEPLOY_HOOK_URL ?? "").trim();
  if (hook) {
    const res = await fetch(hook, { method: "POST" }).catch(() => null);
    if (res?.ok) {
      return {
        redeployed: true,
        note: "saved to the Vercel environment — redeploy triggered, cold starts pick it up in a minute",
      };
    }
  }
  return {
    redeployed: false,
    note: "saved to the Vercel environment and applied to this instance — redeploy (or set VERCEL_DEPLOY_HOOK_URL) so future cold starts get it too",
  };
}

async function netlifyUpsert(vars: Record<string, string>): Promise<HostEnvResult> {
  const token = (process.env.NETLIFY_AUTH_TOKEN ?? "").trim();
  const siteId = netlifySiteId();
  if (!token || !siteId) throw new Error("NETLIFY_AUTH_TOKEN / SITE_ID not configured.");
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const acctRes = await fetch("https://api.netlify.com/api/v1/accounts", { headers });
  if (!acctRes.ok) throw new Error(`Netlify account lookup failed (${acctRes.status}).`);
  const accounts = (await acctRes.json()) as { id?: string }[];
  const accountId = accounts?.[0]?.id;
  if (!accountId) throw new Error("No Netlify account visible to this token.");

  for (const [key, value] of Object.entries(vars)) {
    // update-if-exists, else create
    const patch = await fetch(
      `https://api.netlify.com/api/v1/accounts/${accountId}/env/${encodeURIComponent(key)}?site_id=${encodeURIComponent(siteId)}`,
      { method: "PATCH", headers, body: JSON.stringify({ context: "all", value }) }
    );
    if (!patch.ok) {
      const post = await fetch(
        `https://api.netlify.com/api/v1/accounts/${accountId}/env?site_id=${encodeURIComponent(siteId)}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify([
            { key, scopes: ["builds", "functions", "runtime"], values: [{ context: "all", value }] },
          ]),
        }
      );
      if (!post.ok) {
        const detail = (await post.text().catch(() => "")).slice(0, 300);
        throw new Error(`Netlify env update for ${key} failed (${post.status}): ${detail}`);
      }
    }
  }

  const build = await fetch(
    `https://api.netlify.com/api/v1/sites/${encodeURIComponent(siteId)}/builds`,
    { method: "POST", headers, body: "{}" }
  ).catch(() => null);
  if (build?.ok) {
    return {
      redeployed: true,
      note: "saved to the Netlify environment — rebuild triggered, live in a minute",
    };
  }
  return {
    redeployed: false,
    note: "saved to the Netlify environment and applied to this instance — trigger a deploy so future cold starts get it too",
  };
}

/** Upsert env vars via the provider API. Values also apply to the running
 *  instance immediately via process.env (done by the caller). */
export async function upsertHostEnv(
  vars: Record<string, string>
): Promise<HostEnvResult> {
  const host = detectHost();
  if (host === "vercel") return vercelUpsert(vars);
  if (host === "netlify") return netlifyUpsert(vars);
  throw new Error("No hosting-provider API available on this host.");
}

/** One-line instruction for enabling dashboard management on this host. */
export function hostEnvHint(): string {
  const host = detectHost();
  if (host === "vercel")
    return "add a VERCEL_TOKEN environment variable (vercel.com → Account Settings → Tokens; plus VERCEL_TEAM_ID for team projects) and redeploy once — after that these fields save right here";
  if (host === "netlify")
    return "add a NETLIFY_AUTH_TOKEN environment variable (Netlify → User settings → Applications → Personal access tokens) and redeploy once — after that these fields save right here";
  return "set them as environment variables on your host";
}
