import { decode } from "@agnicid/shared";
import { importJWK, SignJWT } from "jose";
const toBase64Url = (bytes) => Buffer.from(bytes).toString("base64url");
export const importEd25519Key = async (params) => {
    const secretBytes = decode(params.secretBase64);
    const publicBytes = decode(params.publicBase64);
    const jwk = {
        kty: "OKP",
        crv: "Ed25519",
        d: toBase64Url(secretBytes.slice(0, 32)),
        x: toBase64Url(publicBytes),
        kid: params.kid
    };
    return importJWK(jwk, "EdDSA");
};
export const signJwtVc = async (payload, options) => {
    const signer = new SignJWT(payload).setProtectedHeader({
        alg: "EdDSA",
        typ: "JWT",
        kid: options.kid
    });
    signer.setIssuedAt();
    signer.setExpirationTime(options.expiration ?? "10m");
    return signer.sign(options.key);
};
