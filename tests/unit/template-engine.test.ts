import { describe, expect, test } from "bun:test"
import {
  bulletList,
  code,
  inlineList,
  insertJsonSchema,
  joinSections,
  markdownTable,
  renderTemplate,
} from "../../src/template-engine.js"

describe("renderTemplate", () => {
  test("sustituye marcadores conocidos y conserva los desconocidos", () => {
    expect(renderTemplate("Hola {{ nombre }} y {{otro}}", { nombre: "Ana" })).toBe(
      "Hola Ana y {{otro}}",
    )
  })

  test("admite claves con punto y guion", () => {
    const values = { "proyecto.nombre": "demo", "a-b": "x" }
    expect(renderTemplate("{{proyecto.nombre}}/{{a-b}}", values)).toBe("demo/x")
  })
})

describe("joinSections", () => {
  test("une secciones no vacías con una línea en blanco", () => {
    expect(joinSections(["uno", null, "  ", "dos"])).toBe("uno\n\ndos")
  })

  test("devuelve cadena vacía sin contenido", () => {
    expect(joinSections([null, undefined, ""])).toBe("")
  })
})

describe("bulletList", () => {
  test("crea una lista Markdown", () => {
    expect(bulletList(["a", "b"])).toBe("- a\n- b")
  })

  test("devuelve null si está vacía", () => {
    expect(bulletList([])).toBeNull()
  })
})

describe("code e inlineList", () => {
  test("code escapa comillas invertidas", () => {
    expect(code("a`b")).toBe("`a'b`")
  })

  test("inlineList devuelve null si está vacía", () => {
    expect(inlineList([])).toBeNull()
  })

  test("inlineList formatea cada valor como código", () => {
    expect(inlineList(["npm", "vitest"])).toBe("`npm`, `vitest`")
  })
})

describe("markdownTable", () => {
  test("devuelve null sin filas", () => {
    expect(markdownTable(["A"], [])).toBeNull()
  })

  test("escapa barras y saltos de línea en celdas", () => {
    const table = markdownTable(["A", "B"], [["a|b", "línea\nnueva"]])
    expect(table).toBe("| A | B |\n| --- | --- |\n| a\\|b | línea nueva |")
  })
})

describe("insertJsonSchema", () => {
  test("inserta $schema al inicio del objeto", () => {
    const result = insertJsonSchema('{\n  "plugins": []\n}', "https://opencode.ai/config.json")
    expect(result).toBe(
      '{\n  "$schema": "https://opencode.ai/config.json",\n  "plugins": []\n}',
    )
  })

  test("devuelve null si $schema ya existe", () => {
    expect(insertJsonSchema('{"$schema": "x"}', "https://opencode.ai/config.json")).toBeNull()
  })

  test("devuelve null si no hay objeto JSON", () => {
    expect(insertJsonSchema("sin objetos", "https://opencode.ai/config.json")).toBeNull()
  })
})
