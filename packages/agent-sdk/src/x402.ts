import axios from "axios";
import { nanoid } from "nanoid";
import { createPresentation } from "./presentation.js";
import { loadCredentialByKind } from "./store.js";
import { buildPaymentEnvelope } from "./payment.js";
import type {
  AgentEvent,
  PaymentEnvelope,
  PaymentResponse,
  X402Challenge
} from "./types.js";

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

type EventEmitter = (event: AgentEvent) => void;

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
  options: X402CallOptions = {},
  onEvent?: EventEmitter
): Promise<X402CallResult> => {
  const emit = (type: string, label: string, detail?: string, payload?: Record<string, unknown>) => {
    if (!onEvent) {
      return;
    }
    onEvent({
      id: nanoid(12),
      type,
      label,
      detail,
      payload,
      timestamp: new Date().toISOString()
    });
  };
  try {
    emit("request.initial", "Requesting protected resource", `GET ${jobsEndpoint}`, {
      url: jobsEndpoint
    });

    const initialResponse = await axios.get(jobsEndpoint, {
      validateStatus: () => true
    });

    emit("response.initial", "Seller responded", `Status ${initialResponse.status}`, {
      status: initialResponse.status,
      headers: initialResponse.headers,
      body: initialResponse.data
    });

    let challenge: X402Challenge;
    if (initialResponse.status === 402) {
      const header = initialResponse.headers["x-payment-required"] as string;
      challenge = header
        ? (JSON.parse(Buffer.from(header, "base64url").toString("utf-8")) as X402Challenge)
        : (initialResponse.data as X402Challenge);
    } else if (initialResponse.status === 200) {
      emit("response.complete", "Seller returned resource without payment", undefined, {
        status: initialResponse.status,
        body: initialResponse.data
      });
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
      emit("response.error", "Unexpected seller status", `Status ${initialResponse.status}`, {
        status: initialResponse.status
      });
      throw new Error(`Unexpected seller response: ${initialResponse.status}`);
    }

    const credentialKinds = uniqueCredentialKinds(
      challenge.claims ?? [],
      options.includeDelegation ?? true
    );
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

    emit("payment.created", "Payment envelope signed", undefined, {
      envelope: {
        payload: paymentEnvelopeResult.envelope.payload,
        kid: paymentEnvelopeResult.envelope.kid,
        signaturePreview: paymentEnvelopeResult.envelope.signature.slice(0, 32) + "..."
      }
    });

    const audience = new URL(jobsEndpoint).origin;

    const presentation = await createPresentation({
      credentials,
      challengeId: challenge.challengeId,
      audience
    });

    emit("presentation.created", "Verifiable presentation prepared", undefined, {
      holder: presentation.vpJwt.split(".")[1]?.length,
      preview: presentation.vpJwt.slice(0, 48) + "..."
    });

    emit("request.resubmit", "Resubmitting with proofs", undefined, {
      headers: {
        "X-PAYMENT": paymentEnvelopeResult.header.slice(0, 60) + "...",
        "X-PRESENTATION": presentation.vpJwt.slice(0, 60) + "..."
      }
    });

    const sellerResponse = await axios.get(jobsEndpoint, {
      headers: {
        "X-PAYMENT": paymentEnvelopeResult.header,
        "X-PRESENTATION": presentation.vpJwt
      },
      validateStatus: () => true
    });

    emit("response.final", "Seller responded to authenticated request", `Status ${sellerResponse.status}`, {
      status: sellerResponse.status,
      headers: sellerResponse.headers,
      body: sellerResponse.data
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
  } catch (error) {
    emit("flow.error", "Agent flow failed", (error as Error).message, {
      name: (error as Error).name
    });
    throw error;
  }
};
