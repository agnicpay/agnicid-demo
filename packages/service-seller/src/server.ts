import cors from "cors";
import express from "express";
import path from "node:path";
import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { nanoid } from "nanoid";
import { fileURLToPath } from "node:url";
import { verifyPresentation } from "./verification.js";
import type { Challenge, ConsoleState, PaymentProof, VerificationLog } from "./types.js";

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

const buildChallenge = (req: express.Request): Challenge => {
  const origin = `${req.protocol}://${req.get("host")}`;
  const challengeId = `c-${nanoid(6)}`;
  return {
    challengeId,
    amount: BASE_AMOUNT,
    asset: BASE_ASSET,
    claims: CLAIMS,
    vpFormat: "jwt_vp",
    paymentEndpoint: `${origin}/pay`,
    acceptEndpoint: `${origin}/redeem`,
    createdAt: new Date().toISOString(),
    forceUnder18,
    paymentProof: undefined
  };
};

app.get("/jobs", (req, res) => {
  const challenge = buildChallenge(req);
  challenges.set(challenge.challengeId, challenge);
  recordLog(challenge.challengeId, "challenge.issued", "info", "HTTP 402 challenge issued");
  res.status(402).json({
    challengeId: challenge.challengeId,
    amount: challenge.amount,
    asset: challenge.asset,
    claims: challenge.claims,
    vpFormat: challenge.vpFormat,
    paymentEndpoint: challenge.paymentEndpoint,
    acceptEndpoint: challenge.acceptEndpoint
  });
});

app.post("/pay", (req, res) => {
  const challengeId = req.body?.challengeId;
  const amount = req.body?.amount;
  const asset = req.body?.asset;
  if (!challengeId || !amount || !asset) {
    return res.status(400).json({ error: "Invalid payment request" });
  }
  const challenge = challenges.get(challengeId);
  if (!challenge) {
    return res.status(404).json({ error: "Unknown challenge" });
  }
  if (challenge.amount !== amount || challenge.asset !== asset) {
    recordLog(challengeId, "payment.error", "error", "Payment amount or asset mismatch");
    return res.status(402).json({ error: "PAYMENT_REQUIRED" });
  }
  const paymentProof: PaymentProof = {
    txId: `tx-${nanoid(8)}`,
    amount,
    asset
  };
  challenge.paymentProof = paymentProof;
  recordLog(challengeId, "payment.accepted", "success", `Payment accepted with txId ${paymentProof.txId}`);
  res.json(paymentProof);
});

app.post("/redeem", async (req, res) => {
  const { challengeId, paymentProof, vp_jwt: vpJwt } = req.body ?? {};
  if (!challengeId || !vpJwt) {
    return res.status(400).json({ error: "INVALID_REQUEST" });
  }
  const challenge = challenges.get(challengeId);
  if (!challenge) {
    return res.status(404).json({ error: "UNKNOWN_CHALLENGE" });
  }

  if (!challenge.paymentProof) {
    recordLog(challengeId, "payment.missing", "error", "No payment proof on record");
    return res.status(402).json({ error: "PAYMENT_REQUIRED" });
  }

  if (!isMatchingPayment(paymentProof, challenge.paymentProof)) {
    recordLog(challengeId, "payment.mismatch", "error", "Payment proof mismatch");
    return res.status(402).json({ error: "PAYMENT_REQUIRED" });
  }

  try {
    const outcome = await verifyPresentation(
      vpJwt,
      challenge,
      (step, status, detail) => recordLog(challengeId, step, status, detail),
      forceUnder18
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
    recordLog(challengeId, "redeem.success", "success", "Proof validated and resource served");
    res.json(responsePayload);
  } catch (error) {
    const mapped = mapVerificationError(error);
    recordLog(challengeId, mapped.step, "error", mapped.detail);
    res.status(mapped.status).json({ error: mapped.code });
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

const isMatchingPayment = (submitted: PaymentProof, stored: PaymentProof) => {
  return (
    submitted?.amount === stored.amount &&
    submitted?.asset === stored.asset &&
    submitted?.txId === stored.txId
  );
};

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
  return { status: 400, code: "INVALID_PROOF", detail: message, step: "vp.error" };
};
