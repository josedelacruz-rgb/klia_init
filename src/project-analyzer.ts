import path from "node:path"
import type {
  DetectedProject,
  DirectoryInfo,
  ProjectAnalysis,
  ProjectKind,
} from "./types.js"

interface FrameworkRule {
  readonly name: string
  readonly packages: readonly string[]
  readonly kinds?: readonly ProjectKind[]
}

/** Tecnologías reconocidas a partir de dependencias declaradas. */
const FRAMEWORK_RULES: readonly FrameworkRule[] = [
  { name: "React", packages: ["react", "react-dom"], kinds: ["web"] },
  { name: "Next.js", packages: ["next"], kinds: ["web"] },
  { name: "Vue", packages: ["vue"], kinds: ["web"] },
  { name: "Nuxt", packages: ["nuxt"], kinds: ["web"] },
  { name: "Svelte", packages: ["svelte"], kinds: ["web"] },
  { name: "SvelteKit", packages: ["@sveltejs/kit"], kinds: ["web"] },
  { name: "Astro", packages: ["astro"], kinds: ["web"] },
  { name: "Angular", packages: ["@angular/core"], kinds: ["web"] },
  { name: "SolidJS", packages: ["solid-js"], kinds: ["web"] },
  { name: "Express", packages: ["express"], kinds: ["api"] },
  { name: "Fastify", packages: ["fastify"], kinds: ["api"] },
  { name: "Koa", packages: ["koa"], kinds: ["api"] },
  { name: "Hono", packages: ["hono"], kinds: ["api"] },
  { name: "NestJS", packages: ["@nestjs/core"], kinds: ["api"] },
  { name: "Electron", packages: ["electron"], kinds: ["desktop"] },
  { name: "Tauri", packages: ["@tauri-apps/api"], kinds: ["desktop"] },
  { name: "React Native", packages: ["react-native"] },
  { name: "Django", packages: ["django"], kinds: ["web", "api"] },
  { name: "Flask", packages: ["flask"], kinds: ["web", "api"] },
  { name: "FastAPI", packages: ["fastapi"], kinds: ["api"] },
]

/** Descripción verificable por nombre de directorio de primer nivel. */
const DIRECTORY_DESCRIPTIONS: Readonly<Record<string, string>> = {
  src: "Código fuente",
  lib: "Código de la librería",
  app: "Aplicación",
  apps: "Aplicaciones del monorepo",
  packages: "Paquetes del monorepo",
  tests: "Pruebas",
  test: "Pruebas",
  __tests__: "Pruebas",
  spec: "Especificaciones y pruebas",
  e2e: "Pruebas de extremo a extremo",
  fixtures: "Datos y proyectos de prueba",
  docs: "Documentación del proyecto",
  scripts: "Scripts de automatización",
  public: "Recursos estáticos públicos",
  assets: "Recursos estáticos",
  static: "Recursos estáticos",
  config: "Configuración",
  docker: "Empaquetado con Docker",
  deploy: "Despliegue",
  infra: "Infraestructura",
  migrations: "Migraciones de base de datos",
  examples: "Ejemplos de uso",
  cmd: "Puntos de entrada de comandos (Go)",
  internal: "Código interno no exportado (Go)",
  pkg: "Paquetes reutilizables (Go)",
  server: "Código del servidor",
  client: "Código del cliente",
  web: "Código web",
  desktop: "Código de escritorio",
  api: "Código de la API",
  "src-tauri": "Código de escritorio Tauri",
  ".github": "Automatización de GitHub",
  ".opencode": "Configuración de OpenCode",
  ".ralph": "Metadatos del bucle Ralph",
  ".vscode": "Configuración de VS Code",
}

const COMMON_ENTRYPOINTS = [
  "src/index.ts",
  "src/index.tsx",
  "src/index.js",
  "src/index.mjs",
  "src/index.cjs",
  "src/main.ts",
  "src/main.tsx",
  "src/main.js",
  "src/app.ts",
  "src/app.tsx",
  "src/server.ts",
  "src/cli.ts",
  "src/cli.js",
  "index.ts",
  "index.js",
  "main.py",
  "app.py",
  "manage.py",
  "src/main.py",
  "app/main.py",
  "src/__main__.py",
] as const

