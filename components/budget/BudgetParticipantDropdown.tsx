"use client";

import { ChevronDown } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getInitials } from "@/lib/travelers";

type BudgetParticipantDropdownOption = {
    value: string;
    label: string;
    avatarLabel: string;
    avatarUrl?: string | null;
};

type BudgetParticipantDropdownProps = {
    name: string;
    label: string;
    options: BudgetParticipantDropdownOption[];
    value: string;
    onValueChange: (value: string) => void;
    disabledValue?: string;
};

function ParticipantOptionAvatar({
    option,
}: {
    option: BudgetParticipantDropdownOption;
}) {
    return (
        <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-slate-950 text-[10px] font-black uppercase text-lime-200 shadow-[0_0_16px_rgba(0,0,0,0.24)]"
        >
            {option.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={option.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                />
            ) : (
                getInitials(option.avatarLabel)
            )}
        </span>
    );
}

export function BudgetParticipantDropdown({
    name,
    label,
    options,
    value,
    onValueChange,
    disabledValue,
}: BudgetParticipantDropdownProps) {
    const selectedOption = options.find((option) => option.value === value);

    return (
        <div className="block">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                {label}
            </span>
            <input type="hidden" name={name} value={value} />
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label={`${label}: ${selectedOption?.label || "Select a trip member"}`}
                        disabled={options.length === 0}
                        className="group mt-2 flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2 text-left text-sm font-semibold text-white outline-none transition hover:border-lime-300/30 hover:bg-white/[0.12] focus-visible:border-lime-300/50 focus-visible:ring-2 focus-visible:ring-lime-300/30 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {selectedOption ? (
                            <ParticipantOptionAvatar option={selectedOption} />
                        ) : null}
                        <span className="min-w-0 flex-1 truncate">
                            {selectedOption?.label || "Select a trip member"}
                        </span>
                        <ChevronDown
                            className="h-4 w-4 shrink-0 text-lime-300 transition-transform group-data-[state=open]:rotate-180"
                            aria-hidden="true"
                        />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="start"
                    sideOffset={6}
                    className="z-[120] min-w-[var(--radix-dropdown-menu-trigger-width)] rounded-2xl border border-white/10 bg-[#0c0115]/[0.98] p-1.5 text-white shadow-[0_24px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl"
                >
                    <DropdownMenuRadioGroup
                        value={value}
                        onValueChange={onValueChange}
                    >
                        {options.map((option) => (
                            <DropdownMenuRadioItem
                                key={option.value}
                                value={option.value}
                                disabled={option.value === disabledValue}
                                className="gap-3 rounded-xl py-2 pl-8 pr-3 font-bold text-slate-100 outline-none transition focus:bg-lime-300/15 focus:text-white data-[state=checked]:bg-lime-300/10 data-[state=checked]:text-lime-200 [&>span:first-child]:text-lime-300"
                            >
                                <ParticipantOptionAvatar option={option} />
                                <span className="min-w-0 flex-1 truncate">
                                    {option.label}
                                </span>
                            </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
