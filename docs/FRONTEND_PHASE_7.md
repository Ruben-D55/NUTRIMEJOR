# Fase 7: mejoras del frontend

La interfaz Next.js dispone de espacios de trabajo conectados al API Gateway para
pacientes, historia clínica, mediciones, evaluación nutricional, planes, agenda,
notificaciones, documentos, reportes y membresía.

## Comportamiento incluido

- altas y ediciones donde la API permite cambios;
- publicación, finalización y cambio de estado en registros clínicos inmutables;
- búsqueda, filtros y paginación;
- estados de carga, resultados vacíos y errores recuperables;
- confirmaciones antes de archivar, publicar o cambiar la membresía;
- validación de formularios con mensajes legibles;
- presentación adaptable para escritorio y móvil;
- navegación por teclado, foco visible, diálogos con foco contenido, contraste y
  alternativas tabulares para las gráficas;
- evolución de peso, IMC, perímetros y composición corporal desde las sesiones de
  medición reales.

Los registros clínicos que el dominio define como inmutables no muestran una falsa
operación de borrado. La interfaz usa las transiciones auditables expuestas por cada
API.

## Verificación

```bash
npm run typecheck
npm run verify:frontend
npm run test:e2e
npm run build
```

La verificación del frontend también se ejecuta en GitHub Actions.
