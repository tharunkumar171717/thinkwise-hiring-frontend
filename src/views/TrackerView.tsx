import { useEffect, useState } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useParams } from "../lib/router";
import { api, getToken, API_BASE } from "../services/api";
import Icon from "../components/Icon";
import BackButton from "../components/BackButton";
import "../styles/pages.css";

interface TrackerRow {
    sl_no: number;
    candidate_name: string;
    experience: number | null;
    skillset: string | null;
    ai_score: number | null;
    top_skills: any[] | null;
    present_ctc: number | null;
    expected_ctc: number | null;
    recruiter_comments: string | null;
    status: string;
}

export default function TrackerView() {
    useDocumentTitle("Tracker Preview");
    const { reqId } = useParams<{ reqId: string }>();
    const [rows, setRows] = useState<TrackerRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    const loadTracker = () => {
        setLoading(true);
        api.get(`/tracker/${reqId}`)
            .then((data) => setRows(data || []))
            .catch(() => { })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadTracker();
    }, [reqId]);

    const handleDownloadExcel = async () => {
        const token = await getToken();
        const url = `${API_BASE}/tracker/${reqId}/excel`;
        fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((res) => res.blob())
            .then((blob) => {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `tracker_${reqId}.xlsx`;
                a.click();
            });
    };

    const handleSend = async () => {
        setSending(true);
        try {
            await api.post(`/tracker/${reqId}/send`, {});
            setSent(true);
            loadTracker();
        } catch {
        } finally {
            setSending(false);
        }
    };

    return (
        <div>
            <BackButton to={`/requirements/${reqId}`} />
            <div className="page-header">
                <div>
                    <h1>Tracker Preview</h1>
                    <p className="page-header-sub">
                        {rows.length} unsent submission{rows.length !== 1 ? "s" : ""}
                    </p>
                </div>
                <div className="page-actions">
                    <button
                        className="btn btn-ghost"
                        onClick={handleDownloadExcel}
                        disabled={rows.length === 0}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Icon name="document" size={16} /> Download Excel</span>
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleSend}
                        disabled={rows.length === 0 || sending}
                    >
                        {sending ? "Sending..." : <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Icon name="mail" size={16} /> Mark as Sent</span>}
                    </button>
                </div>
            </div>

            {sent && (
                <div className="form-success" style={{ marginBottom: "1rem" }}>
                    Tracker marked as sent successfully!
                </div>
            )}

            {loading ? (
                <div className="loading-spinner">Loading tracker...</div>
            ) : rows.length === 0 ? (
                <div className="data-table-wrap">
                    <div className="table-empty">
                        <div className="table-empty-icon"><Icon name="chart" size={48} /></div>
                        No new submissions to include in tracker
                    </div>
                </div>
            ) : (
                <div className="data-table-wrap">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Sl No</th>
                                <th>Candidate Name</th>
                                <th>Experience</th>
                                <th>Skillset</th>
                                <th>AI Score</th>
                                <th>Present CTC</th>
                                <th>Expected CTC</th>
                                <th>Comments</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.sl_no}>
                                    <td>{row.sl_no}</td>
                                    <td><strong>{row.candidate_name}</strong></td>
                                    <td>{row.experience != null ? `${row.experience} yrs` : "-"}</td>
                                    <td className="text-sm">{row.skillset || "-"}</td>
                                    <td>
                                        {row.ai_score != null ? (
                                            <span className="font-mono">{row.ai_score}/100</span>
                                        ) : "-"}
                                    </td>
                                    <td>{row.present_ctc != null ? `${row.present_ctc} L` : "-"}</td>
                                    <td>{row.expected_ctc != null ? `${row.expected_ctc} L` : "-"}</td>
                                    <td className="text-sm">{row.recruiter_comments || "-"}</td>
                                    <td>{row.status}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
