import { fromBase58, did as sharedDid } from "@agnicid/shared";
import { importJWK, jwtVerify } from "jose";
const toBase64Url = (bytes) => Buffer.from(bytes).toString("base64url");
const VC_TYPES = {
    EMAIL: "EmailCredential",
    AGE: "AgeCredential",
    DELEGATION: "AgentDelegationCredential"
};
export const verifyPresentation = async (vpJwt, challenge, log, forceUnder18, audience) => {
    log("vp.received", "info", "Verifiable presentation received");
    const vpResult = await verifyJwt(vpJwt, challenge, log, audience);
    const credentials = vpResult.vp?.verifiableCredential;
    if (!Array.isArray(credentials) || credentials.length === 0) {
        throw new Error("VP missing embedded credentials");
    }
    const parsedCreds = await Promise.all(credentials.map((vcJwt) => verifyCredential(vcJwt, log)));
    const emailCredential = parsedCreds.find(isEmailCredential);
    const ageCredential = parsedCreds.find(isAgeCredential);
    const delegationCredential = parsedCreds.find(isDelegationCredential);
    if (!emailCredential) {
        throw new Error("Email credential missing");
    }
    if (!ageCredential) {
        throw new Error("Age credential missing");
    }
    if (!delegationCredential) {
        throw new Error("Delegation credential missing");
    }
    const emailVerified = emailCredential.payload.vc.credentialSubject.email_verified === true;
    const ageOver18 = ageCredential.payload.vc.credentialSubject.age_over_18 === true;
    const holder = vpResult.vp.holder;
    const delegationSubject = delegationCredential.payload.vc.credentialSubject.id;
    if (!emailVerified) {
        throw new Error("Email credential not verified");
    }
    if (!ageOver18) {
        throw new Error("Age policy not met");
    }
    if (forceUnder18) {
        throw new Error("Under-18 policy enforced");
    }
    if (holder !== delegationSubject) {
        throw new Error("Holder mismatch with delegation credential");
    }
    if (delegationCredential.payload.vc.credentialSubject.ownerEmail !== emailCredential.payload.vc.credentialSubject.email) {
        throw new Error("Delegation owner email does not match email credential");
    }
    log("policy.eval", "info", "Policy evaluation complete", {
        email_verified: emailVerified,
        age_over_18: ageOver18,
        holderMatchesDelegation: holder === delegationSubject,
        delegationOwnerMatches: delegationCredential.payload.vc.credentialSubject.ownerEmail ===
            emailCredential.payload.vc.credentialSubject.email,
        enforcedUnder18: forceUnder18
    });
    log("vp.verified", "success", "Presentation and credentials verified");
    return {
        email: emailCredential.payload.vc,
        age: ageCredential.payload.vc,
        delegation: delegationCredential.payload.vc,
        vp: vpResult
    };
};
const verifyJwt = async (vpJwt, challenge, log, audience) => {
    const vpHeader = decodeProtectedHeader(vpJwt);
    log("vp.header", "info", `VP kid ${vpHeader.kid ?? "unknown"}`);
    const holderDid = vpHeader.kid?.split("#")[0] ?? audience;
    const key = await loadVerificationKey(holderDid, vpHeader.kid);
    const verification = await jwtVerify(vpJwt, key, {
        audience
    });
    const payload = verification.payload;
    if (payload.nonce !== challenge.challengeId) {
        throw new Error("Nonce does not match challenge");
    }
    return payload;
};
const verifyCredential = async (vcJwt, log) => {
    const header = decodeProtectedHeader(vcJwt);
    const issuerDid = header.kid?.split("#")[0];
    if (!issuerDid) {
        throw new Error("Credential missing issuer kid");
    }
    const key = await loadVerificationKey(issuerDid, header.kid);
    const verification = await jwtVerify(vcJwt, key);
    const payload = verification.payload;
    const vcType = Array.isArray(payload.vc?.type) ? payload.vc.type[1] : "credential";
    log("vc.verified", "success", `Verified ${vcType} issued by ${issuerDid}`);
    return { payload, header };
};
const isEmailCredential = (record) => Array.isArray(record.payload.vc?.type) && record.payload.vc.type.includes(VC_TYPES.EMAIL);
const isAgeCredential = (record) => Array.isArray(record.payload.vc?.type) && record.payload.vc.type.includes(VC_TYPES.AGE);
const isDelegationCredential = (record) => Array.isArray(record.payload.vc?.type) && record.payload.vc.type.includes(VC_TYPES.DELEGATION);
const loadVerificationKey = async (did, expectedKid) => {
    const document = await sharedDid.loadDidDocument(did);
    if (!document) {
        throw new Error(`Unknown DID: ${did}`);
    }
    const method = selectVerificationMethod(document, expectedKid);
    const publicKeyBytes = fromBase58(method.publicKeyBase58);
    const jwk = {
        kty: "OKP",
        crv: "Ed25519",
        x: toBase64Url(publicKeyBytes),
        kid: method.id
    };
    return importJWK(jwk, "EdDSA");
};
const selectVerificationMethod = (document, expectedKid) => {
    if (expectedKid) {
        const match = document.verificationMethod.find((method) => method.id === expectedKid);
        if (match) {
            return match;
        }
    }
    const [primary] = document.verificationMethod;
    if (!primary) {
        throw new Error(`DID document ${document.id} missing verification method`);
    }
    return primary;
};
const decodeProtectedHeader = (jwt) => {
    const [encoded] = jwt.split(".");
    if (!encoded) {
        throw new Error("Malformed JWT");
    }
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
};
