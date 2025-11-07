import type { PaymentEnvelope, PaymentPayload } from "./types.js";
export declare const buildPaymentEnvelope: (payload: Omit<PaymentPayload, "payer" | "nonce" | "timestamp">) => Promise<{
    envelope: PaymentEnvelope;
    header: string;
}>;
//# sourceMappingURL=payment.d.ts.map