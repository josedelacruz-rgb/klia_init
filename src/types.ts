/** Tipos compartidos del plugin opencode-project-init. */

/** Tecnologías/finalidades detectadas en el proyecto. */
export type ProjectKind =
  | "opencode-plugin"
  | "opencode-project"
  | "cli"
  | "api"
  | "web"
  | "desktop"
  | "library"
  | "monorepo"
  | "unknown"

/** Datos relevantes leídos de package.json. */
export interface PackageJsonData {
  readonly name?: string
  readonly description?: string
  readonly type?: string
  readonly main?: string
  readonly module?: string
  /** Campo `bin`: una ruta o un mapa nombre → ruta. */
  readonly bin?: string | Readonly<Record<string, string>>
  /** Patrones de workspace normalizados a array. */
  readonly workspaces?: readonly string[]
  readonly scripts: Readonly<Record<string, string>>
  readonly dependencies: Readonly<Record<string, string>>
  readonly devDependencies: Readonly<Record<string, string>>
  readonly peerDependencies: Readonly<Record<string, string>>
}

/** Hechos objetivos recopilados del sistema de archivos (sin interpretación). */
export interface DetectedProject {
  /** Ruta absoluta de la raíz del proyecto. */
  readonly root: string
  /** Archivos en el primer nivel (sin directorios). */
  readonly topLevelFiles: readonly string[]
  /** Directorios en el primer nivel (sin archivos). */
  readonly topLevelDirectories: readonly string[]
  /** Archivos marcador encontrados, relativos y con separador `/`. */
  readonly markers: readonly string[]
  readonly packageJson: PackageJsonData | null
  /** README principal detectado, relativo. */
  readonly readme: string | null
  /** Documentos existentes bajo docs/ (relativos). */
  readonly existingDocs: readonly string[]
  readonly existingAgentsMd: boolean
  /** Configuraciones opencode.json(c) existentes (relativas). */
  readonly opencodeConfigPaths: readonly string[]
  /** Agentes existentes en .opencode/agents (relativos). */
  readonly existingAgentFiles: readonly string[]
  /** Comandos existentes en .opencode/commands (relativos). */
  readonly existingCommandFiles: readonly string[]
  /** Skills existentes en .opencode/skills (rutas a SKILL.md, relativas). */
  readonly existingSkillFiles: readonly string[]
  /** Muestra acotada de archivos fuente (relativos) para inferir arquitectura. */
  readonly sourceFiles: readonly string[]
  /** Dependencias declaradas en requirements*.txt o pyproject.toml (normalizadas). */
  readonly pythonDependencies: readonly string[]
  /** Secciones `[tool.<name>]` encontradas en pyproject.toml. */
  readonly pythonToolSections: readonly string[]
  readonly warnings: readonly string[]
}

/** Directorio relevante con una descripción verificable. */
export interface DirectoryInfo {
  /** Ruta relativa con separador `/`. */
  readonly path: string
  readonly description: string
}

/** Análisis interpretado a partir de los hechos detectados. */
export interface ProjectAnalysis {
  readonly root: string
  readonly name: string
  readonly description: string | null
  readonly kinds: readonly ProjectKind[]
  readonly languages: readonly string[]
  readonly frameworks: readonly string[]
  readonly packageManager: string | null
  readonly runtimeDependencies: readonly string[]
  readonly devDependencies: readonly string[]
  readonly scripts: Readonly<Record<string, string>>
  readonly testTools: readonly string[]
  readonly qualityTools: readonly string[]
  readonly directories: readonly DirectoryInfo[]
  readonly entrypoints: readonly string[]
  readonly existingDocs: readonly string[]
  readonly existingAgentsMd: boolean
  readonly opencodeConfigPaths: readonly string[]
  readonly existingAgentFiles: readonly string[]
  readonly existingCommandFiles: readonly string[]
  readonly existingSkillFiles: readonly string[]
  readonly warnings: readonly string[]
}

/** Archivo propuesto por el planificador. */
export interface PlannedFile {
  /** Ruta relativa al proyecto, con separador `/`. */
  readonly path: string
  /** Descripción breve para el resumen previo al usuario. */
  readonly description: string
  readonly content: string
  /** `true` si ya existe en disco. */
  readonly exists: boolean
  /** `create` para archivos nuevos, `overwrite` para existentes. */
  readonly mode: "create" | "overwrite"
}

/** Resultado de escribir (o no) un archivo del plan. */
export interface FileResult {
  readonly path: string
  readonly action: "created" | "updated" | "skipped" | "failed"
  readonly backup?: string
  readonly error?: string
}

/** Incidencia de validación. */
export interface ValidationIssue {
  readonly file: string
  readonly level: "error" | "warning"
  readonly message: string
}

/** Informe final devuelto por la herramienta. */
export interface ProjectInitReport {
  readonly root: string
  readonly analysis: ProjectAnalysis
  readonly files: readonly FileResult[]
  readonly validations: readonly ValidationIssue[]
  readonly ok: boolean
}
