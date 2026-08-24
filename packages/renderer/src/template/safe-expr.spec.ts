import { describe, it, expect } from 'vitest';
import {
    parseExpr, evalAst, compileExpr, unparse, validateAst, isValidExpr,
    staticIdentifiers, countNodes, ExprError, type Ast
} from './safe-expr';

function run(src: string, scope: Record<string, unknown> = {}): unknown {
    return evalAst(parseExpr(src), scope);
}

describe('safe-expr: evaluation', () => {
    it('does arithmetic with correct precedence', () => {
        expect(run('1 + 2 * 3')).toBe(7);
        expect(run('(1 + 2) * 3')).toBe(9);
        expect(run('2 ** 3 ** 2')).toBe(512); // right-assoc
        expect(run('10 % 3')).toBe(1);
        expect(run('-5 + 3')).toBe(-2);
    });

    it('resolves identifiers and members of plain data', () => {
        expect(run('W / 2', { W: 200 })).toBe(100);
        expect(run('row.price * qty', { row: { price: 3 }, qty: 4 })).toBe(12);
        expect(run('items[1]', { items: ['a', 'b', 'c'] })).toBe('b');
        expect(run('name.length', { name: 'hello' })).toBe(5);
    });

    it('handles strings, comparisons, logic and ternaries', () => {
        expect(run('upper("abc")')).toBe('ABC');
        expect(run('"a" + "b" + 1')).toBe('ab1');
        expect(run('qty > 1 ? "many" : "one"', { qty: 5 })).toBe('many');
        expect(run('a && b', { a: true, b: 'yes' })).toBe('yes');
        expect(run('a || b', { a: 0, b: 'fallback' })).toBe('fallback');
        expect(run('x ?? 7', { x: null })).toBe(7);
    });

    it('supports the whitelisted function table', () => {
        expect(run('clamp(5, 0, 3)')).toBe(3);
        expect(run('min(4, 2, 9)')).toBe(2);
        expect(run('max(4, 2, 9)')).toBe(9);
        expect(run('round(3.14159, 2)')).toBe(3.14);
        expect(run('pad("7", 3)')).toBe('007');
        expect(run('len("hello")')).toBe(5);
    });

    it('missing identifiers resolve to undefined, not throw', () => {
        expect(run('missing')).toBeUndefined();
        expect(run('missing + 1')).toBeNaN();
    });
});

describe('safe-expr: safety', () => {
    it('cannot reach the prototype chain or Function', () => {
        expect(run('constructor', {})).toBeUndefined();
        expect(run('x.constructor', { x: {} })).toBeUndefined();
        expect(run('x.__proto__', { x: {} })).toBeUndefined();
        expect(run('x.constructor.constructor', { x: {} })).toBeUndefined();
        // A hostile scope value's prototype is unreachable.
        expect(run('s.constructor', { s: 'str' })).toBeUndefined();
    });

    it('does not expose method calls on values', () => {
        // `toUpperCase` is not a whitelisted function, and method calls are not
        // grammar at all — parsing `a.b()` fails.
        expect(() => parseExpr('name.toUpperCase()')).toThrow(ExprError);
    });

    it('rejects unknown function calls at eval time', () => {
        expect(() => evalAst(parseExpr('alert(1)'), {})).toThrow(ExprError);
        expect(() => evalAst(parseExpr('fetch("x")'), {})).toThrow(ExprError);
    });

    it('has no assignment / new / function syntax', () => {
        expect(() => parseExpr('x = 1')).toThrow(ExprError);
        expect(() => parseExpr('new Thing()')).toThrow(ExprError);
        expect(() => parseExpr('() => 1')).toThrow(ExprError);
    });

    it('enforces the node budget at parse time', () => {
        const huge = Array.from({ length: 600 }, (_, i) => i).join(' + ');
        expect(() => parseExpr(huge, { maxNodes: 500, maxSteps: 5000, maxStringLength: 1000 })).toThrow(/too large/);
    });

    it('enforces the step budget at eval time', () => {
        const ast = parseExpr('1 + 2 + 3 + 4 + 5 + 6 + 7 + 8');
        expect(() => evalAst(ast, {}, { maxNodes: 500, maxSteps: 3, maxStringLength: 1000 })).toThrow(/budget/);
    });

    it('caps runaway string growth', () => {
        expect(() => evalAst(parseExpr('padEnd("x", 999999)'), {}, { maxNodes: 500, maxSteps: 5000, maxStringLength: 1000 }))
            .toThrow(/too large/);
    });
});

describe('safe-expr: AST wire format', () => {
    it('round-trips AST -> string -> AST', () => {
        for (const src of ['1 + 2 * 3', 'clamp(4, W * 0.1, H)', 'a ? b : c', 'row.price * qty', '!(a && b)']) {
            const ast = parseExpr(src);
            const json = JSON.parse(JSON.stringify(ast)) as Ast; // survives serialization
            const reparsed = parseExpr(unparse(json));
            expect(evalAst(reparsed, { W: 100, H: 50, a: 1, b: 2, c: 3, row: { price: 2 }, qty: 3 }))
                .toEqual(evalAst(ast, { W: 100, H: 50, a: 1, b: 2, c: 3, row: { price: 2 }, qty: 3 }));
        }
    });

    it('validates a benign untrusted AST', () => {
        const ast = JSON.parse(JSON.stringify(parseExpr('clamp(4, W * 0.1, H)')));
        expect(validateAst(ast)).toEqual([]);
    });

    it('rejects a forged AST with an unknown function', () => {
        const forged: unknown = { t: 'call', callee: 'eval', args: [{ t: 'str', v: 'boom' }] };
        expect(validateAst(forged).length).toBeGreaterThan(0);
    });

    it('rejects a forged AST reaching constructor via member', () => {
        const forged: unknown = { t: 'member', obj: { t: 'ident', name: 'x' }, key: 'constructor' };
        expect(validateAst(forged).length).toBeGreaterThan(0);
    });

    it('rejects a forged AST with an unknown node kind', () => {
        const forged: unknown = { t: 'assign', left: { t: 'ident', name: 'x' }, right: { t: 'num', v: 1 } };
        expect(validateAst(forged).length).toBeGreaterThan(0);
    });

    it('counts nodes and lists identifiers', () => {
        const ast = parseExpr('a + b * c');
        expect(countNodes(ast)).toBeGreaterThan(3);
        expect(staticIdentifiers(ast).sort()).toEqual(['a', 'b', 'c']);
    });

    it('isValidExpr / compileExpr basics', () => {
        expect(isValidExpr('1 + 1')).toBe(true);
        expect(isValidExpr('1 +')).toBe(false);
        expect(evalAst(compileExpr('2 * 21'), {})).toBe(42);
    });
});
