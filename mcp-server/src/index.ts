import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { exchangePolarCode, fetchPolarSleep, getPolarAuthUrl, refreshPolarToken } from './polar';
import { CronometerError, fetchCronometerExport, fetchCronometerHealth, fetchCronometerDiagnostics } from './cronometer';
import { IntervalsError, fetchIntervalsAthlete, fetchIntervalsFitness, fetchIntervalsActivities, exportIntervalsFitnessCsv, exportIntervalsActivitiesCsv } from './intervals';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const port = Number(process.env.MCP_SERVER_PORT ?? 3000);
const pool = new Pool({
  host: process.env.DB_HOST ?? 'timescaledb',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

app.get('/health', async (_, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('DB health check failed:', error);
    res.status(500).json({ status: 'error' });
  }
});

app.get('/trends', async (_, res) => {
  try {
    const result = await pool.query(
      `SELECT timestamp, hrv_rmssd, resting_heart_rate, sleep_score
       FROM polar_metrics
       ORDER BY timestamp DESC
       LIMIT 20`
    );

    const csvLines = [
      'timestamp,hrv_rmssd,resting_heart_rate,sleep_score',
      ...result.rows.map((row: any) => {
        const timestamp = new Date(row.timestamp).toISOString();
        return [
          timestamp,
          row.hrv_rmssd ?? '',
          row.resting_heart_rate ?? '',
          row.sleep_score ?? '',
        ].join(',');
      }),
    ];

    res.type('text/plain').send(csvLines.join('\n'));
  } catch (error) {
    console.error('Query failed:', error);
    res.status(500).json({ error: 'query_failed' });
  }
});

// ============================================================================
// MCP SERVER SETUP (Model Context Protocol)
// ============================================================================

const mcpServer = new Server(
  {
    name: 'fitness-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_fitness_trends',
        description: 'Holt die aggregierten wöchentlichen Fitness-, Schlaf- und Gesundheitsdaten des Athleten aus der Datenbank.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Anzahl der Wochen, die abgerufen werden sollen (Standard: 4)',
            },
          },
        },
      },
    ],
  };
});

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'get_fitness_trends') {
    const limit = (request.params.arguments?.limit as number) ?? 4;
    try {
      const result = await pool.query(
        `SELECT * FROM view_athlete_weekly_trends ORDER BY week_start DESC LIMIT $1`,
        [limit]
      );

      if (result.rows.length === 0) {
        return { content: [{ type: 'text', text: 'Keine Daten in der Datenbank gefunden.' }] };
      }

      const headers = Object.keys(result.rows[0]).join(',');
      const rows = result.rows.map((row) =>
        Object.values(row).map((val) => (val === null ? '' : val)).join(',')
      );
      const csv = [headers, ...rows].join('\n');

      return { content: [{ type: 'text', text: csv }] };
    } catch (error: any) {
      return { content: [{ type: 'text', text: `Datenbankfehler: ${error.message}` }], isError: true };
    }
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

let sseTransport: SSEServerTransport | null = null;

app.get('/mcp/sse', async (req, res) => {
  sseTransport = new SSEServerTransport('/mcp/messages', res);
  await mcpServer.connect(sseTransport);
});

app.post('/mcp/messages', async (req, res) => {
  if (sseTransport) {
    await sseTransport.handlePostMessage(req, res);
  } else {
    res.status(400).send('SSE not initialized');
  }
});

app.get('/polar/auth-url', (_, res) => {
  try {
    const url = getPolarAuthUrl();
    res.json({ authorization_url: url });
  } catch (error: any) {
    console.error('Polar auth url failed:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/polar/auth', async (_, res) => {
  const authUrl = getPolarAuthUrl();
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Polar OAuth Setup</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 700px; margin: 50px auto; padding: 20px; }
    .card { border: 1px solid #ddd; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .step { margin: 20px 0; padding: 15px; background: #f9f9f9; border-left: 4px solid #007bff; }
    .step-num { font-weight: bold; color: #007bff; font-size: 1.2em; }
    input, button { padding: 10px; margin: 5px 0; font-size: 14px; }
    input { width: 100%; box-sizing: border-box; }
    button { background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #0056b3; }
    .code-box { background: #f0f0f0; padding: 10px; border-radius: 4px; word-break: break-all; margin: 10px 0; font-family: monospace; }
    .success { color: green; }
    .error { color: red; }
  </style>
</head>
<body>
  <h1>🔐 Polar OAuth Setup</h1>
  
  <div class="step">
    <span class="step-num">Step 1:</span> Open this link and authorize the app (do NOT use localhost URL if it fails):
    <div class="code-box">
      <a href="${authUrl}" target="_blank" style="color: #007bff; text-decoration: underline;">
        Click here to authorize with Polar
      </a>
    </div>
  </div>
  
  <div class="step">
    <span class="step-num">Step 2:</span> After authorization, Polar redirects to your configured callback URL.
    <br>Look at the URL bar - copy the <strong>code</strong> parameter.<br>
    <strong>Example:</strong> ${process.env.POLAR_REDIRECT_URI || 'http://localhost:3000/polar/callback'}?<strong style="background: yellow;">code=abc123xyz</strong>
  </div>
  
  <div class="step">
    <span class="step-num">Step 3:</span> Paste the code here:
    <input type="text" id="code" placeholder="Paste code from URL bar" />
    <button onclick="exchangeCode()">Exchange Code for Tokens</button>
  </div>
  
  <div id="result"></div>
  
  <script>
    async function exchangeCode() {
      const code = document.getElementById('code').value.trim();
      if (!code) {
        document.getElementById('result').innerHTML = '<p class="error">❌ Code is required</p>';
        return;
      }
      
      try {
        const response = await fetch(\`/polar/exchange-code?code=\${encodeURIComponent(code)}\`);
        const data = await response.json();
        
        if (response.ok) {
          document.getElementById('result').innerHTML = \`
            <div class="card">
              <h2 class="success">✓ Success!</h2>
              <p>Copy these values to your <strong>.env</strong> file:</p>
              
              <p><strong>POLAR_ACCESS_TOKEN</strong></p>
              <input type="text" value="\${data.access_token}" readonly onclick="this.select()">
              
              <p><strong>POLAR_REFRESH_TOKEN</strong></p>
              <input type="text" value="\${data.refresh_token}" readonly onclick="this.select()">
              
              <p><small>Token expires in \${data.expires_in} seconds</small></p>
            </div>
          \`;
        } else {
          document.getElementById('result').innerHTML = \`<p class="error">❌ Error: \${data.error}</p>\`;
        }
      } catch (e) {
        document.getElementById('result').innerHTML = \`<p class="error">❌ Request failed: \${e.message}</p>\`;
      }
    }
  </script>
</body>
</html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

app.get('/polar/exchange-code', async (req, res) => {
  try {
    const code = req.query.code as string;
    if (!code) {
      return res.status(400).json({ error: 'code parameter is required' });
    }

    const tokenData = await exchangePolarCode(code);
    
    res.json({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      instructions: 'Copy access_token and refresh_token into .env as POLAR_ACCESS_TOKEN and POLAR_REFRESH_TOKEN'
    });
  } catch (error: any) {
    console.error('Polar exchange-code failed:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/polar/callback', async (req, res) => {
  try {
    const code = req.query.code as string;
    if (!code) {
      return res.status(400).json({ error: 'code is required' });
    }

    const tokenData = await exchangePolarCode(code);
    
    // Return HTML with tokens for easy copying
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Polar OAuth Success</title>
  <style>
    body { font-family: monospace; max-width: 600px; margin: 50px auto; padding: 20px; }
    .success { color: green; font-weight: bold; }
    .code { background: #f0f0f0; padding: 10px; border-radius: 5px; word-break: break-all; margin: 10px 0; }
    input { width: 100%; padding: 8px; margin: 5px 0; }
    button { padding: 10px 20px; margin: 5px; cursor: pointer; }
  </style>
</head>
<body>
  <h1 class="success">✓ Polar Authorization Successful!</h1>
  <p>Copy these values into your <code>.env</code> file:</p>
  
  <label><strong>POLAR_ACCESS_TOKEN</strong></label>
  <input type="text" value="${tokenData.access_token}" readonly>
  
  <label><strong>POLAR_REFRESH_TOKEN</strong></label>
  <input type="text" value="${tokenData.refresh_token}" readonly>
  
  <hr>
  <p><small>Or paste directly into .env:</small></p>
  <pre class="code">POLAR_ACCESS_TOKEN=${tokenData.access_token}
POLAR_REFRESH_TOKEN=${tokenData.refresh_token}</pre>
  
  <button onclick="navigator.clipboard.writeText('POLAR_ACCESS_TOKEN=${tokenData.access_token}\\nPOLAR_REFRESH_TOKEN=${tokenData.refresh_token}')">Copy to Clipboard</button>
  <button onclick="window.close()">Close</button>
</body>
</html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error: any) {
    console.error('Polar callback failed:', error);
    res.status(500).send(`
<!DOCTYPE html>
<html>
<head><title>Polar OAuth Error</title></head>
<body>
  <h1 style="color: red;">❌ Polar Authorization Failed</h1>
  <p>${error.message}</p>
</body>
</html>
    `);
  }
});

app.get('/polar/refresh', async (_, res) => {
  try {
    const refreshToken = process.env.POLAR_REFRESH_TOKEN;
    if (!refreshToken) {
      return res.status(400).json({ error: 'POLAR_REFRESH_TOKEN is not configured' });
    }

    const tokenData = await refreshPolarToken(refreshToken);
    res.json(tokenData);
  } catch (error: any) {
    console.error('Polar token refresh failed:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/polar/sleep', async (_, res) => {
  try {
    const accessToken = process.env.POLAR_ACCESS_TOKEN;
    if (!accessToken) {
      return res.status(400).json({ error: 'POLAR_ACCESS_TOKEN is not configured' });
    }

    const sleepData = await fetchPolarSleep(accessToken);
    res.json(sleepData);
  } catch (error: any) {
    console.error('Polar sleep fetch failed:', error);
    res.status(500).json({ error: error.message });
  }
});

function sendErrorResponse(res: express.Response, error: unknown): void {
  if (error instanceof CronometerError) {
    res.status(error.statusCode).json({ error: error.message, code: error.kind });
  } else if (error instanceof IntervalsError) {
    res.status(error.statusCode).json({ error: error.message, code: error.kind });
  } else if (error instanceof Error) {
    res.status(500).json({ error: error.message, code: 'internal_error' });
  } else {
    res.status(500).json({ error: 'Unknown error', code: 'unknown_error' });
  }
}

app.get('/cronometer/health', async (_, res) => {
  try {
    const health = await fetchCronometerHealth();
    res.json(health);
  } catch (error) {
    console.error('Cronometer health failed:', error);
    sendErrorResponse(res, error);
  }
});

app.get('/cronometer/debug', async (_, res) => {
  try {
    const diagnostics = await fetchCronometerDiagnostics();
    res.json(diagnostics);
  } catch (error) {
    console.error('Cronometer diagnostics failed:', error);
    sendErrorResponse(res, error);
  }
});

app.get('/cronometer/export', async (req, res) => {
  try {
    const exportType = (req.query.type as string) ?? 'daily_summary';
    const start = req.query.start as string | undefined;
    const end = req.query.end as string | undefined;

    const csvData = await fetchCronometerExport(exportType, start, end);
    res.type('text/plain').send(csvData);
  } catch (error) {
    console.error('Cronometer export failed:', error);
    sendErrorResponse(res, error);
  }
});

app.get('/intervals/athlete', async (_, res) => {
  try {
    const athlete = await fetchIntervalsAthlete();
    res.json(athlete);
  } catch (error) {
    console.error('Intervals athlete fetch failed:', error);
    sendErrorResponse(res, error);
  }
});

app.get('/intervals/fitness', async (req, res) => {
  try {
    // Support both 'start'/'end' and 'oldest'/'newest' parameter naming
    const start = (req.query.start ?? req.query.oldest) as string | undefined;
    const end = (req.query.end ?? req.query.newest) as string | undefined;

    const fitness = await fetchIntervalsFitness(start, end);
    res.json(fitness);
  } catch (error) {
    console.error('Intervals fitness fetch failed:', error);
    sendErrorResponse(res, error);
  }
});

app.get('/intervals/fitness-csv', async (req, res) => {
  try {
    const start = (req.query.start ?? req.query.oldest) as string | undefined;
    const end = (req.query.end ?? req.query.newest) as string | undefined;

    const csvData = await exportIntervalsFitnessCsv(start, end);
    res.type('text/plain').send(csvData);
  } catch (error) {
    console.error('Intervals fitness CSV export failed:', error);
    sendErrorResponse(res, error);
  }
});

app.get('/intervals/activities', async (req, res) => {
  try {
    const start = (req.query.start ?? req.query.oldest) as string | undefined;
    const end = (req.query.end ?? req.query.newest) as string | undefined;

    const activities = await fetchIntervalsActivities(start, end);
    res.json(activities);
  } catch (error) {
    console.error('Intervals activities fetch failed:', error);
    sendErrorResponse(res, error);
  }
});

app.get('/intervals/activities-csv', async (req, res) => {
  try {
    const start = (req.query.start ?? req.query.oldest) as string | undefined;
    const end = (req.query.end ?? req.query.newest) as string | undefined;

    const csvData = await exportIntervalsActivitiesCsv(start, end);
    res.type('text/plain').send(csvData);
  } catch (error) {
    console.error('Intervals activities CSV export failed:', error);
    sendErrorResponse(res, error);
  }
});

app.listen(port, () => {
  console.log(`MCP server listening on port ${port}`);
});
