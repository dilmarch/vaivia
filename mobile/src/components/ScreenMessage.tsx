import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type ScreenMessageProps = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function ScreenMessage({
  title,
  message,
  actionLabel,
  onAction,
}: ScreenMessageProps) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-6 text-center">
      <AlertCircle className="mx-auto h-7 w-7 text-fuchsia-300" aria-hidden="true" />
      <h2 className="mt-4 text-xl font-black text-white">{title}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">{message}</p>
      {actionLabel && onAction ? (
        <Button
          type="button"
          onClick={onAction}
          className="mt-5 h-11 rounded-full bg-lime-300 px-6 font-black text-slate-950 hover:bg-lime-200"
        >
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
