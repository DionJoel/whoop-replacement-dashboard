#!/usr/bin/env node

/**
 * Polar HTTP Server - Einfache HTTP-API für n8n
 * 
 * Dieser Server stellt eine einfache HTTP-API bereit, die von n8n aufgerufen werden kann.
 * Er handhabt OAuth2 automatisch und speichert Tokens in einer Datei.
 * 
 * Endpunkte:
 *   GET  /health                    - Health Check
 *   GET  /auth/start               - Starte OAuth2-Flow, gibt Auth-URL zurück
 *   GET  /callback                 - OAuth2 Callback-Handler
 *   GET  /tools/get_sleep          - Schlaf-Daten abrufen
 *   GET  /tools/get_exercises      - Trainings-Daten abrufen
 *   GET  /tools/get_daily_activity - Tagesaktivität abrufen
 *   GET  /tools/get_nightly_recharge - Nightly Recharge abrufen
 *   POST /tools/get_sleep          - Schlaf-Daten abrufen (mit JSON-Body für Parameter)
 *   POST /tools/get_exercises      - Trainings-Daten abrufen (mit JSON-Body für Parameter)
 *   POST /tools/get_daily_activity - Tagesaktivität abrufen (mit JSON-Body für Parameter)
 *   POST /tools/get_nightly_recharge - Nightly Recharge abrufen (mit JSON-Body für Parameter)
 * 
 * Usage:
 *   1. Setze POLAR_CLIENT_ID und POLAR_CLIENT_SECRET als Environment-Variablen
 *   2. Starte den Server: npm run start:http
 *   3. n8n kann aufrufen: http://polar-mcp:3000/tools/get_sleep
 */

import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as url from "url";

const POLAR_API_BASE = "https://www.polaraccesslink.com/v3";
const POLAR_AUTH_URL = "https://flow.polar.com/oauth2/authorization";
const POLAR_TOKEN_URL = "https://polarremote.com/v2/oauth2/token";
const POLAR_REGISTER_URL = "https://www.polaraccesslink.com/v3/users";

// Token storage file
const TOKEN_FILE = path.join(process.cwd(), "tokens.json");

interface TokenData {
  access_token: string;
  token_type: string;
  expires_in: number;
  x_user_id: number;
  refresh_token?: string;
  timestamp: number;
}

// Get credentials from environment
const clientId = process.env.POLAR_CLIENT_ID;
const clientSecret = process.env.POLAR_CLIENT_SECRET;
const redirectUri = process.env.POLAR_REDIRECT_URI || "http://localhost:3000/callback";

if (!clientId || !clientSecret) {
  console.error("Error: POLAR_CLIENT_ID and POLAR_CLIENT_SECRET environment variables are required");
  process.exit(1);
}

// Current token data
let currentTokenData: TokenData | null = null;
let currentUserId: string | null = null;

// Load token from file
function loadToken(): TokenData | null {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const data = fs.readFileSync(TOKEN_FILE, "utf-8");
      const tokenData = JSON.parse(data) as TokenData;
      // Check if token is still valid
      const expiresAt = tokenData.timestamp + (tokenData.expires_in * 1000);
      if (expiresAt > Date.now()) {
        return tokenData;
      }
    }
  } catch (error) {
    console.error("Error loading token:", error);
  }
  return null;
}

// Save token to file
function saveToken(tokenData: TokenData): void {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2), "utf-8");
  } catch (error) {
    console.error("Error saving token:", error);
  }
}

// Get current access token
function getAccessToken(): string {
  if (currentTokenData?.access_token) {
    const expiresAt = currentTokenData.timestamp + (currentTokenData.expires_in * 1000);
    if (expiresAt > Date.now()) {
      return currentTokenData.access_token;
    }
  }
  
  const loadedToken = loadToken();
  if (loadedToken) {
    currentTokenData = loadedToken;
    return loadedToken.access_token;
  }
  
  throw new Error("No valid access token found. Please authenticate first.");
}

