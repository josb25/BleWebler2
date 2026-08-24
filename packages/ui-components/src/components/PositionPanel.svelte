<script lang="ts">
    /**
     * One unified control for where an element sits.
     *
     * Both coordinates read the same way — *my* edge sits a distance from
     * *their* edge, where "they" is the label or any other element — so
     * alignment, offsets and element-relative positioning are no longer three
     * separate ideas. Aligning is just "distance 0", which is what the quick
     * buttons set.
     */
    import type { EditorStore, AxisPos } from '../stores/editor.svelte';
    import type { ConstraintAxis } from 'universal-label-renderer';
    import { isValidExpr } from 'universal-label-renderer';
    import Icon from './Icon.svelte';

    interface Props { editor: EditorStore; }
    let { editor }: Props = $props();

    const el = $derived(editor.selected);
    const targets = $derived(editor.constraintTargets(editor.selectedId));

    const AXES: Array<{ axis: ConstraintAxis; label: string }> = [
        { axis: 'x', label: 'Horizontal' },
        { axis: 'y', label: 'Vertical' }
    ];

    /** Edge names read differently per axis, so name them properly. */
    function pointLabel(pos: AxisPos, axis: ConstraintAxis, mine: boolean): string {
        const noun = mine ? '' : '';
        if (axis === 'x') return pos === 'start' ? `left${noun}` : pos === 'end' ? `right${noun}` : 'centre';
        return pos === 'start' ? `top${noun}` : pos === 'end' ? `bottom${noun}` : 'middle';
    }
    const POSITIONS: AxisPos[] = ['start', 'center', 'end'];

    function unitOf(d: unknown): 'px' | 'mm' | '%' | 'expr' {
        if (d && typeof d === 'object') {
            if ('u' in (d as Record<string, unknown>)) return (d as { u: 'px' | 'mm' | '%' }).u;
            if ('e' in (d as Record<string, unknown>)) return 'expr';
        }
        return 'px';
    }
    function valueOf(d: unknown): number {
        if (d && typeof d === 'object' && 'u' in (d as Record<string, unknown>)) return (d as { v: number }).v;
        return typeof d === 'number' ? d : 0;
    }
    function exprOf(d: unknown): string {
        return d && typeof d === 'object' && 'src' in (d as Record<string, unknown>)
            ? String((d as { src?: string }).src ?? '') : '';
    }

    /** Build a distance Dim of the requested unit, keeping the current amount. */
    function dimOf(unit: 'px' | 'mm' | '%' | 'expr', amount: number, axis: ConstraintAxis, prevExpr: string) {
        if (unit === '%') return { u: '%' as const, v: amount, of: axis === 'x' ? ('w' as const) : ('h' as const) };
        if (unit === 'expr') return { src: prevExpr || String(Math.round(amount)) };
        return { u: unit, v: amount };
    }
</script>

