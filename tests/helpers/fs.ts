import { cp, mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

/** Ruta absoluta de `tests/fixtures`. */
export const FIXTURES_ROOT = path.join(import.meta.dir, "..", "fixtures")

/** Crea un directorio temporal único y devuelve su ruta absoluta. */
export async function createTempDirectory(prefix = "project-init-"): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix))
}

/**
 * Copia un fixture a un directorio temporal para que las pruebas puedan
 * escribir sin modificar los archivos del repositorio.
 */
export async function copyFixtureToTemp(
  fixture: string,
  prefix = `project-init-${fixture}-`,
): Promise<string> {
  const target = await createTempDirectory(prefix)
  await cp(path.join(FIXTURES_ROOT, fixture), target, { recursive: true })
  return target
}

/** Elimina un directorio temporal, ignorando errores de limpieza. */
export async function removeTempDirectory(target: string): Promise<void> {
  await rm(target, { recursive: true, force: true })
}

/** Lista recursiva de archivos relativos con separador `/`. */
export async function listFiles(root: string): Promise<string[]> {
  const found: string[] = []
  const visit = async (relative: string): Promise<void> => {
    const entries = await readdir(path.join(root, relative), { withFileTypes: true })
    for (const entry of entries) {
      const next = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) await visit(next)
      else found.push(next)
    }
  }
  await visit("")
  return found.sort((a, b) => a.localeCompare(b))
}
