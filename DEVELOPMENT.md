# 🛠️ Entwicklungskonzept: WHOOP-Alternative (Self‑Hosted)

Dieses Konzept beschreibt den schrittweisen Implementierungsplan für das hybride Athletik‑Dashboard. Das Projekt ist in fünf Sprints unterteilt, um eine stabile, modulare und schrittweise Umsetzung zu gewährleisten.

---

## 📌 Architektur‑Übersicht (Zielbild)

```text
[APIs: Polar, Hevy, Intervals, Habitica, Withings]
                       |  (Cron‑Pulls über n8n)
                       v
      [Externe TimescaleDB (Bestehender Stack)]
                 |                     |
                 | (SQL-Views)         | (Direkt-Query)
                 v                     v
    [n8n Daily Trigger (9 Uhr)]    [MCP-Server] <---> [Cronometer-MCP (App-API)]
                 |                     |
                 v (Prompt)            v (On-Demand Tools)
          [Local Ollama]          [Claude Desktop / Mac]
                 |
                 v (Markdown E-Mail)
          [E-Mail Newsletter]
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

Sprint 2 — Daten‑Pipelines (n8n Integration)
Ziel: n8n zieht Testdaten von allen fünf externen APIs (Pull-Prinzip, keine offenen Ports) und schreibt sie konvertiert in die Hypertables.

[ ] Task 2.1 — API‑Keys & OAuth2 sammeln
* Polar Accesslink registrieren (Redirect‑URL auf lokales n8n).
* Withings Developer Account erstellen, App registrieren und OAuth2-Credentials generieren.
* API‑Keys für Habitica und Intervals.icu generieren und in .env speichern.

[ ] Task 2.2 — n8n Kern‑Workflow bauen
* HTTP‑Node für Polar (/v2/users/me/sleep) inkl. OAuth2‑Handshake.
* HTTP‑Node für Intervals.icu (/api/v1/athlete/0/wellness) via Basic Auth.
* HTTP‑Node für Habitica (/api/v3/user) zum Pull von erledigten Aufgaben.
* HTTP‑Node für Hevy (letzte Workouts).
* HTTP-Node für Withings (/v2/measure via POST) mit OAuth2-Handshake aufsetzen, um Gewicht, KFA, Muskelmasse und Hydration abzurufen.

[ ] Task 2.3 — Datentransformation & DB‑Insert
* Postgres‑Node hinter jeden HTTP‑Pull hängen.
* JSON‑Antworten via n8n‑Expressions ({{ $json... }}) in SQL‑Inserts mappen.
* Withings-Spezifikum: Integer-Werte im SQL-Insert mittels Multiplikator umrechnen: value * power(10, unit).

Meilenstein: Workflow manuell triggern und prüfen, ob alle fünf Raw‑Tabellen echte API‑Daten enthalten.

Sprint 3 — Datenkomprimierung & SQL‑Feinschliff
Ziel: SQL‑Views aggregieren Daten korrekt und liefern hochgradig komprimierte Zeitreihen für die LLM-Verarbeitung.

[ ] Task 3.1 — Cross‑X & Kraftsport‑Metriken validieren
* Hevy‑Volumen und RPE‑Werte korrekt summiert/gewichtet prüfen.

[ ] Task 3.2 — Biometrie- & Belastungs‑Verknüpfung
* CTL/ATL aus Intervals mit Polar HRV und Withings Gewichtstrends synchronisieren (LEFT JOINs über das Datum exakt kalibrieren).

[ ] Task 3.3 — CSV‑Export‑Test
* SELECT * FROM view_athlete_weekly_trends; ausführen und das tabellarische Ergebnis auf Plausibilität prüfen.

Sprint 4 — Custom MCP‑Server & Cronometer (Die Claude‑Brücke)
Ziel: Lokaler MCP‑Server stellt Claude Tools für die DB bereit. Ein separater Community-MCP bindet Cronometer ohne Enterprise-Key ein.

[ ] Task 4.1 — Projekt‑Setup (mcp-server/)
* npm init und Installation von @modelcontextprotocol/sdk sowie pg (node-postgres).
* TypeScript‑Konfiguration erstellen.

[ ] Task 4.2 — Tool‑Registrierung implementieren
* Tool get_fitness_trends mit Parameter intervall (weekly, monthly, quarterly) im Code registrieren.

[ ] Task 4.3 — DB‑to‑CSV Logik schreiben
* SQL-Views abfragen und das Resultset in einen schlanken CSV-String konvertieren. Übergabe als reiner text-Content an den MCP-Handler.

[ ] Task 4.4 — Cronometer-MCP & Claude Desktop Anbindung
* Den vorkonfigurierten Community-MCP-Server cronometer-api-mcp herunterladen.
* Beide Server in die lokale claude_desktop_config.json auf dem Mac eintragen (Cronometer-Credentials dort hinterlegen).
* Hinweis: Cronometer hat keine offizielle öffentliche API. Deshalb ist hier ein privater Web-Login-/Export-Wrapper nötig.
* Empfehlung: Baue nur den minimal benötigten Endpunkt, z. B. für `daily_summary`, `servings` oder `biometrics`, statt das ganze Cronometer-MCP-Projekt zu übernehmen.

Meilenstein: Claude Desktop starten. Das Tools‑Icon (Hammer) muss sowohl get_fitness_trends als auch die Cronometer-Tools (Ernährungsdaten) fehlerfrei anzeigen.

Sprint 5 — Der KI‑Coach (Lokaler Cronjob & Obsidian Mobile)
Ziel: Das System agiert vollautark. n8n triggert die lokale LLM im Hintergrund, erzeugt das fertige Dashboard und pusht es aufs iPhone.

[ ] Task 5.1 — System‑Prompt & Structured Output für Ollama
* In n8n die Advanced AI Nodes (Basic LLM Chain + Ollama Model) einbinden.
* System-Prompt für Gemma 4 definieren: Fokus auf tabellarische Wochenübersicht, Sport-Empfehlung (unter Berücksichtigung von Regeneration, Cross-X-Volumen und Gewicht) sowie Uni-Lernfenster.
* Structured Output Parser vorschalten, um reines Markdown ohne Smalltalk zu garantieren.

[ ] Task 5.2 — Automatischer Obsidian-Export via n8n
* n8n-Knoten konfigurieren, der das von Gemma 4 generierte Markdown abgreift und als Datei (00_Athletik_Dashboard.md) direkt in dein lokales Obsidian-Vault auf dem Server schreibt.
* Synchronisation (z. B. Obsidian Sync / Git) prüfen, damit die Datei auf dem iPhone landet.

[ ] Task 5.3 — End‑to‑End‑Test
* Cronjob manuell auslösen. Prüfen, ob nach ca. 20–30 Sekunden Rechenzeit auf der CPU des Fujitsu ein perfekt formatiertes Dashboard in Obsidian auf dem iPhone bereitsteht.

---

## 🖥️ Hardware-Spezifikationen (Fujitsu Mini‑PC)

| Komponente | Spezifikation | Verwendung | Status |
|------------|--------------|------------|--------|
| **CPU** | Intel i7-6700T (4C/8T, 2.8–3.6 GHz) | Primärer Deployment-Server | **Ab 13.06.2026** |
| **CPU (aktuell)** | Intel i3-6100T (2C/4T, 2.3 GHz) | temporär | Bis 12.06.2026 |
| **RAM** | 32 GB DDR4 | Ausreichend für: TimescaleDB + Ollama (`mistral-7b-instruct:q4_0`) + n8n | ✅ |
| **Speicher** | SSD (Größe zu prüfen) | Docker-Volumes (`ollama_data/`, TimescaleDB) | ⚠️ |
| **Netzwerk** | Gigabit Ethernet | Verbindung zu APIs und lokalem Netzwerk | ✅ |
| **Betriebssystem** | Linux (Ubuntu/Debian empfohlen) | Docker-Host | ✅ |

**Hinweise:**
- Der **i7-6700T** unterstützt **keine AVX-512**, aber `mistral-7b-instruct:q4_0` läuft stabil auf CPU (ca. 10–15 Tokens/s).
- **32 GB RAM** ermöglichen gleichzeitiges Laden von TimescaleDB + Ollama + n8n.
- **Empfohlenes Modell:** `mistral-7b-instruct:q4_0` (ca. 6.5 GB RAM) oder `gemma4:e4b-qat` (ca. 8 GB RAM).
- **Vor Deploy:** Modell vorladen mit `ollama pull mistral-7b-instruct:q4_0`.

---

## ✅ Pre‑Deployment Checkliste

### 🔧 **Workflow‑Anpassungen (n8n)**
* **Pflicht für Stabilität:**
  - [ ] **Fehlerbehandlung & Retries** für alle API-Calls (PostgreSQL, Ollama, Email) einbauen:
    ```json
    "options": { "retryOnFail": true, "maxTries": 3, "delayBetweenTries": 2000 }
    ```
  - [ ] **Error‑Handling** mit **E‑Mail‑Benachrichtigung** nach jedem Node:
    - If-Node prüft auf `$json.error` → Send Email an `deine.private@email.de`.
  - [ ] **Environment Variables** für Ollama-URL nutzen:
    ```json
    "url": "={{ $env.OLLAMA_URL || 'http://ollama:11434' }}/api/generate"
    ```
  - [ ] **Datenvalidierung** nach DB-Query:
    - Function-Node prüft auf leere Ergebnisse (`if (!items[0]?.json?.length)`).
  - [ ] **Modell wechseln** zu `mistral-7b-instruct:q4_0` (besser als `gemma4:e4b-qat` für deine Hardware).
  - [ ] **Timeout für Ollama** auf 60.000 ms setzen (Cold-Start-Puffer).
  - [ ] **Manual Trigger** für Tests hinzufügen (parallel zum Schedule-Node).
  - [ ] **Logging-Node** am Ende einfügen:
    ```javascript
    console.log(JSON.stringify({ timestamp: new Date(), status: 'success', model: $json.model }));
    ```

### 🐳 **Infrastruktur (Docker/Portainer)**
- [ ] **Docker‑Compose prüfen:**
  - `ollama` und `n8n` müssen im **gleichen Docker‑Netzwerk** sein (z. B. `networks: [app_network]`).
  - Ports freigeben:
    - Ollama: `11434:11434` (nur lokal oder im internen Netzwerk!).
    - TimescaleDB: `5432:5432` (nur für n8n erreichbar).
- [ ] **Credentials in n8n anlegen:**
  - [ ] Postgres (TimescaleDB): Host, Port, DB-Name, User, Passwort.
  - [ ] Email-SMTP: Server, Port, TLS, User, Passwort.
- [ ] **Ollama‑Modell vorladen:**
  ```bash
  docker exec -it ollama ollama pull mistral-7b-instruct:q4_0
  ```
- [ ] **.env‑Datei auf Fujitsu anpassen:**
  ```bash
  OLLAMA_URL=http://localhost:11434
  DATABASE_URL=postgresql://user:pass@timescaledb:5432/db_name
  ```

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
- **Sicherheit:** Ollama **nie** öffentlich exponieren! Nur im internen Netzwerk oder per `127.0.0.1` zugänglich machen.
- **Backup:** Vor Deploy TimescaleDB sichern (`pg_dump`).
- **Hardware‑Check:** Mit `htop` prüfen, ob genug RAM/CPU während des ersten Laufs frei bleibt.