/**
 * Minimaler MCP-Server für Fitness-Daten
 * Bereitstellt Tools für Claude Desktop zur Abfrage von:
 * - Wöchentlichen Fitness-Trends (Polar, Intervals, Hevy, Withings, Habitica)
 * - Täglichem Kontext für den KI-Coach
 */

import dotenv from 'dotenv';
import { Pool } from 'pg';
import {
  Server,
} from '@modelcontextprotocol/sdk/server/index.js';
import {
  StdioServerTransport,
} from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Umgebungsvariablen laden
dotenv.config();

// Datenbank-Verbindung
const pool = new Pool({
  host: process.env.DB_HOST ?? 'timescaledb',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.POSTGRES_DB ?? 'athlete_metrics',
  user: process.env.POSTGRES_USER ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD ?? 'postgres',
  max: 10, // Maximal 10 Verbindungen im Pool
  idleTimeoutMillis: 30000, // 30 Sekunden Timeout für inaktive Verbindungen
  connectionTimeoutMillis: 5000, // 5 Sekunden Timeout für neue Verbindungen
});

// Testet die Datenbank-Verbindung
async function testDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('Datenbank-Verbindungsfehler:', error);
    return false;
  }
}

// Konvertiert SQL-Ergebnisse zu Markdown-Tabelle
function sqlToMarkdown(rows: any[], title: string): string {
  if (rows.length === 0) {
    return `### ${title}\nKeine Daten verfügbar.`;
  }

  const headers = Object.keys(rows[0]);
  const headerRow = `| ${headers.join(' | ')} |`;
  const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;

  const dataRows = rows.map((row) => {
    return `| ${headers
      .map((header) => {
        const value = row[header];
        if (value === null || value === undefined) return '-';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
      })
      .join(' | ')} |`;
  });

  return `### ${title}\n\n${headerRow}\n${separatorRow}\n${dataRows.join('\n')}`;
}

// Konvertiert SQL-Ergebnisse zu CSV
function sqlToCsv(rows: any[]): string {
  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(','),
    ...rows.map((row) => {
      return headers
        .map((header) => {
          const value = row[header];
          if (value === null || value === undefined) return '';
          // Escape von Kommas und Anführungszeichen
          const strValue = String(value)
            .replace(/"/g, '""')
            .replace(/\n/g, ' ');
          return strValue.includes(',') ? `"${strValue}"` : strValue;
        })
        .join(',');
    }),
  ];

  return csvLines.join('\n');
}

