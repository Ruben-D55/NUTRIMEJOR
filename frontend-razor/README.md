# Frontend Razor de NUTRIMEJOR

Interfaz ejecutiva construida con ASP.NET Core 8 Razor Pages, Bootstrap y JavaScript.
Consume las doce APIs existentes y no accede directamente a ninguna base de datos.

## Ejecución local

Con las APIs iniciadas desde la raíz del repositorio:

```powershell
dotnet run --project frontend-razor/Nutrimejor.Web --urls http://localhost:5050
```

También forma parte del perfil completo de Docker:

```powershell
docker compose --profile full up -d --build razor-web
```

La aplicación queda disponible en `http://localhost:5050`.

## Funciones

- Inicio de sesión y creación de organización.
- Dashboard con métricas y salud de servicios.
- Menú lateral para los doce dominios.
- Listado, búsqueda, creación, consulta, edición y archivo según las reglas de cada API.
- Protección de registros clínicos inmutables.
- Diseño adaptable a escritorio, tableta y móvil.
