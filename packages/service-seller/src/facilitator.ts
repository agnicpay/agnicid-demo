import { nanoid } from "nanoid";
import type { Challenge } from "./types.js";

export interface PaymentPayload {
  challengeId: string;
  amount: string;
  asset: string;
  payer: string;
  nonce: string;
  timestamp: string;
}

export interface PaymentEnvelope {
  payload: PaymentPayload;
  signature: string;
  kid: string;
  txId?: string;
}

export interface SettlementResult {
  status: "settled" | "rejected";
  txId: string;
  settledAt: string;
}

export const verifyPaymentWithFacilitator = (
  challenge: Challenge,
  envelope: PaymentEnvelope
): SettlementResult => {
  const { payload } = envelope;
  if (payload.challengeId !== challenge.challengeId) {
    throw new Error("Payment challenge mismatch");
  }
  if (payload.amount !== challenge.amount || payload.asset !== challenge.asset) {
    throw new Error("Payment terms mismatch");
  }
  const txId = envelope.txId ?? `fac-${nanoid(10)}`;
  return {
    status: "settled",
    txId,
    settledAt: new Date().toISOString()
  };
};
