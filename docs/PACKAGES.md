# Package architecture

BleWebler2 publishes reusable, UI-independent layers while keeping the product interface free to evolve with the application.

| Package | Public | Responsibility |
| --- | :---: | --- |
| `universal-label-core` | Yes | All first-party printer drivers, driver contracts, transports, and print orchestration |
| `universal-label-renderer` | Yes | ULT parsing, validation, adaptive layout, and rasterization |
| `universal-label-template` | Yes | Versioned ULT specification and conformance examples |
| `universal-label-ui` | No | Shared Svelte interface used by BleWebler2 applications |

## Why drivers stay together

Manufacturers are implementations behind one printer contract, not separate products. Keeping first-party drivers in core gives applications one dependency, keeps matching and capability behavior consistent, and ensures a core release tests every supported driver against the same job model. The extension interface remains public for community experiments, but BleWebler2 does not require users to assemble its official hardware support from separate packages.

## Runtime boundaries

Transport entry points are exposed as `universal-label-core/transport/*`. Browser transports require no native dependency. Node and Capacitor bindings are optional peer dependencies, so installing core for Web Bluetooth does not install Noble, USB, SerialPort, or Capacitor.

The renderer emits a framework-neutral ESM distribution with declarations. Its bitmap fonts are split into lazy chunks and its bundled starter templates are derived from the ULT conformance package. The Svelte UI remains private and may consume source workspaces inside this repository.

## Release discipline

The three public packages use the same release version. Before publishing, run:

```sh
npm ci
npm run check
npm test
npm run packages:check
```

`packages:check` builds the public artifacts, inspects their npm tarballs, rejects source/test leakage and local `file:` dependencies, and confirms that the UI remains private. Publishing is deliberately not automated until the npm package names and trusted publisher are configured by the repository owner.
