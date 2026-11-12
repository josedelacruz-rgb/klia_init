import path from "node:path"
import { isPlainObject, parseJsonc } from "./jsonc.js"
import type { PlannedFile, ValidationIssue } from "./types.js"

/** Claves admitidas en el frontmatter de cada tipo de archivo (OpenCode 2.2.5). */
const AGENT_KEYS = new Set([
  "description",
  "mode",
  "model",
  "permissions",
  "steps",
  "hidden",
  "color",
  "disabled",
  "request",
])
const AGENT_V1_KEYS = new Set(["permission", "tools", "temperature", "prompt", "disable", "maxSteps"])
const COMMAND_KEYS = new Set(["description", "agent", "model", "subagent", "subtask"])
const SKILL_KEYS = new Set(["name", "description", "metadata", "disable-model-invocation"])

/** Marcadores que indican contenido sin rellenar. */
const UNRESOLVED_PLACEHOLDER = /\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/
const PENDING_MARKERS: readonly { readonly pattern: RegExp; readonly label: string }[] = [
  { pattern: /\bTODO\b/, label: "TODO" },
  { pattern: /\bFIXME\b/, label: "FIXME" },
  { pattern: /\bTBD\b/, label: "TBD" },
]

type MarkdownKind = "plain" | "agent" | "command" | "skill"

/**
 * Valida el frontmatter de los archivos generados de OpenCode
 * (`.opencode/agents/*.md`, `.opencode/commands/*.md`, `.opencode/skills/**\/SKILL.md`).
 * Las reglas reflejan el esquema verificado de OpenCode 2.2.5: no usa YAML
 * completo, solo detecta los errores que el generador puede producir.
 */
export function validateFrontmatter(files: readonly PlannedFile[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  for (const file of files) {
    const kind = frontmatterKind(file.path)
    if (!kind) continue

    const parsed = parseFrontmatter(file.content)
    if (parsed.kind === "missing") {
      issues.push({ file: file.path, level: "error", message: "Falta el bloque de frontmatter." })
      continue
    }
    if (parsed.kind === "unclosed") {
      issues.push({ file: file.path, level: "error", message: "Frontmatter sin cerrar con `---`." })
      continue
    }

    const keys = Object.keys(parsed.values)
    if (kind === "agent") validateAgent(file.path, parsed, issues)
    if (kind === "command") validateKeys(file.path, keys, COMMAND_KEYS, issues)
    if (kind === "skill") validateSkill(file.path, parsed, issues)
  }

  return issues
}

type FrontmatterKind = "agent" | "command" | "skill"

function frontmatterKind(relativePath: string): FrontmatterKind | null {
  const normalized = relativePath.replaceAll("\\", "/")
  if (/^\.opencode\/agents\/[^/]+\.md$/.test(normalized)) return "agent"
  if (/^\.opencode\/commands\/[^/]+\.md$/.test(normalized)) return "command"
  if (/^\.opencode\/skills\/.+\/SKILL\.md$/i.test(normalized)) return "skill"
  return null
}

interface ParsedFrontmatter {
  readonly kind: "ok" | "missing" | "unclosed"
  /** Claves de primer nivel y su valor en texto (sin arrays ni objetos). */
  readonly values: Readonly<Record<string, string>>
  /** Líneas del bloque, sin los delimitadores. */
  readonly lines: readonly string[]
}

function parseFrontmatter(content: string): ParsedFrontmatter {
  const normalized = content.replaceAll("\r\n", "\n")
  const lines = normalized.split("\n")
  if (lines[0]?.trim() !== "---") {
    return { kind: "missing", values: {}, lines: [] }
  }

  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---")
  if (end === -1) {
    return { kind: "unclosed", values: {}, lines: [] }
  }

  const block = lines.slice(1, end)
  const values: Record<string, string> = {}
  for (const line of block) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (match && match[1] !== undefined) values[match[1]] = (match[2] ?? "").trim()
  }
  return { kind: "ok", values, lines: block }
}

function validateAgent(
  file: string,
  parsed: ParsedFrontmatter,
  issues: ValidationIssue[],
): void {
  validateKeys(file, Object.keys(parsed.values), AGENT_KEYS, issues)

  for (const key of Object.keys(parsed.values)) {
    if (AGENT_V1_KEYS.has(key)) {
      issues.push({
        file,
        level: "error",
        message: `Campo V1 no válido en OpenCode 2.x: \`${key}\`.`,
      })
    }
  }

  if (!parsed.values.description) {
    issues.push({ file, level: "error", message: "Falta `description` en el agente." })
  }
  const mode = parsed.values.mode
  if (!mode) {
    issues.push({ file, level: "error", message: "Falta `mode` en el agente." })
  } else if (!["primary", "subagent", "all"].includes(mode)) {
    issues.push({
      file,
      level: "error",
      message: `\`mode\` debe ser primary, subagent o all; recibido \`${mode}\`.`,
    })
  }

  if (parsed.values.steps !== undefined && !/^[1-9]\d*$/.test(parsed.values.steps)) {
    issues.push({ file, level: "error", message: "`steps` debe ser un entero mayor que 0." })
  }
  if (parsed.values.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(parsed.values.color)) {
    issues.push({ file, level: "error", message: "`color` debe tener el formato #RRGGBB." })
  }

  if (parsed.values.permissions !== undefined || hasTopLevelKey(parsed.lines, "permissions")) {
    validatePermissions(file, parsed.lines, issues)
  }
}

