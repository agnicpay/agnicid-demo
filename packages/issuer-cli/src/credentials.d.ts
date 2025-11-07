import type { BaseCredentialSubject, AgentDelegationCredential, AgeCredential, EmailCredential, StoredCredential } from "./types.js";
export declare const issueEmailCredential: (input: {
    subjectDid: string;
    email: string;
    emailVerified?: boolean;
}) => Promise<{
    jwt: string;
    credential: EmailCredential | AgeCredential | AgentDelegationCredential;
    stored: StoredCredential<BaseCredentialSubject>;
}>;
export declare const issueAgeCredential: (input: {
    subjectDid: string;
    birthDate: string;
}) => Promise<{
    jwt: string;
    credential: EmailCredential | AgeCredential | AgentDelegationCredential;
    stored: StoredCredential<BaseCredentialSubject>;
}>;
export declare const issueDelegationCredential: (input: {
    ownerDid: string;
    agentDid: string;
    ownerEmail: string;
    spendCapDaily?: string;
}) => Promise<{
    jwt: string;
    credential: EmailCredential | AgeCredential | AgentDelegationCredential;
    stored: StoredCredential<BaseCredentialSubject>;
}>;
