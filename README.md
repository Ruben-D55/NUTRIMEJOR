# NUTRIMEJOR

Página web profesional para nutricionistas, desarrollada con Node.js, Express y SQL Server.

## Funciones

- Registro público de nutricionistas e inicio de sesión seguro.
- Roles `ADMIN` y `NUTRICIONISTA`.
- Pacientes separados por nutricionista.
- Catálogos de alimentos, recetas y dietas.
- Cálculo de IMC y gasto energético diario.
- Administración de usuarios y perfiles profesionales.
- Diseño adaptable para computadoras, tabletas y celulares.

## Configuración local

1. Ejecuta `database/01_crear_base.sql` en SQL Server Management Studio.
2. Copia `.env.example` como `.env` y completa los datos de SQL Server.
3. Ejecuta `npm install`.
4. Ejecuta `npm start`.
5. Abre `http://localhost:3000`.

## Primer administrador

Todos los registros públicos se crean como nutricionistas. Después de registrar la primera cuenta, conviértela en administrador desde SQL Server:

```sql
USE Nutrimejor;
UPDATE Usuarios SET Rol = 'ADMIN' WHERE Email = 'tu-correo@ejemplo.com';
```

## Publicación

Para uso público, configura las variables del archivo `.env.example` como variables privadas del servidor y utiliza una instancia pública de SQL Server o Azure SQL. Nunca publiques el archivo `.env`.
