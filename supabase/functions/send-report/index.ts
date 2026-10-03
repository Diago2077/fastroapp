// ============================================================
// FASTRO — Edge Function: send-report
// Arma un resumen de ventas y lo envia por correo (SMTP de Gmail).
//
// Modos:
//   manual : un admin la invoca desde la app (JWT). Envia siempre.
//   auto   : la invoca pg_cron con el header x-cron-secret. Envia solo si la
//            configuracion (app_config) dice que hoy toca semanal y/o mensual.
//            "Hoy" se calcula en hora de Paraguay (America/Asuncion), no en UTC.
//
// Contenido: cuerpo HTML liviano con los totales + PDF adjunto con el
// detalle (pedidos de los ultimos 7 dias por vendedor). Los pedidos
// cancelados no cuentan. Los destinatarios van en BCC y el propio remitente
// como unico "Para": un correo con mucho HTML y varios "Para" enviado por SMTP
// desde la nube es justo lo que el filtro saliente de Gmail marca como spam.
//
// Ventas en guaranies (Gs.), costo de fabrica en dolares (Us.).
// El costo viene de order_item_costs, que solo existe para el costo
// "congelado" del item; esta funcion usa la service role, asi que lo lee sin
// pasar por can_see_cost.
//
// Secrets (Supabase > Edge Functions > Secrets):
//   GMAIL_USER, GMAIL_APP_PASSWORD (contrasena de aplicacion de Google), CRON_SECRET
//   (SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY vienen inyectados)
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GMAIL_USER = Deno.env.get('GMAIL_USER') || ''
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD') || ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''

const ZONA = 'America/Asuncion'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const numero = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 })
const gs = (n: number) => 'Gs. ' + numero.format(Math.round(n || 0))
const us = (n: number) => 'Us. ' + numero.format(Math.round(n || 0))
const fDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('es-PY', { timeZone: ZONA }) : '-')
const hoy = () => new Date().toLocaleDateString('es-PY', { timeZone: ZONA })

const STATUS_LABEL: Record<string, string> = { open: 'Abierto', sent: 'Enviado', closed: 'Cerrado' }

/** Dia de la semana (1=Lun..7=Dom) y dia del mes de HOY en Paraguay. */
function hoyEnParaguay() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA,
    weekday: 'short',
    day: 'numeric',
  }).formatToParts(new Date())
  const dia = Number(partes.find((p) => p.type === 'day')?.value)
  const nombre = partes.find((p) => p.type === 'weekday')?.value ?? 'Mon'
  const semana = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(nombre) + 1
  return { semana, dia }
}

