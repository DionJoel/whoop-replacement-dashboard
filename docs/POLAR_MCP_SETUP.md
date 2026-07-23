# Polar MCP Server - Setup & Integration für Mistral Vibe

**Status:** 🔄 In Bearbeitung  
**Projekt:** whoop-replacement-dashboard  
**Verzeichnis:** `mcp-servers/polar-mcp-server`  
**Ziel:** Integration des Polar AccessLink API MCP Servers in Mistral Vibe CLI

---

## 📋 Übersicht

Dieses Dokument beschreibt die Schritte zur Integration des [Polar MCP Servers](https://github.com/NelsonNew/polar-mcp-server) von NelsonNew in Mistral Vibe. Der Server ermöglicht den Zugriff auf Polar Fitness-Daten (Workouts, Schlafanalyse, Herzfrequenz, Erholung, etc.) über MCP (Model Context Protocol).

### Unterstützte Daten

| Kategorie | Tools | Beschreibung |
|-----------|-------|--------------|
| **Workouts** | `get_exercises`, `get_exercise` | Trainingsdaten mit HR, Geschwindigkeit, Zonen |
| **Export** | `get_exercise_fit`, `get_exercise_tcx`, `get_exercise_gpx` | Export in FIT, TCX, GPX Formaten |
| **Schlaf** | `get_sleep`, `get_sleep_range` | Schlafphasen, Score, Dauer |
| **Erholung** | `get_nightly_recharge` | ANS-Ladung, HRV, Atemfrequenz |
| **Aktivität** | `get_daily_activity`, `get_activity_samples` | Schritte, Kalorien, Aktivitätszonen |
| **Herzfrequenz** | `get_continuous_heart_rate` | 24/7 Herzfrequenz-Überwachung |
| **Trainingslast** | `get_cardio_load`, `get_cardio_load_history` | TRIMP, akute/chronische Last |
| **Benutzer** | `get_user_info`, `get_physical_info` | Profil, VO₂max, Ruhe-HR |

---

## 🎯 Aktueller Stand

### ✅ Erledigt
- [x] Polar MCP Server Repository in `mcp-servers/polar-mcp-server/` geklont
- [x] Abhängigkeiten installiert (`npm install`)
- [x] TypeScript gebaut (`npm run build`)
- [x] Dockerfile für HTTP-Server erstellt
- [x] Docker Compose Konfiguration in `docker-compose.yml` vorhanden
- [x] Mistral Vibe config.toml für MCP-Server vorbereitet

### ⏳ Ausstehend
- [ ] Polar API Credentials besorgen (Client ID & Secret)
- [ ] OAuth-Token generieren
- [ ] Docker Container starten und OAuth-Flow durchführen
- [ ] Vibe Konfiguration finalisieren
- [ ] Test der Integration

---

## 🚀 Optionen zur Integration

Es gibt **drei Hauptmethoden**, den Polar MCP Server in Mistral Vibe einzubinden:

### Option 1: Docker Container (Empfohlen für Produktion)

**Vorteile:**
- Isolierte Umgebung
- Einfache Verwaltung
- OAuth-Flow wird vom Container gehandhabt

**Schritte:**

1. **Polar API Credentials besorgen**
   - Gehe zu [Polar AccessLink Admin](https://admin.polaraccesslink.com/)
   - Erstelle eine neue Anwendung
   - Notiere dir:
     - `POLAR_CLIENT_ID`
     - `POLAR_CLIENT_SECRET`

2. **Umgebungsvariablen setzen**
   ```bash
   cd /home/dionjoel/development/git/whoop-replacement-dashboard
   echo "POLAR_CLIENT_ID=DEINE_CLIENT_ID" >> .env
   echo "POLAR_CLIENT_SECRET=DEIN_CLIENT_SECRET" >> .env
   ```

3. **Container starten**
   ```bash
   docker compose up -d polar-mcp
   ```

4. **OAuth-Flow durchführen**
   - Öffne im Browser: `http://192.168.178.190:3010`
   - Oder lokal: `http://localhost:3010`
   - Logge dich mit deinem Polar-Konto ein
   - Der Container speichert das Token automatisch in `tokens.json`

5. **Vibe konfigurieren**
   Füge in `~/.vibe/config.toml` hinzu:
   ```toml
   [[mcp_servers]]
   name = "polar"
   transport = "http"
   url = "http://192.168.178.190:3010/mcp"
   ```
   *Oder für lokalen Zugriff:*
   ```toml
   url = "http://localhost:3010/mcp"
   ```

6. **Vibe neu starten**
   - Beende die aktuelle Vibe-Sitzung
   - Starte Vibe neu
   - Teste mit: *"Zeige mir meine letzten Workouts"*

---

### Option 2: Lokale Ausführung (stdio-Transport)

**Vorteile:**
- Kein Docker nötig
- Direkte Integration in Vibe
- Gut für Entwicklung/Testing

**Schritte:**

1. **Polar API Credentials besorgen** (siehe Option 1, Schritt 1)

2. **Token generieren**
   ```bash
   cd /home/dionjoel/development/git/whoop-replacement-dashboard/mcp-servers/polar-mcp-server
   export POLAR_CLIENT_ID="DEINE_CLIENT_ID"
   export POLAR_CLIENT_SECRET="DEIN_CLIENT_SECRET"
   npm run auth
   ```
   - Ein lokaler Server startet auf `http://localhost:8888`
   - Öffne die angezeigte URL im Browser
   - Logge dich bei Polar ein
   - **Kopiere dir aus der Konsole:**
     - `access_token`
     - `x_user_id` (oder `user_id`)

3. **Vibe konfigurieren**
   Füge in `~/.vibe/config.toml` hinzu:
   ```toml
   [[mcp_servers]]
   name = "polar"
   transport = "stdio"
   command = "node"
   args = ["/home/dionjoel/development/git/whoop-replacement-dashboard/mcp-servers/polar-mcp-server/dist/index.js"]
   env = { 
     POLAR_ACCESS_TOKEN = "DEIN_ACCESS_TOKEN",
     POLAR_USER_ID = "DEINE_USER_ID"
   }
   ```

4. **Vibe neu starten und testen**

---

### Option 3: Öffentliche Instanz (Einfachste Methode)

**Vorteile:**
- Kein Setup nötig
- Keine eigenen Credentials nötig

**Nachteile:**
- Vibe CLI unterstützt OAuth-Flow für HTTP-MCP-Server noch nicht vollständig
- Funktioniert aktuell nur mit manueller Token-Besorgung

**Schritte:**

1. **Vibe konfigurieren**
   ```toml
   [[mcp_servers]]
   name = "polar"
   transport = "http"
   url = "https://polar-mcp-server.n-neuhaeusel.workers.dev/mcp"
   ```

2. **Manuell autorisieren**
   - Der OAuth-Flow muss manuell über Claude Desktop durchgeführt werden
   - Token dann in Vibe-Konfiguration eintragen (falls möglich)

---

## 📝 Wichtige Dateien & Pfade

| Datei/Pfad | Beschreibung |
|-------------|--------------|
| `mcp-servers/polar-mcp-server/` | Polar MCP Server Source Code |
| `mcp-servers/polar-mcp-server/Dockerfile` | Docker-Konfiguration |
| `mcp-servers/polar-mcp-server/dist/index.js` | Gebaute Version (stdio) |
| `mcp-servers/polar-mcp-server/dist/simple-http-server.js` | HTTP-Server Variante |
| `docker-compose.yml` | Docker Compose Konfiguration |
| `~/.vibe/config.toml` | Mistral Vibe Konfiguration |
| `.env` | Umgebungsvariablen (muss erstellt werden) |

---

## 🔧 Docker Compose Konfiguration

Ausschnitt aus `docker-compose.yml` (Zeilen 109-137):

```yaml
polar-mcp:
  build:
    context: ./mcp-servers/polar-mcp-server
    dockerfile: Dockerfile
  container_name: polar-mcp
  ports:
    - "0.0.0.0:3010:3000"
  environment:
    - POLAR_CLIENT_ID=${POLAR_CLIENT_ID}
    - POLAR_CLIENT_SECRET=${POLAR_CLIENT_SECRET}
    - POLAR_REDIRECT_URI=http://192.168.178.190:3010/callback
    - POLAR_SCOPE=accesslink.read_all
  restart: unless-stopped
  deploy:
    resources:
      limits:
        memory: 512M
        cpus: 0.5
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 30s
  networks:
    - timescale_default
```

**Wichtige Punkte:**
- **Externer Port:** 3010 (zugriffbar unter `http://192.168.178.190:3010`)
- **Interner Port:** 3000 (im Container)
- **Redirect URI:** Muss in Polar AccessLink Admin als Callback-URL hinterlegt werden
- **Umgebungsvariablen:** Werden aus `.env` Datei gelesen

---

## 🛠️ Dockerfile Analyse

Die Dockerfile in `mcp-servers/polar-mcp-server/Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
VOLUME ["/app/tokens.json"]
CMD ["npm", "run", "start:http"]
```

**Startbefehl:** `npm run start:http` → Startet `node dist/simple-http-server.js`

---

## 📊 Vibe Konfiguration

### Aktueller Stand

In `~/.vibe/config.toml` wurde bereits ein Eintrag hinzugefügt:

```toml
[[mcp_servers]]
name = "polar"
transport = "http"
url = "https://polar-mcp-server.n-neuhaeusel.workers.dev/mcp"
```

*Dies funktioniert aktuell nicht, weil Vibe den OAuth-Flow für HTTP-MCP-Server nicht vollständig unterstützt.*

### Empfohlene Konfiguration (nach Setup)

**Für Docker (HTTP-Transport):**
```toml
[[mcp_servers]]
name = "polar"
transport = "http"
url = "http://192.168.178.190:3010/mcp"
```

**Für lokale Ausführung (stdio-Transport):**
```toml
[[mcp_servers]]
name = "polar"
transport = "stdio"
command = "node"
args = ["/home/dionjoel/development/git/whoop-replacement-dashboard/mcp-servers/polar-mcp-server/dist/index.js"]
env = { 
  POLAR_ACCESS_TOKEN = "DEIN_TOKEN_HIER",
  POLAR_USER_ID = "DEINE_USER_ID_HIER"
}
```

---

## 🔍 Fehlerbehebung

| Problem | Lösung |
|---------|---------|
| **HTTP 403 Error** | OAuth-Token fehlt oder ist ungültig. Führe den OAuth-Flow erneut durch. |
| **HTTP 404 Error** | Endpunkt nicht verfügbar für dein Gerät/Abo. Prüfe, ob dein Polar-Gerät synchronisiert ist. |
| **Container startet nicht** | Prüfe Docker-Logs: `docker logs polar-mcp`. Fehlen Umgebungsvariablen? |
| **Keine Daten verfügbar** | Synchronisiere dein Polar-Gerät mit der Polar Flow App. |
| **Port bereits belegt** | Ändere den externen Port in docker-compose.yml (z.B. auf 3011) |

---

## 📚 Nützliche Links

- [Polar AccessLink API Dokumentation](https://www.polar.com/accesslink-api/)
- [Polar Developer Portal](https://admin.polaraccesslink.com/)
- [GitHub: NelsonNew/polar-mcp-server](https://github.com/NelsonNew/polar-mcp-server)
- [MCP Protocol](https://modelcontextprotocol.io/)
- [Mistral Vibe MCP Dokumentation](https://docs.mistral.ai/vibe/code/cli/mcp-servers)

---

## 🎯 Nächste Schritte

1. [ ] **Polar API Credentials besorgen** (Client ID & Secret)
2. [ ] **Entscheiden:** Docker oder lokale Ausführung?
3. [ ] **Setup durchführen** (Container starten oder Token generieren)
4. [ ] **Vibe konfigurieren** (je nach gewählter Methode)
5. [ ] **Testen** mit einfachen Anfragen wie:
   - *"Zeige mir meine letzten 5 Workouts"*
   - *"Wie war mein Schlaf gestern?"*
   - *"Was ist meine aktuelle Herzfrequenz?"*

---

## 💡 Notizen

*Hier können zusätzliche Notizen, Befehle oder Beobachtungen während des Setups festgehalten werden.*

---

## 📅 Changelog

| Datum | Änderung | Verantwortlich |
|-------|----------|---------------|
| 2026-07-23 | Dokument erstellt, aktuelle Analyse | Mistral Vibe |
| 2026-07-23 | Docker-Konfiguration identifiziert | Mistral Vibe |
