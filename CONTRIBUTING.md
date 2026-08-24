# Contributing

BleWebler2 welcomes focused fixes, documentation, verified device information, and support for additional hardware. Please keep each change reviewable and include tests for protocol or rendering behavior.

## Development

Use Node.js 22 and npm 10 or newer.

    npm ci
    npm run check
    npm test
    npm run build

The virtual printer is the preferred first test. Hardware changes should also be tested on the exact device named in the pull request.

## Developer Certificate of Origin

Every commit must carry a `Signed-off-by` line. By signing off, you certify the [Developer Certificate of Origin 1.1](https://developercertificate.org/): you wrote the contribution, or have the right to submit it under the project's licence, and understand that it will be public.

Create a signed-off commit with:

    git commit -s

This is a certification of provenance, not a cryptographic signature. Contributors retain copyright in their work and grant recipients the rights stated in the [MIT License](LICENSE).

## Licensing and provenance

- Do not copy proprietary code or code under an incompatible licence.
- Do not translate, mechanically rewrite, or closely imitate an incompatible implementation.
- Record every vendored or adapted component in [Third-party notices](THIRD-PARTY-NOTICES.md) and retain all required licence texts.
- Prefer manufacturer documentation, observable device behavior, and independently recorded protocol tests.
- Keep captures, vendor applications, firmware, and other material that cannot be redistributed outside the repository.
- Discuss GPL, AGPL, MPL, source-available, or unlicensed dependencies before introducing them.

Protocol work must follow the project rules in [Licensing](LICENSING.md). Contributors are responsible for using sources and devices they are permitted to examine and for keeping non-redistributable material out of the repository.

## Pull requests

A good pull request explains:

- the user-visible problem and the smallest useful solution;
- the exact printer model, firmware, runtime, and transport when hardware is involved;
- how the behavior was verified;
- the origin and licence of any external material; and
- any compatibility or deployment impact.

Please avoid unrelated formatting changes and generated diagnostic output.
