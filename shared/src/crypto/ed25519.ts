import path from "node:path";
import nacl from "tweetnacl";
import { getAgnicIdHome } from "../env.js";
import { ensureDir, readFile, writeFile } from "../storage.js";

export interface Keypair {
  publicKey: string;
  secretKey: string;
}

const ENCODING: BufferEncoding = "base64";

export const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString(ENCODING);

export const decode = (encoded: string) => new Uint8Array(Buffer.from(encoded, ENCODING));

export const generateKeypair = (seed?: Uint8Array): Keypair => {
  const kp = seed ? nacl.sign.keyPair.fromSeed(seed) : nacl.sign.keyPair();
  return {
    publicKey: encode(kp.publicKey),
    secretKey: encode(kp.secretKey)
  };
};

const keyFilePath = (name: string) => path.join(getAgnicIdHome(), "keys", `${name}.key.json`);

export const saveKeypair = async (name: string, keypair: Keypair) => {
  const filePath = keyFilePath(name);
  await ensureDir(path.dirname(filePath));
  const payload = {
    id: name,
    publicKey: keypair.publicKey,
    secretKey: keypair.secretKey,
    createdAt: new Date().toISOString()
  };
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
  return filePath;
};

export const loadKeypair = async (name: string): Promise<Keypair | null> => {
  try {
    const raw = await readFile(keyFilePath(name), "utf-8");
    const parsed = JSON.parse(raw);
    return {
      publicKey: parsed.publicKey,
      secretKey: parsed.secretKey
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
};

export const ensureKeypair = async (name: string) => {
  const existing = await loadKeypair(name);
  if (existing) {
    return existing;
  }
  const generated = generateKeypair();
  await saveKeypair(name, generated);
  return generated;
};

export const deriveKeypairFromSecret = (secret: string): Keypair => {
  const seed = decode(secret).slice(0, nacl.sign.seedLength);
  const derived = nacl.sign.keyPair.fromSeed(seed);
  return {
    publicKey: encode(derived.publicKey),
    secretKey: encode(derived.secretKey)
  };
};
