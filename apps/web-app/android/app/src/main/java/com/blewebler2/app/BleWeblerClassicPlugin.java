package com.blewebler2.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(
    name = "BleWeblerClassic",
    permissions = @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT })
)
public class BleWeblerClassicPlugin extends Plugin {
    private static final UUID SERIAL_PORT = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private final Object socketLock = new Object();
    private BluetoothSocket socket;
    private InputStream input;
    private OutputStream output;

    @PluginMethod
    public void listDevices(PluginCall call) {
        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null) {
                call.reject("Bluetooth is not available on this device.");
                return;
            }
            Set<BluetoothDevice> bonded = adapter.getBondedDevices();
            JSArray devices = new JSArray();
            for (BluetoothDevice device : bonded) {
                JSObject item = new JSObject();
                item.put("name", device.getName() == null ? device.getAddress() : device.getName());
                item.put("address", device.getAddress());
                devices.put(item);
            }
            JSObject result = new JSObject();
            result.put("devices", devices);
            call.resolve(result);
        } catch (SecurityException error) {
            call.reject("Bluetooth permission is required.", error);
        }
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String address = call.getString("address");
        if (address == null || address.isBlank()) {
            call.reject("A Bluetooth device address is required.");
            return;
        }
        boolean insecure = Boolean.TRUE.equals(call.getBoolean("insecure", false));
        execute(() -> {
            try {
                closeSocket();
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null || !adapter.isEnabled()) {
                    call.reject("Bluetooth is not enabled.");
                    return;
                }
                BluetoothDevice device = adapter.getRemoteDevice(address);
                BluetoothSocket opened = insecure
                    ? device.createInsecureRfcommSocketToServiceRecord(SERIAL_PORT)
                    : device.createRfcommSocketToServiceRecord(SERIAL_PORT);
                opened.connect();
                synchronized (socketLock) {
                    socket = opened;
                    input = opened.getInputStream();
                    output = opened.getOutputStream();
                }
                startReader(opened);
                call.resolve();
            } catch (Exception error) {
                closeSocket();
                call.reject("Could not connect to the Bluetooth Classic printer.", error);
            }
        });
    }

    @PluginMethod
    public void write(PluginCall call) {
        String encoded = call.getString("data");
        if (encoded == null) {
            call.reject("Base64 print data is required.");
            return;
        }
        execute(() -> {
            try {
                OutputStream stream;
                synchronized (socketLock) { stream = output; }
                if (stream == null) {
                    call.reject("Bluetooth Classic is not connected.");
                    return;
                }
                stream.write(Base64.decode(encoded, Base64.DEFAULT));
                stream.flush();
                call.resolve();
            } catch (Exception error) {
                call.reject("Bluetooth Classic write failed.", error);
            }
        });
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        closeSocket();
        call.resolve();
    }

    private void startReader(BluetoothSocket opened) {
        execute(() -> {
            byte[] buffer = new byte[4096];
            try {
                while (true) {
                    InputStream stream;
                    synchronized (socketLock) {
                        if (socket != opened) return;
                        stream = input;
                    }
                    int count = stream.read(buffer);
                    if (count < 0) throw new IOException("Bluetooth stream closed.");
                    if (count == 0) continue;
                    JSObject event = new JSObject();
                    event.put("data", Base64.encodeToString(buffer, 0, count, Base64.NO_WRAP));
                    notifyListeners("data", event);
                }
            } catch (Exception error) {
                synchronized (socketLock) {
                    if (socket != opened) return;
                }
                closeSocket();
                JSObject failure = new JSObject();
                failure.put("message", error.getMessage() == null ? "Bluetooth connection closed." : error.getMessage());
                notifyListeners("error", failure);
                notifyListeners("disconnected", new JSObject());
            }
        });
    }

    private void closeSocket() {
        BluetoothSocket closing;
        synchronized (socketLock) {
            closing = socket;
            socket = null;
            input = null;
            output = null;
        }
        if (closing != null) {
            try { closing.close(); } catch (IOException ignored) { }
        }
    }

    @Override
    protected void handleOnDestroy() {
        closeSocket();
        super.handleOnDestroy();
    }
}
