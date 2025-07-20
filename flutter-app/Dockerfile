FROM cirrusci/flutter:latest

# Install sudo for user management
USER root
RUN apt-get update && apt-get install -y sudo && rm -rf /var/lib/apt/lists/*

# Create user with same UID/GID as host user (will be overridden by docker-compose)
ARG USER_ID=1000
ARG GROUP_ID=1000
ARG USERNAME=flutter

# Create group and user
RUN groupadd -g $GROUP_ID $USERNAME && \
    useradd -m -u $USER_ID -g $GROUP_ID -s /bin/bash $USERNAME && \
    echo "$USERNAME ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Set Flutter environment (use the existing Flutter from cirrusci)
ENV FLUTTER_HOME=/home/cirrus/sdks/flutter
ENV PATH="$PATH:$FLUTTER_HOME/bin"

# Switch to non-root user
USER $USERNAME

# Set working directory
WORKDIR /project

# Configure git (IntelliJ might need this)
RUN git config --global --add safe.directory /project && \
    git config --global --add safe.directory $FLUTTER_HOME

# Expose common ports
EXPOSE 8080 3000 4000 5000

# Default command
CMD ["bash"]