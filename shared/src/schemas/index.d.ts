export declare const email: {
    $schema: string;
    $id: string;
    title: string;
    type: string;
    required: string[];
    properties: {
        "@context": {
            type: string;
            items: {
                type: string;
            };
            minItems: number;
        };
        type: {
            type: string;
            items: {
                type: string;
            };
            contains: {
                const: string;
            };
        };
        issuer: {
            type: string;
        };
        issuanceDate: {
            type: string;
            format: string;
        };
        credentialSubject: {
            type: string;
            required: string[];
            properties: {
                id: {
                    type: string;
                };
                email: {
                    type: string;
                    format: string;
                };
                email_verified: {
                    type: string;
                };
            };
            additionalProperties: boolean;
        };
    };
    additionalProperties: boolean;
};
export declare const age: {
    $schema: string;
    $id: string;
    title: string;
    type: string;
    required: string[];
    properties: {
        "@context": {
            type: string;
            items: {
                type: string;
            };
            minItems: number;
        };
        type: {
            type: string;
            items: {
                type: string;
            };
            contains: {
                const: string;
            };
        };
        issuer: {
            type: string;
        };
        issuanceDate: {
            type: string;
            format: string;
        };
        credentialSubject: {
            type: string;
            required: string[];
            properties: {
                id: {
                    type: string;
                };
                birthDate: {
                    type: string;
                    format: string;
                };
                age_over_18: {
                    type: string;
                };
            };
            additionalProperties: boolean;
        };
    };
    additionalProperties: boolean;
};
export declare const delegation: {
    $schema: string;
    $id: string;
    title: string;
    type: string;
    required: string[];
    properties: {
        "@context": {
            type: string;
            items: {
                type: string;
            };
            minItems: number;
        };
        type: {
            type: string;
            items: {
                type: string;
            };
            contains: {
                const: string;
            };
        };
        issuer: {
            type: string;
        };
        issuanceDate: {
            type: string;
            format: string;
        };
        credentialSubject: {
            type: string;
            required: string[];
            properties: {
                id: {
                    type: string;
                };
                capabilities: {
                    type: string;
                    properties: {
                        paymentProtocols: {
                            type: string;
                            items: {
                                type: string;
                            };
                        };
                        spendCapDaily: {
                            type: string;
                        };
                    };
                    additionalProperties: boolean;
                };
                ownerEmail: {
                    type: string;
                    format: string;
                };
            };
            additionalProperties: boolean;
        };
    };
    additionalProperties: boolean;
};
//# sourceMappingURL=index.d.ts.map