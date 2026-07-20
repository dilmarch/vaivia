"use client";

import { CalendarDays } from "lucide-react";
import * as React from "react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DateInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "min" | "max"
> & {
  value?: string;
  defaultValue?: string;
  min?: string;
  max?: string;
};

const DATE_PATTERN = "[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])";
const EARLIEST_DATE = "0001-01-01";
const LATEST_DATE = "9999-12-31";

function sanitizeDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);

  if (digits.length <= 4) return year;
  if (digits.length <= 6) return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

function parseDate(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }

  return date;
}

function formatDate(date: Date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCalendarBoundary(year: number, month: number, day: number) {
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month, day);
  return date;
}

const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  (
    {
      className,
      value,
      defaultValue,
      onChange,
      onBlur,
      min = EARLIEST_DATE,
      max = LATEST_DATE,
      placeholder = "YYYY-MM-DD",
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
      sanitizeDateInput(defaultValue || ""),
    );
    const [open, setOpen] = React.useState(false);
    const currentValue = sanitizeDateInput(
      isControlled ? value || "" : internalValue,
    );
    const selectedDate = parseDate(currentValue);
    const minimumDate = parseDate(min) || getCalendarBoundary(1, 0, 1);
    const maximumDate = parseDate(max) || getCalendarBoundary(9999, 11, 31);
    const currentYear = new Date().getFullYear();
    const calendarStart =
      min === EARLIEST_DATE
        ? getCalendarBoundary(
            Math.min(currentYear - 100, selectedDate?.getFullYear() || currentYear),
            0,
            1,
          )
        : minimumDate;
    const calendarEnd =
      max === LATEST_DATE
        ? getCalendarBoundary(
            Math.max(currentYear + 100, selectedDate?.getFullYear() || currentYear),
            11,
            31,
          )
        : maximumDate;
    const today = new Date();
    const todayValue = formatDate(today);
    const isTodayAvailable = todayValue >= min && todayValue <= max;

    React.useImperativeHandle(forwardedRef, () => inputRef.current!, []);

    React.useEffect(() => {
      if (!isControlled) {
        setInternalValue(sanitizeDateInput(defaultValue || ""));
      }
    }, [defaultValue, isControlled]);

    React.useEffect(() => {
      const form = inputRef.current?.form;
      if (!form || isControlled) return;

      function handleReset() {
        setInternalValue(sanitizeDateInput(defaultValue || ""));
      }

      form.addEventListener("reset", handleReset);
      return () => form.removeEventListener("reset", handleReset);
    }, [defaultValue, isControlled]);

    function updateValidity(input: HTMLInputElement, nextValue: string) {
      const parsed = parseDate(nextValue);
      const isComplete = nextValue.length === 10;
      const isOutOfRange =
        parsed && (parsed < minimumDate || parsed > maximumDate);

      input.setCustomValidity(
        isComplete && (!parsed || isOutOfRange)
          ? `Enter a valid date between ${min} and ${max}.`
          : "",
      );
    }

    function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
      const nextValue = sanitizeDateInput(event.currentTarget.value);
      event.currentTarget.value = nextValue;
      updateValidity(event.currentTarget, nextValue);
      if (!isControlled) setInternalValue(nextValue);
      onChange?.(event);
    }

    function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
      updateValidity(event.currentTarget, event.currentTarget.value);
      onBlur?.(event);
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

    return (
      <Popover open={open} onOpenChange={setOpen}>
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
            minLength={required ? 10 : undefined}
            maxLength={10}
            pattern={DATE_PATTERN}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            className={cn(
              "w-full pr-11 [color-scheme:dark]",
              className,
            )}
            {...props}
          />
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="Open calendar"
              className="absolute inset-y-0 right-0 z-10 inline-flex w-10 cursor-pointer items-center justify-center rounded-r-xl text-lime-300 transition hover:bg-lime-300/10 hover:text-lime-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lime-300/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CalendarDays className="h-5 w-5" aria-hidden="true" />
            </button>
          </PopoverTrigger>
        </div>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="z-[200] w-auto overflow-hidden rounded-2xl border border-lime-300/25 bg-[#0c0115] p-0 text-white shadow-2xl shadow-black/50"
        >
          <Calendar
            mode="single"
            selected={selectedDate}
            defaultMonth={selectedDate || new Date()}
            startMonth={calendarStart}
            endMonth={calendarEnd}
            captionLayout="dropdown"
            disabled={{ before: minimumDate, after: maximumDate }}
            onSelect={(date) => {
              if (!date) return;
              selectValue(formatDate(date));
              setOpen(false);
            }}
            className="bg-transparent text-white"
            classNames={{
              dropdown: "absolute inset-0 cursor-pointer bg-[#0c0115] opacity-0",
              dropdown_root:
                "relative rounded-lg border border-white/10 bg-white/[0.08] shadow-sm focus-within:border-lime-300/50",
              caption_label: "flex h-8 items-center gap-1 px-2 text-sm font-black text-white",
              weekday: "w-9 text-center text-xs font-black text-lime-200/75",
              today: "rounded-lg bg-white/[0.1] text-lime-200",
              selected: "rounded-lg bg-lime-300 text-slate-950",
              outside: "text-slate-600",
              disabled: "text-slate-700 opacity-40",
            }}
          />
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
              disabled={!isTodayAvailable}
              onClick={() => {
                selectValue(todayValue);
                setOpen(false);
              }}
              className="rounded-full bg-lime-300 px-3 py-1.5 text-xs font-black text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Today
            </button>
          </div>
        </PopoverContent>
      </Popover>
    );
  },
);

DateInput.displayName = "DateInput";

export { DateInput, formatDate, parseDate, sanitizeDateInput };
