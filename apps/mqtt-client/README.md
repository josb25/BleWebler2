# BleWebler2 MQTT client

This headless service subscribes to `<prefix>/print`, validates a small JSON
job, loads a named ULT file from one configured directory, and publishes job
state to `<prefix>/status`. Jobs run sequentially. The service does not accept
arbitrary file paths or raw bitmap payloads.

The default broker is `mqtt://127.0.0.1:1883` and the default printer is the
virtual printer. Configure it with the variables documented in `.env.example`,
then run from the repository root:

    npm run mqtt

Validate the local configuration without connecting to a broker or printer:

    npm run mqtt -- --check

Show command usage:

    npm run mqtt -- --help

Example job on `blewebler2/print`:

```json
{
  "jobId": "shelf-42",
  "templateId": "asset-tag",
  "params": { "asset": "AB-1234", "owner": "Workshop" },
  "copies": 1
}
```

Use an authenticated, access-controlled broker. Prefer `mqtts://` whenever the
connection leaves the local machine or carries credentials.
