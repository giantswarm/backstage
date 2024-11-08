# Development

This page will help you get started developing on this application.

## Prerequisites

1. Have **NodeJS** installed in the right version. Here is how to manage this:

   - Look for the key `"engines"` in [/package.json](../package.json) to find out which major versions are supported.
   - You can use `nvm` to install, update, and switch NodeJS version in your system. As a homebrew user, use `brew install nvm`, then `nvm list-remote` to find available versions, `nvm install <version>` to install one and `nvm use <version>` to enable the version for the current shell session.

2. Have **yarn** v1 installed for NodeJS dependency management. Use `npm install --global yarn` to install it.

3. **Credentials from LastPass**:

   - **GitHub OAuth credentials**: You'll have to create a file `/github-app-development-credentials.yaml` in the clone repository, which for security reasons is not checked in with the repository. Find the content for this file in a LastPass secure note named `Backstage GitHub App`.
   - **Environment variables**: You need to create a file named `.env` in the repo root with the content you find in a LastPass secure note named `Backstage Dev Environment Variables`. To this file, you must also add `BACKSTAGE_ENVIRONMENT=development`, otherwise backstage cannot find the correct file to add overrides for.

4. A **local configuration file** named `/app-config.local.yaml`. Please copy `/app-config.local.yaml.example` for that purpose.

## Building the catalog

Before `backstage` is ready, you may need to build the catalog:

First, `go install` our `backstage-catalog-importer` tool:

```bash
go install github.com/giantswarm/backstage-catalog-importer@latest`
```

Next, you need to run this to create the components catalog and groups catalog. You should run this from the `/catalogs` directory.

```bash
cd catalogs
backstage-catalog-importer
```

This will create the default catalogs but it does not build the users catalog which is required to log in, nor will it
create the installations catalog. Both of these must be run separately

```bash
backstage-catalog-importer users
backstage-catalog-importer installations
```

## Running the app locally

### Loading `.env`

Backstage requires a number of variables that are defined in the `.env` file which should have been created in the first steps using details loaded from `lastpass`.

These must be loaded into the environment before backstage can be started. Depending on your environment, this may or may not be done for you.

If they are not loaded, or backstage fails with an error such as:

```nohighlight
Error: Failed to read config file at "/.../backstage/app-config.yaml", error at .integrations.github[0].apps[0], $include substitution value was undefined
```

make sure that the `.env` variables are exported by running

```bash
[ ! -f .env ] || export $(sed 's/#.*//g' .env | xargs)
```

Simply running `source .env` will not work for sub-commands as the variables are not exported.

### Executing `yarn`

Make sure you have all the prerequisites mentioned above in place.

In the root directory of the cloned repository, execute

    yarn install

before each attempt to run the app locally. This ensures that you have all dependencies installed in the right version.

To start both backend and frontent at the same time, execute

    yarn dev

> If using `yarn dev` you must load the environment variables from the `.env` file separately.

Note that it can take a bit after launch until Backstage has processed the entire catalog data.

Once you make code changes, the development server will refresh the app automatically for you. No need to stop and start the server or hit the refresh button in your browser.

To stop the development server, hit `Ctrl + C`.

## Running backend and frontend separately

With the `yarn dev` command above, two processes -- backend and frontend -- are logging into the same terminal. If this is not what you want, you can start both processes separately.

Execute these commands in separate shells (but watch out! Both need the environment variables set.)

- `yarn start-backend` to start the backend
- `yarn start` to start the frontend

## Working with custom catalog data

The `/app-config.local.yaml.example` file imports our production catalog data from Github.

If you need different catalog data, we recommended that you can add a static file with more entities. Check out the instruction in the file.

If you want to experiment with modifications on lots of entities, it's probably best to clone [backstage-catalog-importer](https://github.com/giantswarm/backstage-catalog-importer) (our catalog data utility) and modify it for your purpose. Using that tool, you can generate your own catalog YAML file. Make sure to place it in a location that is enabled in your `/app-config.local.yaml` file.
