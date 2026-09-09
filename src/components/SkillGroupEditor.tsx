import { useState } from "react";
import Icon from "./Icon";

/**
 * Reusable chip-based skill editor: tier (Mandatory / Good-to-have) + grouping.
 * Self-contained - owns selection + group-modal state. The parent passes the
 * current rows and gets updates via onChange. Used by the requirement "Edit
 * Skills" modal (and shareable with RequirementCreate).
 *
 * A row is a single skill or a group: { label, tier, members[] }. A group is met
 * when the candidate demonstrates ANY ONE member.
 */

export type SkillReq = { label: string; tier: "must" | "good"; members: string[] };

export default function SkillGroupEditor({
  value,
  onChange,
  suggestions = [],
}: {
  value: SkillReq[];
  onChange: (next: SkillReq[]) => void;
  suggestions?: string[];
}) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [showGroupInput, setShowGroupInput] = useState(false);
  const [groupLabel, setGroupLabel] = useState("");
  const [newSkill, setNewSkill] = useState("");
  const [targetTier, setTargetTier] = useState<"must" | "good">("must");
  const [filterQuery, setFilterQuery] = useState("");

  // Drag & Drop State
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ type: "tier" | "skill"; id: string | number } | null>(null);
  const [pendingGroupMerge, setPendingGroupMerge] = useState<{ sourceIndex: number; targetIndex: number } | null>(null);

  const rows = value;
  const setRows = onChange;

  const toggleCheck = (i: number) =>
    setChecked((c) => { const n = new Set(c); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const setTier = (i: number, tier: "must" | "good") =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, tier } : r)));

  const setTierForSelected = (tier: "must" | "good") =>
    setRows(rows.map((r, i) => (checked.has(i) ? { ...r, tier } : r)));

  const remove = (i: number) => {
    setRows(rows.filter((_, idx) => idx !== i));
    setChecked((c) => { const n = new Set(c); n.delete(i); return n; });
  };

  const ungroup = (i: number) => {
    const r = rows[i];
    const expanded: SkillReq[] = (r.members || []).map((m) => ({ label: m, tier: r.tier, members: [] }));
    setRows([...rows.filter((_, idx) => idx !== i), ...expanded]);
    setChecked(new Set());
  };

  const add = (customTier?: "must" | "good") => {
    if (!newSkill.trim()) return;
    const tierToUse = customTier || targetTier;
    // Split by comma for batch adding
    const items = newSkill.split(",").map(s => s.trim()).filter(Boolean);
    if (!items.length) return;
    const newRows = items.map(label => ({ label, tier: tierToUse, members: [] as string[] }));
    setRows([...rows, ...newRows]);
    setNewSkill("");
  };

  const confirmGroup = () => {
    const label = groupLabel.trim();
    if (!label || checked.size < 2) return;
    const members: string[] = [];
    let tier: "must" | "good" = "good";
    Array.from(checked).forEach((i) => {
      const r = rows[i];
      (r.members && r.members.length ? r.members : [r.label]).forEach((m) => members.push(m));
      if (r.tier === "must") tier = "must";
    });
    setRows([...rows.filter((_, i) => !checked.has(i)), { label, tier, members: Array.from(new Set(members)) }]);
    setChecked(new Set());
    setGroupLabel("");
    setShowGroupInput(false);
  };

  const addToExistingGroup = (groupIndex: number) => {
    if (checked.size === 0) return;
    const targetGroup = rows[groupIndex];
    const existingMembers = targetGroup.members.length > 0 ? targetGroup.members : [targetGroup.label];
    const newMembers: string[] = [...existingMembers];

    Array.from(checked).forEach((i) => {
      if (i === groupIndex) return;
      const r = rows[i];
      (r.members && r.members.length ? r.members : [r.label]).forEach((m) => newMembers.push(m));
    });

    const nextRows = rows.map((r, idx) => {
      if (idx === groupIndex) {
        return { ...r, members: Array.from(new Set(newMembers)) };
      }
      return r;
    }).filter((_, idx) => idx === groupIndex || !checked.has(idx));

    setRows(nextRows);
    setChecked(new Set());
  };

  // ── Drag & Drop Handlers ──
  const handleTierDrop = (targetTier: "must" | "good") => {
    setDragOverTarget(null);
    if (draggedIndex === null) return;
    const source = rows[draggedIndex];
    if (source.tier !== targetTier) {
      setRows(rows.map((r, idx) => (idx === draggedIndex ? { ...r, tier: targetTier } : r)));
    }
    setDraggedIndex(null);
  };

  const handleSkillDrop = (targetIndex: number) => {
    setDragOverTarget(null);
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    const source = rows[draggedIndex];
    const target = rows[targetIndex];

    if (source.tier !== target.tier) {
      // Just move between tiers, for grouping skills should be from same tier
      setRows(rows.map((r, idx) => (idx === draggedIndex ? { ...r, tier: target.tier } : r)));
      setDraggedIndex(null);
      return;
    }

    // Same tier: group them!
    if (target.members.length > 0) {
      // If already a group, add skill to them
      const sourceMembers = source.members.length > 0 ? source.members : [source.label];
      const newMembers = Array.from(new Set([...target.members, ...sourceMembers]));
      const nextRows = rows.map((r, idx) => {
        if (idx === targetIndex) return { ...r, members: newMembers };
        return r;
      }).filter((_, idx) => idx !== draggedIndex);
      setRows(nextRows);
      setDraggedIndex(null);
    } else {
      // Not a group yet: give option to give group name
      setPendingGroupMerge({ sourceIndex: draggedIndex, targetIndex });
      setGroupLabel(""); // Reset input
      setDraggedIndex(null);
    }
  };

  const confirmPendingMerge = () => {
    if (!pendingGroupMerge || !groupLabel.trim()) return;
    const { sourceIndex, targetIndex } = pendingGroupMerge;
    const source = rows[sourceIndex];
    const target = rows[targetIndex];
    const sourceMembers = source.members.length > 0 ? source.members : [source.label];
    const targetMembers = target.members.length > 0 ? target.members : [target.label];
    const newMembers = Array.from(new Set([...targetMembers, ...sourceMembers]));

    const nextRows = rows.map((r, idx) => {
      if (idx === targetIndex) return { label: groupLabel.trim(), tier: target.tier, members: newMembers };
      return r;
    }).filter((_, idx) => idx !== sourceIndex);

    setRows(nextRows);
    setPendingGroupMerge(null);
    setGroupLabel("");
  };

  const covered = new Set<string>();
  rows.forEach((r) => { covered.add(r.label.toLowerCase()); r.members.forEach((m) => covered.add(m.toLowerCase())); });
  const available = suggestions.filter((s) => !covered.has(s.toLowerCase()));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── 1. Top Add Skills & Suggestions Bar ── */}
      <div style={{ padding: "14px 18px", background: "var(--bg-secondary)", borderRadius: 12, border: "1px solid var(--border-subtle)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
          Add Skills <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 12 }}>(Separate multiple skills with commas)</span>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "nowrap", alignItems: "center" }}>
          <input
            value={newSkill}
            placeholder="e.g. React, TypeScript, GraphQL"
            onChange={(e) => setNewSkill(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            style={{ flex: 1, width: "auto", minWidth: 0, border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "8px 12px", background: "var(--bg-primary)", color: "var(--fg-primary)", fontSize: 13 }}
          />
          <select
            value={targetTier}
            onChange={(e) => setTargetTier(e.target.value as any)}
            style={{ width: "auto", flex: "0 0 auto", minWidth: 150, border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "8px 12px", background: "var(--bg-primary)", color: "var(--fg-primary)", fontSize: 13, cursor: "pointer" }}
          >
            <option value="must">Mandatory</option>
            <option value="good">Good-to-have</option>
          </select>
          <button type="button" className="btn btn-primary btn-sm" style={{ flex: "0 0 auto", padding: "8px 16px", height: "auto", fontSize: 13 }} onClick={() => add()} disabled={!newSkill.trim()}>
            + Add
          </button>
        </div>

        {available.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Suggested:</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxHeight: 80, overflowY: "auto", flex: 1 }}>
              {available.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 12, background: "var(--bg-primary)", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: "3px 8px", height: "auto" }}
                  onClick={() => setRows([...rows, { label: s, tier: targetTier, members: [] }])}
                  title={`Click to add to ${targetTier === "must" ? "Mandatory" : "Good-to-have"}`}
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Action & Filter Toolbar (Fixed minHeight for layout stability) ── */}
      <div style={{ minHeight: 48, padding: "8px 14px", background: (checked.size > 0 || pendingGroupMerge) ? "var(--bg-secondary)" : "transparent", borderRadius: 10, border: (checked.size > 0 || pendingGroupMerge) ? "1px solid var(--border-subtle)" : "1px solid transparent", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", transition: "all 0.2s ease" }}>
        {pendingGroupMerge ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)" }}>
              Name new group ({rows[pendingGroupMerge.targetIndex]?.label} + {rows[pendingGroupMerge.sourceIndex]?.label}):
            </span>
            <input
              autoFocus
              value={groupLabel}
              placeholder="e.g. Containerization, AWS..."
              onChange={(e) => setGroupLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmPendingMerge(); } }}
              style={{ flex: 1, minWidth: 200, padding: "6px 12px", border: "1px solid var(--border-subtle)", borderRadius: 6, background: "var(--bg-primary)", color: "var(--fg-primary)", fontSize: 13 }}
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setPendingGroupMerge(null); setGroupLabel(""); }}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={confirmPendingMerge} disabled={!groupLabel.trim()}>Create Group</button>
          </div>
        ) : checked.size > 0 ? (
          showGroupInput ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
              <input
                autoFocus
                value={groupLabel}
                placeholder="Group label (e.g. AWS)"
                onChange={(e) => setGroupLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmGroup(); } }}
                style={{ flex: 1, padding: "6px 12px", border: "1px solid var(--border-subtle)", borderRadius: 6, background: "var(--bg-primary)", color: "var(--fg-primary)", fontSize: 13 }}
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowGroupInput(false)}>Cancel</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={confirmGroup} disabled={!groupLabel.trim()}>Confirm Group</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>{checked.size} selected</span>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => setTierForSelected("must")}>→ Mandatory</button>
                <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => setTierForSelected("good")}>→ Good-to-have</button>
                <button type="button" className="btn btn-primary btn-sm" style={{ fontSize: 12 }} disabled={checked.size < 2} onClick={() => setShowGroupInput(true)}>Group</button>
                <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => setChecked(new Set())}>Clear</button>
              </div>
            </div>
          )
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", maxWidth: 320 }}>
            <Icon name="search" size={16} style={{ color: "var(--text-muted)" }} />
            <input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter skills..."
              style={{ width: "100%", padding: "6px 12px", fontSize: 13, border: "1px solid var(--border-subtle)", borderRadius: 8, background: "var(--bg-primary)", color: "var(--fg-primary)" }}
            />
            {filterQuery && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ padding: "2px 6px", height: "auto" }} onClick={() => setFilterQuery("")}>✕</button>
            )}
          </div>
        )}
      </div>

      {/* ── 3. Skill Tiers (Mandatory / Good-to-have side-by-side) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, alignItems: "start" }}>
        {(["must", "good"] as const).map((tierKey) => {
          const allForTier = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.tier === tierKey);
          const filteredForTier = allForTier.filter(({ r }) => {
            if (!filterQuery.trim()) return true;
            const q = filterQuery.toLowerCase();
            return r.label.toLowerCase().includes(q) || r.members.some(m => m.toLowerCase().includes(q));
          });
          const accent = tierKey === "must" ? "var(--primary)" : "var(--text-muted)";
          const isTierDropTarget = dragOverTarget?.type === "tier" && dragOverTarget.id === tierKey;

          return (
            <div key={tierKey}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: accent }} />
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-secondary)" }}>
                  {tierKey === "must" ? "Mandatory" : "Good-to-have"}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>({allForTier.length})</span>
              </div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverTarget?.type !== "skill") {
                    setDragOverTarget({ type: "tier", id: tierKey });
                  }
                }}
                onDragLeave={() => {
                  if (dragOverTarget?.type === "tier" && dragOverTarget.id === tierKey) {
                    setDragOverTarget(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleTierDrop(tierKey);
                }}
                style={{
                  border: isTierDropTarget ? `2px dashed ${accent}` : "1px solid var(--border-subtle)",
                  borderLeft: tierKey === "must" ? `4px solid ${accent}` : undefined,
                  borderRadius: 12,
                  padding: "14px 16px",
                  background: isTierDropTarget ? "var(--bg-selected, #eff6ff)" : "var(--bg-secondary)",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  alignItems: "flex-start",
                  alignContent: "flex-start",
                  height: "170px",
                  overflowY: "auto",
                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)",
                  transition: "all 0.2s ease"
                }}
              >
                {allForTier.length === 0 && (
                  <span style={{ fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>
                    {tierKey === "must" ? "No mandatory skills added. Drag skills here or use the bar above." : "No good-to-have skills added. Drag skills here."}
                  </span>
                )}
                {allForTier.length > 0 && filteredForTier.length === 0 && (
                  <span style={{ fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>No skills match your filter.</span>
                )}
                {filteredForTier.map(({ r, i }) => {
                  const sel = checked.has(i);
                  const isGroup = r.members.length > 0;
                  const isDragTarget = dragOverTarget?.type === "skill" && dragOverTarget.id === i;
                  const isBeingDragged = draggedIndex === i;

                  return (
                    <span
                      key={i}
                      draggable={true}
                      onDragStart={(e) => {
                        setDraggedIndex(i);
                        e.dataTransfer.setData("text/plain", String(i));
                      }}
                      onDragEnd={() => {
                        setDraggedIndex(null);
                        setDragOverTarget(null);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (draggedIndex !== i) {
                          setDragOverTarget({ type: "skill", id: i });
                        }
                      }}
                      onDragLeave={(e) => {
                        e.stopPropagation();
                        if (dragOverTarget?.type === "skill" && dragOverTarget.id === i) {
                          setDragOverTarget(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSkillDrop(i);
                      }}
                      onClick={() => toggleCheck(i)}
                      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggleCheck(i); } }}
                      role="button"
                      tabIndex={0}
                      title={sel ? "Selected - click to deselect" : "Click to select · Drag to move or group"}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 8, cursor: "grab",
                        padding: "6px 12px", borderRadius: 999, fontSize: 13,
                        border: isDragTarget ? "2px dashed var(--primary, #2563eb)" : sel ? "2px solid var(--primary, #2563eb)" : "1px solid var(--border-subtle)",
                        background: isDragTarget ? "var(--bg-selected, #eff6ff)" : sel ? "var(--bg-selected, #eff6ff)" : "var(--bg-primary)",
                        color: sel || isDragTarget ? "var(--primary, #1e40af)" : "var(--fg-primary)",
                        fontWeight: isGroup ? 600 : 400, boxShadow: isDragTarget ? "0 4px 6px rgba(0,0,0,0.1)" : "0 1px 2px rgba(0,0,0,0.05)",
                        opacity: isBeingDragged ? 0.5 : 1,
                        transform: isDragTarget ? "scale(1.03)" : "none",
                        transition: "all 0.15s ease", userSelect: "none"
                      }}
                    >
                      {sel && <Icon name="check" size={14} style={{ color: "var(--primary, #2563eb)" }} />}
                      <span>{r.label}</span>
                      {isGroup && (
                        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", background: "var(--bg-secondary)", padding: "2px 8px", borderRadius: 12, border: "1px solid var(--border-subtle)" }}>
                          {r.members.join(", ")}
                        </span>
                      )}
                      {checked.size > 0 && !sel && isGroup && (
                        <button
                          type="button"
                          title="Add selected skills to this group"
                          onClick={(e) => { e.stopPropagation(); addToExistingGroup(i); }}
                          style={{ border: "1px solid var(--primary)", background: "var(--bg-primary)", color: "var(--primary)", borderRadius: 6, padding: "2px 6px", fontSize: 11, cursor: "pointer", marginLeft: 4 }}
                        >
                          + Add selected
                        </button>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4, paddingLeft: 6, borderLeft: "1px solid var(--border-subtle)" }}>
                        <button
                          type="button"
                          title={`Move to ${r.tier === "must" ? "Good-to-have" : "Mandatory"}`}
                          aria-label={`Move to ${r.tier === "must" ? "Good-to-have" : "Mandatory"}`}
                          onClick={(e) => { e.stopPropagation(); setTier(i, r.tier === "must" ? "good" : "must"); }}
                          style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-secondary)", display: "flex", alignItems: "center", padding: 2 }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="16 3 21 8 16 13"></polyline>
                            <line x1="21" y1="8" x2="9" y2="8"></line>
                            <polyline points="8 21 3 16 8 11"></polyline>
                            <line x1="3" y1="16" x2="15" y2="16"></line>
                          </svg>
                        </button>
                        {isGroup && (
                          <button
                            type="button"
                            title="Ungroup skills"
                            aria-label="Ungroup skills"
                            onClick={(e) => { e.stopPropagation(); ungroup(i); }}
                            style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-secondary)", display: "flex", alignItems: "center", padding: 2 }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 20h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"></path>
                              <path d="M6 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2"></path>
                              <line x1="12" y1="4" x2="12" y2="20"></line>
                            </svg>
                          </button>
                        )}
                        <button
                          type="button"
                          title="Remove skill"
                          aria-label="Remove skill"
                          onClick={(e) => { e.stopPropagation(); remove(i); }}
                          style={{ border: "none", background: "none", cursor: "pointer", color: "var(--error, #dc2626)", display: "flex", alignItems: "center", padding: 2 }}
                        >
                          <Icon name="x" size={14} />
                        </button>
                      </div>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Synthesize editable rows from a requirement doc (handles old + new shape).
export function skillReqsFromRequirement(req: any): SkillReq[] {
  const sr = req?.skill_requirements;
  if (Array.isArray(sr) && sr.length) {
    return sr.map((e: any) => ({
      label: e.label, tier: e.tier === "good" ? "good" : "must", members: e.members || [],
    }));
  }
  const groups: Record<string, string[]> = {};
  (req?.important_information || []).forEach((g: any) => {
    if (g?.label) groups[String(g.label).toLowerCase()] = g.any_of || [];
  });
  const out: SkillReq[] = [];
  const seen = new Set<string>();
  const add = (arr: string[], tier: "must" | "good") =>
    (arr || []).forEach((s) => {
      const k = (s || "").toLowerCase().trim();
      if (s && s.trim() && !seen.has(k)) { seen.add(k); out.push({ label: s.trim(), tier, members: groups[k] || [] }); }
    });
  add(req?.must_have_skills || [], "must");
  add(req?.good_to_have_skills || [], "good");
  return out;
}
