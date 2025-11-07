import { encode } from "@agnicid/shared";
import { randomBytes } from "node:crypto";
import { requireKeypair } from "./keys.js";
import { getVerificationMethodId, requireDid } from "./did.js";
import { signDetached } from "./crypto.js";
export const buildPaymentEnvelope = async (payload) => {
    const agentDid = await requireDid("agent");
    const agentKey = await requireKeypair("agent");
    const kid = getVerificationMethodId(agentDid);
    const fullPayload = {
        ...payload,
        payer: agentDid.id,
        nonce: encode(new Uint8Array(randomBytes(16))),
        timestamp: new Date().toISOString()
    };
    const message = new TextEncoder().encode(JSON.stringify(fullPayload));
    const signature = signDetached(message, agentKey.secretKey);
    const envelope = {
        payload: fullPayload,
        signature,
        kid
    };
    return {
        envelope,
        header: Buffer.from(JSON.stringify(envelope)).toString("base64url")
    };
};
//# sourceMappingURL=payment.js.map