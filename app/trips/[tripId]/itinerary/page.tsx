import TripDetailPage from "../page";

type PageProps = {
    params: Promise<{
        tripId: string;
    }>;
    searchParams?: Promise<{
        tab?: string;
        add?: string;
        addedScenario?: string;
        addedTransportation?: string;
    }>;
};

export default function TripItineraryPage({ params, searchParams }: PageProps) {
    const itinerarySearchParams = (async () => ({
        ...(searchParams ? await searchParams : {}),
        tab: "itinerary",
        _route: "itinerary",
    }))();

    return <TripDetailPage params={params} searchParams={itinerarySearchParams} />;
}
