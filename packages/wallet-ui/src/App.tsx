import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import axios from "axios";

import "./index.css";

const API_BASE = import.meta.env.VITE_WALLET_API_BASE ?? "/api/wallet";
const AGNIC_ID_HOME_LABEL = "~/.agnicid";

interface BundlePayload {
  filename: string;
  size: number;
  base64: string;
}

const steps = [
  {
    id: "welcome",
    title: "Welcome",
    description: "Identity you can verify — and understand."
  },
  {
    id: "email",
    title: "Email Verification",
    description: "Enter your email and confirm the mock verification."
  },
  {
    id: "birthdate",
    title: "Birthdate",
    description: "Provide your birthdate for age verification."
  },
  {
    id: "issue",
    title: "Issue Credentials",
    description: "Generate keys, DIDs, and verifiable credentials."
  },
  {
    id: "export",
    title: "Export Bundle",
    description: "Download your local credential bundle."
  }
] as const;

const ISSUE_STEP_INDEX = steps.findIndex((step) => step.id === "issue");

type ViewMode = "landing" | "wallet" | "agent";
type CredentialKind = "email" | "age" | "delegation";

interface CredentialHistoryEntry {
  id: string;
  type: string;
  issuedAt: string;
  path: string;
  kind?: CredentialKind;
  payload?: Record<string, unknown>;
}

interface AgentTimelineEvent {
  id: string;
  type: string;
  label: string;
  detail?: string;
  payload?: Record<string, unknown>;
  timestamp: string;
}

interface WalletStatus {
  home?: string;
  keys: { alias: string; exists: boolean }[];
  dids: { alias: string; did: string }[];
  credentials: CredentialHistoryEntry[];
}

const determineInitialView = (): ViewMode => {
  if (typeof window === "undefined") {
    return "landing";
  }
  const path = window.location.pathname.toLowerCase();
  if (path.startsWith("/agent")) {
    return "agent";
  }
  if (path.startsWith("/wallet")) {
    return "wallet";
  }
  return "landing";
};

