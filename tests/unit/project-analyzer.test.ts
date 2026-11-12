import { describe, expect, test } from "bun:test"
import path from "node:path"
import { analyzeProject } from "../../src/project-analyzer.js"
import { makeDetected, makePackageJson } from "../helpers/detected.js"

const ROOT = path.join("/tmp", "mi-proyecto")

describe("analyzeProject", () => {
  test("analiza una aplicación TypeScript con vitest y eslint", () => {
    const analysis = analyzeProject(
      makeDetected({
        root: ROOT,
        markers: ["package.json", "tsconfig.json"],
        topLevelDirectories: ["src", "docs", "tests"],
        packageJson: makePackageJson({
          name: "demo",
          description: "Aplicación de ejemplo",
          scripts: { build: "tsc -p tsconfig.json", test: "vitest run", lint: "eslint ." },
          devDependencies: { typescript: "^5", vitest: "^3", eslint: "^9" },
        }),
        sourceFiles: ["src/index.ts"],
      }),
    )

    expect(analysis.name).toBe("demo")
    expect(analysis.description).toBe("Aplicación de ejemplo")
    expect(analysis.languages).toEqual(["TypeScript"])
    expect(analysis.kinds).toEqual(["library"])
    expect(analysis.testTools).toEqual(["Vitest"])
    expect(analysis.qualityTools).toEqual(["ESLint", "TypeScript (tsc)"])
    expect(analysis.entrypoints).toEqual(["src/index.ts"])
    expect(analysis.directories.map((directory) => directory.path)).toEqual([
      "src",
      "docs",
      "tests",
    ])
    expect(analysis.warnings).toEqual([])
  })

  test("detecta un plugin de OpenCode", () => {
    const analysis = analyzeProject(
      makeDetected({
        root: ROOT,
        markers: ["package.json"],
        packageJson: makePackageJson({
          name: "plugin",
          dependencies: { "@opencode/plugin": "2.2.5" },
        }),
        topLevelDirectories: [".opencode"],
        sourceFiles: ["src/index.ts"],
      }),
    )

    expect(analysis.kinds).toContain("opencode-plugin")
    expect(analysis.kinds).toContain("opencode-project")
    expect(analysis.frameworks).toEqual([])
  })

  test("detecta monorepo por workspaces y marcadores", () => {
    const analysis = analyzeProject(
      makeDetected({
        root: ROOT,
        markers: ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml"],
        packageJson: makePackageJson({ name: "mono", workspaces: ["packages/*"] }),
        topLevelDirectories: ["packages"],
        sourceFiles: ["packages/a/index.ts"],
      }),
    )

    expect(analysis.kinds).toContain("monorepo")
    expect(analysis.packageManager).toBe("pnpm")
  })

  test("detecta CLI por el campo bin", () => {
    const analysis = analyzeProject(
      makeDetected({
        root: ROOT,
        markers: ["package.json"],
        packageJson: makePackageJson({ name: "cli", bin: { cli: "dist/cli.js" } }),
        sourceFiles: ["src/index.ts"],
      }),
    )

    expect(analysis.kinds).toContain("cli")
    expect(analysis.entrypoints).toContain("dist/cli.js")
  })

  test("detecta API web y escritorio por dependencias", () => {
    const analysis = analyzeProject(
      makeDetected({
        root: ROOT,
        markers: ["package.json"],
        packageJson: makePackageJson({
          name: "full",
          dependencies: { express: "^5", react: "^19", electron: "^33" },
        }),
      }),
    )

    expect(analysis.frameworks).toEqual(["React", "Express", "Electron"])
    expect(analysis.kinds).toEqual(expect.arrayContaining(["web", "api", "desktop"]))
  })

  test("detecta Python con pytest y ruff", () => {
    const analysis = analyzeProject(
      makeDetected({
        root: ROOT,
        markers: ["pyproject.toml", "requirements.txt"],
        topLevelFiles: ["pyproject.toml", "requirements.txt", "main.py"],
        pythonDependencies: ["fastapi", "pytest", "ruff"],
        pythonToolSections: ["pytest", "ruff"],
        sourceFiles: ["main.py"],
      }),
    )

    expect(analysis.languages).toEqual(["Python"])
    expect(analysis.frameworks).toEqual(["FastAPI"])
    expect(analysis.testTools).toEqual(["pytest"])
    expect(analysis.qualityTools).toEqual(["Ruff"])
    expect(analysis.kinds).toContain("api")
  })

  test("marca unknown cuando no hay datos suficientes", () => {
    const analysis = analyzeProject(
      makeDetected({ root: path.join("/tmp", "vacio"), topLevelFiles: [".gitkeep"] }),
    )

    expect(analysis.kinds).toEqual(["unknown"])
    expect(analysis.name).toBe("vacio")
    expect(analysis.description).toBeNull()
    expect(analysis.warnings.length).toBeGreaterThan(0)
  })

  test("detecta herramientas de prueba y calidad adicionales", () => {
    const analysis = analyzeProject(
      makeDetected({
        root: ROOT,
        markers: ["package.json", "biome.json", "bun.lock"],
        packageJson: makePackageJson({
          name: "tools",
          scripts: { test: "bun test", check: "biome check ." },
          devDependencies: {
            "@biomejs/biome": "^1",
            "@playwright/test": "^1",
            jest: "^29",
            prettier: "^3",
          },
        }),
        sourceFiles: ["src/index.ts"],
      }),
    )

    expect(analysis.testTools).toEqual(expect.arrayContaining(["Jest", "Playwright", "Bun test"]))
    expect(analysis.qualityTools).toEqual(
      expect.arrayContaining(["Biome", "Prettier"]),
    )
    expect(analysis.packageManager).toBe("bun")
  })

  test("usa la configuración de OpenCode como evidencia del tipo de proyecto", () => {
    const analysis = analyzeProject(
      makeDetected({
        root: ROOT,
        markers: ["package.json", "opencode.json"],
        packageJson: makePackageJson({ name: "config" }),
        opencodeConfigPaths: ["opencode.json"],
        existingAgentFiles: [".opencode/agents/x.md"],
      }),
    )

    expect(analysis.kinds).toContain("opencode-project")
    expect(analysis.opencodeConfigPaths).toEqual(["opencode.json"])
    expect(analysis.existingAgentFiles).toEqual([".opencode/agents/x.md"])
  })

  test("conserva dependencias ordenadas y scripts", () => {
    const analysis = analyzeProject(
      makeDetected({
        root: ROOT,
        markers: ["package.json"],
        packageJson: makePackageJson({
          name: "deps",
          scripts: { start: "node index.js" },
          dependencies: { zod: "^3", express: "^5" },
          devDependencies: { typescript: "^5" },
        }),
      }),
    )

    expect(analysis.runtimeDependencies).toEqual(["express", "zod"])
    expect(analysis.devDependencies).toEqual(["typescript"])
    expect(analysis.scripts).toEqual({ start: "node index.js" })
  })
})
