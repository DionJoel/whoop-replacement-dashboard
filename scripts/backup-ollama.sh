#!/bin/bash

# ============================================
# Ollama Backup-Skript
# ============================================
# Dieses Skript erstellt ein Backup der Ollama-Modelle und
# Konfigurationsdateien.
#
# Verwendung:
#   ./backup-ollama.sh [--clean]
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
OLLAMA_BACKUP_FILE="${BACKUP_DIR}/ollama_data_${DATE}.tar.gz"
LOG_FILE="${BACKUP_DIR}/backup_ollama_${DATE}.log"

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

# Prüfe, ob der Ollama-Container läuft
check_ollama() {
    if ! docker ps | grep -q ollama; then
        log "❌ Ollama-Container läuft nicht."
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

# Erstelle Ollama-Backup
backup_ollama() {
    log "🔄 Starte Ollama-Backup: $OLLAMA_BACKUP_FILE"

    # Backup des Ollama-Datenverzeichnisses (Modelle + Konfig)
    if docker exec ollama tar czf /tmp/ollama_backup.tar.gz /root/.ollama 2>> "$LOG_FILE"; then
        # Kopiere Backup vom Container auf den Host
        docker cp ollama:/tmp/ollama_backup.tar.gz "$OLLAMA_BACKUP_FILE"
        docker exec ollama rm /tmp/ollama_backup.tar.gz

        log "✅ Ollama-Backup erfolgreich erstellt: $OLLAMA_BACKUP_FILE"
        
        # Dateigröße anzeigen
        BACKUP_SIZE=$(du -h "$OLLAMA_BACKUP_FILE" | cut -f1)
        log "📊 Backup-Größe: $BACKUP_SIZE"
        
        # Zeige enthaltene Modelle an
        log "📋 Enthaltene Modelle:"
        docker exec ollama ollama list 2>/dev/null | grep -E "^\s+[a-z]" || true
    else
        log "❌ Ollama-Backup fehlgeschlagen. Siehe $LOG_FILE für Details."
        exit 1
    fi
}

# Lösche alte Backups
clean_old_backups() {
    log "🧹 Lösche Ollama-Backups älter als $BACKUP_RETENTION_DAYS Tage..."
    
    find "$BACKUP_DIR" -name "ollama_data_*.tar.gz" -type f -mtime +"$BACKUP_RETENTION_DAYS" -delete 2>/dev/null || true
    find "$BACKUP_DIR" -name "backup_ollama_*.log" -type f -mtime +"$BACKUP_RETENTION_DAYS" -delete 2>/dev/null || true

    log "✅ Alte Ollama-Backups bereinigt."
}

# --- Hauptprogramm ---
main() {
    log "🚀 Starte Ollama Backup-Skript"

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

    # Prüfe Ollama
    check_ollama

    # Erstelle Backup-Verzeichnis
    create_backup_dir

    # Backup erstellen
    backup_ollama

    # Alte Backups löschen (wenn --clean)
    if [ "$CLEAN_BACKUPS" = true ]; then
        clean_old_backups
    fi

    log "✅ Ollama Backup-Skript abgeschlossen."
}

# Skript ausführen
main "$@"
