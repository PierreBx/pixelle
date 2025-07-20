#!/usr/bin/env bash
# lib/ui.sh
print_table() {
  local mode="$1"
  tput cup 2 0
  echo -e "\n\033[1mSystem Monitoring Dashboard\033[0m"
  echo "--------------------------------------------------------------------------------------------------------------------------"
  printf "%-20s %-50s %-50s\n" "Check" "Dev" "Prod"
  echo "--------------------------------------------------------------------------------------------------------------------------"

  declare -a LABELS=("Docker" "Git Hash" "Grist DB" "Disk Usage" "RAM" "CPU Load")
  declare -a DEV_VARS=("$DOCKER_DEV" "$GIT_DEV" "$GRIST_DEV" "$DISK_DEV" "$RAM_DEV" "$CPU_DEV")
  declare -a PROD_VARS=("$DOCKER_PROD" "$GIT_PROD" "$GRIST_PROD" "$DISK_PROD" "$RAM_PROD" "$CPU_PROD")

  for i in "${!LABELS[@]}"; do
    local dev_val=""
    local prod_val=""
    [[ "$mode" == "dev" || "$mode" == "both" ]] && dev_val="${DEV_VARS[$i]}"
    [[ "$mode" == "prod" || "$mode" == "both" ]] && prod_val="${PROD_VARS[$i]}"
    printf "%-20s %-50s %-50s\n" "${LABELS[$i]}" "$dev_val" "$prod_val"
  done

  echo "--------------------------------------------------------------------------------------------------------------------------"
}