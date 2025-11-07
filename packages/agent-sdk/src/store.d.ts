import type { StoredCredential } from "./types.js";
export declare const listStoredCredentials: () => Promise<StoredCredential[]>;
export declare const loadCredentialByKind: (kind: string) => Promise<StoredCredential<import("./types.js").BaseCredentialSubject>>;
//# sourceMappingURL=store.d.ts.map