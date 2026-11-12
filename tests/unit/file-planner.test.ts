import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { analyzeProject } from "../../src/project-analyzer.js"
import { detectProject } from "../../src/project-detector.js"
import { planProjectFiles } from "../../src/file-planner.js"
import { validateFrontmatter } from "../../src/validators.js"
import { copyFixtureToTemp, createTempDirectory, removeTempDirectory } from "../helpers/fs.js"

const tempDirectories: string[] = []

async function analyzeFixture(fixture: string) {
  const root = await copyFixtureToTemp(fixture)
  tempDirectories.push(root)
  const analysis = analyzeProject(await detectProject(root))
  return { root, analysis }
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map(removeTempDirectory))
})

const EXPECTED_FILES = [
  ".opencode/agents/architect.md",
  ".opencode/agents/reviewer.md",
  ".opencode/agents/tester.md",
  ".opencode/commands/audit.md",
  ".opencode/commands/release-check.md",
  ".opencode/skills/project-quality/SKILL.md",
  "AGENTS.md",
  "docs/architecture.md",
  "docs/development.md",
  "docs/rules.md",
  "docs/security.md",
  "docs/testing.md",
]

describe("planProjectFiles", () => {
  test("propone la estructura completa y ordenada", async () => {
    const { analysis } = await analyzeFixture("ts-project")
    const plan = await planProjectFiles(analysis)

    expect(plan.map((file) => file.path)).toEqual(EXPECTED_FILES)
    expect(plan.every((file) => file.mode === "create")).toBe(true)
    expect(plan.every((file) => file.exists === false)).toBe(true)
    expect(plan.every((file) => file.content.trim().length > 0)).toBe(true)
    expect(plan.every((file) => !file.content.includes("{{"))).toBe(true)
  })

  test("AGENTS.md contiene datos reales del proyecto", async () => {
    const { analysis } = await analyzeFixture("ts-project")
    const plan = await planProjectFiles(analysis)
    const agents = plan.find((file) => file.path === "AGENTS.md")

    expect(agents?.content).toContain("fixture-ts-app")
    expect(agents?.content).toContain("TypeScript")
    expect(agents?.content).toContain("Vitest")
    expect(agents?.content).toContain("`test`")
    expect(agents?.content).not.toContain("{{")
  })

  test("los agentes y comandos tienen frontmatter válido", async () => {
    const { analysis } = await analyzeFixture("ts-project")
    const plan = await planProjectFiles(analysis)

    expect(validateFrontmatter(plan)).toEqual([])
  })

  test("marca como existentes los archivos ya presentes", async () => {
    const { root, analysis } = await analyzeFixture("existing-config")
    await mkdir(path.join(root, "docs"), { recursive: true })
    await writeFile(path.join(root, "docs", "testing.md"), "# Pruebas propias\n", "utf8")

    const plan = await planProjectFiles(analysis)
    const agents = plan.find((file) => file.path === "AGENTS.md")
    const testing = plan.find((file) => file.path === "docs/testing.md")

    expect(agents?.exists).toBe(true)
    expect(agents?.mode).toBe("overwrite")
    expect(testing?.exists).toBe(true)
    expect(testing?.mode).toBe("overwrite")
  })

  test("solo propone opencode.json si existe y le falta $schema", async () => {
    const { analysis } = await analyzeFixture("existing-config")
    const plan = await planProjectFiles(analysis)
    const config = plan.find((file) => file.path === "opencode.json")

    expect(config).toBeDefined()
    expect(config?.content).toContain('"$schema": "https://opencode.ai/config.json"')
    expect(config?.content).toContain('"plugins": ["mi-plugin-local"]')
  })

  test("no propone configuración si el proyecto no tiene opencode.json", async () => {
    const { analysis } = await analyzeFixture("ts-project")
    const plan = await planProjectFiles(analysis)

    expect(plan.some((file) => file.path.startsWith("opencode."))).toBe(false)
  })

  test("no modifica una configuración que ya tiene $schema", async () => {
    const root = await createTempDirectory()
    tempDirectories.push(root)
    await writeFile(
      path.join(root, "opencode.jsonc"),
      '{\n  "$schema": "https://opencode.ai/config.json",\n  "plugins": []\n}\n',
      "utf8",
    )
    const analysis = analyzeProject(await detectProject(root))

    const plan = await planProjectFiles(analysis)

    expect(plan.some((file) => file.path === "opencode.jsonc")).toBe(false)
  })

  test("genera documentación específica por tipo de proyecto", async () => {
    const { analysis } = await analyzeFixture("existing-config")
    const plan = await planProjectFiles(analysis)
    const development = plan.find((file) => file.path === "docs/development.md")?.content ?? ""
    const testing = plan.find((file) => file.path === "docs/testing.md")?.content ?? ""

    expect(development).toContain("bun install")
    expect(testing).toContain("`test`")
  })
})
