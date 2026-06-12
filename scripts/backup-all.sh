#!/bin/bash

# ============================================
# Vollständiges Backup-Skript
# ============================================
# Dieses Skript erstellt Backups von:
# - TimescaleDB (Datenbank)
# - Ollama (Modelle und Konfiguration)
#
# Verwendung:
#   ./backup-all.sh [--clean]
#
# Optionen:
#   --clean  : Löscht Backups, die älter als BACKUP_RETENTION_DAYS sind
#
# Umgebungsvariablen:
#   BACKUP_DIR          : Verzeichnis für Backups (Standard: /backups/whoop-dashboard)
#   BACKUP_RETENTION_DAYS : Tage, nach denen Backups gelöscht werden (Standard: 30)

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
DATE=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${BACKUP_DIR}/backup_full_${DATE}.log"

# --- Funktionen ---
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
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

# Erstelle Backup-Verzeichnis
create_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        log "📁 Erstelle Backup-Verzeichnis: $BACKUP_DIR"
        mkdir -p "$BACKUP_DIR"
    fi
}

# Lösche alte Backups
clean_old_backups() {
    log "🧹 Lösche Backups älter als $BACKUP_RETENTION_DAYS Tage..."
    
    find "$BACKUP_DIR" -name "*.dump" -type f -mtime +"$BACKUP_RETENTION_DAYS" -delete 2>/dev/null || true
    find "$BACKUP_DIR" -name "*.tar.gz" -type f -mtime +"$BACKUP_RETENTION_DAYS" -delete 2>/dev/null || true
    find "$BACKUP_DIR" -name "backup_*.log" -type f -mtime +"$BACKUP_RETENTION_DAYS" -delete 2>/dev/null || true

    log "✅ Alte Backups bereinigt."
}

# --- Hauptprogramm ---
main() {
    log "🚀 Starte vollständiges Backup-Skript"

    # Argumente parsen
    CLEAN_BACKUPS=false

    for arg in "$@"; do
        case "$arg" in
            --clean)
                CLEAN_BACKUPS=true
                ;;
        esac
    done

    # Prüfe Docker
    check_docker

    # Erstelle Backup-Verzeichnis
    create_backup_dir

    # TimescaleDB Backup
    log "🗃️  Starte TimescaleDB-Backup..."
    if [ -f "$SCRIPT_DIR/backup-db.sh" ]; then
        "$SCRIPT_DIR/backup-db.sh" 2>&1 | tee -a "$LOG_FILE"
    else
        log "❌ backup-db.sh nicht gefunden. Überspringe TimescaleDB-Backup."
    fi

    # Ollama Backup
    log "🤖 Starte Ollama-Backup..."
    if [ -f "$SCRIPT_DIR/backup-ollama.sh" ]; then
        "$SCRIPT_DIR/backup-ollama.sh" 2>&1 | tee -a "$LOG_FILE"
    else
        log "❌ backup-ollama.sh nicht gefunden. Überspringe Ollama-Backup."
    fi

    # Alte Backups löschen (wenn --clean)
    if [ "$CLEAN_BACKUPS" = true ]; then
        clean_old_backups
    fi

    # Zusammenfassung
    log "✅ Vollständiges Backup abgeschlossen."
    log "📊 Backup-Verzeichnis: $BACKUP_DIR"
    log "📝 Log-Datei: $LOG_FILE"
    
    # Zeige Backup-Dateien an
    log "📋 Aktuelle Backups:"
    ls -lh "$BACKUP_DIR" | grep -E "\.(dump|tar\.gz|log)$" | tail -n 10 || true
}

# Skript ausführen
main "$@"