// Get current user ID
function getUserId(): string {
  if (currentUserId) return currentUserId;
  if (currentTokenData?.x_user_id) {
    currentUserId = currentTokenData.x_user_id.toString();
    return currentUserId;
  }
  const loadedToken = loadToken();
  if (loadedToken?.x_user_id) {
    currentUserId = loadedToken.x_user_id.toString();
    return currentUserId;
  }
  throw new Error("No user ID found. Please authenticate first.");
}

// Exchange authorization code for access token
async function exchangeCodeForToken(code: string): Promise<TokenData> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(POLAR_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  const tokenData = await response.json();
  return {
    access_token: tokenData.access_token,
    token_type: tokenData.token_type,
    expires_in: tokenData.expires_in,
    x_user_id: tokenData.x_user_id,
    refresh_token: tokenData.refresh_token,
    timestamp: Date.now(),
  };
}

// Register user with AccessLink
async function registerUser(accessToken: string, userId: number): Promise<void> {
  const response = await fetch(POLAR_REGISTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    body: JSON.stringify({
      "member-id": `user_${userId}`,
    }),
  });

  if (response.status === 409) {
    console.log("User already registered with this client.");
    return;
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.warn(`User registration note: ${response.status} ${errorText}`);
    return;
  }

  console.log("User successfully registered with AccessLink.");
}

// Helper function to make authenticated API calls
async function polarApiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<unknown> {
  const accessToken = getAccessToken();

  const response = await fetch(`${POLAR_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Polar API error (${response.status}): ${errorText || response.statusText}`
    );
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = url.parse(req.url || "", true);
    const pathname = parsedUrl.pathname;
    
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    
    // Handle OPTIONS for CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    
    // Health check
    if (pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        authenticated: !!currentTokenData,
        user_id: currentUserId,
      }));
      return;
    }
    
    // OAuth2 start
    if (pathname === "/auth/start") {
      const authUrl = new URL(POLAR_AUTH_URL);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("scope", process.env.POLAR_SCOPE || "accesslink.read_all");
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        auth_url: authUrl.toString(),
        redirect_uri: redirectUri,
      }));
      return;
    }
    
    // OAuth2 callback
    if (pathname === "/callback") {
      const code = parsedUrl.query.code as string;
      const error = parsedUrl.query.error as string;
      
      if (error) {
        console.error("OAuth error:", error);
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<html><body><h1>OAuth Error</h1><p>${error}</p></body></html>`);
        return;
      }
      
      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<html><body><h1>Error</h1><p>No authorization code received</p></body></html>");
        return;
      }
      
      // Exchange code for token
      const tokenData = await exchangeCodeForToken(code);
      
      // Register user
      await registerUser(tokenData.access_token, tokenData.x_user_id);
      
      // Store token
      currentTokenData = tokenData;
      currentUserId = tokenData.x_user_id.toString();
      saveToken(tokenData);
      
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <html>
          <head><title>Success</title></head>
          <body>
            <h1>Success!</h1>
            <p>Authentication successful. You can close this window.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'oauth_success' }, '*');
              }
              setTimeout(() => window.close(), 2000);
            </script>
          </body>
        </html>
      `);
      return;
    }
    
    // Token info
    if (pathname === "/auth/token") {
      try {
        const token = getAccessToken();
        const userId = getUserId();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          user_id: userId,
          has_token: !!currentTokenData,
          token_expires: currentTokenData ? 
            new Date(currentTokenData.timestamp + (currentTokenData.expires_in * 1000)).toISOString() : null,
        }));
      } catch (error) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
      return;
    }
    
    // MCP tools endpoints
    if (pathname?.startsWith("/tools/")) {
      const toolName = pathname.replace("/tools/", "");
      
      // Only allow specific tools for security
      const allowedTools = [
        "get_sleep",
        "get_exercises", 
        "get_daily_activity",
        "get_nightly_recharge",
        "get_user_info",
        "get_continuous_heart_rate",
        "get_cardio_load",
        "get_activity_samples",
      ];
      
      if (!allowedTools.includes(toolName)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Tool not found" }));
        return;
      }
      
      try {
        let params: Record<string, string> = {};
        
        // Parse body for POST requests
        if (req.method === "POST") {
          const bodyChunks: Uint8Array[] = [];
          for await (const chunk of req as any) {
            bodyChunks.push(chunk);
          }
          const body = Buffer.concat(bodyChunks).toString();
          if (body) {
            params = JSON.parse(body);
          }
        } else if (req.method === "GET") {
          // Get params from query string
          params = parsedUrl.query as Record<string, string>;
        }
        
        // Call the appropriate Polar API
        let result: unknown;
        let endpoint: string;
        
        switch (toolName) {
          case "get_sleep":
            endpoint = params.date ? `/users/sleep/${params.date}` : "/users/sleep";
            result = await polarApiRequest(endpoint);
            break;
            
          case "get_exercises":
            endpoint = "/exercises";
            const exerciseParams = new URLSearchParams();
            if (params.start_date) exerciseParams.append("start-date", params.start_date);
            if (params.end_date) exerciseParams.append("end-date", params.end_date);
            if (exerciseParams.toString()) endpoint += `?${exerciseParams.toString()}`;
            result = await polarApiRequest(endpoint);
            break;
            
          case "get_daily_activity":
            endpoint = params.date ? `/users/activities/${params.date}` : "/users/activities";
            result = await polarApiRequest(endpoint);
            break;
            
          case "get_nightly_recharge":
            endpoint = params.date ? `/users/nightly-recharge/${params.date}` : "/users/nightly-recharge";
            result = await polarApiRequest(endpoint);
            break;
            
          case "get_user_info":
            const userId = getUserId();
            result = await polarApiRequest(`/users/${userId}`);
            break;
            
          case "get_continuous_heart_rate":
            if (!params.date) {
              throw new Error("date parameter is required for get_continuous_heart_rate");
            }
            result = await polarApiRequest(`/users/continuous-heart-rate/${params.date}`);
            break;
            
          case "get_cardio_load":
            endpoint = params.date ? `/users/cardio-load/${params.date}` : "/users/cardio-load";
            result = await polarApiRequest(endpoint);
            break;
            
          case "get_activity_samples":
            endpoint = params.date ? `/users/activities/samples/${params.date}` : "/users/activities/samples";
            result = await polarApiRequest(endpoint);
            break;
            
          default:
            throw new Error("Unknown tool");
        }
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result, null, 2));
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const statusCode = errorMessage.includes("No valid access token") ? 401 : 500;
        res.writeHead(statusCode, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: errorMessage, tool: toolName }));
      }
      return;
    }
    
    // Not found
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    
  } catch (error) {
    console.error("Server error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  }
});

