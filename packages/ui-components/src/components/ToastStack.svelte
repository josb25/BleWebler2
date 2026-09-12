<script lang="ts">
    /** Auto-dismissing toast notifications. */
    import { getToasts, dismiss } from '../stores/toasts.svelte';

    const items = $derived(getToasts());
</script>

{#if items.length > 0}
    <div class="toast-stack">
        {#each items as t (t.id)}
            <div class="toast {t.kind}" role="status">
                <span>{t.message}</span>
                <button type="button" class="dismiss" aria-label="Dismiss notification" onclick={() => dismiss(t.id)}>×</button>
            </div>
        {/each}
    </div>
{/if}

<style>
    .toast-stack {
        position: fixed;
        bottom: calc(16px + env(safe-area-inset-bottom));
        left: 50%;
        transform: translateX(-50%);
        z-index: 80;
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: center;
        pointer-events: none;
    }
    .toast {
        pointer-events: auto;
        padding: 10px 18px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 4px 12px rgb(0 0 0 / 25%);
        max-width: 90vw;
        text-align: center;
        animation: toast-in 0.15s ease-out;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .toast.info {
        background: var(--panel);
        color: var(--text);
        border: 1px solid var(--border);
    }
    .toast.success {
        background: var(--ok);
        color: #fff;
    }
    .toast.error {
        background: var(--danger);
        color: #fff;
    }
    .dismiss {
        min-width: 24px;
        min-height: 24px;
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        line-height: 1;
        cursor: pointer;
    }
    @keyframes toast-in {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
    }
</style>
