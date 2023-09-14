# Development

This page will help you get started developing on this application.

## Prerequisites

1. Have **NodeJS** installed in the right version. Here is how to manage this:
   - Look for the key `"engines"` in [/package.json](../package.json) to find out which major versions are supported.
   - You can use `nvm` to install, update, and switch NodeJS version in your system. As a homebrew user, use `brew install nvm`, then `nvm list-remote` to find available versions, `nvm install <version>` to install one and `nvm use <version>` to enable the version for the current shell session.

2. Have **yarn** v1 installed for NodeJS dependency management. Use `npm install --global yarn` to install it.

3. **Credentials from LastPass**:
   - **GitHub OAuth credentials**: You'll have to create a file `/github-app-development-credentials.yaml` in the clone repository, which for security reasons is not checked in with the repository. Find the content for this file in a LastPass secure note named `Backstage GitHub App`.
   - **Environment variables**: We recommend to create a file named `.env` in the repo root with the content you find in a LastPass secure note named `Backstage Dev Environment Variables`. In bash, the `source .env` command will help you set these variables from the file, for the current shell session only.

4. A **local configuration file** named `/app-config.local.yaml`. Please copy `/app-config.local.yaml.example` for that purpose.

## Running the app locally

Make sure you have all the prerequisites mentioned above in place.

In the root directory of the cloned repository, execute

    yarn install

before each attempt to run the app locally. This ensures that you have all dependencies installed in the right version.

To start both backend and frontent at the same time, execute

    yarn dev

Note that it can take a bit after launch until Backstage has processed the entire catalog data.

Once you make code changes, the development server will refresh the app automatically for you. No need to stop and start the server or hit the refresh button in your browser.

## Running backend and frontend separately

With the `yarn dev` command above, two processes -- backend and frontend -- are logging into the same terminal. If this is not what you want, you can start both processes separately.

Execute these commands in separate shells (but watch out! Both need the environment variables set.)

- `yarn start-backend` to start the backend
- `yarn start` to start the frontend

## Working with custom catalog data

The `/app-config.local.yaml.example` file imports our production catalog data from Github.

If you need different catalog data, we recommended that you can add a static file with more entities. Check out the instruction in the file.

If you want to experiment with modifications on lots of entities, it's probably best to clone [backstage-catalog-importer](https://github.com/giantswarm/backstage-catalog-importer) (our catalog data utility) and modify it for your purpose. Using that tool, you can generate your own catalog YAML file. Make sure to place it in a location that is enabled in your `/app-config.local.yaml` file.
