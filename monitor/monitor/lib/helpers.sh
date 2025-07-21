#!/usr/bin/env bash
OK_COLOR=$(tput setaf 2)
WARNING_COLOR=$(tput setaf 1)
RESET_COLOR=$(tput sgr0)

cell() {
  local val="$1"
  if [[ "$val" == "OK" || "$val" == *running* ]]; then
    echo -n "${OK_COLOR}$val${RESET_COLOR}"
  elif [[ "$val" == "-" ]]; then
    echo -n "-"
  else
    ALERT_TRIGGERED=1
    tput bel
    echo -n "${WARNING_COLOR}$val${RESET_COLOR}"
  fi
}

start_clock() {
  local now=$(date '+%Y-%m-%d %H:%M:%S')
  local status_color="\033[1;42m"  # Default: green
  local status_text=" ALL SYSTEMS OK "

  # Simple check: if any PROD or DEV variable is empty
  if [[ -z "$DOCKER_DEV$GIT_DEV$GRIST_DEV$DISK_DEV$RAM_DEV$CPU_DEV" && "$ENVIRONMENT" != "prod" ]] || \
     [[ -z "$DOCKER_PROD$GIT_PROD$GRIST_PROD$DISK_PROD$RAM_PROD$CPU_PROD" && "$ENVIRONMENT" != "dev" ]]; then
    status_color="\033[1;41m"  # Red
    status_text=" SYSTEM ISSUE DETECTED "
    tput bel
  fi

  local cols=$(tput cols)
  local full_text="$now$status_text"
  local center=$(( (cols - ${#full_text}) / 2 ))

  tput cup 0 0 && printf "%${center}s" ""
  echo -ne "${status_color}${full_text}\033[0m"
}

stop_clock() {
  tput sgr0
}
