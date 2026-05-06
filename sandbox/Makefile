# sandbox/Makefile — driver for the qdcms sandbox container.
#
# Run `make help` for the full catalogue. Every target is a thin
# wrapper around docker compose + a command inside the container,
# so the same actions are reproducible across machines.
#
# Once `packages/qdcms-cli/` ships (see docs/cli.md), the inner
# command set will be `qdcms <topic>:<cmd>` rather than the tsx
# / npm-script scaffolding used here today.

# ─── Convenience ────────────────────────────────────────────────

# Use docker compose v2. Override DOCKER_COMPOSE for non-standard envs.
DOCKER_COMPOSE ?= docker compose
COMPOSE_FILE   ?= docker-compose.yml

# The service name from docker-compose.yml.
SERVICE        ?= qdcms

# In-container exec wrapper. Adds an interactive TTY only when the
# host has one (CI servers don't), otherwise stdin-only.
EXEC = $(DOCKER_COMPOSE) exec -T $(SERVICE)
EXEC_TTY = $(DOCKER_COMPOSE) exec $(SERVICE)

.DEFAULT_GOAL := help

# ─── Help ───────────────────────────────────────────────────────

.PHONY: help
help: ## List available targets
	@grep -hE '^[a-zA-Z][a-zA-Z0-9_-]*:.*?##' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "} {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}' \
	  | sort

# ─── Lifecycle ──────────────────────────────────────────────────

.PHONY: build
build: ## (Re)build the sandbox image
	$(DOCKER_COMPOSE) build

.PHONY: up
up: ## Start the sandbox container in the background
	$(DOCKER_COMPOSE) up -d

.PHONY: down
down: ## Stop the sandbox and remove the container
	$(DOCKER_COMPOSE) down

.PHONY: nuke
nuke: ## Stop + remove container AND named volumes (fresh node_modules)
	$(DOCKER_COMPOSE) down -v

.PHONY: status
status: ## Show container state
	$(DOCKER_COMPOSE) ps

.PHONY: logs
logs: ## Tail container logs
	$(DOCKER_COMPOSE) logs -f

# ─── In-container actions ──────────────────────────────────────

.PHONY: shell
shell: ## Drop into an interactive bash shell in the sandbox
	$(EXEC_TTY) bash

.PHONY: install-deps
install-deps: ## Run `npm install` against the mounted repo
	$(EXEC) npm install

.PHONY: compile-config
compile-config: ## Compile demo/config/*.yaml into .compiled/
	$(EXEC) npx qdcms config:compile demo/config

.PHONY: typecheck
typecheck: ## Run vue-tsc + tsc across all workspaces
	$(EXEC) npm run build --workspaces --if-present

.PHONY: test
test: ## Run all workspace tests
	$(EXEC) npm test --workspaces --if-present

.PHONY: install
install: ## Full install pipeline : deps + qdcms install + typecheck + test
	$(MAKE) install-deps
	$(EXEC) npx qdcms install --instance demo/config
	$(MAKE) typecheck
	$(MAKE) test

# ─── Demo (Flower Craft) ────────────────────────────────────────

.PHONY: demo-frontend
demo-frontend: ## Run the demo frontend dev server (Vite, host :5180)
	$(EXEC_TTY) npm run dev --workspace=demo-frontend

.PHONY: demo-backend
demo-backend: ## Run the demo backend dev server (Express, host :5181)
	$(EXEC_TTY) npm run dev --workspace=demo-backend-server

.PHONY: demo-full
demo-full: ## Run both demo servers concurrently (requires `up` first)
	$(EXEC_TTY) npm run dev:full

# ─── Plugin author harness ──────────────────────────────────────

.PHONY: plugin-test
plugin-test: ## Run tests for a single plugin. Use: make plugin-test PLUGIN=qdcms-plugin-core
	@if [ -z "$(PLUGIN)" ]; then \
	  echo "Usage: make plugin-test PLUGIN=<plugin-pkg-name>"; \
	  exit 64; \
	fi
	$(EXEC) npm test --workspace=$(PLUGIN)

# ─── Diagnostics ────────────────────────────────────────────────

.PHONY: doctor
doctor: ## Run the full diagnostic suite (config doctor + tests)
	$(EXEC) bash -lc 'set -e; \
	  echo "[doctor] Node: $$(node --version)"; \
	  echo "[doctor] npm: $$(npm --version)"; \
	  echo "[doctor] qdcms config:doctor:"; npx qdcms config:doctor demo/config 2>&1 | sed "s/^/  /"; \
	  echo "[doctor] tests:"; npm test --workspaces --if-present 2>&1 | tail -5 | sed "s/^/  /"; \
	  echo "[doctor] OK"'
