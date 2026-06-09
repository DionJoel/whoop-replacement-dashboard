import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { exchangePolarCode, fetchPolarSleep, getPolarAuthUrl, refreshPolarToken } from './polar';
import { CronometerError, fetchCronometerExport, fetchCronometerHealth, fetchCronometerDiagnostics } from './cronometer';

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

app.get('/polar/auth-url', (_, res) => {
  try {
    const url = getPolarAuthUrl();
    res.json({ authorization_url: url });
  } catch (error: any) {
    console.error('Polar auth url failed:', error);
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
    res.json(tokenData);
  } catch (error: any) {
    console.error('Polar callback failed:', error);
    res.status(500).json({ error: error.message });
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

app.listen(port, () => {
  console.log(`MCP server listening on port ${port}`);
});
