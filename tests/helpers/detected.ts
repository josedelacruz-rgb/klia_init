import type { DetectedProject, PackageJsonData } from "../../src/types.js"

const DEFAULT_PACKAGE_JSON: PackageJsonData = {
  scripts: {},
  dependencies: {},
  devDependencies: {},
  peerDependencies: {},
}

/** Construye un `DetectedProject` completo a partir de un subconjunto. */
export function makeDetected(overrides: Partial<DetectedProject> = {}): DetectedProject {
  return {
    root: "/proyecto",
    topLevelFiles: [],
    topLevelDirectories: [],
    markers: [],
    packageJson: null,
    readme: null,
    existingDocs: [],
    existingAgentsMd: false,
    opencodeConfigPaths: [],
    existingAgentFiles: [],
    existingCommandFiles: [],
    existingSkillFiles: [],
    sourceFiles: [],
    pythonDependencies: [],
    pythonToolSections: [],
    warnings: [],
    ...overrides,
  }
}

/** Construye un `PackageJsonData` completo a partir de un subconjunto. */
export function makePackageJson(
  overrides: Partial<PackageJsonData> = {},
): PackageJsonData {
  return { ...DEFAULT_PACKAGE_JSON, ...overrides }
}