// MCP-Server initialisieren
const server = new Server(
  {
    name: 'whoop-replacement-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool: get_fitness_trends (Wöchentliche Trends)
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_fitness_trends',
        description:
          'Holt aggregierte wöchentliche Fitness-Daten aus der Datenbank. Gibt die Daten als Markdown-Tabelle oder CSV zurück.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Anzahl der Wochen (Standard: 4)',
              default: 4,
            },
            format: {
              type: 'string',
              enum: ['markdown', 'csv'],
              description: 'Ausgabeformat (Standard: markdown)',
              default: 'markdown',
            },
          },
        },
      },
      {
        name: 'get_daily_context',
        description:
          'Holt den täglichen Kontext für den KI-Coach (letzte 30 Tage).',
        inputSchema: {
          type: 'object',
          properties: {
            days: {
              type: 'number',
              description: 'Anzahl der Tage (Standard: 30)',
              default: 30,
            },
            format: {
              type: 'string',
              enum: ['markdown', 'csv'],
              description: 'Ausgabeformat (Standard: markdown)',
              default: 'markdown',
            },
          },
        },
      },
      {
        name: 'get_hevy_volume',
        description:
          'Holt die wöchentlichen Krafttrainings-Volumen-Daten (Hevy).',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Anzahl der Wochen (Standard: 4)',
              default: 4,
            },
            format: {
              type: 'string',
              enum: ['markdown', 'csv'],
              description: 'Ausgabeformat (Standard: markdown)',
              default: 'markdown',
            },
          },
        },
      },
      {
        name: 'get_habitica_stats',
        description:
          'Holt die wöchentlichen Habitica-Statistiken (erledigte Aufgaben, etc.).',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Anzahl der Wochen (Standard: 4)',
              default: 4,
            },
            format: {
              type: 'string',
              enum: ['markdown', 'csv'],
              description: 'Ausgabeformat (Standard: markdown)',
              default: 'markdown',
            },
          },
        },
      },
      {
        name: 'health_check',
        description: 'Testet die Verbindung zur Datenbank.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Tool-Handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'health_check': {
        const dbOk = await testDatabaseConnection();
        if (dbOk) {
          return {
            content: [
              {
                type: 'text',
                text: '✅ Datenbank-Verbindung erfolgreich. Alle Systeme bereit.',
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: '❌ Datenbank-Verbindung fehlgeschlagen. Bitte prüfe die Umgebungsvariablen (DB_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB).',
              },
            ],
            isError: true,
          };
        }
      }

      case 'get_fitness_trends': {
        const limit = (args as any)?.limit ?? 4;
        const format = (args as any)?.format ?? 'markdown';

        const query = `
          SELECT * FROM view_athlete_weekly_trends
          ORDER BY week_start DESC
          LIMIT $1
        `;
        const result = await pool.query(query, [limit]);

        if (result.rows.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'Keine wöchentlichen Trend-Daten in der Datenbank gefunden.',
              },
            ],
          };
        }

        if (format === 'csv') {
          return {
            content: [
              {
                type: 'text',
                text: sqlToCsv(result.rows),
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: sqlToMarkdown(result.rows, 'Wöchentliche Fitness-Trends'),
              },
            ],
          };
        }
      }

      case 'get_daily_context': {
        const days = (args as any)?.days ?? 30;
        const format = (args as any)?.format ?? 'markdown';

        const query = `
          SELECT * FROM view_ai_daily_context
          WHERE day_date >= CURRENT_DATE - INTERVAL '${days} days'
          ORDER BY day_date DESC
        `;
        const result = await pool.query(query);

        if (result.rows.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'Keine täglichen Kontext-Daten in der Datenbank gefunden.',
              },
            ],
          };
        }

        if (format === 'csv') {
          return {
            content: [
              {
                type: 'text',
                text: sqlToCsv(result.rows),
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: sqlToMarkdown(result.rows, `Täglicher Kontext (letzte ${days} Tage)`),
              },
            ],
          };
        }
      }

      case 'get_hevy_volume': {
        const limit = (args as any)?.limit ?? 4;
        const format = (args as any)?.format ?? 'markdown';

        const query = `
          SELECT * FROM view_hevy_weekly_volume
          ORDER BY week_start DESC
          LIMIT $1
        `;
        const result = await pool.query(query, [limit]);

        if (result.rows.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'Keine Hevy-Volumen-Daten in der Datenbank gefunden.',
              },
            ],
          };
        }

        if (format === 'csv') {
          return {
            content: [
              {
                type: 'text',
                text: sqlToCsv(result.rows),
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: sqlToMarkdown(result.rows, 'Wöchentliches Krafttrainings-Volumen'),
              },
            ],
          };
        }
      }

      case 'get_habitica_stats': {
        const limit = (args as any)?.limit ?? 4;
        const format = (args as any)?.format ?? 'markdown';

        const query = `
          SELECT * FROM view_athlete_weekly_habits
          ORDER BY week_start DESC
          LIMIT $1
        `;
        const result = await pool.query(query, [limit]);

        if (result.rows.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'Keine Habitica-Daten in der Datenbank gefunden.',
              },
            ],
          };
        }

        if (format === 'csv') {
          return {
            content: [
              {
                type: 'text',
                text: sqlToCsv(result.rows),
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: sqlToMarkdown(result.rows, 'Wöchentliche Habitica-Statistiken'),
              },
            ],
          };
        }
      }

      default:
        throw new Error(`Unbekanntes Tool: ${name}`);
    }
  } catch (error: any) {
    console.error(`Fehler im Tool ${name}:`, error);
    return {
      content: [
        {
          type: 'text',
          text: `❌ Fehler im Tool ${name}: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Server starten
async function main() {
  // Datenbank-Verbindung testen
  const dbOk = await testDatabaseConnection();
  if (!dbOk) {
    console.error('❌ Datenbank-Verbindung fehlgeschlagen. Beende Server.');
    process.exit(1);
  }

  console.log('✅ MCP-Server gestartet. Warte auf Verbindungen...');

  // Stdio-Transport für Claude Desktop
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fataler Fehler:', error);
  process.exit(1);
});
