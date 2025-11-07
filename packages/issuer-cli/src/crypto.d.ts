import { JWTPayload } from "jose";
export declare const importEd25519Key: (params: {
    secretBase64: string;
    publicBase64: string;
    kid: string;
}) => Promise<import("jose").KeyLike | Uint8Array<ArrayBufferLike>>;
export declare const signJwtVc: (payload: JWTPayload, options: {
    key: Awaited<ReturnType<typeof importEd25519Key>>;
    kid: string;
    expiration?: string;
}) => Promise<string>;
