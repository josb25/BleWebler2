// Vite injects import.meta.env and import.meta.glob at build time; this mirrors
// the bits we use so svelte-check works without a vite dependency in this package.
interface ImportMeta {
    readonly env: {
        readonly DEV: boolean;
    };
}
