/**
 * Utilidades de plantillas basadas en marcadores `{{clave}}`.
 * No deja marcadores sin resolver: si falta un valor, se conserva la clave
 * entre llaves para que `validators` pueda detectarlo.
 */
export function renderTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key: string) => {
    const value = values[key]
    return value === undefined ? match : value
  })
}

/** Une secciones no vacías con una línea en blanco entre ellas. */
export function joinSections(sections: readonly (string | null | undefined)[]): string {
  return sections
    .map((section) => (section ?? "").trim())
    .filter((section) => section.length > 0)
    .join("\n\n")
}

/** Lista en Markdown a partir de valores, o `null` si está vacía. */
export function bulletList(items: readonly string[]): string | null {
  if (items.length === 0) return null
  return items.map((item) => `- ${item}`).join("\n")
}

/** Código inline seguro para Markdown. */
export function code(value: string): string {
  return "`" + value.replaceAll("`", "'") + "`"
}

/** Lista inline (`a`, `b`, `c`) o `null` si está vacía. */
export function inlineList(items: readonly string[]): string | null {
  if (items.length === 0) return null
  return items.map((item) => code(item)).join(", ")
}

/**
 * Tabla Markdown de dos columnas como máximo; devuelve `null` sin filas.
 * Las celdas se escapan para no romper la tabla.
 */
export function markdownTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string | null {
  if (rows.length === 0) return null
  const escape = (value: string): string => value.replaceAll("|", "\\|").replace(/\r?\n/g, " ")
  const header = `| ${headers.map(escape).join(" | ")} |`
  const separator = `| ${headers.map(() => "---").join(" | ")} |`
  const body = rows.map((row) => `| ${row.map(escape).join(" | ")} |`)
  return [header, separator, ...body].join("\n")
}

/**
 * Inserta `$schema` en un JSON/JSONC sin re-serializar el resto del contenido.
 * Devuelve `null` si ya existe o si no se encuentra el objeto de apertura.
 */
export function insertJsonSchema(text: string, schemaUrl: string): string | null {
  if (/"\$schema"\s*:/.test(text)) return null
  const open = text.indexOf("{")
  if (open === -1) return null
  return `${text.slice(0, open + 1)}\n  "$schema": ${JSON.stringify(schemaUrl)},${text.slice(open + 1)}`
}
