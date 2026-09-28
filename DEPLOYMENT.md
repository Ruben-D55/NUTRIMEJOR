# Despliegue de NUTRIMEJOR

## Unidades desplegables

La solución contiene una web/BFF y doce APIs independientes: Identity, Patients,
Catalogs, Subscriptions, Clinical, Measurements, Nutrition, Planning, Scheduling,
Notifications, Documents y Reporting. Cada API tiene su propia base lógica, usuario y
permisos. Ningún servicio consulta tablas de otro servicio.

`docker-compose.yml` agrupa nueve bases en `platform-db` solamente para desarrollo
local con pocos recursos. Ese contenedor no convierte las bases en un esquema
compartido. En producción, cada módulo debe usar una instancia o base administrada con
credenciales propias, límites de conexiones y ciclo de respaldo independiente.

## Configuración privada y red

- Inyecta `SERVICE_API_KEY`, credenciales SQL, claves privadas y credenciales de
  proveedores desde el gestor de secretos. No las guardes en imágenes ni repositorios.
- Usa `DB_ENCRYPT=true`, certificados verificados y TLS 1.2 o superior fuera del
  entorno local.
- Expón públicamente sólo el BFF o gateway. Mantén APIs, SQL Server, RabbitMQ, Redis y
  almacenamiento de objetos en redes privadas.
- Sustituye la clave compartida entre servicios por identidad de carga de trabajo o
  mTLS cuando la plataforma de producción esté elegida.
- Configura orígenes permitidos, límites de cuerpo, rate limiting y protección del
  login en el gateway.

## Despliegue y migraciones

1. Crea bases, usuarios de mínimo privilegio, RabbitMQ y almacenamiento de objetos.
2. Configura `RUN_MIGRATIONS_ON_STARTUP=false` y ejecuta las migraciones como un
   trabajo único antes de cambiar tráfico:

   ```powershell
   ./scripts/migrate-databases.ps1
   ```

   Cada imagen también acepta `node src/migrate.js`, útil como Job de Kubernetes o
   tarea previa del proveedor. El valor automático `true` se conserva para desarrollo.
3. Despliega Identity y Catalogs; luego Subscriptions y Patients; después los dominios
   clínicos; finalmente workers, Reporting, Documents y BFF.
4. Comprueba `/health/live`, `/health/ready` y `/health` antes de habilitar tráfico.
5. Ejecuta `npm run validate:openapi`, `npm run verify` y las pruebas de humo relevantes.
6. Conserva la imagen y el esquema anteriores durante la ventana de reversión.

## Escalado y disponibilidad

- Ejecuta al menos dos réplicas de APIs sin estado y distribúyelas entre zonas.
- Ejecuta workers por separado y usa colas durables, reintentos limitados y dead-letter.
- Dimensiona cada pool SQL respecto al límite de su base; considera el número de réplicas.
- Mide solicitudes, errores, latencia p50/p95/p99, saturación del pool, retraso de colas,
  trabajos fallidos y consumo de almacenamiento.
- El BFF tiene timeout finito. Reporting, notificaciones y documentos pueden degradarse
  sin impedir que se registren datos clínicos.

## Respaldo y restauración local

Con el perfil completo en ejecución:

```powershell
./scripts/backup-databases.ps1
./scripts/restore-drill.ps1 -BackupDirectory ./backups/AAAAMMDD-HHMMSS
```

El respaldo usa `COPY_ONLY` y checksum, genera SHA-256 y un manifiesto. La compresión
debe activarse en la política del SQL administrado cuando la edición la soporte. El
simulacro valida el hash, restaura cada copia con un nombre temporal, ejecuta
`DBCC CHECKDB` y elimina únicamente esa base temporal. Programa respaldos administrados
en producción y prueba la restauración al menos trimestralmente. Copia también el
almacenamiento de Documents; una copia SQL por sí sola no recupera los PDF.

## Prueba de salud bajo concurrencia

```powershell
npm run smoke:health-load
$env:CONCURRENCY=40; $env:REQUESTS_PER_SERVICE=100; npm run smoke:health-load
```

Esta prueba detecta errores y resume p50, p95 y máximo. No reemplaza una prueba de carga
de escenarios autenticados con datos representativos.

## Migración de datos existentes

Migra primero identidad, luego ficha administrativa y finalmente catálogos. Conserva
UUID, registra el origen y compara cantidades, valores agregados y muestras por
organización. Deja la base anterior en lectura durante el periodo de reversión y
documenta el momento después del cual ya no se aceptará volver al esquema previo.

El modelo de amenazas, alertas y procedimiento de incidentes está en
[`docs/SECURITY_AND_OPERATIONS.md`](./docs/SECURITY_AND_OPERATIONS.md).
