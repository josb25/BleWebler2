/**
 * A tiny, **safe-by-construction** expression language.
 *
 * This is the trust boundary for the whole template system: imported
 * templates are arbitrary, untrusted JSON, and their `{expr}` bindings and
 * responsive dimensions are evaluated here. So unlike a `new Function` / `eval`
 * approach, this engine never compiles host code. It:
 *
 *   - parses a small, fixed grammar (numbers, strings, booleans, null, the
 *     usual arithmetic/logic/comparison operators, `?:`, indexing, dotted reads
 *     into plain data, and calls to a *whitelisted* function table);
 *   - forbids assignment, `new`, `this`, function literals, and method calls —
 *     the only callable things are the named functions in {@link FUNCTIONS};
 *   - blocks prototype access (`__proto__`, `constructor`, `prototype`) and
 *     only reads own properties of plain objects/arrays/strings, so there is no
 *     path from a scope value back to `Function`;
 *   - is pure and loop-free, and additionally bounds itself with a parse-time
 *     node cap and an evaluation step budget, so a hostile expression can
 *     neither reach anything nor run away.
 *
 * Nothing here touches the DOM, network, timers, or globals. The worst a
 * malicious expression can do is evaluate to a wrong value or `NaN`.
 */

// ---- limits -------------------------------------------------------------

export interface EvalLimits {
    /** Max AST nodes a single expression may contain (parse-time guard). */
    maxNodes: number;
    /** Max node evaluations per `evalAst` call (runtime guard). */
    maxSteps: number;
    /** Max length of any string a call/concat may produce. */
    maxStringLength: number;
}

export const DEFAULT_LIMITS: EvalLimits = {
    maxNodes: 500,
    maxSteps: 5000,
    maxStringLength: 10_000
};

/** Property names that must never be read — the routes back to host code. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// ---- AST ----------------------------------------------------------------

export type Ast =
    | { t: 'num'; v: number }
    | { t: 'str'; v: string }
    | { t: 'bool'; v: boolean }
    | { t: 'null' }
    | { t: 'ident'; name: string }
    | { t: 'array'; items: Ast[] }
    | { t: 'unary'; op: '-' | '!' | '+'; arg: Ast }
    | { t: 'binary'; op: string; left: Ast; right: Ast }
    | { t: 'logical'; op: '&&' | '||' | '??'; left: Ast; right: Ast }
    | { t: 'cond'; test: Ast; then: Ast; else: Ast }
    | { t: 'member'; obj: Ast; key: string }
    | { t: 'index'; obj: Ast; index: Ast }
    | { t: 'call'; callee: string; args: Ast[] };

export class ExprError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ExprError';
    }
}

// ---- tokenizer ----------------------------------------------------------

type Tok =
    | { k: 'num'; v: number }
    | { k: 'str'; v: string }
    | { k: 'name'; v: string }
    | { k: 'punct'; v: string };

const PUNCT3 = ['===', '!==', '**='];
const PUNCT2 = ['==', '!=', '<=', '>=', '&&', '||', '??', '**'];
const PUNCT1 = '+-*/%<>!?:()[].,';

function tokenize(src: string): Tok[] {
    const toks: Tok[] = [];
    let i = 0;
    const n = src.length;
    while (i < n) {
        const c = src[i];
        if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }

        // number (decimal, optional fraction/exponent)
        if ((c >= '0' && c <= '9') || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
            let j = i;
            while (j < n && /[0-9]/.test(src[j])) j++;
            if (src[j] === '.') { j++; while (j < n && /[0-9]/.test(src[j])) j++; }
            if (src[j] === 'e' || src[j] === 'E') {
                j++;
                if (src[j] === '+' || src[j] === '-') j++;
                while (j < n && /[0-9]/.test(src[j])) j++;
            }
            const num = Number(src.slice(i, j));
            if (!Number.isFinite(num)) throw new ExprError(`Invalid number at ${i}`);
            toks.push({ k: 'num', v: num });
            i = j;
            continue;
        }

        // string ('...' or "...") with backslash escapes
        if (c === '"' || c === "'") {
            const quote = c;
            let j = i + 1;
            let out = '';
            while (j < n && src[j] !== quote) {
                if (src[j] === '\\') {
                    const e = src[j + 1];
                    out += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r' : e ?? '';
                    j += 2;
                } else {
                    out += src[j];
                    j++;
                }
            }
            if (j >= n) throw new ExprError('Unterminated string');
            toks.push({ k: 'str', v: out });
            i = j + 1;
            continue;
        }

        // identifier / keyword
        if (/[A-Za-z_$]/.test(c)) {
            let j = i + 1;
            while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
            toks.push({ k: 'name', v: src.slice(i, j) });
            i = j;
            continue;
        }

        // punctuation (longest match first)
        const three = src.slice(i, i + 3);
        if (PUNCT3.includes(three)) { toks.push({ k: 'punct', v: three }); i += 3; continue; }
        const two = src.slice(i, i + 2);
        if (PUNCT2.includes(two)) { toks.push({ k: 'punct', v: two }); i += 2; continue; }
        if (PUNCT1.includes(c)) { toks.push({ k: 'punct', v: c }); i++; continue; }

        throw new ExprError(`Unexpected character ${JSON.stringify(c)} at ${i}`);
    }
    return toks;
}

