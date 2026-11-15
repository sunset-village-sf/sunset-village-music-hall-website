'use client'

import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Password field with an eye button that shows or hides what's typed. */
function PasswordInput({ className, ...props }: Omit<React.ComponentProps<typeof Input>, 'type'>) {
  const [shown, setShown] = React.useState(false)
  const Icon = shown ? EyeOff : Eye
  return (
    <div className="relative">
      <Input type={shown ? 'text' : 'password'} className={cn('pr-11', className)} {...props} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        aria-controls={props.id}
        className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center rounded-r-md text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
      >
        <Icon className="size-4.5" aria-hidden="true" />
      </button>
    </div>
  )
}

export { PasswordInput }
