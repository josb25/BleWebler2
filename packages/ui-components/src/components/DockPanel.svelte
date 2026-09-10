<script lang="ts">
    /**
     * One panel in the right-hand dock: a title bar that folds the body away,
     * Photoshop-style. Several stack vertically; an open panel marked `grow`
     * takes the spare height, the others keep to their content.
     */
    import type { Snippet } from 'svelte';

    interface Props {
        title: string;
        open: boolean;
        ontoggle: () => void;
        children: Snippet;
        /** Take the dock's spare height while open. */
        grow?: boolean;
        /** A count or short note beside the title. */
        badge?: string | number;
    }
    let { title, open, ontoggle, children, grow = false, badge }: Props = $props();
</script>

<section class="dock-panel" class:open class:grow>
    <button type="button" class="dock-head" onclick={ontoggle} aria-expanded={open}>
        <span class="tri" class:open aria-hidden="true"></span>
        <span class="dock-title">{title}</span>
        {#if badge !== undefined}<span class="dock-badge">{badge}</span>{/if}
    </button>
    {#if open}
        <div class="dock-body">{@render children()}</div>
    {/if}
</section>

<style>
    .dock-panel {
        display: flex;
        flex-direction: column;
        min-height: 0;
        flex: 0 0 auto;
        border-bottom: 1px solid var(--border);
    }
    .dock-panel.open.grow { flex: 1 1 0; }
    /* An open panel that is not the growing one still needs a bounded share,
       or a long layer list would push the properties off the bottom. */
    .dock-panel.open:not(.grow) { flex: 0 1 42%; }
    .dock-head {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        min-height: 30px;
        padding: 4px 10px;
        border: none;
        border-radius: 0;
        background: var(--panel-2);
        color: var(--text);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        box-shadow: none;
        justify-content: flex-start;
    }
    .dock-head:hover { transform: none; box-shadow: none; background: var(--panel-2); color: var(--accent); }
    .tri {
        width: 0;
        height: 0;
        border-left: 5px solid currentColor;
        border-top: 4px solid transparent;
        border-bottom: 4px solid transparent;
        transition: transform 0.12s ease;
        opacity: 0.7;
    }
    .tri.open { transform: rotate(90deg); }
    .dock-title { flex: 1; text-align: left; }
    .dock-badge {
        font-weight: 600;
        font-size: 11px;
        color: var(--muted);
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 99px;
        padding: 0 7px;
        line-height: 16px;
        text-transform: none;
    }
    .dock-body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 12px 14px;
        scrollbar-width: thin;
    }
</style>
