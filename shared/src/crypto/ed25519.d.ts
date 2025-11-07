export interface Keypair {
    publicKey: string;
    secretKey: string;
}
export declare const encode: (bytes: Uint8Array) => string;
export declare const decode: (encoded: string) => Uint8Array<ArrayBuffer>;
export declare const generateKeypair: (seed?: Uint8Array) => Keypair;
export declare const saveKeypair: (name: string, keypair: Keypair) => Promise<string>;
export declare const loadKeypair: (name: string) => Promise<Keypair | null>;
export declare const ensureKeypair: (name: string) => Promise<Keypair>;
export declare const deriveKeypairFromSecret: (secret: string) => Keypair;
//# sourceMappingURL=ed25519.d.ts.map