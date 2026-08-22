import type { ReactNode } from "react";

export const VAIVIA_SETTINGS_SECTIONS = [
  { id: "general", label: "General" },
  { id: "profile", label: "Profile Details" },
  { id: "time-date", label: "Time/date" },
  { id: "language", label: "Language" },
  { id: "security", label: "Password & Security" },
  { id: "communications", label: "Communications" },
  { id: "data", label: "Data" },
  { id: "categories", label: "Categories" },
  { id: "family", label: "Family Members" },
  { id: "financial", label: "Financial" },
] as const;

export type VaiviaSettingsSection = (typeof VAIVIA_SETTINGS_SECTIONS)[number]["id"];

export function SettingsNavigationPresentation({
  activeSection,
  renderItem,
}: {
  activeSection: VaiviaSettingsSection;
  renderItem: (options: {
    id: VaiviaSettingsSection;
    label: string;
    className: string;
    isActive: boolean;
  }) => ReactNode;
}) {
  return (
    <aside className="rounded-[1.5rem] border border-white/10 bg-[#080511]/90 p-3 shadow-2xl shadow-black/30">
      <p className="px-3 py-2 text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
        Settings
      </p>
      <nav className="mt-2 space-y-2" aria-label="Settings">
        {VAIVIA_SETTINGS_SECTIONS.map((section) => {
          const isActive = activeSection === section.id;
          return renderItem({
            ...section,
            isActive,
            className: `block w-full rounded-full px-4 py-2 text-left text-sm font-bold transition ${
              isActive
                ? "bg-lime-300 text-slate-950"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`,
          });
        })}
      </nav>
    </aside>
  );
}
