import axios from "axios";
import { createPresentation } from "./presentation.js";
import { loadCredentialByKind } from "./store.js";
import { buildPaymentEnvelope } from "./payment.js";
import type { PaymentEnvelope, PaymentResponse, X402Challenge } from "./types.js";

const CLAIM_TO_KIND: Record<string, string> = {
  email_verified: "email",
  age_over_18: "age"
};

export interface X402CallResult {
  challenge: X402Challenge;
  paymentEnvelope: PaymentEnvelope;
  vpJwt: string;
  response: {
    status: number;
    data: unknown;
    paymentResponse?: PaymentResponse;
  };
}

export interface X402CallOptions {
  includeDelegation?: boolean;
}

const uniqueCredentialKinds = (claims: string[], includeDelegation: boolean) => {
  const kinds = new Set<string>();
  if (includeDelegation) {
    kinds.add("delegation");
  }
  for (const claim of claims) {
    const kind = CLAIM_TO_KIND[claim];
    if (kind) {
      kinds.add(kind);
    }
  }
  return Array.from(kinds);
};

export const executeX402Flow = async (
  jobsEndpoint: string,
  options: X402CallOptions = {}
): Promise<X402CallResult> => {
  const initialResponse = await axios.get(jobsEndpoint, {
    validateStatus: () => true
  });

  let challenge: X402Challenge;
  if (initialResponse.status === 402) {
    const header = initialResponse.headers["x-payment-required"] as string;
    challenge = header
      ? (JSON.parse(Buffer.from(header, "base64url").toString("utf-8")) as X402Challenge)
      : (initialResponse.data as X402Challenge);
  } else if (initialResponse.status === 200) {
    return {
      challenge: initialResponse.data.challenge ?? ({} as X402Challenge),
      paymentEnvelope: {} as PaymentEnvelope,
      vpJwt: "",
      response: {
        status: initialResponse.status,
        data: initialResponse.data
      }
    };
  } else {
    throw new Error(`Unexpected seller response: ${initialResponse.status}`);
  }

  const credentialKinds = uniqueCredentialKinds(challenge.claims ?? [], options.includeDelegation ?? true);
  const credentials: string[] = [];

  for (const kind of credentialKinds) {
    const credential = await loadCredentialByKind(kind);
    if (!credential) {
      throw new Error(`Missing credential for ${kind}. Run vc:issue first.`);
    }
    credentials.push(credential.jwt);
  }

  const paymentEnvelopeResult = await buildPaymentEnvelope({
    challengeId: challenge.challengeId,
    amount: challenge.amount,
    asset: challenge.asset
  });

  const audience = new URL(jobsEndpoint).origin;

  const presentation = await createPresentation({
    credentials,
    challengeId: challenge.challengeId,
    audience
  });

  const sellerResponse = await axios.get(jobsEndpoint, {
    headers: {
      "X-PAYMENT": paymentEnvelopeResult.header,
      "X-PRESENTATION": presentation.vpJwt
    },
    validateStatus: () => true
  });

  const paymentResponseHeader = sellerResponse.headers["x-payment-response"] as string | undefined;
  const paymentResponse = paymentResponseHeader
    ? (JSON.parse(Buffer.from(paymentResponseHeader, "base64url").toString("utf-8")) as PaymentResponse)
    : undefined;

  return {
    challenge,
    paymentEnvelope: paymentEnvelopeResult.envelope,
    vpJwt: presentation.vpJwt,
    response: {
      status: sellerResponse.status,
      data: sellerResponse.data,
      paymentResponse
    }
  };
};
