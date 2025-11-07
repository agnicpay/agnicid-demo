export type VerificationRelationship = "authentication" | "assertionMethod" | "capabilityInvocation" | "capabilityDelegation" | "keyAgreement";
export interface VerificationMethod {
    id: string;
    type: string;
    controller: string;
    publicKeyBase58: string;
}
export interface DidDocument {
    id: string;
    verificationMethod: VerificationMethod[];
    authentication?: string[];
    assertionMethod?: string[];
    capabilityDelegation?: string[];
    capabilityInvocation?: string[];
    keyAgreement?: string[];
    service?: Array<{
        id: string;
        type: string;
        serviceEndpoint: string | string[];
    }>;
}
//# sourceMappingURL=types.d.ts.map