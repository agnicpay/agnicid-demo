# Agnic.ID MVP Specification 

## Vision (MVP 0)

Prove—from keyboard to console—the end-to-end **KYA for x402 Agentic Payments** flow where:

* A **human user** creates a DID and receives VCs (email, birthdate/age).
* The **agent** obtains a Delegation VC from that human and stores everything locally.
* A **service provider** (API seller) issues a **single HTTP 402 “one-shot” challenge** demanding both a micro-payment and specific proof claims (email verified + over-18).
* The **agent** returns a payment artifact + a verifiable presentation (VP) in a single response; the seller verifies and serves data.
* Everything runs locally; no backend DB. Keys + credentials live in local files/IndexedDB.

## Value Stream (single glance)

User enrolls → Agent configured → Agent calls Seller → Seller issues 402 challenge (payment+proof) → Agent pays + presents VCs → Seller verifies → Seller serves data.

## Primary Personas

* **Builder-User (Human Owner)**: wants quick enrollment; verifies email and birthdate and optionally fills profile.
* **Agent (Executor)**: a script or n8n node that holds keys/VCs and negotiates with sellers.
* **Service Provider (Seller)**: a simple “API seller” that monetizes with x402 and requires policy proof (“over 18”).
* **Developer/Demo Operator**: runs all parts locally for demo and testing.

## User Journey (Happy Path)

1. **Enroll**: User opens Wallet UI → enters email + birthdate → sees local “Enroll” page generate DID & keys, issues **EmailCredential** + **AgeCredential** (full claim for now), and **AgentDelegationCredential**.
2. **Call Seller**: Agent invokes Seller’s `/jobs` endpoint.
3. **402 Challenge**: Seller responds `402 Payment Required` with JSON body listing:

   * `amount`: `0.01 USDC`
   * `claims`: `[ "email_verified", "age_over_18" ]`
   * `vpFormat`: `jwt_vp`
   * `paymentEndpoint`: local mock x402 endpoint
4. **One-Shot Response**: Agent pays via x402 mock and sends **VP (JWT)** bundling Email + Age credentials, signed by Agent DID.
5. **Verify & Serve**: Seller verifies payment + VP → returns job listings.
6. **Demo Toggle**: Seller has “Under 18? Reject” switch to show failure path.

## Architecture (MVP 0 — all local, no DB)

**Monorepo (TypeScript)**

```
agnic-id-mvp/
  packages/
    wallet-ui/         # Vite/React SPA – user enrollment + local storage (keys, DIDs, VC issuance)
    issuer-cli/        # Headless local issuer for demos/tests; mirrors wallet-ui issuance without a backend
    agent-sdk/         # Node lib (and n8n later) – imports bundle, builds VP, x402 resubmission
    service-seller/    # Express server on port :8081 – issues 402, verifies payment+VCs
    # Express server on port :8081 – issues 402, verifies payment+VCs
    mcp-bridge/        # thin shim for later n8n/MCP demo (optional in MVP 0)
  shared/
    schemas/           # JSON Schemas for Email, Age, Delegation VCs
    crypto/            # helpers for ED25519 (tweetnacl) + JWS/JWT VP
  .tooling/            # scripts for keygen, fixtures, test data
```

### Local Storage

* **Wallet UI**: browser `IndexedDB` for user profile; export/import bundle to `~/.agnicid/`.
* **Agent SDK**: file-based store at `~/.agnicid/` with `keys`, `dids`, `vcs`, and `presentations` folders.
* **Seller**: no persistence—verifies inputs per request.

### DID Strategy

* **MVP 0**: Mock `did:sol` resolver reading local files.
* **Phase 1.5**: Add Solana devnet anchoring.

### Crypto & Proof Format

* Keys: ed25519 (tweetnacl/libsodium)
* VCs: JSON + detached JWS proofs (JWT-VC acceptable for MVP)
* VP: JWT-VP (single signature by **Agent DID** proving holder binding)
* No ZK/SD yet (add SD-JWT/BBS+ later)

### Protocols & Formats (aligned to Coinbase x402)

