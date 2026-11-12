import { copyFile, lstat, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { isPlainObject, parseJsonc } from "./jsonc.js"
import type { FileResult, PlannedFile } from "./types.js"

export interface ApplyOptions {
  /** Raíz canónica del proyecto. */
  readonly root: string
  /** Rutas relativas de archivos existentes que el usuario autorizó a actualizar. */
  readonly approvedOverwrite: readonly string[]
}

/** Marcadores del bloque gestionado por el plugin dentro de documentación Markdown. */
export const MANAGED_BLOCK_START = "<!-- opencode-project-init:start -->"
export const MANAGED_BLOCK_END = "<!-- opencode-project-init:end -->"

/**
 * Escribe el plan aplicando protección de archivos existentes:
 *
 * - Un archivo existente solo se actualiza si su ruta aparece en `approvedOverwrite`.
 * - Antes de actualizar se crea una copia de seguridad con sufijo
 *   `.bak-YYYYMMDD-HHmmss`.
 * - La documentación Markdown conserva el contenido del usuario: el bloque
 *   generado se delimita con marcadores y se reemplaza en ejecuciones futuras.
 * - Las configuraciones `opencode.json(c)` se fusionan sin perder claves.
 * - La escritura es atómica (archivo temporal + `rename`).
 */
export async function applyPlan(
  files: readonly PlannedFile[],
  options: ApplyOptions,
): Promise<FileResult[]> {
  const root = path.resolve(options.root)
  const approved = new Set(options.approvedOverwrite.map(pathKey))
  const results: FileResult[] = []

  for (const file of files) {
    try {
      if (!file.content.trim()) {
        throw new Error("El contenido propuesto está vacío.")
      }

      const absolutePath = resolveInsideProject(root, file.path)
      await assertNoSymlink(root, absolutePath)
      const exists = await isFile(absolutePath)

      if (exists && !approved.has(pathKey(file.path))) {
        results.push({ path: file.path, action: "skipped" })
        continue
      }

      if (!exists) {
        await writeAtomic(absolutePath, file.content)
        results.push({ path: file.path, action: "created" })
        continue
      }

      const existing = await readFile(absolutePath, "utf8")
      const merged = mergeExistingContent(file.path, existing, file.content)
      if (merged === existing) {
        results.push({ path: file.path, action: "skipped" })
        continue
      }

      const backup = await createBackup(root, absolutePath)
      await writeAtomic(absolutePath, merged)
      results.push({ path: file.path, action: "updated", backup })
    } catch (error) {
      results.push({ path: file.path, action: "failed", error: describeError(error) })
    }
  }

  return results
}

/**
 * Fusiona el contenido propuesto con un archivo existente.
 * Exportado para poder probar la política de protección de forma aislada.
 */
export function mergeExistingContent(
  relativePath: string,
  existing: string,
  planned: string,
): string {
  const normalized = normalizeRelativePath(relativePath)
  if (isManagedMarkdown(normalized)) {
    return mergeManagedMarkdown(existing, planned)
  }
  if (isOpencodeConfig(normalized)) {
    return mergeJsonc(existing, planned)
  }
  return planned
}

/** Rutas de documentación donde se conserva el contenido previo del usuario. */
function isManagedMarkdown(relativePath: string): boolean {
  return relativePath === "AGENTS.md" || /^docs\/[^/]+\.md$/i.test(relativePath)
}

/** Configuraciones de OpenCode que deben fusionarse en lugar de reemplazarse. */
function isOpencodeConfig(relativePath: string): boolean {
  return /(^|\/)opencode\.jsonc?$/i.test(relativePath)
}

/**
 * Conserva el contenido del usuario y añade o reemplaza únicamente el bloque
 * gestionado. Los marcadores permiten actualizaciones idempotentes.
 */
function mergeManagedMarkdown(existing: string, planned: string): string {
  const newline = existing.includes("\r\n") ? "\r\n" : "\n"
  const managed = wrapManagedBlock(planned, newline)
  const start = existing.indexOf(MANAGED_BLOCK_START)
  const end = existing.indexOf(MANAGED_BLOCK_END)

  if (start !== -1 || end !== -1) {
    if (start === -1 || end === -1 || end < start) {
      throw new Error(
        `Marcadores de sección gestionada incompletos o desordenados en el archivo existente.`,
      )
    }
    const before = existing.slice(0, start)
    const after = existing.slice(end + MANAGED_BLOCK_END.length)
    return `${before}${managed}${after}`
  }

  const prefix = existing.trimEnd()
  return prefix.length > 0
    ? `${prefix}${newline}${newline}${managed}${newline}`
    : `${managed}${newline}`
}

function wrapManagedBlock(content: string, newline: string): string {
  return [
    MANAGED_BLOCK_START,
    content.trim(),
    MANAGED_BLOCK_END,
  ].join(newline)
}

/**
 * Si el contenido propuesto conserva literalmente todas las líneas del
 * existente (el caso de `insertJsonSchema`), se usa tal cual para no perder
 * comentarios ni formato. En caso contrario se fusionan las claves.
 */
function mergeJsonc(existing: string, planned: string): string {
  if (preservesExistingLines(existing, planned)) return planned

  const existingData = parseJsonc(existing)
  const plannedData = parseJsonc(planned)
  if (existingData === undefined || plannedData === undefined) return planned

  const merged = deepMerge(existingData, plannedData)
  return `${JSON.stringify(merged, null, 2)}\n`
}

function preservesExistingLines(existing: string, planned: string): boolean {
  const lines = existing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  return lines.every((line) => planned.includes(line))
}

/** Fusiona objetos de forma recursiva; los valores de `override` ganan. */
function deepMerge(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) return override
  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    result[key] = key in result ? deepMerge(result[key], value) : value
  }
  return result
}

