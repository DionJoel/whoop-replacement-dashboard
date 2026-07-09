# n8n Workflows für das WHOOP-Alternative Dashboard

Dieses Verzeichnis enthält **n8n-Workflows** für dein Athletik-Dashboard.

---

## 📁 Workflows

### 1. [`daily_fitness_pull.json`](./daily_fitness_pull.json)
**Zweck**: Tägliche Abfrage der Fitness-Daten und Generierung des KI-Dashboards.

**Funktionen**:
- ✅ **Cron-Trigger** (täglich um 9 Uhr)
- ✅ **Health-Checks** für Ollama und TimescaleDB (mit Discord-Benachrichtigung)
- ✅ **Fehlerbehandlung** mit Discord-Benachrichtigungen
- ✅ **Datenabfrage** aus der `view_ai_daily_context`
- ✅ **KI-Analyse** mit Ollama (`mistral-7b-instruct:q4_0`)
- ✅ **Markdown-Export** nach Obsidian
- ✅ **Erfolgsbenachrichtigung** per Discord

**Voraussetzungen**:
- Ollama-Container läuft mit geladenem Modell (`mistral-7b-instruct:q4_0`)
- TimescaleDB mit den Views aus `init-db/01_init_timescaledb.sql`
- E-Mail-SMTP-Konfiguration in `.env`
- Obsidian-Vault gemountet (z. B. `/obsidian-vault`)

**Umgebungsvariablen**:
```bash
# Ollama
OLLAMA_MODEL=mistral-7b-instruct:q4_0 # Oder dein gewähltes Modell

# Discord
DISCORD_WEBHOOK_URL=DEINE_DISCORD_WEBHOOK_URL

# Obsidian
OBSIDIAN_VAULT_PATH=/obsidian-vault
```

---

## 🚀 Import-Anleitung

### 1. Workflow in n8n importieren
1. Öffne n8n (http://localhost:5678)
2. Klicke auf **"Workflows"** → **"Import"**
3. Wähle die Datei `daily_fitness_pull.json` aus
4. Klicke auf **"Import"**

### 2. Credentials konfigurieren
1. Gehe zu **"Credentials"**
2. Erstelle neue Credentials für:
   - **PostgreSQL** (TimescaleDB)
     - Host: `timescaledb`
     - Port: `5432`
     - Database: `athlete_metrics` (oder dein DB-Name)
     - User: `dion` (oder dein Benutzername)
     - Password: (aus `.env`)
   - **Discord:** Keine separaten Credentials nötig, die Webhook-URL wird direkt aus der `.env` gelesen.

---

## 🛠️ Geplante Workflows

| Workflow | Beschreibung | Status |
|----------|-------------|--------|
| `mcp_data_pull.json` | Ruft **alle** MCP-Server (Polar, Hevy, Intervals, Withings, Cronometer) ab und schreibt die Daten in die TimescaleDB. | ⏳ |

---

## 📝 Hinweise
- Die Workflows sind **modular** aufgebaut. Du kannst sie einzeln importieren und kombinieren.
- Alle Workflows nutzen **Umgebungsvariablen** aus `.env` für maximale Flexibilität.
- **Sicherheit**: Stelle sicher, dass sensible Daten (API-Keys, Passwörter) **nie** im Repository landen!