{#if el}
    <div class="pos-block">
        {#each AXES as { axis, label } (axis)}
            {@const rule = editor.axisRule(el.id, axis)}
            {#if rule}
                {@const frozen = editor.axisLocked(el.id, axis)}
                <div class="axis" class:frozen>
                    <div class="axis-head">
                        <span class="axis-name">{label}</span>
                        <span class="spacer"></span>
                        <!-- Quick align = pin my edge to theirs at zero distance.
                             Desktop hides these (.quick): the rule rows below say
                             the same thing and having both reads as two systems. -->
                        <span class="quick">
                            {#each POSITIONS as p (p)}
                                <button
                                    class="q"
                                    disabled={frozen}
                                    class:on={rule.myPoint === p && rule.refPoint === p && valueOf(rule.distance) === 0 && unitOf(rule.distance) !== 'expr'}
                                    title="Align {pointLabel(p, axis, true)}"
                                    onclick={() => editor.setAxisRule(el.id, axis, { myPoint: p, refPoint: p, distance: { u: 'px', v: 0 } })}
                                >{pointLabel(p, axis, true)}</button>
                            {/each}
                        </span>
                        <button
                            class="lock"
                            class:on={frozen}
                            aria-pressed={frozen}
                            title={frozen ? `Unlock the ${label.toLowerCase()} axis` : `Lock the ${label.toLowerCase()} axis — freezes this coordinate while dragging`}
                            onclick={() => editor.toggleAxisLock(el.id, axis)}
                        ><Icon name={frozen ? 'lock' : 'unlock'} size={13} /></button>
                    </div>

                    <!-- One disabled fieldset freezes every control at once. -->
                    <fieldset class="rules" disabled={frozen}>
                    <div class="rule">
                        <span class="w">my</span>
                        <select value={rule.myPoint} onchange={e => editor.setAxisRule(el.id, axis, { myPoint: e.currentTarget.value as AxisPos })}>
                            {#each POSITIONS as p (p)}<option value={p}>{pointLabel(p, axis, true)}</option>{/each}
                        </select>
                        <span class="w">from</span>
                        <select
                            class="ref"
                            value={rule.refElement ?? ''}
                            onchange={e => editor.setAxisRule(el.id, axis, { refElement: e.currentTarget.value || undefined })}
                        >
                            <option value="">the label</option>
                            {#each targets as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
                        </select>
                        <select value={rule.refPoint} onchange={e => editor.setAxisRule(el.id, axis, { refPoint: e.currentTarget.value as AxisPos })}>
                            {#each POSITIONS as p (p)}<option value={p}>{pointLabel(p, axis, false)}</option>{/each}
                        </select>
                    </div>

                    <div class="rule">
                        <span class="w">by</span>
                        {#if unitOf(rule.distance) === 'expr'}
                            <input
                                class="expr" class:bad={!isValidExpr(exprOf(rule.distance))}
                                type="text" value={exprOf(rule.distance)} placeholder="W - 4*mm"
                                oninput={e => editor.setAxisRule(el.id, axis, { distance: { src: e.currentTarget.value } as never })}
                            />
                        {:else}
                            <input
                                class="num" type="number" step={unitOf(rule.distance) === 'mm' ? 0.5 : 1}
                                value={valueOf(rule.distance)}
                                onchange={e => editor.setAxisRule(el.id, axis, { distance: dimOf(unitOf(rule.distance), Number(e.currentTarget.value), axis, '') as never })}
                            />
                        {/if}
                        <select
                            class="unit"
                            value={unitOf(rule.distance)}
                            onchange={e => editor.setAxisRule(el.id, axis, { distance: dimOf(e.currentTarget.value as 'px', valueOf(rule.distance), axis, exprOf(rule.distance)) as never })}
                        >
                            <option value="px">px</option>
                            <option value="mm">mm</option>
                            <option value="%">%</option>
                            <option value="expr">ƒx</option>
                        </select>
                        <span class="spacer"></span>
                        <label class="stretch" title="Pin the opposite edge too, so the element stretches">
                            <input type="checkbox" checked={!!rule.stretch} onchange={e => editor.setAxisStretch(el.id, axis, e.currentTarget.checked)} />
                            stretch
                        </label>
                    </div>

                    {#if rule.stretch}
                        <div class="rule sub">
                            <span class="w">and my</span>
                            <select value={rule.stretch.myPoint} onchange={e => editor.setAxisRule(el.id, axis, { stretch: { ...rule.stretch!, myPoint: e.currentTarget.value as AxisPos } })}>
                                {#each POSITIONS as p (p)}<option value={p}>{pointLabel(p, axis, true)}</option>{/each}
                            </select>
                            <span class="w">from</span>
                            <select
                                class="ref"
                                value={rule.stretch.refElement ?? ''}
                                onchange={e => editor.setAxisRule(el.id, axis, { stretch: { ...rule.stretch!, refElement: e.currentTarget.value || undefined } })}
                            >
                                <option value="">the label</option>
                                {#each targets as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
                            </select>
                            <select value={rule.stretch.refPoint} onchange={e => editor.setAxisRule(el.id, axis, { stretch: { ...rule.stretch!, refPoint: e.currentTarget.value as AxisPos } })}>
                                {#each POSITIONS as p (p)}<option value={p}>{pointLabel(p, axis, false)}</option>{/each}
                            </select>
                            <input
                                class="num" type="number" step={unitOf(rule.stretch.distance) === 'mm' ? 0.5 : 1}
                                value={valueOf(rule.stretch.distance)}
                                onchange={e => editor.setAxisRule(el.id, axis, { stretch: { ...rule.stretch!, distance: dimOf(unitOf(rule.stretch!.distance), Number(e.currentTarget.value), axis, '') as never } })}
                            />
                            <span class="w">{unitOf(rule.stretch.distance)}</span>
                        </div>
                    {/if}
                    </fieldset>
                </div>
            {/if}
        {/each}
        <span class="hint"><Icon name="info" size={12} /> Aligning is simply a distance of 0. “Stretch” pins both edges, so the element resizes to fit.</span>
    </div>
{/if}

<style>
    .pos-block { display: flex; flex-direction: column; gap: 8px; }
    .axis {
        display: flex;
        flex-direction: column;
        gap: 5px;
        padding: 7px 8px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--panel-2);
    }
    .axis-head { display: flex; align-items: center; gap: 4px; }
    .axis-name { font-size: 12px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .spacer { flex: 1; }
    /* The fieldset is purely a disabled-group wrapper — strip its chrome. */
    .rules {
        display: flex;
        flex-direction: column;
        gap: 5px;
        margin: 0;
        padding: 0;
        border: 0;
        min-width: 0;
    }
    .rules:disabled { opacity: 0.5; }
    .lock {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 2px 6px;
        border-radius: 6px;
        background: var(--panel);
        color: var(--muted);
        box-shadow: none;
    }
    .lock:hover { transform: none; }
    .lock.on { background: var(--accent); color: var(--accent-fg, #fff); border-color: transparent; }
    .axis.frozen { border-style: dashed; }
    .quick { display: contents; }
    .q {
        min-height: 24px;
        padding: 2px 8px;
        font-size: 11px;
        border-radius: 6px;
        background: var(--panel);
        box-shadow: none;
    }
    .q:hover { transform: none; }
    .q.on { background: var(--accent); color: var(--accent-fg, #fff); border-color: transparent; }
    .rule { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
    .rule.sub { padding-left: 10px; border-left: 2px solid var(--border); }
    .rule select { padding: 3px 5px; font-size: 12px; }
    .rule .ref { max-width: 130px; }
    .w { font-size: 12px; color: var(--muted); }
    .num { width: 62px; }
    .unit { width: 54px; }
    .expr { flex: 1; min-width: 110px; font-family: ui-monospace, monospace; font-size: 12px; }
    .expr.bad { border-color: var(--danger); box-shadow: 0 0 0 2px color-mix(in srgb, var(--danger) 25%, transparent); }
    .stretch { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--muted); }
    .hint { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--muted); }

    /* Desktop has room for the explicit rule rows and a pointer to drive them,
       so the quick-align shortcuts only clutter it — they earn their space on
       the mobile panel, where the selects are fiddly. Same 860px breakpoint the
       editor layout uses. */
    @media (min-width: 860px) {
        .quick { display: none; }
    }
</style>