**Source of truth:** x402 flow uses HTTP 402 and resubmission with headers, not custom endpoints. We follow Coinbase’s spec exactly:

**x402 request cycle**

1. **Initial request** → client/agent calls the protected endpoint (e.g., `GET /jobs`).
2. **Server responds ****`402 Payment Required`** with a **payment requirements body** (amount, asset/network, scheme) and instructions.
3. **Client creates payment payload** using its wallet/facilitator.
4. **Client resubmits the SAME request** (e.g., `GET /jobs`) **including ********************************`X-PAYMENT`******************************** header** with the signed payment payload.
5. **Server verifies payment** either locally or via a **facilitator** (recommended).
6. **Settlement** can be done by the server or through the facilitator (e.g., a `/settle` provided by the facilitator).
7. On success, server returns `200 OK` with resource and **`X-PAYMENT-RESPONSE`** header (settlement details).

**KYA carriage (one-shot with payment):**
To keep the experience one-shot while staying x402-compliant, we attach a **KYA Verifiable Presentation (VP)** alongside payment using an additional header:

* `X-PRESENTATION: <jwt_vp>` (JWT-VP signed by the Agent DID, containing Email, Age, Delegation VCs).
* The **payment** lives in `X-PAYMENT` per x402.
* The **claims the seller requires** (e.g., `email_verified`, `age_over_18`) are declared in the **402 response body** as part of the negotiation.

**Example 402 response body (from Seller):**

```json
{
  "challengeId": "c-123",
  "amount": "0.01",
  "asset": "USDC",
  "network": "base",
  "scheme": "x402/basic",
  "requiredClaims": ["email_verified", "age_over_18"],
  "vpFormat": "jwt_vp",
  "facilitator": "mock-facilitator"
}
```

**Agent resubmission (SAME HTTP request):**

```
GET /jobs HTTP/1.1
Host: localhost:8081
X-PAYMENT: <signed-payment-payload>
X-PRESENTATION: <jwt_vp>
```

**Server success response:**

```
HTTP/1.1 200 OK
X-PAYMENT-RESPONSE: <settlement-metadata>
Content-Type: application/json

{ "jobs": [ ... ] }
```

> Note: We removed ad‑hoc `/pay` and `/redeem` endpoints. Verification/settlement are routed through the **facilitator abstraction** in-process (mock) to preserve x402 semantics while keeping everything local for the MVP.

## Minimal VC Schemas (aligned vocabulary, simplified content)

**1) EmailCredential**

```json
{
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  "type": ["VerifiableCredential", "EmailCredential"],
  "issuer": "did:sol:agnic:issuer",
  "issuanceDate": "ISO-8601",
  "credentialSubject": {
    "id": "did:sol:human",
    "email": "alice@example.com",
    "email_verified": true
  },
  "proof": { "type": "Ed25519Signature2020", "...": "..." }
}
```

**2) AgeCredential**

```json
{
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  "type": ["VerifiableCredential", "AgeCredential"],
  "issuer": "did:sol:agnic:issuer",
  "issuanceDate": "ISO-8601",
  "credentialSubject": {
    "id": "did:sol:human",
    "birthDate": "YYYY-MM-DD",
    "age_over_18": true
  },
  "proof": { "type": "Ed25519Signature2020", "...": "..." }
}
```

**3) AgentDelegationCredential**

```json
{
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  "type": ["VerifiableCredential", "AgentDelegationCredential"],
  "issuer": "did:sol:human",
  "issuanceDate": "ISO-8601",
  "credentialSubject": {
    "id": "did:sol:agent",
    "capabilities": {
      "paymentProtocols": ["x402"],
      "spendCapDaily": "100 USDC"
    },
    "ownerEmail": "alice@example.com"
  },
  "proof": { "type": "Ed25519Signature2020", "...": "..." }
}
```

## Developer-Facing Components

### Role Boundaries (Identity vs. Agent)

To clarify the responsibility split:

* **Human Wallet (wallet-ui)**: Sole source of truth for key generation, DID registration, and VC issuance. The human controls their identity lifecycle.
* **Agent (agent-sdk)**: Operates on behalf of the human, but never issues or creates identity materials. It reads a verified exported bundle from the wallet to construct Verifiable Presentations and perform x402 payments.
* **Issuer-CLI (optional)**: Developer utility mirroring wallet-ui issuance for CI/demos.

