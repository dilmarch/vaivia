import { createElement, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type TripSectionHeadingProps = {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  titleAs?: ElementType;
  className?: string;
  eyebrowClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
};

export function TripSectionHeading({
  eyebrow,
  title,
  description,
  titleAs = "h2",
  className,
  eyebrowClassName,
  titleClassName,
  descriptionClassName,
}: TripSectionHeadingProps) {
  return (
    <div className={className}>
      <p
        className={cn(
          "text-xs font-bold uppercase tracking-[0.55em] text-lime-200/80",
          eyebrowClassName,
        )}
      >
        {eyebrow}
      </p>
      {createElement(
        titleAs,
        {
          className: cn("mt-2 text-3xl font-black text-white", titleClassName),
        },
        title,
      )}
      {description ? (
        <p
          className={cn(
            "mt-2 text-sm font-semibold leading-6 text-slate-400",
            descriptionClassName,
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

type ItineraryDateHeadingProps = {
  children: ReactNode;
  className?: string;
};

export function ItineraryDateHeading({
  children,
  className,
}: ItineraryDateHeadingProps) {
  return (
    <h3
      className={cn(
        "border-b border-lime-300/20 pb-3 text-2xl font-black tracking-tight text-lime-300",
        className,
      )}
    >
      {children}
    </h3>
  );
}
