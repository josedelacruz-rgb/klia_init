import { access, readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"
import type { DetectedProject, PackageJsonData } from "./types.js"

/** Directorios que nunca se recorren: dependencias, artefactos y metadatos VCS. */
const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  "out",
  "coverage",
  ".nyc_output",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".astro",
  ".cache",
  ".turbo",
  ".parcel-cache",
  ".venv",
  "venv",
  "env",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  "target",
  "vendor",
  "obj",
  ".idea",
  ".gradle",
  ".terraform",
])

/** Archivos marcador buscados en el primer nivel del proyecto. */
const MARKER_FILES = [
  "package.json",
  "package-lock.json",
  "bun.lock",
  "bun.lockb",
  "pnpm-lock.yaml",
  "yarn.lock",
  "pnpm-workspace.yaml",
  "lerna.json",
  "nx.json",
  "turbo.json",
  "rush.json",
  "tsconfig.json",
  "jsconfig.json",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "setup.cfg",
  "Pipfile",
  "Pipfile.lock",
  "poetry.lock",
  "uv.lock",
  "go.mod",
  "go.sum",
  "Cargo.toml",
  "Cargo.lock",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "composer.json",
  "Gemfile",
  "Gemfile.lock",
  "pubspec.yaml",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "Makefile",
  "CMakeLists.txt",
  ".editorconfig",
  ".gitignore",
  ".eslintrc",
  ".eslintrc.json",
  ".eslintrc.js",
  ".eslintrc.cjs",
  "eslint.config.js",
  "eslint.config.mjs",
  ".prettierrc",
  ".prettierrc.json",
  "prettier.config.js",
  "biome.json",
  "biome.jsonc",
  ".stylelintrc",
  ".stylelintrc.json",
  "ruff.toml",
  ".ruff.toml",
  "mypy.ini",
  ".golangci.yml",
  "pytest.ini",
  "tox.ini",
  "README.md",
  "AGENTS.md",
  "opencode.json",
  "opencode.jsonc",
] as const

/** Extensiones consideradas código fuente para la muestra de arquitectura. */
const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".kts",
  ".cs",
  ".rb",
  ".php",
  ".dart",
  ".swift",
  ".vue",
  ".svelte",
  ".ex",
  ".exs",
])

const SOURCE_SAMPLE_LIMIT = 250
const SOURCE_SAMPLE_DEPTH = 4

interface WalkOptions {
  readonly maxDepth: number
  readonly limit: number
  readonly accept: (relativePath: string) => boolean
}

/**
 * Devuelve la raíz normalizada del proyecto.
 * OpenCode entrega la raíz canónica; aquí solo se valida y normaliza.
 */
export async function resolveProjectRoot(root: string): Promise<string> {
  const resolved = path.resolve(root)
  const info = await stat(resolved).catch(() => null)
  if (!info || !info.isDirectory()) {
    throw new Error(`La raíz del proyecto no es un directorio accesible: ${resolved}`)
  }
  return resolved
}

/**
 * Recorre el proyecto de forma selectiva y devuelve hechos verificables.
 * No interpreta: esa responsabilidad es de `project-analyzer`.
 */
