import {
  Keypair,
  Connection,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
  Transaction,
  SystemProgram,
  PublicKey
} from "@solana/web3.js";
import { DidSolIdentifier, DidSolService } from "@identity.com/sol-did-client";
import fs from "fs";

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DidDocument } from "@agnicid/shared";

// Get source directory path (going up from dist to src)
const __filename = fileURLToPath(import.meta.url);
const distDir = path.dirname(__filename);
const sourceDir = path.join(distDir, '..', 'src');

// Local funded wallet configuration
const FUNDED_WALLET_PATH = path.join(sourceDir, "assets", "funded-devnet-wallet.json");
const FUND_AMOUNT = LAMPORTS_PER_SOL / 100; // 0.01 SOL

// Maintain a single connection instance
let _connection: Connection | null = null;
const getConnection = () => {
  if (!_connection) {
    _connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  }
  return _connection;
};

/**
 * Creates a new funded wallet and associated DID on Solana devnet
 * @returns The DID string and the keypair used to create it
 */
export type SolanaDidResult = {
  did: string;
  keypair: Keypair;
  document: DidDocument;
};

export async function createSolanaDid(): Promise<SolanaDidResult> {
  const connection = getConnection();

  // 1. Create a new wallet
  const authority = Keypair.generate();
  console.log("Created new wallet:", authority.publicKey.toBase58());

  // 2. Fund the new wallet using our funded wallet
  const fundedWallet = getFundedWallet();
  await fundNewWallet(fundedWallet, authority.publicKey);

  // 3. Create the DID identifier for this wallet
  const didSolIdentifier = DidSolIdentifier.create(authority.publicKey, "devnet");
  console.log("Generated DID identifier:", didSolIdentifier.toString());

  // 4. Build DID service for this wallet
  const service = DidSolService.build(didSolIdentifier, {
    connection,
    wallet: {
      signTransaction: (tx) => {
        tx.sign(authority);
        return Promise.resolve(tx);
      },
      signAllTransactions: (txs) => {
        txs.forEach((tx) => tx.sign(authority));
        return Promise.resolve(txs);
      },
      publicKey: authority.publicKey,
    },
  });

  // 5. Create/resolve the DID document
  const document = (await service.resolve()) as DidDocument;

  return {
    did: didSolIdentifier.toString(),
    keypair: authority,
    document
  };
}

/**
 * Retrieves the DID Document for a given DID
 * @param did The full DID string (e.g., "did:sol:devnet:...")
 * @returns The resolved DID Document
 */
export async function getDidDocument(did: string): Promise<DidDocument> {
  const connection = getConnection();
  const identifier = DidSolIdentifier.parse(did);
  const service = await DidSolService.build(identifier, { connection });
  const doc = (await service.resolve()) as DidDocument;
  return doc;
}

// Get the funded wallet keypair
const getFundedWallet = () => {
  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(FUNDED_WALLET_PATH, "utf8")));
  return Keypair.fromSecretKey(secretKey);
};

// Send SOL from funded wallet to new wallet
const fundNewWallet = async (fundedWallet: Keypair, newWalletPubkey: PublicKey) => {
  const connection = getConnection();

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fundedWallet.publicKey,
      toPubkey: newWalletPubkey,
      lamports: FUND_AMOUNT,
    })
  );

  const signature = await connection.sendTransaction(
    transaction,
    [fundedWallet]
  );

  await connection.confirmTransaction(signature);
  console.log(`Transferred ${FUND_AMOUNT / LAMPORTS_PER_SOL} SOL to new wallet`);
};
