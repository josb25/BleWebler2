import { describe, it, expect } from 'vitest';
import { parseTemplate, parseTemplateJSON, serializeTemplate, CAPS } from './validate';
import { createTemplate, templateFromDesign, TAG_LIMITS, IMAGE_LIMITS, type LabelTemplate } from './template';
import { compileText } from './expr';
import { parseExpr } from './safe-expr';
import { createDesign, addElement, createElement, mmToPx } from '../model/design';

function goodTemplate(): LabelTemplate {
    const tpl = createTemplate('Price tag', 12, 40);
    tpl.params = [{ name: 'price', label: 'Price', type: 'number', default: 5 }];
    tpl.elements = [{
        type: 'text', id: 't1',
        place: { anchor: 'tl', dx: { u: 'mm', v: 1 }, dy: { u: 'mm', v: 1 }, size: { e: parseExpr('H * 0.4') } },
        text: compileText('EUR {price}'),
        font: 'bitmap', bitmapFont: 'fixed', fontFamily: 'sans-serif',
        bold: false, italic: false, underline: false, align: 'left'
    }];
    return tpl;
}

describe('parseTemplate: acceptance', () => {
    it('accepts and normalises a valid template', () => {
        const res = parseTemplate(JSON.parse(JSON.stringify(goodTemplate())));
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.template.name).toBe('Price tag');
            expect(res.template.params[0].name).toBe('price');
            expect(res.template.elements[0].type).toBe('text');
        }
    });

    it('round-trips serialize -> parse', () => {
        const json = serializeTemplate(goodTemplate());
        const res = parseTemplateJSON(json);
        expect(res.ok).toBe(true);
    });

    it('accepts a template produced from a design', () => {
        let design = createDesign(96, mmToPx(40), 'From design');
        const t = createElement('text', design);
        design = addElement(design, t);
        const res = parseTemplate(JSON.parse(JSON.stringify(templateFromDesign(design))));
        expect(res.ok).toBe(true);
    });

    it('strips unknown top-level and element fields', () => {
        const raw = JSON.parse(JSON.stringify(goodTemplate())) as Record<string, unknown>;
        raw.evilField = { t: 'call', callee: 'eval' };
        (raw.elements as Record<string, unknown>[])[0].onclick = 'alert(1)';
        const res = parseTemplate(raw);
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect('evilField' in res.template).toBe(false);
            expect('onclick' in res.template.elements[0]).toBe(false);
        }
    });
});

describe('parseTemplate: rejection', () => {
    it('rejects non-templates', () => {
        expect(parseTemplate(null).ok).toBe(false);
        expect(parseTemplate({ kind: 'something-else' }).ok).toBe(false);
        expect(parseTemplate({ kind: 'label-template', version: 99 }).ok).toBe(false);
        expect(parseTemplateJSON('not json').ok).toBe(false);
    });

    it('rejects internal LabelDesign objects as import files', () => {
        const design = createDesign(96, mmToPx(40), 'Runtime design');
        expect(parseTemplate(JSON.parse(JSON.stringify(design))).ok).toBe(false);
    });

    it('rejects a forged malicious expression AST in a binding', () => {
        const tpl = JSON.parse(JSON.stringify(goodTemplate())) as Record<string, unknown>;
        (tpl.elements as Record<string, unknown>[])[0].text = {
            parts: [{ e: { t: 'call', callee: 'fetch', args: [{ t: 'str', v: 'http://evil' }] } }]
        };
        const res = parseTemplate(tpl);
        expect(res.ok).toBe(false);
    });

    it('rejects a forged malicious expression AST in a dimension', () => {
        const tpl = JSON.parse(JSON.stringify(goodTemplate())) as Record<string, unknown>;
        (tpl.elements as Record<string, unknown>[])[0] = {
            ...(tpl.elements as Record<string, unknown>[])[0],
            place: { anchor: 'tl', size: { e: { t: 'member', obj: { t: 'ident', name: 'x' }, key: 'constructor' } } }
        };
        const res = parseTemplate(tpl);
        expect(res.ok).toBe(false);
    });

    it('rejects too many elements', () => {
        const tpl = JSON.parse(JSON.stringify(goodTemplate())) as Record<string, unknown>;
        tpl.elements = Array.from({ length: CAPS.maxElements + 1 }, () => (tpl.elements as unknown[])[0]);
        expect(parseTemplate(tpl).ok).toBe(false);
    });

    it('rejects an oversized embedded image', () => {
        const tpl = JSON.parse(JSON.stringify(goodTemplate())) as Record<string, unknown>;
        tpl.elements = [{
            type: 'image', id: 'img', place: { anchor: 'tl' },
            src: 'data:image/png;base64,' + 'A'.repeat(CAPS.maxImageBytes + 10),
            mode: 'floyd-steinberg', threshold: 128, invert: false
        }];
        expect(parseTemplate(tpl).ok).toBe(false);
    });

    it('rejects a bad parameter identifier', () => {
        const tpl = JSON.parse(JSON.stringify(goodTemplate())) as Record<string, unknown>;
        tpl.params = [{ name: '1 bad name', label: 'x', type: 'text', default: '' }];
        expect(parseTemplate(tpl).ok).toBe(false);
    });
});

