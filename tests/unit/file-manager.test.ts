import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { PlannedFile } from "../../src/types.js"
import {
  MANAGED_BLOCK_END,
  MANAGED_BLOCK_START,
  applyPlan,
  mergeExistingContent,
} from "../../src/file-manager.js"
import { createTempDirectory, removeTempDirectory } from "../helpers/fs.js"
import { parseJsonc } from "../../src/jsonc.js"

function planned(relativePath: string, content: string): PlannedFile {
  return { path: relativePath, description: "prueba", content, exists: false, mode: "create" }
}

describe("mergeExistingContent", () => {
  test("conserva el contenido del usuario y añade el bloque gestionado", () => {
    const merged = mergeExistingContent(
      "AGENTS.md",
      "# Reglas del equipo\n\nContenido propio.\n",
      "# AGENTS.md\n\nGenerado.\n",
    )
    expect(merged).toContain("# Reglas del equipo\n\nContenido propio.")
    expect(merged).toContain(MANAGED_BLOCK_START)
    expect(merged).toContain("Generado.")
    expect(merged).toContain(MANAGED_BLOCK_END)
    expect(merged.indexOf("# Reglas del equipo")).toBeLessThan(merged.indexOf(MANAGED_BLOCK_START))
  })

  test("reemplaza solo el bloque gestionado en actualizaciones posteriores", () => {
    const first = mergeExistingContent("AGENTS.md", "# Propias\n\nTexto.\n", "# AGENTS.md\n\nV1\n")
    const second = mergeExistingContent("AGENTS.md", first, "# AGENTS.md\n\nV2\n")
    expect(second).toContain("# Propias")
    expect(second).toContain("V2")
    expect(second).not.toContain("V1")
    expect(second.match(new RegExp(MANAGED_BLOCK_START, "g"))).toHaveLength(1)
  })

  test("rechaza marcadores de bloque incompletos", () => {
    expect(() =>
      mergeExistingContent("AGENTS.md", `# Propio\n${MANAGED_BLOCK_START}\n`, "# AGENTS.md\n"),
    ).toThrowError(/Marcadores/)
  })

  test("fusiona JSONC conservando claves existentes", () => {
    const merged = mergeExistingContent(
      "opencode.json",
      '{"plugins": ["a"], "instructions": ["AGENTS.md"]}',
      '{"$schema": "https://opencode.ai/config.json"}',
    )
    expect(JSON.parse(merged)).toEqual({
      plugins: ["a"],
      instructions: ["AGENTS.md"],
      $schema: "https://opencode.ai/config.json",
    })
  })

  test("conserva literalmente el archivo si el plan lo respeta", () => {
    const existing = '{\n  // comentario\n  "plugins": []\n}\n'
    const plan = '{\n  "$schema": "x",\n  // comentario\n  "plugins": []\n}\n'
    expect(mergeExistingContent("opencode.jsonc", existing, plan)).toBe(plan)
  })

  test("los archivos que no son documentación ni configuración se reemplazan", () => {
    expect(mergeExistingContent("src/index.ts", "viejo", "nuevo")).toBe("nuevo")
  })
})

