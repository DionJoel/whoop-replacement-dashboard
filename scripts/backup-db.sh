#!/bin/bash

# ============================================
# TimescaleDB Backup-Skript
# ============================================
# Dieses Skript erstellt ein Backup der TimescaleDB-Datenbank
# und speichert es im angegebenen Verzeichnis.
#
# Verwendung:
#   ./backup-db.sh [--full] [--clean]
#
# Optionen:
#   --full   : Erstellt ein vollständiges Backup (inkl. Schema)
#   --clean  : Löscht Backups, die älter als BACKUP_RETENTION_DAYS sind
#
# Umgebungsvariablen:
#   BACKUP_DIR          : Verzeichnis für Backups (Standard: /backups/whoop-dashboard)
#   BACKUP_RETENTION_DAYS : Tage, nach denen Backups gelöscht werden (Standard: 30)
#   POSTGRES_USER      : Datenbank-Benutzer (Standard: postgres)
#   POSTGRES_PASSWORD  : Datenbank-Passwort (aus .env)
#   POSTGRES_DB        : Datenbankname (Standard: athlete_metrics)

set -euo pipefail

# --- Konfiguration ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Lade Umgebungsvariablen aus .env (falls vorhanden)
if [ -f "$PROJECT_DIR/.env" ]; then
    set -a
    source "$PROJECT_DIR/.env"
    set +a
fi

# Standardwerte
BACKUP_DIR="${BACKUP_DIR:-/backups/whoop-dashboard}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-athlete_metrics}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${POSTGRES_DB}_${DATE}.dump"
LOG_FILE="${BACKUP_DIR}/backup_${DATE}.log"

# --- Funktionen ---
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Prüfe, ob Docker läuft
check_docker() {
    if ! command -v docker &> /dev/null; then
        log "❌ Docker ist nicht installiert."
        exit 1
    fi

    if ! docker info &> /dev/null; then
        log "❌ Docker-Daemon läuft nicht."
        exit 1
    fi
}

# Prüfe, ob der TimescaleDB-Container läuft
check_timescaledb() {
    if ! docker ps | grep -q timescaledb; then
        log "❌ TimescaleDB-Container läuft nicht."
        exit 1
    fi
}

# Erstelle Backup-Verzeichnis
create_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        log "📁 Erstelle Backup-Verzeichnis: $BACKUP_DIR"
        mkdir -p "$BACKUP_DIR"
    fi
}

# Erstelle Datenbank-Backup
backup_database() {
    log "🔄 Starte Datenbank-Backup: $BACKUP_FILE"

    # Backup mit pg_dump (über Docker)
    if docker exec timescaledb pg_dump \
        -U "$POSTGRES_USER" \
        -d "$POSTGRES_DB" \
        -Fc \
        -f /tmp/db_dump.dump \
        2>> "$LOG_FILE"; then

        # Kopiere Backup vom Container auf den Host
        docker cp timescaledb:/tmp/db_dump.dump "$BACKUP_FILE"
        docker exec timescaledb rm /tmp/db_dump.dump

        log "✅ Backup erfolgreich erstellt: $BACKUP_FILE"
        
        # Dateigröße anzeigen
        BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        log "📊 Backup-Größe: $BACKUP_SIZE"
    else
        log "❌ Backup fehlgeschlagen. Siehe $LOG_FILE für Details."
        exit 1
    fi
}

# Lösche alte Backups
clean_old_backups() {
    log "🧹 Lösche Backups älter als $BACKUP_RETENTION_DAYS Tage..."
    
    find "$BACKUP_DIR" -name "*.dump" -type f -mtime +"$BACKUP_RETENTION_DAYS" -delete 2>/dev/null || true
    find "$BACKUP_DIR" -name "backup_*.log" -type f -mtime +"$BACKUP_RETENTION_DAYS" -delete 2>/dev/null || true

    log "✅ Alte Backups bereinigt."
}

# --- Hauptprogramm ---
main() {
    log "🚀 Starte TimescaleDB Backup-Skript"

    # Argumente parsen
    FULL_BACKUP=false
    CLEAN_BACKUPS=false

    for arg in "$@"; do
        case "$arg" in
            --full)
                FULL_BACKUP=true
                ;;
            --clean)
                CLEAN_BACKUPS=true
                ;;
        esac
    done

    # Prüfe Docker
    check_docker

    # Prüfe TimescaleDB
    check_timescaledb

    # Erstelle Backup-Verzeichnis
    create_backup_dir

    # Backup erstellen
    backup_database

    # Alte Backups löschen (wenn --clean oder täglich)
    if [ "$CLEAN_BACKUPS" = true ]; then
        clean_old_backups
    fi

    log "✅ Backup-Skript abgeschlossen."
}

# Skript ausführen
main "$@"
