import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const tonos = {
  neutral: 'bg-secondary text-secondary-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-destructive/12 text-destructive',
} as const

export type TonoBadge = keyof typeof tonos

export function Badge({
  children,
  tono = 'neutral',
  className,
}: {
  children: ReactNode
  tono?: TonoBadge
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tonos[tono],
        className,
      )}
    >
      {children}
    </span>
  )
}
