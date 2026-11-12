import { afterEach, describe, expect, test } from "bun:test"
import { readFile, readdir, stat } from "node:fs/promises"
import path from "node:path"
import { analyzeProject } from "../../src/project-analyzer.js"
import { detectProject } from "../../src/project-detector.js"
import { planProjectFiles } from "../../src/file-planner.js"
import { MANAGED_BLOCK_START, applyPlan } from "../../src/file-manager.js"
import { validateFiles } from "../../src/validators.js"
import { buildReport } from "../../src/report.js"
import { parseJsonc } from "../../src/jsonc.js"
import type { DetectedProject, ProjectAnalysis } from "../../src/types.js"
import {
  copyFixtureToTemp,
  listFiles,
  removeTempDirectory,
} from "../helpers/fs.js"

const tempDirectories: string[] = []

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map(removeTempDirectory))
})

async function loadFixture(
  fixture: string,
): Promise<{ root: string; analysis: ProjectAnalysis; detected: DetectedProject }> {
  const root = await copyFixtureToTemp(fixture)
  tempDirectories.push(root)
  const detected = await detectProject(root)
  const analysis = analyzeProject(detected)
  return { root, analysis, detected }
}

async function exists(target: string): Promise<boolean> {
  return (await stat(target).catch(() => null)) !== null
}

describe("integración: proyecto vacío", () => {
  test("genera la estructura completa sin datos previos", async () => {
    const { root, analysis } = await loadFixture("empty-project")

    const plan = await planProjectFiles(analysis)
    const files = await applyPlan(plan, { root, approvedOverwrite: [] })
    const validations = await validateFiles(root, plan)
    const report = buildReport(analysis, files, validations)

    expect(analysis.kinds).toEqual(["unknown"])
    expect(plan).toHaveLength(12)
    expect(files.every((file) => file.action === "created")).toBe(true)
    expect(validations.filter((issue) => issue.level === "error")).toEqual([])
    expect(report.ok).toBe(true)
    expect(await exists(path.join(root, "AGENTS.md"))).toBe(true)
    expect(await exists(path.join(root, "docs/architecture.md"))).toBe(true)
    expect(await exists(path.join(root, ".opencode/agents/architect.md"))).toBe(true)
    expect(await exists(path.join(root, ".opencode/commands/audit.md"))).toBe(true)
    expect(await exists(path.join(root, ".opencode/skills/project-quality/SKILL.md"))).toBe(true)
    expect(await exists(path.join(root, "opencode.json"))).toBe(false)
  })
})

describe("integración: proyecto TypeScript pequeño", () => {
  test("genera documentación con información real del proyecto", async () => {
    const { root, analysis } = await loadFixture("ts-project")

    const plan = await planProjectFiles(analysis)
    const files = await applyPlan(plan, { root, approvedOverwrite: [] })
    const validations = await validateFiles(root, plan)
    const report = buildReport(analysis, files, validations)

    const agentsMd = await readFile(path.join(root, "AGENTS.md"), "utf8")
    const testing = await readFile(path.join(root, "docs/testing.md"), "utf8")

    expect(analysis.languages).toEqual(["TypeScript"])
    expect(analysis.testTools).toEqual(["Vitest"])
    expect(agentsMd).toContain("fixture-ts-app")
    expect(agentsMd).toContain("TypeScript")
    expect(testing).toContain("Vitest")
    expect(validations.filter((issue) => issue.level === "error")).toEqual([])
    expect(report.ok).toBe(true)

    const written = await listFiles(root)
    expect(written).toContain("AGENTS.md")
    expect(written).toContain(".opencode/agents/reviewer.md")
    expect(written).toContain(".opencode/commands/release-check.md")
  })
})