/** Crea una copia de seguridad única y devuelve su ruta relativa. */
async function createBackup(root: string, absolutePath: string): Promise<string> {
  const base = `${absolutePath}.bak-${formatTimestamp(new Date())}`
  let candidate = base
  let counter = 2
  while (await pathExists(candidate)) {
    candidate = `${base}.${counter}`
    counter += 1
  }
  await copyFile(absolutePath, candidate)
  return toRelative(root, candidate)
}

function formatTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0")
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("")
}

/** Escritura atómica: archivo temporal en el mismo directorio y `rename`. */
async function writeAtomic(absolutePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(absolutePath), { recursive: true })
  const tempPath = `${absolutePath}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(tempPath, content, "utf8")
    await rename(tempPath, absolutePath)
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}

/** Resuelve una ruta relativa y verifica que queda dentro de la raíz del proyecto. */
function resolveInsideProject(root: string, relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath)
  if (!normalized) {
    throw new Error(`Ruta de archivo inválida: ${relativePath}`)
  }
  if (path.isAbsolute(normalized)) {
    throw new Error(`No se admiten rutas absolutas: ${relativePath}`)
  }
  const absolutePath = path.resolve(root, normalized)
  const relative = path.relative(root, absolutePath)
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(".." + path.sep) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`La ruta sale del proyecto: ${relativePath}`)
  }
  return absolutePath
}

/**
 * Rechaza archivos symlink y rutas que atraviesen un symlink existente,
 * para no escribir fuera del proyecto.
 */
async function assertNoSymlink(root: string, absolutePath: string): Promise<void> {
  const relative = path.relative(root, absolutePath)
  const segments = relative.split(path.sep).filter(Boolean)
  let current = root

  for (const segment of segments) {
    current = path.join(current, segment)
    const info = await lstat(current).catch(() => null)
    if (!info) return
    if (info.isSymbolicLink()) {
      throw new Error(`La ruta atraviesa un enlace simbólico: ${toRelative(root, current)}`)
    }
  }
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").trim()
}

/** Clave de comparación de rutas; Windows no distingue mayúsculas. */
function pathKey(value: string): string {
  const normalized = normalizeRelativePath(value)
  return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

function toRelative(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).replace(/\\/g, "/")
}

async function pathExists(target: string): Promise<boolean> {
  const info = await lstat(target).catch(() => null)
  return info !== null
}

async function isFile(target: string): Promise<boolean> {
  const info = await stat(target).catch(() => null)
  return info?.isFile() ?? false
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
