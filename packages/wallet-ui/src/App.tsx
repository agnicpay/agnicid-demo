import { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_WALLET_API_BASE ?? "http://localhost:8787";

interface EnrollmentResult {
  humanDid: string;
  agentDid: string;
  issued: {
    email: { path: string };
    age: { path: string };
    delegation: { path: string };
  };
}

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

export function App() {
  const [stepIndex, setStepIndex] = useState(0);
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [enrollmentResult, setEnrollmentResult] = useState<EnrollmentResult | null>(null);
  const [bundle, setBundle] = useState<BundlePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storePath, setStorePath] = useState(AGNIC_ID_HOME_LABEL);

  const canContinue = useMemo(() => {
    switch (steps[stepIndex].id) {
      case "welcome":
        return true;
      case "email":
        return email.length > 3 && emailVerified;
      case "birthdate":
        return birthDate.length > 0;
      case "issue":
        return true;
      case "export":
        return true;
      default:
        return false;
    }
  }, [stepIndex, email, emailVerified, birthDate, enrollmentResult, bundle]);

  const handleNext = async () => {
    setError(null);
    if (steps[stepIndex].id === "issue") {
      await handleEnrollment();
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

  const handleEnrollment = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await axios.post<EnrollmentResult>(`${API_BASE}/api/enroll`, {
        email,
        birthDate
      });
      setEnrollmentResult(response.data);
      setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
    } catch (err) {
      setError(extractError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await axios.post<BundlePayload>(`${API_BASE}/api/export`);
      setBundle(response.data);
      setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
    } catch (err) {
      setError(extractError(err));
    } finally {
      setIsSubmitting(false);
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
    axios
      .get<{ home?: string }>(`${API_BASE}/health`)
      .then((response) => {
        if (response.data.home) {
          setStorePath(response.data.home);
        }
      })
      .catch(() => {
        // ignore — server may not be running yet
      });
  }, []);

  return (
    <div className="min-h-screen bg-[#f7f9fc]">
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
                      <StatusRow
                        title="Email credential"
                        description="Requires verified email flag."
                        ready={Boolean(enrollmentResult?.issued.email)}
                      />
                      <StatusRow
                        title="Age credential"
                        description="Contains birthdate & age_over_18."
                        ready={Boolean(enrollmentResult?.issued.age)}
                      />
                      <StatusRow
                        title="Agent delegation"
                        description="Grants your agent the right to answer x402 challenges."
                        ready={Boolean(enrollmentResult?.issued.delegation)}
                      />
                      {enrollmentResult && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                          <p className="font-semibold text-trustBlue">DIDs generated</p>
                          <p>
                            Human DID:
                            <code className="ml-2 rounded bg-slate-900/90 px-2 py-1 text-xs text-white">
                              {enrollmentResult.humanDid}
                            </code>
                          </p>
                          <p className="mt-1">
                            Agent DID:
                            <code className="ml-2 rounded bg-slate-900/90 px-2 py-1 text-xs text-white">
                              {enrollmentResult.agentDid}
                            </code>
                          </p>
                        </div>
                      )}
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
                      : callToAction(steps[stepIndex].id, enrollmentResult, bundle)}
                </button>
              </footer>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

const AGNIC_ID_HOME_LABEL = "~/.agnicid";

function callToAction(
  stepId: (typeof steps)[number]["id"],
  enrollmentResult: EnrollmentResult | null,
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
      return enrollmentResult ? "Export bundle" : "Issue credentials";
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

function StatusRow(props: { title: string; description: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-slate-700">{props.title}</p>
        <p className="text-xs text-slate-500">{props.description}</p>
      </div>
      <div
        className={`h-8 w-8 rounded-full text-center text-base leading-8 ${
          props.ready ? "bg-emerald/20 text-emerald-600" : "bg-slate-200 text-slate-500"
        }`}
      >
        {props.ready ? "✓" : "•"}
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
