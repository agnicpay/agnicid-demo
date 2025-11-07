export interface PresentationInput {
    credentials: string[];
    challengeId: string;
    audience: string;
}
export interface PresentationResult {
    vpJwt: string;
    path: string;
}
export declare const createPresentation: (input: PresentationInput) => Promise<PresentationResult>;
//# sourceMappingURL=presentation.d.ts.map