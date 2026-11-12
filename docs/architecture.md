# Arquitectura

| Aspecto | Valor |
| --- | --- |
| Nombre | `opencode-project-init` |
| Finalidad | Plugin de OpenCode que analiza el proyecto y genera documentación y configuración profesional |
| Tipo | opencode-plugin |
| Lenguajes | TypeScript |
| Frameworks | No detectados |
| Gestor de paquetes | bun |

## Puntos de entrada
- `src/index.ts` — plugin servidor, export `.`
- `src/tui.ts` — plugin TUI, export `./tui`

## Organización de directorios
| Directorio | Contenido |
| --- | --- |
| `.ralph` | Metadatos del bucle Ralph |
| `docs` | Documentación del proyecto |
| `src` | Código fuente |
| `tests` | Pruebas |

## Dependencias de ejecución
- `@opencode/plugin`

## Mantenimiento
Actualiza este documento cuando cambien los puntos de entrada, los módulos o las dependencias. El contenido se generó a partir de los archivos detectados por `opencode-project-init`.

<!-- opencode-project-init:start -->
# Arquitectura

| Aspecto | Valor |
| --- | --- |
| Nombre | `opencode-project-init` |
| Finalidad | Plugin de OpenCode que analiza el proyecto y genera documentación y configuración profesional |
| Tipo | opencode-plugin, opencode-project |
| Lenguajes | TypeScript |
| Frameworks | No detectados |
| Gestor de paquetes | bun |

## Puntos de entrada
- `src/index.ts`

## Organización de directorios
| Directorio | Contenido |
| --- | --- |
| `.opencode` | Configuración de OpenCode |
| `.ralph` | Metadatos del bucle Ralph |
| `docs` | Documentación del proyecto |
| `src` | Código fuente |
| `tests` | Pruebas |

## Dependencias de ejecución
- `@opencode/plugin`

## Mantenimiento
Actualiza este documento cuando cambien los puntos de entrada, los módulos o las dependencias. El contenido se generó a partir de los archivos detectados por `opencode-project-init`.
<!-- opencode-project-init:end -->
