# PROMPT: DESARROLLO DEL PLUGIN OPENCODE PROJECT INITIALIZER

Estás desarrollando, de forma iterativa con Ralph Wiggum 1.2.2, un plugin para OpenCode V2 (versión objetivo: 2.2.5) llamado **opencode-project-init**. El directorio de trabajo actual es la raíz del proyecto del plugin.

El plugin expone un único comando `/project-init` que analiza el proyecto abierto en OpenCode, detecta su tecnología y finalidad, y genera documentación y configuración profesional (AGENTS.md, agentes, comandos, skills y docs) rellenados con información REAL del proyecto. Nunca plantillas vacías.

## TAREAS (Tasks Mode de Ralph)

Consulta siempre `ralph --status --tasks` o la lista de tareas antes de empezar una iteración. Trabaja UNA tarea por iteración. No repitas trabajo completado. Guarda progreso en archivos del proyecto (no solo en conversación). Antes de marcar una tarea como completada, ejecuta las comprobaciones (build, tests) y verifica con evidencias. Si algo falla, corrígelo antes de marcarla. No emitas COMPLETE mientras queden tareas obligatorias pendientes.

### TAREA 1 — Investigación técnica
Investiga la API oficial de plugins de OpenCode V2 (usa `opencode` CLI, su documentación local/ayuda, o el paquete `@opencode-ai/plugin` en node_modules tras instalarlo). Verifica y documenta en `docs/plugin-api-notes.md`:
- Cómo registrar un plugin (firma de `plugin()`, hooks disponibles) para OpenCode 2.x.
- Cómo registrar un comando personalizado (`/project-init`) y cómo el comando puede ejecutar lógica (¿los comandos .md admiten agentes/toolcalls? ¿o hay que usar hooks/SDK?).
- Cómo acceder al directorio del proyecto activo y escribir archivos de forma segura desde un plugin (herramientas o SDK).
- Estructura correcta de `.opencode/agents/*.md`, `.opencode/commands/*.md`, `.opencode/skills/<name>/SKILL.md` (frontmatter válido para OpenCode 2.2.5).
- Esquema de `opencode.json(c)`: https://opencode.ai/config.json
Confirma compatibilidad con OpenCode 2.2.5. No inventes APIs: verifica contra el código/tipos reales del SDK.

### TAREA 2 — Preparación
Crea el proyecto TypeScript del plugin:
- `package.json` con nombre `opencode-project-init`, scripts `build` (tsc), `test`, `typecheck`.
- TypeScript estricto, target/module apropiados para Bun/Node.
- Instala `@opencode-ai/plugin` (y `@opencode-ai/sdk` si procede) como dependencia.
- Estructura: `src/index.ts` (registro del plugin y del comando `/project-init`), `src/project-detector.ts`, `src/project-analyzer.ts`, `src/file-planner.ts`, `src/template-engine.ts`, `src/file-manager.ts`, `src/validators.ts`, `src/report.ts`.
- Build inicial que compile sin errores.

### TAREA 3 — Detección de proyectos
Implementa `project-detector.ts` y `project-analyzer.ts`:
- Detectar raíz del proyecto.
- Detectar lenguajes (TypeScript, JavaScript, Python, etc.) y tecnologías (plugin OpenCode, CLI, API REST, web, escritorio, librería, monorepo) a partir de package.json/pyproject/tsconfig/go.mod, etc.
- Detectar dependencias, scripts, pruebas (vitest/jest/pytest...), herramientas de calidad (eslint/prettier/biome...), arquitectura y módulos principales, documentación existente.
- Exploración selectiva: excluir node_modules, dist, build, coverage, .git y archivos generados.
- Solo afirmar lo verificable; sin inventar características.

