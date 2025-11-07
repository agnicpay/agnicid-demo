import bs58 from "bs58";
export const toBase58 = (bytes) => bs58.encode(bytes);
export const fromBase58 = (value) => new Uint8Array(bs58.decode(value));
