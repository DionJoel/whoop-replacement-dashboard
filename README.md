# Whoop Replacement Dashboard (Self-Hosted)

Dieses Repository enthält die Infrastruktur, um ein proprietäres WHOOP-Abonnement durch ein lokales, selbstgehostetes Fitness- und Athletik-Dashboard zu ersetzen. 

Das System nutzt einen **Hybrid-Ansatz**: Eine Docker-Infrastruktur (n8n + TimescaleDB) sammelt im Hintergrund vollautomatisch und ohne offene Ports deine Daten. Ein maßgeschneiderter **MCP-Server (Model Context Protocol)** aggregiert diese Daten als kompakte CSV-Trends und stellt sie direkt Claude (Desktop/Obsidian) als intelligenten "KI-Coach" zur Verfügung.

## 🚀 Getting Started

1. Kopiere `.env-example` nach `.env`.
2. Fülle in `.env` die Werte für:
   - `POSTGRES_USER`
   - `POSTGRES_PASSWORD`
   - `POSTGRES_DB`
   - `WEBHOOK_URL`
   - optional `MCP_SERVER_PORT`
   - optional `CRONOMETER_USERNAME`
   - optional `CRONOMETER_PASSWORD`
3. Starte die Infrastruktur:
   - lokal: `docker compose up -d`
   - über Portainer: Repo als Stack einbinden und den Stack starten
     * Achte darauf, dass die Stack-Umgebungsvariablen aus `.env` geladen werden.
     * Alternativ kannst du die Werte direkt im Portainer-Stack-Editor eintragen.
4. Prüfe die Services:
   - `http://localhost:5678` für n8n
   - `http://localhost:3000/health` für den MCP-Server
   - `http://localhost:3000/trends` für den MCP-Server-CSV-Export

> Portainer ist nur die Oberfläche für Docker. Die Container und Abhängigkeiten laufen weiterhin im Compose-Stack.

### 🌐 Hinweis für GitHub Codespaces
Wenn du in GitHub Codespaces entwickelst, funktioniert `localhost` für OAuth-Redirects (Polar, Withings) nicht.
1. Setze die Ports `5678` (n8n) und `3000` (MCP) im Codespaces-Panel auf **Public**.
2. Nutze die Codespaces-URLs (z.B. `https://<codespace>-5678.app.github.dev`) als Redirect URIs in den Developer-Portalen.
3. Trage diese URLs auch in deine `.env` bei `WEBHOOK_URL` und `POLAR_REDIRECT_URI` ein.

## 🧠 n8n Workflow

Importiere `workflows/athlete_sync_workflow.json` in dein n8n und richte die API-Zugangsdaten ein:

- Polar: OAuth2-Credentials
- Intervals: `INTERVALS_API_TOKEN`
- Habitica: `HABITICA_USER_ID` + `HABITICA_API_TOKEN`
- Hevy: `HEVY_API_KEY`
- Withings: OAuth2-Credentials (via EU Medical Cloud)
  * **Auth URL:** `https://account.withings.com/oauth2_user/authorize2`
  * **Access Token URL:** `https://wbsapi.withings.net/v2/oauth2`
  * **Scope:** `user.metrics`
  * **Callback URL in Withings:** `<deine-n8n-url>/rest/oauth2-credential/callback`

Danach kannst du den Workflow manuell testen oder täglich um 06:00 Uhr automatisch ausführen lassen.

## � Polar AccessLink Helper

Der MCP-Server stellt jetzt einfache Polar-AccessLink-Endpunkte bereit:

- `GET /polar/auth-url` – erzeugt die OAuth2-Autorisierungs-URL
- `GET /polar/callback?code=<code>` – tauscht den Autorisierungscode gegen Access- und Refresh-Token aus
- `GET /polar/refresh` – erneuert das Access-Token aus `POLAR_REFRESH_TOKEN`
- `GET /polar/sleep` – liest die neuesten Schlafdaten aus Polar AccessLink aus

Zusätzlich gibt es jetzt eine schlanke Cronometer-Integration (kein offizieller API-Zugriff):

