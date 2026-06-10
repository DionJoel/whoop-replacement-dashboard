-- Tabelle für Polar HRV & Schlafmetriken
CREATE TABLE IF NOT EXISTS polar_metrics (
    timestamp TIMESTAMPTZ NOT NULL,
    hrv_rmssd REAL,
    resting_heart_rate INT,
    sleep_score INT,
    cardio_load REAL
);

-- Macht die Tabelle zu einer TimescaleDB Hypertable
SELECT create_hypertable('polar_metrics', 'timestamp', if_not_exists => TRUE);

-- Tabelle für Hevy Krafttraining
CREATE TABLE IF NOT EXISTS hevy_workouts (
    timestamp TIMESTAMPTZ NOT NULL,
    workout_id UUID NOT NULL,
    exercise_name TEXT NOT NULL,
    volume_kg REAL,
    reps INT,
    rpe REAL
);

SELECT create_hypertable('hevy_workouts', 'timestamp', if_not_exists => TRUE);

-- Tabelle für Intervals.icu Form- und Wellness-Metriken
CREATE TABLE IF NOT EXISTS intervals_metrics (
    timestamp TIMESTAMPTZ NOT NULL,
    ctl REAL,
    atl REAL,
    tsb REAL,
    fitness_score REAL,
    fatigue_score REAL
);

SELECT create_hypertable('intervals_metrics', 'timestamp', if_not_exists => TRUE);

-- Tabelle für Habitica-Aufgaben und Gewohnheits-Events
CREATE TABLE IF NOT EXISTS habitica_events (
    timestamp TIMESTAMPTZ NOT NULL,
    user_id TEXT,
    task_id TEXT,
    task_type TEXT,
    completed BOOLEAN,
    score REAL,
    notes TEXT
);

SELECT create_hypertable('habitica_events', 'timestamp', if_not_exists => TRUE);

-- Tabelle für Withings Messwerte
CREATE TABLE IF NOT EXISTS withings_metrics (
    timestamp TIMESTAMPTZ NOT NULL,
    weight_kg REAL,
    body_fat_percent REAL,
    muscle_mass_kg REAL,
    hydration_percent REAL
);

SELECT create_hypertable('withings_metrics', 'timestamp', if_not_exists => TRUE);

-- Wochenaggregierte Trend-Views für LLM/CSV-Export
CREATE OR REPLACE VIEW view_athlete_weekly_trends AS
SELECT
  coalesce(p.week_start, i.week_start, w.week_start) AS week_start,
  p.avg_hrv,
  p.avg_resting_hr,
  p.avg_sleep_score,
  i.avg_ctl,
  i.avg_atl,
  i.avg_tsb,
  w.avg_weight,
  w.avg_body_fat
FROM (
  SELECT date_trunc('week', timestamp) AS week_start,
         avg(hrv_rmssd) AS avg_hrv,
         avg(resting_heart_rate) AS avg_resting_hr,
         avg(sleep_score) AS avg_sleep_score
  FROM polar_metrics
  GROUP BY week_start
) p
FULL OUTER JOIN (
  SELECT date_trunc('week', timestamp) AS week_start,
         avg(ctl) AS avg_ctl,
         avg(atl) AS avg_atl,
         avg(tsb) AS avg_tsb
  FROM intervals_metrics
  GROUP BY week_start
) i ON p.week_start = i.week_start
FULL OUTER JOIN (
  SELECT date_trunc('week', timestamp) AS week_start,
         avg(weight_kg) AS avg_weight,
         avg(body_fat_percent) AS avg_body_fat
  FROM withings_metrics
  GROUP BY week_start
) w ON coalesce(p.week_start, i.week_start) = w.week_start;

CREATE OR REPLACE VIEW view_athlete_weekly_habits AS
SELECT
  date_trunc('week', timestamp) AS week_start,
  count(*) FILTER (WHERE completed) AS completed_tasks,
  count(*) AS total_tasks,
  round(100.0 * count(*) FILTER (WHERE completed) / nullif(count(*), 0), 1) AS completion_rate
FROM habitica_events
GROUP BY week_start
ORDER BY week_start DESC;

CREATE OR REPLACE VIEW view_hevy_weekly_volume AS
SELECT
  date_trunc('week', timestamp) AS week_start,
  sum(volume_kg) AS total_volume_kg,
  sum(reps) AS total_reps,
  avg(rpe) AS avg_rpe
FROM hevy_workouts
GROUP BY week_start
ORDER BY week_start DESC;

-- Tägliche Aggregation für den täglichen KI-Morgen-Newsletter
CREATE OR REPLACE VIEW view_ai_daily_context AS
SELECT
  coalesce(p.day_date, i.day_date, h.day_date, w.day_date, hab.day_date) AS day_date,
  p.avg_hrv AS hrv_rmssd,
  p.avg_sleep_score AS sleep_score,
  i.avg_ctl AS fitness_ctl,
  i.avg_atl AS fatigue_atl,
  i.avg_tsb AS form_tsb,
  h.total_volume_kg AS strength_volume_kg,
  hab.completed_tasks,
  w.avg_weight AS weight_kg
FROM (
  SELECT date_trunc('day', timestamp)::date AS day_date, avg(hrv_rmssd) AS avg_hrv, avg(sleep_score) AS avg_sleep_score
  FROM polar_metrics GROUP BY 1
) p
FULL OUTER JOIN (
  SELECT date_trunc('day', timestamp)::date AS day_date, avg(ctl) AS avg_ctl, avg(atl) AS avg_atl, avg(tsb) AS avg_tsb
  FROM intervals_metrics GROUP BY 1
) i ON p.day_date = i.day_date
FULL OUTER JOIN (
  SELECT date_trunc('day', timestamp)::date AS day_date, sum(volume_kg) AS total_volume_kg
  FROM hevy_workouts GROUP BY 1
) h ON coalesce(p.day_date, i.day_date) = h.day_date
FULL OUTER JOIN (
  SELECT date_trunc('day', timestamp)::date AS day_date, avg(weight_kg) AS avg_weight
  FROM withings_metrics GROUP BY 1
) w ON coalesce(p.day_date, i.day_date, h.day_date) = w.day_date
FULL OUTER JOIN (
  SELECT date_trunc('day', timestamp)::date AS day_date, count(*) FILTER (WHERE completed) AS completed_tasks
  FROM habitica_events GROUP BY 1
) hab ON coalesce(p.day_date, i.day_date, h.day_date, w.day_date) = hab.day_date;
