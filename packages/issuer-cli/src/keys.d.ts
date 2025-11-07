import { Keypair } from "@agnicid/shared";
export type KeyAlias = "human" | "agent" | "issuer";
export declare const KEY_ALIASES: KeyAlias[];
export declare const getKeypair: (alias: KeyAlias) => Promise<Keypair | null>;
export declare const ensureKeypair: (alias: KeyAlias) => Promise<Keypair>;
export declare const saveKeyAlias: (alias: KeyAlias, keypair: Keypair) => Promise<string>;
export declare const toUint8Array: (key: string) => Uint8Array<ArrayBuffer>;
export declare const fromUint8Array: (bytes: Uint8Array) => string;
