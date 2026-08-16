# Despliegue de NUTRIMEJOR

## Desarrollo local

1. Instala SQL Server 2022 y ejecuta `database/schema.sql` con SSMS.
2. Edita la contraseña de `database/crear_usuario_local.sql` y ejecútalo con SSMS.
3. Desde PowerShell ejecuta `./scripts/configurar-local.ps1` para crear `.env.local` y generar automáticamente el JWT.
4. Ejecuta `npm install` y `npm run dev`.

`.env.local` contiene secretos, está ignorado por Git y nunca debe subirse al repositorio.

## Producción recomendada

- Web: contenedor Docker en Azure App Service.
- Base de datos: Azure SQL Database.
- HTTPS: obligatorio; Azure lo configura automáticamente.
- Secretos: configura `DB_*` y `JWT_SECRET` como variables privadas de App Service.

Antes de publicar cambia `JWT_SECRET`, usa una contraseña fuerte, activa `DB_ENCRYPT=true`, ejecuta el esquema en Azure SQL y limita el firewall de SQL al servidor web.

## Primer administrador

Registra una cuenta y ejecuta:

```sql
UPDATE Usuarios SET Rol='ADMIN' WHERE Email='administrador@dominio.com';
```

Las cuentas públicas siempre nacen con rol `NUTRICIONISTA`.