export function App() {
  const [view, setViewState] = useState<ViewMode>(() => determineInitialView());
  const [stepIndex, setStepIndex] = useState(0);
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bundle, setBundle] = useState<BundlePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storePath, setStorePath] = useState(AGNIC_ID_HOME_LABEL);
  const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null);
  const [history, setHistory] = useState<CredentialHistoryEntry[]>([]);
  const [issuedState, setIssuedState] = useState<Record<CredentialKind, boolean>>({
    email: false,
    age: false,
    delegation: false
  });
  const [spendCapDaily, setSpendCapDaily] = useState("100 USDC");
  const [issuing, setIssuing] = useState<CredentialKind | null>(null);
  const [autoIssueRan, setAutoIssueRan] = useState(false);
  const [viewerEntry, setViewerEntry] = useState<CredentialHistoryEntry | null>(null);

  const setView = useCallback((next: ViewMode) => {
    setViewState(next);
    if (typeof window !== "undefined") {
      const targetPath = next === "agent" ? "/agent" : next === "wallet" ? "/wallet" : "/";
      if (window.location.pathname !== targetPath) {
        window.history.replaceState(null, "", targetPath);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handlePopState = () => {
      setViewState(determineInitialView());
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const canContinue = useMemo(() => {
    switch (steps[stepIndex].id) {
      case "welcome":
        return true;
      case "email":
        return email.length > 3 && emailVerified;
      case "birthdate":
        return birthDate.length > 0;
      case "issue":
        return issuedState.email && issuedState.age && issuedState.delegation;
      case "export":
        return true;
      default:
        return false;
    }
  }, [stepIndex, email, emailVerified, birthDate, issuedState, bundle]);

  const handleNext = async () => {
    setError(null);
    if (steps[stepIndex].id === "issue" && !canContinue) {
      setError("Please issue all credentials before continuing.");
      return;
    }
    if (steps[stepIndex].id === "export") {
      await handleExport();
      return;
    }
    setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handleBack = () => {
    setError(null);
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleExport = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await axios.post<BundlePayload>(`${API_BASE}/export`);
      setBundle(response.data);
      setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
    } catch (err) {
      setError(extractError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const refreshStatus = async () => {
    try {
      const response = await axios.get<WalletStatus>(`${API_BASE}/status`);
      setWalletStatus(response.data);
      if (response.data.home) {
        setStorePath(response.data.home);
      }
      const sorted = [...(response.data.credentials as CredentialHistoryEntry[])].sort((a, b) => {
        const dateA = new Date(a.issuedAt ?? 0).getTime();
        const dateB = new Date(b.issuedAt ?? 0).getTime();
        return dateB - dateA;
      });
      setHistory(sorted);
      setIssuedState(deriveIssuedState(sorted));
    } catch (err) {
      console.error("Failed to refresh wallet status", err);
    }
  };

  const handleIssueCredential = async (type: CredentialKind) => {
    setError(null);
    const payloads: Record<CredentialKind, () => Promise<unknown>> = {
      email: () => {
        if (!email) {
          return Promise.reject(new Error("Email is required"));
        }
        if (!emailVerified) {
          return Promise.reject(new Error("Please verify your email first."));
        }
        return axios.post(`${API_BASE}/credentials/email`, {
          email,
          emailVerified
        });
      },
      age: () => {
        if (!birthDate) {
          return Promise.reject(new Error("Birthdate is required"));
        }
        return axios.post(`${API_BASE}/credentials/age`, { birthDate });
      },
      delegation: () => {
        if (!issuedState.email || !issuedState.age) {
          return Promise.reject(new Error("Issue Email and Age credentials first."));
        }
        if (!email) {
          return Promise.reject(new Error("Email is required for delegation"));
        }
        return axios.post(`${API_BASE}/credentials/delegation`, {
          ownerEmail: email,
          spendCapDaily: spendCapDaily || "100 USDC"
        });
      }
    };

    setIssuing(type);
    try {
      await payloads[type]();
      await refreshStatus();
    } catch (err) {
      setError(extractError(err));
      throw err;
    } finally {
      setIssuing(null);
    }
  };

  const downloadHref = useMemo(() => {
    if (!bundle) return null;
    const buffer = Uint8Array.from(atob(bundle.base64), (c) => c.charCodeAt(0));
    const blob = new Blob([buffer], { type: "application/zip" });
    return URL.createObjectURL(blob);
  }, [bundle]);

  useEffect(() => {
    if (!downloadHref) return;
    return () => {
      URL.revokeObjectURL(downloadHref);
    };
  }, [downloadHref]);

  useEffect(() => {
    if (view === "wallet") {
      refreshStatus();
    }
  }, [view]);

  useEffect(() => {
    if (view !== "wallet" || stepIndex < ISSUE_STEP_INDEX) {
      setAutoIssueRan(false);
    }
  }, [view, stepIndex]);

  useEffect(() => {
    if (view !== "wallet" || steps[stepIndex].id !== "issue" || autoIssueRan) {
      return;
    }
    setAutoIssueRan(true);
    (async () => {
      for (const kind of ["email", "age", "delegation"] as CredentialKind[]) {
        if (!issuedState[kind]) {
          try {
            await handleIssueCredential(kind);
          } catch {
            break;
          }
        }
      }
    })();
  }, [view, stepIndex, autoIssueRan, issuedState]);

  if (view === "landing") {
    return (
      <LandingPage
      onStart={() => setView("wallet")}
      onLearn={() => window.open("https://agnic.id", "_blank")}
      onAgent={() => setView("agent")}
      />
    );
  }

  if (view === "agent") {
    return <AgentIde onBack={() => setView("landing")} />;
  }

  return (
    <div className="min-h-screen bg-[#f7f9fc] transition-all">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-10 md:flex-row md:py-16">
        <aside className="w-full md:w-64">
          <h1 className="text-2xl font-semibold tracking-wide text-trustBlue">Agnic.ID Wallet</h1>
          <p className="mt-2 text-sm text-slate-500">
            Follow the guided flow to enroll, issue credentials, and export your local bundle. All
            data stays on your device.
          </p>
          <nav className="mt-8 flex flex-col space-y-4">
            {steps.map((step, index) => {
              const isActive = index === stepIndex;
              const isComplete = index < stepIndex;
              return (
                <div
                  key={step.id}
                  className={`rounded-xl border border-slate-200 px-4 py-3 transition ${
                    isActive
                      ? "border-trustBlue bg-white shadow-lg"
                      : isComplete
                        ? "border-emerald/60 bg-white/80"
                        : "bg-white/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-sm font-medium ${
                        isActive ? "text-trustBlue" : isComplete ? "text-emerald-500" : "text-slate-500"
                      }`}
                    >
                      {step.title}
                    </span>
                    {isComplete && <span className="text-emerald-500">✓</span>}
                    {isActive && <span className="text-trustBlue">●</span>}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{step.description}</p>
                </div>
              );
            })}
          </nav>
        </aside>

        <main className="flex flex-1 flex-col">
          <div className="gradient-border flex-1">
            <div className="flex h-full flex-col justify-between rounded-[15px] bg-white px-6 py-8 shadow-xl">
              <div className="space-y-6">
                <header>
                  <h2 className="text-xl font-semibold text-graphite">
                    Step {stepIndex + 1} · {steps[stepIndex].title}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">{steps[stepIndex].description}</p>
                </header>

                <div className="space-y-6">
                  {steps[stepIndex].id === "welcome" && (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-8 text-sm leading-relaxed text-slate-600">
                      <p>
                        Agnic.ID stores your keys and verifiable credentials locally inside{" "}
                        <code className="rounded bg-slate-900/90 px-2 py-1 text-xs text-white">
                          ~/.agnicid
                        </code>
                        . You control data export and delegation.
                      </p>
                      <p className="mt-4">
                        Ready? Tap “Begin Enrollment” to step through verification.
                      </p>
                    </div>
                  )}

                  {steps[stepIndex].id === "email" && (
                    <div className="space-y-4">
                      <label className="block text-sm font-medium text-slate-600" htmlFor="email">
                        Email address
                      </label>
                      <input
                        id="email"
                        type="email"
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-700 shadow-sm focus:border-trustBlue focus:outline-none focus:ring-2 focus:ring-trustBlue/20"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                      />
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        <p className="font-medium text-trustBlue">Mock verification link</p>
                        <p>
                          Click the button below to simulate email verification. This flips the
                          credential flag to <span className="font-semibold">email_verified=true</span>.
                        </p>
                        <button
                          type="button"
                          className={`mt-4 rounded-lg px-4 py-2 text-sm font-medium transition ${
                            emailVerified
                              ? "bg-emerald-500 text-white"
                              : "border border-trustBlue text-trustBlue"
                          }`}
                          onClick={() => setEmailVerified((prev) => !prev)}
                        >
                          {emailVerified ? "Email verified ✓" : "Verify email"}
                        </button>
                      </div>
                    </div>
                  )}

                  {steps[stepIndex].id === "birthdate" && (
                    <div className="space-y-4">
                      <label className="block text-sm font-medium text-slate-600" htmlFor="birthDate">
                        Birthdate
                      </label>
                      <input
                        id="birthDate"
                        type="date"
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-700 shadow-sm focus:border-trustBlue focus:outline-none focus:ring-2 focus:ring-trustBlue/20"
                        value={birthDate}
                        onChange={(event) => setBirthDate(event.target.value)}
                      />
                      <p className="text-xs text-slate-500">
                        We derive the <code>age_over_18</code> attribute during credential issuance.
                      </p>
                    </div>
                  )}

                  {steps[stepIndex].id === "issue" && (
                    <div className="space-y-4">
                      <CredentialIssueCard
                        title="Email Credential"
                        description="Confirms your email is verified for policy compliance."
                        ready={issuedState.email}
                        actionLabel={issuedState.email ? "Re-issue Email VC" : "Issue Email VC"}
                        disabled={issuing !== null}
                        onAction={() => {
                          void handleIssueCredential("email");
                        }}
                      />
                      <CredentialIssueCard
                        title="Age Credential"
                        description="Encodes your birthdate and derived age_over_18 claim."
                        ready={issuedState.age}
                        actionLabel={issuedState.age ? "Re-issue Age VC" : "Issue Age VC"}
                        disabled={issuing !== null}
                        onAction={() => {
                          void handleIssueCredential("age");
                        }}
                      />
                      <CredentialIssueCard
                        title="Agent Delegation Credential"
                        description="Authorizes your agent to respond to x402 challenges."
                        ready={issuedState.delegation}
                        actionLabel={issuedState.delegation ? "Re-issue Delegation VC" : "Issue Delegation VC"}
                        disabled={issuing !== null}
                        onAction={() => {
                          void handleIssueCredential("delegation");
                        }}
                        extra={
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-600">Daily spend cap</label>
                            <input
                              type="text"
                              value={spendCapDaily}
                              onChange={(event) => setSpendCapDaily(event.target.value)}
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-trustBlue focus:outline-none focus:ring-2 focus:ring-trustBlue/20"
                              placeholder="100 USDC"
                            />
                          </div>
                        }
                      />
                      <DidSummary dids={walletStatus?.dids ?? []} />
                      <CredentialHistory history={history} onView={setViewerEntry} />
                    </div>
                  )}

                  {steps[stepIndex].id === "export" && bundle && (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-emerald/50 bg-emerald/10 px-4 py-4 text-sm text-emerald-700">
                        <p className="font-semibold text-emerald-600">Bundle ready</p>
                        <p>
                          Save this archive to transfer your agent keys and credentials to another
                          device or workflow.
                        </p>
                      </div>
                      {downloadHref && (
                        <a
                          href={downloadHref}
                          download={bundle.filename}
                          className="inline-flex items-center rounded-lg bg-trustBlue px-4 py-2 text-sm font-medium text-white shadow hover:bg-trustBlue/90"
                        >
                          Download {bundle.filename} ({formatBytes(bundle.size)})
                        </a>
                      )}
                      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
                        Keys and credentials stored in:
                        <code className="ml-2 rounded bg-slate-900/90 px-2 py-1 text-xs text-white">
                          {storePath}
                        </code>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                      {error}
                    </div>
                  )}
                </div>
              </div>

              <footer className="mt-8 flex items-center justify-between">
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={handleBack}
                  disabled={stepIndex === 0 || isSubmitting}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-trustBlue px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-trustBlue/90 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={handleNext}
                  disabled={!canContinue || isSubmitting}
                >
                  {isSubmitting
                    ? "Processing…"
                    : stepIndex === steps.length - 1
                      ? "Done"
                      : callToAction(steps[stepIndex].id, issuedState, bundle)}
                </button>
              </footer>
            </div>
          </div>
        </main>
      </div>
      {viewerEntry && (
        <CredentialJsonViewer entry={viewerEntry} onClose={() => setViewerEntry(null)} />
      )}
    </div>
  );
}

function callToAction(
  stepId: (typeof steps)[number]["id"],
  issuedState: Record<CredentialKind, boolean>,
  bundle: BundlePayload | null
) {
  switch (stepId) {
    case "welcome":
      return "Begin enrollment";
    case "email":
      return "Continue";
    case "birthdate":
      return "Generate credentials";
    case "issue":
      return issuedState.email && issuedState.age && issuedState.delegation ? "Export bundle" : "Issue credentials";
    case "export":
      return bundle ? "Complete" : "Download bundle";
    default:
      return "Next";
  }
}

function extractError(error: unknown) {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error ?? error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error";
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function CredentialIssueCard({
  title,
  description,
  ready,
  actionLabel,
  onAction,
  disabled,
  extra
}: {
  title: string;
  description: string;
  ready: boolean;
  actionLabel: string;
  onAction: () => void;
  disabled: boolean;
  extra?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-md">
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          {ready && (
            <span className="rounded-full bg-emerald/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-700">
              Issued
            </span>
          )}
          <button
            type="button"
            onClick={onAction}
            disabled={disabled}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              ready
                ? "border border-emerald-400 text-emerald-600 hover:bg-emerald-50"
                : "bg-trustBlue text-white shadow hover:bg-trustBlue/90"
            }`}
          >
            {actionLabel}
          </button>
        </div>
      </div>
      {extra && <div className="mt-4">{extra}</div>}
    </div>
  );
}

function DidSummary({ dids }: { dids: { alias: string; did: string }[] }) {
  if (!dids.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
      <p className="font-semibold text-trustBlue">DIDs in this wallet</p>
      <ul className="mt-2 space-y-1 text-xs">
        {dids.map((doc) => (
          <li key={doc.alias} className="flex items-center gap-2">
            <span className="uppercase text-slate-500">{doc.alias}</span>
            <code className="rounded bg-slate-900/90 px-2 py-1 text-white">{doc.did}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CredentialHistory({
  history,
  onView
}: {
  history: CredentialHistoryEntry[];
  onView: (entry: CredentialHistoryEntry) => void;
}) {
  if (!history.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        No credentials issued yet.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-sm font-semibold text-slate-700">Credential history</p>
      <div className="mt-3 space-y-3 text-xs text-slate-500">
        {history.slice(0, 6).map((entry) => (
          <div
            key={entry.path}
            className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
          >
            <div>
              <p className="capitalize text-slate-700 text-sm font-semibold">
                {entry.kind ?? entry.type}
              </p>
              <p>{new Date(entry.issuedAt ?? entry.id ?? Date.now()).toLocaleString()}</p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-trustBlue transition hover:border-trustBlue"
              onClick={() => onView(entry)}
            >
              View JSON
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CredentialJsonViewer({
  entry,
  onClose
}: {
  entry: CredentialHistoryEntry;
  onClose: () => void;
}) {
  const jsonText = JSON.stringify(entry.payload ?? {}, null, 2);

  const handleCopy = () => {
    copyText(jsonText);
  };

  const handleDownload = () => {
    const filename = `${(entry.kind ?? "credential").toLowerCase()}.vc.json`;
    downloadJson(filename, jsonText);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
        >
          Close
        </button>
        <h3 className="text-lg font-semibold text-slate-800">
          {entry.kind ?? entry.type} JSON
        </h3>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-trustBlue hover:text-trustBlue"
          >
            Copy JSON
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-trustBlue hover:text-trustBlue"
          >
            Download
          </button>
        </div>
        <pre className="mt-4 max-h-[60vh] overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
          {jsonText}
        </pre>
      </div>
    </div>
  );
}

type SidePanelTab = "flow" | "cli" | "identity";

function AgentIde({ onBack }: { onBack: () => void }) {
  const [jobsUrl, setJobsUrl] = useState("https://demo.agnic.id/api/seller/jobs");
  const [events, setEvents] = useState<AgentTimelineEvent[]>([]);
  const [displayEvents, setDisplayEvents] = useState<AgentTimelineEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [sideTab, setSideTab] = useState<SidePanelTab>("identity");
  const timers = useRef<number[]>([]);
  const logsEndRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<HTMLPreElement | null>(null);

  const command = `agnicid x402:call ${jobsUrl} --bundle ~/.agnicid`;

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [displayEvents]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLines]);

  useEffect(() => {
    const fetchStatus = async () => {
      setIsLoadingStatus(true);
      try {
        const response = await axios.get<WalletStatus>(`${API_BASE}/status`);
        setWalletStatus(response.data);
      } catch (statusError) {
        console.warn("Unable to load wallet status for agent view", statusError);
      } finally {
        setIsLoadingStatus(false);
      }
    };
    fetchStatus();
  }, []);

  const appendTerminalLines = useCallback((lines: string | string[]) => {
    const payload = Array.isArray(lines) ? lines : [lines];
    setTerminalLines((prev) => [...prev, ...payload]);
  }, []);

  const runAgent = async () => {
    setIsRunning(true);
    setError(null);
    setResult(null);
    setEvents([]);
    setDisplayEvents([]);
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    const commandLine = `$ ${command}`;
    setTerminalLines((prev) => {
      const spacer = prev.length ? [""] : [];
      return [...prev, ...spacer, commandLine];
    });
    try {
      const response = await axios.post(`${API_BASE}/agent/run`, {
        jobs: jobsUrl
      });
      const { events: eventLog, result } = response.data;
      setEvents(eventLog);
      setResult(result);
      replayEvents(eventLog);
      const jobs = result.response?.data?.jobs ?? [];
      appendTerminalLines(
        `[result] status ${result.response.status} · ${jobs.length} job${
          jobs.length === 1 ? "" : "s"
        } returned`
      );
    } catch (err) {
      const message = extractError(err);
      const fallbackEvents = (err as any)?.response?.data?.events ?? [];
      if (fallbackEvents.length) {
        setEvents(fallbackEvents);
        replayEvents(fallbackEvents);
      }
      setError(message);
      appendTerminalLines(`[error] ${message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const replayEvents = (eventLog: AgentTimelineEvent[]) => {
    setDisplayEvents([]);
    eventLog.forEach((event, index) => {
      const timer = window.setTimeout(() => {
        setDisplayEvents((prev) => [...prev, event]);
        const timestamp = new Date(event.timestamp).toLocaleTimeString();
        const detail = event.detail ? ` — ${event.detail}` : "";
        appendTerminalLines(`[${timestamp}] ${event.label}${detail}`);
      }, index * 250);
      timers.current.push(timer);
    });
  };

  const humanDid = walletStatus?.dids?.find((item) => item.alias === "human")?.did;
  const agentDid = walletStatus?.dids?.find((item) => item.alias === "agent")?.did;
  const credentialList = useMemo(() => {
    if (!walletStatus?.credentials?.length) {
      return [];
    }
    return [...walletStatus.credentials]
      .sort((a, b) => new Date(b.issuedAt ?? 0).getTime() - new Date(a.issuedAt ?? 0).getTime())
      .slice(0, 5);
  }, [walletStatus]);
  const terminalContent = useMemo(() => terminalLines.join("\n"), [terminalLines]);

  const cliGuide = [
    {
      command: "agnicid x402:call --jobs <url>",
      detail: "Execute the full x402 payment + proof flow against a seller.",
      options: [
        { flag: "--jobs <url>", detail: "Seller jobs endpoint (required)." },
        {
          flag: "--include-delegation / --no-include-delegation",
          detail: "Toggle inclusion of the agent delegation credential."
        }
      ]
    },
    {
      command: "agnicid vp:make --challenge <nonce>",
      detail: "Construct a JWT-VC presentation from stored credentials.",
      options: [
        { flag: "--challenge <nonce>", detail: "Challenge/nonce from the seller policy." },
        {
          flag: "--audience <origin>",
          detail: "Audience value for the VP (defaults to seller origin)."
        },
        {
          flag: "--cred email age delegation",
          detail: "Credential kinds to include (defaults to all)."
        }
      ]
    },
    {
      command: "agnicid vc:list",
      detail: "Print all stored credentials in ~/.agnicid.",
      options: []
    }
  ];

  const docs = [
    {
      title: "1. Request",
      detail: "Agent sends the original GET /jobs request without headers."
    },
    {
      title: "2. 402 Challenge",
      detail: "Seller responds with payment requirements and required claims."
    },
    {
      title: "3. Sign payment",
      detail: "Agent signs the payment payload via facilitator + wallet bundle."
    },
    {
      title: "4. Compose VP",
      detail: "JWT-VP contains Email, Age, Delegation credentials signed by Agent DID."
    },
    {
      title: "5. Resubmit",
      detail: "Same request sent with X-PAYMENT and X-PRESENTATION headers."
    },
    {
      title: "6. Verify & settle",
      detail: "Seller verifies payment, facilitator settles, policy checks pass, jobs returned."
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Agent IDE</p>
            <h1 className="text-3xl font-semibold text-white">x402 Request Runner</h1>
            <p className="text-sm text-slate-400">
              Follow the request → 402 → resubmit cycle with live payloads and facilitator notes.
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900"
          >
            Back to Landing
          </button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <div className="space-y-6">
            <section className="rounded-3xl bg-slate-900/70 p-6 shadow-2xl ring-1 ring-white/5">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  value={jobsUrl}
                  onChange={(event) => setJobsUrl(event.target.value)}
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 focus:border-trustBlue focus:outline-none focus:ring-2 focus:ring-trustBlue/30"
                />
                <button
                  type="button"
                  onClick={() => copyText(command)}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-trustBlue"
                >
                  Copy Command
                </button>
                <button
                  type="button"
                  onClick={runAgent}
                  disabled={isRunning}
                  className="rounded-lg bg-trustBlue px-4 py-2 text-sm font-semibold text-white shadow hover:bg-trustBlue/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isRunning ? "Running…" : "Run Agent Flow"}
                </button>
              </div>
              <pre
                ref={terminalRef}
                className="mt-4 h-48 overflow-auto rounded-2xl border border-slate-800 bg-black/60 p-4 font-mono text-xs text-emerald-200"
              >
                {terminalContent}
              </pre>
            </section>

            <section className="rounded-3xl bg-slate-900/70 p-6 shadow-2xl ring-1 ring-white/5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Output Log
                </h3>
                <p className="text-xs text-slate-500">{displayEvents.length} events</p>
              </div>
              <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                {displayEvents.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{event.label}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(event.timestamp).toLocaleTimeString()} · {event.type}
                        </p>
                        {event.detail && (
                          <p className="text-xs text-slate-400">{event.detail}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        className="rounded-lg border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-trustBlue"
                        onClick={() =>
                          setExpandedEvent((prev) => (prev === event.id ? null : event.id))
                        }
                      >
                        {expandedEvent === event.id ? "Hide JSON" : "View JSON"}
                      </button>
                    </div>
                    {expandedEvent === event.id && (
                      <pre className="mt-3 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-200">
                        {JSON.stringify(event.payload ?? {}, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </section>

            {result && (
              <section className="rounded-3xl bg-slate-900/70 p-6 shadow-2xl ring-1 ring-white/10">
                <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Seller Response
                </h3>
                <p className="text-xs text-slate-500">Status {result.response.status}</p>
                <div className="mt-4 space-y-2 text-sm text-slate-300">
                  {(result.response.data?.jobs ?? []).map((job: any) => (
                    <div
                      key={job.id}
                      className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3"
                    >
                      <p className="text-white">{job.title}</p>
                      <p className="text-xs text-slate-400">{job.rate}</p>
                      <p className="text-xs text-slate-500">{job.contact}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {error && (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                {error}
              </div>
            )}
          </div>

          <aside className="rounded-3xl bg-slate-900/40 p-6 shadow-2xl ring-1 ring-white/10">
            <div className="flex gap-2 rounded-2xl border border-slate-800 bg-slate-950/50 p-1">
              {(["identity", "cli", "flow"] as SidePanelTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSideTab(tab)}
                  className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                    sideTab === tab ? "bg-slate-800 text-white" : "text-slate-500"
                  }`}
                >
                  {tab === "identity" ? "Identity" : tab === "cli" ? "CLI" : "Flow"}
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-4">
              {sideTab === "identity" && (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
                      Local DIDs
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        if (isLoadingStatus) return;
                        setIsLoadingStatus(true);
                        axios
                          .get<WalletStatus>(`${API_BASE}/status`)
                          .then((response) => setWalletStatus(response.data))
                          .catch((statusError) =>
                            console.warn("Unable to refresh wallet status", statusError)
                          )
                          .finally(() => setIsLoadingStatus(false));
                      }}
                      className="text-xs font-semibold text-slate-400 hover:text-white"
                      disabled={isLoadingStatus}
                    >
                      {isLoadingStatus ? "Refreshing…" : "Refresh"}
                    </button>
                  </div>
                  <div className="space-y-3">
                    <IdentityCard
                      label="User Identity"
                      alias="human"
                      did={humanDid}
                      description="Local human DID used to issue credentials."
                    />
                    <IdentityCard
                      label="Agent Identity"
                      alias="agent"
                      did={agentDid}
                      description="Delegated agent DID responding to x402."
                    />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                      Credentials
                    </h4>
                    {credentialList.length === 0 ? (
                      <p className="mt-3 text-xs text-slate-500">No credentials detected.</p>
                    ) : (
                      <ul className="mt-3 space-y-3 text-sm text-slate-200">
                        {credentialList.map((entry) => (
                          <li
                            key={entry.id}
                            className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3"
                          >
                            <p className="font-semibold text-white">{entry.kind ?? entry.type}</p>
                            <p className="text-xs text-slate-500">
                              {entry.issuedAt
                                ? new Date(entry.issuedAt).toLocaleString()
                                : "Unknown date"}
                            </p>
                            {entry.path && (
                              <p className="text-[11px] font-mono text-slate-500 break-all">
                                {entry.path}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}

              {sideTab === "cli" && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
                    CLI Reference
                  </h3>
                  <ol className="space-y-3 text-sm text-slate-200">
                    {cliGuide.map((item) => (
                      <li
                        key={item.command}
                        className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3"
                      >
                        <p className="font-mono text-xs text-emerald-300">{item.command}</p>
                        <p className="text-xs text-slate-400">{item.detail}</p>
                        {item.options?.length ? (
                          <ul className="mt-2 space-y-1 text-[11px] text-slate-400">
                            {item.options.map((opt) => (
                              <li key={opt.flag} className="flex flex-col">
                                <span className="font-mono text-emerald-400">{opt.flag}</span>
                                <span>{opt.detail}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                  <p className="text-[11px] text-slate-500">
                    Tip: all commands emit JSON, so piping into <code className="font-mono">jq</code>{" "}
                    makes it easier to inspect envelopes and VP payloads.
                  </p>
                </div>
              )}

              {sideTab === "flow" && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
                    Request / 402 / Resubmit
                  </h3>
                  <ol className="space-y-4 text-sm text-slate-300">
                    {docs.map((doc) => (
                      <li
                        key={doc.title}
                        className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3"
                      >
                        <p className="text-white">{doc.title}</p>
                        <p className="text-xs text-slate-400">{doc.detail}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function IdentityCard({
  label,
  alias,
  did,
  description
}: {
  label: string;
  alias: string;
  did?: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
      <p className="text-xs uppercase tracking-[0.4em] text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-sm text-white">{did ?? "not created yet"}</p>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      <p className="mt-2 text-[11px] uppercase tracking-[0.3em] text-slate-500">alias: {alias}</p>
    </div>
  );
}

const deriveIssuedState = (entries: CredentialHistoryEntry[]) => {
  const flags: Record<CredentialKind, boolean> = {
    email: false,
    age: false,
    delegation: false
  };
  for (const entry of entries) {
    const normalized =
      entry.kind ??
      (entry.type.includes("EmailCredential")
        ? "email"
        : entry.type.includes("AgeCredential")
          ? "age"
          : entry.type.includes("AgentDelegationCredential")
            ? "delegation"
            : undefined);
    const kind = normalized as CredentialKind | undefined;
    if (kind && flags[kind] === false) {
      flags[kind] = true;
    }
  }
  return flags;
};

const copyText = async (value: string) => {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
};

const downloadJson = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

function LandingPage({
  onStart,
  onLearn,
  onAgent
}: {
  onStart: () => void;
  onLearn: () => void;
  onAgent: () => void;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fefefe] via-[#f5f6fb] to-[#eaecf5] px-6 py-16">
      <div className="mx-auto max-w-6xl grid gap-12 lg:grid-cols-2 items-center">
        <div className="space-y-8">
          <p className="text-xs uppercase tracking-[0.4em] text-slate-500">agnic.id</p>
          <h1 className="text-4xl font-semibold leading-tight text-graphite md:text-5xl">
            Your Identity. <span className="text-trustBlue">Your Agents.</span>
          </h1>
          <p className="text-lg text-slate-600">
            Launch secure agentic payments with verifiable credentials you control. Enroll, delegate,
            and prove policy compliance in one calm, trustworthy flow.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onStart}
              className="rounded-xl bg-trustBlue px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-trustBlue/30 transition hover:-translate-y-0.5 hover:bg-trustBlue/90"
            >
              Start Wallet
            </button>
            <button
              type="button"
              onClick={onLearn}
              className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-trustBlue hover:text-trustBlue"
            >
              Learn about Agnic.ID
            </button>
            <button
              type="button"
              onClick={onAgent}
              className="rounded-xl border border-slate-500 px-6 py-3 text-sm font-semibold text-slate-100 bg-slate-900 transition hover:-translate-y-0.5 hover:bg-slate-950"
            >
              Open Agent IDE
            </button>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Local-first Proofs
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-trustBlue animate-ping" />
              W3C VC 2.0
            </span>
          </div>
        </div>
        <div className="relative">
          <div className="rounded-[32px] bg-white/80 p-6 shadow-2xl ring-1 ring-slate-200 backdrop-blur">
            <FlowGraphic />
            <div className="mt-6 grid gap-4 text-sm text-slate-600">
              <p className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Human issues Email + Age credentials
              </p>
              <p className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-trustBlue" />
                Agent receives delegation & answers x402
              </p>
              <p className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-purple-500" />
                Seller verifies payment + JWT-VP proof
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowGraphic() {
  return (
    <svg viewBox="0 0 420 220" className="w-full" role="img">
      <defs>
        <linearGradient id="flow" x1="0%" x2="100%">
          <stop offset="0%" stopColor="#2E77D0" />
          <stop offset="100%" stopColor="#7B61FF" />
        </linearGradient>
      </defs>
      <rect x="10" y="20" width="120" height="180" rx="24" fill="#F4F6FB" />
      <rect x="150" y="40" width="120" height="140" rx="24" fill="#EFF2FA" />
      <rect x="290" y="20" width="120" height="180" rx="24" fill="#F4F6FB" />
      <circle cx="70" cy="110" r="28" fill="#2AD49A" opacity={0.9} />
      <circle cx="210" cy="120" r="32" fill="#2E77D0" opacity={0.8} />
      <circle cx="350" cy="110" r="28" fill="#7B61FF" opacity={0.9} />
      <path d="M100 110 C 150 60, 270 60, 320 110" fill="none" stroke="url(#flow)" strokeWidth="8" strokeLinecap="round" />
      <path d="M100 120 C 150 170, 270 170, 320 120" fill="none" stroke="url(#flow)" strokeWidth="3" strokeLinecap="round" strokeDasharray="8 6" opacity={0.6} />
      <text x="70" y="180" textAnchor="middle" fill="#475569" fontSize="14" fontWeight="600">Human</text>
      <text x="210" y="190" textAnchor="middle" fill="#475569" fontSize="14" fontWeight="600">Agent</text>
      <text x="350" y="180" textAnchor="middle" fill="#475569" fontSize="14" fontWeight="600">Service</text>
    </svg>
  );
}
