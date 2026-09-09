import { NavLink, useNavigate, useLocation } from "../lib/router";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import ThemeToggle from "./ThemeToggle";

import JdSidePanel from "./JdSidePanel";
import ProfileDrawer from "./ProfileDrawer";
import ResumeDrawer from "./ResumeDrawer";
import Icon from "./Icon";
import TopbarBreadcrumb from "./TopbarBreadcrumb";
import { JdViewerProvider, useJdViewer } from "../context/JdViewerContext";
import { useSideDrawer } from "../context/SideDrawerContext";
import logo from "../assets/thinkwise_logo_transparent.png";
import { NOTIFICATION_STATUS_LABEL } from "../utils/statusUtils";
import "./DashboardLayout.css";

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

export default function DashboardLayout({ children }: { children?: ReactNode }) {
    return (
        <JdViewerProvider>
            <DashboardLayoutInner>{children}</DashboardLayoutInner>
        </JdViewerProvider>
    );
}

function DashboardLayoutInner({ children }: { children?: ReactNode }) {
    const { user, logout, isAdmin, isSuperAdmin } = useAuth();
    const { isOpen: jdOpen } = useJdViewer();
    const sideDrawer = useSideDrawer();
    const navigate = useNavigate();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [bellOpen, setBellOpen] = useState(false);


    const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
        try { return new Set(JSON.parse(localStorage.getItem("tw_dismissed_notifs") || "[]")); }
        catch { return new Set(); }
    });
    const [readIds, setReadIds] = useState<Set<string>>(() => {
        try { return new Set(JSON.parse(localStorage.getItem("tw_read_notifs") || "[]")); }
        catch { return new Set(); }
    });
    const bellRef = useRef<HTMLDivElement>(null);

    const saveDismissed = (ids: Set<string>) => {
        localStorage.setItem("tw_dismissed_notifs", JSON.stringify([...ids]));
        setDismissedIds(new Set(ids));
    };

    const dismissOne = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const next = new Set(dismissedIds);
        next.add(id);
        saveDismissed(next);
    };

    const dismissAll = () => {
        const next = new Set(dismissedIds);
        notifications.filter(n => !dismissedIds.has(n.id)).forEach(n => next.add(n.id));
        saveDismissed(next);
    };

    const fetchNotifications = async () => {
        try {
            const data = await api.get("/notifications");
            setNotifications(data || []);
        } catch { /* silent */ }
    };

    useEffect(() => {
        if (!user) return;
        void fetchNotifications();
        const interval = setInterval(() => void fetchNotifications(), 60000);
        return () => clearInterval(interval);
    }, [user?.id]);

    // Owners need to notice that someone is blocked waiting on them, so the
    // pending count rides on the sidebar link.
    const [profileApprovalCount, setProfileApprovalCount] = useState(0);
    useEffect(() => {
        if (!user) return;
        const load = async () => {
            try {
                const data = await api.get("/profile-access-requests/pending-count");
                setProfileApprovalCount(data?.pending || 0);
            } catch { /* silent */ }
        };
        void load();
        const interval = setInterval(() => void load(), 60000);
        return () => clearInterval(interval);
    }, [user?.id]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
                setBellOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const visibleNotifications = notifications.filter(n => !dismissedIds.has(n.id));
    const unreadCount = visibleNotifications.filter(n => !readIds.has(n.id)).length;

    const handleBellClick = () => {
        setBellOpen(prev => !prev);
        if (!bellOpen) {
            const allIds = notifications.map(n => n.id);
            localStorage.setItem("tw_read_notifs", JSON.stringify(allIds));
            setReadIds(new Set(allIds));
        }
    };

    const handleLogout = () => {
        logout();
        navigate("/");
    };

    const closeMobile = () => setMobileOpen(false);

    // Auto-collapse the sidebar to icons while the JD panel is open or on the
    // candidate full-view page (it has its own internal side nav) so the
    // content keeps breathing room. The user can still expand it with the
    // toggle - that choice overrides the auto-collapse until the context ends.
    const location = useLocation();
    const isFullProfilePage = /^\/requirements\/[^/]+\/profiles\/[^/]+$/.test(location.pathname)
        || /^\/dashboard\/[^/]+\/[^/]+\/[^/]+$/.test(location.pathname)
        || /^\/my-requirements\/[^/]+\/[^/]+$/.test(location.pathname);
    const autoCollapse = jdOpen || isFullProfilePage
        // Analytics has its own section nav - fold the main sidebar (reopenable)
        || location.pathname.startsWith("/analytics");

    // Sidebar highlight: deep requirement/candidate pages highlight the section
    // the user actually came from (My Requirements vs Dashboard), carried via
    // navigation state; falls back to a sensible default per role.
    const navFrom = (location.state as any)?.from as string | undefined;
    const onDashPath = location.pathname.startsWith("/dashboard");
    const onReqPath = location.pathname.startsWith("/requirements");
    const myReqContext = navFrom === "/my-requirements";
    const reqNoContext = onReqPath && !navFrom;
    const dashActive = (onDashPath && !myReqContext)
        || (onReqPath && !!navFrom?.startsWith("/dashboard"))
        || (reqNoContext && isAdmin);
    const myReqActive = location.pathname.startsWith("/my-requirements")
        || ((onDashPath || onReqPath) && myReqContext)
        || (reqNoContext && !isAdmin);
    const [autoCollapseOverride, setAutoCollapseOverride] = useState(false);
    useEffect(() => { setAutoCollapseOverride(false); }, [autoCollapse]);
    const effCollapsed = autoCollapse ? !autoCollapseOverride : collapsed;
    const toggleSidebar = () => {
        if (autoCollapse) setAutoCollapseOverride(o => !o);
        else setCollapsed(c => !c);
    };

    return (
        <div className={`layout ${effCollapsed ? "layout--collapsed" : ""} ${jdOpen ? "layout--jd-open" : ""}`}>
            {mobileOpen && <div className="sidebar-overlay" onClick={closeMobile} />}

            <aside className={`sidebar ${mobileOpen ? "sidebar--open" : ""}`}>
                <div className="sidebar-top">
                    <div className="sidebar-brand" onClick={() => navigate("/dashboard")}>
                        {!effCollapsed && <img src={logo.src} alt="TW" className="sidebar-logo" />}
                    </div>
                    <button
                        className="sidebar-collapse-btn desktop-only"
                        onClick={toggleSidebar}
                        title={effCollapsed ? "Expand" : "Collapse"}
                    >
                        {effCollapsed ? "▶" : "◀"}
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {!isSuperAdmin && (
                        <div className="nav-section">
                            {!effCollapsed && <span className="nav-label">Main</span>}
                            <NavLink to="/dashboard" className={() => `nav-item${dashActive ? " active" : ""}`} onClick={closeMobile}>
                                <span className="nav-icon"><Icon name="dashboard" size={16} /></span>
                                {!effCollapsed && <span>Dashboard</span>}
                            </NavLink>
                            {!isAdmin && (
                                <NavLink to="/my-requirements" className={() => `nav-item${myReqActive ? " active" : ""}`} onClick={closeMobile}>
                                    <span className="nav-icon"><Icon name="briefcase" size={16} /></span>
                                    {!effCollapsed && <span>My Requirements</span>}
                                </NavLink>
                            )}
                            {!isAdmin && (
                                <NavLink to="/my-submissions" className="nav-item" onClick={closeMobile}>
                                    <span className="nav-icon"><Icon name="send" size={16} /></span>
                                    {!effCollapsed && <span>My Submissions</span>}
                                </NavLink>
                            )}
                        </div>
                    )}

                    {!isSuperAdmin && (
                        <div className="nav-section">
                            {!effCollapsed && <span className="nav-label">Recruitment</span>}

                            {/* THIS IS NOW A NORMAL LINK TO THE NEW PAGE */}
                            <NavLink to="/email-resumes" className="nav-item" onClick={closeMobile}>
                                <span className="nav-icon"><Icon name="mail" size={16} /></span>
                                {!effCollapsed && <span>Resumes from Email</span>}
                            </NavLink>

                            <NavLink to="/linkedin-search" className="nav-item" onClick={closeMobile}>
                                <span className="nav-icon"><Icon name="linkedin" size={16} /></span>
                                {!effCollapsed && <span>LinkedIn Search</span>}
                            </NavLink>

                            <NavLink to="/talent-pool" className="nav-item" onClick={closeMobile}>
                                <span className="nav-icon"><Icon name="talent-pool" size={16} /></span>
                                {!effCollapsed && <span>Talent Pool</span>}
                            </NavLink>
                            <NavLink to="/assignment-requests" className="nav-item" onClick={closeMobile}>
                                <span className="nav-icon"><Icon name="send" size={16} /></span>
                                {!effCollapsed && <span>{isAdmin ? "Assignment Requests" : "My Requests"}</span>}
                            </NavLink>
                            <NavLink to="/profile-approvals" className="nav-item" onClick={closeMobile}>
                                <span className="nav-icon"><Icon name="team" size={16} /></span>
                                {!effCollapsed && (
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                        Profile Approvals
                                        {profileApprovalCount > 0 && (
                                            <span style={{
                                                fontSize: 10, fontWeight: 700, lineHeight: 1,
                                                padding: "2px 6px", borderRadius: 999,
                                                background: "#dc2626", color: "#fff",
                                            }}>{profileApprovalCount}</span>
                                        )}
                                    </span>
                                )}
                            </NavLink>
                            <NavLink to="/analytics" className="nav-item" onClick={closeMobile}>
                                <span className="nav-icon"><Icon name="chart" size={16} /></span>
                                {!effCollapsed && <span>Analytics</span>}
                            </NavLink>
                            <NavLink to="/eod-reports" className="nav-item" onClick={closeMobile}>
                                <span className="nav-icon"><Icon name="document" size={16} /></span>
                                {!effCollapsed && <span>EOD Reports</span>}
                            </NavLink>
                            {isAdmin && (
                                <NavLink to="/client-activity" className="nav-item" onClick={closeMobile}>
                                    <span className="nav-icon"><Icon name="briefcase" size={16} /></span>
                                    {!effCollapsed && <span>Client Activity</span>}
                                </NavLink>
                            )}
                        </div>
                    )}

                    {isAdmin && isSuperAdmin && (
                        <div className="nav-section">
                            {!effCollapsed && <span className="nav-label">Overview</span>}
                            <NavLink to="/dashboard" className="nav-item" onClick={closeMobile}>
                                <span className="nav-icon"><Icon name="dashboard" size={16} /></span>
                                {!effCollapsed && <span>Dashboard</span>}
                            </NavLink>
                            <NavLink to="/analytics" className="nav-item" onClick={closeMobile}>
                                <span className="nav-icon"><Icon name="chart" size={16} /></span>
                                {!effCollapsed && <span>Analytics</span>}
                            </NavLink>
                            <NavLink to="/eod-reports" className="nav-item" onClick={closeMobile}>
                                <span className="nav-icon"><Icon name="document" size={16} /></span>
                                {!effCollapsed && <span>EOD Reports</span>}
                            </NavLink>
                            <NavLink to="/client-activity" className="nav-item" onClick={closeMobile}>
                                <span className="nav-icon"><Icon name="briefcase" size={16} /></span>
                                {!collapsed && <span>Client Activity</span>}
                            </NavLink>
                        </div>
                    )}
                    {isAdmin && isSuperAdmin && (
                        <div className="nav-section">
                            {!effCollapsed && <span className="nav-label">Admin</span>}
                            <NavLink to="/team" className="nav-item" onClick={closeMobile}>
                                <span className="nav-icon"><Icon name="team" size={16} /></span>
                                {!effCollapsed && <span>Team</span>}
                            </NavLink>
                            <NavLink to="/clients" className="nav-item" onClick={closeMobile}>
                                <span className="nav-icon"><Icon name="briefcase" size={16} /></span>
                                {!effCollapsed && <span>Clients</span>}
                            </NavLink>
                        </div>
                    )}
                </nav>

                <div className="sidebar-bottom">
                    <div className="sidebar-user">
                        <div className="user-avatar">
                            {user?.name?.charAt(0).toUpperCase()}
                        </div>
                        {!effCollapsed && (
                            <div className="user-info">
                                <span className="user-name">{user?.name}</span>
                                <span className="user-role">{user?.role}</span>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            <div className="main-area">
                <header className="topbar">
                    <button className="mobile-menu-btn mobile-only" onClick={() => setMobileOpen(!mobileOpen)}>
                        {"\u2630"}
                    </button>
                    <TopbarBreadcrumb />
                    <div className="topbar-spacer" />
                    <div className="topbar-actions">
                        <ThemeToggle />
                        <div ref={bellRef} style={{ position: "relative" }}>
                            <button
                                onClick={handleBellClick}
                                className="btn btn-ghost btn-sm"
                                style={{ position: "relative", padding: "6px 10px" }}
                                title="Notifications"
                                aria-label="Notifications"
                            >
                                <Icon name="bell" size={16} />
                                {unreadCount > 0 && (
                                    <span style={{
                                        position: "absolute", top: "2px", right: "2px",
                                        background: "var(--accent)", color: "#fff",
                                        borderRadius: "999px", fontSize: "10px", fontWeight: 700,
                                        minWidth: "16px", height: "16px",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        padding: "0 3px", lineHeight: 1,
                                    }}>
                                        {unreadCount > 9 ? "9+" : unreadCount}
                                    </span>
                                )}
                            </button>
                            {bellOpen && (
                                <div className="notif-pop">
                                    <div className="notif-pop-head">
                                        <span className="notif-pop-title">Notifications</span>
                                        {visibleNotifications.length > 0 && (
                                            <button type="button" className="notif-clear" onClick={dismissAll}>Clear all</button>
                                        )}
                                    </div>
                                    {visibleNotifications.length === 0 ? (
                                        <div className="notif-empty">No updates yet</div>
                                    ) : (
                                        <div className="notif-list">
                                            {visibleNotifications.map(n => {
                                                const isAssignment = n.kind === "assignment_request" || n.kind === "assignment_decision";
                                                const target = isAssignment
                                                    ? (n.kind === "assignment_request" ? "/assignment-requests" : `/requirements/${n.requirement_id || ""}`)
                                                    : (n.requirement_id ? `/requirements/${n.requirement_id}` : "/dashboard");
                                                const accentColor = n.status === "rejected" || n.status === "REJECTED" ? "var(--accent)"
                                                    : n.status === "pending" ? "#ca8a04"
                                                        : n.status === "closed" ? "var(--text-muted)"
                                                            : "var(--success, #16a34a)";
                                                return (
                                                    <div
                                                        key={n.id}
                                                        className={`notif-item${readIds.has(n.id) ? "" : " notif-item--unread"}`}
                                                        onClick={() => { navigate(target); setBellOpen(false); }}
                                                    >
                                                        <span className="notif-ico">
                                                            <Icon
                                                                name={n.kind === "assignment_request" ? "users" : n.kind === "assignment_decision" ? "send" : "user"}
                                                                size={14}
                                                            />
                                                        </span>
                                                        <div className="notif-body">
                                                            <div className="notif-title" title={n.title}>{n.title}</div>
                                                            <div className="notif-sub" style={{ color: accentColor }}>
                                                                {n.kind === "application" ? (NOTIFICATION_STATUS_LABEL[n.status] || n.subtitle) : n.subtitle}
                                                            </div>
                                                            <div className="notif-meta">
                                                                <span className="notif-meta-ctx">{n.context || ""}</span>
                                                                <span className="notif-meta-time">{n.occurred_at ? timeAgo(n.occurred_at) : ""}</span>
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className="notif-x"
                                                            onClick={(e) => dismissOne(e, n.id)}
                                                            aria-label="Dismiss"
                                                        ><Icon name="x" size={12} /></button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <button onClick={handleLogout} className="btn btn-ghost btn-sm">Sign Out</button>
                    </div>
                </header>

                <main className="page-content">
                    {children}
                </main>
            </div>



            <JdSidePanel />
            {sideDrawer.state.mode === "profile" && (
                <ProfileDrawer
                    jdId={sideDrawer.state.jdId}
                    profile={sideDrawer.state.profile}
                    action={sideDrawer.state.action}
                    initialTab={sideDrawer.state.initialTab}
                />
            )}
            {sideDrawer.state.mode === "resume" && (
                <ResumeDrawer
                    candidateId={sideDrawer.state.candidateId}
                    candidateName={sideDrawer.state.candidateName}
                />
            )}
        </div>
    );
}