/**
 * Interpreta los hechos detectados y produce el análisis del proyecto.
 * Solo afirma lo respaldado por archivos o dependencias encontrados.
 */
export function analyzeProject(detected: DetectedProject): ProjectAnalysis {
  const packageJson = detected.packageJson
  const dependencies = {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {}),
    ...(packageJson?.peerDependencies ?? {}),
  }
  const dependencyNames = Object.keys(dependencies)
  const dependencySet = new Set(dependencyNames.map((name) => name.toLowerCase()))
  const pythonDependencies = detected.pythonDependencies.map((name) => name.toLowerCase())
  const pythonDependencySet = new Set(pythonDependencies)
  const pythonToolSections = new Set(detected.pythonToolSections)
  const markerSet = new Set(detected.markers.map((marker) => marker.toLowerCase()))
  const sourceLower = detected.sourceFiles.map((file) => file.toLowerCase())
  const scripts = packageJson?.scripts ?? {}
  const scriptText = Object.values(scripts).join("\n").toLowerCase()

  const hasPackageDependency = (name: string): boolean =>
    dependencySet.has(name.toLowerCase())
  const hasPythonDependency = (name: string): boolean =>
    pythonDependencySet.has(name.toLowerCase())
  const hasAnyMarker = (...names: string[]): boolean =>
    names.some((name) => markerSet.has(name.toLowerCase()))
  const hasSourceExtension = (...extensions: string[]): boolean =>
    sourceLower.some((file) => extensions.some((extension) => file.endsWith(extension)))
  const hasSourcePath = (fragment: string): boolean =>
    sourceLower.some((file) => file.includes(fragment))

  const frameworks: string[] = []
  const kinds: ProjectKind[] = []
  const addKind = (kind: ProjectKind): void => {
    if (!kinds.includes(kind)) kinds.push(kind)
  }

  for (const rule of FRAMEWORK_RULES) {
    if (rule.packages.some((name) => hasPackageDependency(name) || hasPythonDependency(name))) {
      frameworks.push(rule.name)
      for (const kind of rule.kinds ?? []) addKind(kind)
    }
  }

  const isOpencodePlugin =
    hasPackageDependency("@opencode/plugin") ||
    hasPackageDependency("@opencode-ai/plugin")
  if (isOpencodePlugin) addKind("opencode-plugin")

  const hasOpencodeDirectory = detected.topLevelDirectories.some(
    (directory) => directory.toLowerCase() === ".opencode",
  )
  if (
    hasOpencodeDirectory ||
    detected.opencodeConfigPaths.length > 0 ||
    detected.existingAgentFiles.length > 0 ||
    detected.existingCommandFiles.length > 0 ||
    detected.existingSkillFiles.length > 0
  ) {
    addKind("opencode-project")
  }

  const workspacePackages = packageJson?.workspaces?.length ?? 0
  const isMonorepo =
    workspacePackages > 0 ||
    hasAnyMarker("pnpm-workspace.yaml", "lerna.json", "nx.json", "turbo.json", "rush.json")
  if (isMonorepo) addKind("monorepo")

  const isCli =
    packageJson?.bin !== undefined ||
    sourceLower.some((file) => /(^|\/)cli\.(ts|tsx|js|mjs|cjs)$/.test(file))
  if (isCli) addKind("cli")

  if (detected.topLevelDirectories.some((directory) => directory.toLowerCase() === "src-tauri")) {
    addKind("desktop")
  }

  const hasApplicationKind =
    isOpencodePlugin || isMonorepo || isCli || kinds.includes("api") ||
    kinds.includes("web") || kinds.includes("desktop")
  if (packageJson && !hasApplicationKind) addKind("library")
  if (kinds.length === 0) addKind("unknown")

  const languages: string[] = []
  const addLanguage = (language: string): void => {
    if (!languages.includes(language)) languages.push(language)
  }
  if (hasAnyMarker("tsconfig.json") || hasSourceExtension(".ts", ".tsx", ".mts", ".cts")) {
    addLanguage("TypeScript")
  }
  if (hasAnyMarker("jsconfig.json") || hasSourceExtension(".js", ".jsx", ".mjs", ".cjs")) {
    addLanguage("JavaScript")
  }
  if (
    hasAnyMarker("pyproject.toml", "requirements.txt", "setup.py", "setup.cfg", "Pipfile") ||
    hasSourceExtension(".py")
  ) {
    addLanguage("Python")
  }
  if (hasAnyMarker("go.mod") || hasSourceExtension(".go")) addLanguage("Go")
  if (hasAnyMarker("Cargo.toml") || hasSourceExtension(".rs")) addLanguage("Rust")
  if (hasAnyMarker("pom.xml", "build.gradle") || hasSourceExtension(".java")) {
    addLanguage("Java")
  }
  if (hasSourceExtension(".kt")) addLanguage("Kotlin")
  if (
    hasSourceExtension(".cs") ||
    detected.topLevelFiles.some((file) => /\.(csproj|sln)$/i.test(file))
  ) {
    addLanguage("C#")
  }
  if (hasAnyMarker("Gemfile") || hasSourceExtension(".rb")) addLanguage("Ruby")
  if (hasAnyMarker("composer.json") || hasSourceExtension(".php")) addLanguage("PHP")
  if (hasAnyMarker("pubspec.yaml") || hasSourceExtension(".dart")) addLanguage("Dart")
  if (hasSourceExtension(".swift")) addLanguage("Swift")

  const testTools: string[] = []
  const addTestTool = (name: string): void => {
    if (!testTools.includes(name)) testTools.push(name)
  }
  if (hasPackageDependency("vitest") || scriptText.includes("vitest")) addTestTool("Vitest")
  if (hasPackageDependency("jest") || scriptText.includes("jest")) addTestTool("Jest")
  if (hasPackageDependency("mocha") || scriptText.includes("mocha")) addTestTool("Mocha")
  if (hasPackageDependency("ava")) addTestTool("AVA")
  if (hasPackageDependency("@playwright/test") || hasPackageDependency("playwright")) {
    addTestTool("Playwright")
  }
  if (hasPackageDependency("cypress") || scriptText.includes("cypress")) addTestTool("Cypress")
  if (scriptText.includes("bun test")) addTestTool("Bun test")
  if (scriptText.includes("node --test")) addTestTool("Node test runner")
  if (
    hasPythonDependency("pytest") ||
    pythonToolSections.has("pytest") ||
    scriptText.includes("pytest") ||
    hasAnyMarker("pytest.ini")
  ) {
    addTestTool("pytest")
  }
  if (hasPythonDependency("tox") || pythonToolSections.has("tox") || hasAnyMarker("tox.ini")) {
    addTestTool("tox")
  }
  if (hasPythonDependency("nox") || pythonToolSections.has("nox")) addTestTool("nox")
  if (hasAnyMarker("go.mod") && sourceLower.some((file) => file.endsWith("_test.go"))) {
    addTestTool("Go test")
  }
  if (hasAnyMarker("Cargo.toml") && scriptText.includes("cargo test")) {
    addTestTool("Cargo test")
  }
  if (
    (hasAnyMarker("pom.xml", "build.gradle", "build.gradle.kts") || hasSourceExtension(".java")) &&
    sourceLower.some((file) => file.includes("src/test/"))
  ) {
    addTestTool("JUnit")
  }

  const qualityTools: string[] = []
  const addQualityTool = (name: string): void => {
    if (!qualityTools.includes(name)) qualityTools.push(name)
  }
  if (
    hasPackageDependency("eslint") ||
    hasAnyMarker(".eslintrc", ".eslintrc.json", ".eslintrc.js", ".eslintrc.cjs", "eslint.config.js", "eslint.config.mjs")
  ) {
    addQualityTool("ESLint")
  }
  if (
    hasPackageDependency("prettier") ||
    hasAnyMarker(".prettierrc", ".prettierrc.json", "prettier.config.js")
  ) {
    addQualityTool("Prettier")
  }
  if (hasPackageDependency("@biomejs/biome") || hasAnyMarker("biome.json", "biome.jsonc")) {
    addQualityTool("Biome")
  }
  if (
    hasPackageDependency("stylelint") ||
    hasAnyMarker(".stylelintrc", ".stylelintrc.json")
  ) {
    addQualityTool("Stylelint")
  }
  if (
    hasPythonDependency("ruff") ||
    pythonToolSections.has("ruff") ||
    hasAnyMarker("ruff.toml", ".ruff.toml")
  ) {
    addQualityTool("Ruff")
  }
  if (hasPythonDependency("black") || pythonToolSections.has("black")) addQualityTool("Black")
  if (
    hasPythonDependency("mypy") ||
    pythonToolSections.has("mypy") ||
    hasAnyMarker("mypy.ini")
  ) {
    addQualityTool("mypy")
  }
  if (hasPythonDependency("pyright") || pythonToolSections.has("pyright")) {
    addQualityTool("Pyright")
  }
  if (hasAnyMarker(".golangci.yml")) addQualityTool("golangci-lint")
  if (scriptText.includes("tsc") || scriptText.includes("typecheck")) addQualityTool("TypeScript (tsc)")

  const directories: DirectoryInfo[] = []
  for (const directory of detected.topLevelDirectories) {
    const description = DIRECTORY_DESCRIPTIONS[directory.toLowerCase()]
    if (description) directories.push({ path: directory, description })
  }

  const entrypoints: string[] = []
  const addEntrypoint = (candidate: string): void => {
    const normalized = candidate.replace(/^\.\//, "").replace(/\\/g, "/")
    if (normalized && !entrypoints.includes(normalized)) entrypoints.push(normalized)
  }
  if (packageJson?.main) addEntrypoint(packageJson.main)
  if (packageJson?.module) addEntrypoint(packageJson.module)
  if (typeof packageJson?.bin === "string") addEntrypoint(packageJson.bin)
  else if (packageJson?.bin) {
    for (const value of Object.values(packageJson.bin)) addEntrypoint(value)
  }
  const verifiableFiles = new Set([...detected.sourceFiles, ...detected.topLevelFiles])
  for (const candidate of COMMON_ENTRYPOINTS) {
    if (verifiableFiles.has(candidate)) addEntrypoint(candidate)
  }
  for (const file of detected.sourceFiles) {
    if (/(^|\/)cmd\/[^/]+\/main\.go$/i.test(file) || /(^|\/)main\.go$/i.test(file)) {
      addEntrypoint(file)
    }
  }

  const packageManager = detectPackageManager(markerSet)

  const warnings = [...detected.warnings]
  if (detected.markers.length === 0) {
    warnings.push(
      "No se encontraron archivos marcador en la raíz; el análisis se limita a los archivos detectados.",
    )
  }
  if (detected.sourceFiles.length === 0) {
    warnings.push("No se detectaron archivos fuente en la muestra analizada.")
  }

  return {
    root: detected.root,
    name: packageJson?.name ?? (path.basename(detected.root) || "proyecto"),
    description: packageJson?.description ?? null,
    kinds,
    languages,
    frameworks,
    packageManager,
    runtimeDependencies: Object.keys(packageJson?.dependencies ?? {}).sort((a, b) =>
      a.localeCompare(b),
    ),
    devDependencies: Object.keys(packageJson?.devDependencies ?? {}).sort((a, b) =>
      a.localeCompare(b),
    ),
    scripts,
    testTools,
    qualityTools,
    directories,
    entrypoints,
    existingDocs: detected.existingDocs,
    existingAgentsMd: detected.existingAgentsMd,
    opencodeConfigPaths: detected.opencodeConfigPaths,
    existingAgentFiles: detected.existingAgentFiles,
    existingCommandFiles: detected.existingCommandFiles,
    existingSkillFiles: detected.existingSkillFiles,
    warnings,
  }
}

function detectPackageManager(markers: ReadonlySet<string>): string | null {
  if (markers.has("bun.lock") || markers.has("bun.lockb")) return "bun"
  if (markers.has("pnpm-lock.yaml")) return "pnpm"
  if (markers.has("yarn.lock")) return "yarn"
  if (markers.has("package-lock.json")) return "npm"
  if (markers.has("uv.lock")) return "uv"
  if (markers.has("poetry.lock")) return "poetry"
  if (markers.has("pipfile.lock")) return "pipenv"
  if (markers.has("cargo.lock")) return "cargo"
  if (markers.has("go.sum")) return "go modules"
  return null
}
