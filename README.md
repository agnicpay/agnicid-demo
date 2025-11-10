## Agnic.ID MVP

Agnic.ID demonstrates the complete Know-Your-Agent (KYA) flow for x402 agentic payments. The monorepo contains five packages:

| Package | Purpose |
| --- | --- |
| `packages/wallet-ui` | Neo-minimalist React wallet for enrollment, credential issuance, and bundle export. |
| `packages/issuer-cli` | Headless local issuer for developers/CI — mirrors wallet issuance flows from the terminal. |
| `packages/agent-sdk` | TypeScript SDK + CLI for bundle import, VP creation, and x402 resubmission (read-only identity). |
| `packages/service-seller` | Express seller that issues HTTP 402 challenges, verifies proofs, and renders a live console. |
| `packages/mcp-bridge` | Placeholder shim for future MCP/n8n integrations. |
| `shared` | Shared crypto helpers, schemas, and DID utilities. |

### Prerequisites

- Node.js 20+
- npm 10+

Install dependencies and build all workspaces:

```bash
npm install
npm run build
```

### One-command demo

```bash
npm run demo
```

This starts: 

- Wallet UI + Wallet API on `http://localhost:5173`
- Seller + verification console on `http://localhost:8081`

Stop with `Ctrl+C`. The CLI instructions are printed when the demo boots.

### Demo walkthrough

1. **Wallet enrollment**
   - Visit `http://localhost:5173`
   - Step through email verification, birthdate entry, and credential issuance
   - Download the exported bundle (`~/.agnicid` archive)

2. **Seller console**
   - Visit `http://localhost:8081`
   - Observe live logs and flip the “Under-18 failure” toggle to show policy enforcement

3. **Agent CLI flow**
   - Open a separate terminal
   - Run the CLI with existing credentials:

     ```bash
     node packages/agent-sdk/dist/cli.js x402:call --jobs http://localhost:8081/jobs
     ```

   - The CLI now implements the Coinbase x402 re-submit cycle: the first request receives `402 Payment Required`; the second request sends `X-PAYMENT` (signed envelope) and `X-PRESENTATION` (JWT-VP). Seller responds `200 OK` with `X-PAYMENT-RESPONSE`.

   - Toggle “Under-18 failure” in the console and re-run the command to receive a `403 AGE_POLICY_NOT_MET` response.

### Agent CLI cheatsheet (read-only)

```bash
# List credentials in the imported bundle
node packages/agent-sdk/dist/cli.js vc:list

# Create a JWT-VP bound to a seller challenge
node packages/agent-sdk/dist/cli.js vp:make --challenge c-123 --audience http://localhost:8081

# Execute the x402 flow (request → 402 → resubmit)
node packages/agent-sdk/dist/cli.js x402:call --jobs http://localhost:8081/jobs
```

The agent CLI no longer generates identity materials; import a bundle exported from wallet-ui (or issued via issuer-cli) before running these commands.

### Issuer CLI cheatsheet (developer-only)

```bash
# Generate keys (human, agent, issuer)
node packages/issuer-cli/dist/cli.js keygen

# Initialize DIDs (human alias now mints a real did:sol on devnet)
node packages/issuer-cli/dist/cli.js did:init

# Force-create/rotate a Solana DID on devnet (auto-funded with 0.01 SOL from the funded wallet)
node packages/issuer-cli/dist/cli.js did:sol:create human

# Resolve Solana DID document
node packages/issuer-cli/dist/cli.js did:sol:resolve did:sol:devnet:...

# Issue credentials
node packages/issuer-cli/dist/cli.js vc:issue email --email alice@example.com
node packages/issuer-cli/dist/cli.js vc:issue age --birthdate 1990-01-01
node packages/issuer-cli/dist/cli.js vc:issue delegation --owner-email alice@example.com --spend-cap "250 USDC"

# List stored credentials
node packages/issuer-cli/dist/cli.js vc:list
```

All data lives under `~/.agnicid` (keys, DIDs, VCs, presentations).

> Wallet enrollment (or any call to `ensureDid("human")`) now provisions a fresh `did:sol:devnet:...` by funding a new Solana keypair with 0.01 SOL from `packages/issuer-cli/src/assets/funded-devnet-wallet.json`. The resolved document and keypair are cached under `~/.agnicid` for later credential issuance. The agent alias now mints `did:web:agnic.id:agents/<10-char>` identifiers so delegation credentials always reference a public, web-hosted DID per installation.

### Seller endpoints

- `GET /jobs`
  - First call → `402` with `X-PAYMENT-REQUIRED` header describing the challenge
  - Second call with `X-PAYMENT` + `X-PRESENTATION` headers → `200` with `X-PAYMENT-RESPONSE`
- `GET /console/state` & `POST /console/toggle` power the console UI

### Facilitator mock

`packages/service-seller/src/facilitator.ts` simulates Coinbase’s facilitator: it verifies payment payloads, checks challenge IDs, and returns a settlement object (`status`, `txId`, `settledAt`). The seller attaches this settlement in `X-PAYMENT-RESPONSE` so agents can display facilitator results.

### Wallet API

The wallet UI runs an accompanying API (`http://localhost:8787`):

- `POST /api/enroll` → generates keys, DIDs, and all three credentials
- `POST /api/export` → returns a base64 zip of `~/.agnicid`
- `GET /api/status` → status of keys, DIDs, and stored credentials

When `~/.agnicid` is empty (fresh install or `/api/reset`), the first human DID request will pause briefly to fund a Solana devnet wallet, publish the DID on-chain, and store both the DID document and signing keys locally.

### Testing the end-to-end flow manually

```bash
# Start seller and wallet (in one terminal)
npm run demo

# In another terminal, issue fresh credentials (wallet UI or issuer CLI)
node packages/issuer-cli/dist/cli.js keygen
node packages/issuer-cli/dist/cli.js did:init
node packages/issuer-cli/dist/cli.js vc:issue email --email alice@example.com
node packages/issuer-cli/dist/cli.js vc:issue age --birthdate 1990-01-01
node packages/issuer-cli/dist/cli.js vc:issue delegation --owner-email alice@example.com --spend-cap "100 USDC"

# Call the seller (third terminal)
node packages/agent-sdk/dist/cli.js x402:call --jobs http://localhost:8081/jobs
```

Flip the seller console toggle and re-run the last command to show the failure path.

### Future work (Phase 1.5+)

- Implement the `mcp-bridge` for n8n/MCP demos
- Expand Solana usage beyond the human alias (agent/issuer, production clusters)
- Introduce SD-JWT/BBS+ selective disclosure variants

---

Identity you can verify — and understand.
