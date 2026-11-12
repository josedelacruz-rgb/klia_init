import type { Plugin } from "@opencode/plugin/tui"
import { analyzeProject } from "./project-analyzer.js"
import { detectProject } from "./project-detector.js"
import { planProjectFiles } from "./file-planner.js"
import { applyPlan } from "./file-manager.js"
import { validateFiles } from "./validators.js"
import { buildReport, formatReport } from "./report.js"
import type { PlannedFile, ProjectAnalysis } from "./types.js"

const PLUGIN_ID = "project-init-tui"

/**
 * Los diálogos nativos se abren en tamaño `medium` (60 columnas) y recortan el
 * texto largo, sin desplazamiento. Se presenta siempre en `xlarge` (116
 * columnas) y el texto extenso se pagina; el host restablece el tamaño al
 * montar cada diálogo, por eso se fija antes y después de abrirlo.
 */
const DIALOG_PRESENTATION = { size: "xlarge", centered: true } as const

/** Líneas por página cuando no se puede leer el alto de la terminal. */
const FALLBACK_PAGE_LINES = 14
/** Margen reservado para cabecera, pie y bordes del diálogo. */
const DIALOG_CHROME_LINES = 10

type Action = "apply" | "create" | "cancel"
type FollowUp = "report" | "close"

/**
 * Plugin TUI: registra el comando `/project-init-tui` y ejecuta todo el flujo
 * con diálogos nativos (resumen, autorizaciones y confirmación final).
 */
const plugin: Plugin.Definition = {
  id: PLUGIN_ID,
  setup(ctx) {
    ctx.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: `${PLUGIN_ID}.run`,
          title: "project-init: inicialización guiada",
          description:
            "Analiza el proyecto y genera documentación y configuración con diálogos",
          group: "project-init",
          palette: true,
          slash: { name: PLUGIN_ID },
          run: () => execute(ctx),
        },
      ],
    }))
  },
}

export default plugin

async function execute(ctx: Plugin.Context): Promise<void> {
  try {
    const root = resolveRoot(ctx)
    if (!root) {
      await showText(ctx, PLUGIN_ID, "No se pudo determinar la raíz del proyecto abierto.")
      return
    }

    const analysis = analyzeProject(await detectProject(root))
    const plan = await planProjectFiles(analysis)
    const pending = plan.filter((file) => !file.exists)
    const existing = plan.filter((file) => file.exists)

    await showText(ctx, `${PLUGIN_ID} · ${analysis.name}`, summarize(analysis, pending, existing))

    const action = await withPresentation(ctx, () =>
      ctx.ui.dialog.select<Action>({
        title: "¿Qué quieres hacer?",
        placeholder: "Selecciona una acción",
        options: buildActions(pending, existing),
      }),
    )
    if (action === undefined || action === "cancel") return

    let approved: string[] = []
    if (action === "apply" && existing.length > 0) {
      const selection = await confirmExisting(ctx, existing)
      if (selection === undefined) return
      approved = selection
    }

    if (pending.length === 0 && approved.length === 0) {
      await showText(ctx, PLUGIN_ID, "No hay nada que escribir: no se autorizó ningún archivo.")
      return
    }

    const proceed = await withPresentation(ctx, () =>
      ctx.ui.dialog.confirm({
        title: "Confirmar escritura",
        message: writeSummary(pending, existing, approved),
        label: { confirm: "Escribir", cancel: "Cancelar" },
      }),
    )
    if (proceed !== true) return

    const files = await applyPlan(plan, { root, approvedOverwrite: approved })
    const validations = await validateFiles(root, plan)
    const report = buildReport(analysis, files, validations)
    const created = files.filter((file) => file.action === "created").length
    const updated = files.filter((file) => file.action === "updated").length
    const failed = files.filter((file) => file.action === "failed").length

    ctx.ui.toast.show({
      title: PLUGIN_ID,
      message:
        failed > 0
          ? `${created} creados, ${updated} actualizados, ${failed} fallidos`
          : `${created} creados, ${updated} actualizados`,
      variant: report.ok ? "success" : "warning",
    })

    await showFollowUp(ctx, formatReport(report))
  } catch (error) {
    await showText(ctx, PLUGIN_ID, `La operación falló: ${describe(error)}`).catch(() => undefined)
    ctx.ui.toast.show({
      title: PLUGIN_ID,
      message: "La operación falló",
      variant: "error",
    })
  }
}

/** Raíz del proyecto: ubicación de la ventana, sesión activa o ubicación por defecto. */
function resolveRoot(ctx: Plugin.Context): string | undefined {
  if (ctx.location) return ctx.location.directory

  const route = ctx.ui.router.current()
  if (route.type === "session") {
    const session = ctx.data.session.get(route.sessionID)
    if (session) return session.location.directory
  }

  try {
    return ctx.data.location.default()?.directory
  } catch {
    return undefined
  }
}

function buildActions(
  pending: readonly PlannedFile[],
  existing: readonly PlannedFile[],
): Array<{ title: string; value: Action; description?: string }> {
  const actions: Array<{ title: string; value: Action; description?: string }> = []

  if (pending.length > 0 || existing.length > 0) {
    actions.push({
      title: existing.length > 0 ? "Revisar y aplicar el plan" : `Crear ${pending.length} archivos`,
      value: "apply",
      description:
        existing.length > 0
          ? `${pending.length} nuevos y ${existing.length} existentes que puedes autorizar uno a uno`
          : "Documentación, agentes, comandos y skill del proyecto",
    })
  }

  if (pending.length > 0 && existing.length > 0) {
    actions.push({
      title: `Crear solo los ${pending.length} archivos nuevos`,
      value: "create",
      description: "No modifica ningún archivo existente",
    })
  }

  actions.push({ title: "Cancelar", value: "cancel", description: "No se escribirá nada" })
  return actions
}

