# OpenCode DevEnv Base Image
# Pre-installed: Node.js 20, Bun, build tools
# Usage: docker pull opencodeco/devenv:latest

FROM ubuntu:22.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV HOME=/root
ENV PATH=/usr/local/bin:/root/.bun/bin:$PATH

# Install system packages
RUN apt-get update -y && \
    apt-get install -y \
        curl \
        ca-certificates \
        gnupg \
        git \
        build-essential \
        python3 \
        pkg-config \
        unzip \
        sudo \
        locales \
        && rm -rf /var/lib/apt/lists/*

# Set up locale
RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash && \
    ln -sf /root/.bun/bin/bun /usr/local/bin/bun && \
    ln -sf /root/.bun/bin/bunx /usr/local/bin/bunx

# Make root home accessible (for bun)
RUN chmod 755 /root /root/.bun /root/.bun/bin

# Set up PATH for login shells
RUN echo 'export PATH=/usr/local/bin:/root/.bun/bin:$PATH' > /etc/profile.d/devtools.sh

# Verify installations
RUN node --version && bun --version && git --version

# Default command - keep container running
CMD ["sleep", "infinity"]

LABEL org.opencontainers.image.source="https://github.com/anomalyco/opencode-devenv"
LABEL org.opencontainers.image.description="OpenCode development environment with Node.js, Bun, and build tools"
LABEL org.opencontainers.image.version="1.0.0"