// ---- Pratt parser -------------------------------------------------------

// Binding powers for infix operators (higher binds tighter).
const BP: Record<string, number> = {
    '??': 1, '||': 2, '&&': 3,
    '==': 4, '!=': 4, '===': 4, '!==': 4,
    '<': 5, '<=': 5, '>': 5, '>=': 5,
    '+': 6, '-': 6,
    '*': 7, '/': 7, '%': 7,
    '**': 8
};
const RIGHT_ASSOC = new Set(['**']);

class Parser {
    private pos = 0;
    private nodes = 0;
    constructor(private toks: Tok[], private maxNodes: number) {}

    private count(): void {
        if (++this.nodes > this.maxNodes) throw new ExprError('Expression too large');
    }
    private peek(): Tok | undefined { return this.toks[this.pos]; }
    private next(): Tok | undefined { return this.toks[this.pos++]; }
    private isPunct(v: string): boolean {
        const t = this.peek();
        return !!t && t.k === 'punct' && t.v === v;
    }
    private eat(v: string): void {
        if (!this.isPunct(v)) throw new ExprError(`Expected '${v}'`);
        this.pos++;
    }

    parse(): Ast {
        const expr = this.parseExpr(0);
        if (this.pos !== this.toks.length) throw new ExprError('Unexpected trailing input');
        return expr;
    }

    // Ternary sits just above the binary operators.
    private parseExpr(minBp: number): Ast {
        let left = this.parseUnary();
        for (;;) {
            const t = this.peek();
            if (!t || t.k !== 'punct') break;
            const bp = BP[t.v];
            if (bp === undefined || bp < minBp) break;
            this.next();
            const nextMin = RIGHT_ASSOC.has(t.v) ? bp : bp + 1;
            const right = this.parseExpr(nextMin);
            this.count();
            if (t.v === '&&' || t.v === '||' || t.v === '??') {
                left = { t: 'logical', op: t.v, left, right };
            } else {
                left = { t: 'binary', op: t.v, left, right };
            }
        }
        // Ternary (lowest precedence, right associative).
        if (minBp === 0 && this.isPunct('?')) {
            this.next();
            const then = this.parseExpr(0);
            this.eat(':');
            const els = this.parseExpr(0);
            this.count();
            return { t: 'cond', test: left, then, else: els };
        }
        return left;
    }

    private parseUnary(): Ast {
        const t = this.peek();
        if (t && t.k === 'punct' && (t.v === '-' || t.v === '!' || t.v === '+')) {
            this.next();
            const arg = this.parseUnary();
            this.count();
            return { t: 'unary', op: t.v as '-' | '!' | '+', arg };
        }
        return this.parsePostfix();
    }

    private parsePostfix(): Ast {
        let node = this.parsePrimary();
        for (;;) {
            if (this.isPunct('.')) {
                this.next();
                const name = this.next();
                if (!name || name.k !== 'name') throw new ExprError('Expected property name after "."');
                this.count();
                node = { t: 'member', obj: node, key: name.v };
            } else if (this.isPunct('[')) {
                this.next();
                const index = this.parseExpr(0);
                this.eat(']');
                this.count();
                node = { t: 'index', obj: node, index };
            } else {
                // NOTE: no call postfix here — calls are only on bare identifiers
                // (parsePrimary), so `a.b()` / `x[y]()` are rejected by design.
                break;
            }
        }
        return node;
    }

