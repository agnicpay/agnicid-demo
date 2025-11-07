export interface CredentialStatus {
    id: string;
    type: string;
}
export interface BaseCredentialSubject {
    id: string;
}
export interface BaseVc<TSubject extends BaseCredentialSubject> {
    "@context": string[];
    type: string[];
    issuer: string;
    issuanceDate: string;
    id?: string;
    credentialSubject: TSubject;
    expirationDate?: string;
    proof?: {
        type: string;
        created: string;
        verificationMethod: string;
        proofPurpose: string;
        jwt?: string;
    };
}
export interface EmailCredentialSubject extends BaseCredentialSubject {
    email: string;
    email_verified: boolean;
}
export interface AgeCredentialSubject extends BaseCredentialSubject {
    birthDate: string;
    age_over_18: boolean;
}
export interface DelegationCapabilities {
    paymentProtocols: string[];
    spendCapDaily: string;
}
export interface AgentDelegationCredentialSubject extends BaseCredentialSubject {
    capabilities: DelegationCapabilities;
    ownerEmail: string;
}
export type EmailCredential = BaseVc<EmailCredentialSubject>;
export type AgeCredential = BaseVc<AgeCredentialSubject>;
export type AgentDelegationCredential = BaseVc<AgentDelegationCredentialSubject>;
export interface StoredCredential<T extends BaseCredentialSubject = BaseCredentialSubject> {
    id: string;
    type: string;
    jwt: string;
    payload: BaseVc<T>;
    issuedAt: string;
    path: string;
    kind?: string;
}
export interface X402Challenge {
    challengeId: string;
    amount: string;
    asset: string;
    claims: string[];
    vpFormat: "jwt_vp";
    nonce?: string;
}
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
export interface PaymentResponse {
    status: "settled" | "rejected";
    txId: string;
    settledAt: string;
}
export interface AgentEvent {
    id: string;
    type: string;
    label: string;
    detail?: string;
    payload?: Record<string, unknown>;
    timestamp: string;
}
//# sourceMappingURL=types.d.ts.map