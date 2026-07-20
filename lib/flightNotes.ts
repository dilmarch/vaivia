const STRUCTURED_FLIGHT_NOTE_PREFIX =
  /^(?:Duration|Departure time zone|Arrival time zone|Flight legs|Leg \d+|Flight|Airline|Departure|Arrival|Departure terminal|Arrival terminal|Departure terminal\/platform|Arrival terminal\/platform|VISA requirements|Luggage requirements|Roundtrip|Price|Stops|Preferred taxi company \/ ride sharing app|Scenario leg \d+ of \d+|Pros|Cons):/i;

/**
 * Older flight records store structured modal fields in notes for backwards
 * compatibility. Keep those records readable without presenting the same
 * information twice in the Notes section.
 */
export function stripStructuredFlightNotes(notes?: string | null) {
  if (!notes?.trim()) return "";

  return notes
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(
      (paragraph) =>
        paragraph && !STRUCTURED_FLIGHT_NOTE_PREFIX.test(paragraph),
    )
    .join("\n\n");
}
