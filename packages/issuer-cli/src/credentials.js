import { mkdirp } from "mkdirp";
import path from "node:path";
import { promises as fs } from "node:fs";
import { nanoid } from "nanoid";
import { resolveAgnicIdPath } from "@agnicid/shared";
import { importEd25519Key, signJwtVc } from "./crypto.js";
import { ensureKeypair } from "./keys.js";
import { ensureDid, getVerificationMethodId } from "./did.js";
import { writeJson } from "./fs.js";
const VC_CONTEXT = ["https://www.w3.org/2018/credentials/v1"];
const credentialFile = (slug, ext = "json") => resolveAgnicIdPath("vcs", `${slug}.${ext}`);
const persistCredential = async (slug, vc, jwt) => {
    const uniqueSlug = `${slug}-${Date.now()}-${nanoid(6)}`;
    const filePath = credentialFile(uniqueSlug, "json");
    await mkdirp(path.dirname(filePath));
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
    await fs.writeFile(jwtFile, jwt, "utf-8");
    return record;
};
const nowIso = () => new Date().toISOString();
const createBaseCredential = (types, issuer, subject, overrides) => {
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
const signCredential = async ({ credential, kid, signerPublicKey, signerSecretKey, kind }) => {
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
export const issueEmailCredential = async (input) => {
    const issuerDid = await ensureDid("issuer");
    const issuerKey = await ensureKeypair("issuer");
    const kid = getVerificationMethodId(issuerDid);
    const subject = {
        id: input.subjectDid,
        email: input.email,
        email_verified: input.emailVerified ?? true
    };
    const credential = createBaseCredential(["EmailCredential"], issuerDid.id, subject);
    return signCredential({
        credential,
        kid,
        signerPublicKey: issuerKey.publicKey,
        signerSecretKey: issuerKey.secretKey,
        kind: "email"
    });
};
export const issueAgeCredential = async (input) => {
    const issuerDid = await ensureDid("issuer");
    const issuerKey = await ensureKeypair("issuer");
    const kid = getVerificationMethodId(issuerDid);
    const birthDate = new Date(input.birthDate);
    if (Number.isNaN(birthDate.getTime())) {
        throw new Error("Invalid birthDate");
    }
    const ageOver18 = isOver18(birthDate);
    const subject = {
        id: input.subjectDid,
        birthDate: birthDate.toISOString().slice(0, 10),
        age_over_18: ageOver18
    };
    const credential = createBaseCredential(["AgeCredential"], issuerDid.id, subject);
    return signCredential({
        credential,
        kid,
        signerPublicKey: issuerKey.publicKey,
        signerSecretKey: issuerKey.secretKey,
        kind: "age"
    });
};
export const issueDelegationCredential = async (input) => {
    const humanDid = await ensureDid("human");
    const humanKey = await ensureKeypair("human");
    const kid = getVerificationMethodId(humanDid);
    const subject = {
        id: input.agentDid,
        capabilities: {
            paymentProtocols: ["x402"],
            spendCapDaily: input.spendCapDaily ?? "100 USDC"
        },
        ownerEmail: input.ownerEmail
    };
    const credential = createBaseCredential(["AgentDelegationCredential"], input.ownerDid, subject);
    return signCredential({
        credential,
        kid,
        signerPublicKey: humanKey.publicKey,
        signerSecretKey: humanKey.secretKey,
        kind: "delegation"
    });
};
const isOver18 = (birthDate) => {
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
