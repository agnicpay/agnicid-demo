import { decode, encode, ensureKeypair as sharedEnsureKeypair, loadKeypair, saveKeypair } from "@agnicid/shared";
export const KEY_ALIASES = ["human", "agent", "issuer"];
export const getKeypair = (alias) => loadKeypair(alias);
export const ensureKeypair = (alias) => sharedEnsureKeypair(alias);
export const saveKeyAlias = (alias, keypair) => saveKeypair(alias, keypair);
export const toUint8Array = (key) => decode(key);
export const fromUint8Array = (bytes) => encode(bytes);
