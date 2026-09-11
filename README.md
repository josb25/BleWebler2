<div align="center">
  <img src="apps/web-app/public/icon-192.png" width="96" height="96" alt="BleWebler2 icon">
  <h1>BleWebler2</h1>
  <p><strong>Design once. Print locally. Keep the printer interchangeable.</strong></p>
  <p>A local-first label designer with adaptive templates, a printer-agnostic driver layer, and browser, Capacitor, and Node.js transports.</p>
  <p>
    <a href="https://github.com/josb25/BleWebler2/actions/workflows/ci.yml"><img src="https://github.com/josb25/BleWebler2/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2563eb.svg" alt="MIT licence"></a>
    <a href="https://josb25.github.io/BleWebler2/"><img src="https://img.shields.io/badge/open-web_app-7c3aed.svg" alt="Open web app"></a>
  </p>
</div>

# [**Try BleWebler2 here →**](https://josb25.github.io/BleWebler2/)

## Why BleWebler2

Most label software binds the design to one printer, one operating system, or one vendor cloud. BleWebler2 separates those concerns:

- **[Universal Label Templates](packages/ult)** resize and reflow for the selected label instead of storing one fixed bitmap.
- **Printer-agnostic jobs** keep rendering independent from the device protocol.
- **Local-first operation** keeps designs and print data on the device; no account or server is required.
- **Real output preview** uses the same raster pipeline as printing, including monochrome and multi-plane output.
- **Installable web app** works offline after the first successful load.
- **Eight built-in templates** cover asset tags, product barcodes, safety labels, name badges, price tags, QR links, retail labels, and spine labels.

## Supported hardware

BleWebler2 includes drivers for:

| Driver | Coverage |
| --- | --- |
| Marklife | P11/P12/P15 family and compatible protocol variants |
| Niimbot | Models supported by `@mmote/niimbluelib` 0.0.1-alpha.42 |
| Catprinter / Tiny | GB/GT/YT/MX pocket printers using the `51 78` or `12 51 78` dialect (experimental) |
| Phomemo D/Q | D30/D30S/D35/D50/D110 and Q30/Q30S/Q31/Q32 rotated-raster models (experimental) |
| Phomemo M110 | M110/M110S/M120/M220 ESC/POS-derived label printers (experimental) |
| Phomemo M02 | M02/M02S/M02X/M02 Pro pocket printers using the `10 FF FE 01` wake prefix (experimental) |
| Phomemo M-series | M03/T02/M200/M221/M250/M260 raw ESC/POS-raster models (experimental) |
| Phomemo P12/A30 | P12/P12 Pro/A30 tape protocol with response-paced setup (experimental) |
| Virtual printer | Complete print workflow without physical hardware |

Compatibility can vary by model and firmware. For useful hardware reports, include the exact model, firmware version, platform, and connection type.

## Transport matrix

| Runtime | BLE | USB | Bluetooth Classic / serial |
| --- | :---: | :---: | :---: |
| Web | Web Bluetooth | WebUSB | Web Serial when exposed by the operating system |
| Capacitor Android | Native BLE | Native USB serial | Native paired RFCOMM/SPP |
| Node.js / CLI integrations | Noble | Native USB | SerialPort, including RFCOMM devices exposed as serial ports |

Browser hardware APIs require HTTPS (or localhost), a compatible browser, and an explicit user gesture. iOS WebKit does not currently expose Web Bluetooth, WebUSB, or Web Serial. The Android shell supplies native BLE, binary-safe native USB serial, and Bluetooth Classic transports. Classic printers must be paired in Android settings first; the app refuses an ambiguous match instead of choosing an arbitrary paired device.

## Quick start

Requirements: Node.js 22.12 or newer and npm 10 or newer.

    git clone https://github.com/josb25/BleWebler2.git
    cd BleWebler2
    npm ci
    npm run dev

Open the displayed localhost URL. Use the virtual printer to explore the complete workflow without granting hardware access.

To synchronize and compile the Android shell:

    npm run sync:android
    cd apps/web-app/android
    ./gradlew assembleDebug

Before submitting a change:

    npm run check
    npm test
    npm run build

## Repository layout

| Path | Purpose |
| --- | --- |
| [`apps/web-app`](apps/web-app) | Vite web app and Capacitor Android shell |
| [`apps/desktop`](apps/desktop) | Electron shell using the shared designer |
| [`apps/cli`](apps/cli) | Command-line ULT renderer and local printer client |
| [`apps/mqtt-client`](apps/mqtt-client) | Headless MQTT-to-printer service |
| [`packages/core`](packages/core) | Drivers, device discovery, transports, and print orchestration |
| [`packages/ult`](packages/ult) | ULT 1.0 specification and conformance examples |
| [`packages/renderer`](packages/renderer) | Adaptive template model, layout, validation, and rasterization |
| [`packages/ui-components`](packages/ui-components) | Svelte label designer |

The core package ships all first-party drivers together and exposes runtime-specific transports through explicit subpath exports. Native bindings are optional, so browser builds do not load or install Node.js modules they cannot use. The renderer and ULT specification are independently consumable; the Svelte UI stays an application-internal workspace package. See [package architecture](docs/PACKAGES.md).

Run the additional applications from the repository root:

    npm run desktop
    npm run cli -- --help
    npm run mqtt

## Project documents

- [ULT 1.0 specification](packages/ult/SPEC.md) — adaptive, printer-independent template format
- [AI-assisted ULT authoring skill](.agents/skills/authoring-ult-templates/SKILL.md) — agent-neutral workflow for creating and validating templates
- [Contributing](CONTRIBUTING.md) — development workflow, DCO sign-off, and provenance requirements
- [Project licence](LICENSE) — MIT licence for original project code
- [Licensing](LICENSING.md) — project, dependency, and contribution terms
- [Third-party notices](THIRD-PARTY-NOTICES.md) — bundled software, icons, and fonts
- [Package architecture](docs/PACKAGES.md) — public package boundaries and release policy
- [Driver architecture](docs/DRIVERS.md) — first-party and community driver policy

## Contributing

Bug reports, verified hardware observations, documentation, and focused patches are welcome. Contributions must be original or properly licensed and signed off under the [Developer Certificate of Origin](CONTRIBUTING.md#developer-certificate-of-origin).

## Licence

Original BleWebler2 code is available under the [MIT License](LICENSE). Bundled dependencies, icons, and fonts retain their own terms; see [Third-party notices](THIRD-PARTY-NOTICES.md).

BleWebler2 is an independent project and is not affiliated with or endorsed by Marklife, Niimbot, or their manufacturers.
