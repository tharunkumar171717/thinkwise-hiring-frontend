/**
 * Resume-authenticity readout for the LLM analysis.
 *
 * Only rendered when the analyser actually ran the check, which it does only for
 * resumes scoring above 95 - a resume written end-to-end by an AI mirrors the JD
 * almost perfectly, which is what pushes it that high. Below the threshold the
 * backend stores `checked: false`, and this renders nothing rather than implying
 * a clean bill of health it never established.
 */

export interface Authenticity {
    checked?: boolean;
    ai_likelihood?: number | null;
    verdict?: string;
    signals?: Array<{ signal?: string; evidence?: string; direction?: "ai" | "human" }>;
    recommendation?: string;
}

const VERDICT_LABEL: Record<string, string> = {
    likely_ai_generated: "Likely AI-generated",
    possibly_ai_assisted: "Possibly AI-assisted",
    likely_human: "Reads as human-written",
};

function toneFor(verdict?: string, likelihood?: number | null) {
    const score = typeof likelihood === "number" ? likelihood : -1;
    if (verdict === "likely_ai_generated" || score >= 75) {
        return { fg: "#dc2626", border: "#fecaca", bg: "rgba(220,38,38,0.05)" };
    }
    if (verdict === "possibly_ai_assisted" || score >= 40) {
        return { fg: "#ca8a04", border: "#fde68a", bg: "rgba(202,138,4,0.06)" };
    }
    return { fg: "#16a34a", border: "#bbf7d0", bg: "rgba(22,163,74,0.06)" };
}

export default function AuthenticityPanel({ authenticity }: { authenticity?: Authenticity }) {
    if (!authenticity?.checked) return null;

    const { ai_likelihood, verdict, signals = [], recommendation } = authenticity;
    const tone = toneFor(verdict, ai_likelihood);
    const label = VERDICT_LABEL[verdict || ""] || "Authenticity reviewed";

    const aiSignals = signals.filter(s => s?.direction !== "human" && (s?.signal || s?.evidence));
    const humanSignals = signals.filter(s => s?.direction === "human" && (s?.signal || s?.evidence));

    return (
        <div style={{
            borderRadius: 6, border: `1px solid ${tone.border}`, background: tone.bg,
            padding: "0.6rem 0.75rem",
        }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, fontSize: 12, color: tone.fg }}>
                    Resume authenticity — {label}
                </span>
                {typeof ai_likelihood === "number" && (
                    <span className="font-mono" style={{ marginLeft: "auto", fontWeight: 600, color: tone.fg }}>
                        {ai_likelihood}/100
                    </span>
                )}
            </div>

            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                Checked because this resume scored above 95. AI-assisted writing is common and is
                not misconduct — treat this as something to verify in the interview.
            </div>

            {aiSignals.length > 0 && (
                <div style={{ marginTop: "0.5rem" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: tone.fg, marginBottom: "0.2rem" }}>
                        Signals
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "1rem", fontSize: 12, color: "var(--text-secondary)" }}>
                        {aiSignals.map((s, i) => (
                            <li key={i}>
                                {s.signal}
                                {s.evidence && (
                                    <span style={{ fontStyle: "italic" }}> — “{s.evidence}”</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {humanSignals.length > 0 && (
                <div style={{ marginTop: "0.45rem" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#16a34a", marginBottom: "0.2rem" }}>
                        Points to a human author
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "1rem", fontSize: 12, color: "var(--text-secondary)" }}>
                        {humanSignals.map((s, i) => (
                            <li key={i}>
                                {s.signal}
                                {s.evidence && (
                                    <span style={{ fontStyle: "italic" }}> — “{s.evidence}”</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {recommendation && (
                <div style={{ fontSize: 12, color: "var(--text-primary)", marginTop: "0.5rem" }}>
                    <strong>Suggested check:</strong> {recommendation}
                </div>
            )}
        </div>
    );
}
