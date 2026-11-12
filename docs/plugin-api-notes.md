# OpenCode V2 Plugin API — Notas de investigación

> Verificado contra **OpenCode 2.2.5** (CLI instalada) y **`@opencode/plugin@2.2.5`**
> (paquete publicado leído desde npm). Fecha: 2026-11-12.
>
> Fuentes oficiales (V2): <https://opencode.ai/docs/build/plugins/>,
> <https://opencode.ai/docs/build/plugins/server/>, <https://opencode.ai/docs/commands/>,
> <https://opencode.ai/docs/agents/>, <https://opencode.ai/docs/skills/>,
> <https://opencode.ai/docs/config/>, <https://opencode.ai/docs/permissions/> y
> <https://opencode.ai/config.json>.

## 1. Identidad del paquete y compatibilidad

| Elemento | Valor verificado |
| --- | --- |
| CLI objetivo | `opencode --version` → `2.2.5` |
| Paquete de plugin V2 | `@opencode/plugin` (versión `2.2.5` disponible) |
| Paquete V1 (NO usar) | `@opencode-ai/plugin` (última `1.19.5`) |
| Módulo | ESM (`"type": "module"`) |
| Entrypoint servidor | export por defecto de `.` (o `./server`) |
| Entrypoint TUI | `./tui` |
| Entrypoint RPC | `./rpc` |

`package.json` mínimo publicado (docs de V2):

```json
{
  "name": "opencode-project-init",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "files": ["dist"],
  "dependencies": {
    "@opencode/plugin": "2.2.5"
  }
}
```

Notas:

- El README de `@opencode/plugin` indica declarar `effect` como
  `peerDependency` en el plugin (y como `devDependency` para typecheck); no se
  debe bundlear `effect`. OpenCode resuelve `effect` y `@opencode/plugin` contra
  la instancia del host.
- Fijar `@opencode/plugin` a la misma versión que el CLI evita desajustes de tipos.
- Un plugin local en `.opencode/plugins/<dir>/` puede ser TypeScript directamente;
  un paquete publicado debe compilarse a JS y exportar el servidor por `.`.

## 2. Registro del plugin y ciclo de vida

```ts
import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "project-init",
  setup(ctx) {
    // registrar comandos, herramientas, hooks...
    return () => {
      // limpieza opcional (abortar streams, timers, etc.)
    }
  },
})
```

- `id`: identificador estable del plugin.
- `setup(ctx)`: se ejecuta al cargar; puede ser `async` y devolver una función de
  limpieza (`Cleanup`).
- Forma V1 (`async server() { return { "tool.execute.before": ... } }`) no es la
  API V2. Se puede coexistir exportando un objeto que mezcle `Plugin.define(...)`
  con `server()`, pero el código nuevo debe usar solo V2.
