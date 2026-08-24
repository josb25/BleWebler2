// universal-label-ui — the Svelte layer, consumed by the app shells.
//
// Everything format-related (the ULT template engine, layout and
// rasterization) lives in `universal-label-renderer` and is re-exported here,
// so an app can depend on this one package for the whole editor. Headless
// services should depend on the renderer directly instead — it has no Svelte.

export * from 'universal-label-renderer';

// Printer session (Svelte-store shaped, so it lives with the UI).
export { PrinterSession, DUMMY_PROFILES, type DummyProfile, type PrinterSnapshot, type PrinterState } from './printer/session';
export type { TransportOption } from './printer/transports';

// Reactive stores + components
export { EditorStore } from './stores/editor.svelte';
export { TemplateSession } from './stores/templates.svelte';
export { default as DesignerApp } from './components/DesignerApp.svelte';
export { default as Icon, type IconName } from './components/Icon.svelte';
// Driver artwork, for shells that want a printer in their own chrome.
export { default as PrinterMark } from './components/PrinterMark.svelte';
export { default as PrinterArtworkView } from './components/PrinterArtworkView.svelte';
export { artworkFor, artworkForDevice, type NamedModel } from './data/artwork';
