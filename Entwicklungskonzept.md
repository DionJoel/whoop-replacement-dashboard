Markdown
# 🛠️ Entwicklungskonzept: WHOOP-Alternative (Self‑Hosted)

Dieses Konzept beschreibt den schrittweisen Implementierungsplan für das hybride Athletik‑Dashboard. Das Projekt ist in fünf Sprints unterteilt, um eine stabile, modulare und schrittweise Umsetzung zu gewährleisten.

---

## 📌 Architektur‑Übersicht (Zielbild)

```text
[APIs: Polar, Hevy, Intervals, Habitica]
                                                 |  (Cron‑Pulls über n8n)
                                                 v
                   [TimescaleDB (Hypertables)]
                                                 |
                                                 v (SQL‑Views: Aggregierte CSV‑Trends)
                               [MCP‑Server]
                                                 |
                                                 v (On‑Demand Tools)
                         [Claude / Obsidian]
```

## Sprints — Überblick

### Sprint 1 — Lokale Infrastruktur & Datenbank (Basis)
Ziel: Die Docker‑Umgebung läuft stabil auf dem Fujitsu Mini‑PC und die TimescaleDB initialisiert alle Tabellen und Views automatisch.

- [ ] Task 1.1 — Git‑Repo lokal aufbauen
      - Struktur laut README.md lokal anlegen
      - `.env.example` und `.gitignore` erstellen

- [ ] Task 1.2 — SQL‑Init‑Skript finalisieren
      - `init-db/01_init_timescaledb.sql` mit Tabellen befüllen (`polar_metrics`, `hevy_workouts`, `intervals_metrics`, `habitica_events`)
      - `create_hypertable`‑Statements für alle Tabellen hinzufügen
      - Aggregations‑Views (`view_athlete_weekly_trends` etc.) am Ende ergänzen

- [ ] Task 1.3 — Deployment via Portainer
      - Code auf GitHub (Private Repo) pushen
      - In Portainer als Stack via Git‑Repo einbinden
      - Lokale `.env` mit Testwerten in Portainer setzen und Stack starten

Meilenstein: Mit einem DB‑Client (z. B. DBeaver) verbinden und prüfen, ob Tabellen und Views existieren.

### Sprint 2 — Daten‑Pipelines (n8n Integration)
Ziel: n8n zieht Testdaten von allen vier APIs und schreibt sie flachgeklopft in die Hypertables.

- [ ] Task 2.1 — API‑Keys & OAuth2 sammeln
      - Polar Accesslink registrieren (Redirect‑URL auf lokales n8n)
      - API‑Keys für Habitica und Intervals.icu generieren und in `.env` speichern

- [ ] Task 2.2 — n8n Kern‑Workflow bauen
      - HTTP‑Node für Polar (`/v2/users/me/sleep`) inkl. OAuth2‑Handshake
      - HTTP‑Node für Intervals.icu (`/api/v1/athlete/0/wellness`) via Basic Auth
      - HTTP‑Node für Habitica (`/api/v3/user`) zum Pull von erledigten Aufgaben
      - HTTP‑Node für Hevy (letzte Workouts)

- [ ] Task 2.3 — Datentransformation & DB‑Insert
      - Postgres‑Node hinter jeden HTTP‑Pull hängen
      - JSON‑Antworten via n8n‑Expressions (`{{ $json... }}`) in SQL‑Inserts mappen

Meilenstein: Workflow manuell triggern und prüfen, ob Raw‑Tabellen echte API‑Daten enthalten.

### Sprint 3 — Datenkomprimierung & SQL‑Feinschliff
Ziel: SQL‑Views aggregieren Daten korrekt und liefern saubere CSV‑Strukturen.

- [ ] Task 3.1 — Cross‑X & Kraftsport‑Metriken validieren
      - Hevy‑Volumen und RPE‑Werte korrekt summiert/gewichtet prüfen

- [ ] Task 3.2 — Belastungs‑Verknüpfung (Intervals + Polar)
      - CTL/ATL aus Intervals mit Polar HRV synchronisieren (LEFT JOINs über Datum prüfen)

- [ ] Task 3.3 — CSV‑Export‑Test
      - `SELECT * FROM view_athlete_weekly_trends;` ausführen und Ergebnis als CSV prüfen

### Sprint 4 — Custom MCP‑Server (Die Claude‑Brücke)
Ziel: Lokaler MCP‑Server stellt Claude Tools bereit, um SQL‑Views als CSV auszulesen.

- [ ] Task 4.1 — Projekt‑Setup (`mcp-server/`)
      - `npm init` und Installation von `@modelcontextprotocol/sdk`
      - TypeScript‑Konfiguration erstellen

- [ ] Task 4.2 — Tool‑Registrierung implementieren
      - Tool `get_fitness_trends` mit Parameter `intervall` (weekly, monthly, quarterly) registrieren

- [ ] Task 4.3 — DB‑to‑CSV Logik schreiben
      - `pg` (node‑postgres) einbinden und Views abfragen
      - Funktion: Resultset → standardisierter CSV‑String, als Text‑Content an MCP zurückgeben

- [ ] Task 4.4 — Claude Desktop Anbindung
      - MCP‑Server in `claude_desktop_config.json` eintragen (z. B. `node /pfad/zu/mcp-server/build/index.js`)

Meilenstein: Claude Desktop starten; das Tools‑Icon muss `get_fitness_trends` anzeigen.

### Sprint 5 — Der KI‑Coach (System‑Prompts & Obsidian)
Ziel: Claude analysiert die Daten wie ein Sportwissenschaftler und gibt konkrete Empfehlungen.

- [ ] Task 5.1 — System‑Prompt für den „Athletik‑Coach“ definieren
      - Klar definieren, wie HRV, RPE, Volumen und CTL/ATL zu interpretieren sind
      - Beispielregel: „Wenn TSB < −20, warnen vor hoher Verletzungsgefahr beim BJJ“

- [ ] Task 5.2 — Obsidian‑Integration (optional)
      - MCP‑Plugin in Obsidian aktivieren für direkten Zugriff aus dem Second Brain

- [ ] Task 5.3 — End‑to‑End‑Test
      - Prompt an Claude: „Zieh dir die Wochentrends der letzten 4 Wochen als CSV und gib mir eine fundierte Analyse über meine aktuelle Ermüdung.“

---

Wenn du möchtest, kann ich noch ein Inhaltsverzeichnis ergänzen oder einzelne Tasks weiter ausformulieren.