import Icon from "./Icon";

/** Numbered pagination row (Page X of Y  ‹ 1 2 3 ›), styled via .twd-pager. */
export default function Pager({
    page,
    pageCount,
    onChange,
}: {
    page: number;
    pageCount: number;
    onChange: (page: number) => void;
}) {
    if (pageCount <= 1) return null;
    return (
        <div className="twd-pager">
            <span className="twd-pager-label">Page {page} of {pageCount}</span>
            <button
                type="button"
                className="twd-pager-btn"
                disabled={page === 1}
                onClick={() => onChange(page - 1)}
                aria-label="Previous page"
            >
                <Icon name="chevron-left" size={14} />
            </button>
            {Array.from({ length: pageCount }).map((_, i) => (
                <button
                    key={i}
                    type="button"
                    className="twd-pager-btn"
                    data-active={page === i + 1}
                    aria-current={page === i + 1 ? "page" : undefined}
                    onClick={() => onChange(i + 1)}
                >
                    {i + 1}
                </button>
            ))}
            <button
                type="button"
                className="twd-pager-btn"
                disabled={page === pageCount}
                onClick={() => onChange(page + 1)}
                aria-label="Next page"
            >
                <Icon name="chevron-right" size={14} />
            </button>
        </div>
    );
}
