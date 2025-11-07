import type { AgentEvent, PaymentEnvelope, PaymentResponse, X402Challenge } from "./types.js";
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
export declare const executeX402Flow: (jobsEndpoint: string, options?: X402CallOptions, onEvent?: EventEmitter) => Promise<X402CallResult>;
export {};
//# sourceMappingURL=x402.d.ts.map