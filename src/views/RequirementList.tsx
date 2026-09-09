import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "../lib/router";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import StatusBadge from "../components/StatusBadge";
import "../styles/pages.css";
import { fmtDate } from "../utils/dateUtils";

interface Requirement {
    id: string;
    req_id: string;
    requirement_name: string;
    status: string;
    sla_status?: string | null;
    sla_breached?: boolean | null;
    sla_remaining_hours?: number | null;
    requirement_type: string | null;
    role_type: string | null;
    client_spoc_name: string | null;
    created_at: string;
}

export default function RequirementList() {
    const { isAdmin } = useAuth();
    const navigate = useNavigate();
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");

    useEffect(() => {
        api.get("/requirements")
            .then((data) => setRequirements(data || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);


    if (isAdmin) {
        return <Navigate to="/dashboard" replace />;
    }

    const filtered = requirements.filter((r) => {
        const matchesSearch =
            r.requirement_name.toLowerCase().includes(search.toLowerCase()) ||
            r.req_id.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === "ALL" || r.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const renderSla = (req: Requirement) => {
        const status = req.sla_status || "ON_TRACK";
        const breached = Boolean(req.sla_breached);
        if (status === "MET") {
            return <span className="sla-badge sla-badge--met">Met</span>;
        }
        if (breached || status === "BREACHED") {
            return <span className="sla-badge sla-badge--breached">Breached</span>;
        }
        const remainingText =
            req.sla_remaining_hours != null
                ? `${Math.ceil(req.sla_remaining_hours)}h left`
                : "On Track";
        return <span className="sla-badge sla-badge--ontrack">{remainingText}</span>;
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>Requirements</h1>
                    <p className="page-header-sub">
                        {requirements.length} total requirements
                    </p>
                </div>
                {isAdmin && (
                    <button
                        className="btn btn-primary"
                        onClick={() => navigate("/requirements/new")}
                    >
                        + Create Requirement
                    </button>
                )}
            </div>

            <div className="filter-bar">
                <input
                    type="text"
                    placeholder="Search by name or Req ID..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                >
                    <option value="ALL">All Statuses</option>
                    <option value="OPEN">Open</option>
                    <option value="ON_HOLD">On Hold</option>
                    <option value="CLOSED">Closed</option>
                </select>
            </div>

            {loading ? (
                <div className="loading-spinner">Loading requirements...</div>
            ) : filtered.length === 0 ? (
                <div className="data-table-wrap">
                    <div className="table-empty">
                        <div className="table-empty-icon">No data</div>
                        {search || statusFilter !== "ALL"
                            ? "No requirements match your filters"
                            : "No requirements created yet"}
                    </div>
                </div>
            ) : (
                <div className="data-table-wrap">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Req ID</th>
                                <th>Requirement Name</th>
                                <th>Type</th>
                                <th>Role</th>
                                <th>Client SPOC</th>
                                <th>SLA</th>
                                <th>Status</th>
                                <th>Created</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((req) => (
                                <tr
                                    key={req.id}
                                    className="clickable-row"
                                    onClick={() => navigate(`/requirements/${req.id}`)}
                                >
                                    <td className="font-mono text-accent">{req.req_id}</td>
                                    <td><strong>{req.requirement_name}</strong></td>
                                    <td>{req.requirement_type || "-"}</td>
                                    <td>{req.role_type || "-"}</td>
                                    <td>{req.client_spoc_name || "-"}</td>
                                    <td>{renderSla(req)}</td>
                                    <td><StatusBadge status={req.status} /></td>
                                    <td className="text-muted text-sm">
                                        {fmtDate(req.created_at)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

