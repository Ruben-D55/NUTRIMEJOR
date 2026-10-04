# Manual de instalación y recuperación

## Requisitos del host

- Linux o Windows Server mantenido, con reloj sincronizado.
- Docker Engine/Desktop con Compose v2.24 o superior.
- PowerShell 7 (`pwsh`) para despliegues, respaldos y recuperación.
- Mínimo inicial recomendado: 8 CPU, 16 GB RAM y almacenamiento persistente cifrado.
- DNS y puertos 80/443 disponibles para producción.
- Runner de GitHub dedicado si se usarán despliegues automáticos.

El dimensionamiento final debe basarse en pruebas con la carga y retención reales.

## Instalación inicial

1. Clona el repositorio y cambia a una etiqueta publicada.
2. Copia `deploy/environments/production.env.example` como
   `deploy/environments/production.env` y reemplaza dominio, correo y versión.
3. Crea `.env` con secretos aleatorios. Nunca copies `.env` a la imagen ni al repositorio.
4. Define `NUTRIMEJOR_BACKUP_ROOT` hacia almacenamiento persistente y verifica espacio.
5. Ejecuta el despliegue controlado, que crea respaldo cuando ya existen datos, migra y
   comprueba salud.

```powershell
git checkout v0.10.0
Copy-Item deploy/environments/production.env.example deploy/environments/production.env
./scripts/deploy-release.ps1 -Environment production -ImageTag v0.10.0
```

Después valida `https://APP_DOMAIN/login`, el estado de las doce APIs en Grafana, las
conexiones SQL y la cola de RabbitMQ. Conserva fuera del host la clave de respaldo y una
copia cifrada del último conjunto válido.

## Actualización ordinaria

1. Publica y prueba la nueva etiqueta en `test`.
2. Revisa cambios de esquema y confirma que todos tengan archivo `down`.
3. Lanza `Deploy environment` para `production`; el Environment de GitHub solicita la
   revisión configurada.
4. Verifica login, una lectura clínica, creación no destructiva, métricas y colas.
5. Mantén la versión anterior durante toda la ventana de observación.

## Recuperación de la aplicación

Si el código nuevo falla y las bases siguen compatibles:

```powershell
./scripts/rollback-release.ps1 -Environment production
```

El script lee la versión anterior registrada, descarga esas imágenes y espera sus health
checks. Si no existe el archivo de estado, usa `-TargetTag vX.Y.Z` con una versión que ya
haya sido probada.

## Recuperación de bases de datos

1. Detén la entrada pública o activa una página de mantenimiento.
2. Conserva una copia de los datos dañados para análisis.
3. Selecciona un conjunto completo en `backups/`; verifica `manifest.hmac` y hashes.
4. Ejecuta primero el simulacro aislado:

```powershell
./scripts/restore-drill.ps1 -BackupDirectory ./backups/AAAAMMDD-HHMMSS
```

5. Restaura en bases nuevas, valida `DBCC CHECKDB`, cantidades por organización y una
   muestra funcional. Cambia las cadenas de conexión sólo después de la validación.
6. Reproduce eventos pendientes o reconstruye proyecciones de Reporting.
7. Habilita tráfico y supervisa errores, latencia, conexiones y colas.

No reemplaces directamente una base sana durante el diagnóstico. La restauración sobre
un nombre nuevo permite volver atrás y conserva evidencia del incidente.

## Recuperación completa del host

En un host limpio instala los requisitos, recupera `.env` desde el gestor de secretos,
recupera `deploy/environments/production.env`, despliega la misma etiqueta registrada y
restaura las bases y el almacenamiento de documentos. Actualiza DNS sólo cuando el
nuevo host responda saludablemente por HTTPS. Registra tiempos reales para comprobar el
RTO y compara el último dato recuperado con el RPO definido.

## Comprobación periódica

- Diario: respaldo cifrado y copia fuera del host.
- Semanal: workflow `Data protection drill` y revisión de alertas.
- Por versión: despliegue en pruebas, migración y rollback ensayados.
- Trimestral: recuperación completa en infraestructura aislada.
- Anual: rotación coordinada de secretos y revisión de accesos del runner.
