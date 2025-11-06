import { decode } from "@agnicid/shared";
import { importJWK, JWK, JWTPayload, SignJWT } from "jose";

const toBase64Url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

export const importEd25519Key = async (params: { secretBase64: string; publicBase64: string; kid: string }) => {
  const secretBytes = decode(params.secretBase64);
  const publicBytes = decode(params.publicBase64);
  const jwk: JWK = {
    kty: "OKP",
    crv: "Ed25519",
    d: toBase64Url(secretBytes.slice(0, 32)),
    x: toBase64Url(publicBytes),
    kid: params.kid
  };
  return importJWK(jwk, "EdDSA");
};

export const signJwtVc = async (
  payload: JWTPayload,
  options: { key: Awaited<ReturnType<typeof importEd25519Key>>; kid: string; expiration?: string }
) => {
  const signer = new SignJWT(payload).setProtectedHeader({
    alg: "EdDSA",
    typ: "JWT",
    kid: options.kid
  });
  signer.setIssuedAt();
  signer.setExpirationTime(options.expiration ?? "10m");
  return signer.sign(options.key);
};

export const signJwt = async (
  payload: JWTPayload,
  options: { key: Awaited<ReturnType<typeof importEd25519Key>>; audience?: string; expiration?: string; kid: string }
) => {
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
