from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
SERVICES = {
    "identity-api": (4001, "NutrimejorIdentity"),
    "patients-api": (4002, "NutrimejorPatients"),
    "catalogs-api": (4003, "NutrimejorCatalogs"),
    "subscriptions-api": (4004, "NutrimejorSubscriptions"),
    "clinical-api": (4005, "NutrimejorClinical"),
    "measurements-api": (4006, "NutrimejorMeasurements"),
    "nutrition-api": (4007, "NutrimejorNutrition"),
    "planning-api": (4008, "NutrimejorPlanning"),
    "scheduling-api": (4009, "NutrimejorScheduling"),
    "notifications-api": (4010, "NutrimejorNotifications"),
    "documents-api": (4011, "NutrimejorDocuments"),
    "reporting-api": (4012, "NutrimejorReporting"),
}
REQUIRED = (
    "Dockerfile",
    "package.json",
    "openapi.yaml",
    "src/domain",
    "src/application",
    "src/infrastructure",
    "src/interfaces/http",
    "src/migrate.js",
    "database",
)


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def source_files(path: Path):
    yield from path.rglob("*.js")
    yield from path.rglob("*.ts")


def main() -> int:
    errors: list[str] = []
    compose = yaml.safe_load((ROOT / "docker-compose.yml").read_text(encoding="utf-8"))
    compose_services = compose["services"]
    databases: set[str] = set()

    for name, (port, database) in SERVICES.items():
        root = ROOT / "services" / name
        for relative in REQUIRED:
            if not (root / relative).exists():
                fail(errors, f"{name}: falta {relative}")
        migrations = sorted((root / "database").glob("*.sql"))
        if not migrations:
            fail(errors, f"{name}: no tiene migraciones SQL")
        package = json.loads((root / "package.json").read_text(encoding="utf-8"))
        for script in ("start", "migrate", "test"):
            if script not in package.get("scripts", {}):
                fail(errors, f"{name}: falta script {script}")
        api = compose_services.get(name, {})
        actual_database = api.get("environment", {}).get("DB_NAME")
        if actual_database != database:
            fail(errors, f"{name}: DB_NAME esperado {database}, recibido {actual_database}")
        if database in databases:
            fail(errors, f"{name}: DB_NAME duplicado {database}")
        databases.add(database)
        ports = [str(value) for value in api.get("ports", [])]
        if ports:
            fail(errors, f"{name}: no debe publicar puertos; el acceso externo pasa por api-gateway")

        domain = root / "src" / "domain"
        for file in source_files(domain):
            text = file.read_text(encoding="utf-8")
            if re.search(r'from\s+["\'][^"\']*(application|infrastructure|interfaces)', text):
                fail(errors, f"{file.relative_to(ROOT)}: domain depende de una capa externa")
        application = root / "src" / "application"
        for file in source_files(application):
            text = file.read_text(encoding="utf-8")
            if re.search(r'from\s+["\'][^"\']*(infrastructure|interfaces)', text):
                fail(errors, f"{file.relative_to(ROOT)}: application depende de infraestructura")

        foreign_databases = set(value[1] for key, value in SERVICES.items() if key != name)
        for file in source_files(root / "src"):
            text = file.read_text(encoding="utf-8")
            for foreign in foreign_databases:
                if foreign in text:
                    fail(errors, f"{file.relative_to(ROOT)}: referencia base ajena {foreign}")

    gateway = compose_services.get("api-gateway", {})
    for relative in ("Dockerfile", "package.json", "openapi.yaml", "src/application", "src/infrastructure", "src/interfaces/http"):
        if not (ROOT / "services" / "api-gateway" / relative).exists():
            fail(errors, f"api-gateway: falta {relative}")
    if "127.0.0.1:4080:4080" not in [str(value) for value in gateway.get("ports", [])]:
        fail(errors, "api-gateway: falta el único puerto de APIs 127.0.0.1:4080:4080")
    gateway_environment = gateway.get("environment", {})
    for name, (port, _) in SERVICES.items():
        variable = name.removesuffix("-api").upper() + "_API_URL"
        expected = f"http://{name}:{port}"
        if gateway_environment.get(variable) != expected:
            fail(errors, f"api-gateway: {variable} esperado {expected}")

    contract = yaml.safe_load((ROOT / "contracts" / "events.asyncapi.yaml").read_text(encoding="utf-8"))
    if contract.get("asyncapi") != "3.0.0":
        fail(errors, "contracts/events.asyncapi.yaml debe usar AsyncAPI 3.0.0")
    contracted = set(contract.get("x-event-types", []))
    literal_pattern = re.compile(r'["\']([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_-]+)+\.v[1-9][0-9]*)["\']')
    published: set[str] = set()
    for name in SERVICES:
        for file in source_files(ROOT / "services" / name / "src"):
            published.update(literal_pattern.findall(file.read_text(encoding="utf-8")))
    missing = sorted(published - contracted)
    if missing:
        fail(errors, "Eventos publicados sin contrato: " + ", ".join(missing))

    if errors:
        for error in errors:
            print(f"ERROR {error}", file=sys.stderr)
        return 1
    print(
        f"Architecture verified: {len(SERVICES)} services, "
        f"{len(databases)} databases, one API gateway, {len(contracted)} event types."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
