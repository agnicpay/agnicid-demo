import type { DidDocument } from "@agnicid/shared";
import type { KeyAlias } from "./keys.js";
type DidAlias = KeyAlias;
export declare const requireDid: (alias: DidAlias) => Promise<DidDocument>;
export declare const resolveDid: (did: string) => Promise<DidDocument | null>;
export declare const listDids: () => Promise<DidDocument[]>;
export declare const getVerificationMethodId: (document: DidDocument) => string;
export {};
//# sourceMappingURL=did.d.ts.map