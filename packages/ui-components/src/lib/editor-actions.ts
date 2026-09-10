/**
 * Editing actions shared by every piece of chrome that can trigger them — the
 * menu bar, the tool palette, the options bar and the phone toolbar. Kept out
 * of the components so the same behaviour is not written four times and
 * cannot drift between them.
 */
import type { EditorStore } from '../stores/editor.svelte';
import { measureElement, domMeasureText, type AnyElement, type ShapeKind } from 'universal-label-renderer';

export type { ShapeKind };

/**
 * The palette tools. `move` is the selection tool; every other tool places a
 * new element where the label is clicked (or at the centre, from a menu).
 */
export type EditorTool = 'move' | 'text' | 'barcode' | 'qr' | 'datamatrix' | 'shape' | 'symbol' | 'image';

/** Tools that create an element of a single, fixed type. */
export type PlacingTool = Exclude<EditorTool, 'move' | 'image'>;

export const TOOL_SHORTCUTS: Record<EditorTool, string> = {
    move: 'V', text: 'T', barcode: 'B', qr: 'Q', datamatrix: 'M', shape: 'U', symbol: 'S', image: 'I'
};

export const TOOL_LABELS: Record<EditorTool, string> = {
    move: 'Move', text: 'Text', barcode: 'Barcode', qr: 'QR code',
    datamatrix: 'Data Matrix', shape: 'Shape', symbol: 'Symbol', image: 'Image'
};

export const SHAPE_KINDS: { kind: ShapeKind; label: string }[] = [
    { kind: 'rect', label: 'Box' },
    { kind: 'ellipse', label: 'Ellipse' },
    { kind: 'line', label: 'Line' }
];

/** A point in label pixels. */
export interface CanvasPoint { x: number; y: number; }

function current(editor: EditorStore, id: string): AnyElement | undefined {
    return editor.design.elements.find(e => e.id === id);
}

/** Centre an element on a label point, keeping it wholly inside the label. */
export function placeAt(editor: EditorStore, el: AnyElement, at: CanvasPoint): void {
    const b = measureElement(el, domMeasureText);
    const W = editor.design.widthPx;
    const H = editor.design.heightPx;
    const x = Math.round(Math.min(Math.max(0, at.x - b.width / 2), Math.max(0, W - b.width)));
    const y = Math.round(Math.min(Math.max(0, at.y - b.height / 2), Math.max(0, H - b.height)));
    editor.moveElement(el.id, { x, y });
}

/** Insert a shape, sized so each kind reads correctly straight away. */
export function addShape(editor: EditorStore, kind: ShapeKind, at?: CanvasPoint): AnyElement {
    const el = editor.addNew('shape');
    const H = editor.design.heightPx;
    const W = editor.design.widthPx;
    if (kind === 'line') {
        editor.moveElement(el.id, { shape: kind, width: Math.round(W * 0.6), height: 2, stroke: 2, fill: false });
    } else {
        const h = Math.max(16, Math.round(H * 0.5));
        editor.moveElement(el.id, { shape: kind, width: Math.round(W * 0.35), height: h, stroke: 2, fill: false });
    }
    const placed = current(editor, el.id) ?? el;
    if (at) placeAt(editor, placed, at);
    return current(editor, el.id) ?? placed;
}

/** Insert the element a tool creates, at a point or at the label centre. */
export function insertElement(editor: EditorStore, tool: PlacingTool, shapeKind: ShapeKind, at?: CanvasPoint): AnyElement {
    if (tool === 'shape') return addShape(editor, shapeKind, at);
    const el = editor.addNew(tool);
    if (at) placeAt(editor, el, at);
    return current(editor, el.id) ?? el;
}

/** Insert the first chosen image file, scaled to the label height. */
export function addImageFromFile(editor: EditorStore, files: FileList | null, at?: CanvasPoint): void {
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const src = typeof reader.result === 'string' ? reader.result : '';
        if (!src) return;
        const probe = new Image();
        probe.onload = () => {
            const el = editor.addNew('image');
            const maxH = Math.max(8, editor.design.heightPx - 8);
            const h = Math.min(maxH, probe.naturalHeight);
            const w = Math.max(4, Math.round(h * (probe.naturalWidth / probe.naturalHeight)));
            editor.moveElement(el.id, { src, width: w, height: h, x: 4, y: 4 });
            const placed = current(editor, el.id);
            if (at && placed) placeAt(editor, placed, at);
        };
        probe.src = src;
    };
    reader.readAsDataURL(file);
}

/** Download the design as JSON. */
export function exportLabel(editor: EditorStore): void {
    const data = JSON.stringify(editor.design, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${editor.design.name || 'label'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/** Save a copy under a new name, asking for it. */
export function saveAs(editor: EditorStore): void {
    const suggestion = `${editor.design.name || 'Label'} copy`;
    const name = typeof prompt === 'function' ? prompt('Save as — name for the copy:', suggestion) : suggestion;
    if (name && name.trim()) editor.saveAs(name.trim());
}

/** Open the first chosen JSON file as the current design. */
export function importLabel(editor: EditorStore, files: FileList | null): void {
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data: unknown = JSON.parse(reader.result as string);
            if (!editor.openImported(data)) {
                alert('That file is not a valid BleWebler2 label.');
            }
        } catch (e) {
            console.error('Failed to import label', e);
            alert('Could not read that file as JSON.');
        }
    };
    reader.readAsText(file);
}

/** Wipe the canvas after confirming — there is no undo for this. */
export function clearCanvas(editor: EditorStore): void {
    if (confirm('Are you sure you want to clear the canvas? This cannot be undone.')) {
        editor.newDesign(editor.design.heightPx);
    }
}
