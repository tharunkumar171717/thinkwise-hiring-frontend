"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "../lib/router";
import ThemeToggle from "../components/ThemeToggle";
import AuthModal, { type AuthMode } from "../components/AuthModal";
import logo from "../assets/thinkwise_logo_transparent.png";
// @ts-ignore
import "../styles/landing.css";

/* ---------- mock data for the product panel ---------- */

const submissions = [
  {
    name: "Maya Chen",
    initials: "MC",
    req: "Sr. Backend Engineer",
    recruiter: "R. Alvarez",
    score: 94,
    status: "Client Review",
  },
  {
    name: "Priya Nair",
    initials: "PN",
    req: "Data Scientist",
    recruiter: "R. Alvarez",
    score: 91,
    status: "Offer",
  },
  {
    name: "Devon Park",
    initials: "DP",
    req: "Product Designer",
    recruiter: "S. Okoro",
    score: 88,
    status: "Screening",
  },
  {
    name: "Aisha Khan",
    initials: "AK",
    req: "Frontend Engineer",
    recruiter: "S. Okoro",
    score: 85,
    status: "Client Review",
  },
  {
    name: "Liam Ford",
    initials: "LF",
    req: "DevOps Lead",
    recruiter: "J. Reyes",
    score: 76,
    status: "Submitted",
  },
];

const requirements = [
  {
    title: "Sr. Backend Engineer",
    client: "Bridgewest",
    count: 12,
    priority: "High",
    fill: "85%",
  },
  {
    title: "Product Designer",
    client: "Genzeon",
    count: 7,
    priority: "Med",
    fill: "55%",
  },
  {
    title: "Data Scientist",
    client: "CtrlS",
    count: 5,
    priority: "High",
    fill: "42%",
  },
  {
    title: "DevOps Lead",
    client: "Kanerika",
    count: 9,
    priority: "Low",
    fill: "68%",
  },
];

const trackers = [
  {
    client: "Bridgewest",
    name: "Weekly submission tracker",
    candidates: 12,
    updated: "2h ago",
  },
  {
    client: "Genzeon",
    name: "Design roles - Q3",
    candidates: 7,
    updated: "1d ago",
  },
  {
    client: "CtrlS",
    name: "Data team build-out",
    candidates: 5,
    updated: "4h ago",
  },
];

const features = [
  [
    "01",
    "Requirement-centric hiring",
    "Anchor every submission around clean, structured job requirements with full traceability.",
  ],
  [
    "02",
    "Recruiter ownership",
    "Track every submission with clear recruiter ownership - no more confusion over who sent whom.",
  ],
  [
    "03",
    "AI-powered screening",
    "Intelligent scoring surfaces top candidates and cuts manual review time dramatically.",
  ],
  [
    "04",
    "Client-ready trackers",
    "Generate professional HTML and Excel trackers, ready to send to clients in seconds.",
  ],
  [
    "05",
    "Internal talent pool",
    "Build a searchable talent pool to reduce sourcing costs and enable faster re-submissions.",
  ],
  [
    "06",
    "Leadership visibility",
    "Give leadership clean, non-intrusive dashboards with real-time pipeline insights.",
  ],
] as const;

const statTargets = [10, 85, 500, 99];
const statSuffixes = ["x", "%", "+", "%"];
const statLabels = [
  "Faster submissions",
  "Less manual work",
  "Candidates tracked",
  "Client satisfaction",
];

/* ---------- badge color helpers (from the design) ---------- */

function badgeStyle(status: string): CSSProperties {
  const map: Record<string, [string, string]> = {
    Offer: ["#1F8A5B", "rgba(31,138,91,.14)"],
    "Client Review": ["#C77700", "rgba(199,119,0,.16)"],
    Screening: ["#2A6FDB", "rgba(42,111,219,.14)"],
    Submitted: ["var(--tw-soft)", "var(--tw-line2)"],
  };
  const [color, background] = map[status] || map.Submitted;
  return { color, background };
}

function prioStyle(priority: string): CSSProperties {
  const map: Record<string, [string, string]> = {
    High: ["#C0271E", "rgba(192,39,30,.14)"],
    Med: ["#C77700", "rgba(199,119,0,.16)"],
    Low: ["var(--tw-soft)", "var(--tw-line2)"],
  };
  const [color, background] = map[priority] || map.Low;
  return { color, background };
}

const tabDefs = [
  ["submissions", "Submissions"],
  ["requirements", "Requirements"],
  ["trackers", "Client trackers"],
] as const;

