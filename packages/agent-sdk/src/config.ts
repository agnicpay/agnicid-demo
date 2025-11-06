import { getAgnicIdHome, resolveAgnicIdPath } from "@agnicid/shared";
import { mkdirp } from "mkdirp";

export const AGNIC_ID_HOME = getAgnicIdHome();

export const ensureStore = async () => {
  await Promise.all([
    mkdirp(resolveAgnicIdPath("keys")),
    mkdirp(resolveAgnicIdPath("dids")),
    mkdirp(resolveAgnicIdPath("vcs")),
    mkdirp(resolveAgnicIdPath("presentations"))
  ]);
};

export const resolveStorePath = resolveAgnicIdPath;