describe("integración: proyecto con AGENTS.md y opencode.json existentes", () => {
  test("no destruye los archivos existentes sin autorización", async () => {
    const { root, analysis } = await loadFixture("existing-config")
    const agentsPath = path.join(root, "AGENTS.md")
    const configPath = path.join(root, "opencode.json")
    const docsPath = path.join(root, "docs/architecture.md")
    const originalAgents = await readFile(agentsPath, "utf8")
    const originalConfig = await readFile(configPath, "utf8")
    const originalDocs = await readFile(docsPath, "utf8")

    const plan = await planProjectFiles(analysis)
    const files = await applyPlan(plan, { root, approvedOverwrite: [] })

    const skipped = files.filter((file) => file.action === "skipped").map((file) => file.path)
    expect(skipped).toEqual(
      expect.arrayContaining(["AGENTS.md", "opencode.json", "docs/architecture.md"]),
    )
    expect(await readFile(agentsPath, "utf8")).toBe(originalAgents)
    expect(await readFile(configPath, "utf8")).toBe(originalConfig)
    expect(await readFile(docsPath, "utf8")).toBe(originalDocs)

    const allFiles = await readdir(root)
    expect(allFiles.some((file) => file.includes(".bak-"))).toBe(false)
  })

  test("actualiza con autorización, fusiona y crea copias de seguridad", async () => {
    const { root, analysis } = await loadFixture("existing-config")
    const agentsPath = path.join(root, "AGENTS.md")
    const configPath = path.join(root, "opencode.json")
    const docsPath = path.join(root, "docs/architecture.md")
    const originalAgents = await readFile(agentsPath, "utf8")
    const originalConfig = await readFile(configPath, "utf8")
    const originalDocs = await readFile(docsPath, "utf8")

    const plan = await planProjectFiles(analysis)
    const files = await applyPlan(plan, {
      root,
      approvedOverwrite: ["AGENTS.md", "opencode.json", "docs/architecture.md"],
    })
    const validations = await validateFiles(root, plan)
    const report = buildReport(analysis, files, validations)

    const byPath = new Map(files.map((file) => [file.path, file]))
    expect(byPath.get("AGENTS.md")?.action).toBe("updated")
    expect(byPath.get("opencode.json")?.action).toBe("updated")
    expect(byPath.get("docs/architecture.md")?.action).toBe("updated")

    const updatedAgents = await readFile(agentsPath, "utf8")
    expect(updatedAgents).toContain("Contenido propio del usuario")
    expect(updatedAgents).toContain(MANAGED_BLOCK_START)
    expect(updatedAgents).toContain("fixture-existing")

    const updatedDocs = await readFile(docsPath, "utf8")
    expect(updatedDocs).toContain("Notas del usuario sobre la arquitectura real")
    expect(updatedDocs).toContain(MANAGED_BLOCK_START)

    const updatedConfig = await readFile(configPath, "utf8")
    expect(updatedConfig).toContain("// Configuración existente del usuario")
    expect(parseJsonc(updatedConfig)).toEqual({
      $schema: "https://opencode.ai/config.json",
      plugins: ["mi-plugin-local"],
      instructions: ["AGENTS.md"],
    })

    const backups = (await listFiles(root)).filter((file) => file.includes(".bak-"))
    expect(backups).toHaveLength(3)

    const backupOfAgents = backups.find((file) => file.startsWith("AGENTS.md.bak-"))
    expect(backupOfAgents).toBeDefined()
    expect(await readFile(path.join(root, backupOfAgents ?? ""), "utf8")).toBe(originalAgents)

    const backupOfConfig = backups.find((file) => file.startsWith("opencode.json.bak-"))
    expect(await readFile(path.join(root, backupOfConfig ?? ""), "utf8")).toBe(originalConfig)

    const backupOfDocs = backups.find((file) => file.startsWith("docs/architecture.md.bak-"))
    expect(await readFile(path.join(root, backupOfDocs ?? ""), "utf8")).toBe(originalDocs)

    expect(validations.filter((issue) => issue.level === "error")).toEqual([])
    expect(report.ok).toBe(true)
  })

  test("una segunda ejecución autorizada es idempotente", async () => {
    const { root, analysis } = await loadFixture("existing-config")
    const approvedOverwrite = ["AGENTS.md", "opencode.json", "docs/architecture.md"]

    const plan = await planProjectFiles(analysis)
    await applyPlan(plan, { root, approvedOverwrite })
    const agentsAfterFirst = await readFile(path.join(root, "AGENTS.md"), "utf8")
    const configAfterFirst = await readFile(path.join(root, "opencode.json"), "utf8")

    const second = await applyPlan(plan, { root, approvedOverwrite })
    const secondSkipped = second
      .filter((file) => file.action === "skipped")
      .map((file) => file.path)

    expect(secondSkipped).toEqual(
      expect.arrayContaining(["AGENTS.md", "opencode.json", "docs/architecture.md"]),
    )
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toBe(agentsAfterFirst)
    expect(await readFile(path.join(root, "opencode.json"), "utf8")).toBe(configAfterFirst)
    expect((await listFiles(root)).filter((file) => file.includes(".bak-"))).toHaveLength(3)
  })
})
