import { mkdirp } from "mkdirp";
import path from "node:path";
import { promises as fs } from "node:fs";
import { resolveAgnicIdPath } from "@agnicid/shared";
import { importEd25519Key, signJwt } from "./crypto.js";
import { ensureDid, getVerificationMethodId } from "./did.js";
import { ensureKeypair } from "./keys.js";

export interface PresentationInput {
  credentials: string[];
  challengeId: string;
  audience: string;
}

export interface PresentationResult {
  vpJwt: string;
  path: string;
}

const VP_CONTEXT = ["https://www.w3.org/2018/credentials/v1"];

export const createPresentation = async (input: PresentationInput): Promise<PresentationResult> => {
  const agentDid = await ensureDid("agent");
  const agentKey = await ensureKeypair("agent");
  const kid = getVerificationMethodId(agentDid);

  const key = await importEd25519Key({
    secretBase64: agentKey.secretKey,
    publicBase64: agentKey.publicKey,
    kid
  });

  const payload = {
    vp: {
      "@context": VP_CONTEXT,
      type: ["VerifiablePresentation"],
      holder: agentDid.id,
      verifiableCredential: input.credentials
    },
    nonce: input.challengeId,
    aud: input.audience
  };

  const vpJwt = await signJwt(payload, {
    key,
    kid,
    audience: input.audience,
    expiration: "5m"
  });

  const filePath = resolveAgnicIdPath("presentations", `vp-${Date.now()}.jwt`);
  await mkdirp(path.dirname(filePath));
  await fs.writeFile(filePath, vpJwt, "utf-8");

  return {
    vpJwt,
    path: filePath
  };
};
