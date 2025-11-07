import { nanoid } from "nanoid";
export const verifyPaymentWithFacilitator = (challenge, envelope) => {
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
