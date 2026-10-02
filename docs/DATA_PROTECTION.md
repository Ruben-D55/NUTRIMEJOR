# Protección de datos y recuperación

Esta fase protege las doce bases SQL Server del sistema. Cada ejecución crea un conjunto completo: doce archivos `.bak.enc`, un `manifest.json` y su firma `manifest.hmac`. Un conjunto incompleto se elimina y nunca entra en retención.

## Respaldo cifrado

`BACKUP_ENCRYPTION_KEY` debe ser una clave aleatoria Base64URL de 32 bytes almacenada en el gestor de secretos del entorno. `npm run setup:env` genera una clave local; `.env` no se confirma en Git. El respaldo usa `COPY_ONLY` y checksum. El archivo `.bak` existe sólo durante la operación, se cifra en flujo con AES-256-GCM y se elimina inmediatamente. El manifiesto registra SHA-256 del texto cifrado y del respaldo original, y se autentica con HMAC-SHA256.

```powershell
npm run setup:env
./scripts/backup-databases.ps1
```

En el host Windows que ejecuta Docker, registre la tarea diaria una vez (puede cambiar la hora):

```powershell
./scripts/register-backup-schedule.ps1 -At 02:00
```

La tarea usa el usuario actual, comienza al volver a estar disponible si el equipo estaba apagado y aplica la retención después de cada respaldo correcto. Docker Desktop debe estar iniciado en esa sesión.

Copie el directorio resultante a almacenamiento externo con versionado y acceso restringido. Conserve la clave usada durante toda la retención del respaldo. Para rotarla, genere la clave nueva para respaldos futuros y mantenga la anterior en el gestor de secretos hasta eliminar el último conjunto que dependa de ella.

## Restauración comprobada

El simulacro verifica primero la firma y los hashes, descifra cada respaldo a un archivo temporal, ejecuta `RESTORE VERIFYONLY WITH CHECKSUM`, restaura en una base temporal y ejecuta `DBCC CHECKDB`. Después elimina tanto la base temporal como el archivo en claro.

```powershell
./scripts/restore-drill.ps1 -BackupDirectory ./backups/AAAAMMDD-HHMMSS
```

GitHub Actions ejecuta este recorrido cada domingo y permite iniciarlo manualmente desde **Data protection drill**. Para producción se recomienda un respaldo diario fuera del servidor y el simulacro semanal incluido aquí. El objetivo inicial es RPO de 24 horas y RTO verificado por la duración registrada del workflow; ajústelo al acuerdo operativo real.

## Retención y eliminación

La política predeterminada conserva todos los respaldos de los últimos 14 días, el más reciente de cada semana durante 8 semanas y el más reciente de cada mes durante 12 meses. Se puede revisar sin borrar:

```powershell
./scripts/backup-retention.ps1 -WhatIf
```

Los directorios que no tengan el formato `AAAAMMDD-HHMMSS` se ignoran. El script rechaza la raíz de una unidad y verifica que cada eliminación permanezca dentro de `BackupRoot`.

## Migraciones reversibles e índices

Cada servicio tiene una migración `*_query_indexes.up.sql` basada en sus filtros y ordenamientos habituales, acompañada por `*.down.sql`. El motor registra el checksum normalizado, aplica cambios dentro de una transacción y permite revertir de uno a veinte pasos.

```powershell
./scripts/rollback-databases.ps1 -Steps 1
./scripts/migrate-databases.ps1
```

Antes de desplegar una migración destructiva, escriba y pruebe su archivo `down`, cree un respaldo cifrado y valide la reversión en un entorno equivalente. Revise periódicamente planes de ejecución y uso real de índices; las sugerencias automáticas son evidencia para analizar, no una orden para crear índices sin medir su coste de escritura.
