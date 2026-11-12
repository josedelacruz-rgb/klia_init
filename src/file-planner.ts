import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import type { PlannedFile, ProjectAnalysis } from "./types.js"
import {
  bulletList,
  code,
  inlineList,
  insertJsonSchema,
  joinSections,
  markdownTable,
} from "./template-engine.js"

const OPENCODE_SCHEMA = "https://opencode.ai/config.json"

/**
 * Decide qué archivos generar a partir del análisis real del proyecto.
 */
export async function planProjectFiles(analysis: ProjectAnalysis): Promise<PlannedFile[]> {
  const files: PlannedFile[] = []

  const add = async (
    relativePath: string,
    description: string,
    content: string,
  ): Promise<void> => {
    const exists = await isFile(path.join(analysis.root, relativePath))
    files.push({
      path: relativePath,
      description,
      content,
      exists,
      mode: exists ? "overwrite" : "create",
    })
  }

  await add("AGENTS.md", "Instrucciones del proyecto para agentes", renderAgents(analysis))

  const documents: readonly {
    name: string
    description: string
    render: (value: ProjectAnalysis) => string
  }[] = [
    { name: "architecture", description: "Arquitectura y organización", render: renderArchitecture },
    { name: "development", description: "Desarrollo y compilación", render: renderDevelopment },
    { name: "testing", description: "Estrategia de pruebas", render: renderTesting },
    { name: "security", description: "Seguridad y dependencias", render: renderSecurity },
    { name: "rules", description: "Reglas de código y revisión", render: renderRules },
  ]
  for (const document of documents) {
    await add(`docs/${document.name}.md`, document.description, document.render(analysis))
  }

  const agents: readonly {
    name: string
    description: string
    render: (value: ProjectAnalysis) => string
  }[] = [
    {
      name: "architect",
      description: "Diseño de cambios y revisión de arquitectura",
      render: renderArchitectAgent,
    },
    {
      name: "reviewer",
      description: "Revisión de cambios en solo lectura",
      render: renderReviewerAgent,
    },
    {
      name: "tester",
      description: "Escritura y ejecución de pruebas",
      render: renderTesterAgent,
    },
  ]
  for (const agent of agents) {
    await add(
      `.opencode/agents/${agent.name}.md`,
      `Agente ${agent.name}: ${agent.description}`,
      agent.render(analysis),
    )
  }

  const commands: readonly {
    name: string
    description: string
    render: (value: ProjectAnalysis) => string
  }[] = [
    {
      name: "audit",
      description: "Auditoría técnica de calidad, seguridad y pruebas",
      render: renderAuditCommand,
    },
    {
      name: "release-check",
      description: "Comprobación previa a la publicación del proyecto",
      render: renderReleaseCommand,
    },
  ]
  for (const command of commands) {
    await add(
      `.opencode/commands/${command.name}.md`,
      `Comando /${command.name}: ${command.description}`,
      command.render(analysis),
    )
  }

  await add(
    ".opencode/skills/project-quality/SKILL.md",
    "Skill project-quality: revisión técnica, calidad, seguridad y publicación",
    renderProjectQualitySkill(analysis),
  )

  const config = await planOpencodeConfig(analysis)
  if (config) {
    await add(config.path, "Añade $schema a la configuración de OpenCode existente", config.content)
  }

  return files.sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * Solo toca `opencode.json(c)` si ya existe y le falta `$schema`.
 * Inserta la clave sin re-serializar, para conservar comentarios y orden.
 */
async function planOpencodeConfig(
  analysis: ProjectAnalysis,
): Promise<{ path: string; content: string } | null> {
  for (const relativePath of analysis.opencodeConfigPaths) {
    let content: string
    try {
      content = await readFile(path.join(analysis.root, relativePath), "utf8")
    } catch {
      continue
    }
    const updated = insertJsonSchema(content, OPENCODE_SCHEMA)
    if (updated) return { path: relativePath, content: updated }
  }
  return null
}

function renderAgents(analysis: ProjectAnalysis): string {
  const facts = markdownTable(
    ["Aspecto", "Valor detectado"],
    [
      ["Lenguajes", analysis.languages.length > 0 ? analysis.languages.join(", ") : "No detectados"],
      ["Frameworks", analysis.frameworks.length > 0 ? analysis.frameworks.join(", ") : "No detectados"],
      ["Tipo de proyecto", analysis.kinds.join(", ")],
      ["Gestor de paquetes", analysis.packageManager ?? "No determinable"],
      ["Herramientas de prueba", analysis.testTools.join(", ") || "No detectadas"],
      ["Herramientas de calidad", analysis.qualityTools.join(", ") || "No detectadas"],
    ],
  )

  const entrypoints = bulletList(analysis.entrypoints.map((entry) => code(entry)))
  const directories = markdownTable(
    ["Directorio", "Contenido"],
    analysis.directories.map((directory) => [code(directory.path), directory.description]),
  )
  const scripts = markdownTable(
    ["Script", "Comando"],
    Object.entries(analysis.scripts).map(([name, command]) => [code(name), code(command)]),
  )

  const testScripts = Object.entries(analysis.scripts)
    .filter(([name, command]) => /test|spec/i.test(`${name} ${command}`))
    .map(([name, command]) => `${code(name)} → ${code(command)}`)

  const qualityRules = analysis.qualityTools.map(
    (tool) => `Ejecuta ${tool} antes de dar por finalizado un cambio.`,
  )
  const packageManagerRule = analysis.packageManager
    ? `Usa ${code(analysis.packageManager)} para instalar dependencias y ejecutar scripts.`
    : null
  const languageRule = analysis.languages.includes("TypeScript")
    ? "El proyecto usa TypeScript: mantén el tipado y evita conversiones inseguras."
    : null

  return joinSections([
    "# AGENTS.md",
    "> Generado por `opencode-project-init` a partir de los archivos del proyecto. " +
      "Solo se afirma lo que el análisis pudo verificar.",
    "## Proyecto\n" +
      (bulletList([
        `**Nombre:** ${code(analysis.name)}`,
        `**Finalidad:** ${analysis.description ?? "No declarada en `package.json`; dedúcela del código y la documentación existente."}`,
        `**Tipo:** ${analysis.kinds.join(", ")}`,
      ]) ?? ""),
    "## Tecnologías\n" + (facts ?? "No se detectaron tecnologías declaradas."),
    "## Arquitectura\n" +
      joinSections([
        entrypoints ? `**Puntos de entrada:**\n\n${entrypoints}` : null,
        directories ? `**Directorios principales:**\n\n${directories}` : null,
        !entrypoints && !directories
          ? "No se detectaron puntos de entrada ni directorios reconocibles."
          : null,
      ]),
    "## Compilación y ejecución\n" +
      (scripts
        ? scripts
        : "No hay scripts declarados en `package.json`. Documenta aquí los comandos reales cuando existan."),
    "## Pruebas\n" +
      joinSections([
        analysis.testTools.length > 0
          ? `Herramientas detectadas: ${inlineList(analysis.testTools)}.`
          : "No se detectaron herramientas de prueba en las dependencias ni en los scripts.",
        testScripts.length > 0 ? bulletList(testScripts) : null,
      ]),
    "## Convenciones\n" +
      (bulletList(
        [
          packageManagerRule,
          languageRule,
          ...qualityRules,
          "Mantén los cambios pequeños, enfocados y alineados con la estructura existente.",
          "Documenta solo comportamientos verificados; no inventes APIs ni resultados.",
          "Sigue los patrones de nombres y organización ya presentes en el código.",
        ].filter((rule): rule is string => rule !== null),
      ) ?? ""),
    "## Reglas\n" +
      (bulletList([
        "No modifiques `node_modules`, `dist`, `build` ni `coverage`; son artefactos.",
        "No sobrescribas documentación del usuario sin autorización explícita.",
        "No añadas dependencias sin justificar su necesidad, licencia y mantenimiento.",
        "Ejecuta la compilación y las pruebas antes de declarar terminado un cambio.",
        "No dejes marcadores pendientes ni secciones vacías en la documentación.",
      ]) ?? ""),
    "## Errores y diagnóstico\n" +
      (bulletList([
        "Propaga los errores con contexto suficiente; no los silencies.",
        "Valida las entradas en los límites del sistema y falla de forma explícita.",
        "Reproduce el fallo con una prueba antes de corregirlo.",
      ]) ?? ""),
    "## Seguridad\n" +
      (bulletList([
        "No expongas credenciales, tokens, claves ni datos personales en código, logs o documentación.",
        "Valida y sanea cualquier dato que provenga del exterior.",
        "Revisa las dependencias nuevas antes de incorporarlas.",
        "Aplica el principio de mínimo privilegio en herramientas y automatizaciones.",
      ]) ?? ""),
    "## Criterios de calidad\n" +
      (bulletList([
        "La compilación o el typecheck terminan sin errores.",
        "Las pruebas existentes pasan y las nuevas cubren el cambio.",
        "No hay secretos ni rutas locales en los archivos versionados.",
        "La documentación refleja el estado real del proyecto.",
      ]) ?? ""),
  ])
}

function renderArchitecture(analysis: ProjectAnalysis): string {
  const summary = markdownTable(
    ["Aspecto", "Valor"],
    [
      ["Nombre", code(analysis.name)],
      ["Finalidad", analysis.description ?? "No declarada en `package.json`."],
      ["Tipo", analysis.kinds.join(", ")],
      ["Lenguajes", analysis.languages.join(", ") || "No detectados"],
      ["Frameworks", analysis.frameworks.join(", ") || "No detectados"],
      ["Gestor de paquetes", analysis.packageManager ?? "No determinable"],
    ],
  )

  const entrypoints = bulletList(analysis.entrypoints.map((entry) => code(entry)))
  const directories = markdownTable(
    ["Directorio", "Contenido"],
    analysis.directories.map((directory) => [code(directory.path), directory.description]),
  )
  const runtimeDependencies = dependencyList(analysis.runtimeDependencies)

  return joinSections([
    "# Arquitectura",
    summary ?? "No se detectaron datos suficientes para describir la arquitectura.",
    "## Puntos de entrada\n" +
      (entrypoints ?? "No se detectaron puntos de entrada declarados ni convencionales."),
    "## Organización de directorios\n" +
      (directories ?? "No se detectaron directorios de primer nivel reconocibles."),
    "## Dependencias de ejecución\n" +
      (runtimeDependencies ??
        "No hay dependencias de ejecución declaradas en `package.json`."),
    renderWarnings(analysis),
    "## Mantenimiento\n" +
      "Actualiza este documento cuando cambien los puntos de entrada, los módulos o las dependencias. " +
      "El contenido se generó a partir de los archivos detectados por `opencode-project-init`.",
  ])
}

function renderDevelopment(analysis: ProjectAnalysis): string {
  const installCommand = installCommandFor(analysis.packageManager)
  const scripts = markdownTable(
    ["Script", "Comando"],
    Object.entries(analysis.scripts).map(([name, command]) => [code(name), code(command)]),
  )
  const runtimeDependencies = dependencyList(analysis.runtimeDependencies)

  return joinSections([
    "# Desarrollo",
    "## Requisitos\n" +
      (bulletList([
        `**Gestor de paquetes:** ${analysis.packageManager ? code(analysis.packageManager) : "no determinable a partir de los archivos presentes"}`,
        `**Lenguajes:** ${analysis.languages.join(", ") || "no detectados"}`,
        analysis.frameworks.length > 0 ? `**Frameworks:** ${analysis.frameworks.join(", ")}` : null,
      ].filter((item): item is string => item !== null)) ?? ""),
    "## Instalación\n" +
      (installCommand
        ? `\`\`\`bash\n${installCommand}\n\`\`\``
        : "No se pudo determinar el gestor de paquetes. Usa el que corresponda al proyecto " +
          "(`npm install`, `pnpm install`, `yarn install` o `bun install`)."),
    "## Scripts disponibles\n" +
      (scripts ??
        "No hay scripts declarados en `package.json`. Añade scripts reproducibles para compilar, probar y validar."),
    "## Flujo de trabajo\n" +
      (bulletList([
        "Instala las dependencias antes de ejecutar cualquier comprobación.",
        "Ejecuta compilación o typecheck y las pruebas tras cada cambio relevante.",
        "Mantén los cambios pequeños y separa refactorizaciones de funcionalidad.",
        "Actualiza la documentación cuando cambie el comportamiento o la configuración.",
      ]) ?? ""),
    "## Dependencias de ejecución\n" +
      (runtimeDependencies ?? "No hay dependencias de ejecución declaradas."),
  ])
}

function renderTesting(analysis: ProjectAnalysis): string {
  const testScripts = markdownTable(
    ["Script", "Comando"],
    Object.entries(analysis.scripts)
      .filter(([name, command]) => /test|spec/i.test(`${name} ${command}`))
      .map(([name, command]) => [code(name), code(command)]),
  )
  const testDirectories = analysis.directories.filter((directory) =>
    /^(tests?|__tests__|spec|e2e|fixtures)$/i.test(directory.path),
  )
  const structure = markdownTable(
    ["Directorio", "Contenido"],
    testDirectories.map((directory) => [code(directory.path), directory.description]),
  )

  return joinSections([
    "# Pruebas",
    "## Herramientas detectadas\n" +
      (analysis.testTools.length > 0
        ? bulletList(analysis.testTools) ?? ""
        : "No se detectaron herramientas de prueba en las dependencias, scripts ni archivos marcador."),
    "## Comandos\n" +
      (testScripts ?? "No se detectaron scripts de prueba declarados."),
    "## Estructura de pruebas\n" +
      (structure ?? "No se detectaron directorios de pruebas reconocibles."),
    "## Criterios\n" +
      (bulletList([
        "Las pruebas deben ser deterministas y no depender de servicios externos sin control.",
        "Cada prueba debe cubrir un comportamiento observable, no detalles internos.",
        "Reproduce el fallo con una prueba antes de corregirlo.",
        "Actualiza o elimina pruebas obsoletas junto con el código que cambian.",
      ]) ?? ""),
  ])
}

function renderSecurity(analysis: ProjectAnalysis): string {
  const entrypoints = bulletList(analysis.entrypoints.map((entry) => code(entry)))
  const runtimeDependencies = dependencyList(analysis.runtimeDependencies)

  return joinSections([
    "# Seguridad",
    "## Superficie expuesta\n" +
      (entrypoints
        ? `Puntos de entrada detectados:\n\n${entrypoints}`
        : "No se detectaron puntos de entrada; revisa manualmente la superficie real."),
    "## Prácticas obligatorias\n" +
      (bulletList([
        "No incluyas secretos, credenciales ni claves en el repositorio.",
        "Valida y sanea toda entrada externa antes de usarla.",
        "Aplica mínimo privilegio a procesos, herramientas y automatizaciones.",
        "Revisa dependencias nuevas por licencia, mantenimiento y vulnerabilidades conocidas.",
        "No registres datos personales ni tokens en logs.",
      ]) ?? ""),
    "## Dependencias de ejecución a revisar\n" +
      (runtimeDependencies ?? "No hay dependencias de ejecución declaradas."),
    renderWarnings(analysis),
  ])
}

function renderRules(analysis: ProjectAnalysis): string {
  const languageRules = analysis.languages.map(
    (language) => `Sigue las convenciones idiomáticas de ${language} ya presentes en el código.`,
  )
  const qualityRules = analysis.qualityTools.map(
    (tool) => `Ejecuta ${tool} y corrige los avisos antes de finalizar.`,
  )

  return joinSections([
    "# Reglas del proyecto",
    "> Documentación complementaria de convenciones y revisión. " +
      "No sustituye a `AGENTS.md` como fuente de instrucciones para agentes.",
    "## Código\n" +
      (bulletList([
        ...languageRules,
        ...qualityRules,
        "Mantén los cambios pequeños, enfocados y revisables.",
        "No dupliques lógica: extrae utilidades cuando el patrón se repita.",
        "No añadas abstracciones ni dependencias sin necesidad demostrable.",
      ]) ?? ""),
    "## Documentación\n" +
      (bulletList([
        "Mantén `AGENTS.md` y `docs/` sincronizados con el código.",
        "Documenta decisiones y limitaciones, no lo obvio.",
        "No dejes secciones vacías ni marcadores pendientes.",
      ]) ?? ""),
    "## Revisión\n" +
      (bulletList([
        "Comprueba que la compilación y las pruebas pasan antes de solicitar revisión.",
        "Revisa el diff completo y evita cambios ajenos a la tarea.",
        "Verifica que no se introducen secretos ni archivos generados.",
      ]) ?? ""),
    "## Prohibiciones\n" +
      (bulletList([
        "No sobrescribir archivos del usuario sin autorización.",
        "No modificar artefactos generados ni dependencias instaladas.",
        "No desactivar pruebas o validaciones para conseguir que el build pase.",
      ]) ?? ""),
    "## Lista de verificación\n" +
      (bulletList([
        "Compilación o typecheck sin errores.",
        "Pruebas en verde.",
        "Sin secretos ni rutas locales versionadas.",
        "Documentación actualizada.",
      ]) ?? ""),
  ])
}

function renderArchitectAgent(analysis: ProjectAnalysis): string {
  const entrypoints = bulletList(analysis.entrypoints.map((entry) => code(entry)))
  const directories = markdownTable(
    ["Directorio", "Contenido"],
    analysis.directories.map((directory) => [code(directory.path), directory.description]),
  )
  const technologyFocus =
    analysis.languages.length > 0
      ? `Ten en cuenta las convenciones ya presentes de ${analysis.languages.join(", ")}.`
      : null

  return [
    "---",
    `description: ${yamlString(`Diseña cambios y evalúa la arquitectura de ${analysis.name}`)}`,
    "mode: subagent",
    "steps: 12",
    "permissions:",
    "  - action: edit",
    '    resource: "*"',
    "    effect: ask",
    "  - action: shell",
    '    resource: "*"',
    "    effect: ask",
    "---",
    "",
    joinSections([
      `# Arquitecto de ${analysis.name}`,
      "> Lee `AGENTS.md` antes de actuar: contiene las convenciones generales del " +
        "proyecto y no se repiten aquí.",
      "## Responsabilidad\n" +
        (bulletList([
          "Diseñar cambios pequeños y coherentes con la arquitectura existente.",
          "Identificar los módulos, contratos y datos afectados antes de proponer código.",
          "Evaluar alternativas y explicar el compromiso de cada una.",
          "Detectar riesgos estructurales, de acoplamiento y de compatibilidad.",
        ]) ?? ""),
      (joinSections([
        entrypoints ? `**Puntos de entrada:**\n\n${entrypoints}` : null,
        directories ? `**Directorios principales:**\n\n${directories}` : null,
      ])
        ? "## Contexto verificado\n" +
          joinSections([
            entrypoints ? `**Puntos de entrada:**\n\n${entrypoints}` : null,
            directories ? `**Directorios principales:**\n\n${directories}` : null,
          ])
        : ""),
      "## Procedimiento\n" +
        (bulletList([
          "Inspecciona el código real implicado antes de diseñar.",
          "Describe el cambio como pasos verificables y limita el alcance.",
          "Señala qué pruebas y comprobaciones validan el diseño.",
          technologyFocus,
          "Pide autorización antes de aplicar cambios estructurales.",
          "Actualiza `AGENTS.md` o `docs/` solo si el cambio altera lo documentado.",
        ].filter((item): item is string => item !== null)) ?? ""),
      "## Límites\n" +
        (bulletList([
          "No inventes APIs, módulos ni comportamientos que no existan en el código.",
          "No introduzcas dependencias ni abstracciones sin justificar su necesidad.",
          "No modifiques archivos generados ni dependencias instaladas.",
          "No desactives pruebas o validaciones para hacer pasar el build.",
        ]) ?? ""),
      "## Salida esperada\n" +
        "Entrega un plan breve: objetivo, archivos afectados, decisiones, riesgos y " +
        "cómo verificarlo. Si aplicas cambios, indica exactamente qué modificaste.",
    ]),
    "",
  ].join("\n")
}

function renderReviewerAgent(analysis: ProjectAnalysis): string {
  const qualityTools = inlineList(analysis.qualityTools)
  const testCommands = testCommandList(analysis)

  return [
    "---",
    `description: ${yamlString(`Revisa cambios de ${analysis.name} sin modificar archivos`)}`,
    "mode: subagent",
    "steps: 8",
    "permissions:",
    "  - action: edit",
    '    resource: "*"',
    "    effect: deny",
    "  - action: shell",
    '    resource: "*"',
    "    effect: ask",
    "---",
    "",
    joinSections([
      `# Revisor de ${analysis.name}`,
      "> Lee `AGENTS.md` antes de actuar: contiene las convenciones generales del " +
        "proyecto y no se repiten aquí.",
      "## Responsabilidad\n" +
        (bulletList([
          "Revisar el diff o los archivos indicados y detectar defectos reales.",
          "Comprobar corrección, legibilidad, seguridad y consistencia con el proyecto.",
          "Verificar que las pruebas y validaciones existentes cubren el cambio.",
          "Informar con severidad y evidencia, sin reescribir el trabajo del autor.",
        ]) ?? ""),
      "## Comprobaciones disponibles\n" +
        joinSections([
          qualityTools ? `**Calidad:** ${qualityTools}.` : null,
          testCommands.length > 0
            ? `**Pruebas:**\n\n${bulletList(testCommands)}`
            : "**Pruebas:** no se detectaron scripts de prueba declarados.",
          "**Compilación:** usa el script de build o typecheck real del proyecto.",
        ]),
      "## Procedimiento\n" +
        (bulletList([
          "Lee `AGENTS.md` y el contexto del cambio antes de opinar.",
          "Ejecuta las comprobaciones disponibles sin modificar archivos.",
          "Clasifica cada hallazgo como bloqueante, importante o sugerencia.",
          "Cita archivo y línea, explica el impacto y propone una corrección concreta.",
          "No repitas elogios ni resúmenes largos: prioriza lo accionable.",
        ]) ?? ""),
      "## Límites\n" +
        (bulletList([
          "No edites archivos ni apliques parches; este agente es de solo lectura.",
          "No ejecutes comandos destructivos ni instales dependencias.",
          "No apruebes un cambio cuyas comprobaciones no hayas podido ejecutar.",
          "No inventes fallos: si no hay evidencia, no lo reportes como defecto.",
        ]) ?? ""),
    ]),
    "",
  ].join("\n")
}

function renderTesterAgent(analysis: ProjectAnalysis): string {
  const testTools = inlineList(analysis.testTools)
  const testCommands = testCommandList(analysis)
  const testDirectories = analysis.directories.filter((directory) =>
    /^(tests?|__tests__|spec|e2e|fixtures)$/i.test(directory.path),
  )
  const structure = markdownTable(
    ["Directorio", "Contenido"],
    testDirectories.map((directory) => [code(directory.path), directory.description]),
  )

  return [
    "---",
    `description: ${yamlString(`Escribe y ejecuta las pruebas de ${analysis.name}`)}`,
    "mode: subagent",
    "steps: 12",
    "permissions:",
    "  - action: edit",
    '    resource: "*"',
    "    effect: allow",
    "  - action: shell",
    '    resource: "*"',
    "    effect: ask",
    "---",
    "",
    joinSections([
      `# Tester de ${analysis.name}`,
      "> Lee `AGENTS.md` antes de actuar: contiene las convenciones generales del " +
        "proyecto y no se repiten aquí.",
      "## Responsabilidad\n" +
        (bulletList([
          "Escribir pruebas que cubran comportamiento observable del cambio.",
          "Ejecutar la suite existente y reportar fallos con evidencia.",
          "Reproducir cada defecto con una prueba antes de corregirlo.",
          "Mantener las pruebas deterministas e independientes de servicios externos.",
        ]) ?? ""),
      "## Contexto de pruebas\n" +
        joinSections([
          testTools ? `**Herramientas detectadas:** ${testTools}.` : "**Herramientas:** no detectadas en las dependencias ni en los scripts.",
          testCommands.length > 0
            ? `**Comandos:**\n\n${bulletList(testCommands)}`
            : "**Comandos:** no hay scripts de prueba declarados; usa el runner presente en las dependencias o documenta el comando real.",
          structure ? `**Estructura:**\n\n${structure}` : null,
        ]),
      "## Procedimiento\n" +
        (bulletList([
          "Localiza la suite y las convenciones de pruebas ya existentes.",
          "Escribe la prueba mínima que demuestre el comportamiento esperado.",
          "Ejecuta solo las pruebas relevantes durante el desarrollo y la suite completa antes de terminar.",
          "Si una prueba falla, distingue defecto del código, de la prueba o del entorno.",
          "Reporta el comando ejecutado y el resultado, sin ocultar fallos.",
        ]) ?? ""),
      "## Límites\n" +
        (bulletList([
          "No desactives, omitas ni relajes pruebas para conseguir verde.",
          "No modifiques código de producción salvo que la tarea lo pida explícitamente.",
          "No añadas dependencias de prueba sin justificarlas.",
          "No inventes resultados: si no puedes ejecutar la suite, dilo.",
        ]) ?? ""),
    ]),
    "",
  ].join("\n")
}

function renderAuditCommand(analysis: ProjectAnalysis): string {
  const qualityTools = inlineList(analysis.qualityTools)
  const buildCommands = buildCommandList(analysis)
  const qualityCommands = qualityCommandList(analysis)
  const testCommands = testCommandList(analysis)

  return [
    "---",
    `description: ${yamlString(`Audita la calidad, seguridad y pruebas de ${analysis.name}`)}`,
    "---",
    "",
    joinSections([
      `# Auditoría técnica de ${analysis.name}`,
      "Audita el proyecto de forma objetiva y basada en evidencia. " +
        "Alcance solicitado: `$ARGUMENTS` (si está vacío, revisa todo el proyecto).",
      "## Contexto verificado\n" +
        (bulletList([
          `**Proyecto:** ${code(analysis.name)}`,
          `**Tipo:** ${analysis.kinds.join(", ")}`,
          `**Lenguajes:** ${analysis.languages.join(", ") || "no detectados"}`,
          `**Gestor de paquetes:** ${analysis.packageManager ?? "no determinable"}`,
        ]) ?? ""),
      "## Comprobaciones disponibles\n" +
        joinSections([
          qualityCommands.length > 0
            ? `**Calidad:**\n\n${bulletList(qualityCommands)}`
            : qualityTools
              ? `**Calidad:** herramientas detectadas: ${qualityTools}, sin script asociado.`
              : "**Calidad:** no se detectaron herramientas ni scripts de calidad.",
          buildCommands.length > 0
            ? `**Compilación:**\n\n${bulletList(buildCommands)}`
            : "**Compilación:** no se detectaron scripts de build ni typecheck.",
          testCommands.length > 0
            ? `**Pruebas:**\n\n${bulletList(testCommands)}`
            : "**Pruebas:** no se detectaron scripts de prueba declarados.",
        ]),
      "## Procedimiento\n" +
        (bulletList([
          "Lee `AGENTS.md` y `docs/` para conocer las convenciones y la arquitectura reales.",
          "Delimita el alcance y localiza los archivos implicados antes de opinar.",
          "Ejecuta las comprobaciones disponibles y registra el comando y su resultado.",
          "Revisa seguridad: secretos, entradas externas, permisos y dependencias nuevas.",
          "Contrasta la documentación con el código: señala lo desactualizado o ausente.",
          "Clasifica cada hallazgo como bloqueante, importante o sugerencia.",
        ]) ?? ""),
      "## Formato de salida\n" +
        (bulletList([
          "Resumen breve del estado del proyecto y del alcance revisado.",
          "Hallazgos ordenados por severidad, con archivo y línea cuando aplique.",
          "Impacto real y corrección concreta propuesta para cada hallazgo.",
          "Comprobaciones ejecutadas y las que no pudiste ejecutar, con el motivo.",
          "No incluyas elogios ni texto de relleno.",
        ]) ?? ""),
      "## Límites\n" +
        (bulletList([
          "No modifiques archivos: esta auditoría es de solo lectura.",
          "No instales dependencias ni ejecutes comandos destructivos.",
          "No inventes fallos: sin evidencia verificable, no lo reportes como defecto.",
          "No marques como correcto lo que no hayas podido comprobar.",
        ]) ?? ""),
    ]),
    "",
  ].join("\n")
}

function renderReleaseCommand(analysis: ProjectAnalysis): string {
  const buildCommands = buildCommandList(analysis)
  const qualityCommands = qualityCommandList(analysis)
  const testCommands = testCommandList(analysis)
  const isPlugin = analysis.kinds.includes("opencode-plugin")
  const isLibrary = analysis.kinds.includes("library")

  return [
    "---",
    `description: ${yamlString(`Comprueba que ${analysis.name} está listo para publicarse`)}`,
    "---",
    "",
    joinSections([
      `# Preparación de publicación de ${analysis.name}`,
      "Comprueba que el proyecto puede publicarse o entregarse sin defectos conocidos. " +
        "Alcance solicitado: `$ARGUMENTS` (si está vacío, aplica la lista completa).",
      "## Contexto verificado\n" +
        (bulletList([
          `**Proyecto:** ${code(analysis.name)}`,
          `**Tipo:** ${analysis.kinds.join(", ")}`,
          `**Gestor de paquetes:** ${analysis.packageManager ?? "no determinable"}`,
          `**Finalidad declarada:** ${analysis.description ?? "no declarada en `package.json`"}`,
        ]) ?? ""),
      "## Comprobaciones obligatorias\n" +
        joinSections([
          buildCommands.length > 0
            ? `**Compilación:**\n\n${bulletList(buildCommands)}`
            : "**Compilación:** verifica manualmente el comando de build real del proyecto.",
          testCommands.length > 0
            ? `**Pruebas:**\n\n${bulletList(testCommands)}`
            : "**Pruebas:** no se detectaron scripts de prueba; indica esta carencia en el informe.",
          qualityCommands.length > 0
            ? `**Calidad:**\n\n${bulletList(qualityCommands)}`
            : "**Calidad:** no se detectaron scripts de lint o formato.",
        ]),
      "## Metadatos del paquete\n" +
        (bulletList([
          "`name`, `version`, `description` y `license` presentes y coherentes.",
          "`exports`, `main` o `module` apuntan a los artefactos reales generados.",
          "`files` incluye solo lo necesario para publicar (por ejemplo `dist`).",
          "Los scripts de build y test funcionan desde un clon limpio.",
        ]) ?? ""),
      isPlugin
        ? "## Compatibilidad con OpenCode\n" +
          (bulletList([
            "La versión de `@opencode/plugin` coincide con la del CLI objetivo.",
            "El paquete es ESM (`\"type\": \"module\"`) y exporta el servidor por `.`.",
            "El build genera `dist/` y está incluido en `files`.",
            "No se bundlea `effect`; debe resolverse contra el host.",
          ]) ?? "")
        : null,
      isLibrary
        ? "## Librería\n" +
          (bulletList([
            "La API pública está exportada y documentada.",
            "Los tipos se publican junto al código cuando el lenguaje lo requiere.",
            "No se exponen utilidades internas como API estable.",
          ]) ?? "")
        : null,
      "## Documentación\n" +
        (bulletList([
          "`README.md` describe qué hace, instalación, uso y limitaciones.",
          "`AGENTS.md` y `docs/` reflejan el estado real del proyecto.",
          "No quedan marcadores pendientes, secciones vacías ni afirmaciones sin verificar.",
        ]) ?? ""),
      "## Seguridad y repositorio\n" +
        (bulletList([
          "No hay secretos, tokens, claves ni rutas locales en archivos versionados.",
          "`.gitignore` excluye dependencias, artefactos y datos locales.",
          "Las dependencias nuevas están justificadas y sin vulnerabilidades conocidas.",
          "El árbol de trabajo está limpio y el diff revisado.",
        ]) ?? ""),
      "## Formato de salida\n" +
        (bulletList([
          "Estado: listo o bloqueado, con el motivo principal.",
          "Lista de comprobaciones ejecutadas y su resultado.",
          "Bloqueantes pendientes con archivo o comando concreto.",
          "Siguiente paso recomendado (por ejemplo, publicar o corregir).",
        ]) ?? ""),
      "## Límites\n" +
        (bulletList([
          "No publiques ni subas cambios sin autorización explícita.",
          "No inventes versiones, licencias, modelos ni datos de publicación.",
          "No marques como listo un proyecto cuyas pruebas no hayan pasado.",
        ]) ?? ""),
    ]),
    "",
  ].join("\n")
}

function renderProjectQualitySkill(analysis: ProjectAnalysis): string {
  const buildCommands = buildCommandList(analysis)
  const qualityCommands = qualityCommandList(analysis)
  const testCommands = testCommandList(analysis)

  return [
    "---",
    "name: Project Quality",
    `description: ${yamlString(`Revisión técnica, calidad, seguridad y preparación para publicar ${analysis.name}`)}`,
    "metadata:",
    "  opencode/autoinvoke: true",
    "---",
    "",
    joinSections([
      "# Project Quality",
      "> Procedimientos para revisar cambios, auditar calidad y seguridad y preparar " +
        `una publicación de ${code(analysis.name)}. No repite las convenciones de \`AGENTS.md\`: ` +
        "léelo antes de aplicar esta skill.",
      "## Cuándo usarla\n" +
        (bulletList([
          "Antes de dar por terminado un cambio relevante.",
          "Al revisar un diff, una auditoría o un informe de pruebas.",
          "Antes de publicar una versión o abrir una solicitud de cambios.",
        ]) ?? ""),
      "## Contexto verificado\n" +
        (bulletList([
          `**Lenguajes:** ${analysis.languages.join(", ") || "no detectados"}`,
          `**Gestor de paquetes:** ${analysis.packageManager ?? "no determinable"}`,
          `**Herramientas de calidad:** ${inlineList(analysis.qualityTools) ?? "no detectadas"}`,
          `**Herramientas de prueba:** ${inlineList(analysis.testTools) ?? "no detectadas"}`,
        ]) ?? ""),
      "## Procedimiento de revisión\n" +
        (bulletList([
          "Delimita el cambio y lee los archivos reales implicados.",
          "Comprueba que el código respeta la arquitectura y los patrones existentes.",
          "Verifica que el cambio cubre un comportamiento observable y tiene pruebas.",
          "Ejecuta compilación, pruebas y calidad; registra comando y resultado.",
          "Revisa errores, casos límite y compatibilidad con lo ya existente.",
        ]) ?? ""),
      "## Comprobaciones\n" +
        joinSections([
          buildCommands.length > 0
            ? `**Compilación:**\n\n${bulletList(buildCommands)}`
            : "**Compilación:** no se detectaron scripts de build ni typecheck.",
          testCommands.length > 0
            ? `**Pruebas:**\n\n${bulletList(testCommands)}`
            : "**Pruebas:** no se detectaron scripts de prueba declarados.",
          qualityCommands.length > 0
            ? `**Calidad:**\n\n${bulletList(qualityCommands)}`
            : "**Calidad:** no se detectaron scripts de lint, formato o comprobación.",
        ]),
      "## Seguridad\n" +
        (bulletList([
          "Busca secretos, credenciales, tokens y datos personales en el diff.",
          "Verifica validación y saneamiento de toda entrada externa.",
          "Comprueba permisos y mínimo privilegio en herramientas y automatizaciones.",
          "Revisa dependencias nuevas por mantenimiento, licencia y vulnerabilidades.",
        ]) ?? ""),
      "## Preparación para publicación\n" +
        (bulletList([
          "Metadatos del paquete completos y artefactos publicables incluidos.",
          "README y documentación actualizados con el comportamiento real.",
          "Sin artefactos, dependencias ni datos locales versionados.",
          "Árbol de trabajo limpio y diff revisado.",
        ]) ?? ""),
      "## Criterios de aceptación\n" +
        (bulletList([
          "Compilación o typecheck sin errores.",
          "Todas las pruebas pasan.",
          "Sin hallazgos bloqueantes de seguridad o calidad.",
          "Documentación coherente con el cambio.",
        ]) ?? ""),
      "## Límites\n" +
        (bulletList([
          "No apruebes lo que no hayas podido comprobar.",
          "No desactives pruebas o validaciones para conseguir verde.",
          "No publiques ni modifiques archivos sin autorización.",
          "No inventes resultados ni versiones.",
        ]) ?? ""),
    ]),
    "",
  ].join("\n")
}

/** Escapa un valor como string YAML entre comillas dobles. */
function yamlString(value: string): string {
  return JSON.stringify(value)
}

function buildCommandList(analysis: ProjectAnalysis): string[] {
  return Object.entries(analysis.scripts)
    .filter(([name, command]) => /build|compile|typecheck|tsc/i.test(`${name} ${command}`))
    .map(([name, command]) => `${code(name)} → ${code(command)}`)
}

function qualityCommandList(analysis: ProjectAnalysis): string[] {
  return Object.entries(analysis.scripts)
    .filter(([name, command]) => /lint|format|biome|eslint|prettier/i.test(`${name} ${command}`))
    .map(([name, command]) => `${code(name)} → ${code(command)}`)
}

/** Scripts de prueba detectados en `package.json`, formateados para Markdown. */
function testCommandList(analysis: ProjectAnalysis): string[] {
  return Object.entries(analysis.scripts)
    .filter(([name, command]) => /test|spec/i.test(`${name} ${command}`))
    .map(([name, command]) => `${code(name)} → ${code(command)}`)
}

function renderWarnings(analysis: ProjectAnalysis): string | null {
  if (analysis.warnings.length === 0) return null
  return "## Observaciones del análisis\n" + bulletList(analysis.warnings)
}

function installCommandFor(packageManager: string | null): string | null {
  switch (packageManager) {
    case "bun":
      return "bun install"
    case "pnpm":
      return "pnpm install"
    case "yarn":
      return "yarn install"
    case "npm":
      return "npm install"
    case "uv":
      return "uv sync"
    case "poetry":
      return "poetry install"
    case "pipenv":
      return "pipenv install"
    case "cargo":
      return "cargo build"
    case "go modules":
      return "go mod download"
    default:
      return null
  }
}

function dependencyList(items: readonly string[]): string | null {
  if (items.length === 0) return null
  const sorted = [...items].sort((a, b) => a.localeCompare(b))
  const shown = sorted.slice(0, 40)
  const lines = shown.map((dependency) => `- ${code(dependency)}`)
  if (sorted.length > shown.length) {
    lines.push(`- … y ${sorted.length - shown.length} dependencias más`)
  }
  return lines.join("\n")
}

async function isFile(target: string): Promise<boolean> {
  const info = await stat(target).catch(() => null)
  return info?.isFile() ?? false
}