export async function detectProject(root: string): Promise<DetectedProject> {
  const resolved = await resolveProjectRoot(root)
  const warnings: string[] = []

  const topEntries = await readdir(resolved, { withFileTypes: true }).catch((error: unknown) => {
    throw new Error(
      `No se pudo leer el directorio del proyecto ${resolved}: ${describeError(error)}`,
    )
  })

  const topLevelFiles = topEntries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
  const topLevelDirectories = topEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))

  const markers = MARKER_FILES.flatMap((marker) => {
    const actual = findCaseInsensitive(topLevelFiles, marker)
    return actual ? [actual] : []
  })

  const packageJson = await readPackageJson(resolved, topLevelFiles, warnings)
  const readme = findCaseInsensitiveByRegex(topLevelFiles, /^readme(\.[a-z0-9]+)?$/i)

  const existingDocs = (await isDirectory(path.join(resolved, "docs")))
    ? await walkFiles(resolved, "docs", {
        maxDepth: 3,
        limit: 100,
        accept: (relative) => relative.toLowerCase().endsWith(".md"),
      })
    : []

  const existingAgentFiles = await walkFiles(resolved, ".opencode/agents", {
    maxDepth: 3,
    limit: 100,
    accept: (relative) => relative.toLowerCase().endsWith(".md"),
  })

  const existingCommandFiles = await walkFiles(resolved, ".opencode/commands", {
    maxDepth: 3,
    limit: 100,
    accept: (relative) => relative.toLowerCase().endsWith(".md"),
  })

  const existingSkillFiles = await walkFiles(resolved, ".opencode/skills", {
    maxDepth: 3,
    limit: 100,
    accept: (relative) => path.posix.basename(relative).toLowerCase() === "skill.md",
  })

  const opencodeConfigPaths: string[] = []
  for (const candidate of [
    "opencode.json",
    "opencode.jsonc",
    ".opencode/opencode.json",
    ".opencode/opencode.jsonc",
  ]) {
    if (await isFile(path.join(resolved, candidate))) opencodeConfigPaths.push(candidate)
  }

  const sourceFiles = await walkFiles(resolved, "", {
    maxDepth: SOURCE_SAMPLE_DEPTH,
    limit: SOURCE_SAMPLE_LIMIT,
    accept: isSourceFile,
  })
  if (sourceFiles.length === SOURCE_SAMPLE_LIMIT) {
    warnings.push(
      `La muestra de archivos fuente se limitó a ${SOURCE_SAMPLE_LIMIT} archivos; ` +
        "el análisis se basa en esa muestra.",
    )
  }

  const { pythonDependencies, pythonToolSections } = await readPythonMetadata(
    resolved,
    topLevelFiles,
    warnings,
  )

  return {
    root: resolved,
    topLevelFiles,
    topLevelDirectories,
    markers,
    packageJson,
    readme,
    existingDocs,
    existingAgentsMd: markers.some((marker) => marker.toLowerCase() === "agents.md"),
    opencodeConfigPaths,
    existingAgentFiles,
    existingCommandFiles,
    existingSkillFiles,
    sourceFiles,
    pythonDependencies,
    pythonToolSections,
    warnings,
  }
}

async function walkFiles(
  root: string,
  startRelative: string,
  options: WalkOptions,
): Promise<string[]> {
  const found: string[] = []

  const visit = async (relativeDirectory: string, depth: number): Promise<void> => {
    if (found.length >= options.limit) return

    let entries
    try {
      entries = await readdir(path.join(root, relativeDirectory), { withFileTypes: true })
    } catch {
      // Directorio ausente o ilegible: no es un hallazgo, se ignora.
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      if (found.length >= options.limit) break

      const relative = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name

      if (entry.isSymbolicLink()) continue

      if (entry.isDirectory()) {
        if (depth < options.maxDepth && !IGNORED_DIRECTORIES.has(entry.name.toLowerCase())) {
          await visit(relative, depth + 1)
        }
        continue
      }

      if (entry.isFile() && options.accept(relative)) found.push(relative)
    }
  }

  await visit(startRelative, 0)
  return found.sort((a, b) => a.localeCompare(b))
}

function isSourceFile(relativePath: string): boolean {
  const lower = relativePath.toLowerCase()
  if (lower.endsWith(".d.ts") || lower.endsWith(".min.js") || lower.endsWith(".min.css")) {
    return false
  }
  const extension = path.posix.extname(lower)
  return SOURCE_EXTENSIONS.has(extension)
}

async function readPackageJson(
  root: string,
  topLevelFiles: readonly string[],
  warnings: string[],
): Promise<PackageJsonData | null> {
  const fileName = findCaseInsensitive(topLevelFiles, "package.json")
  if (!fileName) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(path.join(root, fileName), "utf8"))
  } catch (error) {
    warnings.push(`No se pudo interpretar package.json: ${describeError(error)}`)
    return null
  }

  if (!isRecord(parsed)) {
    warnings.push("package.json no contiene un objeto JSON válido.")
    return null
  }

  return {
    name: asString(parsed["name"]),
    description: asString(parsed["description"]),
    type: asString(parsed["type"]),
    main: asString(parsed["main"]),
    module: asString(parsed["module"]),
    bin: asString(parsed["bin"]) ?? asStringRecord(parsed["bin"]),
    workspaces: asWorkspaces(parsed["workspaces"]),
    scripts: asStringRecord(parsed["scripts"]) ?? {},
    dependencies: asStringRecord(parsed["dependencies"]) ?? {},
    devDependencies: asStringRecord(parsed["devDependencies"]) ?? {},
    peerDependencies: asStringRecord(parsed["peerDependencies"]) ?? {},
  }
}

