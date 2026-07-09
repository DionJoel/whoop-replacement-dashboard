# 🛠️ Entwicklungskonzept: WHOOP-Alternative (Self‑Hosted)

Dieses Konzept beschreibt den schrittweisen Implementierungsplan für das hybride Athletik‑Dashboard. Das Projekt ist in fünf Sprints unterteilt, um eine stabile, modulare und schrittweise Umsetzung zu gewährleisten.

---

## 📌 Architektur‑Übersicht (Zielbild)

```text
┌─────────────────────────────────────────────────────────────┐
│                    FUJITSU (i7-6700T, 32GB RAM)                  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                 Docker-Container (Dieser Stack)            │  │
│  │  ┌─────────┐  ┌─────────┐                                │  │
│  │  │Polar-MCP│  │Intervals│                                │  │
│  │  │ 3000   │  │ -MCP    │                                │  │
│  │  │        │  │ 3001    │  │         │                  │  │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘   │  │
│  │       │           │           │           │          │  │
│  │       └───────────┴───────────┴───────────┴──────────┘  │  │
│  │                          │                              │  │
│  │                          v                              │  │
│  │               ┌───────────────┐                          │  │
│  │               │  TimescaleDB  │                          │  │
│  │               │ (Externer     │ <------------------------┘  │
│  │               │  Stack)       │                          │  │
│  │                      v                                   │  │
│  │               ┌───────────────┐                          │  │
│  │               │    n8n        │                          │  │
│  │               │ (Daily       │                          │  │
│  │               │  Trigger)     │                          │  │
│  │               └──────┬────────┘                          │  │
│  │                      │                                   │  │
│  │                      v                                   │  │
│  │               ┌───────────────┐                          │  │
│  │               │  Ollama       │                          │  │
│  │               │ (mistral-7b) │                          │  │
│  │               └──────┬────────┘                          │  │
│  │                      │                                   │  │
│  │                      v                                   │  │
│  │               ┌───────────────┐                          │  │
│  │               │  Discord      │                          │  │
│  │               │  (Report)     │                          │  │
│  │               └───────────────┘                          │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                                               ↑
                                               │
[Withings-MCP (Public)]           [Cronometer-MCP (Lokal)]
(https://withings-mcp.com)         (Port 3004)
       ↑                                     ↑
       └─────────────────────────────────────┬─────────────┘
                                         │
                                         v (Optional)
                                 [Claude Desktop für interaktive Analyse]
```
Sprints — Überblick
Sprint 1 — Lokale Infrastruktur & Datenbank (Basis)
Ziel: Die Docker‑Umgebung läuft stabil auf dem Fujitsu Mini‑PC. TimescaleDB und Ollama sind initialisiert; alle Tabellen, Hypertables und Views werden automatisch erzeugt.

[ ] Task 1.1 — Git‑Repo lokal aufbauen
* Struktur laut README.md lokal anlegen.
* .env.example und .gitignore erstellen (Sicherstellen, dass ollama_data/ ignoriert wird).

[ ] Task 1.2 — SQL‑Init‑Skript finalisieren
* init-db/01_init_timescaledb.sql mit erweiterten Tabellen befüllen: polar_metrics, hevy_workouts, intervals_metrics, habitica_events und withings_metrics.
* create_hypertable‑Statements für alle fünf Tabellen hinzufügen.
* Aggregations‑Views (view_athlete_weekly_trends, view_athlete_weekly_habits) am Ende ergänzen (inklusive Withings Gewichts- und KFA-Metriken).

[ ] Task 1.3 — Deployment via Portainer (inkl. Ollama)
* Code auf GitHub (Private Repo) pushen.
* In Portainer als Stack via Git‑Repo einbinden.
* docker-compose.yml um den Ollama-Service und das lokale Volume ollama_data erweitern.
* Lokale .env mit Passwörtern befüllen und Stack starten.
* Modell laden: Per SSH auf den Fujitsu schalten und das Modell via docker exec -it ollama ollama run gemma4:e4b-qat initial herunterladen.

