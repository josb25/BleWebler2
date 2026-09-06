/**
 * One platform-neutral validation boundary for human- or AI-authored ULT.
 * Browser UI, CLI, and other integrations can all call this without knowing
 * how the individual import, expression, and adaptive-lint stages fit together.
 */

import type { MeasureTextFn } from '../raster/measure';
import { validateAcrossSizes, type LintReport } from './lint';
import { parseExpr } from './safe-expr';
import type { LabelTemplate } from './template';
import { parseTemplate } from './validate';

export interface TemplateDocumentValidation {
    ok: boolean;
    template?: LabelTemplate;
    parseErrors: string[];
    warnings: string[];
    expressionErrors: string[];
    lint?: LintReport;
}

/** Strictly import a ULT document and validate it across its adaptive matrix. */
export function validateTemplateDocument(
    input: unknown,
    params?: Record<string, unknown>,
    measureText?: MeasureTextFn
): TemplateDocumentValidation {
    const parsed = parseTemplate(input);
    if (!parsed.ok) {
        return {
            ok: false,
            parseErrors: parsed.errors,
            warnings: [],
            expressionErrors: expressionSourceErrors(input)
        };
    }

    const expressionErrors = expressionSourceErrors(input);
    const lint = validateAcrossSizes(parsed.template, params, measureText);
    return {
        ok: expressionErrors.length === 0 && lint.ok,
        template: parsed.template,
        parseErrors: [],
        warnings: parsed.warnings,
        expressionErrors,
        lint
    };
}

/** Find expression dimensions whose readable source differs from their AST. */
export function expressionSourceErrors(input: unknown): string[] {
    const errors: string[] = [];
    walkJson(input, (node, path) => {
        if (typeof node.src !== 'string' || node.e === undefined) return;
        try {
            if (JSON.stringify(parseExpr(node.src)) !== JSON.stringify(node.e)) {
                errors.push(`${path}.src does not match ${path}.e`);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            errors.push(`${path}.src is invalid: ${message}`);
        }
    });
    return errors;
}

function walkJson(
    value: unknown,
    visit: (node: Record<string, unknown>, path: string) => void,
    path = '$'
): void {
    if (Array.isArray(value)) {
        value.forEach((entry, index) => walkJson(entry, visit, `${path}[${index}]`));
        return;
    }
    if (value === null || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    visit(node, path);
    for (const [key, entry] of Object.entries(node)) walkJson(entry, visit, `${path}.${key}`);
}
