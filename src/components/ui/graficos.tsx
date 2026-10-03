import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  type ChartOptions,
} from 'chart.js'
import { forwardRef } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import { PALETA } from '@/lib/estadisticas'
import { formatGs, formatNumero, formatUsd } from '@/lib/format'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

/** Moneda de un grafico: ventas en guaranies, costos en dolares. */
export type MonedaGrafico = 'gs' | 'usd'
const formato = (m: MonedaGrafico) => (m === 'gs' ? formatGs : formatUsd)
const formatoEje = (m: MonedaGrafico) => (v: number | string) => (m === 'gs' ? '₲ ' : 'US$ ') + formatNumero(Number(v))

function colorTexto(): string {
  if (typeof document === 'undefined') return '#555'
  return getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground').trim() || '#555'
}

type Ref = React.Ref<ChartJS<'doughnut'>>
type RefBar = React.Ref<ChartJS<'bar'>>

export const GraficoDona = forwardRef(function GraficoDona(
  { etiquetas, valores, moneda, tipo = 'dona' }: { etiquetas: string[]; valores: number[]; moneda: MonedaGrafico; tipo?: 'dona' | 'torta' },
  ref: Ref,
) {
  const datos = {
    labels: etiquetas,
    datasets: [{ data: valores, backgroundColor: etiquetas.map((_, i) => PALETA[i % PALETA.length]), borderWidth: 0 }],
  }
  const opciones: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: tipo === 'dona' ? '60%' : 0,
    plugins: {
      legend: { position: 'bottom', labels: { color: colorTexto(), boxWidth: 12 } },
      tooltip: { callbacks: { label: (c) => ` ${c.label}: ${formato(moneda)(Number(c.raw))}` } },
    },
  }
  return <Doughnut ref={ref as never} data={datos} options={opciones} />
})

export interface SerieBarras {
  nombre: string
  valores: number[]
  color: string
  moneda: MonedaGrafico
}

export const GraficoBarras = forwardRef(function GraficoBarras(
  { etiquetas, series, horizontal = false, multicolor = false }: { etiquetas: string[]; series: SerieBarras[]; horizontal?: boolean; multicolor?: boolean },
  ref: RefBar,
) {
  const texto = colorTexto()
  const monedaEje = series[0]?.moneda ?? 'gs'
  const datos = {
    labels: etiquetas,
    datasets: series.map((s) => ({
      label: s.nombre,
      data: s.valores,
      backgroundColor: multicolor ? etiquetas.map((_, i) => PALETA[i % PALETA.length]) : s.color,
      borderRadius: 4,
    })),
  }
  const opciones: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    plugins: {
      legend: { display: series.length > 1, labels: { color: texto } },
      tooltip: {
        callbacks: {
          label: (c) => {
            const serie = series[c.datasetIndex]
            return ` ${serie.nombre}: ${formato(serie.moneda)(Number(c.raw))}`
          },
        },
      },
    },
    scales: {
      // Solo el eje numerico lleva el formato de moneda. Un `callback: undefined` explicito
      // pisaria el rotulo por defecto del eje de categorias (salia "0" en vez del nombre).
      x: { ticks: { color: texto, ...(horizontal ? { callback: formatoEje(monedaEje) } : {}) }, beginAtZero: true, grid: { display: false } },
      y: { ticks: { color: texto, ...(horizontal ? {} : { callback: formatoEje(monedaEje) }) }, beginAtZero: true },
    },
  }
  return <Bar ref={ref as never} data={datos} options={opciones} />
})
