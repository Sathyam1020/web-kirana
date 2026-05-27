"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  DIAL_CODES,
  DEFAULT_DIAL_CODE,
  digitsOnly,
  type DialCode,
} from "@workspace/ui/lib/phone"
import { cn } from "@workspace/ui/lib/utils"

interface PhoneInputProps {
  /** Local digits (no country code, no symbols). */
  value: string
  onValueChange: (digits: string) => void
  /** ISO 3166-1 alpha-2. Defaults to IN. */
  countryCode?: string
  onCountryChange?: (code: string) => void
  id?: string
  required?: boolean
  autoFocus?: boolean
  autoComplete?: string
  /** Max digits in the LOCAL portion (default 15 — sane upper bound). */
  maxLength?: number
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function PhoneInput({
  value,
  onValueChange,
  countryCode,
  onCountryChange,
  id,
  required,
  autoFocus,
  autoComplete = "tel-national",
  maxLength = 15,
  placeholder = "98765 43210",
  disabled,
  className,
}: PhoneInputProps) {
  const [open, setOpen] = React.useState(false)
  const selected = React.useMemo<DialCode>(() => {
    return (
      DIAL_CODES.find((d) => d.code === countryCode) ?? DEFAULT_DIAL_CODE
    )
  }, [countryCode])

  return (
    <div
      className={cn(
        "flex h-14 w-full items-stretch overflow-hidden rounded-[var(--radius-lg)] border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:border-ring transition-colors",
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-label={`Country code, currently ${selected.name}`}
            className="flex items-center gap-1.5 pl-3 pr-2 bg-surface-soft text-sm hover:bg-surface-strong transition-colors border-r border-border focus:outline-none"
          >
            <span className="text-lg leading-none" aria-hidden>
              {selected.flag}
            </span>
            <span className="tabular-nums text-xs font-medium">
              +{selected.dial}
            </span>
            <ChevronsUpDown className="size-3 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-72 p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command>
            <CommandInput placeholder="Search country" />
            <CommandList>
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup>
                {DIAL_CODES.map((c) => {
                  const active = c.code === selected.code
                  return (
                    <CommandItem
                      key={c.code}
                      value={`${c.name} ${c.dial} ${c.code}`}
                      onSelect={() => {
                        onCountryChange?.(c.code)
                        setOpen(false)
                      }}
                    >
                      <span className="text-base" aria-hidden>
                        {c.flag}
                      </span>
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="tabular-nums text-xs text-muted-foreground">
                        +{c.dial}
                      </span>
                      <Check
                        className={cn(
                          "size-4 ml-1",
                          active ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        required={required}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onValueChange(digitsOnly(e.target.value))}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-background px-4 text-base outline-none tabular-nums placeholder:text-muted-foreground/60"
      />
    </div>
  )
}
