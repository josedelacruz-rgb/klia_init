import { describe, expect, test } from "bun:test"
import type { PlannedFile } from "../../src/types.js"
import {
  validateFiles,
  validateFrontmatter,
  validateJsonc,
  validateMarkdown,
} from "../../src/validators.js"

function planned(path: string, content: string): PlannedFile {
  return { path, description: "prueba", content, exists: false, mode: "create" }
}

const VALID_AGENT = `---
description: "Diseña cambios del proyecto"
mode: subagent
steps: 12
permissions:
  - action: edit
    resource: "*"
    effect: ask
---

# Arquitecto

Contenido del agente.
`

describe("validateMarkdown", () => {
  test("acepta un documento correcto", () => {
    expect(validateMarkdown("docs/a.md", "# Título\n\nContenido real.\n")).toEqual([])
  })

  test("rechaza un documento vacío", () => {
    const issues = validateMarkdown("docs/a.md", "   \n")
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain("vacío")
  })

  test("exige un título de nivel 1", () => {
    const issues = validateMarkdown("docs/a.md", "## Solo nivel 2\n\nTexto.\n")
    expect(issues.some((issue) => issue.message.includes("nivel 1"))).toBe(true)
  })

  test("detecta bloques de código sin cerrar", () => {
    const issues = validateMarkdown("docs/a.md", "# T\n\n```bash\nnpm test\n")
    expect(issues.some((issue) => issue.message.includes("sin cerrar"))).toBe(true)
  })

  test("detecta marcadores sin resolver y pendientes", () => {
    const issues = validateMarkdown("docs/a.md", "# T\n\n{{nombre}}\n\nTODO pendiente\n")
    expect(issues.some((issue) => issue.level === "error" && issue.message.includes("{{...}}"))).toBe(
      true,
    )
    expect(issues.some((issue) => issue.level === "warning" && issue.message.includes("TODO"))).toBe(
      true,
    )
  })

  test("detecta secciones vacías", () => {
    const issues = validateMarkdown("docs/a.md", "# T\n\n## Vacía\n\n## Otra\n\nTexto.\n")
    expect(issues.some((issue) => issue.message.includes("Sección sin contenido"))).toBe(true)
  })

  test("valida el cuerpo después del frontmatter", () => {
    const issues = validateMarkdown(
      ".opencode/agents/x.md",
      "---\ndescription: x\nmode: all\n---\n\n# Título\n\nContenido.\n",
    )
    expect(issues).toEqual([])
  })
})

describe("validateJsonc", () => {
  test("acepta un objeto JSONC válido", () => {
    const content = '{\n  // comentario\n  "$schema": "https://opencode.ai/config.json",\n  "plugins": [],\n}\n'
    expect(validateJsonc("opencode.jsonc", content)).toEqual([])
  })

  test("rechaza JSONC no parseable", () => {
    const issues = validateJsonc("opencode.json", "{ roto")
    expect(issues[0]?.level).toBe("error")
  })

  test("rechaza configuraciones que no son objetos", () => {
    const issues = validateJsonc("opencode.json", "[]")
    expect(issues[0]?.message).toContain("objeto JSON")
  })

  test("detecta tipos incorrectos en claves conocidas", () => {
    const issues = validateJsonc(
      "opencode.json",
      '{"plugins": {}, "commands": [], "instructions": "AGENTS.md"}',
    )
    expect(issues).toHaveLength(3)
    expect(issues.every((issue) => issue.level === "error")).toBe(true)
  })
})

describe("validateFrontmatter", () => {
  test("acepta un agente válido", () => {
    expect(validateFrontmatter([planned(".opencode/agents/architect.md", VALID_AGENT)])).toEqual([])
  })

  test("detecta frontmatter ausente", () => {
    const issues = validateFrontmatter([planned(".opencode/agents/x.md", "# Sin frontmatter\n")])
    expect(issues[0]?.message).toContain("Falta el bloque de frontmatter")
  })

  test("detecta frontmatter sin cerrar", () => {
    const issues = validateFrontmatter([
      planned(".opencode/agents/x.md", "---\ndescription: x\nmode: all\n\n# T\n"),
    ])
    expect(issues[0]?.message).toContain("sin cerrar")
  })

  test("exige description y mode en agentes", () => {
    const issues = validateFrontmatter([
      planned(".opencode/agents/x.md", "---\ndescription: x\n---\n\n# T\n"),
    ])
    expect(issues.some((issue) => issue.message.includes("Falta `mode`"))).toBe(true)
  })

  test("rechaza un mode no permitido", () => {
    const issues = validateFrontmatter([
      planned(".opencode/agents/x.md", "---\ndescription: x\nmode: raro\n---\n\n# T\n"),
    ])
    expect(issues.some((issue) => issue.message.includes("mode"))).toBe(true)
  })

  test("rechaza claves de la versión 1", () => {
    const issues = validateFrontmatter([
      planned(".opencode/agents/x.md", "---\ndescription: x\nmode: all\ntools: {}\n---\n\n# T\n"),
    ])
    expect(issues.some((issue) => issue.message.includes("Campo V1"))).toBe(true)
  })

  test("rechaza permisos inválidos", () => {
    const issues = validateFrontmatter([
      planned(
        ".opencode/agents/x.md",
        "---\ndescription: x\nmode: all\npermissions:\n  - action: edit\n    resource: \"*\"\n    effect: quizas\n---\n\n# T\n",
      ),
    ])
    expect(issues.some((issue) => issue.message.includes("effect"))).toBe(true)
  })

  test("rechaza comandos con claves no permitidas", () => {
    const issues = validateFrontmatter([
      planned(".opencode/commands/x.md", "---\ndescription: x\nmode: all\n---\n\n# T\n"),
    ])
    expect(issues.some((issue) => issue.message.includes("no válida"))).toBe(true)
  })

  test("exige name y description en skills", () => {
    const issues = validateFrontmatter([
      planned(".opencode/skills/q/SKILL.md", "---\nname: Q\n---\n\n# Q\n"),
    ])
    expect(issues.some((issue) => issue.message.includes("description"))).toBe(true)
  })

  test("acepta skills válidas", () => {
    const content =
      "---\nname: Q\ndescription: \"Calidad\"\nmetadata:\n  opencode/autoinvoke: true\n---\n\n# Q\n"
    expect(validateFrontmatter([planned(".opencode/skills/q/SKILL.md", content)])).toEqual([])
  })
})

describe("validateFiles", () => {
  test("valida rutas dentro del proyecto", async () => {
    const issues = await validateFiles("/proyecto", [planned("docs/a.md", "# T\n\nTexto.\n")])
    expect(issues).toEqual([])
  })

  test("rechaza rutas que salen de la raíz", async () => {
    const issues = await validateFiles("/proyecto", [
      planned("../fuera.md", "# T\n\nTexto.\n"),
    ])
    expect(issues.some((issue) => issue.message.includes("sale de la raíz"))).toBe(true)
  })

  test("valida JSONC y Markdown del plan", async () => {
    const issues = await validateFiles("/proyecto", [
      planned("opencode.json", "{ roto"),
      planned("docs/a.md", "sin título\n"),
    ])
    expect(issues.some((issue) => issue.file === "opencode.json")).toBe(true)
    expect(issues.some((issue) => issue.file === "docs/a.md")).toBe(true)
  })
})
