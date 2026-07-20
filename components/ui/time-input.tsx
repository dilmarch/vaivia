"use client";

import { Clock3 } from "lucide-react";
import * as React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type TimeInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "min" | "max"
> & {
  value?: string;
  defaultValue?: string;
  min?: string;
  max?: string;
};

const TIME_PATTERN = "([01][0-9]|2[0-3]):[0-5][0-9]";
const HOURS = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0"),
);
const MINUTES = Array.from({ length: 60 }, (_, minute) =>
  String(minute).padStart(2, "0"),
);

function sanitizeTimeInput(value: string) {
  const colonIndex = value.indexOf(":");

  if (colonIndex >= 0) {
    const hourDigits = value
      .slice(0, colonIndex)
      .replace(/\D/g, "")
      .slice(0, 2);
    const minuteDigits = value
      .slice(colonIndex + 1)
      .replace(/\D/g, "")
      .slice(0, 2);

    if (!hourDigits) return minuteDigits;

    return `${hourDigits.padStart(2, "0")}:${minuteDigits}`;
  }

  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (!digits) return "";

  const firstDigit = Number(digits[0]);
  if (firstDigit > 2) {
    return `0${digits[0]}:${digits.slice(1, 3)}`;
  }

  if (digits.length === 1) return digits;

  const hourCandidate = Number(digits.slice(0, 2));
  if (hourCandidate <= 23) {
    return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
  }

  return `0${digits[0]}:${digits.slice(1, 3)}`;
}

function parseTime(value?: string | null) {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return null;
  }

  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute, totalMinutes: hour * 60 + minute };
}

function formatTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const TimeInput = React.forwardRef<HTMLInputElement, TimeInputProps>(
  (
    {
      className,
      value,
      defaultValue,
      onChange,
      onBlur,
      min = "00:00",
      max = "23:59",
      placeholder = "HH:MM",
      disabled,
      required,
      id,
      name,
      ...props
    },
    forwardedRef,
  ) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = React.useState(() =>
      sanitizeTimeInput(defaultValue || ""),
    );
    const [open, setOpen] = React.useState(false);
    const currentValue = sanitizeTimeInput(
      isControlled ? value || "" : internalValue,
    );
    const parsedValue = parseTime(currentValue);
    const minimumMinutes = parseTime(min)?.totalMinutes ?? 0;
    const maximumMinutes = parseTime(max)?.totalMinutes ?? 23 * 60 + 59;
    const now = new Date();
    const nowValue = formatTime(now.getHours(), now.getMinutes());
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const isNowAvailable =
      nowMinutes >= minimumMinutes && nowMinutes <= maximumMinutes;
    const [draftHour, setDraftHour] = React.useState(
      String(parsedValue?.hour ?? now.getHours()).padStart(2, "0"),
    );
    const [draftMinute, setDraftMinute] = React.useState(
      String(parsedValue?.minute ?? now.getMinutes()).padStart(2, "0"),
    );

    React.useImperativeHandle(forwardedRef, () => inputRef.current!, []);

    React.useEffect(() => {
      if (!isControlled) {
        setInternalValue(sanitizeTimeInput(defaultValue || ""));
      }
    }, [defaultValue, isControlled]);

    React.useEffect(() => {
      const form = inputRef.current?.form;
      if (!form || isControlled) return;

      function handleReset() {
        setInternalValue(sanitizeTimeInput(defaultValue || ""));
      }

      form.addEventListener("reset", handleReset);
      return () => form.removeEventListener("reset", handleReset);
    }, [defaultValue, isControlled]);

    function updateValidity(input: HTMLInputElement, nextValue: string) {
      const parsed = parseTime(nextValue);
      const isComplete = nextValue.length === 5;
      const isOutOfRange =
        parsed &&
        (parsed.totalMinutes < minimumMinutes ||
          parsed.totalMinutes > maximumMinutes);

      input.setCustomValidity(
        isComplete && (!parsed || isOutOfRange)
          ? `Enter a valid time between ${min} and ${max}.`
          : "",
      );
    }

    function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
      const nextValue = sanitizeTimeInput(event.currentTarget.value);
      event.currentTarget.value = nextValue;
      updateValidity(event.currentTarget, nextValue);
      if (!isControlled) setInternalValue(nextValue);
      onChange?.(event);
    }

    function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
      const previousValue = sanitizeTimeInput(event.currentTarget.value);
      updateValidity(event.currentTarget, previousValue);
      onBlur?.(event);

      const nextValue = sanitizeTimeInput(event.currentTarget.value);
      if (nextValue === previousValue) return;

      event.currentTarget.value = nextValue;
      updateValidity(event.currentTarget, nextValue);
      if (!isControlled) {
        setInternalValue(nextValue);
      } else {
        event.currentTarget.dispatchEvent(
          new Event("input", { bubbles: true }),
        );
      }
    }

    function selectValue(nextValue: string) {
      const input = inputRef.current;
      if (!input) return;

      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(input, nextValue);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function handleOpenChange(nextOpen: boolean) {
      if (nextOpen) {
        const nextTime = parseTime(currentValue);
        const nextDate = new Date();
        setDraftHour(
          String(nextTime?.hour ?? nextDate.getHours()).padStart(2, "0"),
        );
        setDraftMinute(
          String(nextTime?.minute ?? nextDate.getMinutes()).padStart(2, "0"),
        );
      }
      setOpen(nextOpen);
    }

    const draftValue = `${draftHour}:${draftMinute}`;
    const draftMinutes = Number(draftHour) * 60 + Number(draftMinute);
    const isDraftAvailable =
      draftMinutes >= minimumMinutes && draftMinutes <= maximumMinutes;

    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <div className="relative">
          <input
            ref={inputRef}
            id={id}
            name={name}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={currentValue}
            onChange={handleChange}
            onBlur={handleBlur}
            minLength={required ? 5 : undefined}
            maxLength={5}
            pattern={TIME_PATTERN}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            className={cn("w-full pr-11 [color-scheme:dark]", className)}
            {...props}
          />
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="Open time selector"
              className="absolute inset-y-0 right-0 z-10 inline-flex w-10 cursor-pointer items-center justify-center rounded-r-xl text-lime-300 transition hover:bg-lime-300/10 hover:text-lime-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lime-300/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Clock3 className="h-5 w-5" aria-hidden="true" />
            </button>
          </PopoverTrigger>
        </div>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="z-[200] w-72 overflow-hidden rounded-2xl border border-lime-300/25 bg-[#0c0115] p-0 text-white shadow-2xl shadow-black/50"
        >
          <div className="p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-lime-200/75">
              Select time
            </p>
            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <label className="space-y-1.5">
                <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                  Hour
                </span>
                <select
                  value={draftHour}
                  onChange={(event) => setDraftHour(event.target.value)}
                  className="h-11 w-full cursor-pointer rounded-xl border border-white/10 bg-white/[0.08] px-3 text-center text-base font-black text-white outline-none transition focus:border-lime-300/50 focus:ring-2 focus:ring-lime-300/20"
                >
                  {HOURS.map((hour) => (
                    <option key={hour} value={hour} className="bg-[#0c0115]">
                      {hour}
                    </option>
                  ))}
                </select>
              </label>
              <span className="pb-2 text-xl font-black text-lime-300">:</span>
              <label className="space-y-1.5">
                <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                  Minute
                </span>
                <select
                  value={draftMinute}
                  onChange={(event) => setDraftMinute(event.target.value)}
                  className="h-11 w-full cursor-pointer rounded-xl border border-white/10 bg-white/[0.08] px-3 text-center text-base font-black text-white outline-none transition focus:border-lime-300/50 focus:ring-2 focus:ring-lime-300/20"
                >
                  {MINUTES.map((minute) => (
                    <option
                      key={minute}
                      value={minute}
                      className="bg-[#0c0115]"
                    >
                      {minute}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              disabled={!isDraftAvailable}
              onClick={() => {
                selectValue(draftValue);
                setOpen(false);
              }}
              className="mt-4 w-full rounded-full bg-lime-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Set time
            </button>
          </div>
          <div className="flex items-center justify-between border-t border-white/10 px-3 py-2">
            <button
              type="button"
              onClick={() => {
                selectValue("");
                setOpen(false);
              }}
              className="rounded-full px-3 py-1.5 text-xs font-black text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={!isNowAvailable}
              onClick={() => {
                selectValue(nowValue);
                setOpen(false);
              }}
              className="rounded-full px-3 py-1.5 text-xs font-black text-lime-200 transition hover:bg-lime-300/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Now
            </button>
          </div>
        </PopoverContent>
      </Popover>
    );
  },
);

TimeInput.displayName = "TimeInput";

export { TimeInput, formatTime, parseTime, sanitizeTimeInput };
