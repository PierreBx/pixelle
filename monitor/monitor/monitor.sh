#!/usr/bin/env bash
source config.env
source lib/status.sh
source lib/ui.sh
source lib/helpers.sh

ENVIRONMENT="${ENV:-both}"
REFRESH_INTERVAL="${REFRESH_INTERVAL:-10}"

trap stop_clock EXIT

main_loop() {
  while true; do
    clear
    start_clock

    # Collect checks
    if [[ "$ENVIRONMENT" == "dev" || "$ENVIRONMENT" == "both" ]]; then
      get_dev_status
    fi
    if [[ "$ENVIRONMENT" == "prod" || "$ENVIRONMENT" == "both" ]]; then
      get_prod_status
    fi

    # Print results
    print_table "$ENVIRONMENT"

    sleep "$REFRESH_INTERVAL"
  done
}

main_loop
