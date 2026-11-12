# Desarrollo

## Requisitos
- **Gestor de paquetes:** `bun`
- **Lenguajes:** TypeScript

## Instalación
```bash
bun install
```

## Scripts disponibles
| Script | Comando |
| --- | --- |
| `build` | `tsc -p tsconfig.json` |
| `typecheck` | `tsc -p tsconfig.json --noEmit` |
| `test` | `bun test` |
| `clean` | `node -e "require('node:fs').rmSync('dist',{recursive:true,force:true})"` |

## Flujo de trabajo
- Instala las dependencias antes de ejecutar cualquier comprobación.
- Ejecuta compilación o typecheck y las pruebas tras cada cambio relevante.
- Mantén los cambios pequeños y separa refactorizaciones de funcionalidad.
- Actualiza la documentación cuando cambie el comportamiento o la configuración.

## Dependencias de ejecución
- `@opencode/plugin`