Meilenstein: Mit einem DB‑Client (z. B. DBeaver) verbinden, Existenz der Tabellen/Views prüfen und Test-Ping an Ollama-API (http://<fujitsu-ip>:11434) absetzen.

Sprint 2 — MCP‑Server Integration (Datenquellen)
Ziel: Alle Fitness-Datenquellen über **selbstgehostete MCP-Server** verfügbar machen. n8n fragt die Server per HTTP ab und schreibt die Daten in TimescaleDB. **Keine manuelle API/OAuth2-Integration in n8n nötig!**

[ ] Task 2.1 — MCP‑Server Repositories vorbereiten
* Repositories klonen (oder Docker-Images nutzen):
  - [Polar-MCP](https://github.com/NelsonNew/polar-mcp-server) (Port 3000)
  - [Intervals-MCP](https://github.com/mvilanova/intervals-mcp-server) (Port 3001)
  - Withings: **Öffentlicher Server** (`https://withings-mcp.com/mcp`) – kein Selbsthost nötig

[ ] Task 2.2 — Docker‑Compose für MCP‑Server erstellen
* Alle MCP-Server als Services in `docker-compose.yml` hinzufügen:
  ```yaml
  services:
    polar-mcp:
      build: ./mcp-servers/polar-mcp-server
      ports: ["127.0.0.1:3000:3000"]
      environment:
        - POLAR_CLIENT_ID=${POLAR_CLIENT_ID}
        - POLAR_CLIENT_SECRET=${POLAR_CLIENT_SECRET}
      networks: [app_network]
    
    intervals-mcp:
      build: ./mcp-servers/intervals-mcp-server
      ports: ["127.0.0.1:3001:3001"]
      environment:
        - INTERVALS_KEY=${INTERVALS_KEY}
        - ATHLETE_ID=${ATHLETE_ID}
      networks: [app_network]
  ```
* **Withings-MCP** wird **nicht selbst gehostet** (öffentlicher Server).

[ ] Task 2.3 — OAuth2‑Credentials für MCP‑Server sammeln
* **Polar:** [AccessLink registrieren](https://admin.polaraccesslink.com/) → Client ID/Secret
* **Intervals.icu:** [API‑Key generieren](https://intervals.icu/user/settings) → Key + Athlete ID
* **Hevy:** [API‑Key generieren](https://hevyapp.com/settings/api)
* **Garmin:** [Developer App registrieren](https://developer.garmin.com/) → Client ID/Secret (für Fenix 6 Pro)
* **Withings:** ❌ Nicht nötig (öffentlicher MCP-Server)
* **Alle Credentials in `.env` speichern** (siehe `.env-example`).

[ ] Task 2.4 — n8n‑Workflow für MCP‑Server anpassen
* **Statt direkte API‑Calls:** HTTP‑Nodes an die MCP‑Server:
  - Polar: `http://polar-mcp:3000/mcp/tools/get_exercises` (oder `/get_sleep`)
  - Intervals: `http://intervals-mcp:3001/mcp/tools/get_daily_activity`
  - Hevy: `http://hevy-mcp:3002/mcp/tools/get_workouts`
  - Garmin: `http://garmin-mcp:3003/mcp/tools/get_activities`
  - Withings: `https://withings-mcp.com/mcp/tools/get_sleep` (öffentlich)
* **Datenformat:** MCP-Server liefern JSON – direkt in TimescaleDB Inserts mappen.
* **Vorteil:** Kein OAuth2-Handshake in n8n! MCP-Server kümmern sich drum.

[ ] Task 2.5 — Daten in TimescaleDB speichern
* Postgres‑Node hinter jeden MCP‑HTTP‑Call hängen.
* Daten in die **Raw‑Tabellen** schreiben (z. B. `polar_metrics`, `garmin_activities`).
* **Hinweis:** Die Tabellenschemata bleiben gleich wie in Sprint 1 definiert.

Meilenstein: Alle MCP‑Server laufen, n8n-Workflow triggern und prüfen, ob alle **5 Raw‑Tabellen** (Polar, Intervals, Hevy, Garmin, Withings) echte Daten enthalten.

Sprint 3 — Datenkomprimierung & SQL‑Feinschliff
Ziel: SQL‑Views aggregieren Daten korrekt und liefern hochgradig komprimierte Zeitreihen für die LLM-Verarbeitung.

[ ] Task 3.1 — Cross‑X & Kraftsport‑Metriken validieren
* Hevy‑Volumen und RPE‑Werte korrekt summiert/gewichtet prüfen.

[ ] Task 3.2 — Biometrie- & Belastungs‑Verknüpfung
* CTL/ATL aus Intervals mit Polar HRV und Withings Gewichtstrends synchronisieren (LEFT JOINs über das Datum exakt kalibrieren).

[ ] Task 3.3 — CSV‑Export‑Test
* SELECT * FROM view_athlete_weekly_trends; ausführen und das tabellarische Ergebnis auf Plausibilität prüfen.

Sprint 4 — Claude Desktop & Cronometer Integration
Ziel: Alle MCP‑Server in Claude Desktop einbinden für **direkte Abfragen und Ad‑hoc‑Analysen**. Cronometer wird als zusätzlicher MCP‑Server hinzugefügt.

[ ] Task 4.1 — Alle MCP‑Server in Claude Desktop einbinden
* **Polar:** `http://localhost:3000/mcp` (lokal gehostet)
* **Withings:** `https://withings-mcp.com/mcp` (öffentlicher Server)
* **Intervals.icu:** `http://localhost:3001/mcp` (lokal gehostet)
* **Hevy:** `http://localhost:3002/mcp` (lokal gehostet)
* **Garmin:** `http://localhost:3003/mcp` (lokal gehostet – für deine **Fenix 6 Pro Sapphire**)
* **Anleitung:** In Claude Desktop → **Settings → Connectors → + Add Custom Connector** → URL eintragen → Autorisieren

[ ] Task 4.2 — Cronometer‑MCP einbinden
* Community‑MCP‑Server [cronometer‑api‑mcp](https://github.com/modelcontextprotocol/servers/tree/main/src/cronometer) selbst hosten (Port 3004).
* In Claude Desktop hinzufügen: `http://localhost:3004/mcp`
* Cronometer‑Credentials (E‑Mail/Passwort) in der MCP‑Server‑Konfig hinterlegen.

[ ] Task 4.3 — Lokalen MCP‑Server für TimescaleDB bauen (optional)
* Projekt‑Setup (`mcp‑server/`): `npm init`, @modelcontextprotocol/sdk und pg installieren.
* TypeScript‑Konfiguration erstellen.
* Tool `get_fitness_trends` mit Parameter `interval` (weekly, monthly, quarterly) registrieren.
* SQL‑Views (`view_athlete_weekly_trends`, `view_athlete_weekly_habits`) abfragen und als CSV/JSON an Claude liefern.
* **URL für Claude Desktop:** `http://localhost:8000/mcp`

Meilenstein: Claude Desktop starten. Das Tools‑Icon (Hammer) muss **alle 7 MCP‑Server** fehlerfrei anzeigen:
- Polar (`http://localhost:3000/mcp`)
- Withings (`https://withings-mcp.com/mcp`)
- Intervals (`http://localhost:3001/mcp`)
- Hevy (`http://localhost:3002/mcp`)
- Garmin (`http://localhost:3003/mcp`) – **für deine Fenix 6 Pro Sapphire**
- Cronometer (`http://localhost:3004/mcp`)
- Lokal (`http://localhost:8000/mcp`)

Sprint 5 — Der KI‑Coach (Lokaler Cronjob & Discord)
Ziel: Das System agiert vollautark. n8n triggert die lokale LLM (mistral-7b-instruct:q4_0) im Hintergrund, erzeugt das fertige Dashboard aus **TimescaleDB-Daten** und sendet es per **Discord**. Alle Fitness-Daten kommen von den MCP-Servern (Sprint 2).

[ ] Task 5.1 — System‑Prompt & Structured Output für Ollama
* In n8n die HTTP-Node für Ollama (`http://ollama:11434/api/generate`) mit **mistral-7b-instruct:q4_0** konfigurieren.
* System-Prompt für mistral-7b definieren: Fokus auf tabellarische Wochenübersicht, Sport-Empfehlung (unter Berücksichtigung von Regeneration, Cross-X-Volumen, Gewicht, **Garmin-Daten von der Fenix 6 Pro**) sowie Uni-Lernfenster.
* **Modellparameter anpassen:**
  ```json
  {
    "temperature": 0.3,
    "num_predict": 2048,
    "repeat_penalty": 1.1,
    "stop": ["\n\n"]
  }
  ```

[ ] Task 5.2 — Discord-Integration für Reports & Errors
* **Daily Report:** `Send Discord Report`-Node (Type: `n8n-nodes-base.discord`) mit:
  - `webhookUrl`: `{{ $env.DISCORD_WEBHOOK_URL }}`
  - `text`: `🚀 **Daily AI Coach Briefing**\n\n{{ $json.response }}`
* **Error Notifications:** `Send Discord Error`-Node mit Fehlerdetails.
* **Vorteil:** Kein SMTP-Server nötig – Discord-Webhook reicht.

[ ] Task 5.3 — End‑to‑End‑Test
* Cronjob manuell auslösen. Prüfen, ob nach ca. 20–30 Sekunden:
  1. Der **Daily Report in Discord** ankommt.
  2. Alle **5 Datenquellen** (Polar, Withings, Intervals, Hevy, **Garmin Fenix 6 Pro**) in TimescaleDB verfügbar sind.
  3. Alle **7 MCP-Server in Claude Desktop** (Sprint 4) funktionieren.
  4. **Garmin-Daten** korrekt in der `view_ai_daily_context` auftauchen.

---

## 🖥️ Hardware-Spezifikationen (Fujitsu Mini‑PC)

| Komponente | Spezifikation | Verwendung | Status |
|------------|--------------|------------|--------|
| **CPU** | Intel i7-6700T (4C/8T, 2.8–3.6 GHz) | Primärer Deployment-Server | **Ab 13.06.2026** |
| **CPU (aktuell)** | Intel i3-6100T (2C/4T, 2.3 GHz) | temporär | Bis 12.06.2026 |
| **RAM** | 32 GB DDR4 | Ausreichend für: TimescaleDB + Ollama + n8n + **5 MCP-Server** | ✅ |
| **Speicher** | SSD (Größe zu prüfen) | Docker-Volumes (`ollama_data/`, TimescaleDB, MCP-Server) | ⚠️ |
| **Netzwerk** | Gigabit Ethernet | Verbindung zu APIs und lokalem Netzwerk | ✅ |
| **Betriebssystem** | Linux (Ubuntu/Debian empfohlen) | Docker-Host | ✅ |

**Hinweise:**
- Der **i7-6700T** unterstützt **keine AVX-512**, aber `mistral-7b-instruct:q4_0` läuft stabil auf CPU (ca. 10–15 Tokens/s).
- **32 GB RAM** reichen für: TimescaleDB (8GB) + Ollama (6.5GB) + n8n (4GB) + **5 MCP-Server (je ~512MB)** + Puffer.
- **Empfohlenes Modell:** `mistral-7b-instruct:q4_0` (ca. 6.5 GB RAM) – optimal für deine Hardware.
- **Vor Deploy:** Modell vorladen mit `ollama pull mistral-7b-instruct:q4_0`.
- **Garmin Fenix 6 Pro Sapphire:** Wird vom [Garmin-MCP-Server](https://github.com/Taxuspt/garmin_mcp) voll unterstützt (Aktivitäten, Schlaf, HRV, etc.).

---

## ✅ Pre‑Deployment Checkliste

### 🔧 **Workflow‑Anpassungen (n8n)**
* **Pflicht für Stabilität:**
  - [ ] **Fehlerbehandlung & Retries** für alle API-Calls (PostgreSQL, Ollama) einbauen:
    ```json
    "options": { "retryOnFail": true, "maxTries": 3, "delayBetweenTries": 2000 }
    ```
  - [ ] **Error‑Handling** mit **Discord‑Benachrichtigung** nach jedem Node:
    - If-Node prüft auf `$json.error` → Send Discord Message (Webhook aus `.env`).
  - [ ] **Environment Variables** für Ollama-URL und Discord nutzen:
    ```json
    "url": "={{ $env.OLLAMA_URL || 'http://ollama:11434' }}/api/generate"
    ```
  - [ ] **Modell auf `mistral-7b-instruct:q4_0` setzen** (besser für strukturierte Analysen als `gemma4:e4b-qat`).
  - [ ] **Datenvalidierung** nach DB-Query:
    - Function-Node prüft auf leere Ergebnisse (`if (!items[0]?.json?.length)`).
  - [ ] **Timeout für Ollama** auf 60.000 ms setzen (Cold-Start-Puffer).
  - [ ] **Manual Trigger** für Tests hinzufügen (parallel zum Schedule-Node).
  - [ ] **Logging-Node** am Ende einfügen:
    ```javascript
    console.log(JSON.stringify({ timestamp: new Date(), status: 'success', model: $json.model }));
    ```
  - [ ] **E‑Mail‑Nodes durch Discord ersetzen:**
    - `Send Email` → **Discord-Webhook** (Node-Typ: `n8n-nodes-base.discord`).
    - `Send Error Notification` → **Discord-Webhook** (gleiche URL).

### 🐳 **Infrastruktur (Docker/Portainer)**
- [ ] **Docker‑Compose prüfen:**
  - Alle **MCP‑Server** (`polar-mcp`, `intervals-mcp`, `hevy-mcp`, `garmin-mcp`, `cronometer-mcp`) + `ollama`, `n8n`, `timescaledb` müssen im **gleichen Netzwerk** (`app_network`) sein.
  - Ports **nur lokal binden** (`127.0.0.1`):
    - MCP-Server: `3000-3004` (intern: `polar-mcp:3000`, etc.)
    - Ollama: `11434` (für n8n intern: `http://ollama:11434`)
    - TimescaleDB: `5432` (für n8n intern: `postgresql://timescaledb:5432`)
    - n8n: `5678` (Web-UI)
- [ ] **Credentials in n8n anlegen:**
  - [ ] Postgres (TimescaleDB): Host=`timescaledb`, Port=`5432`, DB=`${POSTGRES_DB}`
  - [ ] **Discord:** Webhook-URL aus `.env` (DISCORD_WEBHOOK_URL)
- [ ] **Ollama‑Modell vorladen:**
  ```bash
  docker exec -it ollama ollama pull mistral-7b-instruct:q4_0
  ```
- [ ] **MCP‑Server bauen und starten:**
  ```bash
  # Beispiel für Polar-MCP (für alle ähnlich)
  cd mcp-servers/polar-mcp-server
  docker build -t polar-mcp .
  docker-compose up -d polar-mcp
  ```
- [ ] **.env‑Datei auf Fujitsu anpassen:**
  ```bash
  # ========== Datenbank ==========
  POSTGRES_USER=dion
  POSTGRES_PASSWORD=DEIN_DB_PASSWORT
  POSTGRES_DB=athlete_metrics
  
  # ========== Ollama ==========
  OLLAMA_URL=http://localhost:11434
  OLLAMA_MODEL=mistral-7b-instruct:q4_0
  
  # ========== Discord ==========
  DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN
  
  # ========== MCP-Server Credentials ==========
  # Polar
  POLAR_CLIENT_ID=DEIN_POLAR_CLIENT_ID
  POLAR_CLIENT_SECRET=DEIN_POLAR_CLIENT_SECRET
  
  # Intervals.icu
  INTERVALS_KEY=DEIN_INTERVALS_API_KEY
  ATHLETE_ID=DEINE_ATHLETE_ID
  
  # Hevy
  HEVY_API_KEY=DEIN_HEVY_API_KEY
  
  # Garmin (für Fenix 6 Pro Sapphire)
  GARMIN_CLIENT_ID=DEIN_GARMIN_CLIENT_ID
  GARMIN_CLIENT_SECRET=DEIN_GARMIN_CLIENT_SECRET
  
  # Cronometer
  CRONOMETER_USERNAME=DEINE_EMAIL
  CRONOMETER_PASSWORD=DEIN_PASSWORT
  ```
- [ ] **Withings-MCP-Server in Claude Desktop einrichten:**
  - URL: `https://withings-mcp.com/mcp` (Öffentlicher Server – kein Selbsthost nötig)

### 🧪 **Tests & Monitoring**
- [ ] **Workflow in Codespace testen:**
  - Manual Trigger nutzen und Ausgabe prüfen.
  - Mit `n8n execute --workflow=./workflows/daily_ai_newsletter.json` testen (falls CLI verfügbar).
- [ ] **Erste Ausführung auf Fujitsu monitoren:**
  ```bash
  docker logs -f n8n
  docker logs -f ollama
  ```
- [ ] **Datenbank‑View prüfen:**
  ```sql
  SELECT * FROM view_ai_daily_context ORDER BY day_date DESC LIMIT 3;
  ```
  → Muss **valide Daten** der letzten 3 Tage zurückgeben.

---

**📌 Wichtig:**
- **Sicherheit:** **Alle Services** (Ollama, MCP-Server, TimescaleDB, n8n) **nur auf `127.0.0.1`** binden! Nie öffentlich exponieren.
- **Backup:** Vor Deploy TimescaleDB sichern (`pg_dump`).
- **Hardware‑Check:** Mit `htop` prüfen, ob genug RAM/CPU frei bleibt (32GB sollten für alle Services reichen).
- **Discord:** Webhook-URL **nie** ins Repository commiten – nur in `.env` (die ist in `.gitignore`).
- **MCP-Server:** Alle **lokal self-hosten** (außer Withings). OAuth2-Tokens werden automatisch gehandhabt.
- **Garmin Fenix 6 Pro Sapphire:** Der [Garmin-MCP-Server](https://github.com/Taxuspt/garmin_mcp) unterstützt deine Uhr **vollständig** (Aktivitäten, Schlaf, HRV, Training Load).
- **Test-Reihenfolge:**
  1. Docker-Stack starten (`docker-compose up -d`)
  2. MCP-Server bauen (falls nicht als Images verfügbar)
  3. Ollama-Modell laden (`ollama pull mistral-7b-instruct:q4_0`)
  4. n8n öffnen → Workflow importieren → Credentials eintragen
  5. Discord-Webhook testen
  6. Alle MCP-Server in Claude Desktop einbinden