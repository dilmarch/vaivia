# VAIVIA Travel Companion

Manifest V3 Chrome extension for reviewing hotel and flight details from the active tab and saving them into VAIVIA.

## Local build

```bash
npm install
npm run build
```

Then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `browser-extension/dist`.

The default build connects to `https://app.thetravellinglinguist.com`. To build against local VAIVIA:

```bash
VITE_VAIVIA_APP_URL=http://localhost:3000 npm run build
```

Chrome will ask for access to the local origin when the user chooses **Connect to VAIVIA**.

## Current supported extraction

- Schema.org `Hotel`, `LodgingBusiness`, `Flight`, and `FlightReservation` data
- Booking.com/Expedia-style semantic price, address, room, and date fields
- Accessible flight-card fallbacks where airport codes, ISO dates, and times are visible
- Local confirmation-page classification with explicit user review before saving
- Opt-in confirmation prompts on Booking.com, Expedia, Hotels.com, Kayak, Air Canada, and WestJet domains

Site adapters should remain packaged in the extension. Never download executable parser logic at runtime.