    private parsePrimary(): Ast {
        const t = this.next();
        if (!t) throw new ExprError('Unexpected end of expression');
        this.count();
        if (t.k === 'num') return { t: 'num', v: t.v };
        if (t.k === 'str') return { t: 'str', v: t.v };
        if (t.k === 'name') {
            if (t.v === 'true') return { t: 'bool', v: true };
            if (t.v === 'false') return { t: 'bool', v: false };
            if (t.v === 'null' || t.v === 'undefined') return { t: 'null' };
            // Function call: only a bare identifier may be a callee.
            if (this.isPunct('(')) {
                this.next();
                const args: Ast[] = [];
                if (!this.isPunct(')')) {
                    args.push(this.parseExpr(0));
                    while (this.isPunct(',')) { this.next(); args.push(this.parseExpr(0)); }
                }
                this.eat(')');
                return { t: 'call', callee: t.v, args };
            }
            return { t: 'ident', name: t.v };
        }
        // punctuation-led primaries
        if (t.v === '(') {
            const inner = this.parseExpr(0);
            this.eat(')');
            return inner;
        }
        if (t.v === '[') {
            const items: Ast[] = [];
            if (!this.isPunct(']')) {
                items.push(this.parseExpr(0));
                while (this.isPunct(',')) { this.next(); items.push(this.parseExpr(0)); }
            }
            this.eat(']');
            return { t: 'array', items };
        }
        throw new ExprError(`Unexpected token '${t.v}'`);
    }
}

// ---- whitelisted functions ---------------------------------------------

function num(v: unknown): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '') { const n = Number(v); return Number.isFinite(n) ? n : NaN; }
    if (typeof v === 'boolean') return v ? 1 : 0;
    return NaN;
}
function str(v: unknown): string {
    if (v == null) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
    if (typeof v === 'string') return v;
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return '';
}

/**
 * The entire callable surface. Every entry is a pure, finite operation over
 * primitives/plain data. Unit conversion is *not* here: the template layer
 * injects `mm` (px-per-mm) and `px` (1) as numeric scope constants, so authors
 * write `W - 4 * mm`. Nothing may reach the DOM, timers, network, or the
 * prototype chain.
 */
export const FUNCTIONS: Record<string, (...args: unknown[]) => unknown> = {
    // math
    min: (...a) => Math.min(...a.map(num)),
    max: (...a) => Math.max(...a.map(num)),
    abs: (x) => Math.abs(num(x)),
    round: (x, d) => { const p = 10 ** (Number(d) || 0); return Math.round(num(x) * p) / p; },
    floor: (x) => Math.floor(num(x)),
    ceil: (x) => Math.ceil(num(x)),
    sqrt: (x) => Math.sqrt(num(x)),
    pow: (x, y) => Math.pow(num(x), num(y)),
    clamp: (x, lo, hi) => Math.min(Math.max(num(x), num(lo)), num(hi)),
    number: (x) => num(x),
    // logic
    if: (c, a, b) => (c ? a : b),
    // strings
    str: (x) => str(x),
    len: (x) => (typeof x === 'string' ? x.length : Array.isArray(x) ? x.length : str(x).length),
    upper: (x) => str(x).toUpperCase(),
    lower: (x) => str(x).toLowerCase(),
    trim: (x) => str(x).trim(),
    slice: (x, a, b) => str(x).slice(Number(a) || 0, b === undefined ? undefined : Number(b)),
    replace: (x, a, b) => str(x).split(str(a)).join(str(b)),
    padStart: (x, l, p) => str(x).padStart(Number(l) || 0, p === undefined ? ' ' : str(p)),
    padEnd: (x, l, p) => str(x).padEnd(Number(l) || 0, p === undefined ? ' ' : str(p)),
    pad: (x, l, p) => str(x).padStart(Number(l) || 0, p === undefined ? '0' : str(p))
};

// ---- evaluator ----------------------------------------------------------

export type Scope = Record<string, unknown>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
    if (typeof v !== 'object' || v === null) return false;
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
}

