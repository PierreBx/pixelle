#!/bin/bash

check_docker() {
  local label="🔍 Checking if Docker is running..."
  local column=${1:-50}  # Default to column 50 if no argument is provided

  # Print the label and pad to column 50
  printf "%-${column}s" "$label"

  # Check if Docker is installed
  if ! command -v docker &> /dev/null; then
    echo -e "\033[1;31m❌ Docker not installed\033[0m"
    return 1
  fi

  # Check if Docker is running
  if ! docker info &> /dev/null; then
    echo -e "\033[1;31m🚫 Not running\033[0m"
    return 1
  else
    echo -e "\033[1;32m✅ Running\033[0m"
    return 0
  fi
}

check_container() {
  local container="$1"
  local column="${2:-50}"
  local label="📦 Checking container: $container"

  printf "%-${column}s" "$label"

  if ! docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
    echo -e "\033[1;31m❌ Not found\033[0m"
    return 2
  fi

  if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
    echo -e "\033[1;32m✅ Running\033[0m"
    return 0
  else
    echo -e "\033[1;33m⚠️  Stopped\033[0m"
    return 1
  fi

}
