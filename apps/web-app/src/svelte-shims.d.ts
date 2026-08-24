/// <reference types="vite/client" />
// ^ types `import.meta.env` (used for the PROD-only service-worker registration).

// Minimal shim so `tsc -b` accepts .svelte imports; full component
// type-checking happens via `svelte-check` in universal-label-ui.
declare module '*.svelte' {
    import type { Component } from 'svelte';
    const component: Component<Record<string, unknown>>;
    export default component;
}
