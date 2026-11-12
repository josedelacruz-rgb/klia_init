import { describe, expect, test } from "bun:test"
import { isPlainObject, parseJsonc, stripJsonComments } from "../../src/jsonc.js"

describe("stripJsonComments", () => {
  test("elimina comentarios de línea y bloque", () => {
    const input = '{\n  // línea\n  "a": 1, /* bloque */\n  "b": 2\n}'
    expect(stripJsonComments(input)).toBe('{\n  \n  "a": 1, \n  "b": 2\n}')
  })

  test("conserva el contenido de las cadenas", () => {
    const input = '{"url": "https://ejemplo.test/a//b", "x": 1}'
    expect(stripJsonComments(input)).toBe(input)
  })

  test("respeta caracteres escapados dentro de cadenas", () => {
    const input = '{"a": "comilla \\" // no es comentario"}'
    expect(stripJsonComments(input)).toBe(input)
  })
})

describe("parseJsonc", () => {
  test("parsea comentarios, comas finales y BOM", () => {
    const text = '\uFEFF{\n  // config\n  "plugins": ["a",],\n}'
    expect(parseJsonc(text)).toEqual({ plugins: ["a"] })
  })

  test("devuelve undefined si el JSONC no es válido", () => {
    expect(parseJsonc("{ roto")).toBeUndefined()
  })

  test("parsea arrays y valores primitivos", () => {
    expect(parseJsonc("[1, 2, 3]")).toEqual([1, 2, 3])
    expect(parseJsonc("null")).toBeNull()
  })
})

describe("isPlainObject", () => {
  test("solo acepta objetos simples", () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject([])).toBe(false)
    expect(isPlainObject(null)).toBe(false)
    expect(isPlainObject("texto")).toBe(false)
  })
})
