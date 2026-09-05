from app.db import get_db


class Settings:
    @staticmethod
    def get(key, default=None):
        db = get_db()
        row = db.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default

    @staticmethod
    def set(key, value):
        db = get_db()
        db.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, str(value)),
        )
        db.commit()

    @staticmethod
    def get_all():
        db = get_db()
        rows = db.execute("SELECT key, value FROM settings ORDER BY key").fetchall()
        return {row["key"]: row["value"] for row in rows}

    @staticmethod
    def get_by_prefix(prefix):
        db = get_db()
        rows = db.execute(
            "SELECT key, value FROM settings WHERE key LIKE ?",
            (prefix + "%",),
        ).fetchall()
        return {row["key"]: row["value"] for row in rows}

    @staticmethod
    def set_many(data):
        db = get_db()
        for key, value in data.items():
            db.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, str(value)),
            )
        db.commit()
