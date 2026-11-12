import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { detectProject, resolveProjectRoot } from "../../src/project-detector.js"
import {
  copyFixtureToTemp,
  createTempDirectory,
  removeTempDirectory,
} from "../helpers/fs.js"

const tempDirectories: string[] = []

async function trackTemp(prefix?: string): Promise<string> {
  const directory = await createTempDirectory(prefix)
  tempDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map(removeTempDirectory))
})

describe("resolveProjectRoot", () => {
  test("normaliza una raíz existente", async () => {
    const root = await trackTemp()
    expect(await resolveProjectRoot(root)).toBe(path.resolve(root))
  })

  test("rechaza un directorio inexistente", async () => {
    const root = path.join(await trackTemp(), "no-existe")
    await expect(resolveProjectRoot(root)).rejects.toThrow(/no es un directorio/)
  })

  test("rechaza un archivo", async () => {
    const root = await trackTemp()
    await writeFile(path.join(root, "archivo.txt"), "x", "utf8")
    await expect(resolveProjectRoot(path.join(root, "archivo.txt"))).rejects.toThrow(
      /no es un directorio/,
    )
  })
})

describe("detectProject", () => {
  test("detecta un proyecto TypeScript pequeño", async () => {
    const root = await copyFixtureToTemp("ts-project")
    tempDirectories.push(root)

    const detected = await detectProject(root)

    expect(detected.root).toBe(path.resolve(root))
    expect(detected.markers).toEqual(["package.json", "tsconfig.json", "README.md"])
    expect(detected.packageJson?.name).toBe("fixture-ts-app")
    expect(detected.packageJson?.scripts["test"]).toBe("vitest run")
    expect(detected.packageJson?.devDependencies["vitest"]).toBe("^3.0.0")
    expect(detected.readme).toBe("README.md")
    expect(detected.topLevelDirectories).toContain("src")
    expect(detected.sourceFiles).toContain("src/index.ts")
    expect(detected.existingAgentsMd).toBe(false)
    expect(detected.opencodeConfigPaths).toEqual([])
    expect(detected.warnings).toEqual([])
  })

  test("ignora dependencias, artefactos y metadatos VCS", async () => {
    const root = await trackTemp()
    await writeFile(path.join(root, "index.ts"), "export {}\n", "utf8")
    for (const ignored of ["node_modules", "dist", "build", "coverage", ".git"]) {
      await mkdir(path.join(root, ignored), { recursive: true })
      await writeFile(path.join(root, ignored, "ignorado.ts"), "export {}\n", "utf8")
    }

    const detected = await detectProject(root)

    expect(detected.sourceFiles).toEqual(["index.ts"])
    expect(detected.topLevelDirectories).toEqual(
      [".git", "build", "coverage", "dist", "node_modules"].sort((a, b) => a.localeCompare(b)),
    )
  })

  test("detecta configuración y archivos de OpenCode existentes", async () => {
    const root = await trackTemp()
    await writeFile(path.join(root, "opencode.jsonc"), "{}", "utf8")
    await mkdir(path.join(root, ".opencode", "agents"), { recursive: true })
    await writeFile(path.join(root, ".opencode", "agents", "x.md"), "# X\n", "utf8")
    await mkdir(path.join(root, ".opencode", "commands"), { recursive: true })
    await writeFile(path.join(root, ".opencode", "commands", "y.md"), "# Y\n", "utf8")
    await mkdir(path.join(root, ".opencode", "skills", "q"), { recursive: true })
    await writeFile(path.join(root, ".opencode", "skills", "q", "SKILL.md"), "# Q\n", "utf8")
    await mkdir(path.join(root, "docs"), { recursive: true })
    await writeFile(path.join(root, "docs", "guia.md"), "# Guía\n", "utf8")
    await writeFile(path.join(root, "docs", "nota.txt"), "x", "utf8")

    const detected = await detectProject(root)

    expect(detected.opencodeConfigPaths).toEqual(["opencode.jsonc"])
    expect(detected.existingAgentFiles).toEqual([".opencode/agents/x.md"])
    expect(detected.existingCommandFiles).toEqual([".opencode/commands/y.md"])
    expect(detected.existingSkillFiles).toEqual([".opencode/skills/q/SKILL.md"])
    expect(detected.existingDocs).toEqual(["docs/guia.md"])
  })

  test("marca AGENTS.md existente sin distinguir mayúsculas", async () => {
    const root = await trackTemp()
    await writeFile(path.join(root, "Agents.MD"), "# Propio\n", "utf8")

    const detected = await detectProject(root)

    expect(detected.existingAgentsMd).toBe(true)
    expect(detected.markers).toContain("Agents.MD")
  })

  test("extrae dependencias y herramientas de Python", async () => {
    const root = await trackTemp()
    await writeFile(
      path.join(root, "requirements.txt"),
      "# pruebas\npytest>=8\nrequests==2.31\n-r otros.txt\n",
      "utf8",
    )
    await writeFile(
      path.join(root, "pyproject.toml"),
      '[project]\nname = "demo"\ndependencies = ["fastapi>=0.110", "pydantic"]\n\n[tool.ruff]\nline-length = 100\n',
      "utf8",
    )
    await writeFile(path.join(root, "app.py"), "print('hola')\n", "utf8")

    const detected = await detectProject(root)

    expect(detected.pythonDependencies).toEqual(["fastapi", "pydantic", "pytest", "requests"])
    expect(detected.pythonToolSections).toEqual(["ruff"])
    expect(detected.sourceFiles).toEqual(["app.py"])
  })

  test("advierte si package.json no es válido", async () => {
    const root = await trackTemp()
    await writeFile(path.join(root, "package.json"), "{ roto", "utf8")

    const detected = await detectProject(root)

    expect(detected.packageJson).toBeNull()
    expect(detected.warnings.some((warning) => warning.includes("package.json"))).toBe(true)
  })

  test("advierte si package.json no contiene un objeto", async () => {
    const root = await trackTemp()
    await writeFile(path.join(root, "package.json"), "[]", "utf8")

    const detected = await detectProject(root)

    expect(detected.packageJson).toBeNull()
    expect(detected.warnings.some((warning) => warning.includes("objeto JSON"))).toBe(true)
  })

  test("analiza un proyecto vacío sin fallar", async () => {
    const root = await copyFixtureToTemp("empty-project")
    tempDirectories.push(root)

    const detected = await detectProject(root)

    expect(detected.packageJson).toBeNull()
    expect(detected.markers).toEqual([])
    expect(detected.sourceFiles).toEqual([])
    expect(detected.existingDocs).toEqual([])
  })

  test("normaliza workspaces y bin de package.json", async () => {
    const root = await trackTemp()
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "mono",
        bin: { mono: "dist/cli.js" },
        workspaces: { packages: ["packages/*"] },
      }),
      "utf8",
    )

    const detected = await detectProject(root)

    expect(detected.packageJson?.bin).toEqual({ mono: "dist/cli.js" })
    expect(detected.packageJson?.workspaces).toEqual(["packages/*"])
  })
})
