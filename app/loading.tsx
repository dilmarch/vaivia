import VaiviaLoadingScreen from "@/components/VaiviaLoadingScreen";

export default function Loading() {
    return (
        <div className="flex min-h-[calc(100dvh-7rem)] items-center justify-center px-4 py-10">
            <VaiviaLoadingScreen />
        </div>
    );
}
