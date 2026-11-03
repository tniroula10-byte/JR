/**
 * Reusable shadcn/ui-style Dark Design System Primitives (`components/ui/primitives.tsx`)
 * Section 10: Midnight navy and near-black surfaces, violet accents with soft glow,
 * clean modern typography, generous spacing, accessible contrast and keyboard focus rings.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'emerald';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', type = 'button', ...props }, ref) => {
    const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
      primary:
        'bg-violet-600 text-white hover:bg-violet-500 shadow-violet-glow border border-violet-400/30',
      secondary:
        'bg-midnight-700 text-slate-100 hover:bg-midnight-600 border border-slate-700/70',
      outline:
        'bg-transparent text-violet-200 border border-violet-500/40 hover:bg-violet-500/15',
      ghost: 'bg-transparent text-slate-300 hover:text-white hover:bg-slate-800/60',
      danger: 'bg-rose-600/90 text-white hover:bg-rose-500 border border-rose-400/30',
      emerald: 'bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-400/30'
    };

    const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
      sm: 'h-8 px-3 text-xs rounded-lg font-medium',
      md: 'h-10 px-4 text-sm rounded-xl font-medium',
      lg: 'h-11 px-5 text-base rounded-xl font-semibold'
    };

    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.99]',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl bg-midnight-800/90 border border-slate-800/90 shadow-violet-subtle backdrop-blur-sm',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Badge({
  className,
  tone = 'violet',
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: 'violet' | 'emerald' | 'amber' | 'rose' | 'slate' | 'cyan';
}) {
  const tones = {
    violet: 'bg-violet-500/15 text-violet-200 border-violet-500/35',
    emerald: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/35',
    amber: 'bg-amber-500/15 text-amber-200 border-amber-500/35',
    rose: 'bg-rose-500/15 text-rose-200 border-rose-500/35',
    slate: 'bg-slate-800 text-slate-300 border-slate-700',
    cyan: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/35'
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'w-full h-10 rounded-xl bg-midnight-950/90 border border-slate-700/80 px-3.5 text-sm text-slate-100 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none',
      className
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full rounded-xl bg-midnight-950/90 border border-slate-700/80 p-3.5 text-sm text-slate-100 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none',
      className
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-xl bg-slate-800/70 border border-slate-700/30',
        className
      )}
      aria-hidden="true"
    />
  );
}

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-midnight-900/50 p-8 text-center">
      <p className="text-base font-semibold text-slate-100">{title}</p>
      <p className="mt-1 max-w-md text-sm text-slate-400">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Brand wordmark: "RAMBO" in red, used as the site logo. */
export function BrandLogo({
  size = 'md',
  className
}: {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    xs: 'text-[8px] tracking-normal',
    sm: 'text-sm tracking-wider',
    md: 'text-lg tracking-wider',
    lg: 'text-4xl sm:text-5xl tracking-widest'
  };
  return (
    <span
      aria-label="John Rambo"
      className={cn('font-black uppercase leading-none text-red-600', sizes[size], className)}
    >
      RAMBO
    </span>
  );
}

/** Pop-up dialog; closes on Escape or a backdrop click. */
export function Modal({
  open,
  title,
  onClose,
  children
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-slate-800 bg-midnight-900 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
