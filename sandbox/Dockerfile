# sandbox/Dockerfile — qdcms reproducible env.
#
# Goals :
#  - Node 22 (LTS), matches local dev.
#  - npm + git + bash + make + curl available for tooling.
#  - SQLite client + libs for ad-hoc DB inspection.
#  - Repo mounted at /workspace (docker-compose volume), NOT
#    baked into the image — image rebuilds stay rare.

FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      curl \
      git \
      jq \
      make \
      sqlite3 \
      libsqlite3-dev \
      python3 \
      build-essential \
 && rm -rf /var/lib/apt/lists/*

# Use bash, not the Debian sh, for sandbox shells. Make/Compose
# scripts rely on bashisms here and there.
SHELL ["/bin/bash", "-lc"]

# Tooling that's universally useful and small.
RUN npm install -g \
      tsx@4 \
      pnpm@9

WORKDIR /workspace

# Default to a friendly shell ; the Makefile overrides for
# specific commands.
CMD ["bash"]