/** Safe property read: only own keys of plain objects / arrays / strings. */
function readMember(obj: unknown, key: string): unknown {
    if (FORBIDDEN_KEYS.has(key)) return undefined;
    if (typeof obj === 'string') return key === 'length' ? obj.length : undefined;
    if (Array.isArray(obj)) {
        if (key === 'length') return obj.length;
        return undefined; // numeric access goes through `index`, not `member`
    }
    if (isPlainObject(obj)) {
        return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
    }
    return undefined;
}

function truthy(v: unknown): boolean {
    return !!v;
}

interface EvalCtx {
    scope: Scope;
    steps: number;
    limits: EvalLimits;
}

function ev(node: Ast, ctx: EvalCtx): unknown {
    if (++ctx.steps > ctx.limits.maxSteps) throw new ExprError('Expression evaluation budget exceeded');
    switch (node.t) {
        case 'num': return node.v;
        case 'str': return node.v;
        case 'bool': return node.v;
        case 'null': return undefined;
        case 'ident': {
            const s = ctx.scope;
            return Object.prototype.hasOwnProperty.call(s, node.name) ? s[node.name] : undefined;
        }
        case 'array': return node.items.map(it => ev(it, ctx));
        case 'unary': {
            const a = ev(node.arg, ctx);
            if (node.op === '!') return !truthy(a);
            if (node.op === '+') return num(a);
            return -num(a);
        }
        case 'logical': {
            const l = ev(node.left, ctx);
            if (node.op === '&&') return truthy(l) ? ev(node.right, ctx) : l;
            if (node.op === '||') return truthy(l) ? l : ev(node.right, ctx);
            return l == null ? ev(node.right, ctx) : l; // ??
        }
        case 'cond': return truthy(ev(node.test, ctx)) ? ev(node.then, ctx) : ev(node.else, ctx);
        case 'member': return readMember(ev(node.obj, ctx), node.key);
        case 'index': {
            const obj = ev(node.obj, ctx);
            const idx = ev(node.index, ctx);
            if (typeof idx === 'string') return readMember(obj, idx);
            const i = num(idx);
            if (typeof obj === 'string') return obj[i];
            if (Array.isArray(obj)) return i >= 0 && i < obj.length ? obj[i] : undefined;
            return undefined;
        }
        case 'binary': return evalBinary(node.op, ev(node.left, ctx), ev(node.right, ctx), ctx.limits);
        case 'call': {
            const fn = Object.prototype.hasOwnProperty.call(FUNCTIONS, node.callee) ? FUNCTIONS[node.callee] : undefined;
            if (!fn) throw new ExprError(`Unknown function '${node.callee}'`);
            const args = node.args.map(a => ev(a, ctx));
            const out = fn(...args);
            if (typeof out === 'string' && out.length > ctx.limits.maxStringLength) {
                throw new ExprError('String result too large');
            }
            return out;
        }
    }
}

function evalBinary(op: string, l: unknown, r: unknown, limits: EvalLimits): unknown {
    switch (op) {
        case '+':
            // String concatenation when either side is a string; else numeric.
            if (typeof l === 'string' || typeof r === 'string') {
                const out = str(l) + str(r);
                if (out.length > limits.maxStringLength) throw new ExprError('String result too large');
                return out;
            }
            return num(l) + num(r);
        case '-': return num(l) - num(r);
        case '*': return num(l) * num(r);
        case '/': return num(l) / num(r);
        case '%': return num(l) % num(r);
        case '**': return num(l) ** num(r);
        case '<': return num(l) < num(r);
        case '<=': return num(l) <= num(r);
        case '>': return num(l) > num(r);
        case '>=': return num(l) >= num(r);
        case '==': return looseEq(l, r);
        case '!=': return !looseEq(l, r);
        case '===': return l === r;
        case '!==': return l !== r;
        default: throw new ExprError(`Unknown operator '${op}'`);
    }
}

/** Loose equality restricted to primitives (no object coercion surprises). */
function looseEq(l: unknown, r: unknown): boolean {
    if (l == null && r == null) return true;
    if (typeof l === typeof r) return l === r;
    if (typeof l === 'number' || typeof r === 'number') return num(l) === num(r);
    return str(l) === str(r);
}

// ---- public API ---------------------------------------------------------

