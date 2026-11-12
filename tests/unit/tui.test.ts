import { describe, expect, test } from "bun:test"
import plugin, { paginateText } from "../../src/tui.js"

describe("plugin TUI", () => {
  test("expone un id y un setup válidos para el cargador", () => {
    expect(plugin.id).toBe("project-init-tui")
    expect(typeof plugin.setup).toBe("function")
  })

  test("registra el comando slash project-init-tui en modo global", () => {
    type Layer = {
      mode?: string
      commands?: Array<{ slash?: { name: string }; run?: unknown }>
    }
    let layer: Layer | undefined

    const ctx = {
      keymap: {
        layer: (factory: () => Layer) => {
          layer = factory()
        },
      },
    }

    plugin.setup(ctx as never)

    expect(layer?.mode).toBe("global")
    expect(layer?.commands?.[0]?.slash?.name).toBe("project-init-tui")
    expect(typeof layer?.commands?.[0]?.run).toBe("function")
  })
})

describe("paginateText", () => {
  test("mantiene el texto corto en una sola página", () => {
    expect(paginateText("uno\ndos\ntres", 10)).toEqual(["uno\ndos\ntres"])
  })

  test("divide por líneas completas sin perder contenido", () => {
    const text = Array.from({ length: 7 }, (_, index) => `línea ${index + 1}`).join("\n")
    const pages = paginateText(text, 3)

    expect(pages).toHaveLength(3)
    expect(pages[0]).toBe("línea 1\nlínea 2\nlínea 3")
    expect(pages[1]).toBe("línea 4\nlínea 5\nlínea 6")
    expect(pages[2]).toBe("línea 7")
    expect(pages.join("\n")).toBe(text)
  })

  test("respeta límites no positivos sin bucles infinitos", () => {
    expect(paginateText("a\nb", 0)).toEqual(["a", "b"])
    expect(paginateText("a\nb", Number.NaN)).toEqual(["a", "b"])
  })
})