async function readPythonMetadata(
  root: string,
  topLevelFiles: readonly string[],
  warnings: string[],
): Promise<{
  pythonDependencies: string[]
  pythonToolSections: string[]
}> {
  const dependencies = new Set<string>()

  for (const file of topLevelFiles) {
    if (!/^requirements.*\.txt$/i.test(file)) continue
    try {
      const content = await readFile(path.join(root, file), "utf8")
      for (const line of content.split(/\r?\n/)) {
        const dependency = normalizeRequirement(line)
        if (dependency) dependencies.add(dependency)
      }
    } catch (error) {
      warnings.push(`No se pudo leer ${file}: ${describeError(error)}`)
    }
  }

  const pyprojectName = findCaseInsensitive(topLevelFiles, "pyproject.toml")
  if (pyprojectName) {
    try {
      const content = await readFile(path.join(root, pyprojectName), "utf8")
      for (const match of content.matchAll(/dependencies\s*=\s*\[([\s\S]*?)\]/g)) {
        const block = match[1] ?? ""
        for (const entry of block.matchAll(/"([^"]+)"|'([^']+)'/g)) {
          const dependency = normalizeRequirement(entry[1] ?? entry[2] ?? "")
          if (dependency) dependencies.add(dependency)
        }
      }
    } catch (error) {
      warnings.push(`No se pudo leer ${pyprojectName}: ${describeError(error)}`)
    }
  }

  const toolSections = new Set<string>()
  const pyprojectForTools = pyprojectName
  if (pyprojectForTools) {
    try {
      const content = await readFile(path.join(root, pyprojectForTools), "utf8")
      for (const match of content.matchAll(/^\s*\[tool\.([A-Za-z0-9_-]+)/gm)) {
        const name = match[1]
        if (name) toolSections.add(name.toLowerCase())
      }
    } catch {
      // Ya se advirtió al leer dependencias; no se duplica el aviso.
    }
  }

  return {
    pythonDependencies: [...dependencies].sort((a, b) => a.localeCompare(b)),
    pythonToolSections: [...toolSections].sort((a, b) => a.localeCompare(b)),
  }
}

function normalizeRequirement(line: string): string | null {
  const cleaned = (line.split("#")[0] ?? "").trim()
  if (!cleaned || cleaned.startsWith("-")) return null
  const match = /^([A-Za-z0-9][A-Za-z0-9_.-]*)/.exec(cleaned)
  return match?.[1]?.toLowerCase() ?? null
}

function findCaseInsensitive(files: readonly string[], target: string): string | null {
  const lowerTarget = target.toLowerCase()
  return files.find((file) => file.toLowerCase() === lowerTarget) ?? null
}

function findCaseInsensitiveByRegex(files: readonly string[], pattern: RegExp): string | null {
  return files.find((file) => pattern.test(file)) ?? null
}

async function isDirectory(target: string): Promise<boolean> {
  const info = await stat(target).catch(() => null)
  return info?.isDirectory() ?? false
}

async function isFile(target: string): Promise<boolean> {
  try {
    await access(target)
    const info = await stat(target)
    return info.isFile()
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") result[key] = entry
  }
  return result
}

function asWorkspaces(value: unknown): readonly string[] | undefined {
  if (Array.isArray(value)) {
    const packages = value.filter((entry): entry is string => typeof entry === "string")
    return packages.length > 0 ? packages : undefined
  }
  if (isRecord(value) && Array.isArray(value["packages"])) {
    const packages = value["packages"].filter(
      (entry): entry is string => typeof entry === "string",
    )
    return packages.length > 0 ? packages : undefined
  }
  return undefined
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
