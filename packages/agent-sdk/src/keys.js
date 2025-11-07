import { loadKeypair } from "@agnicid/shared";
export const requireKeypair = async (alias) => {
    const keypair = await loadKeypair(alias);
    if (!keypair) {
        throw new Error(`Missing ${alias} key. Import a wallet bundle before running this command.`);
    }
    return keypair;
};
//# sourceMappingURL=keys.js.map