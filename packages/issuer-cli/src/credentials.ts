import path from "node:path";
import { nanoid } from "nanoid";
import { ensureDir, resolveAgnicIdPath, writeFile as writeStorageFile } from "@agnicid/shared";
import { importEd25519Key, signJwtVc } from "./crypto.js";
import { ensureKeypair } from "./keys.js";
import { ensureDid, getVerificationMethodId } from "./did.js";
import { writeJson } from "./fs.js";
import type {
  BaseCredentialSubject,
  AgentDelegationCredential,
  AgentDelegationCredentialSubject,
  AgeCredential,
  AgeCredentialSubject,
  EmailCredential,
  EmailCredentialSubject,
  StoredCredential
} from "./types.js";

type CredentialKind = "email" | "age" | "delegation";

const VC_CONTEXT = ["https://www.w3.org/2018/credentials/v1"];

const credentialFile = (slug: string, ext: "json" | "jwt" = "json") =>
  resolveAgnicIdPath("vcs", `${slug}.${ext}`);

const persistCredential = async <TSubject extends BaseCredentialSubject>(
  slug: string,
  vc: any,
  jwt: string
): Promise<StoredCredential<TSubject>> => {
  const uniqueSlug = `${slug}-${Date.now()}-${nanoid(6)}`;
  const filePath = credentialFile(uniqueSlug, "json");
  await ensureDir(path.dirname(filePath));
  const record = {
    id: vc.id,
    type: vc.type.join(","),
    issuedAt: vc.issuanceDate,
    jwt,
    payload: vc,
    path: filePath,
    kind: slug
  };
  await writeJson(filePath, {
    credential: vc,
    jwt
  });
  const jwtFile = credentialFile(uniqueSlug, "jwt");
  await writeStorageFile(jwtFile, jwt, "utf-8");
  return record;
};

const nowIso = () => new Date().toISOString();

const createBaseCredential = <TSubject extends BaseCredentialSubject>(
  types: string[],
  issuer: string,
  subject: TSubject,
  overrides?: Partial<Omit<EmailCredential, "credentialSubject">>
) => {
  const issuanceDate = nowIso();
  return {
    "@context": VC_CONTEXT,
    type: ["VerifiableCredential", ...types],
    issuer,
    issuanceDate,
    id: `urn:uuid:${nanoid(16)}`,
    credentialSubject: subject,
    ...overrides
  };
};

const signCredential = async ({
  credential,
  kid,
  signerPublicKey,
  signerSecretKey,
  kind
}: {
  credential: EmailCredential | AgeCredential | AgentDelegationCredential;
  kid: string;
  signerPublicKey: string;
  signerSecretKey: string;
  kind: CredentialKind;
}) => {
  const key = await importEd25519Key({
    secretBase64: signerSecretKey,
    publicBase64: signerPublicKey,
    kid
  });

  const jwtPayload = {
    iss: credential.issuer,
    sub: credential.credentialSubject.id,
    nbf: Math.floor(Date.now() / 1000),
    vc: credential
  };

  const jwt = await signJwtVc(jwtPayload, {
    key,
    kid
  });

  credential.proof = {
    type: "Ed25519Signature2020",
    created: nowIso(),
    verificationMethod: kid,
    proofPurpose: "assertionMethod",
    jwt
  };

  const stored = await persistCredential(kind, credential, jwt);
  return {
    jwt,
    credential,
    stored
  };
};

export const issueEmailCredential = async (input: {
  subjectDid: string;
  email: string;
  emailVerified?: boolean;
}) => {
  const issuerDid = await ensureDid("issuer");
  const issuerKey = await ensureKeypair("issuer");
  const kid = getVerificationMethodId(issuerDid);

  const subject: EmailCredentialSubject = {
    id: input.subjectDid,
    email: input.email,
    email_verified: input.emailVerified ?? true
  };

  const credential = createBaseCredential<EmailCredentialSubject>(["EmailCredential"], issuerDid.id, subject);

  return signCredential({
    credential,
    kid,
    signerPublicKey: issuerKey.publicKey,
    signerSecretKey: issuerKey.secretKey,
    kind: "email"
  });
};

export const issueAgeCredential = async (input: {
  subjectDid: string;
  birthDate: string;
}) => {
  const issuerDid = await ensureDid("issuer");
  const issuerKey = await ensureKeypair("issuer");
  const kid = getVerificationMethodId(issuerDid);

  const birthDate = new Date(input.birthDate);
  if (Number.isNaN(birthDate.getTime())) {
    throw new Error("Invalid birthDate");
  }
  const ageOver18 = isOver18(birthDate);

  const subject: AgeCredentialSubject = {
    id: input.subjectDid,
    birthDate: birthDate.toISOString().slice(0, 10),
    age_over_18: ageOver18
  };

  const credential = createBaseCredential<AgeCredentialSubject>(["AgeCredential"], issuerDid.id, subject);

  return signCredential({
    credential,
    kid,
    signerPublicKey: issuerKey.publicKey,
    signerSecretKey: issuerKey.secretKey,
    kind: "age"
  });
};

export const issueDelegationCredential = async (input: {
  ownerDid: string;
  agentDid: string;
  ownerEmail: string;
  spendCapDaily?: string;
}) => {
  const humanDid = await ensureDid("human");
  const humanKey = await ensureKeypair("human");
  const kid = getVerificationMethodId(humanDid);

  const subject: AgentDelegationCredentialSubject = {
    id: input.agentDid,
    capabilities: {
      paymentProtocols: ["x402"],
      spendCapDaily: input.spendCapDaily ?? "100 USDC"
    },
    ownerEmail: input.ownerEmail
  };

  const credential = createBaseCredential<AgentDelegationCredentialSubject>(
    ["AgentDelegationCredential"],
    input.ownerDid,
    subject
  );

  return signCredential({
    credential,
    kid,
    signerPublicKey: humanKey.publicKey,
    signerSecretKey: humanKey.secretKey,
    kind: "delegation"
  });
};

const isOver18 = (birthDate: Date) => {
  const today = new Date();
  const age = today.getFullYear() - birthDate.getFullYear();
  if (age > 18) {
    return true;
  }
  if (age < 18) {
    return false;
  }
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff > 0) {
    return true;
  }
  if (monthDiff < 0) {
    return false;
  }
  return today.getDate() >= birthDate.getDate();
};
