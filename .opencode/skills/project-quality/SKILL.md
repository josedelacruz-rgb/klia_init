---
name: Project Quality
description: "Revisión técnica, calidad, seguridad y preparación para publicar opencode-project-init"
metadata:
  opencode/autoinvoke: true
---

# Project Quality

> Procedimientos para revisar cambios, auditar calidad y seguridad y preparar una publicación de `opencode-project-init`. No repite las convenciones de `AGENTS.md`: léelo antes de aplicar esta skill.

## Cuándo usarla
- Antes de dar por terminado un cambio relevante.
- Al revisar un diff, una auditoría o un informe de pruebas.
- Antes de publicar una versión o abrir una solicitud de cambios.

## Contexto verificado
- **Lenguajes:** TypeScript
- **Gestor de paquetes:** bun
- **Herramientas de calidad:** `TypeScript (tsc)`
- **Herramientas de prueba:** `Bun test`

## Procedimiento de revisión
- Delimita el cambio y lee los archivos reales implicados.
- Comprueba que el código respeta la arquitectura y los patrones existentes.
- Verifica que el cambio cubre un comportamiento observable y tiene pruebas.
- Ejecuta compilación, pruebas y calidad; registra comando y resultado.
- Revisa errores, casos límite y compatibilidad con lo ya existente.

## Comprobaciones
**Compilación:**

- `build` → `tsc -p tsconfig.json`
- `typecheck` → `tsc -p tsconfig.json --noEmit`

**Pruebas:**

- `test` → `bun test`

**Calidad:** no se detectaron scripts de lint, formato o comprobación.

## Seguridad
- Busca secretos, credenciales, tokens y datos personales en el diff.
- Verifica validación y saneamiento de toda entrada externa.
- Comprueba permisos y mínimo privilegio en herramientas y automatizaciones.
- Revisa dependencias nuevas por mantenimiento, licencia y vulnerabilidades.

## Preparación para publicación
- Metadatos del paquete completos y artefactos publicables incluidos.
- README y documentación actualizados con el comportamiento real.
- Sin artefactos, dependencias ni datos locales versionados.
- Árbol de trabajo limpio y diff revisado.

## Criterios de aceptación
- Compilación o typecheck sin errores.
- Todas las pruebas pasan.
- Sin hallazgos bloqueantes de seguridad o calidad.
- Documentación coherente con el cambio.

## Límites
- No apruebes lo que no hayas podido comprobar.
- No desactives pruebas o validaciones para conseguir verde.
- No publiques ni modifiques archivos sin autorización.
- No inventes resultados ni versiones.
