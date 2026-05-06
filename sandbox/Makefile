# sandbox/Makefile — driver for the qdcms sandbox container.
#
# Run `make help` for the full catalogue. Every target is a thin
# wrapper around docker compose + a command inside the container,
# so the same actions are reproducible across machines.
#
# Inside the container, the two worlds are mounted at /core
# (qdcms framework) and /demo (instance). WORKDIR=/core so the
# `qdcms` bin from /core/node_modules/.bin is on PATH.

# DEMO_UID/DEMO_GID match the host user so files written to the
# bind mounts (package-lock.json, .compiled/, dist/) stay owned
# by the developer, not root. Using DEMO_-prefixed names rather
# than the bare UID/GID avoids clashing with shell built-ins
# (UID is read-only on Linux) or other tooling that reads them.
export DEMO_UID := $(shell id -u)
export DEMO_GID := $(shell id -g)

DOCKER_COMPOSE ?= docker compose --env-file ./docker-compose.env
SERVICE        ?= qdcms

EXEC     = $(DOCKER_COMPOSE) exec -T $(SERVICE)
EXEC_TTY = $(DOCKER_COMPOSE) exec $(SERVICE)

# Helpers — run a command from /core or /demo regardless of
# WORKDIR. The host-side `cd ...` would change ours ; these run
# inside the container.
EXEC_CORE = $(EXEC) sh -c
EXEC_DEMO = $(EXEC) sh -lc 'cd /demo &&'

# Auto-bootstrap docker-compose.env from the committed template
# on first invocation. Every actionable target depends on this so
# fresh clones Just Work : `make up` copies env-dist → env, then
# proceeds. The Makefile shells out via $(DOCKER_COMPOSE) which
# fails loud if the env file is missing, so we never reach docker
# without it.
docker-compose.env:
	@if [ ! -f docker-compose.env ]; then \
	  cp docker-compose.env-dist docker-compose.env; \
	  echo "[sandbox] copied docker-compose.env from -dist (edit to override ports)"; \
	fi

.DEFAULT_GOAL := help

# ─── Help ───────────────────────────────────────────────────────

.PHONY: help
help: ## List available targets
	@grep -hE '^[a-zA-Z][a-zA-Z0-9_-]*:.*?##' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "} {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}' \
	  | sort

# ─── Lifecycle ──────────────────────────────────────────────────

.PHONY: build
build: docker-compose.env ## (Re)build the sandbox image
	$(DOCKER_COMPOSE) build

.PHONY: up
up: docker-compose.env ## Start the sandbox containers + print URLs
	$(DOCKER_COMPOSE) up -d
	@echo
	@$(MAKE) --no-print-directory urls
	@if [ ! -f traefik/certs/dev.crt ]; then \
	  echo; \
	  echo "  HTTPS : Traefik runs but no cert is loaded yet."; \
	  echo "          Run 'make certs' (needs mkcert installed)."; \
	fi

.PHONY: down
down: docker-compose.env ## Stop the sandbox and remove containers
	$(DOCKER_COMPOSE) down

.PHONY: nuke
nuke: docker-compose.env ## Stop + remove containers AND named volumes (fresh node_modules)
	$(DOCKER_COMPOSE) down -v

.PHONY: status
status: docker-compose.env ## Show container state
	$(DOCKER_COMPOSE) ps

.PHONY: logs
logs: docker-compose.env ## Tail container logs
	$(DOCKER_COMPOSE) logs -f

# ─── In-container actions ──────────────────────────────────────

.PHONY: shell
shell: ## Drop into an interactive bash shell in the sandbox
	$(EXEC_TTY) bash

.PHONY: install-deps
install-deps: ## npm install in /qdadm, /core, /demo (sibling repo + two worlds)
	$(EXEC) sh -lc 'cd /qdadm && npm install'
	$(EXEC) sh -lc 'cd /core && npm install'
	$(EXEC) sh -lc 'cd /demo && npm install'

.PHONY: compile-config
compile-config: ## Compile /demo/config/*.yaml into /demo/.compiled/config
	$(EXEC) sh -lc 'cd /demo && npx qdcms config:compile config'

.PHONY: typecheck
typecheck: ## Run typechecks across both worlds
	$(EXEC) sh -lc 'cd /core && npm run build --workspaces --if-present'
	$(EXEC) sh -lc 'cd /demo && npm run build --workspaces --if-present'

.PHONY: build-spa
build-spa: ## Build the demo SPA (vite build) — required for the nginx topology
	$(EXEC) sh -lc 'cd /demo && npm run build --workspace=demo-frontend'

.PHONY: test
test: ## Run all workspace tests in /core
	$(EXEC) sh -lc 'cd /core && npm test --workspaces --if-present'

.PHONY: install
install: ## Full install pipeline : deps + qdcms install + typecheck + test
	$(MAKE) install-deps
	$(EXEC) sh -lc 'cd /demo && npx qdcms install --instance config'
	$(MAKE) typecheck
	$(MAKE) test