This separation enforces human ownership of identity, keeps the agent stateless, and simplifies security for the MVP.

### wallet-ui (React SPA)

* Screens: Landing → Onboard (verify email, enter birthdate) → Generate Keys → Issue VCs → Export Bundle.
* *Wallet-ui is the only place end‑users create keys/DIDs/VCs.*
* Buttons: “Export Bundle” and “Launch Agent Call”.

### agent-sdk (Node lib + CLI) (Node lib + CLI)

**Purpose:** runtime for agents only (no issuing). It **consumes** a wallet bundle produced by wallet-ui/issuer-cli and performs presentations + x402.

* Commands:

  * `bundle:import --path ~/.agnicid` — load keys, DIDs, VCs (read-only).
  * `vp:make --claims email_verified,age_over_18 --nonce <challengeId>` — assemble & sign JWT‑VP with **Agent DID**.
  * `x402:call <URL> --bundle ~/.agnicid` — run the request→402→resubmit with `X-PAYMENT` + `X-PRESENTATION`.

### issuer-cli (Headless local issuer)

**Purpose:** developer convenience for demos/CI. Mirrors wallet-ui issuance flow without servers.

* Commands:

  * `keygen` — generate **Human** and **Agent** keys.
  * `did:init` — create mock did:sol docs for Human and Agent.
  * `vc:issue email|age|delegation` — issue VCs signed by **issuer DID** (or Human for delegation).
* Output: writes to `~/.agnicid/`.

### service-seller (Express)

* `GET /jobs`:

  * If no valid `X-PAYMENT` header: respond **402** with JSON payment requirements (`amount`, `asset`, `network`, `scheme`, `requiredClaims`, `vpFormat`, `facilitator`).
  * If `X-PAYMENT` present:

    1. Forward to **mock facilitator** verifier (local module) to check payment payload.
    2. Verify `X-PRESENTATION` (JWT‑VP) → resolve mock `did:sol` holder, verify VC signatures/issuers/semantics.
    3. On success: return **200** with jobs list and **`X-PAYMENT-RESPONSE`** header; otherwise return **402** (payment invalid) or **403** (policy/claims not met).
* Web console logs each step and includes **“Under-18 failure”** toggle.
* `GET /jobs`:

  * If no valid `X-PAYMENT` header: respond **402** with JSON payment requirements (`amount`, `asset`, `network`, `scheme`, `requiredClaims`, `vpFormat`, `facilitator`).
  * If `X-PAYMENT` present:

    1. Forward to **mock facilitator** verifier (local module) to check payment payload.
    2. Verify `X-PRESENTATION` (JWT‑VP) → resolve mock `did:sol` holder, verify VC signatures/issuers/semantics.
    3. On success: return **200** with jobs list and **`X-PAYMENT-RESPONSE`** header; otherwise return **402** (payment invalid) or **403** (policy/claims not met).
* Web console logs each step and includes **“Under‑18 failure”** toggle.
* `GET /jobs`: responds with 402 challenge.
* `POST /pay`: mock payment.
* `POST /redeem`: verifies payment, VP, and claims.
* Web console logs each step and includes “Under-18 failure” toggle.

## Acceptance Criteria & Test Scenarios

* **Happy Path – Over 18**: success end-to-end.
* **Failure – Under 18**: reject 403 AGE_POLICY_NOT_MET.
* **Failure – Untrusted Issuer**: reject 403.
* **Failure – Tampered VC**: reject 400.
* **Failure – Missing Payment**: reject 402.
* **Failure – Holder Mismatch**: reject 403.
* **Expiry**: reject 401 VP_EXPIRED.

## Threat Model (MVP)

* Key theft, replay prevention, issuer spoofing handled minimally with nonce and trust list.

## Tech Choices (minimal friction)

* **TS runtime**: Node 20+, Vite
* **Crypto**: tweetnacl, jose
* **HTTP**: Express, Axios
* **UI**: React + Tailwind
* **No DB**: file/IndexedDB only
* **Solana (Phase 1.5)**: `@solana/web3.js`

