# Catalog in development

## Managing the catalog

Backstage needs a catalog to function correctly. This catalog will provide
elements such as components, users, groups, etc.

At present, the existing Giant Swarm catalog is imported from
[backstage-catalogs](https://github.com/giantswarm/backstage-catalogs/tree/main/catalogs)
in [app-config.local.yaml.example](../app-config.local.yaml.example) which
includes the following under `locations`.

```yaml
- type: url
  target: https://github.com/giantswarm/backstage-catalogs/tree/main/catalogs/*.yaml
```

If you need to add additional catalogs for development, you may include these
either from a remote URL such as this, or by adding a local target file or
directory.

## Building the catalog

It should normally not be a requirement to build the catalog yourself, however
you may need to do so if you need more up to date information than what is
published in the giantswarm catalog.

For details on how to build the catalogs, please see the instructions under
[Working with custom catalog data](#working-with-custom-catalog-data)

## Working with custom catalog data

The `/app-config.local.yaml.example` file imports our production catalog data
from Github.

> [!Note]
> If you add new catalogs to `app-config.local.yaml` Backstage will recognise
> this and restart to apply the changes, however if you modify existing catalogs
> you will need to restart backstage manually.

If you need different catalog data, we recommended that you can add a static
file with more entities. Check out the instruction in the file.

If you want to experiment with modifications on lots of entities, it's probably
best to clone [backstage-catalog-importer](https://github.com/giantswarm/backstage-catalog-importer)
(our catalog data utility) and modify it for your purpose. Using that tool, you
can generate your own catalog YAML file. Make sure to place it in a location
that is enabled in your `/app-config.local.yaml` file.

Using this tool to build the catalogs is fairly straight forward:

First, `go install` our `backstage-catalog-importer` tool if you haven't already
cloned and modified it:

```bash
go install github.com/giantswarm/backstage-catalog-importer@latest`
```

Next, you need to run this to create the components catalog and groups catalog.
You should run this from the `/catalogs` directory.

```bash
cd catalogs
backstage-catalog-importer
```

This will create the default catalogs but it does not build the users catalog
which is required to log in, nor will it create the installations catalog. Both
of these must be run separately.

```bash
backstage-catalog-importer users
backstage-catalog-importer installations
```

Once built, remember to add these locations to your `app-config.local.yaml` file.
