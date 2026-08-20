import expandedLogo from "../../../public/icons/vaivia-expanded-logo.png";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" aria-label="VAIVIA" role="img">
      <span
        className={`block bg-contain bg-left bg-no-repeat ${
          compact ? "h-9 w-28" : "h-14 w-44"
        }`}
        style={{ backgroundImage: `url(${JSON.stringify(expandedLogo)})` }}
        aria-hidden="true"
      />
    </div>
  );
}
