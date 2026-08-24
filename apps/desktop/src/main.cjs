const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

let mainWindow;
let bluetoothChoice;
let usbChoice;
let serialChoice;

const rendererDirectory = path.resolve(__dirname, '../dist');

function isTrustedLocation(raw) {
    try {
        const url = new URL(raw);
        if (url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)) return true;
        if (url.protocol !== 'file:') return false;
        const requested = path.resolve(fileURLToPath(url));
        const fromRenderer = path.relative(rendererDirectory, requested);
        return fromRenderer === '' || (!fromRenderer.startsWith('..') && !path.isAbsolute(fromRenderer));
    } catch {
        return false;
    }
}

function cancelPendingChoices() {
    bluetoothChoice?.('');
    usbChoice?.();
    serialChoice?.('');
    bluetoothChoice = undefined;
    usbChoice = undefined;
    serialChoice = undefined;
}

function configureDeviceAccess(window) {
    const allowedPermissions = new Set(['usb', 'serial']);
    const ses = session.defaultSession;
    const isAppContents = contents => contents === window.webContents && isTrustedLocation(contents.getURL());

    ses.setPermissionCheckHandler((contents, permission) =>
        contents !== null && isAppContents(contents) && allowedPermissions.has(permission));
    ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

    window.webContents.on('select-bluetooth-device', (event, devices, callback) => {
        event.preventDefault();
        bluetoothChoice = callback;
        window.webContents.send('bluetooth-device-list', devices.map(device => ({
            deviceId: device.deviceId,
            deviceName: device.deviceName
        })));
    });

    ses.on('select-usb-device', (event, details, callback) => {
        event.preventDefault();
        if (details.frame !== window.webContents.mainFrame) {
            callback();
            return;
        }
        usbChoice = callback;
        window.webContents.send('usb-device-list', details.deviceList.map(device => ({
            deviceId: device.deviceId,
            productName: device.productName,
            vendorId: device.vendorId,
            productId: device.productId
        })));
    });

    ses.on('select-serial-port', (event, ports, contents, callback) => {
        event.preventDefault();
        if (!isAppContents(contents)) {
            callback('');
            return;
        }
        serialChoice = callback;
        window.webContents.send('serial-device-list', ports.map(port => ({
            portId: port.portId,
            displayName: port.displayName,
            portName: port.portName,
            vendorId: port.vendorId,
            productId: port.productId
        })));
    });
}

function registerChoiceHandlers() {
    ipcMain.on('choose-bluetooth-device', (_event, deviceId) => {
        bluetoothChoice?.(deviceId);
        bluetoothChoice = undefined;
    });
    ipcMain.on('cancel-bluetooth-device', () => {
        bluetoothChoice?.('');
        bluetoothChoice = undefined;
    });
    ipcMain.on('choose-usb-device', (_event, deviceId) => {
        usbChoice?.(deviceId);
        usbChoice = undefined;
    });
    ipcMain.on('cancel-usb-device', () => {
        usbChoice?.();
        usbChoice = undefined;
    });
    ipcMain.on('choose-serial-device', (_event, portId) => {
        serialChoice?.(portId);
        serialChoice = undefined;
    });
    ipcMain.on('cancel-serial-device', () => {
        serialChoice?.('');
        serialChoice = undefined;
    });
}

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1180,
        height: 820,
        minWidth: 720,
        minHeight: 560,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
        }
    });

    configureDeviceAccess(mainWindow);
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://github.com/') || url.startsWith('https://josb25.github.io/opentlp/')) {
            void shell.openExternal(url);
        }
        return { action: 'deny' };
    });
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!isTrustedLocation(url)) event.preventDefault();
    });
    mainWindow.on('closed', () => {
        cancelPendingChoices();
        mainWindow = undefined;
    });

    const developmentUrl = process.env.ELECTRON_RENDERER_URL;
    if (developmentUrl) await mainWindow.loadURL(developmentUrl);
    else await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
    app.whenReady().then(async () => {
        registerChoiceHandlers();
        await createWindow();
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
