# OpenCourse English City — everyday commands.   Run `make` to see them all.
#
# The game runs in three containers (see docker-compose.yml):
#   frontend (nginx) → backend (Node) → db (Postgres, saves kept in the "pgdata" volume)

COMPOSE ?= docker compose
WEB_PORT ?= 3000
# `make logs s=backend`, `make restart s=frontend`, `make sh s=backend` … (empty = every service)
s ?=

.DEFAULT_GOAL := help
.PHONY: help up start stop restart down build rebuild ps logs sh db db-backup db-restore db-reset \
        clean install dev test pack check

help: ## Show this list
	@awk 'BEGIN {FS = ":.*## "} \
	  /^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0, 5)} \
	  /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo
	@echo "  Pick one service with s=…   e.g.  make logs s=backend"

##@ Containers

up: ## Build what changed and start everything → http://localhost:3000
	$(COMPOSE) up -d --build $(s)
	@echo "→ http://localhost:$(WEB_PORT)"

start: ## Start containers that were stopped (no build)
	$(COMPOSE) start $(s)

stop: ## Stop the containers (nothing is removed)
	$(COMPOSE) stop $(s)

restart: ## Restart the containers (after changing .env or a city pack use `make up`)
	$(COMPOSE) restart $(s)

down: ## Stop and remove the containers (player saves are kept)
	$(COMPOSE) down

build: ## Build the images
	$(COMPOSE) build $(s)

rebuild: ## Build the images from scratch (no cache) and start again
	$(COMPOSE) build --no-cache $(s)
	$(COMPOSE) up -d $(s)

ps: ## Show the containers and their health
	$(COMPOSE) ps

logs: ## Follow the logs (Ctrl+C to leave)
	$(COMPOSE) logs -f --tail=100 $(s)

sh: ## Open a shell in a container: make sh s=backend
	@test -n "$(s)" || { echo "Which one?  make sh s=backend | frontend | db"; exit 1; }
	$(COMPOSE) exec $(s) sh

##@ Database (player saves)

db: ## Open psql in the database
	$(COMPOSE) exec db psql -U city -d city

db-backup: ## Save the database to backups/city-<date>.sql
	@mkdir -p backups
	@f=backups/city-$$(date +%Y%m%d-%H%M%S).sql; \
	  $(COMPOSE) exec -T db pg_dump -U city -d city --clean --if-exists > $$f && echo "Saved $$f"

db-restore: ## Load a backup: make db-restore f=backups/city-….sql
	@test -f "$(f)" || { echo "Which file?  make db-restore f=backups/city-….sql"; exit 1; }
	$(COMPOSE) exec -T db psql -U city -d city -v ON_ERROR_STOP=1 < $(f)

db-reset: ## Delete ALL player saves (asks first)
	@printf "This deletes every player save. Type 'yes' to continue: "; read a; test "$$a" = yes
	$(COMPOSE) down -v

clean: ## Remove containers, images built here and the saves volume (asks first)
	@printf "This removes the containers, the images and every player save. Type 'yes' to continue: "; read a; test "$$a" = yes
	$(COMPOSE) down -v --rmi local --remove-orphans

##@ Without Docker

install: ## Install the dependencies
	npm install

dev: ## Run the game with live reload → http://localhost:5173
	npm run dev

test: ## Run the tests
	npm test

pack: ## Check the city packs in packs/ and compile them
	npm run pack

check: test pack ## Tests + city packs (run this before a pull request)
