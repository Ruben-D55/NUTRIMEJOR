from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
required = [
    "deploy/compose.images.yml", "deploy/compose.development.yml",
    "deploy/compose.test.yml", "deploy/compose.production.yml", "deploy/Caddyfile",
    "deploy/environments/development.env.example",
    "deploy/environments/test.env.example",
    "deploy/environments/production.env.example",
    ".github/workflows/publish-images.yml", ".github/workflows/deploy.yml",
    "scripts/deploy-release.ps1", "scripts/rollback-release.ps1",
    "docs/DEPLOYMENT_PHASE_10.md", "docs/INSTALLATION_AND_RECOVERY.md",
]
missing = [path for path in required if not (ROOT / path).is_file()]
if missing:
    raise SystemExit("Faltan artefactos de despliegue: " + ", ".join(missing))

images = (ROOT / "deploy/compose.images.yml").read_text(encoding="utf-8")
services = re.findall(r"^  ([a-z][a-z0-9-]+):\n    image:", images, re.MULTILINE)
expected = {
    "identity-api", "patients-api", "catalogs-api", "subscriptions-api",
    "clinical-api", "measurements-api", "nutrition-api", "planning-api",
    "scheduling-api", "notifications-api", "documents-api", "reporting-api",
    "api-gateway", "web", "razor-web",
}
if set(services) != expected:
    raise SystemExit(f"Mapa de imágenes incompleto: {sorted(expected - set(services))}")
if ":latest" in images:
    raise SystemExit("Las imágenes de aplicación no pueden usar latest.")

production = (ROOT / "deploy/compose.production.yml").read_text(encoding="utf-8")
for marker in ("80:80", "443:443", "APP_DOMAIN", "RUN_MIGRATIONS_ON_STARTUP: \"false\""):
    if marker not in production:
        raise SystemExit(f"Falta configuración de producción: {marker}")

publish = (ROOT / ".github/workflows/publish-images.yml").read_text(encoding="utf-8")
if "github.ref_name" not in publish or "push: true" not in publish:
    raise SystemExit("El workflow no publica etiquetas exactas.")

print("Fase 10 verificada: ambientes, HTTPS, imágenes, migraciones y rollback.")
