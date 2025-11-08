import path from "node:path";
import { nanoid } from "nanoid";
import { decode, toBase58 } from "../crypto/index.js";
import { resolveAgnicIdPath } from "../env.js";
import { ensureDir, listDirectory, readFile, writeFile } from "../storage.js";
import type { DidDocument } from "./types.js";

export type MockDidRole = "human" | "agent" | "issuer";

const DID_PREFIX = "did:sol:agnic";

const didFilePath = (did: string) => {
  const slug = did.replace(/[:]/g, "_");
  return resolveAgnicIdPath("dids", `${slug}.json`);
};

export interface GenerateDidOptions {
  id?: string;
  keyFragment?: string;
}

export const generateDid = (
  role: MockDidRole,
  publicKeyBase64: string,
  options: GenerateDidOptions = {}
): DidDocument => {
  const identifier = options.id ?? `${DID_PREFIX}:${role}:${nanoid(12)}`;
  const fragment = options.keyFragment ?? "key-1";
  const verificationMethodId = `${identifier}#${fragment}`;
  const publicKeyBytes = decode(publicKeyBase64);
  return {
    id: identifier,
    verificationMethod: [
      {
        id: verificationMethodId,
        type: "Ed25519VerificationKey2020",
        controller: identifier,
        publicKeyBase58: toBase58(publicKeyBytes)
      }
    ],
    authentication: [verificationMethodId],
    assertionMethod: [verificationMethodId],
    capabilityDelegation: [verificationMethodId],
    capabilityInvocation: [verificationMethodId]
  };
};

export const saveDidDocument = async (document: DidDocument) => {
  const file = didFilePath(document.id);
  await ensureDir(path.dirname(file));
  await writeFile(file, JSON.stringify(document, null, 2), "utf-8");
  return file;
};

export const loadDidDocument = async (did: string): Promise<DidDocument | null> => {
  try {
    const file = didFilePath(did);
    const raw = await readFile(file, "utf-8");
    return JSON.parse(raw) as DidDocument;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
};

export const listDidDocuments = async (): Promise<DidDocument[]> => {
  const dir = resolveAgnicIdPath("dids");
  try {
    const entries = await listDirectory(dir);
    const documents: DidDocument[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) {
        continue;
      }
      const raw = await readFile(path.join(dir, entry), "utf-8");
      documents.push(JSON.parse(raw));
    }
    return documents;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
};
