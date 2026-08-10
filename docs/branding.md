# Custom Branding

The Dev Portal ships with the Giant Swarm logo and typeface by default (see [Default branding](#default-branding) below).

Every part of it can be overridden: sidebar logos, home page logo, and browser tab favicon via custom assets, without committing them to the source repository or loading them from external URLs; and individual palette colors of the light and dark themes via app config, so deployments can match a customer's brand without rebuilding the frontend.

Assets are placed into a directory on the backend's filesystem and served by the built-in `branding` backend plugin (defined in `packages/backend/src/branding/`). On the frontend, components check which assets are available and swap in the custom versions, falling back to the built-in defaults when none are provided.

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
   app:
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

### Option B: ConfigMap with binary data

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

## Default branding

Giant Swarm branding covers identity and typography:

- **Logo** — the horizontal lockup from [`giantswarm/brand`](https://github.com/giantswarm/brand) (`logo/standard`), vendored as React components in `packages/app/src/assets/logo/`. `GiantSwarmLogoFull` keeps the ant's brand gradient and renders the wordmark in `currentColor`, so one asset works on both the dark sidebar and light content surfaces. `GiantSwarmMark` is the single-color ant, used in the collapsed sidebar rail and in `safari-pinned-tab.svg` (which Safari fills with the `color` set on the `<link>` tag — Giant Swarm Orange). Per the styleguide the lockup must not be stretched, recolored, or given effects.
- **Favicons and app icons** — the full-color ant on a full-bleed Giant Swarm Blue tile, cropped from the ant group's bounding box (`99.98, 95.29, 68.74 × 61.45` in the lockup's user space) and scaled to 92% of the tile width, below which the eye markings stop reading at 16px. Keep the tile square: `qlmanage` rasterises onto an opaque white background, so a rounded rect bakes white corners into the PNG. After regenerating, check the corner pixels are `#002645`.
- **Typography** — Roboto, self-hosted via `@fontsource/roboto` and imported in `packages/app/src/index.tsx`, because the app's CSP has no `font-src` allowlist for external hosts. It is set in two places, since the component libraries are themed independently: `fontFamily` in `createUnifiedTheme` (Material UI and `@backstage/core-components`) and `--bui-font-regular` in `packages/app/src/bui-overrides.css` (`@backstage/ui`).

## Theme colors

Light and dark theme palette colors can be customized via `app.branding.theme.<variant>` in app config. Any unset key falls back to the Backstage default for that variant — overrides are merged on top of the built-in palette, not replacing it.

```yaml
app:
  branding:
    theme:
      light:
        primaryColor: '#1F5493'
        secondaryColor: '#005B86'
        backgroundColor: '#FFFFFF'
        textColor: '#222222'
        secondaryTextColor: '#666666'
        linkColor: '#1F5493'
        accentColor: '#1F5493'
        accentTextColor: '#FFFFFF'
        border1: '#E5E5E5'
        border2: '#737373'
        navigation:
          background: '#171717'
          indicator: '#9BF0E1'
          color: '#FFFFFF'
          selectedColor: '#FFFFFF'
      dark:
        primaryColor: '#9CC9FF'
        secondaryColor: '#FF88B2'
        backgroundColor: '#1A1A1A'
        textColor: '#EEEEEE'
        navigation:
          background: '#424242'
          indicator: '#9BF0E1'
          color: '#B5B5B5'
          selectedColor: '#FFFFFF'
```

`backgroundColor` sets the page background. It updates both the MUI `background.default` palette token (used by legacy components) and the `--bui-bg-app` CSS variable (used by `@backstage/ui` components) so the two stay in sync.

`textColor` sets the default body text color. It updates both the MUI `text.primary` palette token and the `--bui-fg-primary` CSS variable.

`neutralBackground1` through `neutralBackground4` set the four tiers of neutral surface backgrounds used by `@backstage/ui` components (cards, panels, hover surfaces). They map to the `--bui-bg-neutral-1` through `--bui-bg-neutral-4` CSS variables and have no MUI palette equivalent.

`secondaryTextColor` sets muted/secondary text — the MUI `text.secondary` token and `--bui-fg-secondary`.

`linkColor` sets hyperlinks. It updates the MUI `link` and `linkHover` tokens, and `--bui-ring` (bui has no link token of its own; the focus ring is its closest interactive accent).

`accentColor` and `accentTextColor` set the background and text of solid/primary actions (`--bui-accent-bg` / `--bui-accent-fg`). The hover shade `--bui-accent-bg-hover` is not configurable, so check the hover state after setting a custom `accentColor`.

`border1` and `border2` set the subtle and stronger border colors (`--bui-border-1` / `--bui-border-2`). Neither has a MUI palette equivalent.

Note that overrides are appended _after_ the brand defaults in the same CSS rule, so a configured key wins and every unset key keeps its Giant Swarm value.

The customization is wired into the New Frontend System: the built-in `theme:app/light` and `theme:app/dark` extensions are overridden in `packages/app/src/modules/app/AppOverrides.tsx`, and palette merging happens in `packages/app/src/modules/app/customThemes.tsx`. Theme variant `id`s match upstream so the theme switcher and persisted user selections continue to work.

To preview overrides locally, drop a `theme:` block under `app.branding` in `app-config.local.yaml` and restart `yarn start`.

## Configuration reference

| Key                                                 | Default                | Description                                                 |
| --------------------------------------------------- | ---------------------- | ----------------------------------------------------------- |
| `app.branding.assetsPath`                           | `/app/branding-assets` | Filesystem path where the backend looks for branding assets |
| `app.branding.theme.light.primaryColor`             | Backstage default      | Primary brand color in the light theme                      |
| `app.branding.theme.light.secondaryColor`           | Backstage default      | Secondary accent color in the light theme                   |
| `app.branding.theme.light.backgroundColor`          | Backstage default      | Page background color in the light theme                    |
| `app.branding.theme.light.textColor`                | Backstage default      | Default body text color in the light theme                  |
| `app.branding.theme.light.secondaryTextColor`       | Backstage default      | Muted/secondary text color in the light theme               |
| `app.branding.theme.light.linkColor`                | Backstage default      | Hyperlink and focus-ring color in the light theme           |
| `app.branding.theme.light.accentColor`              | Backstage default      | Background of solid/primary actions in the light theme      |
| `app.branding.theme.light.accentTextColor`          | Backstage default      | Text color on solid/primary actions in the light theme      |
| `app.branding.theme.light.border1`                  | Backstage default      | Subtle border color in the light theme                      |
| `app.branding.theme.light.border2`                  | Backstage default      | Stronger border color in the light theme                    |
| `app.branding.theme.light.neutralBackground1`       | Backstage default      | Tier 1 neutral surface background in the light theme        |
| `app.branding.theme.light.neutralBackground2`       | Backstage default      | Tier 2 neutral surface background in the light theme        |
| `app.branding.theme.light.neutralBackground3`       | Backstage default      | Tier 3 neutral surface background in the light theme        |
| `app.branding.theme.light.neutralBackground4`       | Backstage default      | Tier 4 neutral surface background in the light theme        |
| `app.branding.theme.light.navigation.background`    | Backstage default      | Sidebar background in the light theme                       |
| `app.branding.theme.light.navigation.indicator`     | Backstage default      | Active-route indicator color in the light theme             |
| `app.branding.theme.light.navigation.color`         | Backstage default      | Default nav item color in the light theme                   |
| `app.branding.theme.light.navigation.selectedColor` | Backstage default      | Selected nav item color in the light theme                  |
| `app.branding.theme.dark.*`                         | Backstage default      | Same keys as `light`, applied to the dark theme             |

### Helm values

| Key                         | Default                | Description                                                                                                          |
| --------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `branding.enabled`          | `false`                | Enable the branding volume mount and config                                                                          |
| `branding.assetsPath`       | `/app/branding-assets` | Path inside the container where assets are mounted                                                                   |
| `branding.volume.configMap` | `{}`                   | ConfigMap volume source (see `io.k8s.api.core.v1.ConfigMapVolumeSource`); currently the only supported volume source |

## How it works

1. On startup, the `branding` backend plugin scans the configured `assetsPath` directory and registers a `/api/branding/manifest` endpoint that lists the available files, plus an `express.static` handler that serves them at `/api/branding/<filename>`. If the directory does not exist, the manifest returns an empty list and no errors are logged.

2. On the frontend, the `useBranding()` hook fetches the manifest once and caches it. The `LogoFull`, `LogoIcon`, and `HomeLogo` components check whether a matching asset exists and render an `<img>` tag pointing at the backend URL, or fall back to the built-in inline SVG.

3. The `BrandingFavicon` component (mounted at the app root) updates the `<link>` tags in `<head>` to point at any available favicon assets, leaving unmatched tags unchanged.

4. The `/api/branding/*` routes are served without authentication so that `<img>` and `<link>` tags (which cannot include auth headers) work correctly.

## Design notes

- **SVG logos served as `<img>` tags** cannot have their internal paths styled via CSS. Custom SVG logos must have the correct colors baked in (suitable for the dark sidebar background).
- **Favicon changes** may require a hard browser refresh because browsers cache tab icons aggressively.
- **Updating assets in production** requires a pod restart. When the branding ConfigMap changes, the Helm chart's `checksum/configmaps` annotation triggers a rolling restart automatically.
