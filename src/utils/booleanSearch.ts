
// ── Tokens ─────────────────────────────────────────────────────────────────

type TokType = "WORD" | "PHRASE" | "AND" | "OR" | "NOT" | "LPAREN" | "RPAREN" | "EOF";
interface Tok { type: TokType; value?: string }

function tokenize(input: string): Tok[] {
    const tokens: Tok[] = [];
    let i = 0;
    const s = input.trim();

    while (i < s.length) {
        while (i < s.length && s[i] === " ") i++;
        if (i >= s.length) break;

        if (s[i] === "(") { tokens.push({ type: "LPAREN" }); i++; continue; }
        if (s[i] === ")") { tokens.push({ type: "RPAREN" }); i++; continue; }

        if (s[i] === '"') {
            i++;
            let phrase = "";
            while (i < s.length && s[i] !== '"') phrase += s[i++];
            if (i < s.length) i++;
            if (phrase) tokens.push({ type: "PHRASE", value: phrase.toLowerCase() });
            continue;
        }

        let word = "";
        while (i < s.length && s[i] !== " " && s[i] !== "(" && s[i] !== ")" && s[i] !== '"') {
            word += s[i++];
        }
        if (!word) continue;

        if (word.startsWith("-") && word.length > 1) {
            tokens.push({ type: "NOT" });
            tokens.push({ type: "WORD", value: word.slice(1).toLowerCase() });
            continue;
        }

        const up = word.toUpperCase();
        if (up === "AND") { tokens.push({ type: "AND" }); continue; }
        if (up === "OR") { tokens.push({ type: "OR" }); continue; }
        if (up === "NOT") { tokens.push({ type: "NOT" }); continue; }
        tokens.push({ type: "WORD", value: word.toLowerCase() });
    }

    tokens.push({ type: "EOF" });
    return tokens;
}

// ── AST ────────────────────────────────────────────────────────────────────

export type BoolNode =
    | { op: "TERM"; value: string }
    | { op: "PHRASE"; value: string }
    | { op: "AND"; left: BoolNode; right: BoolNode }
    | { op: "OR"; left: BoolNode; right: BoolNode }
    | { op: "NOT"; operand: BoolNode };

// ── Parser ─────────────────────────────────────────────────────────────────
// Grammar:
//   expr     = or_expr
//   or_expr  = and_expr ( 'OR' and_expr )*
//   and_expr = not_expr ( 'AND'? not_expr )*   ← implicit AND
//   not_expr = 'NOT' atom | atom
//   atom     = '(' expr ')' | PHRASE | WORD

class Parser {
    private pos = 0;
    private readonly toks: Tok[];
    constructor(toks: Tok[]) { this.toks = toks; }

    private peek() { return this.toks[this.pos]; }
    private consume() { return this.toks[this.pos++]; }

    parse(): BoolNode | null {
        if (this.peek().type === "EOF") return null;
        const node = this.parseOr();
        return node;
    }

    private parseOr(): BoolNode {
        let left = this.parseAnd();
        while (this.peek().type === "OR") {
            this.consume();
            left = { op: "OR", left, right: this.parseAnd() };
        }
        return left;
    }

    private parseAnd(): BoolNode {
        let left = this.parseNot();
        while (
            this.peek().type !== "EOF" &&
            this.peek().type !== "RPAREN" &&
            this.peek().type !== "OR"
        ) {
            if (this.peek().type === "AND") this.consume();
            if (
                this.peek().type === "EOF" ||
                this.peek().type === "RPAREN" ||
                this.peek().type === "OR"
            ) break;
            left = { op: "AND", left, right: this.parseNot() };
        }
        return left;
    }

    private parseNot(): BoolNode {
        if (this.peek().type === "NOT") {
            this.consume();
            return { op: "NOT", operand: this.parseAtom() };
        }
        return this.parseAtom();
    }

    private parseAtom(): BoolNode {
        const tok = this.peek();
        if (tok.type === "LPAREN") {
            this.consume();
            const inner = this.parseOr();
            if (this.peek().type === "RPAREN") this.consume();
            return inner;
        }
        if (tok.type === "PHRASE") { this.consume(); return { op: "PHRASE", value: tok.value! }; }
        if (tok.type === "WORD") { this.consume(); return { op: "TERM", value: tok.value! }; }
        this.consume();
        return { op: "TERM", value: "" };
    }
}

// ── Evaluator ──────────────────────────────────────────────────────────────

function match(node: BoolNode, text: string): boolean {
    switch (node.op) {
        case "TERM": return node.value === "" || text.includes(node.value);
        case "PHRASE": return text.includes(node.value);
        case "AND": return match(node.left, text) && match(node.right, text);
        case "OR": return match(node.left, text) || match(node.right, text);
        case "NOT": return !match(node.operand, text);
    }
}

// ── Public API ─────────────────────────────────────────────────────────────

export function parseBooleanQuery(query: string): BoolNode | null {
    if (!query.trim()) return null;
    try {
        return new Parser(tokenize(query)).parse();
    } catch {
        return null;
    }
}

export function matchesQuery(node: BoolNode, searchText: string): boolean {
    return match(node, searchText.toLowerCase());
}
