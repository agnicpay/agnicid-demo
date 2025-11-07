import { Keypair, loadKeypair } from "@agnicid/shared";

export type KeyAlias = "human" | "agent" | "issuer";

export const requireKeypair = async (alias: KeyAlias): Promise<Keypair> => {
  const keypair = await loadKeypair(alias);
  if (!keypair) {
    throw new Error(`Missing ${alias} key. Import a wallet bundle before running this command.`);
  }
  return keypair;
};
