# Deployment guide

BleWebler2 is a static application. It does not require an application server, database, account system, or API key.

## GitHub Pages

1. Push the release branch to GitHub as `main`.
2. Open **Settings → Pages** and select **GitHub Actions** as the source.
3. Push to `main` or run **Deploy GitHub Pages** manually.
4. Confirm that the app, manifest, icons, lazy-loaded fonts, offline reload, and `/ult/` documentation all work at the published project URL.

The workflow sets `VITE_BASE_PATH` to `/<repository-name>/`, builds the ULT package with Jekyll, and merges both outputs into one Pages artifact. Set the app base to `/` and update the ULT `baseurl` for a custom domain or a root `owner.github.io` repository.

Web Bluetooth, WebUSB, service workers, and installability require a secure context. GitHub Pages provides HTTPS. Hardware access still depends on browser and operating-system support and always requires user permission.

## Privacy

The application stores designs and preferences locally in the browser and sends print data directly through the chosen device API. No BleWebler2 backend or user account is involved.

The hosting provider still processes network metadata such as IP addresses and request logs. A deployer should describe the chosen host accurately in their privacy information and link the host's current privacy statement. Do not copy a generic privacy policy without adapting it to the actual operator and deployment.

## Release verification

    npm ci
    npm run check
    npm test
    npm run build

Preview the exact Pages base locally with:

    VITE_BASE_PATH=/repository-name/ npm run build
    npm run preview --workspace apps/web-app

On PowerShell, set the variable for the current process first:

    $env:VITE_BASE_PATH='/repository-name/'
    npm run build
