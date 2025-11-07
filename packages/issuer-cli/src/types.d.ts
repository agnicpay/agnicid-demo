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
