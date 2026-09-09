import { useEffect, useState } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import Icon from "../components/Icon";
import "../styles/pages.css";
import { fmtDate } from "../utils/dateUtils";

interface User {
    id: string;
    name: string;
    email: string;
    role: string;
    is_super_admin: boolean;
    is_active: boolean;
}

interface Invite {
    email: string;
    invited_by_name: string;
    notes?: string;
    created_at: string;
    used: boolean;
}


type Tab = "active" | "inactive" | "invites";

export default function TeamManagement() {
    useDocumentTitle("Team Management");
    const { isSuperAdmin, user: currentUser } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [invites, setInvites] = useState<Invite[]>([]);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteNotes, setInviteNotes] = useState("");
    const [inviting, setInviting] = useState(false);
    const [inviteMsg, setInviteMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [resetLinks, setResetLinks] = useState<Record<string, string>>({});
    // userId -> true when Resend accepted the reset mail, so the admin knows
    // whether they still need to hand the link over manually.
    const [resetEmailed, setResetEmailed] = useState<Record<string, boolean>>({});
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>("active");

    useEffect(() => {
        fetchUsers();
        fetchInvites();
    }, []);

    const fetchUsers = async () => {
        try {
            const data = await api.get("/users");
            const sorted = data.sort((a: User, b: User) => {
                if (a.is_super_admin === b.is_super_admin) return 0;
                return a.is_super_admin ? -1 : 1;
            });
            setUsers(sorted);
        } catch (err: any) {
            setError(err.message || "Failed to load users");
        } finally {
            setLoading(false);
        }
    };

    const fetchInvites = async () => {
        try {
            const data = await api.get("/users/invitations");
            setInvites(data);
        } catch { /* non-fatal */ }
    };

    const handleInvite = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setInviting(true);
        setInviteMsg(null);
        try {
            const res = await api.post("/users/invite", { email: inviteEmail.trim().toLowerCase(), notes: inviteNotes || undefined });
            setInviteMsg({ text: res.message || `${inviteEmail} approved for signup.`, ok: true });
            setInviteEmail("");
            setInviteNotes("");
            fetchInvites();
        } catch (err: any) {
            setInviteMsg({ text: err.detail || err.message || "Failed to approve email", ok: false });
        } finally {
            setInviting(false);
        }
    };

    const handleRevokeInvite = async (email: string) => {
        if (!confirm(`Remove ${email} from the approved list?`)) return;
        try {
            await api.delete(`/users/invitations/${encodeURIComponent(email)}`);
            fetchInvites();
        } catch (err: any) {
            alert(err.detail || err.message || "Failed to revoke");
        }
    };

    const handleGenerateResetLink = async (userId: string) => {
        setActionLoading(userId);
        try {
            const res = await api.post(`/users/${userId}/reset-link`, {});
            setResetLinks(prev => ({ ...prev, [userId]: res.reset_link }));
            setResetEmailed(prev => ({ ...prev, [userId]: !!res.emailed }));
        } catch (err: any) {
            alert(err.detail || "Failed to generate reset link");
        } finally {
            setActionLoading(null);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).catch(() => {
            prompt("Copy this reset link:", text);
        });
    };

    const activeUsers = users.filter(u => u.is_active !== false);
    const inactiveUsers = users.filter(u => u.is_active === false);

    useEffect(() => {
        if (inactiveUsers.length === 0 && activeTab === "inactive") {
            setActiveTab("active");
        }
    }, [inactiveUsers.length, activeTab]);

    const handleRoleUpdate = async (userId: string, newRole: string) => {
        setActionLoading(userId);
        try {
            await api.patch(`/users/${userId}/role`, { role: newRole });
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
        } catch (err: any) {
            alert(err.message || "Failed to update role");
        } finally {
            setActionLoading(null);
        }
    };

    const handleStatusUpdate = async (userId: string, isActive: boolean) => {
        if (!confirm(isActive ? "Restore this user?" : "Deactivate this user?")) return;
        setActionLoading(userId);
        try {
            await api.patch(`/users/${userId}/status`, { is_active: isActive });
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: isActive } : u));
        } catch (err: any) {
            alert(err.message || "Failed to update status");
        } finally {
            setActionLoading(null);
        }
    };

    const getInitials = (name: string) =>
        name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

    const getBadgeClass = (role: string, isSuper: boolean) => {
        if (isSuper) return "role-badge super-admin";
        if (role === "ADMIN") return "role-badge admin";
        return "role-badge recruiter";
    };

    if (!isSuperAdmin) {
        return (
            <div className="table-empty">
                <div className="table-empty-icon"><Icon name="x" size={48} /></div>
                <h3>Access Denied</h3>
                <p>Only Super Admins can access this page.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="table-empty">
                <div className="loading-spinner">Loading team data...</div>
            </div>
        );
    }

    const totalUsers = users.length;
    const activeAdmins = activeUsers.filter(u => u.role === "ADMIN" || u.is_super_admin).length;
    const activeRecruiters = activeUsers.filter(u => u.role === "RECRUITER").length;
    const inactiveCount = inactiveUsers.length;
    const currentList = activeTab === "active" ? activeUsers : inactiveUsers;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>Team Management</h1>
                    <p className="page-header-sub">Manage user roles and platform access</p>
                </div>
            </div>

            <div className="stats-row">
                <div className="stat-box">
                    <div className="stat-box-value accent">{totalUsers}</div>
                    <div className="stat-box-label">Total Accounts</div>
                </div>
                <div className="stat-box">
                    <div className="stat-box-value">{activeAdmins}</div>
                    <div className="stat-box-label">Active Admins</div>
                </div>
                <div className="stat-box">
                    <div className="stat-box-value">{activeRecruiters}</div>
                    <div className="stat-box-label">Active Recruiters</div>
                </div>
                {inactiveCount > 0 && (
                    <div className="stat-box" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-secondary)' }}>
                        <div className="stat-box-value text-muted">{inactiveCount}</div>
                        <div className="stat-box-label">Inactive</div>
                    </div>
                )}
            </div>

            {error && <div className="form-error mb-1">{error}</div>}

            {/* Tabs */}
            <div className="filter-bar" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 0, gap: '2rem' }}>
                {(["active", "inactive", "invites"] as Tab[]).map((tab) => {
                    if (tab === "inactive" && inactiveUsers.length === 0) return null;
                    const label = tab === "active" ? `Active (${activeUsers.length})`
                        : tab === "inactive" ? `Inactive (${inactiveUsers.length})`
                            : `Approved Emails (${invites.filter(i => !i.used).length})`;
                    return (
                        <button key={tab} onClick={() => {
                            setActiveTab(tab);
                        }} style={{
                            background: 'none', border: 'none',
                            borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                            padding: '0.75rem 0',
                            color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                            fontWeight: activeTab === tab ? 600 : 500,
                            cursor: 'pointer', fontSize: '0.95rem',
                        }}>{label}</button>
                    );
                })}
            </div>

            {/* Approved Emails tab */}
            {activeTab === "invites" && (
                <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: '1.25rem' }}>
                        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Approve email for signup</div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                            The user can then go to <strong>/signup</strong> and create their account with this email.
                        </div>
                        <form onSubmit={handleInvite} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div className="form-group" style={{ flex: '1 1 240px', marginBottom: 0 }}>
                                <label style={{ fontSize: 13 }}>Email address</label>
                                <input type="email" className="form-input" value={inviteEmail}
                                    onChange={e => setInviteEmail(e.target.value)}
                                    placeholder="recruiter@company.com" required />
                            </div>
                            <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
                                <label style={{ fontSize: 13 }}>Notes (optional)</label>
                                <input type="text" className="form-input" value={inviteNotes}
                                    onChange={e => setInviteNotes(e.target.value)}
                                    placeholder="e.g. Senior Recruiter" />
                            </div>
                            <button type="submit" className="btn btn-primary" disabled={inviting} style={{ height: 38 }}>
                                {inviting ? "Adding…" : "Approve Email"}
                            </button>
                        </form>
                        {inviteMsg && (
                            <div style={{ marginTop: '0.6rem', fontSize: 13, color: inviteMsg.ok ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)' }}>
                                {inviteMsg.text}
                            </div>
                        )}
                    </div>

                    <div className="data-table-wrap">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Email</th>
                                    <th>Added by</th>
                                    <th>Notes</th>
                                    <th>Date</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invites.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center p-8 text-muted">No approved emails yet.</td></tr>
                                ) : invites.map((inv) => (
                                    <tr key={inv.email}>
                                        <td className="font-mono" style={{ fontSize: 13 }}>{inv.email}</td>
                                        <td className="text-sm">{inv.invited_by_name || "-"}</td>
                                        <td className="text-sm text-muted">{inv.notes || "-"}</td>
                                        <td className="text-sm text-muted">
                                            {fmtDate(inv.created_at)}
                                        </td>
                                        <td>
                                            {inv.used
                                                ? <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>● Signed up</span>
                                                : <span style={{ fontSize: 12, color: '#ca8a04', fontWeight: 600 }}>○ Pending</span>}
                                        </td>
                                        <td>
                                            {!inv.used && (
                                                <button className="btn btn-ghost btn-sm"
                                                    style={{ color: 'var(--danger, #dc2626)', fontSize: 12 }}
                                                    onClick={() => handleRevokeInvite(inv.email)}>
                                                    Remove
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Users table */}
            {activeTab !== "invites" && (
                <div className="data-table-wrap" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: '-1.25rem' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentList.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="text-center p-8 text-muted">
                                        No {activeTab} users found.
                                    </td>
                                </tr>
                            ) : (
                                currentList.map((user) => (
                                    <tr key={user.id}>
                                        <td>
                                            <div className="avatar-group" style={{ opacity: !user.is_active ? 0.6 : 1 }}>
                                                <div className="avatar-circle" style={{ filter: !user.is_active ? "grayscale(1)" : "none" }}>
                                                    {getInitials(user.name)}
                                                </div>
                                                <div className="avatar-info">
                                                    <span className="avatar-name">{user.name}</span>
                                                    <span className="avatar-email">{user.email}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={getBadgeClass(user.role, user.is_super_admin)} style={{ filter: !user.is_active ? "grayscale(1)" : "none" }}>
                                                {user.is_super_admin ? "Super Admin" : user.role === "ADMIN" ? "Admin" : "Recruiter"}
                                            </span>
                                        </td>
                                        <td>
                                            {user.is_active
                                                ? <span className="text-success text-sm font-mono">● Active</span>
                                                : <span className="text-muted text-sm font-mono">○ Inactive</span>}
                                        </td>
                                        <td>
                                            <div className="page-actions" style={{ justifyContent: "flex-start", flexWrap: 'wrap', gap: '0.35rem' }}>
                                                {!user.is_super_admin && user.id !== currentUser?.id && (
                                                    <>
                                                        {user.is_active ? (
                                                            <>
                                                                {user.role !== 'ADMIN' && (
                                                                    <button onClick={() => handleRoleUpdate(user.id, "ADMIN")}
                                                                        disabled={actionLoading === user.id} className="btn-sm-primary">
                                                                        Promote
                                                                    </button>
                                                                )}
                                                                {user.role === 'ADMIN' && (
                                                                    <button onClick={() => handleRoleUpdate(user.id, "RECRUITER")}
                                                                        disabled={actionLoading === user.id} className="btn-sm-outline">
                                                                        Demote
                                                                    </button>
                                                                )}
                                                                <button onClick={() => handleStatusUpdate(user.id, false)}
                                                                    disabled={actionLoading === user.id} className="btn-sm-outline"
                                                                    style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
                                                                    Remove
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button onClick={() => handleStatusUpdate(user.id, true)}
                                                                disabled={actionLoading === user.id} className="btn-sm-primary">
                                                                Restore
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                                {/* Reset password link - available for all non-self users */}
                                                {user.id !== currentUser?.id && (
                                                    resetLinks[user.id] ? (
                                                        <button className="btn-sm-outline"
                                                            style={{ fontSize: 11 }}
                                                            title={resetEmailed[user.id]
                                                                ? `Emailed to ${user.email} — copy the link too if you need it`
                                                                : "Email is not configured — send this link to them yourself"}
                                                            onClick={() => { copyToClipboard(resetLinks[user.id]); }}>
                                                            {resetEmailed[user.id] ? "Emailed · Copy Link" : "Copy Reset Link"}
                                                        </button>
                                                    ) : (
                                                        <button className="btn-sm-outline"
                                                            disabled={actionLoading === user.id}
                                                            onClick={() => handleGenerateResetLink(user.id)}>
                                                            Reset Link
                                                        </button>
                                                    )
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
