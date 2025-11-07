import type { DidDocument } from "@agnicid/shared";
import { KeyAlias } from "./keys.js";
type DidAlias = KeyAlias;
export declare const ensureDid: (alias: DidAlias) => Promise<DidDocument>;
export declare const getDid: (alias: DidAlias) => Promise<DidDocument | null>;
export declare const resolveDid: (did: string) => Promise<DidDocument | null>;
export declare const listDids: () => Promise<DidDocument[]>;
export declare const getVerificationMethodId: (document: DidDocument) => string;
export {};
