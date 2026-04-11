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


def derivar_cores_alerta(hex_cor):
    """Recebe uma cor hex (ex: '#b91c1c') e retorna dict com bg e border derivados.
    - bg: cor misturada com branco a ~93% (tint muito leve)
    - border: cor misturada com branco a ~65% (tint medio)
    """
    hex_cor = hex_cor.lstrip('#')
    r, g, b = int(hex_cor[0:2], 16), int(hex_cor[2:4], 16), int(hex_cor[4:6], 16)

    # Background: mistura com branco a 93%
    bg_r = int(r + (255 - r) * 0.93)
    bg_g = int(g + (255 - g) * 0.93)
    bg_b = int(b + (255 - b) * 0.93)

    # Border: mistura com branco a 65%
    br_r = int(r + (255 - r) * 0.65)
    br_g = int(g + (255 - g) * 0.65)
    br_b = int(b + (255 - b) * 0.65)

    return {
        'bg': '#{:02x}{:02x}{:02x}'.format(bg_r, bg_g, bg_b),
        'border': '#{:02x}{:02x}{:02x}'.format(br_r, br_g, br_b),
        'accent': '#' + hex_cor,
    }
