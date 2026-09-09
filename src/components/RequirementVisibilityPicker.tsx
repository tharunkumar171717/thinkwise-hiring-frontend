import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../services/api";
import Icon from "./Icon";
import "./RequirementVisibilityPicker.css";

export type Visibility = "ALL" | "RESTRICTED";
/** "" = nothing chosen yet. The create wizard requires a real choice before advancing. */
export type VisibilityChoice = Visibility | "";

interface PickerUser {
    id: string;
    name: string;
    email: string;
    role: string;
}

interface Props {
    visibility: VisibilityChoice;
    visibleTo: string[];
    onChange: (next: { visibility: VisibilityChoice; visible_to: string[] }) => void;
    /** Rendered under the heading; lets the edit page explain that changes take effect immediately. */
    note?: string;
    /** Show the unanswered-required state (create wizard sets this after a blocked "Next"). */
    invalid?: boolean;
}

/**
 * Confidentiality control shared by the create and edit forms.
 *
 * The viewer list only names people who would NOT otherwise have access. Admins,
 * super admins, the client's managers and the requirement's assigned recruiters
 * are always in the audience (enforced server-side in
 * services_backend/requirement_visibility.py), so offering to "add" them here
 * would imply the list is the whole story - it isn't.
 */
export default function RequirementVisibilityPicker({
    visibility, visibleTo, onChange, note, invalid,
}: Props) {
    const [users, setUsers] = useState<PickerUser[]>([]);
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const [loadError, setLoadError] = useState<string | null>(null);

    const boxRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    const restricted = visibility === "RESTRICTED";

    useEffect(() => {
        if (!restricted || users.length) return;
        api.get("/users/recruiters")
            .then((rows: PickerUser[]) => setUsers(rows || []))
            .catch((e: any) => setLoadError(e?.detail || "Could not load the people list"));
    }, [restricted, users.length]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open]);

    const selected = useMemo(() => new Set(visibleTo), [visibleTo]);
    const byId = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return users;
        return users.filter(u =>
            (u.name || "").toLowerCase().includes(q) ||
            (u.email || "").toLowerCase().includes(q)
        );
    }, [users, query]);

    useEffect(() => { setHighlight(0); }, [query]);

    useEffect(() => {
        if (!open || !menuRef.current) return;
        (menuRef.current.children[highlight] as HTMLElement | undefined)
            ?.scrollIntoView({ block: "nearest" });
    }, [highlight, open]);

    const setVisibility = (next: Visibility) => {
        // Clearing the list when going back to "everyone" avoids silently keeping a
        // stale audience that would reappear if the toggle is flipped again later.
        onChange({ visibility: next, visible_to: next === "RESTRICTED" ? visibleTo : [] });
        if (next !== "RESTRICTED") setOpen(false);
    };

    const toggleUser = (id: string) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onChange({ visibility, visible_to: Array.from(next) });
    };

    const removeUser = (id: string) =>
        onChange({ visibility, visible_to: visibleTo.filter(v => v !== id) });

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // The create wizard's form-level Enter handler advances the step. Keep every
        // key we act on from reaching it, or picking someone would jump to step 4.
        if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            if (open && filtered[highlight]) toggleUser(filtered[highlight].id);
            else setOpen(true);
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) setOpen(true);
            else setHighlight(h => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight(h => Math.max(h - 1, 0));
        } else if (e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
        } else if (e.key === "Backspace" && !query && visibleTo.length) {
            removeUser(visibleTo[visibleTo.length - 1]);
        }
    };

    return (
        <div className="form-section">
            <div className="form-section-title">
                Visibility <span style={{ color: "#dc2626" }}>*</span>
            </div>

            <div className="rvp">
                {note && <p className="rvp__note">{note}</p>}

                <div className="rvp__options">
                    <label className="rvp__opt" data-on={visibility === "ALL"}>
                        <input
                            type="radio"
                            name="requirement-visibility"
                            checked={visibility === "ALL"}
                            onChange={() => setVisibility("ALL")}
                        />
                        <span className="rvp__opt-text">
                            <span className="rvp__opt-title">Everyone</span>
                            <span className="rvp__opt-sub">Visible to the whole workspace.</span>
                        </span>
                    </label>

                    <label className="rvp__opt" data-on={restricted}>
                        <input
                            type="radio"
                            name="requirement-visibility"
                            checked={restricted}
                            onChange={() => setVisibility("RESTRICTED")}
                        />
                        <span className="rvp__opt-text">
                            <span className="rvp__opt-title">Confidential</span>
                            <span className="rvp__opt-sub">Admins, client managers, assigned recruiters + anyone you add.</span>
                        </span>
                    </label>
                </div>

                {invalid && !visibility && (
                    <p className="rvp__error">Choose who can see this requirement before continuing.</p>
                )}

                {restricted && (loadError ? (
                    <p className="rvp__error">{loadError}</p>
                ) : (
                    <div className="rvp__pickwrap" ref={boxRef}>
                        <label className="rvp__label">
                            Also visible to
                            {selected.size > 0 && <span> — {selected.size} selected</span>}
                        </label>

                        <div
                            className="rvp__control"
                            onClick={() => { setOpen(true); inputRef.current?.focus(); }}
                        >
                            {visibleTo.map((id) => {
                                const u = byId.get(id);
                                return (
                                    <span className="rvp__chip" key={id}>
                                        <span>{u ? (u.name || u.email) : "…"}</span>
                                        <button
                                            type="button"
                                            className="rvp__x"
                                            aria-label={`Remove ${u?.name || "person"}`}
                                            onClick={(e) => { e.stopPropagation(); removeUser(id); }}
                                        >
                                            <Icon name="x" size={10} />
                                        </button>
                                    </span>
                                );
                            })}

                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                                onFocus={() => setOpen(true)}
                                onKeyDown={onKeyDown}
                                placeholder={visibleTo.length ? "" : "Search by name or email"}
                            />

                            <span className="rvp__tools">
                                {visibleTo.length > 0 && (
                                    <button
                                        type="button"
                                        title="Clear all"
                                        aria-label="Clear all selected people"
                                        onClick={(e) => { e.stopPropagation(); onChange({ visibility, visible_to: [] }); }}
                                    >
                                        <Icon name="x" size={12} />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="rvp__caret"
                                    aria-expanded={open}
                                    aria-label={open ? "Close list" : "Open list"}
                                    onClick={(e) => { e.stopPropagation(); setOpen(o => !o); inputRef.current?.focus(); }}
                                >
                                    <Icon name={open ? "chevron-up" : "chevron-down"} size={13} />
                                </button>
                            </span>
                        </div>

                        {open && (
                            <div className="rvp__menu" ref={menuRef} role="listbox">
                                {filtered.length === 0 ? (
                                    <div className="rvp__msg">
                                        {users.length ? "No one matches that search." : "Loading people…"}
                                    </div>
                                ) : filtered.map((u, i) => (
                                    <div
                                        key={u.id}
                                        className="rvp__row"
                                        role="option"
                                        aria-selected={selected.has(u.id)}
                                        data-hi={i === highlight}
                                        onMouseEnter={() => setHighlight(i)}
                                        onClick={() => toggleUser(u.id)}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selected.has(u.id)}
                                            onChange={() => toggleUser(u.id)}
                                            onClick={(e) => e.stopPropagation()}
                                            tabIndex={-1}
                                        />
                                        <span className="rvp__row-name">{u.name || u.email}</span>
                                        {u.name && <span className="rvp__row-mail">{u.email}</span>}
                                    </div>
                                ))}
                            </div>
                        )}

                        <p className="rvp__note" style={{ marginTop: 5 }}>
                            Admins and this client's managers already have access.
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}
