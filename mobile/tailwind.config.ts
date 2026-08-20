import type { Config } from "tailwindcss";
import sharedConfig from "../tailwind.config";

export default {
  ...sharedConfig,
  content: [
    "./mobile/**/*.{js,ts,jsx,tsx}",
    "./components/itinerary/**/*.{js,ts,jsx,tsx}",
    "./components/accommodations/**/*Presentation.tsx",
    "./components/accommodations/AccommodationCoverageTimeline.tsx",
    "./components/ideas/**/*.{js,ts,jsx,tsx}",
    "./components/food/**/*.{js,ts,jsx,tsx}",
    "./components/TripNotepadComposer.tsx",
    "./components/budget/BudgetPresentation.tsx",
    "./components/navigation/MobileAppChromePresentation.tsx",
    "./components/transport/**/*.{js,ts,jsx,tsx}",
    "./components/trips/**/*Presentation.tsx",
    "./components/AirlineIcon.tsx",
    "./components/TripCountdown.tsx",
    "./components/ui/{button,calendar,date-input,popover}.tsx",
    "./lib/utils.ts",
  ],
} satisfies Config;
