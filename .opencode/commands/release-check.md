---
description: "Comprueba que opencode-project-init está listo para publicarse"
---

# Preparación de publicación de opencode-project-init

Comprueba que el proyecto puede publicarse o entregarse sin defectos conocidos. Alcance solicitado: `$ARGUMENTS` (si está vacío, aplica la lista completa).

## Contexto verificado
- **Proyecto:** `opencode-project-init`
- **Tipo:** opencode-plugin, opencode-project
- **Gestor de paquetes:** bun
- **Finalidad declarada:** Plugin de OpenCode que analiza el proyecto y genera documentación y configuración profesional

## Comprobaciones obligatorias
**Compilación:**

- `build` → `tsc -p tsconfig.json`
- `typecheck` → `tsc -p tsconfig.json --noEmit`

**Pruebas:**

- `test` → `bun test`

**Calidad:** no se detectaron scripts de lint o formato.

## Metadatos del paquete
- `name`, `version`, `description` y `license` presentes y coherentes.
- `exports`, `main` o `module` apuntan a los artefactos reales generados.
- `files` incluye solo lo necesario para publicar (por ejemplo `dist`).
- Los scripts de build y test funcionan desde un clon limpio.

## Compatibilidad con OpenCode
- La versión de `@opencode/plugin` coincide con la del CLI objetivo.
- El paquete es ESM (`"type": "module"`) y exporta el servidor por `.`.
- El build genera `dist/` y está incluido en `files`.
- No se bundlea `effect`; debe resolverse contra el host.

## Documentación
- `README.md` describe qué hace, instalación, uso y limitaciones.
- `AGENTS.md` y `docs/` reflejan el estado real del proyecto.
- No quedan marcadores pendientes, secciones vacías ni afirmaciones sin verificar.

## Seguridad y repositorio
- No hay secretos, tokens, claves ni rutas locales en archivos versionados.
- `.gitignore` excluye dependencias, artefactos y datos locales.
- Las dependencias nuevas están justificadas y sin vulnerabilidades conocidas.
- El árbol de trabajo está limpio y el diff revisado.

## Formato de salida
- Estado: listo o bloqueado, con el motivo principal.
- Lista de comprobaciones ejecutadas y su resultado.
- Bloqueantes pendientes con archivo o comando concreto.
- Siguiente paso recomendado (por ejemplo, publicar o corregir).

## Límites
- No publiques ni subas cambios sin autorización explícita.
- No inventes versiones, licencias, modelos ni datos de publicación.
- No marques como listo un proyecto cuyas pruebas no hayan pasado.
