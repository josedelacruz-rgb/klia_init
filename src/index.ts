import { Plugin } from "@opencode/plugin"
import { Schema } from "effect"
import { analyzeProject } from "./project-analyzer.js"
import { detectProject } from "./project-detector.js"
import { planProjectFiles } from "./file-planner.js"
import { applyPlan } from "./file-manager.js"
import { validateFiles } from "./validators.js"
import { buildReport, formatPlan, formatReport } from "./report.js"

const COMMAND_PROMPT = [
  "Inicializa la documentación y configuración de este proyecto.",
  "",
  "1. Invoca la herramienta `project_init` sin `confirm` para obtener el análisis real del proyecto y la lista de archivos propuestos.",
  "2. Muestra al usuario un resumen del análisis y la tabla de archivos (nuevos y existentes).",
  "3. Pide autorización explícita. Para archivos existentes indica cuáles se actualizarían y solicita confirmación individual.",
  "4. Solo si el usuario autoriza, vuelve a invocar `project_init` con `confirm: true` y, si procede, la lista `overwrite` con las rutas autorizadas.",
  "5. Presenta el informe final con archivos creados/actualizados/omitidos y las validaciones.",
  "",
  "Nunca sobrescribas archivos sin autorización. No inventes datos que el análisis no haya detectado.",
].join("\n")

const ProjectInitInput = Schema.Struct({
  confirm: Schema.optional(Schema.Boolean),
  overwrite: Schema.optional(Schema.Array(Schema.String)),
})

export default Plugin.define({
  id: "project-init",
  async setup(ctx) {
    const root = ctx.location.project.canonical

    const commandRegistration = await ctx.command.transform((editor) => {
      editor.add({
        name: "project-init",
        description:
          "Analiza el proyecto y genera AGENTS.md, agentes, comandos, skills y documentación",
        execute: async (invocation) => {
          await ctx.session.prompt({
            sessionID: invocation.sessionID,
            delivery: invocation.delivery,
            text: COMMAND_PROMPT,
          })
        },
      })
    })

    const toolRegistration = await ctx.tool.transform((editor) => {
      editor.add({
        name: "project_init",
        description:
          "Analiza el proyecto y, con autorización, genera la documentación y configuración inicial. " +
          "Sin `confirm` solo devuelve el análisis y la propuesta.",
        input: ProjectInitInput,
        execute: async (input) => {
          const detected = await detectProject(root)
          const analysis = analyzeProject(detected)
          const plan = await planProjectFiles(analysis)

          if (!input.confirm) {
            return {
              content: formatPlan(analysis, plan),
              metadata: { stage: "plan", files: plan.length },
            }
          }

          const files = await applyPlan(plan, {
            root,
            approvedOverwrite: input.overwrite ?? [],
          })
          const validations = await validateFiles(root, plan)
          const report = buildReport(analysis, files, validations)

          return {
            content: formatReport(report),
            metadata: { stage: "written", ok: report.ok, files: files.length },
          }
        },
      })
    })

    return async () => {
      await commandRegistration.dispose()
      await toolRegistration.dispose()
    }
  },
})
