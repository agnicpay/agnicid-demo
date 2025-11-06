import {
  Keypair,
  decode,
  encode,
  ensureKeypair as sharedEnsureKeypair,
  loadKeypair,
  saveKeypair
} from "@agnicid/shared";

export type KeyAlias = "human" | "agent" | "issuer";

export const KEY_ALIASES: KeyAlias[] = ["human", "agent", "issuer"];

export const getKeypair = (alias: KeyAlias) => loadKeypair(alias);

export const ensureKeypair = (alias: KeyAlias) => sharedEnsureKeypair(alias);

export const saveKeyAlias = (alias: KeyAlias, keypair: Keypair) => saveKeypair(alias, keypair);

export const toUint8Array = (key: string) => decode(key);

export const fromUint8Array = (bytes: Uint8Array) => encode(bytes);
