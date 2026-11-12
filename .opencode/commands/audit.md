---
description: "Audita la calidad, seguridad y pruebas de opencode-project-init"
---

# Auditoría técnica de opencode-project-init

Audita el proyecto de forma objetiva y basada en evidencia. Alcance solicitado: `$ARGUMENTS` (si está vacío, revisa todo el proyecto).

## Contexto verificado
- **Proyecto:** `opencode-project-init`
- **Tipo:** opencode-plugin
- **Lenguajes:** TypeScript
- **Gestor de paquetes:** bun

## Comprobaciones disponibles
**Calidad:** herramientas detectadas: `TypeScript (tsc)`, sin script asociado.

**Compilación:**

- `build` → `tsc -p tsconfig.json`
- `typecheck` → `tsc -p tsconfig.json --noEmit`

**Pruebas:**

- `test` → `bun test`

## Procedimiento
- Lee `AGENTS.md` y `docs/` para conocer las convenciones y la arquitectura reales.
- Delimita el alcance y localiza los archivos implicados antes de opinar.
- Ejecuta las comprobaciones disponibles y registra el comando y su resultado.
- Revisa seguridad: secretos, entradas externas, permisos y dependencias nuevas.
- Contrasta la documentación con el código: señala lo desactualizado o ausente.
- Clasifica cada hallazgo como bloqueante, importante o sugerencia.

## Formato de salida
- Resumen breve del estado del proyecto y del alcance revisado.
- Hallazgos ordenados por severidad, con archivo y línea cuando aplique.
- Impacto real y corrección concreta propuesta para cada hallazgo.
- Comprobaciones ejecutadas y las que no pudiste ejecutar, con el motivo.
- No incluyas elogios ni texto de relleno.

## Límites
- No modifiques archivos: esta auditoría es de solo lectura.
- No instales dependencias ni ejecutes comandos destructivos.
- No inventes fallos: sin evidencia verificable, no lo reportes como defecto.
- No marques como correcto lo que no hayas podido comprobar.
