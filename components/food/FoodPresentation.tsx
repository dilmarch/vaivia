import {
    Check,
    Coffee,
    ExternalLink,
    ImageIcon,
    Pencil,
    Plus,
    Utensils,
} from "lucide-react";
import type { ReactNode } from "react";
import {
    formatFoodMealCategory,
    type FoodItemType,
    type TripFoodItem,
} from "@/lib/tripFood";

type SerializedOpeningHours = {
    open_now?: boolean;
    weekday_text?: string[];
    periods?: unknown[];
};

function parseOpeningHours(value: TripFoodItem["regular_opening_hours"]) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as SerializedOpeningHours;
}

function isOpen24Hours(hours: SerializedOpeningHours) {
    const weekdayText = hours.weekday_text || [];
    if (
        weekdayText.length > 0 &&
        weekdayText.every((entry) => /open 24 hours/i.test(entry))
    ) {
        return true;
    }

    const periods = Array.isArray(hours.periods) ? hours.periods : [];
    if (periods.length !== 1) return false;
    const period = periods[0] as {
        open?: { day?: number; time?: string };
        close?: { day?: number; time?: string };
    };
    return (
        period.open?.day === 0 &&
        period.open?.time === "0000" &&
        (!period.close || !period.close.time)
    );
}

function getTodayOpeningHoursText(hours: SerializedOpeningHours) {
    const weekdayText = hours.weekday_text || [];
    if (weekdayText.length === 0) return null;
    const today = new Date().getDay();
    const todayText = weekdayText[today === 0 ? 6 : today - 1];
    return todayText?.replace(/^[^:]+:\s*/, "") || null;
}

export function FoodOpeningHoursBadgePresentation({
    item,
}: {
    item: TripFoodItem;
}) {
    const hours = parseOpeningHours(item.regular_opening_hours);
    if (!hours) return null;

    const is24Hours = isOpen24Hours(hours);
    const todayText = getTodayOpeningHoursText(hours);
    const statusText = is24Hours
        ? "Open 24 hours"
        : hours.open_now === true
          ? "Open now"
          : hours.open_now === false
            ? "Closed now"
            : todayText
              ? "Hours today"
              : "Hours available";
    const detailText = !is24Hours && todayText ? todayText : null;

    return (
        <div className="mt-3 inline-flex max-w-full flex-col rounded-2xl border border-lime-300/20 bg-lime-300/10 px-3 py-2 text-lime-100 shadow-[0_0_20px_rgba(var(--vaivia-neon-rgb),0.08)]">
            <span className="text-xs font-black uppercase tracking-[0.16em]">
                {statusText}
            </span>
            {detailText ? (
                <span className="mt-1 max-w-full truncate text-xs font-semibold text-slate-300">
                    {detailText}
                </span>
            ) : null}
        </div>
    );
}

export function FoodPlaceCoverPlaceholder() {
    return (
        <div className="relative h-44 overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(var(--vaivia-neon-rgb),0.2),transparent_52%),linear-gradient(135deg,#172033,#03030a_70%)]">
            <div className="absolute inset-0 flex items-center justify-center">
                <ImageIcon className="h-10 w-10 text-lime-200/35" aria-hidden="true" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-slate-950/10" />
        </div>
    );
}

