# sandbox/Dockerfile — qdcms reproducible env.
#
# Goals :
#  - Node 22 (LTS), matches local dev.
#  - npm + git + bash + make + curl available for tooling.
#  - SQLite client + libs for ad-hoc DB inspection.
#  - Repo source mounted at /core, /demo, /qdadm by docker-compose ;
#    node_modules ride in named docker volumes (container-isolated,
#    host stays untouched).
#  - Container runs as `homer` (UID/GID matching the host's user
#    via DEMO_UID/DEMO_GID build args). The image pre-creates the
#    node_modules mount points owned by homer so docker's named-
#    volume init inherits homer ownership — no entrypoint chown
#    needed.

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

SHELL ["/bin/bash", "-lc"]

# Tooling that's universally useful and small.
RUN npm install -g \
      tsx@4 \
      pnpm@9

# Pre-create the named-volume mount points owned by homer so the
# named volume's initial state inherits the right ownership.
RUN mkdir -p /core/node_modules /demo/node_modules /qdadm/node_modules \
 && chown -R "${DEMO_UID}:${DEMO_GID}" /core /demo /qdadm

USER homer
WORKDIR /demo
CMD ["bash"]
