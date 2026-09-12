/**
 * Minimal toast notification store.
 *
 * Messages auto-dismiss after 4s. A caller that needs the user to act
 * (e.g. confirm a destructive change) should use a dialog, not a toast.
 */

export interface Toast {
    id: number;
    message: string;
    kind: 'info' | 'success' | 'error';
}

let nextId = 0;
let toasts = $state<Toast[]>([]);

export function toast(message: string, kind: Toast['kind'] = 'info'): void {
    const id = ++nextId;
    toasts = [...toasts, { id, message, kind }];
    setTimeout(() => dismiss(id), 4000);
}

export function dismiss(id: number): void {
    toasts = toasts.filter(t => t.id !== id);
}

export function getToasts(): Toast[] {
    return toasts;
}
