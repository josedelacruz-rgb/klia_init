# Reglas del proyecto

> Documentación complementaria de convenciones y revisión. No sustituye a `AGENTS.md` como fuente de instrucciones para agentes.

## Código
- Sigue las convenciones idiomáticas de TypeScript ya presentes en el código.
- Ejecuta TypeScript (tsc) y corrige los avisos antes de finalizar.
- Mantén los cambios pequeños, enfocados y revisables.
- No dupliques lógica: extrae utilidades cuando el patrón se repita.
- No añadas abstracciones ni dependencias sin necesidad demostrable.

## Documentación
- Mantén `AGENTS.md` y `docs/` sincronizados con el código.
- Documenta decisiones y limitaciones, no lo obvio.
- No dejes secciones vacías ni marcadores pendientes.

## Revisión
- Comprueba que la compilación y las pruebas pasan antes de solicitar revisión.
- Revisa el diff completo y evita cambios ajenos a la tarea.
- Verifica que no se introducen secretos ni archivos generados.

## Prohibiciones
- No sobrescribir archivos del usuario sin autorización.
- No modificar artefactos generados ni dependencias instaladas.
- No desactivar pruebas o validaciones para conseguir que el build pase.

## Lista de verificación
- Compilación o typecheck sin errores.
- Pruebas en verde.
- Sin secretos ni rutas locales versionadas.
- Documentación actualizada.