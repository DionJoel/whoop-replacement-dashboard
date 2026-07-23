"""
Shared MCP instance module.

This module provides a shared FastMCP instance that can be imported by both
the server module and tool modules without creating cyclic imports.
"""

import os
from mcp.server.fastmcp import FastMCP  # pylint: disable=import-error

from intervals_mcp_server.api.client import setup_api_client

# Use 0.0.0.0 to allow external connections in Docker
host = os.getenv("MCP_HOST", "0.0.0.0")
port = int(os.getenv("MCP_PORT", "8000"))
mcp: FastMCP = FastMCP("intervals-icu", host=host, port=port, lifespan=setup_api_client)  # pylint: disable=invalid-name
