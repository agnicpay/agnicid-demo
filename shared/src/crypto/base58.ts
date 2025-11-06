import bs58 from "bs58";

export const toBase58 = (bytes: Uint8Array) => bs58.encode(bytes);
export const fromBase58 = (value: string) => new Uint8Array(bs58.decode(value));
