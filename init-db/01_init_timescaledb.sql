-- ============================================
-- TimescaleDB Initialisierung für WHOOP-Alternative
-- ============================================

-- Aktiviert TimescaleDB-Erweiterung
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- ============================================
-- Tabellen für Rohdaten (Hypertables)
-- ============================================

-- Tabelle für Polar HRV & Schlafmetriken
CREATE TABLE IF NOT EXISTS polar_metrics (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    hrv_rmssd REAL,
    resting_heart_rate INT,
    sleep_score INT,
    cardio_load REAL,
    deep_sleep_minutes INT,
    rem_sleep_minutes INT,
    light_sleep_minutes INT,
    sleep_efficiency REAL,
    recovery_score INT
);

-- Hypertable für Polar-Daten (tägliche Chunks)
SELECT create_hypertable(
    'polar_metrics',
    'timestamp',
    if_not_exists => TRUE,
    chunk_time_interval => INTERVAL '7 days',  -- Optimiert für wöchentliche Analysen
    create_default_indexes => TRUE
);

-- Index für schnelle Abfragen nach Datum
CREATE INDEX IF NOT EXISTS idx_polar_metrics_timestamp ON polar_metrics(timestamp);

-- Retention Policy: Daten nach 2 Jahren löschen
SELECT add_retention_policy('polar_metrics', INTERVAL '2 years');

-- ============================================

-- Tabelle für Intervals.icu Form- und Wellness-Metriken
CREATE TABLE IF NOT EXISTS intervals_metrics (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    ctl REAL,
    atl REAL,
    tsb REAL,
    fitness_score REAL,
    fatigue_score REAL,
    form_score REAL,
    stress_score REAL,
    wellness_score REAL
);

-- Hypertable für Intervals-Daten
SELECT create_hypertable(
    'intervals_metrics',
    'timestamp',
    if_not_exists => TRUE,
    chunk_time_interval => INTERVAL '7 days',
    create_default_indexes => TRUE
);

-- Index für Timestamp
CREATE INDEX IF NOT EXISTS idx_intervals_metrics_timestamp ON intervals_metrics(timestamp);

-- Retention Policy
SELECT add_retention_policy('intervals_metrics', INTERVAL '2 years');

-- ============================================

-- Tabelle für Habitica-Aufgaben und Gewohnheits-Events
CREATE TABLE IF NOT EXISTS habitica_events (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    user_id TEXT,
    task_id TEXT,
    task_type TEXT,
    completed BOOLEAN,
    score REAL,
    notes TEXT,
    difficulty REAL,
    tags TEXT[]
);

-- Hypertable für Habitica-Daten
SELECT create_hypertable(
    'habitica_events',
    'timestamp',
    if_not_exists => TRUE,
    chunk_time_interval => INTERVAL '7 days',
    create_default_indexes => TRUE
);

-- Index für User und Task
CREATE INDEX IF NOT EXISTS idx_habitica_events_user ON habitica_events(user_id);
CREATE INDEX IF NOT EXISTS idx_habitica_events_task ON habitica_events(task_id);
CREATE INDEX IF NOT EXISTS idx_habitica_events_timestamp ON habitica_events(timestamp);

-- Retention Policy
SELECT add_retention_policy('habitica_events', INTERVAL '2 years');

-- ============================================

-- Tabelle für Withings Messwerte
CREATE TABLE IF NOT EXISTS withings_metrics (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    weight_kg REAL,
    body_fat_percent REAL,
    muscle_mass_kg REAL,
    hydration_percent REAL,
    bone_mass_kg REAL,
    visceral_fat_level REAL,
    heart_rate INT,
    systolic_bp INT,
    diastolic_bp INT
);

-- Hypertable für Withings-Daten
SELECT create_hypertable(
    'withings_metrics',
    'timestamp',
    if_not_exists => TRUE,
    chunk_time_interval => INTERVAL '7 days',
    create_default_indexes => TRUE
);

