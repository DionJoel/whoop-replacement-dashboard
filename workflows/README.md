# n8n Workflows für das WHOOP-Alternative Dashboard

Dieses Verzeichnis enthält **vorkonfigurierte n8n-Workflows** für dein Athletik-Dashboard.

---

## 📁 Workflows

### 1. [`daily_fitness_pull.json`](./daily_fitness_pull.json)
**Zweck**: Tägliche Abfrage der Fitness-Daten und Generierung des KI-Dashboards.

**Funktionen**:
- ✅ **Cron-Trigger** (täglich um 9 Uhr)
- ✅ **Health-Checks** für Ollama und TimescaleDB
- ✅ **Fehlerbehandlung** mit E-Mail-Benachrichtigungen
- ✅ **Datenabfrage** aus der `view_ai_daily_context`
- ✅ **KI-Analyse** mit Ollama (`mistral-7b-instruct:q4_0`)
- ✅ **Markdown-Export** nach Obsidian
- ✅ **Erfolgsbenachrichtigung** per E-Mail

**Voraussetzungen**:
- Ollama-Container läuft mit geladenem Modell (`mistral-7b-instruct:q4_0`)
- TimescaleDB mit den Views aus `init-db/01_init_timescaledb.sql`
- E-Mail-SMTP-Konfiguration in `.env`
- Obsidian-Vault gemountet (z. B. `/obsidian-vault`)

**Umgebungsvariablen**:
```bash
# Ollama
OLLAMA_MODEL=mistral-7b-instruct:q4_0

# E-Mail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=deine.email@gmail.com
SMTP_PASSWORD=DEIN_APP_PASSWORT
SMTP_FROM=deine.email@gmail.com
SMTP_TO=deine.email@gmail.com
SMTP_SECURE=false

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
   - **SMTP** (E-Mail)
     - Host: (aus `.env`)
     - Port: (aus `.env`)
     - User: (aus `.env`)
     - Password: (aus `.env`)

### 3. Workflow anpassen
- **Cron-Expression**: Ändere den Trigger in `cron-trigger`, falls du eine andere Uhrzeit möchtest
- **Ollama-Modell**: Passe `OLLAMA_MODEL` in `.env` an (z. B. `gemma4:e4b-qat`)
- **Obsidian-Pfad**: Setze `OBSIDIAN_VAULT_PATH` in `.env` auf den Pfad zu deinem Obsidian-Vault

### 4. Workflow aktivieren
- Klicke auf den **"Toggle"**-Schalter (oben rechts im Workflow)
- Der Workflow sollte jetzt **grün** sein (aktiv)

---

## 🔄 Manueller Test
1. Klicke auf **"Execute Workflow"** (Play-Button oben rechts)
2. Prüfe die Logs in der **Execution Preview**
3. Prüfe dein E-Mail-Postfach auf die Benachrichtigung
4. Prüfe dein Obsidian-Vault auf die neue Datei `00_Athletik_Dashboard_YYYY-MM-DD.md`

---

## 📌 Tipps & Tricks

### 1. Workflow debuggen
- Nutze **"Execute Node"** (Rechtsklick auf einen Node) zum Testen einzelner Schritte
- Prüfe die **Execution Logs** für Fehler

### 2. Daten manuell abfragen
Falls du die Daten vor dem KI-Prompt prüfen möchtest:
```sql
-- Täglicher Kontext
SELECT * FROM view_ai_daily_context ORDER BY day_date DESC LIMIT 7;

-- Wöchentliche Trends
SELECT * FROM view_athlete_weekly_trends ORDER BY week_start DESC LIMIT 4;
```

### 3. Ollama testen
```bash
# Modell laden
curl -X POST http://localhost:11434/api/pull -d '{"name": "mistral-7b-instruct:q4_0"}'

# Modell testen
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model": "mistral-7b-instruct:q4_0", "prompt": "Erkläre die Trainingslehre von Arthur Lydiard in 2 Sätzen.", "stream": false}'
```

### 4. E-Mail testen
Nutze den **"Send Test Email"**-Node in n8n, um die SMTP-Konfiguration zu prüfen.

---

## 🛠️ Erweitere Workflows (geplant)

| Workflow | Beschreibung | Status |
|----------|-------------|--------|
| `polar_data_pull.json` | Täglicher Pull von Polar-Daten (Schlaf, HRV) | ⏳ |
| `withings_data_pull.json` | Täglicher Pull von Withings-Daten (Gewicht, Körperfett) | ⏳ |
| `hevy_data_pull.json` | Täglicher Pull von Hevy-Daten (Krafttraining) | ⏳ |
| `intervals_data_pull.json` | Täglicher Pull von Intervals.icu-Daten (CTL/ATL) | ⏳ |
| `habitica_data_pull.json` | Täglicher Pull von Habitica-Daten (Produktivität) | ⏳ |

---

## 📝 Notizen
- Die Workflows sind **modular** aufgebaut. Du kannst sie einzeln importieren und kombinieren.
- Alle Workflows nutzen **Umgebungsvariablen** aus `.env` für maximale Flexibilität.
- **Sicherheit**: Stelle sicher, dass die E-Mail-Credentials und API-Keys **nie** im Repository landen!
