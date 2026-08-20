import Link from "next/link";
import {
    AccommodationPageTabsPresentation,
    type StayViewTab,
} from "@/components/accommodations/StaysPresentation";

export type AccommodationPageTab = StayViewTab;

type AccommodationPageTabsProps = {
    activeTab: AccommodationPageTab;
    baseHref: string;
};

export default function AccommodationPageTabs({
    activeTab,
    baseHref,
}: AccommodationPageTabsProps) {
    return (
        <AccommodationPageTabsPresentation
            activeTab={activeTab}
            renderTab={(tab, props) => {
                const href =
                    tab.id === "planning"
                        ? `${baseHref}?tab=planning`
                        : baseHref;

                return (
                    <Link
                        key={tab.id}
                        href={href}
                        aria-current={activeTab === tab.id ? "page" : undefined}
                        {...props}
                    />
                );
            }}
        />
    );
}