- Carga automática desde `.opencode/plugins/` o declaración en `opencode.json(c)`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "opencode-project-init",
    { "package": "./plugins/project-init", "options": { "strict": true } }
  ]
}
```

- Opciones del plugin: `ctx.options` (objeto de `options`).
- Contexto relevante (`@opencode/plugin` `Context`):
  - `ctx.app.version` — versión de OpenCode.
  - `ctx.location.directory` — directorio de la Location activa.
  - `ctx.location.project.canonical` — raíz canónica del proyecto.
  - `ctx.options` — opciones declaradas en la config.
  - Dominios: `agent`, `command`, `event`, `permission`, `session`, `skill`,
    `storage`, `tool`, `vcs`, `worktree`, `websearch`, `experimental.generate`,
    entre otros.

## 3. Comandos `/project-init`

Un comando puede definirse como Markdown o registrarse programáticamente desde el plugin.

### 3.1 Comandos Markdown (`.opencode/commands/*.md`)

Son **plantillas de prompt**, no código ejecutable. El cuerpo se envía como
prompt de usuario; el frontmatter solo acepta metadatos:

```md
---
description: Inicializa documentación del proyecto
agent: build
model: anthropic/claude-sonnet-5-5#high
subagent: false
---

Analiza este proyecto y propón la documentación inicial. $ARGUMENTS
```

Campos válidos (frontmatter y JSON): `description`, `agent`, `model`,
`subagent` (`subtask` es alias deprecado). En JSON se añade `template`
(obligatorio). El cuerpo Markdown **es** el template; no se pone `template` en
frontmatter.

- Placeholders: `$ARGUMENTS`, `$1`, `$2`, etc.
- Bloques shell: `` !`comando` `` se ejecutan al evaluar el comando, **fuera** del
  flujo de permisos del agente. No usarlos con argumentos no confiables.
- Un comando Markdown no puede ejecutar lógica propia del plugin ni escribir
  archivos por sí mismo; solo provoca un turno del agente.

### 3.2 Comandos programáticos (API de plugin)

La forma correcta de ejecutar lógica propia al invocar `/project-init` es
registrar el comando desde `setup` con `ctx.command.transform`:

```ts
await ctx.command.transform((editor) => {
  editor.add({
    name: "project-init",
    description: "Analiza el proyecto y genera documentación/agents/config",
    execute: async ({ sessionID, prompt, delivery }) => {
      await ctx.session.prompt({
        sessionID,
        delivery,
        text: "Ejecuta la herramienta project_init para analizar el proyecto. " +
          "Muestra el resumen y pide autorización antes de escribir.",
      })
    },
  })
})
```

Firma verificada en `@opencode/plugin` (`dist/promise/command.d.ts`):

```ts
interface CommandInvocation {
  readonly sessionID: Session.ID
  readonly prompt: PromptInput.Prompt
  readonly delivery: "steer" | "queue"
}

interface CommandDefinition {
  readonly name: string          // sin la barra: "project-init"
  readonly description?: string
  readonly execute: (input: CommandInvocation) => Promise<void>
}

interface CommandEditor {
  add(definition: CommandDefinition): void
}
```

Implicaciones para el plugin:

- El comando ejecuta código arbitrario (análisis, escritura), pero **no puede
  bloquearse esperando una respuesta libre del usuario** dentro de `execute`.
- Para el flujo «resumen → propuesta → autorización → escritura → informe», lo
  natural es:
  1. Registrar una herramienta (`project_init`) con `ctx.tool.transform`.
  2. El comando `/project-init` envía un prompt que ordena al agente invocar la
     herramienta.
  3. La herramienta, sin `confirm`, devuelve el análisis y la lista de archivos
     propuestos; el agente pide confirmación al usuario en la conversación.
  4. Con `confirm: true`, la herramienta escribe de forma segura y devuelve el
     informe final.
- Alternativa de autorización con `ctx.permission.assert(...)`: solo muestra
  prompt si la regla resuelve a `ask`. La política base incluye
  `{ "action": "*", "resource": "*", "effect": "allow" }`, así que por defecto no
  pregunta; no sirve como confirmación universal sin añadir reglas al proyecto.
  No inventar reglas de permisos en el `opencode.jsonc` generado.

## 4. Agentes (`.opencode/agents/*.md`)

Ubicación: `.opencode/agents/<name>.md` (proyecto) o
`~/.config/opencode/agents/<name>.md` (global). Rutas anidadas forman el ID:
`.opencode/agents/team/reviewer.md` → `team/reviewer`.

El cuerpo Markdown es el `system` del agente. Frontmatter V2 válido:

```md
---
description: Revisa cambios sin modificar archivos
mode: subagent
model: anthropic/claude-sonnet-5-5#high
permissions:
  - action: edit
    resource: "*"
    effect: deny
  - action: shell
    resource: "*"
    effect: ask
steps: 8
hidden: false
color: "#ff6b6b"
---

Instrucciones del agente...
```

Campos admitidos por `Config.AgentEncoded`:

| Campo | Tipo | Notas |
| --- | --- | --- |
| `description` | string | Visible al modelo que elige subagentes |
| `mode` | `primary` \| `subagent` \| `all` | Por defecto `primary` en agentes nuevos |
| `model` | `provider/model[#variant]` u objeto | |
| `permissions` | array de reglas | **V2**; reemplaza al `permission` de V1 |
| `steps` | entero > 0 | Máximo de pasos |
| `hidden` | boolean | Visibilidad, no seguridad |
| `color` | `#RRGGBB` | |
| `disabled` | boolean | |
| `request` | `{ headers?, body? }` | V2 aún no los envía en requests |

**Importante:** no usar campos V1 como `permission`, `tools`, `temperature`,
`prompt`, `disable`, `maxSteps`. `permissions` es una lista ordenada; gana la
última regla que coincide. La política base permite todo, así que para un
reviewer de solo lectura hay que negar `edit` explícitamente.

## 5. Skills (`.opencode/skills/<id>/SKILL.md`)

```md
---
name: Project Quality
description: Procedimientos de revisión técnica, calidad y seguridad
metadata:
  opencode/autoinvoke: true
---

## Procedimiento
1. ...
```

- Estructura recomendada: `.opencode/skills/<id>/SKILL.md` (el ID sale de la
  ruta, no de `name`; usar minúsculas kebab-case).
- Frontmatter: `name`, `description`, `metadata.opencode/autoinvoke` (false oculta
  del listado del modelo), `disable-model-invocation` (equivalente).
- La descripción es necesaria para que el modelo descubra la skill.
- Directorios compatibles: `.claude/skills`, `.agents/skills`; también
  `.opencode/skills` a nivel de proyecto y global.
- Permiso: acción `skill`, recurso = ID de la skill.

## 6. Configuración `opencode.json(c)`

- Esquema: `https://opencode.ai/config.json` (incluir `$schema`).
- Ubicaciones: `opencode.json(c)` o `.opencode/opencode.json(c)` en el proyecto,
  y `~/.config/opencode/opencode.json(c)` global.
- Precedencia de descubrimiento: se recorren el directorio actual y sus
  ancestros; se fusionan primero los `opencode.json(c)` directos (del más lejano
  al actual) y después los `.opencode/opencode.json(c)` (mismo orden). Los
  `.opencode` pisan a los directos; el proyecto pisa a la config global.
- Campos relevantes para este plugin:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-project-init"],
  "commands": {
    "audit": { "template": "Audita $ARGUMENTS.", "description": "..." }
  },
  "agents": {
    "reviewer": {
      "description": "Revisa sin editar",
      "mode": "subagent",
      "permissions": [{ "action": "edit", "resource": "*", "effect": "deny" }]
    }
  },
  "skills": ["./team-skills"],
  "instructions": ["CONTRIBUTING.md"],
  "permissions": [
    { "action": "shell", "resource": "*", "effect": "ask" }
  ]
}
```

- `plugins`: array de strings o `{ package, options }`.
- `commands`: objeto `nombre → { template (obligatorio), description?, agent?,
  model?, subagent?, subtask? }`.
- `agents`: objeto `id → Config.AgentEncoded` (ver §4).
- `skills`: array de rutas/URLs (la forma objeto está deprecada).
- `instructions`: array de rutas/URLs de instrucciones ambientales.
- `permissions`: array de `{ action, resource, effect }`.

El plugin debe **fusionar** la configuración existente y conservar claves
desconocidas; nunca generar proveedores, modelos, API keys, MCP ni permisos
inventados.

## 7. Acceso al proyecto y escritura de archivos

El plugin necesita resolver la raíz correcta y escribir sin salir de ella.

### 7.1 Directorio del proyecto

- Usar `ctx.location.project.canonical` como raíz canónica de escritura.
- `ctx.location.directory` es la Location activa (puede ser un subdirectorio o
  worktree); para generar archivos del proyecto, preferir `canonical`.
- `ctx.location.project.id` identifica el proyecto.
- No usar `process.cwd()`: el servidor puede servir varias Locations.

### 7.2 Escritura segura

La API de `@opencode/plugin` **no expone** un método de filesystem en `Context`.
El plugin servidor corre en el proceso Bun de OpenCode (el loader del paquete usa
`Bun.plugin`), por lo que puede importar módulos Node compatibles:

```ts
import { mkdir, writeFile, rename, lstat, readFile } from "node:fs/promises"
import path from "node:path"
```

Esto es una característica del runtime, no una API documentada de plugins; hay
que aislarlo en un módulo y probarlo en Windows.

Reglas de seguridad para `file-manager`:

1. Resolver siempre: `const abs = path.resolve(root, relative)`.
2. Verificar contención: `abs === root || abs.startsWith(root + path.sep)`
   (comparación case-insensitive en Windows). Rechazar rutas absolutas y `..`.
3. Rechazar symlinks existentes (`lstat`) para no escribir fuera del proyecto.
4. Crear directorios con `mkdir(dir, { recursive: true })`.
5. Escritura atómica: escribir a `<archivo>.tmp-<pid>-<ts>` y `rename`.
6. Nunca sobrescribir sin autorización: detectar existencia con `lstat`/`access`
   y pedir confirmación al usuario (flujo de §3.2).
7. Copia de seguridad antes de actualizar un archivo autorizado:
   `<archivo>.bak-YYYYMMDD-HHmmss`.
8. Validar después de escribir (Markdown/JSONC/frontmatter) y reportar.

## 8. Hooks disponibles en V2 (resumen)

No existe el objeto V1 de hooks. En V2 se registran dominios dentro de `setup`:

| Dominio | API |
| --- | --- |
| Herramientas | `ctx.tool.transform`, `ctx.tool.hook("execute.before"\|"execute.after")` |
| Comandos | `ctx.command.transform`, `ctx.command.reload()` |
| Agentes | `ctx.agent.transform`, `ctx.agent.reload()` |
| Skills | `ctx.skill.transform`, `ctx.skill.reload()` |
| Permisos | `ctx.permission.assert`, `ctx.permission.hook("evaluate")` |
| Sesiones | `ctx.session.hook("prompt"\|"context"\|"compaction"\|"generate"\|"title"\|"retry"\|...)` |
| Shell | `ctx.shell.hook("create.before")` |
| Eventos | `ctx.event.subscribe({ types, signal })` (AsyncIterable) |
| Storage | `ctx.storage.get/set/remove/scan` |

Las transformaciones son síncronas y se reaplican; los hooks devuelven
`Registration` con `dispose()`. La limpieza del plugin debe abortar streams y
timers.

## 9. Decisiones de diseño para `opencode-project-init`

1. **Un solo comando visible** `/project-init`, registrado con
   `ctx.command.transform` en `setup`.
2. **Herramienta `project_init`** registrada con `ctx.tool.transform`:
   - Entrada: `{ confirm?: boolean, overwrite?: string[] }`.
   - Sin `confirm`: devuelve análisis + propuesta (no escribe).
   - Con `confirm`: escribe, valida y devuelve informe.
3. El comando envía un prompt que obliga al agente a mostrar el resumen y pedir
   autorización explícita antes de llamar con `confirm: true`.
4. `AGENTS.md`, `.opencode/agents/*.md`, `.opencode/commands/*.md` y
   `.opencode/skills/project-quality/SKILL.md` se generan con frontmatter V2
   verificado en este documento.
5. `opencode.jsonc` solo se genera/fusiona si aporta algo necesario; se conserva
   el contenido existente y se hace backup antes de tocar nada.
6. Los agentes reviewer usan `permissions` V2 con `edit: deny`; no se usan
   campos V1.
7. Build con TypeScript estricto; `@opencode/plugin@2.2.5` como dependencia
   (y `@types/node` para `node:fs`).

## 10. Limitaciones y puntos a verificar en pruebas

- `ctx.command.execute` no espera respuestas libres del usuario; la confirmación
  se delega al turno del agente + herramienta.
- `ctx.permission.assert` no garantiza prompt por la política base `allow`;
  no usarlo como único mecanismo de confirmación.
- La escritura con `node:fs/promises` depende del runtime Bun del servidor; no
  está documentada como API pública. Probar en Windows (rutas, permisos,
  renombrado atómico).
- Los comandos Markdown no ejecutan código del plugin; si se generan comandos
  `.opencode/commands/*.md` para `audit`/`release-check`, su cuerpo debe ser un
  prompt útil y no depender de lógica interna.
- Confirmar en la integración real que OpenCode 2.2.5 acepta el `frontmatter`
  generado (agentes con `permissions`, skills con `metadata.opencode/autoinvoke`).

## 11. Hallazgos finales de la implementación

Verificado al cerrar la implementación contra `@opencode/plugin@2.2.5`
(`node_modules/@opencode/plugin/package.json` → `2.2.5`), con `tsc` estricto sin
errores y **103 pruebas en verde** (9 archivos de prueba).

### 11.1 Registro y ciclo de vida

```ts
import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "project-init",
  async setup(ctx) {
    const command = await ctx.command.transform((editor) => { /* ... */ })
    const tool = await ctx.tool.transform((editor) => { /* ... */ })
    return async () => {
      await command.dispose()
      await tool.dispose()
    }
  },
})
```

- `setup` puede ser `async`; las transformaciones devuelven un `Registration`
  con `dispose()`.
- La función de limpieza es necesaria para no dejar comandos/herramientas
  registrados si el plugin se descarga en caliente.

### 11.2 Comando y herramienta (confirmado en implementación)

- `ctx.command.transform((editor) => editor.add({ name, description, execute }))`
  registra `/project-init` sin la barra.
- `execute({ sessionID, prompt, delivery })` no espera input del usuario; en la
  implementación envía un prompt con `ctx.session.prompt({ sessionID, delivery, text })`
  que ordena al agente usar la herramienta y pedir autorización.
- La herramienta se registra con
  `ctx.tool.transform((editor) => editor.add({ name, description, input, execute }))`.
- `input` se declara con `Schema.Struct` de `effect`; en 2.2.5 los opcionales se
  marcan con `Schema.optional(...)`.
- `execute` devuelve `{ content, metadata }`. `metadata` se usa para distinguir
  la etapa `plan` de la etapa `written`.
- La autorización real se implementa en la herramienta: sin `confirm` no escribe;
  los archivos existentes solo se actualizan si su ruta está en `overwrite`.
  `ctx.permission.assert` no se usa como confirmación porque la política base
  permite todo por defecto.

### 11.3 Acceso al proyecto y escritura

- Raíz de escritura: `ctx.location.project.canonical`. No se usa `process.cwd()`
  porque el servidor puede servir varias Locations.
- `Context` no expone filesystem; la escritura se aisló en `file-manager.ts` con
  `node:fs/promises` y `node:path`, compatible con el runtime Bun de OpenCode.
- Controles implementados y probados:
  - resolución con `path.resolve` y contención con `path.relative`;
  - rechazo de rutas absolutas y `..`;
  - rechazo de symlinks en cualquier segmento de la ruta;
  - escritura atómica con archivo temporal + `rename`;
  - copia de seguridad `.bak-YYYYMMDD-HHmmss` antes de actualizar;
  - comparación de `overwrite` insensible a mayúsculas en Windows.

### 11.4 Frontmatter y configuración validados

Reglas aplicadas por `validators.ts` (coinciden con el esquema V2 verificado):

| Archivo | Claves admitidas |
| --- | --- |
| Agente | `description`, `mode`, `model`, `permissions`, `steps`, `hidden`, `color`, `disabled`, `request` |
| Comando | `description`, `agent`, `model`, `subagent`, `subtask` |
| Skill | `name`, `description`, `metadata`, `disable-model-invocation` |

- Se rechazan campos V1 (`permission`, `tools`, `temperature`, `prompt`,
  `disable`, `maxSteps`).
- `permissions` debe ser un array con reglas `{ action, resource, effect }` y
  `effect ∈ { allow, ask, deny }`.
- `mode ∈ { primary, subagent, all }`; `steps` entero > 0; `color` `#RRGGBB`.
- El agente `reviewer` se genera con `edit: deny`; `architect` y `tester` usan
  `edit: ask`/`allow` respectivamente y `shell: ask`.

