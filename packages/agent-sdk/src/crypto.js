import { decode } from "@agnicid/shared";
import nacl from "tweetnacl";
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
export const signJwt = async (payload, options) => {
    const signer = new SignJWT(payload)
        .setProtectedHeader({ alg: "EdDSA", typ: "JWT", kid: options.kid })
        .setIssuedAt();
    if (options.audience) {
        signer.setAudience(options.audience);
    }
    if (options.expiration) {
        signer.setExpirationTime(options.expiration);
    }
    return signer.sign(options.key);
};
export const signDetached = (payload, secretKeyBase64) => {
    const secretKey = decode(secretKeyBase64);
    const signature = nacl.sign.detached(payload, secretKey);
    return Buffer.from(signature).toString("base64url");
};
