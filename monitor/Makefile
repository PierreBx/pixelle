MONITOR_SCRIPT = ./monitor.sh

.PHONY: monitor once check-prod help init

monitor:
	@echo "➡️  Lancement du tableau de bord en continu..."
	@-ENV=$(ENV) $(MONITOR_SCRIPT) || true

once:
	@echo "➡️  Exécution unique du monitoring..."
	@REFRESH_INTERVAL=0 ENV=$(ENV) $(MONITOR_SCRIPT)

check-prod:
	@echo "➡️  Vérification directe de l'état du Raspberry Pi..."
	@bash -c 'source lib/status.sh && \
	  echo "Docker     : $$(docker_status_prod)"; \
	  echo "Git hash   : $$(git_hash_prod)"; \
	  echo "Grist      : $$(grist_count_prod)"; \
	  echo "Ping       : $$(ping_pi)"; \
	  echo "Disque     : $$(disk_prod)"; \
	  echo "RAM        : $$(ram_prod)"; \
	  echo "CPU        : $$(cpu_prod)"'

help:
	@echo "\n📦  Commandes disponibles :\n"
	@echo "  make monitor ENV=both   - Lance la boucle de supervision (par défaut : both)"
	@echo "  make once ENV=dev       - Exécute un seul cycle de test"
	@echo "  make check-prod         - Vérifie uniquement l’état du Raspberry Pi"
	@echo "  make init               - Rends les scripts exécutables"
	@echo "  make help               - Affiche cette aide"
	@echo ""

init:
	@echo "➡️  Initialisation des permissions..."
	@chmod +x monitor.sh lib/*.sh