### 11.5 Política sobre `opencode.json(c)`

- El plugin **no crea** configuración desde cero ni añade plugins, modelos, MCP,
  proveedores, API keys o permisos.
- Solo modifica un `opencode.json(c)` que ya exista y al que le falte `$schema`.
- `insertJsonSchema` inserta la clave sin re-serializar, conservando comentarios
  y orden.
- Si se fusionara con otro contenido, `mergeJsonc` aplica `deepMerge` y conserva
  las claves existentes; las generadas ganan en conflicto.
- La validación es estructural (parseo y tipos de claves conocidas), no una
  validación completa contra `https://opencode.ai/config.json`.

### 11.6 Pruebas y verificación

- `bun run build` (`tsc -p tsconfig.json`, estricto): sin errores.
- `bun test`: **103 pass / 0 fail**, 249 expectativas, 9 archivos.
- Cobertura funcional: detector, analyzer, planner, template engine, file-manager
  (protección y fusión), validators, report y flujo de integración sobre fixtures
  (proyecto vacío, TypeScript pequeño y proyecto con `AGENTS.md`/`opencode.json`
  existentes).
- El fixture con archivos existentes verifica que, sin autorización, se omiten y
  no se destruyen.

### 11.7 Verificación pendiente antes de publicar

- No se ejecutó una sesión manual completa de `/project-init` contra un servidor
  OpenCode 2.2.5 en esta iteración. La compatibilidad está verificada a nivel de
  tipos del paquete y con pruebas automatizadas.
- Antes de publicar, hacer un smoke test manual en un proyecto real:
  1. instalar el plugin en `opencode.json(c)`;
  2. ejecutar `/project-init` y comprobar el plan;
  3. autorizar un archivo existente y verificar la copia `.bak-*`;
  4. confirmar que OpenCode 2.2.5 carga los agentes, comandos y la skill
     generados sin errores de frontmatter.

## 12. Referencias

- Plugins overview: <https://opencode.ai/docs/build/plugins/>
- Server plugins y API: <https://opencode.ai/docs/build/plugins/server/>
- Comandos: <https://opencode.ai/docs/commands/>
- Agentes: <https://opencode.ai/docs/agents/>
- Skills: <https://opencode.ai/docs/skills/>
- Configuración: <https://opencode.ai/docs/config/>
- Permisos: <https://opencode.ai/docs/permissions/>
- Esquema: <https://opencode.ai/config.json>
- Paquete: `@opencode/plugin@2.2.5` (tipos en `dist/promise/*.d.ts`)
