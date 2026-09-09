/**
 * Detail rows for the `project_quality` dimension of the LLM analysis.
 *
 * Deliberately NOT part of the overall score - the analyser assigns it weight 0 and
 * the composite excludes it, so existing scores stay comparable. This renders the
 * per-project breakdown that doesn't fit the generic dimension row.
 */

export interface ProjectQualityDim {
    id?: string;
    score?: number;
    verdict?: string;
    project_count?: number;
    projects?: Array<{
        name?: string;
        role?: string;
        complexity?: "high" | "medium" | "low";
        impact?: string;
        concerns?: string;
    }>;
    highlights?: string[];
    concerns?: string[];
    reasoning?: string;
}

const COMPLEXITY_TONE: Record<string, string> = {
    high: "#16a34a",
    medium: "#ca8a04",
    low: "#dc2626",
};

export default function ProjectQualityBlock({ dim }: { dim?: ProjectQualityDim }) {
    if (!dim) return null;

    const projects = (dim.projects || []).filter(p => p?.name || p?.role || p?.impact);
    const highlights = (dim.highlights || []).filter(Boolean);
    const concerns = (dim.concerns || []).filter(Boolean);

    if (!projects.length && !highlights.length && !concerns.length) return null;

    return (
        <div style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {projects.map((p, i) => (
                <div
                    key={i}
                    style={{
                        border: "1px solid var(--border-subtle)", borderRadius: 5,
                        padding: "0.4rem 0.55rem", fontSize: 12,
                    }}
                >
                    <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600 }}>{p.name || "Untitled project"}</span>
                        {p.complexity && (
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: COMPLEXITY_TONE[p.complexity] || "var(--text-secondary)" }}>
                                {p.complexity}
                            </span>
                        )}
                        {p.role && (
                            <span style={{ color: "var(--text-secondary)" }}>· {p.role}</span>
                        )}
                    </div>
                    {p.impact && (
                        <div style={{ color: "var(--text-secondary)", marginTop: "0.15rem" }}>{p.impact}</div>
                    )}
                    {p.concerns && (
                        <div style={{ color: "#ca8a04", marginTop: "0.15rem" }}>⚠ {p.concerns}</div>
                    )}
                </div>
            ))}

            {highlights.length > 0 && (
                <div style={{ fontSize: 12 }}>
                    <span style={{ fontWeight: 600, color: "#16a34a" }}>Highlights: </span>
                    <span style={{ color: "var(--text-secondary)" }}>{highlights.join(" · ")}</span>
                </div>
            )}
            {concerns.length > 0 && (
                <div style={{ fontSize: 12 }}>
                    <span style={{ fontWeight: 600, color: "#dc2626" }}>Probe in interview: </span>
                    <span style={{ color: "var(--text-secondary)" }}>{concerns.join(" · ")}</span>
                </div>
            )}
        </div>
    );
}
