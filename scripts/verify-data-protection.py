from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SERVICES = (
    "identity", "patients", "catalogs", "subscriptions", "clinical", "measurements",
    "nutrition", "planning", "scheduling", "notifications", "documents", "reporting",
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"ERROR: {message}")


backup = (ROOT / "scripts/backup-databases.ps1").read_text(encoding="utf-8")
restore = (ROOT / "scripts/restore-drill.ps1").read_text(encoding="utf-8")
crypto = (ROOT / "scripts/backup-crypto.mjs").read_text(encoding="utf-8")
workflow = (ROOT / ".github/workflows/data-protection.yml").read_text(encoding="utf-8")

require(backup.count("Database = \"Nutrimejor") == 12, "el respaldo debe incluir exactamente 12 bases")
require("CHECKSUM" in backup and "COPY_ONLY" in backup, "faltan opciones seguras de BACKUP")
require("aes-256-gcm" in crypto.lower() and "createCipheriv" in crypto, "falta cifrado AES-256-GCM")
require("sign" in crypto and "timingSafeEqual" in crypto, "falta autenticación del manifiesto")
require("RESTORE VERIFYONLY" in restore and "DBCC CHECKDB" in restore, "el simulacro debe restaurar y comprobar integridad")
require("cron:" in workflow and "workflow_dispatch:" in workflow, "el simulacro debe estar programado y ser manual")

for service in SERVICES:
    database_dir = ROOT / "services" / f"{service}-api" / "database"
    ups = sorted(database_dir.glob("*_query_indexes.up.sql"))
    require(len(ups) == 1, f"{service}: falta una migración de índices reversible")
    down = Path(str(ups[0]).replace(".up.sql", ".down.sql"))
    require(down.exists(), f"{service}: falta {down.name}")
    require("CREATE INDEX" in ups[0].read_text(encoding="utf-8"), f"{service}: la migración no crea índices")
    require("DROP INDEX" in down.read_text(encoding="utf-8"), f"{service}: la reversión no elimina índices")
    engine = (ROOT / "services" / f"{service}-api" / "src/infrastructure/sql/database.js").read_text(encoding="utf-8")
    require("rollbackDatabase" in engine and ".down.sql" in engine, f"{service}: el motor no admite rollback")

retention = (ROOT / "scripts/backup-retention.ps1").read_text(encoding="utf-8")
require(all(value in retention for value in ("DailyRetentionDays", "WeeklyRetentionWeeks", "MonthlyRetentionMonths", "ShouldProcess")), "política GFS incompleta")
schedule = (ROOT / "scripts/register-backup-schedule.ps1").read_text(encoding="utf-8")
require("New-ScheduledTaskTrigger -Daily" in schedule and "StartWhenAvailable" in schedule, "falta automatización diaria en Windows")
require(re.search(r"BACKUP_ENCRYPTION_KEY=", (ROOT / ".env.example").read_text(encoding="utf-8")), "falta documentar la clave")

print("OK: protección de datos validada para 12 bases, cifrado, restauración, retención y migraciones reversibles.")
