/**
 * Utilidades JSONC compartidas por `file-manager` (fusión de configuración) y
 * `validators` (comprobación del resultado). No dependen del filesystem.
 */

/** Parsea JSONC (comentarios y comas finales). Devuelve `undefined` si no es válido. */
export function parseJsonc(text: string): unknown {
  try {
    const withoutBom = text.replace(/^\uFEFF/, "")
    return JSON.parse(stripJsonComments(withoutBom).replace(/,\s*([}\]])/g, "$1"))
  } catch {
    return undefined
  }
}

/** Elimina comentarios de línea y bloque respetando las cadenas JSON. */
export function stripJsonComments(text: string): string {
  let result = ""
  let inString = false
  let inLineComment = false
  let inBlockComment = false
  let escaped = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false
        result += char
      }
      continue
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false
        index += 1
      }
      continue
    }

    if (inString) {
      result += char
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      result += char
      continue
    }
    if (char === "/" && next === "/") {
      inLineComment = true
      index += 1
      continue
    }
    if (char === "/" && next === "*") {
      inBlockComment = true
      index += 1
      continue
    }
    result += char
  }

  return result
}

/** Indica si un valor es un objeto JSON simple (no array ni null). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