### TAREA 4 — Generación principal
Implementa `file-planner.ts`, `template-engine.ts` y `file-manager.ts`:
- Generar `AGENTS.md` personalizado: nombre/finalidad, tecnologías, arquitectura, organización de directorios, convenciones, reglas, errores, seguridad, pruebas, compilación, criterios de calidad. Conciso.
- Generar `opencode.jsonc` SOLO cuando sea necesario, conforme al esquema oficial, fusionando configuración existente sin destruirla. Nunca inventar proveedores, modelos, API keys, MCP ni permisos.
- Generar `docs/` cuando corresponda: `architecture.md`, `development.md`, `testing.md`, `security.md`, `rules.md` (rules.md es documentación complementaria, no especial de OpenCode). Todo con información real del análisis.

### TAREA 5 — Agentes
Generar en `.opencode/agents/`:
- `architect.md`, `reviewer.md` (solo lectura), `tester.md`.
Cada uno con frontmatter válido según OpenCode 2.2.5 (verificado en TAREA 1), descripción, responsabilidad, instrucciones y permisos adecuados. No duplicar el contenido general de AGENTS.md. Validar frontmatter con `validators.ts`.

### TAREA 6 — Comandos y skills
Generar en `.opencode/commands/`: `audit.md` (auditoría técnica) y `release-check.md` (preparación para GitHub/publicación). Generar `.opencode/skills/project-quality/SKILL.md` con procedimientos de revisión técnica, calidad, seguridad y preparación para publicación. Verificar formato correcto según lo investigado en TAREA 1.

### TAREA 7 — Protección de archivos
Implementar en `file-manager.ts`:
- Detección de archivos existentes; NUNCA sobrescribir sin autorización del usuario.
- Flujo del comando `/project-init`: analizar → presentar resumen detectado → proponer archivos a generar → solicitar autorización (pregunta interactiva) → generar → validar → informe final.
- Actualización selectiva y fusión para configuraciones existentes.
- Copias de seguridad (con sufijo o carpeta) cuando se actualice un archivo existente autorizado.
- Conservar secciones personalizadas del usuario (marcadores de sección si aplica).
- Si existe AGENTS.md, no sustituirlo automáticamente: proponer y pedir permiso.

### TAREA 8 — Validaciones
Implementar `validators.ts` y `report.ts`:
- Validar Markdown generado (estructura, headings, no vacío).
- Validar JSONC (parseo).
- Validar frontmatter de agentes/comandos/skills.
- Detectar documentos incompletos (placeholders tipo TODO/{{}} sin rellenar).
- Informe final: archivos creados/actualizados/omitidos, validaciones, resumen del análisis.

### TAREA 9 — Pruebas
- Pruebas unitarias (Bun test o vitest) para detector, analyzer, planner, template engine, file-manager (protección de archivos) y validators.
- Pruebas de integración en proyectos de muestra (crea fixtures en `tests/fixtures/`): 1) proyecto vacío, 2) proyecto TypeScript pequeño, 3) proyecto existente con AGENTS.md y opencode.json que NO debe destruirse.
- Verificar que la salida del plugin para el fixture 3 protege los archivos existentes.
- Ejecutar `bun test` (o el runner elegido) con todos los tests en verde y `tsc` sin errores.

### TAREA 10 — Documentación y entrega
- `README.md` del plugin: qué hace, instalación (npm/bun, cómo instalarlo en OpenCode 2.2.5), configuración, uso de `/project-init`, ejemplos de salida, limitaciones, compatibilidad con Windows (CMD/PowerShell).
- Actualizar `docs/plugin-api-notes.md` con hallazgos finales.

## REGLAS GENERALES
- Sencillo, modular, profesional. KISS/DRY/YAGNI. Sin funcionalidades extra.
- No uses `git` para commits (Ralph corre con --no-commit); el directorio no es repo git.
- Windows: usa rutas con la API de Node/Bun (path.join), no comandos shell específicos de Unix donde se pueda evitar.
- Tras cada cambio ejecuta build + tests relevantes.
- Cada iteración: consulta el estado de tareas, elige la siguiente pendiente, trabaja solo esa.
- Cuando completes TODAS las tareas con verificación, escribe el informe final de entrega y emite `<promise>COMPLETE</promise>`. Si llegas al límite de iteraciones con tareas pendientes, deja el progreso guardado y el estado documentado en el repo (por ejemplo en `STATUS.md`), sin emitir COMPLETE.
