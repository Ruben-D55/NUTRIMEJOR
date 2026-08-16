# Despliegue de NUTRIMEJOR

## Desarrollo local

1. Instala SQL Server 2022 y ejecuta `database/schema.sql` con SSMS.
2. Copia `.env.example` como `.env.local` y completa las credenciales.
3. Ejecuta `npm install` y `npm run dev`.

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
