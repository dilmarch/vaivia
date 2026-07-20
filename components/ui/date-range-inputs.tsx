"use client";

import * as React from "react";
import { DateInput } from "@/components/ui/date-input";
import { getValidEndDate } from "@/lib/dateRange";

type DateRangeInputsProps = {
  startName: string;
  endName: string;
  startLabel: string;
  endLabel: string;
  initialStartDate?: string | null;
  initialEndDate?: string | null;
  startId?: string;
  endId?: string;
  required?: boolean;
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
};

export function DateRangeInputs({
  startName,
  endName,
  startLabel,
  endLabel,
  initialStartDate,
  initialEndDate,
  startId,
  endId,
  required = false,
  className = "grid gap-4 sm:grid-cols-2",
  labelClassName = "text-sm font-medium text-slate-700",
  inputClassName,
}: DateRangeInputsProps) {
  const [startDate, setStartDate] = React.useState(initialStartDate || "");
  const [endDate, setEndDate] = React.useState(() =>
    getValidEndDate(initialStartDate || "", initialEndDate || ""),
  );

  React.useEffect(() => {
    const nextStartDate = initialStartDate || "";
    setStartDate(nextStartDate);
    setEndDate(
      getValidEndDate(nextStartDate, initialEndDate || ""),
    );
  }, [initialEndDate, initialStartDate]);

  return (
    <div className={className}>
      <label className="block">
        <span className={labelClassName}>{startLabel}</span>
        <DateInput
          id={startId}
          name={startName}
          value={startDate}
          required={required}
          onChange={(event) => {
            const nextStartDate = event.target.value;
            setStartDate(nextStartDate);
            setEndDate((currentEndDate) =>
              getValidEndDate(nextStartDate, currentEndDate),
            );
          }}
          className={inputClassName}
        />
      </label>

      <label className="block">
        <span className={labelClassName}>{endLabel}</span>
        <DateInput
          id={endId}
          name={endName}
          value={endDate}
          min={startDate || undefined}
          required={required}
          onChange={(event) =>
            setEndDate(getValidEndDate(startDate, event.target.value))
          }
          className={inputClassName}
        />
      </label>
    </div>
  );
}
