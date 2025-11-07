import cors from "cors";
import express from "express";
import path from "node:path";
import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { nanoid } from "nanoid";
import { fileURLToPath } from "node:url";
import nacl from "tweetnacl";
import { fromBase58, did as sharedDid } from "@agnicid/shared";
import type { DidDocument } from "@agnicid/shared";
import { verifyPresentation } from "./verification.js";
import {
  verifyPaymentWithFacilitator,
  type PaymentEnvelope,
  type SettlementResult
} from "./facilitator.js";
import type { Challenge, ConsoleState, VerificationLog } from "./types.js";

const PORT = parseInt(process.env.SELLER_PORT ?? "8081", 10);
const BASE_AMOUNT = "0.01";
const BASE_ASSET = "USDC";
const CLAIMS = ["email_verified", "age_over_18"];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*"
  }
});

app.use(cors());
app.use(express.json());

const challenges = new Map<string, Challenge>();
let forceUnder18 = false;
let logs: VerificationLog[] = [];

const MAX_LOGS = 100;

const emitLog = (log: VerificationLog) => {
  logs = [...logs.slice(-MAX_LOGS + 1), log];
  io.emit("log", log);
};

const recordLog = (challengeId: string, step: string, status: VerificationLog["status"], detail: string) => {
  const log: VerificationLog = {
    id: nanoid(10),
    challengeId,
    step,
    status,
    detail,
    timestamp: new Date().toISOString()
  };
  emitLog(log);
};

const buildChallenge = (): Challenge => {
  const challengeId = `c-${nanoid(6)}`;
  const challenge: Challenge = {
    challengeId,
    amount: BASE_AMOUNT,
    asset: BASE_ASSET,
    claims: CLAIMS,
    vpFormat: "jwt_vp",
    createdAt: new Date().toISOString(),
    forceUnder18
  };
  challenges.set(challengeId, challenge);
  return challenge;
};

app.get("/jobs", async (req, res) => {
  const paymentHeader = req.get("X-PAYMENT");
  const presentationHeader = req.get("X-PRESENTATION");

  const origin = `${req.protocol}://${req.get("host")}`;

  if (!paymentHeader || !presentationHeader) {
    const challenge = buildChallenge();
    recordLog(challenge.challengeId, "challenge.issued", "info", "HTTP 402 challenge issued");
    const payload = {
      challengeId: challenge.challengeId,
      amount: challenge.amount,
      asset: challenge.asset,
      claims: challenge.claims,
      vpFormat: challenge.vpFormat
    };
    return res
      .status(402)
      .set("X-PAYMENT-REQUIRED", encodeBase64Url(payload))
      .json(payload);
  }

  try {
    const paymentEnvelope = decodePaymentEnvelope(paymentHeader);
    const challenge = challenges.get(paymentEnvelope.payload.challengeId);

    if (!challenge) {
      return res.status(400).json({ error: "UNKNOWN_CHALLENGE" });
    }

    recordLog(challenge.challengeId, "payment.received", "info", "Payment envelope received");

    await verifyPaymentSignature(paymentEnvelope);
    recordLog(challenge.challengeId, "payment.signature", "success", "Payment signature verified");

    const settlement = verifyPaymentWithFacilitator(challenge, paymentEnvelope);
    challenge.settlement = {
      txId: settlement.txId,
      settledAt: settlement.settledAt
    };
    recordLog(challenge.challengeId, "payment.facilitator", "success", "Facilitator settled payment");

    const outcome = await verifyPresentation(
      presentationHeader,
      challenge,
      (step, status, detail) => recordLog(challenge.challengeId, step, status, detail),
      forceUnder18,
      origin
    );

    const responsePayload = {
      jobs: [
        {
          id: "agentic-dev-001",
          title: "Agent Workflow Engineer",
          rate: "120 USDC/hr",
          contact: outcome.email.credentialSubject.email
        },
        {
          id: "agentic-dev-002",
          title: "Solana Credential Integrator",
          rate: "110 USDC/hr",
          contact: outcome.email.credentialSubject.email
        }
      ]
    };

    recordLog(challenge.challengeId, "redeem.success", "success", "Proof validated and resource served");

    const paymentResponseHeader = encodeBase64Url<SettlementResult>({
      status: settlement.status,
      txId: settlement.txId,
      settledAt: settlement.settledAt
    });

    return res.status(200).set("X-PAYMENT-RESPONSE", paymentResponseHeader).json(responsePayload);
  } catch (error) {
    const mapped = mapVerificationError(error);
    const challengeId =
      (error as any)?.challengeId ??
      (typeof error === "object" && error !== null && "payload" in (error as any)
        ? (error as any).payload?.challengeId
        : "unknown");
    recordLog(challengeId, mapped.step, "error", mapped.detail);
    return res.status(mapped.status).json({ error: mapped.code, detail: mapped.detail });
  }
});

