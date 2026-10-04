# Fase 11 — diseño común para CRUD

La interfaz aplica un patrón visual verde y blanco a los módulos operativos. Cada vista
presenta un encabezado con propósito y acción principal, indicadores de resumen y un
área de trabajo consistente. Los componentes compartidos viven en
`components/ui/crud-ui.tsx` para evitar que cada módulo resuelva de forma distinta la
misma interacción.

## Patrón común

- Encabezado ejecutivo, tarjetas de indicadores y acción principal visible.
- Búsqueda, filtros rápidos, ordenamiento, tamaños de página y exportación CSV.
- Tablas con encabezados fijos, filas resaltadas y estados vacíos o de carga.
- Columnas configurables, selección múltiple y acciones contextuales en Pacientes.
- Panel lateral accesible para conservar el contexto al consultar o editar.
- Formularios por secciones, validación, bloqueo durante el guardado y aviso de cambios
  sin guardar.
- Tarjetas en pantallas pequeñas cuando una tabla deja de ser legible.
- Foco visible, cierre con Escape, roles ARIA y restauración del foco al cerrar paneles.

## Cobertura por módulo

Pacientes funciona como implementación de referencia: ficha rápida, edad, objetivo,
actividad reciente, duplicación, archivo, acciones masivas, columnas y exportación. El
encabezado y los indicadores se aplican también a Historia clínica, Nutrición,
Mediciones, Planes, Agenda, Notificaciones, Documentos, Reportes, Catálogos, Membresía y
Configuración. Las capacidades específicas existentes, como gráficos, versiones,
reintentos, vistas de agenda y descargas, se conservan dentro del nuevo patrón.

## Verificación

`npm run verify:crud-design` comprueba la adopción de los componentes y los elementos de
accesibilidad. `tests/e2e/phase11-crud-design.spec.ts` valida el flujo de Pacientes, el
panel lateral, la operación por teclado y la presentación móvil con Playwright.
