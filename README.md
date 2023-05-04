This is our in-progress instance of [Backstage](https://backstage.io/).

## Development

### Prerequisites

**Important:** Make sure to use the right NodeJS version. See `"engines"` in [package.json](package.json) to find out which major versions are supported.

Initially, run `yarn install` in the repository root directory to ensure all dependencies are installed and up-to-date. This will take a few minutes at the first time, depending on internet bandwidth.

In order to interact with the development GitHub app (required for authentication and authorization to scan repositories etc.), you have to create a local file named `github-app-development-credentials.yaml` in the repository root directory. The content of this file can be found in a LastPass secure note named **Backstage GitHub App**.

In addition, you will need some environment variables to be set up. We recommend to create a file named `.env` with the content to be found in a LastPass secure note named **Backstage Dev Environment Variables**.

### Running backstage locally

#### 1. Set environment variables

Make sure the environment variables from your `.env` file (see above) are currently set/exported.

#### 2. Run backend and frontend

There are two ways to execute the app in development. Choose according to personal preference. All commands are to be executed from the repository root directory.

1. Start backend and frontend together via `yarn dev`.

2. Start backend and frotend separately.

   Backend: In one terminal, execute `yarn start-backend`.

   Frontend: In another terminal, run `yarn start`.

After starting the backend, it may take some time until the catalog gets populated from example data.