function validatePermissions(
  file: string,
  lines: readonly string[],
  issues: ValidationIssue[],
): void {
  let inPermissions = false
  let entries = 0
  let current: { action: boolean; resource: boolean; effect: string | null } | null = null

  const closeEntry = (): void => {
    if (!current) return
    entries += 1
    if (!current.action) {
      issues.push({ file, level: "error", message: "Regla de permiso sin `action`." })
    }
    if (!current.resource) {
      issues.push({ file, level: "error", message: "Regla de permiso sin `resource`." })
    }
    if (!current.effect) {
      issues.push({ file, level: "error", message: "Regla de permiso sin `effect`." })
    } else if (!["allow", "ask", "deny"].includes(current.effect)) {
      issues.push({
        file,
        level: "error",
        message: `\`effect\` debe ser allow, ask o deny; recibido \`${current.effect}\`.`,
      })
    }
    current = null
  }

  for (const line of lines) {
    if (/^permissions:\s*$/.test(line)) {
      inPermissions = true
      continue
    }
    if (!inPermissions) continue
    if (!/^\s/.test(line)) {
      closeEntry()
      inPermissions = false
      continue
    }

    const item = /^\s{2}-\s+(action|resource|effect):\s*(.*)$/.exec(line)
    if (item) {
      if (item[1] === "action") {
        closeEntry()
        current = { action: item[2] !== "", resource: false, effect: null }
      }
      continue
    }

    const field = /^\s{4}(action|resource|effect):\s*(.*)$/.exec(line)
    if (field && current) {
      if (field[1] === "action") current.action = field[2] !== ""
      if (field[1] === "resource") current.resource = field[2] !== ""
      if (field[1] === "effect") current.effect = field[2] || null
    }
  }
  closeEntry()

  if (entries === 0) {
    issues.push({
      file,
      level: "error",
      message: "`permissions` debe contener al menos una regla.",
    })
  }
}

function validateSkill(
  file: string,
  parsed: ParsedFrontmatter,
  issues: ValidationIssue[],
): void {
  validateKeys(file, Object.keys(parsed.values), SKILL_KEYS, issues)
  if (!parsed.values.name) {
    issues.push({ file, level: "error", message: "Falta `name` en la skill." })
  }
  if (!parsed.values.description) {
    issues.push({ file, level: "error", message: "Falta `description` en la skill." })
  }
}

function validateKeys(
  file: string,
  keys: readonly string[],
  allowed: ReadonlySet<string>,
  issues: ValidationIssue[],
): void {
  for (const key of keys) {
    if (!allowed.has(key)) {
      issues.push({
        file,
        level: "error",
        message: `Clave de frontmatter no válida para OpenCode 2.2.5: \`${key}\`.`,
      })
    }
  }
}

function hasTopLevelKey(lines: readonly string[], key: string): boolean {
  return lines.some((line) => new RegExp(`^${key}:`).test(line))
}

/**
 * Valida la estructura de un Markdown generado: no vacío, cuerpo real, un
 * título de nivel 1, bloques de código cerrados, secciones con contenido y sin
 * placeholders pendientes.
 */
export function validateMarkdown(relativePath: string, content: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const normalized = content.replaceAll("\r\n", "\n")

  if (!normalized.trim()) {
    return [{ file: relativePath, level: "error", message: "El documento está vacío." }]
  }

  const kind = frontmatterKind(relativePath)
  const body = kind ? markdownBody(normalized) : normalized
  if (!body.trim()) {
    issues.push({
      file: relativePath,
      level: "error",
      message: "El documento no tiene cuerpo después del frontmatter.",
    })
    return issues
  }

  if (!/^#{1}\s+\S/m.test(body)) {
    issues.push({
      file: relativePath,
      level: "error",
      message: "Falta un título de nivel 1 (`# Título`).",
    })
  }

  const lines = body.split("\n")
  let fenceOpen = false
  for (const [index, line] of lines.entries()) {
    if (/^\s*```/.test(line)) fenceOpen = !fenceOpen
    if (/^#{1,6}\s*$/.test(line)) {
      issues.push({
        file: relativePath,
        level: "warning",
        message: `Encabezado sin texto en la línea ${index + 1}.`,
      })
    }
  }
  if (fenceOpen) {
    issues.push({
      file: relativePath,
      level: "error",
      message: "Hay un bloque de código sin cerrar (```).",
    })
  }

  if (UNRESOLVED_PLACEHOLDER.test(body)) {
    issues.push({
      file: relativePath,
      level: "error",
      message: "Contiene un marcador `{{...}}` sin resolver.",
    })
  }
  for (const marker of PENDING_MARKERS) {
    if (marker.pattern.test(body)) {
      issues.push({
        file: relativePath,
        level: "warning",
        message: `Contiene un marcador pendiente: ${marker.label}.`,
      })
    }
  }

  for (const index of emptySectionIndexes(lines)) {
    issues.push({
      file: relativePath,
      level: "warning",
      message: `Sección sin contenido en la línea ${index + 1}.`,
    })
  }

  return issues
}

