<script lang="ts">
    import {
        DesignerApp,
        EditorStore,
        PrinterSession,
        type TransportOption
    } from 'universal-label-ui';
    import { DummyTransport } from 'universal-label-core/transport/dummy';
    import { UniversalBluetoothTransport } from 'universal-label-core/transport/web';
    import { WebUsbTransport } from 'universal-label-core/transport/usb';
    import { WebSerialTransport } from 'universal-label-core/transport/web-serial';
    import DevicePicker from './DevicePicker.svelte';

    const editor = new EditorStore();
    const session = new PrinterSession();
    const transports: TransportOption[] = [
        {
            id: 'bluetooth', label: 'Bluetooth',
            description: 'BLE label printers', available: true,
            create: () => new UniversalBluetoothTransport()
        },
        {
            id: 'usb', label: 'USB',
            description: 'USB label printers', available: true,
            create: () => new WebUsbTransport()
        },
        {
            id: 'serial', label: 'Serial / Bluetooth Classic',
            description: 'Serial devices exposed by the operating system', available: true,
            create: () => new WebSerialTransport()
        },
        {
            id: 'dummy', label: 'Virtual printer',
            description: 'No hardware — exercises the full print pipeline',
            available: true, isDummy: true,
            create: () => new DummyTransport()
        }
    ];
</script>

{#snippet hardwareTab()}
    <section class="hardware-link">
        <h1>Hardware database</h1>
        <p>
            Explore printer specifications and compatibility notes in OpenTLP,
            the community hardware database.
        </p>
        <a href="https://josb25.github.io/opentlp/" target="_blank" rel="noopener noreferrer" class="btn">
            Open OpenTLP
        </a>
        <p class="aside">BleWebler2 shows compatible models in the printer selection flow.</p>
    </section>
{/snippet}

<DesignerApp
    {editor}
    {session}
    {transports}
    extraTabs={[{ id: 'hardware', label: 'Hardware', content: hardwareTab, fullBleed: true }]}
    title="BleWebler2 Desktop"
/>
<DevicePicker />

<style>
    .hardware-link { max-width: 46rem; margin: 0 auto; padding: 3rem 1.5rem; }
    .hardware-link h1 { margin: 0 0 0.75rem; font-size: 1.5rem; }
    .hardware-link p { color: var(--muted); line-height: 1.6; margin: 0 0 1.25rem; }
    .hardware-link .btn { display: inline-block; padding: 0.6rem 1.1rem; border-radius: 8px; background: var(--accent, #0f5c9c); color: #fff; text-decoration: none; font-weight: 600; }
    .hardware-link .aside { margin-top: 1.5rem; font-size: 0.9rem; }
</style>
