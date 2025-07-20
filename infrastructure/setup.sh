#!/bin/bash

# Setup script for Flutter Docker environment
# This script sets up the environment variables for proper user permissions

# Get current user ID and group ID
export USER_ID=$(id -u)
export GROUP_ID=$(id -g)
export USERNAME=$(whoami)

# Default Flutter module path (you can change this)
export FLUTTER_MODULE_PATH=${1:-../flutter_app}

echo "Setting up Flutter Docker environment..."
echo "USER_ID: $USER_ID"
echo "GROUP_ID: $GROUP_ID"
echo "USERNAME: $USERNAME"
echo "Flutter module path: $FLUTTER_MODULE_PATH"

# Create .env file for docker-compose
cat > .env << EOF
USER_ID=$USER_ID
GROUP_ID=$GROUP_ID
USERNAME=$USERNAME
FLUTTER_MODULE_PATH=$FLUTTER_MODULE_PATH
EOF

echo "Environment file created: .env"

# Create Flutter module directory if it doesn't exist
if [ ! -d "$FLUTTER_MODULE_PATH" ]; then
    echo "Creating Flutter module directory: $FLUTTER_MODULE_PATH"
    mkdir -p "$FLUTTER_MODULE_PATH"
fi

# Build and run the container
echo "Building Flutter container..."
docker-compose build

echo "Starting Flutter container..."
docker-compose up -d

echo "Flutter container is ready!"
echo "Your Flutter app will be in: $FLUTTER_MODULE_PATH/"
echo "To enter the container, run: docker-compose exec flutter bash"
echo "To create a new Flutter project, run: docker-compose exec flutter flutter create ."
echo "To stop the container, run: docker-compose down"

# Show container status
docker-compose ps