## Backlog (MVP 0 → 2 weeks)

* Days 1–2: scaffold + mock DID
* Days 3–4: VC issuance
* Days 5–6: VP generation
* Day 7: Seller 402 challenge
* Days 8–9: Seller verification
* Day 10: Wallet UI
* Days 11–14: testing + polish

## Demo Script

1. Open **Wallet UI** → enroll user → generate DID/keys → issue VCs → export bundle.
2. Start **Seller** console (`:8081`).
3. Run **Agent CLI**: `x402:call http://localhost:8081/jobs --bundle ~/.agnicid`.
4. Observe:

   * First call → **HTTP 402** with payment requirements & required claims.
   * Agent resubmits **same request** with `X-PAYMENT` + `X-PRESENTATION`.
   * Seller verifies via **facilitator mock** → returns **200 OK** + `X-PAYMENT-RESPONSE`.
5. Flip Seller to “Under‑18 failure” and rerun → **403 AGE_POLICY_NOT_MET**.

## Phase 1.5 (next)

* Real did:sol anchoring on Solana devnet.
* n8n integration.
* SD-JWT/BBS+ for selective disclosure.
* Optionally swap **mock facilitator** with a real one (CDP or self-hosted API). (next)
* Real did:sol anchoring on Solana devnet.
* n8n integration.
* SD-JWT/BBS+ for selective disclosure.

## User Stories (Condensed)

**Epic 1: Enrollment & Issuance**

* As a user, verify email and birthdate, generate keys/DIDs, issue VCs.
  **Epic 2: Agent Presentation**
* As an agent, request resource, handle 402, assemble and sign VP, submit to `/redeem`.
  **Epic 3: Seller Verification**
* As a seller, verify signatures, issuers, claim validity, and serve data.
  **Epic 4: Failure Handling**
* As a seller, reject missing payment, untrusted issuers, tampered/expired proofs.

## Threat & Security

* Minimal but real crypto.
* Trusted issuer list.
* Nonce-binding in VP.

## Future Extensions

* Solana devnet publishing.
* OIDC4VCI upgrade.
* Advanced selective disclosure.
* Agent reputation metrics.

---

## Update - 10-6-19-23

### 1️⃣ x402 Protocol Alignment

We’ve corrected our protocol layer to **fully align with Coinbase’s x402 specification**. The MVP must follow the documented x402 cycle ([https://docs.cdp.coinbase.com/x402/core-concepts/how-it-works](https://docs.cdp.coinbase.com/x402/core-concepts/how-it-works)):

* Use **HTTP 402** for initial payment requirements.
* Resubmit the **same request** with `X-PAYMENT` header containing the signed payment payload.
* Verification and settlement happen through a **mock facilitator** module — not ad‑hoc `/pay` or `/redeem` endpoints.
* Include a `X-PRESENTATION` header carrying our KYA JWT‑VP. Seller verifies both headers and responds `200 OK` with `X-PAYMENT-RESPONSE`.

### 2️⃣ Facilitator Mock

Implement a local module simulating facilitator verification/settlement (stubbed network). Keep its API minimal for future replacement with real CDP facilitator.

### 3️⃣ Wallet Landing Page

We now need a **polished landing page for the user wallet (wallet‑ui)** that reflects our **Agnic.ID design language**:

* **Brand mood:** trustable, minimal, robust, innovative, simple, solid, honest.
* **Visuals:** clean typography, calm neutral palette (off‑white + charcoal + accent blue/purple), soft edges, smooth transitions.
* **Layout:** hero section describing “Your Identity. Your Agents.” with CTA to “Start Wallet” and “Learn about Agnic.ID”.
* Include a short animated flow graphic (even placeholder SVG) showing human → agent → service provider.
* Keep it responsive and lightweight (Vite + Tailwind).

### 4️⃣ Implementation Notes

* All crypto/VC operations remain local (IndexedDB / `~/.agnicid`).
* The wallet onboarding must connect visually to our brand while being demo‑ready for product showcases.

