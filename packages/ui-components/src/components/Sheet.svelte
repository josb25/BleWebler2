<script lang="ts">
    /** Modal bottom sheet (mobile) / centered dialog (wide screens). */
    import type { Snippet } from 'svelte';
    import Icon from './Icon.svelte';

    interface Props {
        title: string;
        onclose: () => void;
        children: Snippet;
        /** Place a time-sensitive prompt above onboarding and ordinary sheets. */
        priority?: boolean;
        wide?: boolean;
        /** Keep category-based sheets from resizing as their content changes. */
        stable?: boolean;
    }
    let { title, onclose, children, priority = false, wide = false, stable = false }: Props = $props();

    let backdropEl = $state<HTMLDivElement | null>(null);
    let sheetEl = $state<HTMLDivElement | null>(null);
    let previouslyFocused: HTMLElement | null = null;

    function isTopmost(): boolean {
        const overlays = document.querySelectorAll<HTMLElement>('[data-sheet-overlay]');
        return overlays.length > 0 && overlays[overlays.length - 1] === backdropEl;
    }

    function onKeydown(e: KeyboardEvent): void {
        if (!isTopmost()) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopImmediatePropagation();
            onclose();
            return;
        }
        if (e.key === 'Tab' && sheetEl) {
            const focusable = sheetEl.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }

    $effect(() => {
        if (sheetEl) {
            previouslyFocused = document.activeElement as HTMLElement | null;
            const focusable = sheetEl.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            focusable?.focus();
        }
        return () => {
            previouslyFocused?.focus?.();
        };
    });
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions
     -- backdrop dismiss duplicates the explicit close button below; Escape is handled above -->
<div class="backdrop" class:priority data-sheet-overlay bind:this={backdropEl} onclick={e => { if (e.target === e.currentTarget) onclose(); }}>
    <div class="sheet" class:wide class:stable role="dialog" aria-modal="true" aria-label={title} bind:this={sheetEl}>
        <div class="head">
            <h3>{title}</h3>
            <button class="close" onclick={onclose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div class="body">
            {@render children()}
        </div>
    </div>
</div>

<style>
    .backdrop {
        position: fixed;
        inset: 0;
        background: rgb(0 0 0 / 55%);
        z-index: 50;
        display: flex;
        align-items: flex-end;
        justify-content: center;
    }
    .backdrop.priority { z-index: 110; }
    .sheet {
        background: var(--bg);
        border: 1px solid var(--border);
        border-bottom: 0;
        border-radius: 18px 18px 0 0;
        width: 100%;
        max-width: 640px;
        max-height: 85dvh;
        display: flex;
        flex-direction: column;
    }
    @media (min-width: 700px) {
        .backdrop {
            align-items: center;
        }
        .sheet {
            border-bottom: 1px solid var(--border);
            border-radius: var(--radius-panel, 16px);
            box-shadow: 8px 8px 0 rgb(0 0 0 / 20%);
        }
        .sheet.wide {
            max-width: 800px;
        }
        .sheet.stable {
            height: min(680px, 85dvh);
        }
    }
    .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px 6px;
    }
    h3 {
        margin: 0;
        font-size: 15px;
    }
    .close {
        background: none;
        border: none;
        color: var(--muted);
        font-size: 16px;
        min-height: 32px;
        padding: 4px 8px;
    }
    .body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 6px 16px calc(16px + env(safe-area-inset-bottom));
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    @media (max-width: 420px) {
        .sheet { max-height: 90dvh; }
        .sheet.stable { height: 90dvh; }
        .head { padding: 12px 12px 4px; }
        .close {
            min-width: 40px;
            min-height: 40px;
        }
        .body { padding: 6px 12px calc(12px + env(safe-area-inset-bottom)); }
        .body :global(button) {
            min-width: 0;
            max-width: 100%;
            line-height: 1.2;
            white-space: normal;
            overflow-wrap: anywhere;
        }
    }
</style>
