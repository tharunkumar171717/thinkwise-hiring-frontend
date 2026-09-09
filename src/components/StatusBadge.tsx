import { formatStatus, statusTone } from "../utils/statusUtils";
import "./StatusBadge.css";

// Mixes application statuses with requirement-lifecycle ones (OPEN/CLOSED/ARCHIVED…),
// and deliberately labels SENT as "Sent" rather than the "Submitted" used on the
// candidate surfaces - so this map stays local rather than folding into statusUtils.
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
    SENT: { label: "Sent", className: "badge--sent" },
    L1_SELECTED: { label: "L1 Selected", className: "badge--l1" },
    L2_SELECTED: { label: "L2 Selected", className: "badge--l2" },
    HR_ROUND: { label: "HR Round", className: "badge--l2" },
    SELECTED: { label: "Selected", className: "badge--selected" },
    REJECTED: { label: "Rejected", className: "badge--rejected" },
    OPEN: { label: "Open", className: "badge--open" },
    ON_HOLD: { label: "On Hold", className: "badge--hold" },
    CLOSED: { label: "Closed", className: "badge--closed" },
    POSITION_CLOSED: { label: "Closed", className: "badge--closed" },
    ARCHIVED: { label: "Archived", className: "badge--archived" },
    DELETED: { label: "Deleted", className: "badge--closed" },
};

interface Props {
    status: string;
}

export default function StatusBadge({ status }: Props) {
    // Exact match legacy statuses
    const config = STATUS_CONFIG[status];
    if (config) {
        return (
            <span className={`status-badge ${config.className}`}>
                {config.label}
            </span>
        );
    }

    // Dynamic pipeline statuses
    const tone = statusTone(status);
    return (
        <span 
            className="status-badge"
            style={{
                backgroundColor: tone.bg,
                color: tone.fg,
                border: tone.border ? `1px solid ${tone.border}` : "none",
            }}
        >
            {formatStatus(status)}
        </span>
    );
}
