# AGENTS.md

> Generado por `opencode-project-init` a partir de los archivos del proyecto. Solo se afirma lo que el análisis pudo verificar.

## Proyecto
- **Nombre:** `opencode-project-init`
- **Finalidad:** Plugin de OpenCode que analiza el proyecto y genera documentación y configuración profesional
- **Tipo:** opencode-plugin

## Tecnologías
| Aspecto | Valor detectado |
| --- | --- |
| Lenguajes | TypeScript |
| Frameworks | No detectados |
| Tipo de proyecto | opencode-plugin |
| Gestor de paquetes | bun |
| Herramientas de prueba | Bun test |
| Herramientas de calidad | TypeScript (tsc) |

## Arquitectura
**Puntos de entrada:**

- `src/index.ts`

**Directorios principales:**

| Directorio | Contenido |
| --- | --- |
| `.ralph` | Metadatos del bucle Ralph |
| `docs` | Documentación del proyecto |
| `src` | Código fuente |
| `tests` | Pruebas |

## Compilación y ejecución
| Script | Comando |
| --- | --- |
| `build` | `tsc -p tsconfig.json` |
| `typecheck` | `tsc -p tsconfig.json --noEmit` |
| `test` | `bun test` |
| `clean` | `node -e "require('node:fs').rmSync('dist',{recursive:true,force:true})"` |

## Pruebas
Herramientas detectadas: `Bun test`.

- `test` → `bun test`

## Convenciones
- Usa `bun` para instalar dependencias y ejecutar scripts.
- El proyecto usa TypeScript: mantén el tipado y evita conversiones inseguras.
- Ejecuta TypeScript (tsc) antes de dar por finalizado un cambio.
- Mantén los cambios pequeños, enfocados y alineados con la estructura existente.
- Documenta solo comportamientos verificados; no inventes APIs ni resultados.
- Sigue los patrones de nombres y organización ya presentes en el código.

## Reglas
- No modifiques `node_modules`, `dist`, `build` ni `coverage`; son artefactos.
- No sobrescribas documentación del usuario sin autorización explícita.
- No añadas dependencias sin justificar su necesidad, licencia y mantenimiento.
- Ejecuta la compilación y las pruebas antes de declarar terminado un cambio.
- No dejes marcadores pendientes ni secciones vacías en la documentación.

## Errores y diagnóstico
- Propaga los errores con contexto suficiente; no los silencies.
- Valida las entradas en los límites del sistema y falla de forma explícita.
- Reproduce el fallo con una prueba antes de corregirlo.

## Seguridad
- No expongas credenciales, tokens, claves ni datos personales en código, logs o documentación.
- Valida y sanea cualquier dato que provenga del exterior.
- Revisa las dependencias nuevas antes de incorporarlas.
- Aplica el principio de mínimo privilegio en herramientas y automatizaciones.

## Criterios de calidad
- La compilación o el typecheck terminan sin errores.
- Las pruebas existentes pasan y las nuevas cubren el cambio.
- No hay secretos ni rutas locales en los archivos versionados.
- La documentación refleja el estado real del proyecto.

<!-- opencode-project-init:start -->
# AGENTS.md

> Generado por `opencode-project-init` a partir de los archivos del proyecto. Solo se afirma lo que el análisis pudo verificar.

## Proyecto
- **Nombre:** `opencode-project-init`
- **Finalidad:** Plugin de OpenCode que analiza el proyecto y genera documentación y configuración profesional
- **Tipo:** opencode-plugin, opencode-project

## Tecnologías
| Aspecto | Valor detectado |
| --- | --- |
| Lenguajes | TypeScript |
| Frameworks | No detectados |
| Tipo de proyecto | opencode-plugin, opencode-project |
| Gestor de paquetes | bun |
| Herramientas de prueba | Bun test |
| Herramientas de calidad | TypeScript (tsc) |

## Arquitectura
**Puntos de entrada:**

- `src/index.ts`

**Directorios principales:**

| Directorio | Contenido |
| --- | --- |
| `.opencode` | Configuración de OpenCode |
| `.ralph` | Metadatos del bucle Ralph |
| `docs` | Documentación del proyecto |
| `src` | Código fuente |
| `tests` | Pruebas |

## Compilación y ejecución
| Script | Comando |
| --- | --- |
| `build` | `tsc -p tsconfig.json` |
| `typecheck` | `tsc -p tsconfig.json --noEmit` |
| `test` | `bun test` |
| `clean` | `node -e "require('node:fs').rmSync('dist',{recursive:true,force:true})"` |

## Pruebas
Herramientas detectadas: `Bun test`.

- `test` → `bun test`

## Convenciones
- Usa `bun` para instalar dependencias y ejecutar scripts.
- El proyecto usa TypeScript: mantén el tipado y evita conversiones inseguras.
- Ejecuta TypeScript (tsc) antes de dar por finalizado un cambio.
- Mantén los cambios pequeños, enfocados y alineados con la estructura existente.
- Documenta solo comportamientos verificados; no inventes APIs ni resultados.
- Sigue los patrones de nombres y organización ya presentes en el código.

## Reglas
- No modifiques `node_modules`, `dist`, `build` ni `coverage`; son artefactos.
- No sobrescribas documentación del usuario sin autorización explícita.
- No añadas dependencias sin justificar su necesidad, licencia y mantenimiento.
- Ejecuta la compilación y las pruebas antes de declarar terminado un cambio.
- No dejes marcadores pendientes ni secciones vacías en la documentación.

## Errores y diagnóstico
- Propaga los errores con contexto suficiente; no los silencies.
- Valida las entradas en los límites del sistema y falla de forma explícita.
- Reproduce el fallo con una prueba antes de corregirlo.

## Seguridad
- No expongas credenciales, tokens, claves ni datos personales en código, logs o documentación.
- Valida y sanea cualquier dato que provenga del exterior.
- Revisa las dependencias nuevas antes de incorporarlas.
- Aplica el principio de mínimo privilegio en herramientas y automatizaciones.

## Criterios de calidad
- La compilación o el typecheck terminan sin errores.
- Las pruebas existentes pasan y las nuevas cubren el cambio.
- No hay secretos ni rutas locales en los archivos versionados.
- La documentación refleja el estado real del proyecto.
<!-- opencode-project-init:end -->
