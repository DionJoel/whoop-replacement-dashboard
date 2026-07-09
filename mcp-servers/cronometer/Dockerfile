FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install build dependencies and Python build backend
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       build-essential \
       curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python build tool
RUN pip install --no-cache-dir hatchling

# Copy project files
COPY pyproject.toml pyproject.toml
COPY cronometer_mcp cronometer_mcp
COPY README.md README.md

# Install the package and runtime dependencies (we need mcp[cli])
RUN pip install --no-cache-dir .
RUN pip install --no-cache-dir "mcp[cli]>=1.0.0"

# Default command to run the MCP server using SSE
ENV MCP_TRANSPORT=sse
ENV PORT=3004

EXPOSE 3004

CMD ["cronometer-mcp"]