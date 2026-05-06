# sandbox/Dockerfile — qdcms reproducible env.
#
# Goals :
#  - Node 22 (LTS), matches local dev.
#  - npm + git + bash + make + curl available for tooling.
#  - SQLite client + libs for ad-hoc DB inspection.
#  - Repo mounted at /core, /demo, /qdadm by docker-compose ;
#    nothing baked into the image.
#  - Container processes run as the HOST user (UID/GID injected
#    by docker-compose) so files written into the bind mounts
#    are owned by the host user, not root. The Makefile passes
#    `id -u` / `id -g` automatically.

FROM node:22-bookworm-slim

ARG DEMO_UID=1000
ARG DEMO_GID=1000

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

# Rename the default `node` user to `homer` and realign its
# UID/GID to the host (build args). The container's home dir
# moves to /home/homer.
RUN groupmod -n homer node && \
    usermod -l homer -d /home/homer -m node && \
    if [ "$(id -u homer)" != "${DEMO_UID}" ] || [ "$(id -g homer)" != "${DEMO_GID}" ]; then \
      groupmod -g "${DEMO_GID}" homer && \
      usermod -u "${DEMO_UID}" -g "${DEMO_GID}" homer; \
    fi && \
    chown -R "${DEMO_UID}:${DEMO_GID}" /home/homer /usr/local/lib/node_modules

# Use bash, not the Debian sh, for sandbox shells. Make/Compose
# scripts rely on bashisms here and there.
SHELL ["/bin/bash", "-lc"]

# Tooling that's universally useful and small.
RUN npm install -g \
      tsx@4 \
      pnpm@9

# Run as the host user — files written via bind mounts stay
# owned by the host's UID/GID instead of root.
USER homer
# WORKDIR is /demo : the sandbox is about running the instance.
# Targets that operate on the core (tests, dedup) `cd /core`
# explicitly in the Makefile.
WORKDIR /demo

# Default to a friendly shell ; the Makefile overrides for
# specific commands.
CMD ["bash"]
