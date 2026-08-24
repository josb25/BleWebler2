/**
 * Text bindings — the string half of the template engine.
 *
 * Any user-facing string field (a text element's `text`, a barcode/QR `data`)
 * may interpolate `{ … }` expressions: `"Price: {price}"`, `"{sku} x{qty}"`,
 * `"{qty > 1 ? qty + ' pcs' : ''}"`. Bindings are backed by the safe expression
 * engine ({@link ./safe-expr}), so nothing here runs host code.
 *
 * Wire format: like the dimension layer, a binding is stored **pre-compiled**.
 * A plain literal stays a bare string; a string with bindings compiles to a
 * `{ parts: [...] }` list of literal segments and pre-parsed expression ASTs.
 * The import path therefore validates a plain-data tree rather
 * than re-tokenising untrusted source. `{{` / `}}` escape to literal braces.
 */

import {
    compileExpr, evalAst, unparse, validateAst, staticIdentifiers,
    DEFAULT_LIMITS, type Ast, type EvalLimits, type Scope
} from './safe-expr';

export type TemplateScope = Scope;

/** One segment of a compiled binding: literal text, or an expression to eval. */
export type BindPart = string | { e: Ast };

/** A bindable string: a plain literal, or a compiled interpolation. */
export type TextBinding = string | { parts: BindPart[] };

/** True if a raw string contains at least one `{ … }` binding. */
export function hasBindings(input: string): boolean {
    // Ignore escaped braces so "{{literal}}" is not treated as a binding.
    // Note: a *non-global* regex here — `.test()` on a /g regex is stateful.
    return /\{[^{}]*\}/.test(input.replace(/\{\{|\}\}/g, ''));
}

/**
 * Compile a raw authoring string into a {@link TextBinding}. Strings without
 * bindings pass through unchanged (kept lean in the document). Malformed
 * expressions are preserved as literal text rather than throwing, so the
 * editor never loses the user's keystrokes.
 */
export function compileText(input: string): TextBinding {
    if (!hasBindings(input)) return unescapeBraces(input);

    const parts: BindPart[] = [];
    let last = 0;
    let pushedExpr = false;
    // Walk the *escaped-aware* string manually so we can honour {{ }}.
    for (let i = 0; i < input.length; i++) {
        if (input[i] === '{' && input[i + 1] === '{') { i++; continue; }
        if (input[i] === '}' && input[i + 1] === '}') { i++; continue; }
        if (input[i] === '{') {
            const end = input.indexOf('}', i + 1);
            if (end === -1) break;
            const literal = unescapeBraces(input.slice(last, i));
            if (literal) parts.push(literal);
            const src = input.slice(i + 1, end).trim();
            if (src) {
                try {
                    parts.push({ e: compileExpr(src) });
                    pushedExpr = true;
                } catch {
                    // Keep an invalid expression visible as literal text.
                    parts.push(`{${src}}`);
                }
            }
            last = end + 1;
            i = end;
        }
    }
    const tail = unescapeBraces(input.slice(last));
    if (tail) parts.push(tail);
    // If nothing actually compiled to an expression, it is just a literal.
    if (!pushedExpr) return unescapeBraces(input);
    return { parts };
}

function unescapeBraces(s: string): string {
    return s.replace(/\{\{/g, '{').replace(/\}\}/g, '}');
}

function stringify(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
}

/** Resolve a compiled binding to a concrete string against a scope. */
export function resolveText(binding: TextBinding, scope: TemplateScope, limits: EvalLimits = DEFAULT_LIMITS): string {
    if (typeof binding === 'string') return binding;
    let out = '';
    for (const part of binding.parts) {
        if (typeof part === 'string') { out += part; continue; }
        try {
            out += stringify(evalAst(part.e, scope, limits));
        } catch {
            // A runaway/failed expression contributes nothing rather than breaking the label.
        }
    }
    return out;
}

/** Render a compiled binding back to its editable authoring string. */
export function textBindingSource(binding: TextBinding): string {
    if (typeof binding === 'string') return binding.replace(/\{/g, '{{').replace(/\}/g, '}}');
    return binding.parts
        .map(p => (typeof p === 'string' ? p.replace(/\{/g, '{{').replace(/\}/g, '}}') : `{${unparse(p.e)}}`))
        .join('');
}

/** Names of the variables/columns a binding depends on. */
export function textIdentifiers(binding: TextBinding): string[] {
    if (typeof binding === 'string') return [];
    const out = new Set<string>();
    for (const p of binding.parts) if (typeof p !== 'string') for (const id of staticIdentifiers(p.e)) out.add(id);
    return [...out];
}

/**
 * Validate an untrusted binding (as loaded from JSON): every expression part
 * must be a safe, in-budget AST. Returns problems; empty means safe to resolve.
 * Part of the untrusted-template import gate.
 */
export function validateTextBinding(binding: unknown, limits: EvalLimits = DEFAULT_LIMITS): string[] {
    if (typeof binding === 'string') {
        return binding.length > limits.maxStringLength ? ['Text too long'] : [];
    }
    if (!binding || typeof binding !== 'object') return ['Malformed text binding'];
    const parts = (binding as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) return ['Malformed text binding'];
    const errors: string[] = [];
    for (const p of parts) {
        if (typeof p === 'string') {
            if (p.length > limits.maxStringLength) errors.push('Text segment too long');
        } else if (p && typeof p === 'object' && 'e' in p) {
            errors.push(...validateAst((p as { e: unknown }).e, limits));
        } else {
            errors.push('Malformed binding part');
        }
    }
    return errors;
}

/**
 * Convenience one-shot: compile then resolve a raw string. Handy for live
 * preview/authoring where the source string is edited directly. The stored
 * document uses the compiled {@link TextBinding} form instead.
 */
export function resolveTemplateString(input: string, scope: TemplateScope, limits: EvalLimits = DEFAULT_LIMITS): string {
    return resolveText(compileText(input), scope, limits);
}

/** Identifiers referenced by a raw authoring string (pre-compile). */
export function bindingIdentifiers(input: string): string[] {
    return textIdentifiers(compileText(input));
}