describe('parseTemplate: sharing metadata', () => {
    function raw(extra: Record<string, unknown>): Record<string, unknown> {
        return { ...JSON.parse(JSON.stringify(goodTemplate())), ...extra };
    }

    it('keeps the version of a valid v1 document', () => {
        const res = parseTemplate(raw({ version: 1 }));
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.template.version).toBe(1);
            expect(res.template.license).toBeUndefined();
        }
    });

    it('rejects a version it does not know', () => {
        expect(parseTemplate(raw({ version: 2 })).ok).toBe(false);
    });

    it('keeps a recognised licence', () => {
        const res = parseTemplate(raw({ license: 'CC-BY-4.0' }));
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.template.license).toBe('CC-BY-4.0');
    });

    // Inventing terms the author never chose would be worse than showing none.
    it('drops an unrecognised licence, with a warning, rather than guessing', () => {
        const res = parseTemplate(raw({ license: 'WTFPL' }));
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.template.license).toBeUndefined();
            expect(res.warnings.join(' ')).toMatch(/licence/i);
        }
    });

    it('normalises tags: lowercased, deduped, punctuation collapsed, blanks dropped', () => {
        const res = parseTemplate(raw({ tags: ['Kitchen', 'kitchen ', '  ', 'Spice-Jars', '!!!', 'spice jars'] }));
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.template.tags).toEqual(['kitchen', 'spice jars']);
    });

    it('keeps non-Latin tags intact', () => {
        const res = parseTemplate(raw({ tags: ['Küche', '調味料'] }));
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.template.tags).toEqual(['küche', '調味料']);
    });

    it('lets someone tag their own work as heavily as they like', () => {
        // The cap exists to bound a hostile import, not to ration tags. Eighty
        // on one label is unusual but nobody's business but the author's.
        const many = Array.from({ length: 80 }, (_, i) => `tag${i}`);
        const res = parseTemplate(raw({ tags: many }));
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.template.tags?.length).toBe(80);
    });

    it('still caps an absurd tag list from an imported file', () => {
        const flood = Array.from({ length: TAG_LIMITS.maxTags * 3 }, (_, i) => `tag${i}`);
        const res = parseTemplate(raw({ tags: flood }));
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.template.tags?.length).toBe(TAG_LIMITS.maxTags);
    });

    /** A valid embedded image of roughly `kb` kilobytes. */
    function fakeImage(kb: number): string {
        return 'data:image/webp;base64,' + 'A'.repeat(Math.round((kb * 1024) / 0.75));
    }

    it('keeps a well-formed cover photo', () => {
        const res = parseTemplate(raw({ gallery: { cover: { src: fakeImage(20), alt: 'On the patch panel' } } }));
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.template.gallery?.cover?.alt).toBe('On the patch panel');
            expect(res.template.gallery?.cover?.src.startsWith('data:image/webp')).toBe(true);
        }
    });

    it('refuses a remote image URL', () => {
        // Opening someone's template must not become a request to their server
        // announcing who is looking at it.
        const res = parseTemplate(raw({ gallery: { cover: { src: 'https://tracker.example/pixel.png', alt: 'x' } } }));
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.template.gallery).toBeUndefined();
            expect(res.warnings.join(' ')).toMatch(/embedded image data/i);
        }
    });

    it('refuses a non-image data URL', () => {
        const res = parseTemplate(raw({ gallery: { cover: { src: 'data:text/html;base64,PHNjcmlwdD4=', alt: 'x' } } }));
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.template.gallery).toBeUndefined();
    });

    it('drops a photo past the size cap rather than breaking the library', () => {
        // One oversized image in a shared template would otherwise fill the
        // storage key every saved label shares.
        const res = parseTemplate(raw({ gallery: { cover: { src: fakeImage(400), alt: 'huge' } } }));
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.template.gallery).toBeUndefined();
            expect(res.warnings.join(' ')).toMatch(/exceeds/i);
        }
    });

    it('caps how many extra photos travel with a template', () => {
        const shots = Array.from({ length: 9 }, (_, i) => ({ src: fakeImage(10), alt: `shot ${i}` }));
        const res = parseTemplate(raw({ gallery: { shots } }));
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.template.gallery?.shots).toHaveLength(IMAGE_LIMITS.maxShots);
    });

    it('drops a non-array tags field', () => {
        const bad = parseTemplate(raw({ tags: 'kitchen' }));
        expect(bad.ok).toBe(true);
        if (bad.ok) expect(bad.template.tags).toBeUndefined();
    });

    it('clamps revision to a sane positive integer', () => {
        const res = parseTemplate(raw({ revision: -4 }));
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.template.revision).toBe(1);
    });
});

describe('parseTemplate: web fonts', () => {
    function withFont(webFont: unknown): Record<string, unknown> {
        const tpl = JSON.parse(JSON.stringify(goodTemplate()));
        tpl.elements[0].font = 'vector';
        tpl.elements[0].webFont = webFont;
        return tpl;
    }

    it('keeps a catalogue font id', () => {
        const res = parseTemplate(withFont('ibm-plex-mono'));
        expect(res.ok).toBe(true);
        if (res.ok && res.template.elements[0].type === 'text') {
            expect(res.template.elements[0].webFont).toBe('ibm-plex-mono');
        }
    });

    // A font this build cannot supply would render in a fallback at different
    // metrics; dropping it makes that visible instead of silently wrong.
    it('drops a font id that is not in the catalogue', () => {
        const res = parseTemplate(withFont('Helvetica Neue'));
        expect(res.ok).toBe(true);
        if (res.ok && res.template.elements[0].type === 'text') {
            expect(res.template.elements[0].webFont).toBeUndefined();
        }
    });
});
