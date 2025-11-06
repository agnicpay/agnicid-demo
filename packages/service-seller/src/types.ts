export interface SellerConfig {
  amount: string;
  asset: string;
  claims: string[];
  vpFormat: "jwt_vp";
  paymentEndpoint: string;
  acceptEndpoint: string;
}

export interface Challenge extends SellerConfig {
  challengeId: string;
  createdAt: string;
  paymentProof?: PaymentProof;
  forceUnder18: boolean;
}

export interface PaymentProof {
  txId: string;
  amount: string;
  asset: string;
}

export type LogStatus = "info" | "success" | "error";

export interface VerificationLog {
  id: string;
  challengeId: string;
  step: string;
  status: LogStatus;
  detail: string;
  timestamp: string;
}

export interface ConsoleState {
  logs: VerificationLog[];
  forceUnder18: boolean;
}
