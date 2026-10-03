# NUTRIMEJOR

Sistema de gestión nutricional con frontend ASP.NET Core Razor Pages, una interfaz
Next.js 16 de transición y servicios independientes.

## Arquitectura

- `api-gateway`: punto de entrada único, autenticación, permisos, CORS, límites,
  resiliencia y trazabilidad para las doce APIs.
- `observability`: OpenTelemetry, Prometheus, Loki, Tempo, Grafana y Alertmanager.
- `web` (raíz): interfaz y Backend for Frontend. El navegador solo consume `/api/*`.
- `frontend-razor/Nutrimejor.Web`: interfaz ejecutiva Razor, Bootstrap y JavaScript.
- `identity-api`: cuentas, sesiones, organizaciones, miembros y auditoría.
- `subscriptions-api`: planes, derechos, cuotas y ciclo de membresía.
- `patients-api`: expediente administrativo, contactos, consentimientos y asignaciones.
- `clinical-api`: historia, consultas, diagnósticos, objetivos y seguimientos.
- `measurements-api`: antropometría, signos vitales, laboratorios y SPORT.
- `nutrition-api`: estilo de vida, evaluación dietética y análisis.
- `catalogs-api`: alimentos, nutrientes, recetas, recomendaciones y educación.
- `planning-api`: requerimientos, planes, generadores y listas de compras.
- `scheduling-api`: disponibilidad, citas y estados.
- `notifications-api`: preferencias, recordatorios, entregas y reintentos.
- `documents-api`: plantillas, generación PDF y acceso temporal.
- `reporting-api`: métricas y modelos de lectura derivados de eventos.

Cada API aplica arquitectura limpia: `domain`, `application`, `infrastructure` e
`interfaces/http`. Cada servicio posee su base de datos SQL Server y no accede a tablas
de otro servicio. La comunicación se realiza por HTTP.

Consulta [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para la arquitectura completa,
[docs/API_GATEWAY.md](docs/API_GATEWAY.md) para las rutas y políticas del gateway,
[docs/MONITORING.md](docs/MONITORING.md) para paneles, registros, trazas y alertas, y
[docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md) para implementarla fase
por fase. El avance comprobado y el trabajo pendiente están en
[docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).
Las mejoras operativas, móviles y de accesibilidad del frontend se describen en
[docs/FRONTEND_PHASE_7.md](docs/FRONTEND_PHASE_7.md).

## Inicio rápido con Docker

```bash
cp .env.example .env
docker compose up --build
```

Para iniciar todos los dominios, RabbitMQ, Redis y el entorno de monitoreo:

```bash
docker compose --profile full up --build
```

Abre `http://localhost:5050` para usar el frontend Razor. La interfaz Next.js permanece
disponible en `http://localhost:3000`. Los servicios crean sus bases y tablas al iniciar.

Puertos locales:

| Componente | Puerto |
| --- | ---: |
| Web/BFF | 3000 |
| Frontend Razor | 5050 |
| API Gateway (12 módulos) | 4080 |
| Grafana | 3001 |
| Prometheus | 9090 |
| Alertmanager | 9093 |
| Identidad SQL | 14331 |
| Pacientes SQL | 14332 |
| Catálogos SQL | 14333 |
| Bases de dominios SQL | 14334 |
| RabbitMQ AMQP / panel | 5672 / 15672 |
| Redis | 6379 |

## Desarrollo de la web

Con los servicios ejecutándose:

```bash
npm install
npm run dev
```

La URL única del gateway se configura mediante `.env.local`, usando `.env.example`
como base. Las APIs de dominio no publican puertos en el host.

## Verificación

```bash
npm run typecheck
npm run test:services
npm run validate:openapi
npm run verify:architecture
npm run verify:observability
npm run verify:data-protection
npm run verify:frontend
npm run test:data-protection
npm run smoke:health-load
npm run smoke:platform
npm run smoke:organizations
npm run smoke:subscriptions
npm run smoke:patients
npm run smoke:clinical
npm run smoke:measurements
npm run smoke:catalogs
npm run smoke:nutrition
npm run smoke:planning
npm run smoke:reporting
npm run smoke:scheduling
npm run smoke:notifications
npm run smoke:documents
npm run smoke:pro
npm run smoke:sport
npm run smoke:resilience
npm run build
docker compose config
docker compose --profile full config
```

El respaldo cifrado, la retención, el simulacro de restauración y la reversión de
migraciones están descritos en [`docs/DATA_PROTECTION.md`](docs/DATA_PROTECTION.md).
Consulta también [`DEPLOYMENT.md`](DEPLOYMENT.md) antes de preparar un ambiente productivo.