- `GET /cronometer/health` – prüft, ob Cronometer mit den Login-Daten authentifiziert werden kann
- `GET /cronometer/debug` – führt eine Diagnose durch und zeigt Login-, Browser- und Proxy-Status
- `GET /cronometer/export?type=daily_summary&start=2026-06-01&end=2026-06-07` – lädt einen CSV-Export von Cronometer
Fehlerhandling:
- Ungültiger Exporttyp liefert `400` mit `invalid_export_type`
- Cronometer-Zugriffe können von der Host-Umgebung oder dem Netzwerk blockiert werden; dies wird als `502` mit `cronometer_access_blocked` gemeldet
- Optional: `CRONOMETER_PROXY_URL` kann gesetzt werden, wenn Cronometer aus deinem aktuellen Netzwerk blockiert ist
- Ungültiges Datum liefert `400` mit `invalid_date`
- Login-Probleme oder falsche Anmeldedaten liefern `401` bzw. `502` mit einem klaren Fehlercode
- Netzwerk- oder Cronometer-Serverfehler werden als `502` mit `network_error` / `export_failed` ausgegeben
Du kannst diese Endpunkte ebenfalls als lokale Hilfs-API nutzen, um Cronometer-Daten in deine n8n-Workflows oder das MCP-Setup einzubauen.
## 📊 Intervals.icu Integration

Intervals.icu-Endpunkte stellen deine Trainingsdaten (Fitness/Form, Aktivitäten) über HTTP zur Verfügung:

- `GET /intervals/athlete` – gibt Athleten-Profildaten zurück (Name, Gewicht, Ruhepuls, etc.)
- `GET /intervals/fitness?start=2026-06-01&end=2026-06-07` – liefert CTL/ATL/TSB-Werte (JSON)
- `GET /intervals/fitness-csv?start=2026-06-01&end=2026-06-07` – liefert CTL/ATL/TSB als CSV
- `GET /intervals/activities?start=2026-06-01&end=2026-06-07` – liefert Trainingsaktivitäten (JSON)
- `GET /intervals/activities-csv?start=2026-06-01&end=2026-06-07` – liefert Aktivitäten als CSV

Anforderung: `API_KEY`, `INTERVALS_KEY` und `ATHLETE_ID` müssen in `.env` gesetzt sein.
## �📌 Portainer-Hinweis

Wenn du Portainer verwendest, kannst du diesen Ordner als Git-Repo-Stack einbinden. Wichtig:

- `docker-compose.yml` bleibt unverändert
- `PORTAINER` lädt die Umgebungsvariablen aus dem Stack-Editor oder einer `.env`-Datei
- `n8n` speichert jetzt seine Daten im Docker-Volume `n8n_data`, damit der Service Schreibrechte hat

## 🚀 Features & Datenquellen
* **Polar Open Access API:** Abruf von HRV (RMSSD), Ruhepuls und Schlaf-Scores via Polar Loop.
* **Hevy App API:** Erfassung von Krafttraining & Cross-X (Volumen, Reps, RPE, Übungen) via zeitgesteuertem API-Pull.
* **Intervals.icu API:** Direktes Auslesen deiner kardiovaskulären Formkurve (CTL/Fitness, ATL/Fatigue, TSB/Form).
* **Habitica API:** Tracking deiner täglichen Gewohnheiten und Disziplin (z. B. Uni-Lernzeiten, Stretching).
* **Storage (TimescaleDB):** PostgreSQL-Zeitreihendatenbank, die über optimierte SQL-Views monatliche und quartalsweise CSV-Aggregate für LLMs mundgerecht vorbereitet.

---

## 📂 Ordnerstruktur

```text
whoop-replacement-dashboard/
├── init-db/
│   └── 01_init_timescaledb.sql   # Automatisches Tabellen-, Hypertable- & View-Setup
├── workflows/
│   ├── polar_integration.json
│   └── athlete_sync_workflow.json # Zentraler n8n-Workflow für alle API-Pulls
├── mcp-server/                   # Quellcode für den Fitness-MCP-Server (Claude-Anbindung)
│   ├── index.ts
│   └── package.json
├── .env.example                  # Vorlage für Umgebungsvariablen (DB & API-Keys)
├── .gitignore                    # Ignoriert sensible Daten und DB-Volumes
├── docker-compose.yml            # Container-Infrastruktur (n8n + TimescaleDB)
└── README.md                     # Diese Dokumentation