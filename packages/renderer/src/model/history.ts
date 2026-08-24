/**
 * Bounded undo/redo over immutable snapshots.
 * The editor pushes a snapshot per discrete operation (add, delete, drag end,
 * committed property edit) — not per keystroke of a drag.
 */
const MAX_DEPTH = 50;

export class History<T> {
    private past: T[] = [];
    private future: T[] = [];

    get canUndo(): boolean { return this.past.length > 0; }
    get canRedo(): boolean { return this.future.length > 0; }

    /** Record the state as it was *before* a change is applied. */
    push(snapshot: T): void {
        this.past.push(snapshot);
        if (this.past.length > MAX_DEPTH) this.past.shift();
        this.future = [];
    }

    undo(current: T): T | undefined {
        const prev = this.past.pop();
        if (prev) this.future.push(current);
        return prev;
    }

    redo(current: T): T | undefined {
        const next = this.future.pop();
        if (next) this.past.push(current);
        return next;
    }

    clear(): void {
        this.past = [];
        this.future = [];
    }
}
