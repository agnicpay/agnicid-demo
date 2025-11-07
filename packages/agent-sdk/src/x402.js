import axios from "axios";
import { nanoid } from "nanoid";
import { createPresentation } from "./presentation.js";
import { loadCredentialByKind } from "./store.js";
import { buildPaymentEnvelope } from "./payment.js";
const CLAIM_TO_KIND = {
    email_verified: "email",
    age_over_18: "age"
};
const uniqueCredentialKinds = (claims, includeDelegation) => {
    const kinds = new Set();
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
export const executeX402Flow = async (jobsEndpoint, options = {}, onEvent) => {
    const emit = (type, label, detail, payload) => {
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
        let challenge;
        if (initialResponse.status === 402) {
            const header = initialResponse.headers["x-payment-required"];
            challenge = header
                ? JSON.parse(Buffer.from(header, "base64url").toString("utf-8"))
                : initialResponse.data;
        }
        else if (initialResponse.status === 200) {
            emit("response.complete", "Seller returned resource without payment", undefined, {
                status: initialResponse.status,
                body: initialResponse.data
            });
            return {
                challenge: initialResponse.data.challenge ?? {},
                paymentEnvelope: {},
                vpJwt: "",
                response: {
                    status: initialResponse.status,
                    data: initialResponse.data
                }
            };
        }
        else {
            emit("response.error", "Unexpected seller status", `Status ${initialResponse.status}`, {
                status: initialResponse.status
            });
            throw new Error(`Unexpected seller response: ${initialResponse.status}`);
        }
        const credentialKinds = uniqueCredentialKinds(challenge.claims ?? [], options.includeDelegation ?? true);
        const credentials = [];
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
        const paymentResponseHeader = sellerResponse.headers["x-payment-response"];
        const paymentResponse = paymentResponseHeader
            ? JSON.parse(Buffer.from(paymentResponseHeader, "base64url").toString("utf-8"))
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
    }
    catch (error) {
        emit("flow.error", "Agent flow failed", error.message, {
            name: error.name
        });
        throw error;
    }
};
