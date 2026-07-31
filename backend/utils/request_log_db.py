# utils/request_log_db.py
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


def init_request_log_db(db_path: str) -> None:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(db_path, check_same_thread=False)
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS request_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL,
                iteration_id INTEGER,
                endpoint_name TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                log TEXT
            )
        """)
        columns = {
            row[1]
            for row in conn.execute("PRAGMA table_info(request_logs)").fetchall()
        }
        if "log" not in columns:
            conn.execute("ALTER TABLE request_logs ADD COLUMN log TEXT")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_request_logs_project_id ON request_logs(project_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp)")
        conn.commit()
    finally:
        conn.close()


def log_request_call(
    db_path: str,
    project_id: str,
    iteration_id: Optional[int],
    endpoint_name: str,
    timestamp: Optional[str] = None,
    log: Optional[str] = None,
) -> None:
    if not project_id:
        # avoid inserting garbage
        return

    ts = timestamp or datetime.now(timezone.utc).isoformat()

    conn = sqlite3.connect(db_path, check_same_thread=False)
    try:
        conn.execute(
            """
            INSERT INTO request_logs (project_id, iteration_id, endpoint_name, timestamp, log)
            VALUES (?, ?, ?, ?, ?)
            """,
            (project_id, iteration_id, endpoint_name, ts, log),
        )
        conn.commit()
    finally:
        conn.close()
