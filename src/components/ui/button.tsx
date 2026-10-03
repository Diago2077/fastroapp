import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:opacity-90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
        outline: 'border border-border bg-card text-foreground hover:bg-accent',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
      },
      size: {
        sm: 'h-8 px-3 text-xs [&_svg]:size-3.5',
        md: 'h-9.5 px-4 text-sm [&_svg]:size-4',
        lg: 'h-11 px-6 text-base [&_svg]:size-5',
        icon: 'size-9 [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