export default function Landing() {
  const rootRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [tab, setTab] = useState<(typeof tabDefs)[number][0]>("submissions");
  const [counts, setCounts] = useState([0, 0, 0, 0]);
  const [authModal, setAuthModal] = useState<AuthMode | null>(null);

  /* auto-open the auth modal when arriving via /login or /signup redirects
       (?login=1 / ?signup=1) */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("signup")
      ? "signup"
      : params.get("login")
        ? "login"
        : null;
    if (mode) {
      setAuthModal(mode);
      params.delete("login");
      params.delete("signup");
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (qs ? `?${qs}` : ""),
      );
    }
  }, []);

  /* sticky nav backdrop on scroll */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* reveal-on-scroll */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).dataset.reveal = "in";
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    root.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  /* animated stat counters */
  useEffect(() => {
    const target = statsRef.current;
    if (!target) return;
    let raf = 0;
    let started = false;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting || started) return;
          started = true;
          io.disconnect();
          const dur = 1500;
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min(1, (now - start) / dur);
            const ease = 1 - Math.pow(1 - p, 3);
            setCounts(statTargets.map((t) => Math.round(t * ease)));
            if (p < 1) raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        });
      },
      { threshold: 0.35 },
    );
    io.observe(target);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="tw-scope" ref={rootRef}>
      {/* ================= NAV ================= */}
      <nav className="tw-nav" data-scrolled={scrolled}>
        <Link to="/" className="tw-logo">
          <img src={logo.src} alt="Thinkwise" />
        </Link>

        <div className="tw-nav-links">
          <a href="#platform">Platform</a>
          <a href="#features">Features</a>
          <a href="#results">Results</a>
          <a href="#cta">Contact</a>
        </div>

        <div className="tw-nav-actions">
          <ThemeToggle />
          <button
            type="button"
            className="tw-btn tw-btn-ghost"
            onClick={() => setAuthModal("login")}
          >
            Sign In
          </button>
          <button
            type="button"
            className="tw-btn tw-btn-primary"
            onClick={() => setAuthModal("signup")}
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* ================= HERO ================= */}
      <header id="top" className="tw-hero-wrap">
        <div aria-hidden="true" className="tw-hero-glow" />
        <div aria-hidden="true" className="tw-hero-grid" />

        <div className="tw-hero">
          <div data-reveal className="tw-badge">
            <span className="tw-badge-dot" />
            Built for hiring teams
          </div>

          <h1 data-reveal style={{ transitionDelay: ".06s" }}>
            The smarter way to
            <br />
            <span className="tw-accent">manage hiring</span>
          </h1>

          <p
            data-reveal
            className="tw-hero-sub"
            style={{ transitionDelay: ".12s" }}
          >
            A submission-centric workspace that anchors recruiting around
            requirements, tracks ownership, screens with AI, and delivers
            client-ready trackers - all in one place.
          </p>

          {/* <div data-reveal className="tw-hero-actions" style={{ transitionDelay: ".18s" }}>
                        <button type="button" className="tw-btn tw-btn-primary tw-btn-lg" onClick={() => setAuthModal("signup")}>Start free trial →</button>
                        <a href="#platform" className="tw-btn tw-btn-ghost tw-btn-lg">See the platform</a>
                    </div> */}

          {/* <div data-reveal className="tw-hero-note" style={{ transitionDelay: ".24s" }}>
                        No credit card · 14-day trial · Setup in minutes
                    </div> */}
        </div>
      </header>

      {/* ================= PRODUCT PANEL ================= */}
      <section id="platform" className="tw-platform">
        <div data-reveal className="tw-panel">
          {/* window chrome */}
          <div className="tw-panel-chrome">
            <div className="tw-panel-dots">
              <span style={{ background: "#FF5F57" }} />
              <span style={{ background: "#FEBC2E" }} />
              <span style={{ background: "#28C840" }} />
            </div>
            <div className="tw-panel-url">
              hiring.thinkwiseglobal.com/dashboard
            </div>
            <div style={{ width: 52 }} />
          </div>

          {/* tabs */}
          <div role="tablist" className="tw-tabs">
            {tabDefs.map(([id, label]) => (
              <button
                key={id}
                className="tw-tab"
                data-active={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="tw-panel-body">
            {tab === "submissions" && (
              <div className="tw-table-scroll">
                <div className="tw-table">
                  <div className="tw-table-head">
                    <span>Candidate</span>
                    <span>Requirement</span>
                    <span>Recruiter</span>
                    <span>AI score</span>
                    <span>Status</span>
                  </div>
                  {submissions.map((s) => (
                    <div className="tw-table-row" key={s.name}>
                      <div className="tw-cand">
                        <span className="tw-avatar">{s.initials}</span>
                        <span className="tw-cand-name">{s.name}</span>
                      </div>
                      <span className="tw-cell-soft">{s.req}</span>
                      <span className="tw-cell-soft">{s.recruiter}</span>
                      <div className="tw-score">
                        <div className="tw-score-bar">
                          <div
                            className="tw-score-fill"
                            style={{ width: `${s.score}%` }}
                          />
                        </div>
                        <span className="tw-score-num">{s.score}</span>
                      </div>
                      <span className="tw-pill" style={badgeStyle(s.status)}>
                        {s.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "requirements" && (
              <div className="tw-req-grid">
                {requirements.map((r) => (
                  <div className="tw-req-card" key={r.title}>
                    <div className="tw-req-top">
                      <span className="tw-req-title">{r.title}</span>
                      <span className="tw-prio" style={prioStyle(r.priority)}>
                        {r.priority}
                      </span>
                    </div>
                    <div className="tw-req-client">{r.client}</div>
                    <div className="tw-req-count">
                      <b>{r.count}</b>
                      <span>active submissions</span>
                    </div>
                    <div className="tw-req-bar">
                      <div style={{ width: r.fill }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "trackers" && (
              <div className="tw-tracker-grid">
                {trackers.map((t) => (
                  <div className="tw-tracker-card" key={t.client}>
                    <div className="tw-tracker-head">
                      <b>{t.client}</b>
                      <span>{t.updated}</span>
                    </div>
                    <div className="tw-tracker-body">
                      <div className="tw-tracker-name">{t.name}</div>
                      <div className="tw-tracker-count">
                        <b>{t.candidates}</b>
                        <span>candidates</span>
                      </div>
                      <div className="tw-tracker-actions">
                        <span>Export HTML</span>
                        <span>Send to client</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* trust strip */}
        <div data-reveal className="tw-trust">
          <div className="tw-trust-label">Trusted by staffing teams at</div>
          <div className="tw-trust-logos">
            <span>Bridgewest</span>
            <span>Cohere Health</span>
            <span>Kanerika</span>
            <span>CtlrS</span>
            <span>Genzeon</span>
          </div>
        </div>
      </section>

      {/* ================= FEATURES ================= */}
      <section id="features" className="tw-features">
        <div className="tw-features-inner">
          <div data-reveal className="tw-features-head">
            <div>
              <div className="tw-eyebrow">Everything your team needs</div>
              <h2>Built for modern staffing workflows</h2>
            </div>
            <p>
              Six systems working as one - so nothing slips between requirement
              and offer.
            </p>
          </div>

          <div className="tw-features-grid">
            {features.map(([n, title, desc], i) => (
              <div
                data-reveal
                className="tw-feature"
                key={n}
                style={{ transitionDelay: `${(i % 3) * 0.07}s` }}
              >
                <div className="tw-feature-n">{n}</div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= STATS ================= */}
      <section id="results" className="tw-stats" ref={statsRef}>
        <div className="tw-stats-inner">
          <h2 data-reveal>Measurable impact, week one</h2>
          <div className="tw-stats-grid">
            {counts.map((v, i) => (
              <div
                data-reveal
                className="tw-stat"
                key={statLabels[i]}
                style={{ transitionDelay: `${i * 0.08}s` }}
              >
                <div className="tw-stat-num">
                  {v}
                  {statSuffixes[i]}
                </div>
                <div className="tw-stat-label">{statLabels[i]}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section id="cta" className="tw-cta">
        <div data-reveal className="tw-cta-panel">
          <div aria-hidden="true" className="tw-cta-glow" />
          <div className="tw-cta-content">
            <h2>
              Stop chasing spreadsheets.
              <br />
              Start closing roles.
            </h2>
            <p>
              Give recruiters clean ownership, leadership real visibility, and
              clients trackers they actually trust.
            </p>
            {/* <div className="tw-cta-actions">
                            <button type="button" className="tw-btn tw-btn-primary tw-btn-lg" onClick={() => setAuthModal("signup")}>Start free trial →</button>
                            <button type="button" className="tw-btn tw-btn-dark-ghost" onClick={() => setAuthModal("login")}>Book a demo</button>
                        </div> */}
          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="tw-footer">
        <div className="tw-footer-inner">
          <div className="tw-footer-brand">
            <Link to="/" className="tw-logo tw-logo-sm">
              <img src={logo.src} alt="Thinkwise" />
            </Link>
            <p>
              The submission-centric hiring workspace for modern staffing teams.
            </p>
          </div>
          <div className="tw-footer-cols">
            <div className="tw-footer-col">
              <b>Product</b>
              <a href="#platform">Platform</a>
              <a href="#features">Features</a>
              <a href="#results">Results</a>
            </div>
            <div className="tw-footer-col">
              <b>Company</b>
              <a href="#cta">About</a>
              <a href="#cta">Careers</a>
              <a href="#cta">Contact</a>
            </div>
          </div>
        </div>
        <div className="tw-footer-base">
          <span>© 2026 Thinkwise Global. All rights reserved.</span>
          <span>Privacy · Terms · Security</span>
        </div>
      </footer>

      {authModal && (
        <AuthModal
          mode={authModal}
          onClose={() => setAuthModal(null)}
          onSwitchMode={setAuthModal}
        />
      )}
    </div>
  );
}