/** Parse an expression to an AST. Throws {@link ExprError} on invalid input. */
export function parseExpr(src: string, limits: EvalLimits = DEFAULT_LIMITS): Ast {
    const toks = tokenize(src);
    if (toks.length === 0) throw new ExprError('Empty expression');
    return new Parser(toks, limits.maxNodes).parse();
}

/** True if `src` is a syntactically valid, in-budget expression. */
export function isValidExpr(src: string, limits: EvalLimits = DEFAULT_LIMITS): boolean {
    try {
        parseExpr(src, limits);
        return true;
    } catch {
        return false;
    }
}

/** Evaluate a pre-parsed AST against a scope. Throws on budget/eval errors. */
export function evalAst(ast: Ast, scope: Scope, limits: EvalLimits = DEFAULT_LIMITS): unknown {
    return ev(ast, { scope, steps: 0, limits });
}

const astCache = new Map<string, Ast>();

/** Parse (memoised) and return an AST, or throw {@link ExprError}. */
export function compileExpr(src: string, limits: EvalLimits = DEFAULT_LIMITS): Ast {
    let ast = astCache.get(src);
    if (!ast) {
        ast = parseExpr(src, limits);
        if (astCache.size > 500) astCache.clear();
        astCache.set(src, ast);
    }
    return ast;
}

/** Free identifiers referenced by an AST (variables/columns it depends on). */
export function staticIdentifiers(ast: Ast): string[] {
    const out = new Set<string>();
    (function walk(n: Ast): void {
        switch (n.t) {
            case 'ident': out.add(n.name); break;
            case 'array': n.items.forEach(walk); break;
            case 'unary': walk(n.arg); break;
            case 'binary': case 'logical': walk(n.left); walk(n.right); break;
            case 'cond': walk(n.test); walk(n.then); walk(n.else); break;
            case 'member': walk(n.obj); break;
            case 'index': walk(n.obj); walk(n.index); break;
            case 'call': n.args.forEach(walk); break;
        }
    })(ast);
    return [...out];
}

// ---- AST as the wire format --------------------------------------------
//
// Templates ship the *parsed* AST (plain JSON), not source strings, so the
// untrusted-template import path never has to run the tokenizer/parser on
// untrusted input — it only has to check that an already-plain-data tree uses
// nothing but the known node kinds and whitelisted functions. `validateAst`
// is that check; `unparse` turns a stored AST back into a friendly string for
// the editor; `countNodes` powers the size caps.

const NODE_KINDS = new Set([
    'num', 'str', 'bool', 'null', 'ident', 'array',
    'unary', 'binary', 'logical', 'cond', 'member', 'index', 'call'
]);
const UNARY_OPS = new Set(['-', '!', '+']);
const LOGICAL_OPS = new Set(['&&', '||', '??']);
const BINARY_OPS = new Set([
    '+', '-', '*', '/', '%', '**',
    '<', '<=', '>', '>=', '==', '!=', '===', '!=='
]);

/** Count AST nodes (bounded walk; used for the store size caps). */
export function countNodes(ast: unknown): number {
    let n = 0;
    (function walk(node: unknown): void {
        if (n > 100_000) return; // hard stop against pathological input
        if (!node || typeof node !== 'object') return;
        n++;
        for (const v of Object.values(node as Record<string, unknown>)) {
            if (Array.isArray(v)) v.forEach(walk);
            else if (v && typeof v === 'object') walk(v);
        }
    })(ast);
    return n;
}

/**
 * Validate an untrusted, already-parsed AST (as loaded from JSON). Returns a
 * list of problems; empty means the tree is safe to {@link evalAst}. This is
 * the expression half of the import gate — it guarantees the tree
 * contains only known node kinds, known operators, and whitelisted function
 * calls, within the node/string budgets.
 */
