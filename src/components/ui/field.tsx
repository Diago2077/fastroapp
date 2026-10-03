import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/utils'

const control =
  'w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60'

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-1.5 block text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  )
}

export function Input({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(control, 'h-9.5', className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'min-h-20 py-2 leading-relaxed', className)} {...props} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, 'h-9.5 pr-8', className)} {...props} />
}

/** Label + control + mensaje de ayuda o advertencia. */
export function Field({
  label,
  hint,
  warning,
  className,
  children,
}: {
  label?: string
  hint?: string
  warning?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      {label && <Label>{label}</Label>}
      {children}
      {warning ? (
        <p className="mt-1 text-xs text-warning">{warning}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
