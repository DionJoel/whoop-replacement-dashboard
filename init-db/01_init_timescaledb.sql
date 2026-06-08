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
