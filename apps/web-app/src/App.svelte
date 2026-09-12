<script lang="ts">
    /**
     * Web / Capacitor shell. Owns platform detection and the transport menu;
     * everything else is the shared designer from universal-label-ui.
     */
    import { Capacitor } from '@capacitor/core';
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
    import { CapacitorBleTransport } from 'universal-label-core/transport/capacitor';
    import { CapacitorUsbTransport } from 'universal-label-core/transport/capacitor-usb';
    import { CapacitorClassicTransport } from 'universal-label-core/transport/capacitor-classic';

    const editor = new EditorStore();
    const session = new PrinterSession();
    const privacyUrl = `${import.meta.env.BASE_URL}privacy.html`;

    const isNative = Capacitor.isNativePlatform();
    const hasWebBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
    const hasWebUsb = typeof navigator !== 'undefined' && 'usb' in navigator;
    const hasWebSerial = typeof navigator !== 'undefined' && 'serial' in navigator;
    const secure = typeof window !== 'undefined' && window.isSecureContext;

    const transports: TransportOption[] = [
        ...(isNative
            ? [{
                  id: 'capacitor-ble',
                  label: 'Bluetooth LE (native)',
                  description: 'Scan for BLE label printers',
                  available: true,
                  create: () => new CapacitorBleTransport()
              }, {
                  id: 'capacitor-classic',
                  label: 'Bluetooth Classic (native)',
                  description: 'Connect to one paired RFCOMM/SPP printer',
                  available: Capacitor.getPlatform() === 'android',
                  unavailableReason: 'Native Bluetooth Classic printing is currently Android-only.',
                  create: () => new CapacitorClassicTransport()
              }, {
                  id: 'capacitor-usb',
                  label: 'USB serial (native)',
                  description: 'Connect to one attached USB serial printer',
                  available: Capacitor.getPlatform() === 'android',
                  unavailableReason: 'Native USB serial printing is currently Android-only.',
                  create: () => new CapacitorUsbTransport()
              }]
            : [
                  {
                      id: 'web-bluetooth',
                      label: 'Bluetooth',
                      description: 'Web Bluetooth device chooser',
                      available: hasWebBluetooth && secure,
                      unavailableReason: !secure
                          ? 'Web Bluetooth needs HTTPS or localhost.'
                          : 'This browser has no Web Bluetooth support.',
                      create: () => new UniversalBluetoothTransport()
                  },
                  {
                      id: 'web-usb',
                      label: 'USB',
                      description: 'WebUSB device chooser',
                      available: hasWebUsb && secure,
                      unavailableReason: !secure
                          ? 'WebUSB needs HTTPS or localhost.'
                          : 'This browser has no WebUSB support.',
                      create: () => new WebUsbTransport()
                  },
                  {
                      id: 'web-serial',
                      label: 'Serial / Bluetooth Classic',
                      description: 'Web Serial device chooser',
                      available: hasWebSerial && secure,
                      unavailableReason: !secure
                          ? 'Web Serial needs HTTPS or localhost.'
                          : 'This browser has no Web Serial support.',
                      create: () => new WebSerialTransport()
                  }
              ]),
        {
            id: 'dummy',
            label: 'Virtual printer',
            description: 'No hardware — prints a bitmap preview to the browser console',
            available: true,
            isDummy: true,
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
        <p class="aside">
            BleWebler2 shows compatible models in the printer selection flow.
        </p>
    </section>
{/snippet}

<DesignerApp
    {editor}
    {session}
    {transports}
    extraTabs={[{ id: 'hardware', label: 'Hardware', content: hardwareTab, fullBleed: true }]}
    title="BleWebler2"
/>

<a class="privacy-link" href={privacyUrl}>Privacy</a>

<style>
    .hardware-link {
        max-width: 46rem;
        margin: 0 auto;
        padding: 3rem 1.5rem;
    }

    .hardware-link h1 {
        margin: 0 0 0.75rem;
        font-size: 1.5rem;
    }

    .hardware-link p {
        color: var(--muted);
        line-height: 1.6;
        margin: 0 0 1.25rem;
    }

    .hardware-link .btn {
        display: inline-block;
        padding: 0.6rem 1.1rem;
        border-radius: 2px;
        background: var(--accent, #0f5c9c);
        color: #fff;
        text-decoration: none;
        font-weight: 600;
    }

    .hardware-link .aside {
        margin-top: 1.5rem;
        font-size: 0.9rem;
    }

    .privacy-link {
        position: fixed;
        right: max(12px, env(safe-area-inset-right));
        bottom: max(8px, env(safe-area-inset-bottom));
        z-index: 40;
        padding: 4px 7px;
        border-radius: 5px;
        background: color-mix(in srgb, var(--panel, #fff) 88%, transparent);
        color: var(--muted, #5f6875);
        font-size: 11px;
        line-height: 1;
        text-decoration: none;
        opacity: 0.72;
    }

    .privacy-link:hover,
    .privacy-link:focus-visible {
        opacity: 1;
        text-decoration: underline;
    }

    /* The editor owns the viewport edges for its inspector and sheet actions.
       Privacy remains available from every document-style app page without
       floating over controls while a design is open. */
    :global(body:has(.app.mode-editor)) .privacy-link {
        display: none;
    }

</style>