# ─── Demo (Flower Craft) ────────────────────────────────────────

.PHONY: demo-frontend
demo-frontend: ## Run the demo frontend dev server (Vite, host :5180)
	$(EXEC_TTY) sh -lc 'cd /demo && npm run dev --workspace=demo-frontend'

.PHONY: demo-backend
demo-backend: ## Run the demo backend dev server (Express, host :5181)
	$(EXEC_TTY) sh -lc 'cd /demo && npm run dev --workspace=demo-backend-server'

.PHONY: demo-full
demo-full: ## Run both demo servers concurrently
	$(EXEC_TTY) sh -lc 'cd /demo && npm run dev:full'

# ─── Plugin author harness ──────────────────────────────────────

.PHONY: plugin-test
plugin-test: ## Run tests for a single plugin. Use: make plugin-test PLUGIN=qdcms-plugin-core
	@if [ -z "$(PLUGIN)" ]; then \
	  echo "Usage: make plugin-test PLUGIN=<plugin-pkg-name>"; \
	  exit 64; \
	fi
	$(EXEC) sh -lc 'cd /core && npm test --workspace=$(PLUGIN)'

# ─── Diagnostics ────────────────────────────────────────────────

-include ./docker-compose.env

.PHONY: urls
urls: ## Print the sandbox URLs (Traefik routes + direct ports)
	@HTTP_SUFFIX="$(if $(filter-out 80,$(SANDBOX_HTTP_PORT)),:$(SANDBOX_HTTP_PORT))"; \
	HTTPS_SUFFIX="$(if $(filter-out 443,$(SANDBOX_HTTPS_PORT)),:$(SANDBOX_HTTPS_PORT))"; \
	echo "Sandbox URLs :"; \
	echo ""; \
	echo "  Direct topology (Vite dev / Express via Traefik) :"; \
	echo "    Frontend   →  http://demo-frontend.qdcms.localhost$$HTTP_SUFFIX"; \
	echo "                  https://demo-frontend.qdcms.localhost$$HTTPS_SUFFIX"; \
	echo "    Backend    →  http://demo-backend.qdcms.localhost$$HTTP_SUFFIX"; \
	echo "                  https://demo-backend.qdcms.localhost$$HTTPS_SUFFIX"; \
	echo ""; \
	echo "  nginx topology (prod-like — run 'make build-spa' first) :"; \
	echo "    Demo       →  http://demo.nginx.qdcms.localhost$$HTTP_SUFFIX"; \
	echo "                  https://demo.nginx.qdcms.localhost$$HTTPS_SUFFIX"; \
	echo ""; \
	echo "  Direct ports (no Traefik) :"; \
	echo "    Frontend   →  http://localhost:$(SANDBOX_FRONTEND_PORT)"; \
	echo "    Backend    →  http://localhost:$(SANDBOX_BACKEND_PORT)"; \
	echo ""; \
	echo "  Traefik dashboard :"; \
	echo "               →  http://traefik.qdcms.localhost$$HTTP_SUFFIX"; \
	echo ""; \
	echo "  Note : *.qdcms.localhost auto-resolves to 127.0.0.1"; \
	echo "  in modern browsers. HTTPS uses an mkcert-issued local"; \
	echo "  cert ('make certs') trusted in your browser via the"; \
	echo "  mkcert root CA — no certificate warnings."

.PHONY: certs
certs: ## Generate trusted local certs via mkcert (one-time setup)
	@if ! command -v mkcert >/dev/null 2>&1; then \
	  echo "[certs] mkcert is not installed."; \
	  echo "[certs] Install :  https://github.com/FiloSottile/mkcert"; \
	  echo "[certs] Then run :  mkcert -install   (one-time, installs the local root CA)"; \
	  echo "[certs] Then re-run :  make certs"; \
	  exit 1; \
	fi
	mkdir -p traefik/certs
	cd traefik/certs && mkcert \
	  -cert-file dev.crt -key-file dev.key \
	  'qdcms.localhost' '*.qdcms.localhost' '*.nginx.qdcms.localhost' \
	  localhost 127.0.0.1
	@echo
	@echo "[certs] OK. Bounce the sandbox to pick them up :"
	@echo "        make down && make up"

.PHONY: doctor
doctor: ## Run the full diagnostic suite (config doctor + tests)
	$(EXEC) bash -lc 'set -e; \
	  echo "[doctor] Node: $$(node --version)"; \
	  echo "[doctor] npm: $$(npm --version)"; \
	  echo "[doctor] qdcms config:doctor:"; cd /demo && npx qdcms config:doctor config 2>&1 | sed "s/^/  /"; \
	  echo "[doctor] tests:"; cd /core && npm test --workspaces --if-present 2>&1 | tail -5 | sed "s/^/  /"; \
	  echo "[doctor] OK"'
