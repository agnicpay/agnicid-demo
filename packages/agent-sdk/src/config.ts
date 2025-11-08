import { ensureDir, getAgnicIdHome, resolveAgnicIdPath } from "@agnicid/shared";

export const AGNIC_ID_HOME = getAgnicIdHome();

export const ensureStore = async () => {
  await Promise.all([
    ensureDir(resolveAgnicIdPath("keys")),
    ensureDir(resolveAgnicIdPath("dids")),
    ensureDir(resolveAgnicIdPath("vcs")),
    ensureDir(resolveAgnicIdPath("presentations"))
  ]);
};

export const resolveStorePath = resolveAgnicIdPath;
