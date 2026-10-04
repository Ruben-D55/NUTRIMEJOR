# Fase 10 — despliegue

La solución dispone de tres ambientes con nombres, configuración y datos independientes.

| Ambiente | Composición | Imágenes | Migraciones | Entrada |
| --- | --- | --- | --- | --- |
| Desarrollo | `docker-compose.yml` + `deploy/compose.development.yml` | construcción local | automáticas | `http://localhost:3000` |
| Pruebas | base + `compose.images.yml` + `compose.test.yml` | versión exacta de GHCR | trabajo único | `http://localhost:3100` |
| Producción | base + `compose.images.yml` + `compose.production.yml` | versión exacta de GHCR | trabajo único con respaldo | `https://APP_DOMAIN` |

Cada ambiente debe ejecutarse en un host o clúster distinto. Los proyectos Compose usan
los nombres `nutrimejor-development`, `nutrimejor-test` y `nutrimejor-production`, por lo
que tampoco comparten redes ni volúmenes si se usan en un mismo motor para una prueba.

## Desarrollo

```powershell
npm run setup:env
docker compose -f docker-compose.yml -f deploy/compose.development.yml --profile full up -d --build --wait
```

Desarrollo permite tokens de recuperación visibles y migraciones al arrancar. Estas dos
opciones están desactivadas en pruebas y producción.

## Imágenes versionadas

El workflow `Publish versioned images` se ejecuta con una etiqueta Git `vX.Y.Z` o de
forma manual con una etiqueta exacta. Publica quince imágenes en GHCR: doce APIs, el
gateway, Next.js y Razor. Cada imagen lleva la versión, el commit de origen, SBOM y
procedencia. No se publica ni se despliega `latest`.

Ejemplo:

```powershell
git tag v0.10.0
git push origin v0.10.0
```

El artefacto `release-v0.10.0/images.env` conserva las coordenadas usadas. Antes de
promover una versión, comprueba que las quince imágenes terminaron correctamente.

## GitHub Environments

Crea los entornos protegidos `test` y `production`. En cada uno configura:

- Variable `DEPLOY_ENV_FILE`: contenido del archivo público basado en el `.env.example`
  correspondiente.
- Secreto `APP_ENV_FILE`: contenido del `.env` con claves de servicio, bases, respaldos,
  RabbitMQ y Grafana.
- Protección de `production`: revisores obligatorios y restricción a etiquetas de versión.

Instala un GitHub Actions runner en cada host con las etiquetas `self-hosted`,
`nutrimejor` y el nombre del ambiente. El runner necesita Docker Compose y PowerShell 7.
El workflow `Deploy environment` descarga la versión solicitada, escribe temporalmente
la configuración protegida, ejecuta migraciones, espera los health checks y elimina los
archivos temporales del workspace.

## Dominio y HTTPS

Producción expone solamente Caddy en 80/443. Caddy obtiene y renueva el certificado,
redirecciona HTTP a HTTPS, agrega HSTS y envía el tráfico a la web. Configura antes:

1. Un registro DNS `A`/`AAAA` de `APP_DOMAIN` hacia el host.
2. Puertos 80 y 443 permitidos hacia el proxy.
3. `APP_DOMAIN` y `ACME_EMAIL` en `DEPLOY_ENV_FILE`.
4. `CORS_ALLOWED_ORIGINS=https://APP_DOMAIN` para el gateway.

Las bases, RabbitMQ, Redis, APIs, gateway y observabilidad no publican puertos en el host
de producción. Para acceso operativo usa una red privada o un túnel autenticado.

## Migración y rollback

`scripts/deploy-release.ps1` acepta únicamente etiquetas exactas. En producción crea un
respaldo cifrado antes de migrar, aplica cada migración una sola vez, cambia los
contenedores y verifica `/login`. Registra la versión actual y anterior en
`~/.nutrimejor/deploy-state/<ambiente>.json`, fuera del checkout que limpia Actions.
Los respaldos previos se conservan en `~/.nutrimejor/backups` o en la ruta indicada por
`NUTRIMEJOR_BACKUP_ROOT`; configura allí almacenamiento persistente y copia externa.

```powershell
./scripts/deploy-release.ps1 -Environment test -ImageTag v0.10.0
./scripts/deploy-release.ps1 -Environment production -ImageTag v0.10.0
```

Si falla el cambio de aplicación, el script vuelve a las imágenes anteriores. La base
se revierte sólo cuando se solicita de forma explícita, porque un `down` puede descartar
datos creados después de la migración. Para una reversión controlada:

```powershell
./scripts/rollback-release.ps1 -Environment production
./scripts/rollback-release.ps1 -Environment production -TargetTag v0.9.0 -MigrationSteps 1
```

Una migración incompatible debe usar expansión/contracción: primero agrega estructuras
compatibles, luego despliega el código y en una versión posterior elimina lo antiguo.
Así el rollback habitual requiere cambiar sólo la imagen.

Consulta [INSTALLATION_AND_RECOVERY.md](./INSTALLATION_AND_RECOVERY.md) para preparar un
host nuevo y recuperar el servicio después de un incidente.