/** Pregunta por cada archivo existente. Devuelve las rutas aprobadas o undefined si se cancela. */
async function confirmExisting(
  ctx: Plugin.Context,
  existing: readonly PlannedFile[],
): Promise<string[] | undefined> {
  const approved: string[] = []

  for (const file of existing) {
    const answer = await withPresentation(ctx, () =>
      ctx.ui.dialog.confirm({
        title: "Archivo existente",
        message:
          `${file.path}\n\n${file.description}\n\n` +
          "Se creará una copia de seguridad .bak antes de actualizarlo.",
        label: { confirm: "Actualizar", cancel: "Omitir" },
      }),
    )
    if (answer === undefined) return undefined
    if (answer) approved.push(file.path)
  }

  return approved
}

function summarize(
  analysis: ProjectAnalysis,
  pending: readonly PlannedFile[],
  existing: readonly PlannedFile[],
): string {
  const lines = [
    `Proyecto: ${analysis.name}`,
    `Tipo: ${analysis.kinds.join(", ") || "no determinado"}`,
    `Lenguajes: ${analysis.languages.join(", ") || "no detectados"}`,
    `Gestor de paquetes: ${analysis.packageManager ?? "no determinable"}`,
    "",
    `Nuevos: ${pending.length} · Existentes: ${existing.length}`,
  ]

  if (pending.length > 0) {
    lines.push("", "Se crearán:", ...pending.map((file) => `  • ${file.path}`))
  }
  if (existing.length > 0) {
    lines.push("", "Ya existen:", ...existing.map((file) => `  • ${file.path}`))
  }
  if (analysis.warnings.length > 0) {
    lines.push("", "Observaciones:", ...analysis.warnings.map((warning) => `  • ${warning}`))
  }

  return lines.join("\n")
}

function writeSummary(
  pending: readonly PlannedFile[],
  existing: readonly PlannedFile[],
  approved: readonly string[],
): string {
  const skipped = existing.length - approved.length
  return [
    `Se crearán ${pending.length} archivos nuevos.`,
    `Se actualizarán ${approved.length} archivos existentes.`,
    `Se omitirán ${skipped} archivos existentes.`,
    "",
    "Los archivos existentes se actualizan sin perder contenido: se fusiona el bloque gestionado y se guarda una copia .bak.",
  ].join("\n")
}

async function showFollowUp(ctx: Plugin.Context, report: string): Promise<void> {
  const next = await withPresentation(ctx, () =>
    ctx.ui.dialog.select<FollowUp>({
      title: `${PLUGIN_ID} · completado`,
      placeholder: "Selecciona una opción",
      options: [
        {
          title: "Ver informe completo",
          value: "report",
          description: "Archivos creados, actualizados, omitidos y validaciones",
        },
        { title: "Cerrar", value: "close" },
      ],
    }),
  )

  if (next === "report") await showText(ctx, "Informe de project-init", report)
}

/**
 * Abre un diálogo nativo con presentación uniforme. El host restablece el
 * tamaño al montar el diálogo, así que se vuelve a fijar después de un turno
 * del bucle de eventos.
 */
async function withPresentation<Value>(
  ctx: Plugin.Context,
  open: () => Promise<Value>,
): Promise<Value> {
  ctx.ui.dialog.set(DIALOG_PRESENTATION)
  const pending = open()
  await Promise.resolve()
  ctx.ui.dialog.set(DIALOG_PRESENTATION)
  return pending
}

/**
 * Muestra texto en una alerta paginada. Los diálogos no tienen desplazamiento,
 * así que las páginas garantizan que todo el contenido sea legible.
 */
async function showText(ctx: Plugin.Context, title: string, text: string): Promise<void> {
  const pages = paginateText(text, pageLines(ctx))

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index] ?? ""
    const last = index === pages.length - 1
    const suffix =
      pages.length === 1 ? "" : ` (${index + 1}/${pages.length})${last ? "" : " · Enter: siguiente"}`
    await withPresentation(ctx, () => ctx.ui.dialog.alert({ title: `${title}${suffix}`, message: page }))
  }
}

/** Líneas que caben en una página según el alto real de la terminal. */
function pageLines(ctx: Plugin.Context): number {
  const renderer: unknown = ctx.renderer
  const height =
    typeof renderer === "object" && renderer !== null && "height" in renderer
      ? (renderer as { height?: unknown }).height
      : undefined

  if (typeof height !== "number" || !Number.isFinite(height)) return FALLBACK_PAGE_LINES
  return Math.max(6, Math.floor(height) - DIALOG_CHROME_LINES)
}

/**
 * Divide el texto en páginas por líneas completas, sin romper ninguna.
 * Expuesto para pruebas.
 */
export function paginateText(text: string, limit: number): string[] {
  const size = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 1
  const lines = text.split("\n")
  const pages: string[] = []

  for (let index = 0; index < lines.length; index += size) {
    pages.push(lines.slice(index, index + size).join("\n"))
  }

  return pages.length > 0 ? pages : [""]
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