/** Devuelve las líneas de un Markdown sin su bloque de frontmatter inicial. */
function markdownBody(content: string): string {
  const lines = content.split("\n")
  if (lines[0]?.trim() !== "---") return content
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---")
  return end === -1 ? content : lines.slice(end + 1).join("\n")
}

/** Posiciones de encabezados de sección seguidos inmediatamente por otro o por el final. */
function emptySectionIndexes(lines: readonly string[]): number[] {
  const result: number[] = []
  let fenceOpen = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ""
    if (/^\s*```/.test(line)) {
      fenceOpen = !fenceOpen
      continue
    }
    if (fenceOpen || !/^#{2,6}\s+\S/.test(line)) continue

    const next = nextNonEmptyLine(lines, index + 1)
    if (next === null || /^#{1,6}\s/.test(next)) result.push(index)
  }

  return result
}

function nextNonEmptyLine(lines: readonly string[], from: number): string | null {
  for (let index = from; index < lines.length; index += 1) {
    const line = (lines[index] ?? "").trim()
    if (line.length > 0) return line
  }
  return null
}

/** Valida que un `opencode.json(c)` generado o modificado sea JSONC parseable. */
export function validateJsonc(relativePath: string, content: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const parsed = parseJsonc(content)

  if (parsed === undefined) {
    return [
      {
        file: relativePath,
        level: "error",
        message: "El JSONC no se puede parsear (comentarios o comas finales incluidos).",
      },
    ]
  }
  if (!isPlainObject(parsed)) {
    return [
      { file: relativePath, level: "error", message: "La configuración debe ser un objeto JSON." },
    ]
  }

  const expectations: readonly { key: string; test: (value: unknown) => boolean; type: string }[] = [
    { key: "$schema", test: (value) => typeof value === "string", type: "string" },
    { key: "plugins", test: Array.isArray, type: "array" },
    { key: "commands", test: isPlainObject, type: "objeto" },
    { key: "agents", test: isPlainObject, type: "objeto" },
    { key: "permissions", test: Array.isArray, type: "array" },
    { key: "skills", test: Array.isArray, type: "array" },
    { key: "instructions", test: Array.isArray, type: "array" },
  ]

  for (const expectation of expectations) {
    const value = parsed[expectation.key]
    if (value !== undefined && !expectation.test(value)) {
      issues.push({
        file: relativePath,
        level: "error",
        message: `\`${expectation.key}\` debe ser ${expectation.type}.`,
      })
    }
  }

  return issues
}

/**
 * Valida los archivos generados (Markdown, JSONC, frontmatter y placeholders).
 * Se valida el contenido propuesto por el planificador: es el que el plugin
 * genera, con independencia de que un archivo existente se omita por falta de
 * autorización. `root` se usa para comprobar que las rutas son seguras.
 */
export async function validateFiles(
  root: string,
  files: readonly PlannedFile[],
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const resolvedRoot = path.resolve(root)

  for (const file of files) {
    const absolutePath = path.resolve(resolvedRoot, file.path)
    const relative = path.relative(resolvedRoot, absolutePath)
    if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
      issues.push({
        file: file.path,
        level: "error",
        message: "La ruta del archivo sale de la raíz del proyecto.",
      })
      continue
    }

    if (isJsoncPath(file.path)) issues.push(...validateJsonc(file.path, file.content))
    if (file.path.toLowerCase().endsWith(".md")) {
      issues.push(...validateMarkdown(file.path, file.content))
    }
  }

  issues.push(...validateFrontmatter(files))

  return issues.sort(
    (a, b) => a.file.localeCompare(b.file) || a.level.localeCompare(b.level),
  )
}

function isJsoncPath(relativePath: string): boolean {
  return /(^|\/)opencode\.jsonc?$/i.test(relativePath.replaceAll("\\", "/"))
}
