import type { DidDocument } from "./types.js";
export type MockDidRole = "human" | "agent" | "issuer";
export interface GenerateDidOptions {
    id?: string;
    keyFragment?: string;
}
export declare const generateDid: (role: MockDidRole, publicKeyBase64: string, options?: GenerateDidOptions) => DidDocument;
export declare const saveDidDocument: (document: DidDocument) => Promise<string>;
export declare const loadDidDocument: (did: string) => Promise<DidDocument | null>;
export declare const listDidDocuments: () => Promise<DidDocument[]>;
//# sourceMappingURL=mock-sol.d.ts.map