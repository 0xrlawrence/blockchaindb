<div align="center">
  <img src="public/starboar.webp" alt="StarBoarDB" width="96" height="96" />

  # StarBoarDB

  **A self-hosted blockchain database with a clean, single-page dashboard.**

  *The blockchain is your database.*

  [![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/0xrlawrence/blockchaindb&env=PRIVATE_KEY&envDescription=%E2%9A%A0%20BETA%20%E2%80%94%20StarBoarDB%20is%20early%20software.%20Use%20a%20dedicated%20throwaway%20wallet%20key%2C%20never%20store%20confidential%20or%20sensitive%20data%2C%20and%20use%20entirely%20at%20your%20own%20risk.%20In%20return%3A%20a%20lifetime-free%20database.%20%7C%20Enter%20the%20wallet%20private%20key%20that%20signs%20writes.%20Everything%20else%20%28network%2C%20contract%2C%20API%20key%2C%20password%29%20is%20configured%20from%20the%20dashboard%20after%20deploying.%20Default%20network%3A%20Polygon%20Amoy%20%E2%80%94%20grab%20free%20test%20POL%20from%20the%20Amoy%20faucet%20first%20%28link%20%E2%86%92%29.&envLink=https%3A//faucet.polygon.technology/&project-name=starboardb&repository-name=starboardb)

  *(replace `0xrlawrence/blockchaindb` with your own fork's URL first)*
</div>

---

Clone the repo, deploy one smart contract, open `localhost:3000`, and manage
your blockchain database from a single unified dashboard. Your data lives
inside a smart contract — collections of JSON documents with
auto-incrementing IDs — on a **real EVM network** of your choice. Default:
**Polygon Amoy** testnet; switch to any preset testnet/mainnet (or a custom
RPC) right from the dashboard. No Solidity knowledge required.

## Deploy your own

Only `PRIVATE_KEY` is asked for at deploy time. Everything else is
configured afterwards, from a floating setup wizard the dashboard shows on
first load:

1. **Deploy** — the contract deploys from your wallet (or paste an existing
   one) and its address is auto-discovered from your wallet's deployment
   nonces afterwards, so it survives restarts even where nothing can be
   persisted to disk.
2. **Set a password** — locks the dashboard and its admin endpoints. There's
   no "forgot password" flow by design — it's a decentralized database; a
   forgotten password is recovered by setting `DASHBOARD_PASSWORD` directly
   as a hosting environment variable, which always wins over the stored one.

An API key for external callers is generated later, from the dashboard's
**Settings** tab, whenever you actually need one.

### Serverless persistence

Vercel's filesystem is read-only, so the dashboard stores its own settings —
password, allowed domains, API key — **on-chain**, as an encrypted blob in a
reserved `_settings` collection (AES-256-GCM, key derived from your wallet
key). Only the three bootstrap variables plus an optional custom encryption
key need to be real hosting environment variables.

Want those bootstrap secrets editable from the deployed dashboard too? Add
one token env var and redeploy once — `VERCEL_TOKEN` (plus `VERCEL_TEAM_ID`
for team projects, and optionally `VERCEL_DEPLOY_HOOK_URL` so saves
auto-redeploy). The dashboard then writes `RPC_URL` / `PRIVATE_KEY` /
`CONTRACT_ADDRESS` / `ENCRYPTION_KEY` straight into your Vercel project
through its API.

Without that token, configure those four via Vercel's environment variables
directly instead (deploy your contract locally first with `npm run deploy`,
then set `CONTRACT_ADDRESS`) — the API and dashboard read from them and work
fully either way.

## Tech Stack

| Layer | Tech |
| --- | --- |
| Frontend | Next.js 15 · TypeScript · App Router · Tailwind CSS |
| Blockchain | Solidity · solc · ethers.js v6 |
| Storage | One smart contract (`contracts/Database.sol`) |
| Network | Polygon Amoy (default) · Ethereum, Polygon, Base, Arbitrum, OP, BNB, Avalanche (testnet + mainnet) · any custom EVM RPC |
| Package manager | npm |

## Quick Start (the 5-minute tutorial)

**Step 1 — Clone the repository.**

```bash
git clone <this-repo> && cd blockchaindb
```

**Step 2 — Install dependencies.**

```bash
npm install
```

**Step 3 — Start the app.**

```bash
npm run dev
```

Open <http://localhost:3000/dashboard> — the app connects to **Polygon
Amoy** by default, and a setup wizard walks you through the rest:

**Step 4 — Follow the wizard:**
1. Paste a **wallet private key** funded on Amoy (grab free test POL from
   the faucet link right there in the wizard), then deploy — or paste an
   existing contract address instead.
2. Create a **dashboard password**.

*(Prefer the CLI? Set `RPC_URL` + `PRIVATE_KEY` in `.env.local` and run
`npm run deploy` — it deploys and writes `CONTRACT_ADDRESS` back for you.)*

**Step 5 — Create your first collection.** e.g. `users`.

**Step 6 — Create your first document**, with the plain-fields editor (no
JSON to hand-write) or a raw-JSON toggle for nested data:

```json
{
  "name": "Alice",
  "age": 20
}
```

**Step 7 — View, edit, delete, and browse** your blockchain database from
the dashboard. Every write is a transaction on the real chain; every read
comes straight off it.

## Networks

Preset chains, selectable from the dashboard (Polygon Amoy is always the
default):

- **Testnets:** Polygon Amoy · Ethereum Sepolia · Base Sepolia · Arbitrum
  Sepolia · OP Sepolia · BNB Testnet · Avalanche Fuji — each with a faucet link
- **Mainnets:** Polygon · Ethereum · Base · Arbitrum One · OP Mainnet ·
  BNB Chain · Avalanche C-Chain
- **Custom RPC:** any other EVM-compatible endpoint

Contract addresses are per-network: switching chains means deploying (or
pasting) a Database contract on that chain.

## The app

- **`/`** — an animated monochrome landing splash with an Enter button into
  the dashboard.
- **`/dashboard`** — one unified page: live status (collections, documents,
  network, block height, wallet balance, contract), and a tabbed workspace
  for collections, documents (create / edit / delete, plain-fields or raw
  JSON), network details, and settings (contract address, allowed domains,
  data API key).
- **`/showcase`** — a live console for the data API: every button fires a
  real request against the same endpoints an external site would call, with
  the exact method/headers/body/response streamed into a request log below,
  plus ready-to-copy `curl`/JS snippets for every endpoint. Password-gated
  like the dashboard, since writes here spend real gas.

## Data Model

```
Database → Collections → Documents → fields (encrypted on-chain)
```

Every document gets an auto-incrementing ID (starting at 1) plus
`createdAt` / `updatedAt` timestamps from the block. You build documents
with a plain-fields editor (no JSON to hand-write, values auto-typed) or a
raw-JSON toggle for nested data and power users.

## Encryption (private by default)

A public blockchain means anyone can read transaction data. StarBoarDB
**encrypts every document payload before it's written on-chain** with
AES-256-GCM, keyed from your wallet's private key — so the ledger only
stores an opaque blob and **only the key owner can read it back**.

```
on-chain value:  enc:v1:<base64( iv | authTag | ciphertext )>
```

- The key is derived from `PRIVATE_KEY` (scrypt); it never leaves the server
  and is never sent to the browser. A read-only viewer without the key sees
  only ciphertext.
- Documents written before encryption (or by other tools) stay readable —
  anything without the `enc:v1:` prefix is treated as plaintext.
- **Note:** this is real *encryption*, not a hash. A SHA-256 hash is one-way
  and could never be read back; AES-GCM is reversible with the key and also
  detects tampering.
- Because the key comes from your wallet key, **rotating your wallet makes
  older encrypted documents unreadable.** Keep the key that wrote the data.

Collection *names* are encrypted too (`enc:c1:` prefix, deterministic so
lookups still work) — so the ledger doesn't leak your schema, only that
some number of opaque collections exist.

## CRUD API

| Endpoint | Method | Body / query |
| --- | --- | --- |
| `/api/create` | POST | `{ "collection": "users", "data": { … } }` |
| `/api/get` | GET | `?collection=users&id=1` |
| `/api/update` | POST | `{ "collection": "users", "id": 1, "data": { … } }` |
| `/api/delete` | POST | `{ "collection": "users", "id": 1 }` |
| `/api/list` | GET | `?collection=users` |
| `/api/collections` | GET / POST | — / `{ "name": "users" }` |
| `/api/health` | GET | safe public status (network, contract, counts) |
| `/api/status` | GET | full snapshot incl. wallet/balance (dashboard) |
| `/api/deploy` | POST | `{ "confirm": true }` — deploy (dashboard only) |

All data endpoints accept an optional `x-api-key` header (see
[Using it as an API](#using-it-as-an-api-back-any-website)) and send CORS
headers. `/api/settings`, `/api/deploy`, `/api/apikey` are dashboard-only.

## Using it as an API (back any website)

StarBoarDB is a REST API you can point a real website or server at. Try it
live on `/showcase` first — every request there is exactly what your own
code needs to send.

1. **CORS is enabled** on all data endpoints. With no allowed domains
   configured, any origin may call them.
2. **Allowed domains (Firebase-style whitelist).** Set them in the
   dashboard's **settings** tab (or `ALLOWED_ORIGINS` in `.env.local`,
   comma-separated, e.g. `https://myapp.com,https://*.mybusiness.ph`). Once
   set, CORS headers are only sent to whitelisted origins, and browser
   requests from any other site are rejected with `403` before an RPC call
   spends gas.
3. **API key (secret handshake).** Generate one from the dashboard's
   **settings** tab (or set `API_KEY` in `.env.local`). Servers, terminals,
   and anything without a whitelisted browser Origin must send it:

   ```
   x-api-key: bdb_…            (or)   Authorization: Bearer bdb_…
   ```

   When both rules are configured, a request passes with *either* a
   whitelisted origin *or* a valid key. Only the key is cryptographic
   proof — non-browser clients can fake an Origin header — so keep a key
   set for real isolation. With neither configured the API is *open* (fine
   for local dev). The dashboard itself never needs the key (it's
   recognised as same-origin). Admin endpoints (`/api/settings`,
   `/api/deploy`, `/api/apikey`) are always dashboard-only.
4. **Deploy** this Next.js app to Vercel (or a VPS, or anywhere Next.js
   runs) and use that public URL as your API base.

Minimal client:

```js
const BASE = "https://your-instance.example.com";
const KEY  = "bdb_…"; // omit the header if your instance is open

const db = (path, opts = {}) =>
  fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
  }).then((r) => r.json());

await db("/api/create", {
  method: "POST",
  body: JSON.stringify({ collection: "guestbook", data: { name: "Ada", message: "hi" } }),
});
const { documents } = await db("/api/list?collection=guestbook");
```

A complete, ready-to-open example — a guestbook website with full CRUD — is
in [`examples/basic-crud-site.html`](examples/basic-crud-site.html). Open it
in a browser, point it at your instance (and paste an API key if it needs
one), and it works. `GET /api/health` returns a safe status (network,
contract, counts) for consumers to check.

> Reads return **decrypted** data, so protect the API with a key before
> exposing it — otherwise anyone who can reach it can read your plaintext
> and spend your wallet's gas on writes.

## SDK

`lib/database.ts` exports the same operations as a TypeScript class (used by
the API routes; usable from any server-side code):

```ts
const db = new BlockchainDB();

const { id } = await db.create("users", { name: "John", age: 25 });
await db.get("users", id);
await db.update("users", id, { age: 26 });
await db.list("users");
await db.delete("users", id);
```

## Smart Contract

One contract only: `contracts/Database.sol`, with `create`, `get`, `update`,
`remove` (delete is a reserved word in Solidity), `list`, plus
`createCollection`, `listCollections` and `totalDocuments` for the dashboard.
Writes are `onlyOwner` — the wallet that deployed it owns the database.

The compiled artifact ships in `abi/Database.json`. If you edit the contract,
recompile with `npm run compile` (plain solc — no framework) and redeploy.

## Environment Variables

```
RPC_URL=            # defaults to https://polygon-amoy-bor-rpc.publicnode.com
PRIVATE_KEY=        # wallet that owns the contract (signs every write)
CONTRACT_ADDRESS=   # filled by deploy (wizard, dashboard settings, or npm run deploy)
```

All three are managed for you by the dashboard's setup wizard and settings
tab. On Vercel, everything else (password, allowed domains, API key, custom
encryption key) is dashboard-managed too — stored on-chain rather than in
`.env.local`, since the filesystem there is read-only.