-- Index für Timestamp
CREATE INDEX IF NOT EXISTS idx_withings_metrics_timestamp ON withings_metrics(timestamp);

-- Retention Policy
SELECT add_retention_policy('withings_metrics', INTERVAL '2 years');

-- ============================================
-- Aggregierte Views für Analysen
-- ============================================

-- Wochenaggregierte Trend-View für LLM/CSV-Export
CREATE OR REPLACE VIEW view_athlete_weekly_trends AS
SELECT
  coalesce(p.week_start, i.week_start, w.week_start, hab.week_start) AS week_start,
  -- Polar Metriken
  p.avg_hrv,
  p.avg_resting_hr,
  p.avg_sleep_score,
  p.avg_cardio_load,
  p.avg_sleep_efficiency,
  p.avg_recovery_score,
  -- Intervals Metriken
  i.avg_ctl,
  i.avg_atl,
  i.avg_tsb,
  i.avg_fitness_score,
  i.avg_fatigue_score,
  i.avg_form_score,
  -- Withings Metriken
  w.avg_weight,
  w.avg_body_fat,
  w.avg_muscle_mass,
  w.avg_hydration,
  -- Habitica Metriken
  hab.completed_tasks,
  hab.total_tasks,
  hab.completion_rate
FROM (
  SELECT date_trunc('week', timestamp) AS week_start,
         avg(hrv_rmssd) AS avg_hrv,
         avg(resting_heart_rate) AS avg_resting_hr,
         avg(sleep_score) AS avg_sleep_score,
         avg(cardio_load) AS avg_cardio_load,
         avg(sleep_efficiency) AS avg_sleep_efficiency,
         avg(recovery_score) AS avg_recovery_score
  FROM polar_metrics
  GROUP BY week_start
) p
FULL OUTER JOIN (
  SELECT date_trunc('week', timestamp) AS week_start,
         avg(ctl) AS avg_ctl,
         avg(atl) AS avg_atl,
         avg(tsb) AS avg_tsb,
         avg(fitness_score) AS avg_fitness_score,
         avg(fatigue_score) AS avg_fatigue_score,
         avg(form_score) AS avg_form_score
  FROM intervals_metrics
  GROUP BY week_start
) i ON p.week_start = i.week_start
FULL OUTER JOIN (
  SELECT date_trunc('week', timestamp) AS week_start,
         avg(weight_kg) AS avg_weight,
         avg(body_fat_percent) AS avg_body_fat,
         avg(muscle_mass_kg) AS avg_muscle_mass,
         avg(hydration_percent) AS avg_hydration
  FROM withings_metrics
  GROUP BY week_start
) w ON coalesce(p.week_start, i.week_start) = w.week_start
FULL OUTER JOIN (
  SELECT date_trunc('week', timestamp) AS week_start,
         count(*) FILTER (WHERE completed) AS completed_tasks,
         count(*) AS total_tasks,
         round(100.0 * count(*) FILTER (WHERE completed) / nullif(count(*), 0), 1) AS completion_rate
  FROM habitica_events
  GROUP BY week_start
) hab ON coalesce(p.week_start, i.week_start, w.week_start) = hab.week_start;

-- Wochenaggregierte Habitica-View
CREATE OR REPLACE VIEW view_athlete_weekly_habits AS
SELECT
  date_trunc('week', timestamp) AS week_start,
  count(*) FILTER (WHERE completed) AS completed_tasks,
  count(*) AS total_tasks,
  round(100.0 * count(*) FILTER (WHERE completed) / nullif(count(*), 0), 1) AS completion_rate,
  sum(score) FILTER (WHERE completed) AS total_score,
  avg(difficulty) FILTER (WHERE completed) AS avg_difficulty
FROM habitica_events
GROUP BY week_start
ORDER BY week_start DESC;

