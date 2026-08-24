/**
 * Web / Capacitor app entry point: mounts the Svelte shell.
 * All designer logic lives in `universal-label-ui`; printing goes through
 * `universal-label-core`'s PrintManager.
 */
import { mount } from 'svelte';
import App from './App.svelte';

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing in index.html');

mount(App, { target: root });

/**
 * Register the service worker that makes the app installable and usable
 * offline. Production only: in dev it would serve stale modules and fight HMR.
 * Capacitor runs from a local scheme where it is unnecessary, and registration
 * simply no-ops there.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(err => {
            console.warn('[pwa] service worker registration failed:', err);
        });
    });
}
