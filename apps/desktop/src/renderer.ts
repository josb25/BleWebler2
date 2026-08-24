import { mount } from 'svelte';
import DesktopApp from './DesktopApp.svelte';

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing in index.html');

if (!window.electronAPI) {
    root.textContent = 'Run this renderer through Electron with `npm run desktop`.';
} else {
    mount(DesktopApp, { target: root });
}
