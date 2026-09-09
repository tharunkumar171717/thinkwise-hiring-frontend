import React, { useState, useEffect } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useSearchParams } from "../lib/router";
import { api } from "../services/api";
import Icon from "../components/Icon";
import "../styles/pages.css";
import "../styles/dashboard.css";

interface SearchResponse {
    query: string;
    google_url: string;
}

const fieldLabel: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.06em", color: "var(--twd-faint)", marginBottom: 6,
};

export default function LinkedInSearchPage() {
    useDocumentTitle("LinkedIn Search");
    const [searchParams] = useSearchParams();

    const [jobTitle, setJobTitle] = useState("");
    const [skills, setSkills] = useState("");
    const [experience, setExperience] = useState("");
    const [location, setLocation] = useState("");

    const [result, setResult] = useState<SearchResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Pre-fill from query params (when navigating from RequirementDetail)
    useEffect(() => {
        const title = searchParams.get("title");
        const kw = searchParams.get("keywords");
        if (title) setJobTitle(title);
        if (kw) setSkills(kw);
    }, [searchParams]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const data = await api.post("/api/linkedin/search", {
                job_title: jobTitle,
                keywords: skills
                    ? skills
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean)
                    : [],
                location: location || null,
                experience_years: experience ? parseInt(experience) : null,
            });

            setResult(data);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "An error occurred"
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="twd-scope">
            {/* Page Header */}
            <div className="twd-head twd-head--tight twd-rise">
                <div>
                    <h1 className="twd-title"><span className="twd-title--accent">LinkedIn</span> Search</h1>
                    <p className="twd-sub">Find candidates on LinkedIn with boolean search</p>
                </div>
            </div>

            {/* Search Form Card */}
            <div className="twd-rise" style={{
                background: "var(--twd-surface)", border: "1px solid var(--twd-line2)",
                borderRadius: 16, padding: "1.5rem", marginBottom: "1.25rem",
            }}>
                <form onSubmit={handleSearch}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
                        <div>
                            <label style={fieldLabel}>Job Title</label>
                            <input
                                type="text"
                                className="twd-input"
                                value={jobTitle}
                                onChange={(e) => setJobTitle(e.target.value)}
                                placeholder="e.g. Backend Engineer"
                                style={{ width: "100%" }}
                            />
                        </div>

                        <div>
                            <label style={fieldLabel}>Keywords <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>(comma separated)</span></label>
                            <input
                                type="text"
                                className="twd-input"
                                value={skills}
                                onChange={(e) => setSkills(e.target.value)}
                                placeholder="python, fastapi, aws"
                                style={{ width: "100%" }}
                            />
                        </div>

                        <div>
                            <label style={fieldLabel}>Experience <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>(years)</span></label>
                            <input
                                type="number"
                                className="twd-input"
                                value={experience}
                                onChange={(e) => setExperience(e.target.value)}
                                placeholder="e.g. 3"
                                style={{ width: "100%" }}
                            />
                        </div>

                        <div>
                            <label style={fieldLabel}>Location</label>
                            <input
                                type="text"
                                className="twd-input"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="e.g. Remote, Bangalore"
                                style={{ width: "100%" }}
                            />
                        </div>
                    </div>

                    {error && (
                        <div style={{ marginTop: "1rem", padding: "10px 14px", borderRadius: 10, background: "var(--twd-red-bg)", border: "1px solid color-mix(in srgb, var(--twd-red) 35%, transparent)", color: "var(--twd-red-text)", fontSize: 13 }}>
                            {error}
                        </div>
                    )}

                    <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem" }}>
                        <button
                            type="submit"
                            className="twd-btn twd-btn-primary"
                            disabled={loading || !jobTitle.trim()}
                            style={{ minWidth: 180 }}
                        >
                            <Icon name="search" size={15} /> {loading ? "Searching…" : "Search LinkedIn"}
                        </button>
                    </div>
                </form>
            </div>

            {/* Generated Query Display */}
            {result && (
                <div className="twd-rise" style={{
                    background: "var(--twd-surface)", border: "1px solid var(--twd-line2)", borderRadius: 16,
                    marginBottom: "1rem", padding: "1rem 1.25rem",
                    display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap",
                }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="twd-section-label" style={{ margin: "0 0 8px" }}>Generated Query</div>
                        <code style={{
                            display: "block", padding: "0.6rem 0.85rem",
                            background: "var(--twd-surface2)", borderRadius: 10,
                            border: "1px solid var(--twd-line2)", fontSize: 12,
                            wordBreak: "break-all", color: "var(--twd-ink)",
                            fontFamily: "'Fira Code', 'SF Mono', monospace",
                        }}>
                            {result.query}
                        </code>
                    </div>
                    <a
                        href={result.google_url}
                        target="_blank"
                        rel="noreferrer"
                        className="twd-btn twd-btn-ghost twd-btn-sm"
                        style={{ flexShrink: 0 }}
                    >
                        Open in New Tab <Icon name="external" size={13} />
                    </a>
                </div>
            )}

            {/* Results iframe */}
            {result && result.google_url && (
                <div style={{
                    border: "1px solid var(--twd-line2)", borderRadius: 16,
                    overflow: "hidden", background: "#fff",
                }}>
                    <iframe
                        src={result.google_url}
                        title="LinkedIn Search Results"
                        style={{ width: "100%", height: "calc(100vh - 120px)", border: "none", display: "block" }}
                        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                        referrerPolicy="no-referrer"
                    />
                </div>
            )}

            {/* Empty state when no search yet */}
            {!result && !loading && (
                <div className="twd-empty twd-rise" style={{ animationDelay: "0.05s" }}>
                    <Icon name="linkedin" size={40} />
                    <div style={{ fontSize: 14 }}>
                        Enter a job title and keywords above, then click <strong>Search LinkedIn</strong> to find candidates.
                    </div>
                    <div style={{ fontSize: 12, marginTop: "0.5rem" }}>
                        Results will appear here in an embedded view.
                    </div>
                </div>
            )}
        </div>
    );
}
