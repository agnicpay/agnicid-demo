import axios from "axios";
import { createPresentation } from "./presentation.js";
import { loadCredentialByKind } from "./store.js";
import type { RedeemPayload, X402Challenge } from "./types.js";

const CLAIM_TO_KIND: Record<string, string> = {
  email_verified: "email",
  age_over_18: "age"
};

export interface X402CallResult {
  challenge: X402Challenge;
  paymentProof: { txId: string; amount: string; asset: string };
  vpJwt: string;
  redeemResponse: {
    status: number;
    data: unknown;
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

export const executeX402Flow = async (jobsEndpoint: string, options: X402CallOptions = {}): Promise<X402CallResult> => {
  const jobsResponse = await axios.get(jobsEndpoint, {
    validateStatus: () => true
  });

  if (jobsResponse.status !== 402) {
    throw new Error(`Expected 402 from seller, received ${jobsResponse.status}`);
  }

  const challenge = jobsResponse.data as X402Challenge;
  const paymentResponse = await axios.post(
    challenge.paymentEndpoint,
    {
      amount: challenge.amount,
      asset: challenge.asset,
      challengeId: challenge.challengeId
    },
    {
      validateStatus: () => true
    }
  );

  if (paymentResponse.status !== 200) {
    throw new Error(`Payment endpoint returned ${paymentResponse.status}`);
  }

  const paymentProof = paymentResponse.data as { txId: string; amount: string; asset: string };

  const credentialKinds = uniqueCredentialKinds(challenge.claims ?? [], options.includeDelegation ?? true);
  const credentials: string[] = [];

  for (const kind of credentialKinds) {
    const credential = await loadCredentialByKind(kind);
    if (!credential) {
      throw new Error(`Missing credential for ${kind}. Run vc:issue first.`);
    }
    credentials.push(credential.jwt);
  }

  const audience = new URL(challenge.acceptEndpoint).origin;

  const presentation = await createPresentation({
    credentials,
    challengeId: challenge.challengeId,
    audience
  });

  const redeemPayload: RedeemPayload = {
    challengeId: challenge.challengeId,
    paymentProof,
    vp_jwt: presentation.vpJwt
  };

  const redeemResponse = await axios.post(challenge.acceptEndpoint, redeemPayload, {
    validateStatus: () => true
  });

  return {
    challenge,
    paymentProof,
    vpJwt: presentation.vpJwt,
    redeemResponse: {
      status: redeemResponse.status,
      data: redeemResponse.data
    }
  };
};
