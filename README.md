## Agnic.ID MVP

Agnic.ID demonstrates the complete Know-Your-Agent (KYA) flow for x402 agentic payments. The monorepo contains five packages:

| Package | Purpose |
| --- | --- |
| `packages/wallet-ui` | Neo-minimalist React wallet for enrollment, credential issuance, and bundle export. |
| `packages/agent-sdk` | TypeScript SDK + CLI for key management, DID generation, credential issuance, and x402 orchestration. |
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

   - On success, the CLI prints the payment proof and redeemed job listings; the seller console updates in real time.

   - Toggle “Under-18 failure” in the console and run the CLI again to receive a `403 AGE_POLICY_NOT_MET` response.

### Agent CLI cheatsheet

```bash
# Generate keys (human, agent, issuer)
node packages/agent-sdk/dist/cli.js keygen

# Create mock did:sol documents
node packages/agent-sdk/dist/cli.js did:init

# Issue credentials
node packages/agent-sdk/dist/cli.js vc:issue email --email alice@example.com
node packages/agent-sdk/dist/cli.js vc:issue age --birthdate 1990-01-01
node packages/agent-sdk/dist/cli.js vc:issue delegation --owner-email alice@example.com

# Create a JWT-VP manually
node packages/agent-sdk/dist/cli.js vp:make --challenge c-123 --audience http://localhost:8081

# List stored credentials
node packages/agent-sdk/dist/cli.js vc:list
```

All data lives under `~/.agnicid` (keys, DIDs, VCs, presentations).

### Seller endpoints

- `GET /jobs` → `402` challenge with x402 requirements
- `POST /pay` → accepts `{ amount, asset, challengeId }`, returns `{ txId }`
- `POST /redeem` → verifies `{ paymentProof, vp_jwt }`
- `GET /console/state` & `POST /console/toggle` power the console UI

### Wallet API

The wallet UI runs an accompanying API (`http://localhost:8787`):

- `POST /api/enroll` → generates keys, DIDs, and all three credentials
- `POST /api/export` → returns a base64 zip of `~/.agnicid`
- `GET /api/status` → status of keys, DIDs, and stored credentials

### Testing the end-to-end flow manually

```bash
# Start seller and wallet (in one terminal)
npm run demo

# In another terminal, issue fresh credentials
node packages/agent-sdk/dist/cli.js vc:issue email --email alice@example.com
node packages/agent-sdk/dist/cli.js vc:issue age --birthdate 1990-01-01
node packages/agent-sdk/dist/cli.js vc:issue delegation --owner-email alice@example.com

# Call the seller (third terminal)
node packages/agent-sdk/dist/cli.js x402:call --jobs http://localhost:8081/jobs
```

Flip the seller console toggle and re-run the last command to show the failure path.

### Future work (Phase 1.5+)

- Implement the `mcp-bridge` for n8n/MCP demos
- Add Solana `did:sol` publishing (Devnet)
- Introduce SD-JWT/BBS+ selective disclosure variants

---

Identity you can verify — and understand.
