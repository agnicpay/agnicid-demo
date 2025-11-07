import { JWTPayload } from "jose";
export declare const importEd25519Key: (params: {
    secretBase64: string;
    publicBase64: string;
    kid: string;
}) => Promise<Uint8Array<ArrayBufferLike> | import("jose").KeyLike>;
export declare const signJwtVc: (payload: JWTPayload, options: {
    key: Awaited<ReturnType<typeof importEd25519Key>>;
    kid: string;
    expiration?: string;
}) => Promise<string>;
export declare const signJwt: (payload: JWTPayload, options: {
    key: Awaited<ReturnType<typeof importEd25519Key>>;
    audience?: string;
    expiration?: string;
    kid: string;
}) => Promise<string>;
export declare const signDetached: (payload: Uint8Array, secretKeyBase64: string) => string;
//# sourceMappingURL=crypto.d.ts.map