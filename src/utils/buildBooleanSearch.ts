// Deterministic boolean-search builder (frontend fallback).
//
// The PRIMARY source of the boolean strings is the JD-extraction LLM (it knows a
// searchable umbrella keyword like "AWS" from an abstract capability label like
// "Workflow Orchestration"). This module only fills in / keeps the strings live
// when a requirement has no stored value yet or its skills are being regrouped.
//
// Three tiers of increasing tightness are produced:
//   broad    - widest net: core terms OR-ed together.
//   balanced - must-have core AND-ed, interchangeable tools OR-ed, good-to-have
//              as a trailing OR cluster. The default.
//   strict   - good-to-have promoted to required, groups expanded to their tools.
//
// Umbrella heuristic (fallback only): a single-word group label (AWS, Salesforce)
// is itself a searchable keyword, so use it; a multi-word label (Workflow
// Orchestration, Vector Store) is abstract, so expand to the member tools OR-ed.

export interface BooleanGroup {
    label?: string;
    any_of?: string[];
}

export interface BooleanSearchInput {
    must_have_skills?: string[] | null;
    good_to_have_skills?: string[] | null;
    important_information?: BooleanGroup[] | null;
}

export type BooleanVariant = "broad" | "balanced" | "strict";
export type BooleanSearches = Record<BooleanVariant, string>;

export const BOOLEAN_VARIANTS: BooleanVariant[] = ["broad", "balanced", "strict"];

// Quote a term when it is a phrase or carries operator-like characters.
function quote(term: string): string {
    const t = term.trim();
    if (!t) return "";
    return /[^\w.-]/.test(t) ? `"${t}"` : t;
}

function dedupe(items?: (string | null | undefined)[] | null): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of items || []) {
        if (typeof raw !== "string") continue;
        const s = raw.trim();
        if (!s) continue;
        const key = s.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(s);
    }
    return out;
}

// Render one capability group. `specific` always expands to the member tools;
// otherwise a single-word label is used as an umbrella keyword.
function groupTerm(g: BooleanGroup, specific: boolean): string {
    const members = dedupe(g.any_of);
    const label = (g.label || "").trim();
    if (!specific && label && !/\s/.test(label)) return quote(label);
    if (members.length === 0) return quote(label);
    return `(${members.map(quote).join(" OR ")})`;
}

/** Build the three boolean variants deterministically from the grouped skills. */
export function buildBooleanSearches(input: BooleanSearchInput): BooleanSearches {
    const must = dedupe(input.must_have_skills);
    const good = dedupe(input.good_to_have_skills);
    const mustLower = new Set(must.map((s) => s.toLowerCase()));
    const goodLower = new Set(good.map((s) => s.toLowerCase()));

    const groups = (input.important_information || []).filter(
        (g) => Array.isArray(g?.any_of) && dedupe(g.any_of).length >= 2
    );

    const consumed = new Set<string>();
    for (const g of groups) {
        if (g.label) consumed.add(g.label.trim().toLowerCase());
        for (const m of g.any_of || []) consumed.add(m.trim().toLowerCase());
    }

    const isMust = (g: BooleanGroup) =>
        mustLower.has((g.label || "").toLowerCase()) ||
        dedupe(g.any_of).some((m) => mustLower.has(m.toLowerCase()));
    const isGood = (g: BooleanGroup) =>
        goodLower.has((g.label || "").toLowerCase()) ||
        dedupe(g.any_of).some((m) => goodLower.has(m.toLowerCase()));

    const standaloneMust = must.filter((s) => !consumed.has(s.toLowerCase()));
    const standaloneGood = good.filter((s) => !consumed.has(s.toLowerCase()));

    // broad - umbrella terms + core must-haves, all OR-ed.
    const broadTerms = [
        ...groups.filter(isMust).map((g) => groupTerm(g, false)),
        ...standaloneMust.map(quote),
    ].filter(Boolean);
    const broad = broadTerms.join(" OR ");

    // balanced - must-have core AND-ed; good-to-have as one trailing OR cluster.
    const required = [
        ...groups.filter(isMust).map((g) => groupTerm(g, false)),
        ...standaloneMust.map(quote),
    ];
    const optionalTerms: string[] = [];
    for (const g of groups) if (!isMust(g) && isGood(g)) optionalTerms.push(...dedupe(g.any_of));
    optionalTerms.push(...standaloneGood);
    const optional = dedupe(optionalTerms).filter((s) => !mustLower.has(s.toLowerCase()));
    const balancedParts = required.filter(Boolean);
    if (optional.length) balancedParts.push(`(${optional.map(quote).join(" OR ")})`);
    const balanced = balancedParts.join(" AND ");

    // strict - groups expanded to specific tools, good-to-have promoted to required.
    const strictParts = [
        ...groups.map((g) => groupTerm(g, true)),
        ...standaloneMust.map(quote),
        ...standaloneGood.map(quote),
    ].filter(Boolean);
    const strict = strictParts.join(" AND ");

    return { broad, balanced, strict };
}

/**
 * Coerce a stored/LLM `boolean_search` value into a full {broad, balanced, strict}
 * set, backfilling any missing variant from the deterministic builder. Accepts a
 * variant object, a bare string (treated as `balanced`), or null.
 */
export function normalizeBooleanSearches(
    raw: unknown,
    input: BooleanSearchInput
): BooleanSearches {
    const out = buildBooleanSearches(input);
    if (raw && typeof raw === "object") {
        for (const v of BOOLEAN_VARIANTS) {
            const val = (raw as Record<string, unknown>)[v];
            if (typeof val === "string" && val.trim()) out[v] = val.trim();
        }
    } else if (typeof raw === "string" && raw.trim()) {
        out.balanced = raw.trim();
    }
    return out;
}

/** Back-compat: the single balanced string. */
export function buildBooleanSearch(input: BooleanSearchInput): string {
    return buildBooleanSearches(input).balanced;
}
