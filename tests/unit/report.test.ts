import { describe, expect, test } from "bun:test"
import type { FileResult, ProjectAnalysis } from "../../src/types.js"
import { buildReport, formatPlan, formatReport } from "../../src/report.js"
import { makeDetected, makePackageJson } from "../helpers/detected.js"
import { analyzeProject } from "../../src/project-analyzer.js"

function analysis(): ProjectAnalysis {
  return analyzeProject(
    makeDetected({
      root: "/tmp/demo",
      markers: ["package.json"],
      packageJson: makePackageJson({
        name: "demo",
        description: "Proyecto demo",
        scripts: { test: "vitest run" },
        devDependencies: { vitest: "^3" },
      }),
      sourceFiles: ["src/index.ts"],
    }),
  )
}

const FILES: readonly FileResult[] = [
  { path: "AGENTS.md", action: "created" },
  { path: "docs/testing.md", action: "updated", backup: "docs/testing.md.bak-20260101-120000" },
  { path: "docs/security.md", action: "skipped" },
]

describe("buildReport", () => {
  test("es correcto sin errores ni fallos", () => {
    const report = buildReport(analysis(), FILES, [
      { file: "docs/a.md", level: "warning", message: "aviso" },
    ])
    expect(report.ok).toBe(true)
    expect(report.files).toBe(FILES)
  })

  test("falla con errores de validación", () => {
    const report = buildReport(analysis(), FILES, [
      { file: "docs/a.md", level: "error", message: "error" },
    ])
    expect(report.ok).toBe(false)
  })

  test("falla si algún archivo no se pudo escribir", () => {
    const report = buildReport(
      analysis(),
      [{ path: "AGENTS.md", action: "failed", error: "permiso denegado" }],
      [],
    )
    expect(report.ok).toBe(false)
  })
})

describe("formatPlan", () => {
  test("separa archivos nuevos y existentes y pide autorización", () => {
    const plan = formatPlan(analysis(), [
      {
        path: "AGENTS.md",
        description: "Instrucciones",
        content: "# AGENTS.md\n",
        exists: true,
        mode: "overwrite",
      },
      {
        path: "docs/rules.md",
        description: "Reglas",
        content: "# Reglas\n",
        exists: false,
        mode: "create",
      },
    ])

    expect(plan).toContain("Nuevos: **1**. Existentes: **1**.")
    expect(plan).toContain("`AGENTS.md` — Instrucciones")
    expect(plan).toContain("Se actualizará solo si lo autorizas")
    expect(plan).toContain("No se ha escrito ningún archivo")
  })

  test("incluye las observaciones del análisis", () => {
    const plan = formatPlan(analysis(), [])
    expect(plan).toContain("## Proyecto detectado")
    expect(plan).toContain("demo")
  })
})

describe("formatReport", () => {
  test("resume archivos, copias de seguridad y validaciones", () => {
    const report = buildReport(analysis(), FILES, [
      { file: "docs/a.md", level: "warning", message: "sección vacía" },
    ])

    const text = formatReport(report)

    expect(text).toContain("Creados: **1**. Actualizados: **1**. Omitidos: **1**. Fallidos: **0**.")
    expect(text).toContain("Copia de seguridad: `docs/testing.md.bak-20260101-120000`")
    expect(text).toContain("### Omitidos")
    expect(text).toContain("### Avisos")
    expect(text).toContain("Correcto: 0 errores, 1 avisos.")
  })

  test("informa de errores y archivos fallidos", () => {
    const report = buildReport(
      analysis(),
      [{ path: "AGENTS.md", action: "failed", error: "permiso denegado" }],
      [{ file: "AGENTS.md", level: "error", message: "contenido inválido" }],
    )

    const text = formatReport(report)

    expect(text).toContain("### Fallidos")
    expect(text).toContain("permiso denegado")
    expect(text).toContain("### Errores")
    expect(text).toContain("Con incidencias: 1 errores, 0 avisos.")
  })

  test("indica cuando no hay incidencias", () => {
    const report = buildReport(analysis(), FILES, [])
    expect(formatReport(report)).toContain("Sin incidencias")
  })
})
