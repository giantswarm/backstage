# This dockerfile builds an image for the backend package.
# It should be executed with the root of the repo as docker context.
#
# Before building this image, be sure to have run the following commands in the repo root:
#
# yarn install --immutable
# yarn tsc
# yarn build:backend
#
# Once the commands have been run, you can build the image using `yarn build-image`
#
# Alternatively, there is also a multi-stage Dockerfile documented here:
# https://backstage.io/docs/deployment/docker#multi-stage-build

# Pinned to a full version plus digest, not a floating `24-trixie-slim`.
#
# The floating tag is republished whenever Debian ships security updates into
# the -slim base, which silently changes what we deploy and — because a moved
# FROM digest invalidates every layer beneath it — makes any Docker layer cache
# useless on that build. Renovate keeps both the version and the digest current
# (the dockerfile manager is enabled by the shared preset), so bumps arrive as
# reviewable PRs instead of appearing unannounced.
FROM node:24.19.0-trixie-slim@sha256:0711b541c1c33a8a530ac4f0d391baa9a15b3d804695b1b24a47daa5fb60e74d

# Set Python interpreter for `node-gyp` to use
ENV PYTHON=/usr/bin/python3

# Install sqlite3 dependencies. You can skip this if you don't use sqlite3 in the image,
# in which case you should also move better-sqlite3 to "devDependencies" in package.json.
# Additionally, we install dependencies for `techdocs.generator.runIn: local`.
# https://backstage.io/docs/features/techdocs/getting-started#disabling-docker-in-docker-situation-optional
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends libsqlite3-dev python3 python3-pip python3-venv build-essential && \
    yarn config set python /usr/bin/python3 && \
    rm -rf /var/lib/apt/lists/*

# Set up a virtual environment for mkdocs-techdocs-core.
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

RUN pip3 install setuptools mkdocs-techdocs-core==1.2.1

# From here on we use the least-privileged `node` user to run the backend.
USER node

# This should create the app dir as `node`.
# If it is instead created as `root` then the `tar` command below will fail: `can't create directory 'packages/': Permission denied`.
# If this occurs, then ensure BuildKit is enabled (`DOCKER_BUILDKIT=1`) so the app dir is correctly created as `node`.
WORKDIR /app

# Copy files needed by Yarn
COPY --chown=node:node .yarn ./.yarn
COPY --chown=node:node .yarnrc.yml ./
COPY --chown=node:node backstage.json ./

# This switches many Node.js dependencies to production mode.
ENV NODE_ENV=production

# This is required by scaffolder-backend plugin.
# This disables node snapshot for Node 20 to work with the Scaffolder
ENV NODE_OPTIONS="--no-node-snapshot"

# Copy repo skeleton first, to avoid unnecessary docker cache invalidation.
# The skeleton contains the package.json of each package in the monorepo,
# and along with yarn.lock and the root package.json, that's enough to run yarn install.
COPY --chown=node:node yarn.lock package.json ./
COPY --chown=node:node packages/backend/dist/skeleton.tar.gz ./backend-skeleton.tar.gz
COPY --chown=node:node packages/backend-headless-service/dist/skeleton.tar.gz ./backend-headless-service-skeleton.tar.gz
RUN tar xzf backend-skeleton.tar.gz && rm backend-skeleton.tar.gz
RUN tar xzf backend-headless-service-skeleton.tar.gz && rm backend-headless-service-skeleton.tar.gz

RUN --mount=type=cache,target=/home/node/.cache/yarn,sharing=locked,uid=1000,gid=1000 \
    yarn workspaces focus --all --production && rm -rf "$(yarn cache clean)"

# Then copy the rest of the backend bundle, along with any other files we might want.
COPY --chown=node:node app-config*.yaml ./
COPY --chown=node:node packages/backend/dist/bundle.tar.gz ./backend-bundle.tar.gz
COPY --chown=node:node packages/backend-headless-service/dist/bundle.tar.gz ./backend-headless-service-bundle.tar.gz
RUN tar xzf backend-bundle.tar.gz && rm backend-bundle.tar.gz
RUN tar xzf backend-headless-service-bundle.tar.gz && rm backend-headless-service-bundle.tar.gz

# Drop the frontend source maps: 115 MB of the 147 MB packages/app/dist, which
# app-backend serves verbatim. This is payload we have no reason to ship, NOT a
# leak fix -- this repo is public, and values inlined at build time sit in the
# minified bundle and the runtime app config regardless. (Checked against the
# live devportal map: all 114 sources were byte-identical to this repo at the
# deployed tag.) Requested in giantswarm/giantswarm#37469.
# Backend maps are left alone: never served, only read locally for stack traces.
RUN find packages/app/dist -name '*.map' -delete

CMD ["node", "packages/backend", "--config", "app-config.yaml", "--config", "app-config.production.yaml"]