describe("applyPlan", () => {
  let root: string

  beforeEach(async () => {
    root = await createTempDirectory()
  })

  afterEach(async () => {
    await removeTempDirectory(root)
  })

  test("crea archivos nuevos, incluidos directorios anidados", async () => {
    const results = await applyPlan(
      [
        planned("AGENTS.md", "# AGENTS.md\n\nContenido.\n"),
        planned(".opencode/agents/architect.md", "# Arquitecto\n"),
      ],
      { root, approvedOverwrite: [] },
    )

    expect(results).toEqual([
      { path: "AGENTS.md", action: "created" },
      { path: ".opencode/agents/architect.md", action: "created" },
    ])
    expect(await readFile(path.join(root, ".opencode/agents/architect.md"), "utf8")).toBe(
      "# Arquitecto\n",
    )
  })

  test("omite archivos existentes sin autorización y no los modifica", async () => {
    const original = "# Reglas propias\n\nNo tocar.\n"
    await writeFile(path.join(root, "AGENTS.md"), original, "utf8")

    const results = await applyPlan([planned("AGENTS.md", "# AGENTS.md\n\nNuevo.\n")], {
      root,
      approvedOverwrite: [],
    })

    expect(results).toEqual([{ path: "AGENTS.md", action: "skipped" }])
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toBe(original)
    expect((await readdir(root)).some((file) => file.includes(".bak-"))).toBe(false)
  })

  test("actualiza con autorización y crea copia de seguridad", async () => {
    const original = "# Reglas propias\n\nContenido del usuario.\n"
    await writeFile(path.join(root, "AGENTS.md"), original, "utf8")

    const results = await applyPlan([planned("AGENTS.md", "# AGENTS.md\n\nGenerado.\n")], {
      root,
      approvedOverwrite: ["AGENTS.md"],
    })

    expect(results).toHaveLength(1)
    expect(results[0]?.action).toBe("updated")
    const backup = results[0]?.backup
    expect(backup).toMatch(/^AGENTS\.md\.bak-\d{8}-\d{6}/)
    expect(await readFile(path.join(root, backup ?? ""), "utf8")).toBe(original)

    const updated = await readFile(path.join(root, "AGENTS.md"), "utf8")
    expect(updated).toContain("Contenido del usuario.")
    expect(updated).toContain(MANAGED_BLOCK_START)
  })

  test("no crea copia si la fusión no cambia el archivo", async () => {
    const existing = `# Propias\n\n${MANAGED_BLOCK_START}\n# AGENTS.md\n\nGenerado.\n${MANAGED_BLOCK_END}\n`
    await writeFile(path.join(root, "AGENTS.md"), existing, "utf8")

    const results = await applyPlan(
      [planned("AGENTS.md", "# AGENTS.md\n\nGenerado.\n")],
      { root, approvedOverwrite: ["AGENTS.md"] },
    )

    expect(results).toEqual([{ path: "AGENTS.md", action: "skipped" }])
    expect((await readdir(root)).some((file) => file.includes(".bak-"))).toBe(false)
  })

  test("fusiona opencode.json autorizado conservando claves y comentarios", async () => {
    const existing = '{\n  // propio\n  "plugins": ["mi-plugin"]\n}\n'
    await writeFile(path.join(root, "opencode.json"), existing, "utf8")

    const plan = '{\n  "$schema": "https://opencode.ai/config.json",\n  // propio\n  "plugins": ["mi-plugin"]\n}\n'
    const results = await applyPlan([planned("opencode.json", plan)], {
      root,
      approvedOverwrite: ["opencode.json"],
    })

    expect(results[0]?.action).toBe("updated")
    const updated = await readFile(path.join(root, "opencode.json"), "utf8")
    expect(updated).toContain("// propio")
    expect(parseJsonc(updated)).toEqual({
      $schema: "https://opencode.ai/config.json",
      plugins: ["mi-plugin"],
    })
  })

  test("falla si el contenido está vacío", async () => {
    const results = await applyPlan([planned("docs/a.md", "   \n")], {
      root,
      approvedOverwrite: [],
    })
    expect(results[0]?.action).toBe("failed")
    expect(results[0]?.error).toContain("vacío")
  })

  test("falla ante rutas absolutas o que salen del proyecto", async () => {
    const absolute = path.join(root, "fuera.md")
    const results = await applyPlan(
      [planned(absolute, "# T\n"), planned("../fuera.md", "# T\n")],
      { root, approvedOverwrite: [] },
    )
    expect(results.map((result) => result.action)).toEqual(["failed", "failed"])
  })

  test("las rutas con separadores de Windows se normalizan", async () => {
    const results = await applyPlan([planned("docs\\architecture.md", "# T\n")], {
      root,
      approvedOverwrite: [],
    })
    expect(results).toEqual([{ path: "docs\\architecture.md", action: "created" }])
    expect(await readFile(path.join(root, "docs/architecture.md"), "utf8")).toBe("# T\n")
  })

  test("continúa aplicando el resto del plan si un archivo falla", async () => {
    await mkdir(path.join(root, "docs"), { recursive: true })
    const results = await applyPlan(
      [planned("../malo.md", "# T\n"), planned("docs/ok.md", "# Ok\n")],
      { root, approvedOverwrite: [] },
    )
    expect(results.map((result) => result.action)).toEqual(["failed", "created"])
  })
})
