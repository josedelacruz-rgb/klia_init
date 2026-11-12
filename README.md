# opencode-project-init

Plugin para **OpenCode V2 (2.2.5)** que analiza el proyecto abierto y genera documentación y configuración profesional rellenada con información **real** del proyecto: `AGENTS.md`, agentes, comandos, skills y documentos de arquitectura, desarrollo, pruebas y seguridad.

No usa plantillas vacías: solo afirma lo que puede verificar en `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `tsconfig.json`, scripts, dependencias, archivos de configuración y estructura de directorios. Lo que no se detecta se indica explícitamente como no detectado.

## Qué hace

- Detecta la raíz del proyecto, lenguajes, frameworks, gestor de paquetes, dependencias, scripts, pruebas, herramientas de calidad, puntos de entrada y directorios principales.
- Propone un plan de archivos antes de escribir nada.
- Solicita autorización y **nunca sobrescribe** un archivo existente sin permiso explícito.
- Crea copias de seguridad `.bak-YYYYMMDD-HHmmss` antes de actualizar.
- Conserva el contenido del usuario en `AGENTS.md` y `docs/*.md` mediante un bloque gestionado.
- Fusiona `opencode.json(c)` existente sin destruir claves ni comentarios.
- Valida Markdown, JSONC y frontmatter de agentes/comandos/skills.
- Devuelve un informe con archivos creados, actualizados, omitidos, fallidos y validaciones.

## Requisitos

| Elemento | Versión |
| --- | --- |
| OpenCode CLI | 2.2.5 |
| `@opencode/plugin` | 2.2.5 |
| Bun (runtime de OpenCode y pruebas) | 1.x |
| Node.js (build alternativo) | >= 20 |

## Instalación

Hay dos formas de instalar el plugin: desde npm o en local para desarrollo.

### Desde npm

```bash
bun add opencode-project-init
# o
npm install opencode-project-init
```

Declara el plugin en `opencode.json(c)` del proyecto:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-project-init"]
}
```

Reinicia OpenCode. El comando `/project-init` estará disponible en la sesión.

### Instalación local (desarrollo)

Construye el plugin y apunta la configuración a su directorio:

```bash
bun install
bun run build
```

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    { "package": "./ruta/a/opencode-project-init" }
  ]
}
```

También puedes colocar el paquete dentro de `.opencode/plugins/`, que OpenCode carga automáticamente.

### Compilar desde el código fuente

```bash
bun install
bun run build       # tsc -p tsconfig.json
bun run typecheck   # tsc --noEmit
bun test            # suite de pruebas
```

El paquete es ESM (`"type": "module"`) y exporta dos entrypoints:

| Export | Archivo | Uso |
| --- | --- | --- |
| `.` | `dist/index.js` | Plugin servidor: herramienta `project_init` y comando `/project-init`. |
| `./tui` | `dist/tui.js` | Plugin TUI: comando `/project-init-tui` con diálogos nativos. |

### Plugin TUI

Los plugins de terminal se declaran en la configuración global de la TUI, no en `opencode.json(c)`:

```jsonc
// ~/.config/opencode/cli.json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": ["C:/ruta/a/opencode-project-init"]
}
```

Con el paquete publicado se usa su nombre (`"opencode-project-init"`). La TUI recarga `cli.json` automáticamente y registra `/project-init-tui`.

## Configuración

El plugin no requiere opciones adicionales. Solo necesita estar declarado en `plugins`.

No genera proveedores, modelos, API keys, servidores MCP ni reglas de permisos: si el proyecto no los declara, no aparecen.

## Uso de `/project-init`

1. Ejecuta `/project-init` en OpenCode.
2. El agente invoca la herramienta `project_init` sin `confirm`.
3. Se muestra el análisis detectado y la lista de archivos propuestos, separando nuevos y existentes.
4. El agente pide autorización explícita. Para los archivos existentes debes indicar cuáles autorizas.
5. Con tu confirmación, el agente invoca `project_init` con `confirm: true` y la lista `overwrite` de rutas autorizadas.
6. El plugin escribe de forma atómica, valida y devuelve el informe final.

Parámetros de la herramienta:

| Parámetro | Tipo | Descripción |
| --- | --- | --- |
| `confirm` | `boolean` (opcional) | Sin valor solo analiza y propone. Con `true` escribe. |
| `overwrite` | `string[]` (opcional) | Rutas relativas de archivos existentes autorizados a actualizar. |

Los archivos existentes que no aparezcan en `overwrite` se omiten, aunque se pase `confirm: true`.

### Uso de `/project-init-tui`

El comando TUI ejecuta el mismo flujo sin depender de que el agente pregunte en el chat:

1. Ejecuta `/project-init-tui`.
2. Se abre un diálogo con el análisis real y la lista de archivos nuevos y existentes.
3. Elige entre aplicar el plan, crear solo los archivos nuevos o cancelar.
4. Cada archivo existente se autoriza individualmente; omitir uno no cancela el resto.
5. Confirma la escritura y revisa el informe completo desde el diálogo final.

Ningún diálogo escribe archivos por sí solo: la escritura ocurre tras la confirmación final.

## Archivos generados

| Archivo | Contenido |
| --- | --- |
| `AGENTS.md` | Nombre, finalidad, tecnologías, arquitectura, scripts, pruebas, convenciones, reglas, errores, seguridad y criterios de calidad. |
| `docs/architecture.md` | Resumen, puntos de entrada, organización de directorios y dependencias de ejecución. |
| `docs/development.md` | Requisitos, instalación, scripts y flujo de trabajo. |
| `docs/testing.md` | Herramientas, comandos y estructura de pruebas detectadas. |
| `docs/security.md` | Superficie expuesta, prácticas obligatorias y dependencias a revisar. |
| `docs/rules.md` | Convenciones de código, documentación, revisión y lista de verificación. |
| `.opencode/agents/architect.md` | Diseño de cambios y evaluación de arquitectura (edición con confirmación). |
| `.opencode/agents/reviewer.md` | Revisión de solo lectura (`edit: deny`). |
| `.opencode/agents/tester.md` | Escritura y ejecución de pruebas. |
| `.opencode/commands/audit.md` | Auditoría técnica de calidad, seguridad y pruebas. |
| `.opencode/commands/release-check.md` | Comprobación previa a la publicación. |
| `.opencode/skills/project-quality/SKILL.md` | Procedimientos de revisión, calidad, seguridad y publicación. |
| `opencode.json(c)` | Solo si ya existe y le falta `$schema`; se inserta sin re-serializar. |

## Ejemplo de salida

Plan previo (no escribe archivos):

```markdown
# Análisis de mi-proyecto

## Proyecto detectado

| Aspecto | Valor |
| --- | --- |
| Nombre | mi-proyecto |
| Finalidad | API interna de gestión de pedidos |
| Tipo | api, library |
| Lenguajes | TypeScript |
| Frameworks | Fastify |
| Gestor de paquetes | pnpm |
| Pruebas | vitest |
| Calidad | eslint, prettier |

## Archivos propuestos

Nuevos: **10**. Existentes: **2**.

### Se crearán

- `AGENTS.md` — Instrucciones del proyecto para agentes
- `docs/architecture.md` — Arquitectura y organización
- `.opencode/agents/reviewer.md` — Agente reviewer: Revisión de cambios en solo lectura
...

### Ya existen (requieren autorización)

- `docs/rules.md` — Reglas de código y revisión. Se actualizará solo si lo autorizas.
- `opencode.json` — Añade $schema a la configuración de OpenCode existente. Se actualizará solo si lo autorizas.

## Siguiente paso

No se ha escrito ningún archivo. Confirma la generación para crearlos.
```

Informe final:

```markdown
# Informe de project-init

## Archivos

Creados: **10**. Actualizados: **2**. Omitidos: **0**. Fallidos: **0**.

### Actualizados

- `docs/rules.md` — Copia de seguridad: `docs/rules.md.bak-20261112-101530`.
- `opencode.json` — Copia de seguridad: `opencode.json.bak-20261112-101530`.

## Validaciones

Sin incidencias: todos los archivos generados son válidos.

## Resultado

Correcto: 0 errores, 0 avisos.
```

## Protección de archivos

- **Autorización obligatoria:** un archivo existente solo se actualiza si su ruta está en `overwrite`.
- **Copias de seguridad:** `<archivo>.bak-YYYYMMDD-HHmmss` (con sufijo numérico si ya existe).
- **Bloque gestionado:** en `AGENTS.md` y `docs/*.md` el contenido previo se conserva y solo se reemplaza lo delimitado por:

  ```html
  <!-- opencode-project-init:start -->
  ...
  <!-- opencode-project-init:end -->
  ```

  Si los marcadores están incompletos o desordenados, la escritura falla en lugar de corromper el archivo.
- **Fusión JSONC:** `opencode.json(c)` conserva comentarios cuando el cambio es una inserción; si debe fusionar claves, mantiene las existentes y las generadas ganan en conflicto.
- **Rutas seguras:** se rechazan rutas absolutas, `..` y rutas que atraviesan enlaces simbólicos.
- **Escritura atómica:** archivo temporal + `rename` en el mismo directorio.

## Validaciones

- **Markdown:** no vacío, cuerpo real, un título `#`, bloques de código cerrados, secciones con contenido y sin marcadores de plantilla ni anotaciones de trabajo sin resolver.
- **JSONC:** parseo correcto y tipos válidos para `$schema`, `plugins`, `commands`, `agents`, `permissions`, `skills` e `instructions`.
- **Frontmatter V2:** claves permitidas para agentes, comandos y skills; `mode` válido; `steps` entero positivo; reglas de permisos con `action`, `resource` y `effect` válidos. Se rechazan campos V1 como `permission`, `tools` o `maxSteps`.

## Compatibilidad con Windows

- Todas las rutas usan `node:path` (`join`, `resolve`, `relative`); no se invocan comandos de shell.
- La comparación de rutas autorizadas ignora mayúsculas en Windows.
- La escritura atómica y las copias de seguridad funcionan en NTFS.
- El plugin se ejecuta dentro de OpenCode (Bun), por lo que funciona igual en **CMD**, **PowerShell** y terminales de WSL. Los comandos de instalación son los mismos:

  ```powershell
  bun add opencode-project-init
  npm install opencode-project-init
  bun run build
  bun test
  ```

- No se admiten symlinks en las rutas de escritura, para evitar escapes fuera del proyecto.

## Limitaciones

- El análisis es estático: lee archivos y metadatos, no ejecuta el proyecto ni inspecciona estado en runtime.
- La finalidad solo se toma de `package.json`/`pyproject.toml`; si no está declarada, se indica como no declarada en lugar de inventarla.
- La herramienta `project_init` exige `confirm` y `overwrite`; el comando `/project-init` delega el diálogo en el agente. Para autorizaciones nativas usa `/project-init-tui`, que requiere el plugin TUI declarado en `cli.json` (solo configuración global).
- `opencode.json(c)` no se crea desde cero ni se le añaden plugins, modelos, MCP o permisos; solo se inserta `$schema` en una configuración existente que lo necesite.
- La escritura usa `node:fs/promises` dentro del runtime Bun de OpenCode; no es una API de filesystem documentada del SDK.
- La validación es estructural y de frontmatter, no una validación completa contra el JSON Schema de `opencode.ai/config.json`.
- No ejecuta operaciones Git ni crea commits.

## Desarrollo

```text
src/
  index.ts            Registro del plugin servidor, comando /project-init y herramienta project_init
  tui.ts              Plugin TUI: comando /project-init-tui y diálogos de autorización
  project-detector.ts Recopilación de hechos del sistema de archivos
  project-analyzer.ts Interpretación de lenguajes, tipos, herramientas y arquitectura
  file-planner.ts     Decisión y renderizado de los archivos a generar
  template-engine.ts  Utilidades Markdown/JSONC
  file-manager.ts     Escritura segura, fusión y copias de seguridad
  validators.ts       Validación de Markdown, JSONC y frontmatter
  report.ts           Plan e informe final
  jsonc.ts            Parser JSONC y utilidades
  types.ts            Tipos compartidos
tests/
  unit/               Pruebas unitarias de cada módulo
  integration/        Flujo completo sobre fixtures
  fixtures/           Proyecto vacío, TypeScript y configuración existente
docs/
  plugin-api-notes.md Notas verificadas de la API de OpenCode 2.2.5
```

Scripts:

| Comando | Descripción |
| --- | --- |
| `bun run build` | Compila a `dist/` con TypeScript estricto. |
| `bun run typecheck` | Comprueba tipos sin emitir. |
| `bun test` | Ejecuta pruebas unitarias y de integración. |
| `bun run clean` | Elimina `dist/`. |

## Documentación adicional

- [Notas de la API de plugins de OpenCode 2.2.5](docs/plugin-api-notes.md)

## Licencia

MIT
