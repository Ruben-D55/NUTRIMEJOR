# Base monolítica anterior

Los archivos de esta carpeta pertenecen a la versión anterior y se conservan únicamente
como fuente para migrar datos existentes. La aplicación ya no ejecuta consultas contra
este esquema.

Los esquemas activos están dentro de cada servicio:

- `services/identity-api/database`
- `services/patients-api/database`
- `services/catalogs-api/database`

No agregues tablas nuevas a `schema.sql`. Cada módulo debe evolucionar su propia base de
datos mediante una migración dentro del servicio propietario.
