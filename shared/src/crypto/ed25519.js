import { mkdirp } from "mkdirp";
import { promises as fs } from "node:fs";
import path from "node:path";
import nacl from "tweetnacl";
import { getAgnicIdHome } from "../env.js";
const ENCODING = "base64";
export const encode = (bytes) => Buffer.from(bytes).toString(ENCODING);
export const decode = (encoded) => new Uint8Array(Buffer.from(encoded, ENCODING));
export const generateKeypair = (seed) => {
    const kp = seed ? nacl.sign.keyPair.fromSeed(seed) : nacl.sign.keyPair();
    return {
        publicKey: encode(kp.publicKey),
        secretKey: encode(kp.secretKey)
    };
};
const keyFilePath = (name) => path.join(getAgnicIdHome(), "keys", `${name}.key.json`);
export const saveKeypair = async (name, keypair) => {
    const filePath = keyFilePath(name);
    await mkdirp(path.dirname(filePath));
    const payload = {
        id: name,
        publicKey: keypair.publicKey,
        secretKey: keypair.secretKey,
        createdAt: new Date().toISOString()
    };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
    return filePath;
};
export const loadKeypair = async (name) => {
    try {
        const raw = await fs.readFile(keyFilePath(name), "utf-8");
        const parsed = JSON.parse(raw);
        return {
            publicKey: parsed.publicKey,
            secretKey: parsed.secretKey
        };
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    }
};
export const ensureKeypair = async (name) => {
    const existing = await loadKeypair(name);
    if (existing) {
        return existing;
    }
    const generated = generateKeypair();
    await saveKeypair(name, generated);
    return generated;
};
export const deriveKeypairFromSecret = (secret) => {
    const seed = decode(secret).slice(0, nacl.sign.seedLength);
    const derived = nacl.sign.keyPair.fromSeed(seed);
    return {
        publicKey: encode(derived.publicKey),
        secretKey: encode(derived.secretKey)
    };
};
//# sourceMappingURL=ed25519.js.map