-- ============================================
-- Tägliche Aggregation für den KI-Morgen-Newsletter
-- ============================================
CREATE OR REPLACE VIEW view_ai_daily_context AS
SELECT
  coalesce(p.day_date, i.day_date, w.day_date, hab.day_date) AS day_date,
  -- Polar Metriken
  p.avg_hrv AS hrv_rmssd,
  p.avg_resting_hr AS resting_heart_rate,
  p.avg_sleep_score AS sleep_score,
  p.avg_cardio_load AS cardio_load,
  p.avg_recovery_score AS recovery_score,
  -- Intervals Metriken
  i.avg_ctl AS fitness_ctl,
  i.avg_atl AS fatigue_atl,
  i.avg_tsb AS form_tsb,
  i.avg_fitness_score AS fitness_score,
  i.avg_fatigue_score AS fatigue_score,
  -- Withings Metriken
  w.avg_weight AS weight_kg,
  w.avg_body_fat AS body_fat_percent,
  w.avg_muscle_mass AS muscle_mass_kg,
  w.avg_hydration AS hydration_percent,
  -- Habitica Metriken
  hab.completed_tasks,
  hab.total_tasks,
  hab.completion_rate
FROM (
  SELECT date_trunc('day', timestamp)::date AS day_date,
         avg(hrv_rmssd) AS avg_hrv,
         avg(resting_heart_rate) AS avg_resting_hr,
         avg(sleep_score) AS avg_sleep_score,
         avg(cardio_load) AS avg_cardio_load,
         avg(recovery_score) AS avg_recovery_score
  FROM polar_metrics GROUP BY 1
) p
FULL OUTER JOIN (
  SELECT date_trunc('day', timestamp)::date AS day_date,
         avg(ctl) AS avg_ctl,
         avg(atl) AS avg_atl,
         avg(tsb) AS avg_tsb,
         avg(fitness_score) AS avg_fitness_score,
         avg(fatigue_score) AS avg_fatigue_score
  FROM intervals_metrics GROUP BY 1
) i ON p.day_date = i.day_date
FULL OUTER JOIN (
  SELECT date_trunc('day', timestamp)::date AS day_date,
         avg(weight_kg) AS avg_weight,
         avg(body_fat_percent) AS avg_body_fat,
         avg(muscle_mass_kg) AS avg_muscle_mass,
         avg(hydration_percent) AS avg_hydration
  FROM withings_metrics GROUP BY 1
) w ON coalesce(p.day_date, i.day_date) = w.day_date
FULL OUTER JOIN (
  SELECT date_trunc('day', timestamp)::date AS day_date,
         count(*) FILTER (WHERE completed) AS completed_tasks,
         count(*) AS total_tasks,
         round(100.0 * count(*) FILTER (WHERE completed) / nullif(count(*), 0), 1) AS completion_rate
  FROM habitica_events GROUP BY 1
) hab ON coalesce(p.day_date, i.day_date, w.day_date) = hab.day_date;

-- ============================================
-- Materialisierte View für schnelle Abfragen (optional)
-- ============================================
-- Wird täglich aktualisiert (z. B. per Cronjob)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_ai_context AS
SELECT * FROM view_ai_daily_context WHERE day_date >= CURRENT_DATE - INTERVAL '30 days';

-- Index für materialisierte View
CREATE INDEX IF NOT EXISTS idx_mv_daily_ai_context_day_date ON mv_daily_ai_context(day_date);

-- ============================================
-- Funktion zum Aktualisieren der materialisierten View
-- ============================================
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_daily_ai_context;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Kommentar: Empfohlene Wartungsaufgaben
-- ============================================
-- 1. Tägliche Aktualisierung der materialisierten View:
--    SELECT refresh_materialized_views();
--
-- 2. Manuelle Komprimierung der Hypertables (wöchentlich):
--    SELECT compress_chunk('polar_metrics', chunk_name);
--
-- 3. Vakuum für bessere Performance (monatlich):
--    VACUUM ANALYZE;
