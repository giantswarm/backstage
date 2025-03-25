# Development

This page will help you get started developing on this application. We explain two ways:

1. [Using a devcontainer](#devcontainer)
2. [Classic local development](#classic)

## In a devcontainer {#devcontainer}

This is the recommended way if you want to get started simply, but it may not provide the full flexibility of the classic local development.

### Prerequisites

- VS Code or another editor that supports devcontainers
- Docker
- [Dev Containers extension for VS Code](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

### Get started

1. Open the cloned repository in VS Code.
2. When prompted if you want to open the repository in a devcontainer, click "Reopen in Container".
3. Wait for the devcontainer to build. This may take a few minutes.
4. Once the devcontainer is ready, open a new terminal in VS Code.
5. Run `yarn dev` to in the VS code terminal to start backend and frontend.
6. If it doesn't open automatically, open [https://localhost:3000/](https://localhost:3000/) in your browser.

## Classic local development {#classic}

### Prerequisites

1. Have **NodeJS** installed in the right version. Here is how to manage this:

   - Look for the key `"engines"` in [/package.json](../package.json) to find
     out which major versions are supported.
   - You can use `nvm` to install, update, and switch NodeJS version in your
     system. As a homebrew user, use `brew install nvm`, then `nvm list-remote`
     to find available versions, `nvm install <version>` to install one and
     `nvm use <version>` to enable the version for the current shell session.

2. Have **yarn** v1 installed for NodeJS dependency management. Use
   `npm install --global yarn` to install it.

3. **Credentials from 1Password**:

   - **GitHub OAuth credentials**: You'll have to create a file
     `/github-app-development-credentials.yaml` in the clone repository, which
     for security reasons is not checked in with the repository. Find the
     content for this file in a 1Password secure note named `Backstage Dev GitHub App`.
   - **Environment variables**: Backstage requires a number of environment
     variables to be set in order to work successfully. Please see the section
     on [Loading `.env`](#loading-env) for details on how to create this file.

4. A **local configuration file** named `/app-config.local.yaml`. Please copy
   `/app-config.local.yaml.example` for that purpose.

## Running the app locally

### Loading `.env`

Backstage requires a number of variables that are defined in a `.env` file.

As many of the variables referenced are secrets, this file is not checked in by
default and must be created.

Copy the file [`.env.example`](../.env.example) to `.env` and modify it to
to replace the secret values. You can find the contents of the secret values in
the 1Password secure note `Backstage Dev Environment Variables`.

> [!IMPORTANT]
> Only replace the values below the comment line referencing the secret.
> Do not replace or remove the variables above this point.

Once done, load the environment variables with:

```bash
set -a; source .env; set +a
```

(Simply running `source .env` will not work for sub-commands as the variables are
not exported.)

If the environment variables are not loaded, yarn may fail to start with the
following error:

```nohighlight
Error: Failed to read config file at "/.../backstage/app-config.yaml", error at .integrations.github[0].apps[0], $include substitution value was undefined
```

### Executing `yarn`

Make sure you have all the prerequisites mentioned above in place.

In the root directory of the cloned repository, execute

    yarn install

before each attempt to run the app locally. This ensures that you have all
dependencies installed in the right version.

To start both backend and frontent at the same time, execute

    yarn dev

Note that it can take a bit after launch until Backstage has processed the
entire catalog data.

Once you make code changes, the development server will refresh the app
automatically for you. No need to stop and start the server or hit the refresh
button in your browser.

To stop the development server, hit `Ctrl + C`.

## Running backend and frontend separately

With the `yarn dev` command above, two processes -- backend and frontend -- are
logging into the same terminal. If this is not what you want, you can start both
processes separately.

Execute these commands in separate shells (but watch out! Both need the
environment variables set.)

- `yarn start-backend` to start the backend
- `yarn start` to start the frontend

## Running app locally with HTTPS

To use HTTPS with your local development site and access https://localhost,
you need a [TLS certificate](https://en.wikipedia.org/wiki/Public_key_certificate#TLS/SSL_server_certificate)
signed by an entity your device and browser trust, called a trusted
[certificate authority (CA)](https://en.wikipedia.org/wiki/Certificate_authority).
The browser checks whether your development server's certificate is signed
by a trusted CA before creating an HTTPS connection.

We recommend using [mkcert](https://github.com/FiloSottile/mkcert),
a cross-platform CA, to create and sign your certificate.

1. [Generate a certificate.](https://web.dev/articles/how-to-use-local-https#setup)
2. Put certificate data into `certificate.yaml` file in root of the project. See [certificate.yaml.example](../certificate.yaml.example) for example.
3. Add certificate configuration to `app` and `backend` packages. Use `https` instead of `http` in URLs:

```yaml
app:
  baseUrl: https://localhost:3000
  https:
    $include: certificate.yaml
backend:
  baseUrl: https://localhost:7007
  cors:
    origin: https://localhost:3000
  https:
    $include: certificate.yaml
```
