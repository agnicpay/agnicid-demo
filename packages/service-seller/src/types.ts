export interface Challenge {
  challengeId: string;
  createdAt: string;
  amount: string;
  asset: string;
  claims: string[];
  vpFormat: "jwt_vp";
  forceUnder18: boolean;
  settlement?: {
    txId: string;
    settledAt: string;
  };
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
