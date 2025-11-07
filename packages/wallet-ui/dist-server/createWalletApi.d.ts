export interface WalletApiOptions {
    /**
     * Absolute URL that the agent flow should call to reach the seller service.
     * Used as a fallback when the incoming request doesn't specify a jobs URL.
     */
    defaultJobsUrl?: string;
    /**
     * Relative path (e.g. `/api/seller/jobs`) that will be combined with the
     * incoming request's host to form an absolute URL for the seller jobs endpoint.
     */
    sellerJobsPath?: string;
}
export declare const createWalletApi: (options?: WalletApiOptions) => import("express-serve-static-core").Router;
