import type {
  FileResult,
  PlannedFile,
  ProjectAnalysis,
  ProjectInitReport,
  ValidationIssue,
} from "./types.js"

/**
 * Construye el informe final a partir del análisis, los resultados de escritura
 * y las validaciones. `ok` es falso si hubo errores de validación o fallos de
 * escritura; los archivos omitidos no invalidan el resultado.
 */
export function buildReport(
  analysis: ProjectAnalysis,
  files: readonly FileResult[],
  validations: readonly ValidationIssue[],
): ProjectInitReport {
  const hasErrors = validations.some((issue) => issue.level === "error")
  const hasFailures = files.some((file) => file.action === "failed")
  return {
    root: analysis.root,
    analysis,
    files,
    validations,
    ok: !hasErrors && !hasFailures,
  }
}

/**
 * Formatea el análisis y la propuesta de archivos para el usuario, antes de
 * escribir nada. Los archivos existentes se marcan como pendientes de
 * autorización.
 */
export function formatPlan(
  analysis: ProjectAnalysis,
  files: readonly PlannedFile[],
): string {
  const existing = files.filter((file) => file.exists)
  const pending = files.filter((file) => !file.exists)

  const lines: string[] = [
    `# Análisis de ${analysis.name}`,
    "",
    "## Proyecto detectado",
    "",
    table(
      ["Aspecto", "Valor"],
      [
        ["Nombre", analysis.name],
        ["Finalidad", analysis.description ?? "No declarada en `package.json`."],
        ["Tipo", analysis.kinds.join(", ") || "no determinado"],
        ["Lenguajes", analysis.languages.join(", ") || "no detectados"],
        ["Frameworks", analysis.frameworks.join(", ") || "no detectados"],
        ["Gestor de paquetes", analysis.packageManager ?? "no determinable"],
        ["Pruebas", analysis.testTools.join(", ") || "no detectadas"],
        ["Calidad", analysis.qualityTools.join(", ") || "no detectadas"],
      ],
    ),
    "",
    "## Archivos propuestos",
    "",
    `Nuevos: **${pending.length}**. Existentes: **${existing.length}**.`,
    "",
  ]

  if (pending.length > 0) {
    lines.push("### Se crearán", "")
    lines.push(...pending.map((file) => `- \`${file.path}\` — ${file.description}`), "")
  }

  if (existing.length > 0) {
    lines.push("### Ya existen (requieren autorización)", "")
    lines.push(
      ...existing.map(
        (file) => `- \`${file.path}\` — ${file.description}. Se actualizará solo si lo autorizas.`,
      ),
      "",
    )
  }

  if (analysis.warnings.length > 0) {
    lines.push("## Observaciones del análisis", "")
    lines.push(...analysis.warnings.map((warning) => `- ${warning}`), "")
  }

  lines.push(
    "## Siguiente paso",
    "",
    "No se ha escrito ningún archivo. Confirma la generación para crearlos. " +
      "Los archivos existentes solo se actualizarán si los autorizas; antes de " +
      "modificarlos se creará una copia de seguridad `.bak-YYYYMMDD-HHmmss`.",
  )

  return lines.join("\n")
}

/**
 * Formatea el informe final: archivos creados/actualizados/omitidos/fallidos,
 * copias de seguridad, validaciones y resumen del análisis.
 */
export function formatReport(report: ProjectInitReport): string {
  const created = report.files.filter((file) => file.action === "created")
  const updated = report.files.filter((file) => file.action === "updated")
  const skipped = report.files.filter((file) => file.action === "skipped")
  const failed = report.files.filter((file) => file.action === "failed")
  const errors = report.validations.filter((issue) => issue.level === "error")
  const warnings = report.validations.filter((issue) => issue.level === "warning")

  const lines: string[] = [
    "# Informe de project-init",
    "",
    `Raíz del proyecto: \`${report.root}\``,
    "",
    "## Resumen del análisis",
    "",
    table(
      ["Aspecto", "Valor"],
      [
        ["Nombre", report.analysis.name],
        ["Finalidad", report.analysis.description ?? "No declarada en `package.json`."],
        ["Tipo", report.analysis.kinds.join(", ") || "no determinado"],
        ["Lenguajes", report.analysis.languages.join(", ") || "no detectados"],
        ["Frameworks", report.analysis.frameworks.join(", ") || "no detectados"],
        ["Gestor de paquetes", report.analysis.packageManager ?? "no determinable"],
      ],
    ),
    "",
    "## Archivos",
    "",
    `Creados: **${created.length}**. Actualizados: **${updated.length}**. ` +
      `Omitidos: **${skipped.length}**. Fallidos: **${failed.length}**.`,
    "",
  ]

  appendFileSection(lines, "Creados", created)
  appendFileSection(lines, "Actualizados", updated, (file) =>
    file.backup ? `Copia de seguridad: \`${file.backup}\`.` : null,
  )
  appendFileSection(
    lines,
    "Omitidos",
    skipped,
    () => "No se modificó porque no estaba autorizado o no requería cambios.",
  )
  appendFileSection(lines, "Fallidos", failed, (file) => file.error ?? null)

  lines.push("## Validaciones", "")
  if (report.validations.length === 0) {
    lines.push("Sin incidencias: todos los archivos generados son válidos.", "")
  } else {
    if (errors.length > 0) {
      lines.push("### Errores", "")
      lines.push(...errors.map((issue) => formatIssue(issue)), "")
    }
    if (warnings.length > 0) {
      lines.push("### Avisos", "")
      lines.push(...warnings.map((issue) => formatIssue(issue)), "")
    }
  }

  if (report.analysis.warnings.length > 0) {
    lines.push("## Observaciones del análisis", "")
    lines.push(...report.analysis.warnings.map((warning) => `- ${warning}`), "")
  }

  lines.push(
    "## Resultado",
    "",
    report.ok
      ? `Correcto: ${errors.length} errores, ${warnings.length} avisos.`
      : `Con incidencias: ${errors.length} errores, ${warnings.length} avisos. ` +
          "Revisa los archivos fallidos y las validaciones antes de continuar.",
  )

  return lines.join("\n")
}

function appendFileSection(
  lines: string[],
  title: string,
  files: readonly FileResult[],
  detail?: (file: FileResult) => string | null,
): void {
  if (files.length === 0) return
  lines.push(`### ${title}`, "")
  for (const file of files) {
    const extra = detail?.(file)
    lines.push(`- \`${file.path}\`${extra ? ` — ${extra}` : ""}`)
  }
  lines.push("")
}

function formatIssue(issue: ValidationIssue): string {
  return `- \`${issue.file}\`: ${issue.message}`
}

/** Tabla Markdown de dos columnas con celdas escapadas. */
function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const escape = (value: string): string =>
    value.replaceAll("|", "\\|").replace(/\r?\n/g, " ")
  return [
    `| ${headers.map(escape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n")
}
