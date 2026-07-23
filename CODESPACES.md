# GitHub Codespaces - Setup Guide

## 1. Repository öffnen
1. VS Code öffnen
2. **Strg+Shift+P** → `GitHub: Clone Repository`
3. Repository auswählen und öffnen

## 2. .env-Datei anpassen
```bash
# Vorhandene .env Beispiel
cp .env-example .env
```

**Wichtige Variablen für Intervals.ICU:**
```
INTERVALS_KEY=DEIN_API_KEY
ATHLETE_ID=DEINE_ATHLETE_ID
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

## 3. Docker-Netzwerk erstellen
```bash
docker network create app_network
```

## 4. Container starten
```bash
docker-compose -f docker-compose-codespace.yml up -d n8n intervals-mcp
```

## 5. Ports freigeben
1. Unten in VS Code: **"Ports"**-Tab
2. Port **`5678`** (n8n) → **"Public"** klicken
3. Port **`3001`** (MCP-Server) → **"Public"** klicken

## 6. MCP-Server testen
```bash
curl -s http://localhost:3001/mcp -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

## 7. n8n öffnen
- URL: `https://[codespace-name].github.dev:5678`
- Oder: **Ports-Tab** → **5678** → **"Open in Browser"**

## 8. Workflow importieren
1. In n8n: **"Workflows"** → **"Import"** → **"From File"**
2. Datei auswählen: `workflows/mcp_intervals_test.json`
3. Workflow aktivieren und testen

## 9. Daten in TimescaleDB speichern (optional)
Füge nach "Get Activities" einen **Postgres-Node** hinzu:
- Host: `timescaledb`
- Port: `5432`
- DB: `athlete_metrics`
- Tabelle: `intervals_metrics`

## Docker-Befehle
| Befehl | Beschreibung |
|--------|--------------|
| `docker-compose -f docker-compose-codespace.yml down` | Alle Container stoppen |
| `docker-compose -f docker-compose-codespace.yml up -d` | Alle Container starten |
| `docker logs intervals-mcp` | MCP-Server Logs |
| `docker logs n8n` | n8n Logs |

## Wichtige Ports
| Service | Port | Beschreibung |
|---------|------|--------------|
| n8n | 5678 | Web-UI |
| intervals-mcp | 3001 | MCP-Server |
| TimescaleDB | 5432 | Datenbank |

## Fehlersuche
- **Connection refused?** → Container läuft? `docker ps`
- **Port nicht freigegeben?** → Ports-Tab prüfen
- **MCP-Server Fehler?** → `curl http://localhost:3001/mcp` testen
- **n8n erreicht MCP nicht?** → URL prüfen: `http://intervals-mcp:3001/mcp` (Docker-intern)