export function FoodCardPresentation({
    item,
    cover,
    reactionBar,
    onEdit,
    renderTriedAction,
}: {
    item: TripFoodItem;
    cover?: ReactNode;
    reactionBar?: ReactNode;
    onEdit?: () => void;
    renderTriedAction?: (action: ReactNode) => ReactNode;
}) {
    const triedAction = (
        <button
            type={renderTriedAction ? "submit" : "button"}
            disabled={!renderTriedAction}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${
                item.current_user_tried
                    ? "border-lime-300 bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.24)]"
                    : "border-white/20 bg-white/[0.04] text-transparent hover:border-lime-300/60 hover:bg-white/[0.08]"
            }`}
            aria-pressed={item.current_user_tried}
            aria-label={
                item.current_user_tried
                    ? `Mark ${item.name} as not tried`
                    : `Mark ${item.name} as tried`
            }
            title={
                renderTriedAction
                    ? item.current_user_tried
                        ? "Tried"
                        : "Mark as tried"
                    : "Tried status is read-only on mobile"
            }
        >
            {item.current_user_tried ? (
                <Check className="h-4 w-4" aria-hidden="true" />
            ) : null}
        </button>
    );

    return (
        <article
            className={`relative overflow-hidden rounded-[1.75rem] border shadow-2xl shadow-black/20 transition duration-300 hover:-translate-y-1 ${
                item.current_user_tried
                    ? "border-white/10 bg-[#03030a]/70 opacity-85"
                    : "border-white/10 bg-[#03030a]/90"
            }`}
        >
            {cover}
            <div className="relative p-5">
                <button
                    type="button"
                    onClick={onEdit}
                    disabled={!onEdit}
                    className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-slate-950/70 text-white shadow-xl shadow-black/30 backdrop-blur transition hover:-translate-y-0.5 hover:border-lime-300/50 hover:bg-lime-300 hover:text-slate-950"
                    aria-label={`Edit ${item.name}`}
                    title={onEdit ? "Edit" : "Editing is available on web"}
                >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <div className="flex items-start gap-4">
                    <div className="pt-1">
                        {renderTriedAction ? renderTriedAction(triedAction) : triedAction}
                    </div>

                    <div className="min-w-0 flex-1 pr-10">
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs font-bold uppercase tracking-[0.22em] text-lime-300">
                                {item.item_type === "place" ? "Place to Eat" : "Food to Try"}
                            </p>
                            {item.current_user_tried ? (
                                <span className="rounded-full border border-lime-300/30 bg-lime-300/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-lime-100">
                                    Tried
                                </span>
                            ) : null}
                        </div>
                        <h3 className="mt-2 text-2xl font-black tracking-tight text-white">
                            {item.name}
                        </h3>
                        {item.formatted_address || item.region ? (
                            <p className="mt-2 text-sm font-semibold text-slate-200">
                                {item.formatted_address || item.region}
                            </p>
                        ) : null}
                        {item.item_type === "place" ? (
                            <FoodOpeningHoursBadgePresentation item={item} />
                        ) : null}
                        {item.description ? (
                            <p className="mt-2 text-sm leading-6 text-slate-300">
                                {item.description}
                            </p>
                        ) : null}
                        {item.personal_note ? (
                            <p className="mt-2 text-sm leading-6 text-slate-300">
                                {item.personal_note}
                            </p>
                        ) : null}
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    {item.meal_categories.map((meal) => (
                        <span
                            key={meal}
                            className="rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1 text-xs font-semibold text-slate-200"
                        >
                            {formatFoodMealCategory(meal)}
                        </span>
                    ))}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    {item.website_url ? <FoodLink href={item.website_url}>Website</FoodLink> : null}
                    {item.google_maps_url ? <FoodLink href={item.google_maps_url}>Maps</FoodLink> : null}
                    {item.phone_number ? (
                        <a
                            href={`tel:${item.phone_number}`}
                            className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-slate-200 transition hover:border-lime-300/50 hover:bg-white/10 hover:text-white"
                        >
                            Phone
                        </a>
                    ) : null}
                    {item.facebook_url ? <FoodLink href={item.facebook_url} externalIcon={false}>Facebook</FoodLink> : null}
                    {item.instagram_url ? <FoodLink href={item.instagram_url} externalIcon={false}>Instagram</FoodLink> : null}
                </div>

                {reactionBar}

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                    <p className="text-xs font-semibold text-slate-400">
                        {item.tried_count || 0} tried
                    </p>
                </div>
            </div>
        </article>
    );
}

function FoodLink({
    href,
    children,
    externalIcon = true,
}: {
    href: string;
    children: ReactNode;
    externalIcon?: boolean;
}) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`${externalIcon ? "inline-flex items-center gap-1" : ""} rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-slate-200 transition hover:border-lime-300/50 hover:bg-white/10 hover:text-white`}
        >
            {children}
            {externalIcon ? <ExternalLink className="h-3 w-3" aria-hidden="true" /> : null}
        </a>
    );
}

export function FoodLoadingPresentation() {
    return (
        <section className="space-y-6 px-4 pb-24 pt-10 text-white sm:px-6 lg:px-8" role="status" aria-label="Loading Eat & Drink">
            <div className="h-28 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/[0.045] motion-reduce:animate-none" />
            <div className="h-14 w-full max-w-sm animate-pulse rounded-full border border-white/10 bg-[#03030a] motion-reduce:animate-none" />
            <div className="grid gap-5 md:grid-cols-2">
                {Array.from({ length: 4 }, (_, index) => (
                    <div key={index} className="h-96 animate-pulse rounded-[1.75rem] border border-white/10 bg-[#03030a]/90 motion-reduce:animate-none" />
                ))}
            </div>
        </section>
    );
}

export function FoodPresentation({
    activeTab,
    items,
    beforeContent,
    renderAddAction,
    renderTab,
    renderCard,
}: {
    activeTab: FoodItemType;
    items: TripFoodItem[];
    beforeContent?: ReactNode;
    renderAddAction: (label: string, action: ReactNode) => ReactNode;
    renderTab: (tab: FoodItemType, label: string, className: string) => ReactNode;
    renderCard: (item: TripFoodItem) => ReactNode;
}) {
    const selectedItems = items.filter((item) => item.item_type === activeTab);
    const addLabel = activeTab === "place" ? "Add a Place" : "Add a Food";
    const addAction = (
        <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:-translate-y-0.5 hover:bg-lime-200"
        >
            <Plus className="h-5 w-5" aria-hidden="true" />
            Add Food
        </button>
    );

    return (
        <section className="space-y-6 px-4 pb-24 pt-10 text-white sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">Eat &amp; Drink</p>
                    <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">Eat &amp; Drink</h1>
                    <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-300">Save places to eat and local flavours to try.</p>
                </div>
                {renderAddAction("Add Food", addAction)}
            </div>

            {beforeContent}

            <div className="inline-flex rounded-full border border-white/10 bg-[#03030a] p-1 shadow-2xl shadow-black/20">
                {(["place", "food"] as const).map((tab) => {
                    const label = tab === "place" ? "Places to Eat" : "Foods to Try";
                    const className = `rounded-full px-5 py-2.5 text-sm font-black uppercase tracking-wide transition ${
                        activeTab === tab
                            ? "bg-lime-300 text-slate-950"
                            : "text-slate-300 hover:bg-white/10 hover:text-white"
                    }`;
                    return <div key={tab} className="contents">{renderTab(tab, label, className)}</div>;
                })}
            </div>

            {selectedItems.length === 0 ? (
                <div className="rounded-[1.75rem] border border-dashed border-white/15 bg-white/[0.045] p-8 text-center">
                    {activeTab === "place" ? <Coffee className="mx-auto h-10 w-10 text-lime-300" /> : <Utensils className="mx-auto h-10 w-10 text-lime-300" />}
                    <h2 className="mt-4 text-2xl font-black">{activeTab === "place" ? "No places saved yet" : "No foods saved yet"}</h2>
                    <p className="mx-auto mt-2 max-w-md text-sm text-slate-300">
                        {activeTab === "place"
                            ? "Save restaurants, cafes, bars, markets, and other spots you want to visit."
                            : "Make a list of local dishes, drinks, and specialties to try on your trip."}
                    </p>
                    <div className="mt-5">{renderAddAction(addLabel, <button type="button" className="rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950">{addLabel}</button>)}</div>
                </div>
            ) : (
                <div className="grid gap-5 md:grid-cols-2">{selectedItems.map(renderCard)}</div>
            )}
        </section>
    );
}
