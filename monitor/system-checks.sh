#!/bin/bash

# Source the function definitions
source ./check-lib/check-lib.sh

# Call the function(s)
clear
check_docker 50
check_container "jekyll_container" 50
check_container "grist_container" 50
check_server_on pixel-server

