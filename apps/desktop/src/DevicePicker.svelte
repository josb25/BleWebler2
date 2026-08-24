<script lang="ts">
    import { onMount } from 'svelte';

    type Kind = 'bluetooth' | 'usb' | 'serial';
    interface Entry { id: string; label: string; }

    let kind = $state<Kind | null>(null);
    let devices = $state<Entry[]>([]);

    onMount(() => {
        const unsubscribeBluetooth = window.electronAPI.onBluetoothDeviceList(list => {
            kind = 'bluetooth';
            devices = list.map(device => ({
                id: device.deviceId,
                label: device.deviceName || device.deviceId
            }));
        });
        const unsubscribeUsb = window.electronAPI.onUsbDeviceList(list => {
            kind = 'usb';
            devices = list.map(device => ({
                id: device.deviceId,
                label: device.productName
                    || `USB ${device.vendorId?.toString(16) ?? '?'}:${device.productId?.toString(16) ?? '?'}`
            }));
        });
        const unsubscribeSerial = window.electronAPI.onSerialDeviceList(list => {
            kind = 'serial';
            devices = list.map(device => ({
                id: device.portId,
                label: device.displayName
                    || device.portName
                    || `Serial ${device.vendorId ?? '?'}:${device.productId ?? '?'}`
            }));
        });
        return () => {
            unsubscribeBluetooth();
            unsubscribeUsb();
            unsubscribeSerial();
        };
    });

    function close(): void {
        kind = null;
        devices = [];
    }

    function choose(id: string): void {
        if (kind === 'bluetooth') window.electronAPI.chooseBluetoothDevice(id);
        else if (kind === 'usb') window.electronAPI.chooseUsbDevice(id);
        else window.electronAPI.chooseSerialDevice(id);
        close();
    }

    function cancel(): void {
        if (kind === 'bluetooth') window.electronAPI.cancelBluetoothDevice();
        else if (kind === 'usb') window.electronAPI.cancelUsbDevice();
        else if (kind === 'serial') window.electronAPI.cancelSerialDevice();
        close();
    }
</script>

{#if kind}
    <div class="backdrop" role="presentation">
        <dialog class="dialog" open aria-label="Select a device">
            <h2>Select {kind === 'bluetooth' ? 'Bluetooth' : kind === 'usb' ? 'USB' : 'serial'} device</h2>
            {#if devices.length === 0}
                <p>Scanning…</p>
            {:else}
                <ul>
                    {#each devices as device (device.id)}
                        <li><button onclick={() => choose(device.id)}>{device.label}</button></li>
                    {/each}
                </ul>
            {/if}
            <button onclick={cancel}>Cancel</button>
        </dialog>
    </div>
{/if}

<style>
    .backdrop { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; background: rgb(0 0 0 / 55%); }
    .dialog { width: min(26rem, calc(100vw - 2rem)); max-height: 80vh; overflow: auto; box-sizing: border-box; padding: 1rem; border-radius: 10px; background: var(--panel, #fff); }
    h2 { margin-top: 0; font-size: 1rem; }
    ul { list-style: none; padding: 0; display: grid; gap: .5rem; }
    li button { width: 100%; text-align: left; }
</style>
