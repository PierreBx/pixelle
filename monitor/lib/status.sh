# lib/status.sh
get_dev_status() {
  DOCKER_DEV=$(docker ps --format '{{.Names}}' | paste -sd ',')
  GIT_DEV=$(git -C "$DEV_PATH" rev-parse --short HEAD 2>/dev/null)
  curl -s --head --request GET http://localhost:8484/ | grep "^HTTP" > /dev/null && GRIST_DEV="UP" || GRIST_DEV="DOWN"
  DISK_DEV=$(df -h / | tail -1 | awk '{print $5}')
  RAM_DEV=$(free -h | awk '/Mem:/ {print $3 "/" $2}')
  CPU_DEV=$(uptime | awk -F 'load average:' '{ print $2 }' | cut -d' ' -f2 |  sed 's/.$//' | sed 's/,/./' )
}

get_prod_status() {
  DOCKER_PROD=$(ssh $PI_USER@$PI_HOST "docker ps --format '{{.Names}}'" | paste -sd ',' -)
  GIT_PROD=$(ssh $PI_USER@$PI_HOST "git -C $PI_PATH rev-parse --short HEAD" 2>/dev/null)
  GRIST_PROD=$(ssh $PI_USER@$PI_HOST "curl -s http://localhost:8484/api/docs" | jq length 2>/dev/null)
  DISK_PROD=$(ssh $PI_USER@$PI_HOST "df -h /" | tail -1 | awk '{print $5}')
  RAM_PROD=$(ssh $PI_USER@$PI_HOST "free -h" | awk '/Mem:/ {print $3 "/" $2}')
  CPU_PROD=$(ssh $PI_USER@$PI_HOST "uptime" |  awk -F 'load average:' '{ print $2 }' | cut -d' ' -f2 |  sed 's/.$//' | sed 's/,/./' )
}