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
# This is a multi-stage build, as documented here:
# https://backstage.io/docs/deployment/docker#multi-stage-build
# The build stage carries the compilers and headers needed to compile the
# native modules (better-sqlite3, isolated-vm) during yarn install; the runtime
# stage ships only the installed /app tree plus python for techdocs.

# Pinned to a full version plus digest, not a floating `24-trixie-slim`.
#
# The floating tag is republished whenever Debian ships security updates into
# the -slim base, which silently changes what we deploy and — because a moved
# FROM digest invalidates every layer beneath it — makes any Docker layer cache
# useless on that build. Renovate keeps both the version and the digest current
# (the dockerfile manager is enabled by the shared preset), so bumps arrive as
# reviewable PRs instead of appearing unannounced. Both stages must use the
# same pinned ref so the native modules run on the exact base they were built
# against.
FROM node:24.20.0-trixie-slim@sha256:50c3b2f6988dfc307b86e5301d69611af31f4789bdf232863b07d3b02fe55ae0 AS build

# Set Python interpreter for `node-gyp` to use
ENV PYTHON=/usr/bin/python3

# Install the toolchain needed to compile the native modules at install time.
# None of this reaches the runtime stage.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends libsqlite3-dev python3 build-essential && \
    yarn config set python /usr/bin/python3 && \
    rm -rf /var/lib/apt/lists/*

# From here on we use the least-privileged `node` user to run the build.
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

# Copy repo skeleton first, to avoid unnecessary docker cache invalidation.
# The skeleton contains the package.json of each package in the monorepo,
# and along with yarn.lock and the root package.json, that's enough to run yarn install.
COPY --chown=node:node yarn.lock package.json ./
RUN --mount=type=bind,source=packages/backend/dist/skeleton.tar.gz,target=/tmp/backend-skeleton.tar.gz \
    tar xzf /tmp/backend-skeleton.tar.gz
RUN --mount=type=bind,source=packages/backend-headless-service/dist/skeleton.tar.gz,target=/tmp/backend-headless-service-skeleton.tar.gz \
    tar xzf /tmp/backend-headless-service-skeleton.tar.gz

# Yarn 4 (Berry) keeps its global mirror under /home/node/.yarn/berry — even
# with `enableGlobalCache: false` it stages every fetched zip there — so that
# is the path the cache mount must target (/home/node/.cache/yarn is the Yarn
# classic location and misses it entirely). `yarn cache clean` only clears the
# project-local cache; the node-gyp headers and npm leftovers are removed
# explicitly in the same RUN so none of it lands in the layer.
RUN --mount=type=cache,target=/home/node/.yarn/berry,sharing=locked,uid=1000,gid=1000 \
    yarn workspaces focus --all --production && rm -rf "$(yarn cache clean)" && \
    rm -rf /tmp/.node-gyp /home/node/.npm

# Then copy the rest of the backend bundle, along with any other files we might want.
COPY --chown=node:node app-config*.yaml ./

# The bundles are extracted from bind mounts (rather than COPYd and deleted) so
# the tarballs themselves never occupy an image layer.
#
# Drop the frontend source maps in the same RUN that extracts them: 115 MB of
# the 147 MB packages/app/dist, which app-backend serves verbatim. This is
# payload we have no reason to ship, NOT a leak fix -- this repo is public, and
# values inlined at build time sit in the minified bundle and the runtime app
# config regardless. (Checked against the live devportal map: all 114 sources
# were byte-identical to this repo at the deployed tag.) Requested in
# giantswarm/giantswarm#37469.
# Backend maps are left alone: never served, only read locally for stack traces.
RUN --mount=type=bind,source=packages/backend/dist/bundle.tar.gz,target=/tmp/backend-bundle.tar.gz \
    tar xzf /tmp/backend-bundle.tar.gz && \
    find packages/app/dist -name '*.map' -delete
RUN --mount=type=bind,source=packages/backend-headless-service/dist/bundle.tar.gz,target=/tmp/backend-headless-service-bundle.tar.gz \
    tar xzf /tmp/backend-headless-service-bundle.tar.gz

# Prune runtime-dead files from node_modules: source maps, TypeScript
# declarations, isolated-vm's bundled sources and foreign-platform prebuilds,
# and node-gyp (install-time-only). This must NOT delete the config schema
# files the backend compiles at startup — @backstage/config-loader resolves
# each package's package.json "configSchema" (conventionally config.d.ts) and
# type-checks it with the `typescript` package, following imports into other
# packages' declarations. The script computes that exact file closure, keeps
# it, and fails the build if the compiler's view of the schemas changes or if
# config-loader's real loadConfigSchema() breaks on the pruned tree. It runs
# after the bundle extraction above because the bundles overwrite the skeleton
# package.json files with their published form (configSchema rewritten to the
# precompiled config.schema.json). Pruning in the build stage means the
# runtime stage's COPY --from=build never sees the deleted files — no
# whiteout layers.
RUN --mount=type=bind,source=packages/backend/prune-node-modules.cjs,target=/tmp/prune-node-modules.cjs \
    node /tmp/prune-node-modules.cjs /app && \
    node --no-node-snapshot -e "require('isolated-vm'); require('better-sqlite3'); console.log('native modules load after prune')"

# The runtime stage starts fresh from the same pinned base, leaving the apt
# build toolchain (~370 MB) behind in the build stage.
FROM node:24.20.0-trixie-slim@sha256:50c3b2f6988dfc307b86e5301d69611af31f4789bdf232863b07d3b02fe55ae0

# Install python for `techdocs.generator.runIn: local` — the only runtime apt
# dependency (python3-venv so the venv below can bootstrap its own pip).
# https://backstage.io/docs/features/techdocs/getting-started#disabling-docker-in-docker-situation-optional
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-venv && \
    rm -rf /var/lib/apt/lists/*

# Set up a virtual environment for mkdocs-techdocs-core.
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

RUN pip3 install --no-cache-dir setuptools mkdocs-techdocs-core==1.2.1

# From here on we use the least-privileged `node` user to run the backend.
USER node
WORKDIR /app

# This switches many Node.js dependencies to production mode.
ENV NODE_ENV=production

# This is required by scaffolder-backend plugin.
# This disables node snapshot for Node 20 to work with the Scaffolder
ENV NODE_OPTIONS="--no-node-snapshot"

COPY --from=build --chown=node:node /app /app

CMD ["node", "packages/backend", "--config", "app-config.yaml", "--config", "app-config.production.yaml"]