// deno-lint-ignore no-explicit-any
type Fila = any

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json().catch(() => ({}))
    const mode = body?.mode === 'auto' ? 'auto' : 'manual'

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

    // ---- Autorizacion ----
    if (mode === 'auto') {
      if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
        return json({ error: 'No autorizado' }, 401)
      }
    } else {
      const authHeader = req.headers.get('Authorization') || ''
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      })
      const {
        data: { user },
      } = await userClient.auth.getUser()
      if (!user) return json({ error: 'Sesion invalida' }, 401)
      const { data: perfil } = await admin.from('usuarios').select('rol, activo').eq('id', user.id).maybeSingle()
      if (perfil?.rol !== 'admin' || !perfil.activo) {
        return json({ error: 'Solo un administrador puede enviar reportes' }, 403)
      }
    }

    // ---- Configuracion ----
    const { data: cfgRows } = await admin.from('app_config').select('key, value')
    const cfg: Record<string, string> = Object.fromEntries((cfgRows || []).map((r: Fila) => [r.key, r.value]))

    // ---- Que cadencias disparar ----
    const reasons: string[] = []
    if (mode === 'manual') {
      reasons.push('manual')
    } else {
      const { semana, dia } = hoyEnParaguay()
      if (cfg.report_weekly_enabled === 'true' && String(semana) === String(cfg.report_weekly_weekday || '1')) {
        reasons.push('semanal')
      }
      if (cfg.report_monthly_enabled === 'true' && String(dia) === String(cfg.report_monthly_day || '1')) {
        reasons.push('mensual')
      }
      if (!reasons.length) return json({ skipped: true, message: 'Hoy no corresponde envio automatico' })
    }

    // ---- Destinatarios (solo cuentas activas) ----
    let recipientIds: string[] = []
    try {
      recipientIds = JSON.parse(cfg.report_recipients || '[]')
    } catch {
      recipientIds = []
    }
    if (!recipientIds.length) return json({ error: 'No hay destinatarios configurados' }, 400)

    const { data: recUsuarios } = await admin.from('usuarios').select('email').in('id', recipientIds).eq('activo', true)
    const emails = (recUsuarios || []).map((p: Fila) => p.email).filter((e: string) => e && e.includes('@'))
    if (!emails.length) return json({ error: 'Los destinatarios no tienen correo valido' }, 400)

    const bccEmails = emails.filter((e: string) => e.toLowerCase() !== GMAIL_USER.toLowerCase())

    // ---- Datos (los cancelados no suman). PostgREST corta en 1000 filas: se pagina. ----
    const traer = async (armar: () => Fila) => {
      const filas: Fila[] = []
      for (let d = 0; ; d += 1000) {
        const { data, error } = await armar().range(d, d + 999)
        if (error) throw new Error(error.message)
        filas.push(...data)
        if (data.length < 1000) break
      }
      return filas
    }
    const ordersRaw = await traer(() =>
      admin
        .from('orders')
        .select('id, order_number, status, discount_pct, created_at, clients(name), vendedor:usuarios(nombre)')
        .order('id'),
    )
    const orders = ordersRaw.filter((o: Fila) => o.status !== 'cancelled')
    const items = await traer(() =>
      admin
        .from('order_items')
        .select('order_id, quantity, unit_sale_price, order_item_costs(unit_cost_price)')
        .order('id'),
    )

    const revByOrder: Record<string, number> = {}
    const costByOrder: Record<string, number> = {}
    items.forEach((i: Fila) => {
      const c = Array.isArray(i.order_item_costs) ? i.order_item_costs[0] : i.order_item_costs
      revByOrder[i.order_id] = (revByOrder[i.order_id] || 0) + i.quantity * i.unit_sale_price
      costByOrder[i.order_id] = (costByOrder[i.order_id] || 0) + i.quantity * (c?.unit_cost_price || 0)
    })

    let totalRev = 0
    let totalCost = 0
    orders.forEach((o: Fila) => {
      totalRev += (revByOrder[o.id] || 0) * (1 - (o.discount_pct || 0) / 100)
      totalCost += costByOrder[o.id] || 0
    })

    const since = Date.now() - 7 * 24 * 60 * 60 * 1000
    const recent = orders
      .filter((o: Fila) => new Date(o.created_at).getTime() >= since)
      .sort((a: Fila, b: Fila) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    const bySeller: Record<string, Fila[]> = {}
    recent.forEach((o: Fila) => {
      const seller = o.vendedor?.nombre || 'Sin asignar'
      ;(bySeller[seller] = bySeller[seller] || []).push(o)
    })
    const sellerCount = Object.keys(bySeller).length

    const html = buildHtml(totalRev, totalCost, sellerCount, recent.length)
    const subject = `FASTRO — Reporte de ventas (${reasons.join(' y ')}) · ${hoy()}`
    const pdfBytes = await buildReportPdf(totalRev, totalCost, bySeller, revByOrder)
    const fileDate = new Date().toLocaleDateString('en-CA', { timeZone: ZONA })

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      return json({ error: 'Falta configurar GMAIL_USER o GMAIL_APP_PASSWORD en los secrets' }, 500)
    }
    const cleanHtml = html.replace(/>\s+</g, '><').trim()

    const smtp = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
      },
    })
    try {
      await smtp.send({
        from: `FASTRO S.A. <${GMAIL_USER}>`,
        to: GMAIL_USER,
        ...(bccEmails.length ? { bcc: bccEmails } : {}),
        subject,
        content: `Reporte de ventas FASTRO adjunto en PDF.\n\nVentas Totales: ${gs(totalRev)}\nTotal Ventas en Costo: ${us(totalCost)}`,
        html: cleanHtml,
        attachments: [
          {
            filename: `reporte-ventas-${fileDate}.pdf`,
            contentType: 'application/pdf',
            encoding: 'binary',
            content: pdfBytes,
          },
        ],
      })
    } finally {
      await smtp.close()
    }

    return json({ ok: true, sent: emails.length, reasons })
    // deno-lint-ignore no-explicit-any
  } catch (err: any) {
    return json({ error: String(err?.message || err) }, 500)
  }
})

