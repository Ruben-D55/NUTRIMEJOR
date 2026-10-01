# Pruebas integrales

## PostgreSQL real

El entorno de integración levanta PostgreSQL 17 y crea una base independiente para cada dominio. La prueba verifica las doce bases, transacciones con rollback, JSONB, concurrencia optimista y ausencia de datos cruzados.

```powershell
docker compose -f tests/integration/docker-compose.postgres.yml up -d --wait
npm run test:integration:postgres
docker compose -f tests/integration/docker-compose.postgres.yml down -v
```

Este entorno valida la frontera de persistencia PostgreSQL sin modificar las bases del entorno local. Los adaptadores operativos de los servicios continúan usando SQL Server hasta completar su migración de dialecto y datos.

## Playwright

La suite usa Chromium y el sistema completo levantado con Docker. Cubre:

- Registro, inicio y cierre de sesión.
- Recuperación y cambio de contraseña.
- Creación y edición de pacientes desde la interfaz.
- Consulta clínica.
- Mediciones antropométricas.
- Plan nutricional.
- Disponibilidad y cita.
- Reporte.
- Plantilla, generación asíncrona y verificación de documento PDF.

```powershell
docker compose --profile full up -d --build --wait
npm run test:e2e
```

Los flujos de autenticación y pacientes operan mediante controles visibles. Los dominios que todavía no tienen formularios completos se prueban con `APIRequestContext` de Playwright contra sus APIs reales y luego se verifican desde las páginas autenticadas del navegador.
