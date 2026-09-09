import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Vertical 3-dot overflow menu. Driven by a declarative item model so callers
 * stay readable. Supports section subheaders, dividers, indented (grouped)
 * items and a danger style for destructive actions.
 */
export type MenuNode =
    | { type: "item"; label: string; icon?: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean; indent?: boolean }
    | { type: "section"; label: string }
    | { type: "divider" };

export default function KebabMenu({ items, ariaLabel = "More actions", icon }: { items: MenuNode[]; ariaLabel?: string; icon?: ReactNode }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
    }, [open]);

    return (
        <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
            <button
                className="btn btn-outline"
                aria-label={ariaLabel}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen(o => !o)}
                style={{ padding: "0.75rem 0.6rem", minWidth: 0 }}
            >
                {icon ?? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                    </svg>
                )}
            </button>
            {open && (
                <div
                    role="menu"
                    style={{
                        position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 100, minWidth: 220,
                        background: "var(--bg-primary)", border: "1px solid var(--border-subtle)", borderRadius: 10,
                        boxShadow: "0 8px 24px rgba(0,0,0,0.14)", padding: 6,
                    }}
                >
                    {items.map((node, i) => {
                        if (node.type === "divider") {
                            return <div key={i} style={{ height: 1, background: "var(--border-subtle)", margin: "6px 4px" }} />;
                        }
                        if (node.type === "section") {
                            return (
                                <div key={i} style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.6, padding: "8px 10px 4px" }}>
                                    {node.label}
                                </div>
                            );
                        }
                        return (
                            <button
                                key={i}
                                role="menuitem"
                                disabled={node.disabled}
                                onClick={() => { if (node.disabled) return; setOpen(false); node.onClick(); }}
                                className={`kebab-menu-item${node.danger ? " kebab-menu-item--danger" : ""}`}
                                style={node.indent ? { paddingLeft: 22 } : undefined}
                            >
                                {node.icon && <span style={{ display: "inline-flex", width: 16, justifyContent: "center", flexShrink: 0 }}>{node.icon}</span>}
                                <span>{node.label}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
