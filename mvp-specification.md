# Agnic.ID MVP Specification

# Vision (MVP 0)

Prove—from keyboard to console—the end-to-end **KYA for x402 Agentic Payments** flow where:

* A **human user** creates a DID and receives VCs (email, birthdate/age).
* The **agent** obtains a Delegation VC from that human and stores everything locally.
* A **service provider** (API seller) issues a **single HTTP 402 “one-shot” challenge** demanding both a micro-payment and specific proof claims (email verified + over-18).
* The **agent** returns a payment artifact + a verifiable presentation (VP) in a single response; the seller verifies and serves data.
* Everything runs locally; no backend DB. Keys + credentials live in local files/IndexedDB.

# Value Stream (single glance)

User enrolls → Agent configured → Agent calls Seller → Seller issues 402 challenge (payment+proof) → Agent pays + presents VCs → Seller verifies → Seller serves data.

# Primary Personas

* **Builder-User (Human Owner)**: wants quick enrollment; verifies email and birthdate and optionally fills profile.
* **Agent (Executor)**: a script or n8n node that holds keys/VCs and negotiates with sellers.
* **Service Provider (Seller)**: a simple “API seller” that monetizes with x402 and requires policy proof (“over 18”).
* **Developer/Demo Operator**: runs all parts locally for demo and testing.

# User Journey (Happy Path)

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

# Architecture (MVP 0 — all local, no DB)

**Monorepo (TypeScript)**

```
agnic-id-mvp/
  packages/
    wallet-ui/         # Vite/React SPA – user enrollment + local storage
    agent-sdk/         # Node lib (and n8n node later) – keys, DID, VP, x402 client
    service-seller/    # Express server on port :8081 – issues 402, verifies payment+VCs
    mcp-bridge/        # thin shim for later n8n/MCP demo (optional in MVP 0)
  shared/
    schemas/           # JSON Schemas for Email, Age, Delegation VCs
    crypto/            # helpers for ED25519 (tweetnacl) + JWS/JWT VP
  .tooling/            # scripts for keygen, fixtures, test data
```

**Local Storage**

* **Wallet UI**: browser `IndexedDB` for user profile; export/import bundle to `~/.agnicid/`.
* **Agent SDK**: file-based store at `~/.agnicid/`:

  * `keys/agent.key`, `keys/human.key` (raw ed25519 JSON)
  * `dids/human.did.json`, `dids/agent.did.json` (mock DID docs)
  * `vcs/*.vc.json` (issued credentials)
  * `presentations/*.vp.jwt` (optional cache)
* **Seller**: no persistence—verifies inputs per request.

**DID Strategy**

* **MVP 0**: **Mock `did:sol`** resolver reading `dids/*.json` locally. DID doc includes `verificationMethod` entries with ed25519 public keys.
* **Phase 1.5**: add **Solana devnet** resolver/publisher behind a flag; same DID doc shape.

**Crypto & Proof Format**

* Keys: ed25519 (tweetnacl/libsodium)
* VCs: plain JSON + detached JWS proofs (JWT-VC acceptable for MVP)
* VP: JWT-VP (single signature by **Agent DID** proving holder binding)
* No ZK/SD yet (add SD-JWT/BBS+ later)

**Protocols & Formats**

* **x402**: local mock of HTTP 402; Seller responds with:

  ```json
  {
    "challengeId": "c-123",
    "amount": "0.01",
    "asset": "USDC",
    "claims": ["email_verified", "age_over_18"],
    "vpFormat": "jwt_vp",
    "paymentEndpoint": "http://localhost:8081/pay",
    "acceptEndpoint": "http://localhost:8081/redeem"
  }
  ```
* **One-shot submit** (Agent → Seller `/redeem`):

  ```json
  {
    "challengeId": "c-123",
    "paymentProof": { "txId": "mock-12345", "amount":"0.01", "asset":"USDC" },
    "vp_jwt": "<base64url.jwt>"
  }
  ```
* Seller verifies paymentProof (mock), then VP, then claim semantics.

# Minimal VC Schemas (aligned vocabulary, simplified content)

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

**2) AgeCredential** (full claim for MVP)

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

**Verifiable Presentation (JWT-VP) payload**

```json
{
  "vp": {
    "holder": "did:sol:agent",
    "verifiableCredential": [<EmailCredential>, <AgeCredential>, <AgentDelegationCredential>]
  },
  "nonce": "c-123",            // binds to Seller challenge
  "aud": "http://localhost:8081",
  "exp": <short-lived>
}
```

# Developer-Facing Components

**wallet-ui (React SPA)**

* Screens: Welcome → Verify Email (shows “copy this URL to verify”) → Enter Birthdate → Optional Profile → Generate Keys → Issue VCs → Export Bundle
* Buttons: “Export Bundle” (downloads `~/.agnicid` zip), “Launch Agent Call” (invokes agent on `/jobs`)

**agent-sdk (Node lib + CLI)**

* `keygen`: create `human.key`, `agent.key`
* `did:init`: create mock DID docs in `dids/`
* `vc:issue`: issue Email, Age, Delegation creds signed by issuer DID (self-issued)
* `vp:make`: assemble and sign VP (JWT)
* `x402:call`: orchestrate GET `/jobs` → parse 402 → call `/pay` (mock) → POST `/redeem` with `vp_jwt`
* Optional: `n8n` node wrapper later; keep API pure TS so we can drop it in.

**service-seller (Express)**