// Start the server
async function main() {
  const port = parseInt(process.env.PORT || "3000");
  
  // Try to load existing token
  const loadedToken = loadToken();
  if (loadedToken) {
    currentTokenData = loadedToken;
    currentUserId = loadedToken.x_user_id.toString();
    console.log(`Loaded existing token for user ${currentUserId}`);
  }
  
  server.listen(port, () => {
    console.log(`Polar HTTP Server starting on port ${port}...`);
    console.log(`OAuth Redirect URI: ${redirectUri}`);
    console.log(`Polar HTTP Server running on http://localhost:${port}`);
    console.log(`Health endpoint: http://localhost:${port}/health`);
    console.log(`Auth start endpoint: http://localhost:${port}/auth/start`);
    
    // List available tools
    console.log("\nAvailable endpoints:");
    console.log("  GET /health");
    console.log("  GET /auth/start");
    console.log("  GET /auth/token");
    console.log("  GET /tools/get_sleep");
    console.log("  GET /tools/get_exercises");
    console.log("  GET /tools/get_daily_activity");
    console.log("  GET /tools/get_nightly_recharge");
    console.log("  GET /tools/get_user_info");
    console.log("  GET /tools/get_continuous_heart_rate?date=YYYY-MM-DD");
    console.log("  GET /tools/get_cardio_load");
    console.log("  GET /tools/get_activity_samples");
    
    if (!currentTokenData) {
      console.log("\nNo access token found. To authenticate:");
      console.log(`1. Open: http://localhost:${port}/auth/start`);
      console.log("2. Follow the authorization flow in your browser");
    }
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
