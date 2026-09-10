import type { EditorStore } from './stores/editor.svelte';

/** Commands exposed through more than one input route (menu, button, shortcut). */
export interface EditorCommands {
    save: () => void;
    undo: () => void;
    redo: () => void;
    print: () => void;
    settings: () => void;
}

/**
 * Keep shared editor commands behind one execution path so visible controls,
 * menus and keyboard shortcuts cannot drift apart as the chrome evolves.
 */
export function createEditorCommands(
    editor: EditorStore,
    navigation: Pick<EditorCommands, 'print' | 'settings'>
): EditorCommands {
    return {
        save: () => editor.save(),
        undo: () => editor.undo(),
        redo: () => editor.redo(),
        print: navigation.print,
        settings: navigation.settings
    };
}
