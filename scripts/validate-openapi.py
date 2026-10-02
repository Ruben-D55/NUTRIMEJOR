from pathlib import Path
import sys
import yaml
from openapi_spec_validator import validate

errors = []
files = sorted(Path("services").glob("*-api/openapi.yaml"))
gateway = Path("services/api-gateway/openapi.yaml")
if gateway.exists():
    files.append(gateway)
for file in files:
    try:
        document = yaml.safe_load(file.read_text(encoding="utf-8"))
        validate(document)
        print(f"OK {file}")
    except Exception as error:
        errors.append((file, error))
        print(f"ERROR {file}: {error}", file=sys.stderr)

if errors:
    raise SystemExit(1)
print(f"Validated {len(files)} OpenAPI contracts.")