export function validateAst(ast: unknown, limits: EvalLimits = DEFAULT_LIMITS): string[] {
    const errors: string[] = [];
    const total = countNodes(ast);
    if (total > limits.maxNodes) errors.push(`Expression too large (${total} > ${limits.maxNodes} nodes)`);

    (function check(node: unknown, depth: number): void {
        if (errors.length > 20 || depth > limits.maxNodes) return;
        if (!node || typeof node !== 'object' || Array.isArray(node)) { errors.push('Malformed expression node'); return; }
        const n = node as Record<string, unknown>;
        const kind = n.t;
        if (typeof kind !== 'string' || !NODE_KINDS.has(kind)) { errors.push(`Unknown expression node "${String(kind)}"`); return; }
        switch (kind) {
            case 'num': if (typeof n.v !== 'number' || !Number.isFinite(n.v)) errors.push('Bad number literal'); break;
            case 'str':
                if (typeof n.v !== 'string') errors.push('Bad string literal');
                else if (n.v.length > limits.maxStringLength) errors.push('String literal too long');
                break;
            case 'bool': if (typeof n.v !== 'boolean') errors.push('Bad boolean literal'); break;
            case 'null': break;
            case 'ident': if (typeof n.name !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(n.name)) errors.push('Bad identifier'); break;
            case 'array': if (!Array.isArray(n.items)) errors.push('Bad array'); else n.items.forEach(it => check(it, depth + 1)); break;
            case 'unary':
                if (!UNARY_OPS.has(n.op as string)) errors.push(`Bad unary operator "${String(n.op)}"`);
                check(n.arg, depth + 1);
                break;
            case 'binary':
                if (!BINARY_OPS.has(n.op as string)) errors.push(`Bad operator "${String(n.op)}"`);
                check(n.left, depth + 1); check(n.right, depth + 1);
                break;
            case 'logical':
                if (!LOGICAL_OPS.has(n.op as string)) errors.push(`Bad logical operator "${String(n.op)}"`);
                check(n.left, depth + 1); check(n.right, depth + 1);
                break;
            case 'cond': check(n.test, depth + 1); check(n.then, depth + 1); check(n.else, depth + 1); break;
            case 'member':
                if (typeof n.key !== 'string' || FORBIDDEN_KEYS.has(n.key)) errors.push(`Forbidden member "${String(n.key)}"`);
                check(n.obj, depth + 1);
                break;
            case 'index': check(n.obj, depth + 1); check(n.index, depth + 1); break;
            case 'call':
                if (typeof n.callee !== 'string' || !Object.prototype.hasOwnProperty.call(FUNCTIONS, n.callee)) {
                    errors.push(`Unknown function "${String(n.callee)}"`);
                }
                if (!Array.isArray(n.args)) errors.push('Bad call arguments');
                else n.args.forEach(a => check(a, depth + 1));
                break;
        }
    })(ast, 0);

    return errors;
}

/** True if an untrusted AST is safe to evaluate. */
export function isValidAst(ast: unknown, limits: EvalLimits = DEFAULT_LIMITS): ast is Ast {
    return validateAst(ast, limits).length === 0;
}

// Render precedence for parenthesising unparse output.
function prec(node: Ast): number {
    switch (node.t) {
        case 'cond': return 0;
        case 'logical': return BP[node.op];
        case 'binary': return BP[node.op];
        case 'unary': return 9;
        default: return 20; // primaries never need wrapping
    }
}

function wrap(child: Ast, parentPrec: number): string {
    const s = unparse(child);
    return prec(child) < parentPrec ? `(${s})` : s;
}

/** AST → a friendly source string (round-trips through {@link parseExpr}). */
export function unparse(ast: Ast): string {
    switch (ast.t) {
        case 'num': return String(ast.v);
        case 'str': return JSON.stringify(ast.v);
        case 'bool': return String(ast.v);
        case 'null': return 'null';
        case 'ident': return ast.name;
        case 'array': return `[${ast.items.map(unparse).join(', ')}]`;
        case 'unary': return `${ast.op}${wrap(ast.arg, 9)}`;
        case 'binary': return `${wrap(ast.left, BP[ast.op])} ${ast.op} ${wrap(ast.right, BP[ast.op] + 1)}`;
        case 'logical': return `${wrap(ast.left, BP[ast.op])} ${ast.op} ${wrap(ast.right, BP[ast.op] + 1)}`;
        case 'cond': return `${wrap(ast.test, 1)} ? ${unparse(ast.then)} : ${unparse(ast.else)}`;
        case 'member': return `${wrap(ast.obj, 20)}.${ast.key}`;
        case 'index': return `${wrap(ast.obj, 20)}[${unparse(ast.index)}]`;
        case 'call': return `${ast.callee}(${ast.args.map(unparse).join(', ')})`;
    }
}
