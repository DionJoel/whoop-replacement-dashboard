# Whoop Replacement Dashboard (Self-Hosted)

Dieses Repository enthält die Infrastruktur, um ein proprietäres WHOOP-Abonnement durch ein lokales, selbstgehostetes Fitness- und Athletik-Dashboard zu ersetzen. 

Das System nutzt einen **Hybrid-Ansatz**: Eine Docker-Infrastruktur (n8n + TimescaleDB) sammelt im Hintergrund vollautomatisch und ohne offene Ports deine Daten. Ein maßgeschneiderter **MCP-Server (Model Context Protocol)** aggregiert diese Daten als kompakte CSV-Trends und stellt sie direkt Claude (Desktop/Obsidian) als intelligenten "KI-Coach" zur Verfügung.

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
│   └── athlete_sync_workflow.json # Zentraler n8n-Workflow für alle API-Pulls
├── mcp-server/                   # Quellcode für den Fitness-MCP-Server (Claude-Anbindung)
│   ├── index.ts
│   └── package.json
├── .env.example                  # Vorlage für Umgebungsvariablen (DB & API-Keys)
├── .gitignore                    # Ignoriert sensible Daten und DB-Volumes
├── docker-compose.yml            # Container-Infrastruktur (n8n + TimescaleDB)
└── README.md                     # Diese Dokumentation