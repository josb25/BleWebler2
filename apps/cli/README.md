# BleWebler2 CLI

The CLI validates a ULT 1.0 template, resolves it for a target label, renders it
with the same pipeline as the designer, and prints it through a local transport.
It uses the virtual printer unless a hardware transport is explicitly selected.

From the repository root:

    npm run cli -- --help
    npm run cli -- --template packages/ult/examples/asset-tag.ult.json --validate
    npm run cli -- --template packages/ult/examples/asset-tag.ult.json
    npm run cli -- --list --transport ble
    npm run cli -- --template label.ult.json --transport ble --device-id <exact-id>

USB and serial/RFCOMM are available through `--transport usb` and
`--transport serial`. Pass an exact serial path whenever more than one port is
present.

`--validate` is hardware-free. It runs the strict ULT import gate, checks that
human-readable expression sources still match their stored ASTs, and resolves
the template across its adaptive size matrix. Repeat `--param name=value` to
check non-default field values.