* `GET /jobs`: if no valid auth → respond `402` + JSON challenge (as above)
* `POST /pay`: accept `{amount, asset}` → return `{txId}`
* `POST /redeem`: verify

  * paymentProof.amount/asset
  * VP signature (resolve mock did:sol)
  * VC proofs (iss, exp, subject DID alignment)
  * Semantics: `email_verified === true` and `age_over_18 === true`
* UI console (simple web page) showing step logs with green/red checkmarks + toggle “Force Under-18 failure”.

# Acceptance Criteria & Test Scenarios

**Happy Path – Over 18**

* Given a user enrolled with `email_verified = true` and `birthDate` older than 18 years,
* And agent holds Delegation VC,
* When agent requests `/jobs`,
* Then Seller returns `402` challenge (claims + amount),
* When agent pays and POSTs VP with 3 VCs,
* Then Seller verifies all and returns `200 OK` with job list.

**Failure – Under 18**

* Given `age_over_18 = false` (or birthdate < 18),
* Flow proceeds to `/redeem`,
* Seller rejects with `403` + reason `AGE_POLICY_NOT_MET`.

**Failure – Untrusted Issuer**

* EmailCredential signed by an unknown DID,
* Seller rejects with `403` + reason `UNTRUSTED_ISSUER`.

**Failure – Tampered VC**

* Any VC payload modified (signature mismatch),
* Seller rejects `400` + reason `INVALID_PROOF`.

**Failure – Missing Payment**

* `paymentProof.amount != 0.01` or missing,
* Seller rejects `402` + reason `PAYMENT_REQUIRED`.

**Failure – Holder Mismatch**

* `vp.holder` is not equal to Delegation VC `credentialSubject.id`,
* Seller rejects `403` + reason `HOLDER_MISMATCH`.

**Expiry**

* If `exp` in VP is past now,
* Seller rejects `401` + reason `VP_EXPIRED`.

# Threat Model (MVP-appropriate)

* **Key theft**: keys in `~/.agnicid/`; warn user and allow passphrase-encrypted PEM as optional flag later.
* **Replay**: bind VP with `nonce = challengeId` and short `exp`.
* **Issuer spoofing**: maintain simple **Trusted Issuers List** in Seller config (for MVP, just `did:sol:agnic:issuer` and “self-issued human” for AgentDelegationCredential).
* **Down-grading**: Seller enforces `vpFormat = jwt_vp` only.

# Tech Choices (minimal friction)

* **TS runtime**: Node 20+, Vite for SPA
* **Crypto**: `tweetnacl` (ed25519), `jose` (JWS/JWT)
* **HTTP**: Express, Axios/Fetch
* **UI**: React + minimal Tailwind
* **No DB**: file/IndexedDB only
* **Solana (Phase 1.5)**: `@solana/web3.js` gated with `USE_DEVNET=true`

# Backlog (MVP 0 → 2 weeks)

**Day 1–2**

* Monorepo scaffolding; agent keygen + DID mock resolver; schemas
  **Day 3–4**
* VC issuance (Email, Age, Delegation) with JWS proofs
  **Day 5–6**
* VP (JWT) creation; bind nonce/aud/exp
  **Day 7**
* Seller 402 challenge + `/pay` mock
  **Day 8–9**
* Seller `/redeem` verification pipeline (signatures → issuers → semantics)
  **Day 10**
* Wallet UI (enroll, generate, issue, export); console in Seller
  **Day 11**
* Tests for all acceptance scenarios; CLI smoke tests
  **Day 12–14**
* Polish, demo script, README + one-click run scripts

# Demo Script (for the show-and-tell)

1. Open **Wallet UI** → enroll user → generate DID/keys → issue VCs → export bundle.
2. Start **Seller** on `:8081`, show console waiting.
3. Run **Agent CLI**: `x402:call http://localhost:8081/jobs --bundle ~/.agnicid`
4. Watch Seller console: `402 issued → payment received → VP verified → 200 served`.
5. Flip Seller toggle to “Under-18 failure” and rerun → see `403 AGE_POLICY_NOT_MET`.

# Phase 1.5 (post-MVP quick wins)

* Real **did:sol** anchoring on **Solana devnet** (publish DID docs).
* **n8n node** wrapper for `agent-sdk` so we can demo “agent within workflow”.
* **SD-JWT/BBS+** for selective disclosure of “over 18”.

---

## User Stories (condensed)

**Epic 1: Enrollment & Issuance**

* As a user, I can verify my email (MVP: copy a local “verification URL”) so that a VC records `email_verified=true`.
* As a user, I can enter my birthdate so that an Age VC encodes `age_over_18` (derived once for MVP).
* As a user, I can generate Human/Agent DIDs and keys and store them locally.
* As a user, I can issue a Delegation VC from my Human DID to my Agent DID.

**Epic 2: Agent Presentation**

* As an agent, I can request a resource and handle a 402 challenge that lists claims and payment.
* As an agent, I can assemble a VP (JWT) including Email, Age, Delegation VCs and sign it with my DID key.
* As an agent, I can submit the VP and payment proof in one shot to redeem the resource.

**Epic 3: Seller Verification**

* As a seller, I can verify the VP signature by resolving the holder DID.
* As a seller, I can validate VC signatures, issuer trust, subject alignment, and time validity.
* As a seller, I can enforce claim semantics (`email_verified`, `age_over_18`) before serving data.
* As a seller, I can present a console log of each step for demo and debugging.

**Epic 4: Failure Handling**

* As a seller, I can reject requests when payment is missing/incorrect.
* As a seller, I can reject untrusted issuers, tampered VCs, expired VPs, or holder mismatches.
* As a demo operator, I can force an “under 18” failure to show policy enforcement.