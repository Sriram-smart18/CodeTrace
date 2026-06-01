FROM ubuntu:22.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Update & install standard compiler environments and curl/dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    build-essential \
    gcc \
    g++ \
    openjdk-17-jdk-headless \
    golang-go \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js v20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create compatibility symlink for python
RUN ln -sf /usr/bin/python3 /usr/bin/python

# Verify installations
RUN gcc --version && g++ --version && java -version && go version && python --version && node --version

# Setup application workspace
WORKDIR /app

# Copy dependency definition
COPY package*.json ./
RUN npm ci

# Copy server code
COPY . .

# Setup an unprivileged sandbox user for running unsafe code
RUN useradd -m -s /bin/bash sandbox_user

# Ensure temp directory exists and has correct permissions
RUN mkdir -p /app/temp && chmod 777 /app/temp && chown -R sandbox_user:sandbox_user /app

# Switch to the sandbox_user
USER sandbox_user

# Set environment variables
ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "server.js"]