function buildHtml(totalRev: number, totalCost: number, sellerCount: number, orderCount: number): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#222">
    <div style="max-width:520px;margin:0 auto;padding:20px">
      <p style="font-size:16px;font-weight:bold;color:#111;margin:0 0 4px">FASTRO S.A.</p>
      <p style="font-size:12px;color:#888;margin:0 0 20px">Reporte de ventas · ${hoy()}</p>
      <p style="font-size:14px;margin:0 0 6px">Ventas Totales: <strong style="color:#9B0000">${gs(totalRev)}</strong></p>
      <p style="font-size:14px;margin:0 0 6px">Total Ventas en Costo: <strong>${us(totalCost)}</strong></p>
      <p style="font-size:14px;margin:16px 0 0">
        ${orderCount ? `${orderCount} pedido(s) en los últimos 7 días, de ${sellerCount} vendedor(es).` : 'No se crearon pedidos en los últimos 7 días.'}
      </p>
      <p style="font-size:14px;margin:8px 0 20px">El detalle completo está en el PDF adjunto.</p>
      <p style="font-size:11px;color:#999;margin-top:24px">Generado automáticamente por el sistema de pedidos FASTRO.</p>
    </div>
  </body></html>`
}

async function buildReportPdf(
  totalRev: number,
  totalCost: number,
  bySeller: Record<string, Fila[]>,
  revByOrder: Record<string, number>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  const PAGE_W = 595.28
  const PAGE_H = 841.89
  const MARGIN = 40
  const RED = rgb(0.608, 0, 0)
  const DARK = rgb(0.1, 0.1, 0.1)
  const GRAY = rgb(0.45, 0.45, 0.45)
  const LINE = rgb(0.85, 0.85, 0.85)

  let page = doc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN

  function newPageIfNeeded(need = 20) {
    if (y - need < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN
    }
  }
  function truncate(s: string, max: number) {
    s = String(s || '-')
    return s.length > max ? s.slice(0, max - 1) + '…' : s
  }

  page.drawRectangle({ x: 0, y: PAGE_H - 55, width: PAGE_W, height: 55, color: DARK })
  page.drawText('FASTRO S.A.', { x: MARGIN, y: PAGE_H - 26, size: 15, font: fontBold, color: rgb(1, 1, 1) })
  page.drawText(`Reporte de ventas - ${hoy()}`, {
    x: MARGIN,
    y: PAGE_H - 42,
    size: 9,
    font,
    color: rgb(0.85, 0.85, 0.85),
  })
  y = PAGE_H - 80

  page.drawText('Ventas Totales:', { x: MARGIN, y, size: 11, font: fontBold, color: DARK })
  page.drawText(gs(totalRev), { x: MARGIN + 110, y, size: 11, font: fontBold, color: RED })
  y -= 18
  page.drawText('Total Ventas en Costo:', { x: MARGIN, y, size: 11, font: fontBold, color: DARK })
  page.drawText(us(totalCost), { x: MARGIN + 150, y, size: 11, font: fontBold, color: DARK })
  y -= 30

  page.drawText('Pedidos de los ultimos 7 dias por vendedor', { x: MARGIN, y, size: 12, font: fontBold, color: DARK })
  y -= 20

  const sellers = Object.keys(bySeller).sort()
  if (!sellers.length) {
    page.drawText('No se crearon pedidos en los ultimos 7 dias.', { x: MARGIN, y, size: 10, font, color: GRAY })
    y -= 16
  }

  const COLS: [number, string][] = [
    [MARGIN, 'N. Pedido'],
    [MARGIN + 90, 'Cliente'],
    [MARGIN + 270, 'Total'],
    [MARGIN + 350, 'Estado'],
    [MARGIN + 420, 'Fecha'],
  ]

  for (const name of sellers) {
    newPageIfNeeded(46)
    page.drawText(`${name} (${bySeller[name].length})`, { x: MARGIN, y, size: 11, font: fontBold, color: RED })
    y -= 15
    COLS.forEach(([x, label]) => page.drawText(label, { x, y, size: 8, font: fontBold, color: GRAY }))
    y -= 4
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: LINE })
    y -= 12

    for (const o of bySeller[name]) {
      newPageIfNeeded(14)
      const tot = (revByOrder[o.id] || 0) * (1 - (o.discount_pct || 0) / 100)
      page.drawText(truncate(o.order_number, 14), { x: MARGIN, y, size: 8, font, color: DARK })
      page.drawText(truncate(o.clients?.name, 28), { x: MARGIN + 90, y, size: 8, font, color: DARK })
      page.drawText(gs(tot), { x: MARGIN + 270, y, size: 8, font, color: DARK })
      page.drawText(STATUS_LABEL[o.status] || o.status, { x: MARGIN + 350, y, size: 8, font, color: DARK })
      page.drawText(fDate(o.created_at), { x: MARGIN + 420, y, size: 8, font, color: DARK })
      y -= 14
    }
    y -= 14
  }

  return await doc.save()
}
