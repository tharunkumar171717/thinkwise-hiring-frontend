import { useNavigate } from "../lib/router";

/**
 * Small, boxless "← Back" link shown at the top of a page, just below the
 * topbar. Defaults to navigating to the previous page; pass `to` to go to a
 * specific route instead.
 */
export default function BackButton({
    to,
    label = "Back",
    className = "",
}: {
    to?: string | number;
    label?: string;
    className?: string;
}) {
    const navigate = useNavigate();
    const handleClick = () => {
        if (to !== undefined) navigate(to as any);
        else navigate(-1);
    };
    return (
        <button type="button" className={`back-link ${className}`.trim()} onClick={handleClick}>
            <span aria-hidden="true">←</span> {label}
        </button>
    );
}