app.get("/console/state", (_req, res) => {
  const state: ConsoleState = {
    logs,
    forceUnder18
  };
  res.json(state);
});

app.post("/console/toggle", (req, res) => {
  const value = req.body?.forceUnder18;
  forceUnder18 = Boolean(value);
  emitLog({
    id: nanoid(10),
    challengeId: "console",
    step: "console.toggle",
    status: forceUnder18 ? "info" : "success",
    detail: forceUnder18 ? "Under-18 failure enforced" : "Under-18 failure disabled",
    timestamp: new Date().toISOString()
  });
  res.json({ forceUnder18 });
});

const staticDir = path.join(__dirname, "..", "public");
app.use(express.static(staticDir));

io.on("connection", (socket) => {
  socket.emit("state", {
    logs,
    forceUnder18
  });
});

const start = () => {
  httpServer.listen(PORT, () => {
    console.log(`Seller listening on http://localhost:${PORT}`);
  });
};

if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export default httpServer;

const mapVerificationError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "Verification error";
  if (message.includes("Under-18") || message.includes("Age policy")) {
    return { status: 403, code: "AGE_POLICY_NOT_MET", detail: message, step: "policy.age" };
  }
  if (message.includes("Nonce")) {
    return { status: 400, code: "INVALID_NONCE", detail: message, step: "vp.nonce" };
  }
  if (message.includes("Holder mismatch")) {
    return { status: 403, code: "HOLDER_MISMATCH", detail: message, step: "vp.holder" };
  }
  if (message.includes("Email credential not verified")) {
    return { status: 403, code: "EMAIL_NOT_VERIFIED", detail: message, step: "policy.email" };
  }
  if (message.includes("Age credential missing")) {
    return { status: 400, code: "MISSING_CREDENTIAL", detail: message, step: "vp.credentials" };
  }
  if (message.includes("Unknown DID")) {
    return { status: 403, code: "UNTRUSTED_ISSUER", detail: message, step: "issuer.resolve" };
  }
  if (message.includes("expired") || (error as any)?.code === "ERR_JWT_EXPIRED") {
    return { status: 401, code: "VP_EXPIRED", detail: message, step: "vp.expiry" };
  }
  if (message.includes("signature")) {
    return { status: 401, code: "PAYMENT_SIGNATURE_INVALID", detail: message, step: "payment.signature" };
  }
  return { status: 400, code: "INVALID_PROOF", detail: message, step: "vp.error" };
};

const decodePaymentEnvelope = (header: string): PaymentEnvelope => {
  try {
    const json = Buffer.from(header, "base64url").toString("utf-8");
    return JSON.parse(json) as PaymentEnvelope;
  } catch (error) {
    (error as any).challengeId = "unknown";
    throw new Error("Invalid payment envelope");
  }
};

const encodeBase64Url = <T>(payload: T) =>
  Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");

const verifyPaymentSignature = async (envelope: PaymentEnvelope) => {
  const { payload, signature, kid } = envelope;
  if (!kid) {
    const err: any = new Error("Payment signature missing kid");
    err.challengeId = payload.challengeId;
    throw err;
  }
  const did = payload.payer;
  if (!did) {
    const err: any = new Error("Payment payload missing payer");
    err.challengeId = payload.challengeId;
    throw err;
  }

  const document = (await sharedDid.loadDidDocument(did)) as DidDocument | null;
  if (!document) {
    const err: any = new Error(`Unknown payer DID: ${did}`);
    err.challengeId = payload.challengeId;
    throw err;
  }
  const method =
    document.verificationMethod.find((item) => item.id === kid) ?? document.verificationMethod[0];
  if (!method) {
    const err: any = new Error(`No verification method for DID ${did}`);
    err.challengeId = payload.challengeId;
    throw err;
  }
  const publicKey = fromBase58(method.publicKeyBase58);
  const signatureBytes = Buffer.from(signature, "base64url");
  const message = new TextEncoder().encode(JSON.stringify(payload));

  const verified = nacl.sign.detached.verify(message, signatureBytes, publicKey);
  if (!verified) {
    const err: any = new Error("Payment signature verification failed");
    err.challengeId = payload.challengeId;
    throw err;
  }
};
