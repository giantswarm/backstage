# Custom Branding

The Dev Portal supports overriding the default sidebar logos, home page logo, and browser tab favicon with custom assets, without committing them to the source repository or loading them from external URLs.

Assets are placed into a directory on the backend's filesystem and served by the `gs-backend` plugin. On the frontend, components check which assets are available and swap in the custom versions, falling back to the built-in defaults when none are provided.

## Supported assets

| Filename                                       | Purpose                                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `logo-full.svg` or `logo-full.png`             | Wide logo shown in the expanded sidebar                                          |
| `logo-icon.svg` or `logo-icon.png`             | Narrow icon shown in the collapsed sidebar                                       |
| `home-logo.svg` or `home-logo.png`             | Large logo shown at the top of the home page                                     |
| `home-logo-light.svg` or `home-logo-light.png` | Home page logo used when the light theme is active (falls back to `home-logo.*`) |
| `home-logo-dark.svg` or `home-logo-dark.png`   | Home page logo used when the dark theme is active (falls back to `home-logo.*`)  |
| `favicon.ico`                                  | Browser tab icon                                                                 |
| `favicon-16x16.png`                            | 16×16 icon variant                                                               |
| `favicon-32x32.png`                            | 32×32 icon variant                                                               |
| `apple-touch-icon.png`                         | iOS home screen icon                                                             |
| `safari-pinned-tab.svg`                        | Safari pinned tab mask icon                                                      |

All assets are optional. Only assets that are present in the directory will override their defaults.

## Local development

1. Create a directory with your assets:

   ```bash
   mkdir -p branding-assets
   ```

2. Place your files inside using the filenames from the table above. For example:

   ```
   branding-assets/
     logo-full.svg
     logo-icon.svg
     favicon-32x32.png
   ```

3. Add the path to `app-config.local.yaml`:

   ```yaml
   gs:
     branding:
       assetsPath: ./branding-assets
   ```

4. Start (or restart) the application:

   ```bash
   yarn start
   ```

The sidebar logos should appear immediately. For the favicon, a hard refresh (Ctrl+Shift+R) may be needed because browsers aggressively cache tab icons.

## Kubernetes deployment

The Helm chart provides a `branding` section that mounts assets into the container and configures the backend automatically.

### Option A: ConfigMap (for small SVG files)

Create a ConfigMap with your assets:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-company-branding
data:
  logo-full.svg: |
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50">
      <!-- your logo SVG content -->
    </svg>
  logo-icon.svg: |
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">
      <!-- your icon SVG content -->
    </svg>
```

Then reference it in your Helm values:

```yaml
branding:
  enabled: true
  volume:
    configMap:
      name: my-company-branding
```

> **Note:** ConfigMaps are limited to 1 MB total. For binary images (PNG, ICO) this can be tight because they must be base64-encoded under `binaryData`, which adds ~33% overhead.

### Option B: Init container with OCI image (for larger or binary assets)

Build a small container image containing your assets and use an init container to copy them into a shared volume:

```yaml
branding:
  enabled: true
  volume:
    emptyDir: {}
  initContainers:
    - name: fetch-branding
      image: gsoci.azurecr.io/giantswarm/my-branding-assets:latest
      command: ['cp', '-r', '/assets/.', '/branding/']
      volumeMounts:
        - name: branding-assets
          mountPath: /branding
```

This approach has no size limits and stores binary files natively.

### Option C: ConfigMap with binary data

For a small number of PNGs alongside SVGs, you can mix `data` and `binaryData` in a single ConfigMap:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-company-branding
binaryData:
  favicon-32x32.png: <base64-encoded content>
data:
  logo-full.svg: |
    <svg>...</svg>
```

Generate the base64 content with:

```bash
base64 -w0 favicon-32x32.png
```

## Configuration reference

| Key                      | Default                | Description                                                 |
| ------------------------ | ---------------------- | ----------------------------------------------------------- |
| `gs.branding.assetsPath` | `/app/branding-assets` | Filesystem path where the backend looks for branding assets |

### Helm values

| Key                       | Default                | Description                                                                              |
| ------------------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| `branding.enabled`        | `false`                | Enable the branding volume mount and config                                              |
| `branding.assetsPath`     | `/app/branding-assets` | Path inside the container where assets are mounted                                       |
| `branding.volume`         | `{}`                   | Kubernetes volume source (e.g. `configMap`, `emptyDir`, `persistentVolumeClaim`)         |
| `branding.initContainers` | `[]`                   | Init containers to run before the main container (e.g. to copy assets from an OCI image) |

## How it works

1. On startup, the `gs-backend` plugin scans the configured `assetsPath` directory and registers a `/branding/manifest` endpoint that lists the available files, plus an `express.static` handler that serves them. If the directory does not exist, the manifest returns an empty list and no errors are logged.

2. On the frontend, the `useBranding()` hook fetches the manifest once and caches it. The `LogoFull`, `LogoIcon`, and `HomeLogo` components check whether a matching asset exists and render an `<img>` tag pointing at the backend URL, or fall back to the built-in inline SVG.

3. The `BrandingFavicon` component (mounted at the app root) updates the `<link>` tags in `<head>` to point at any available favicon assets, leaving unmatched tags unchanged.

4. The `/branding/*` routes are served without authentication so that `<img>` and `<link>` tags (which cannot include auth headers) work correctly.

## Design notes

- **SVG logos served as `<img>` tags** cannot have their internal paths styled via CSS. Custom SVG logos must have the correct colors baked in (suitable for the dark sidebar background).
- **Favicon changes** may require a hard browser refresh because browsers cache tab icons aggressively.
- **Updating assets in production** requires a pod restart. When the branding ConfigMap changes, the Helm chart's `checksum/configmaps` annotation triggers a rolling restart automatically.
