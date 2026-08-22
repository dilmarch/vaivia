# VAIVIA mobile auth callbacks

Phase 1 uses Supabase PKCE with the registered iOS custom scheme
`com.dreamhaus.vaivia`.

- Email confirmation and confirmed email changes return to
  `com.dreamhaus.vaivia://auth/confirm`.
- Password recovery returns to
  `com.dreamhaus.vaivia://auth/recovery`.
- The Capacitor client accepts only those two callback paths, exchanges the
  one-time PKCE code through the existing mobile Supabase client, and never
  logs or persists the code itself.

Both URLs must be present in the Supabase Auth redirect allowlist before the
email flows can be tested on a device. The custom scheme is registered in the
iOS app's `Info.plist`; no Associated Domains capability is required for this
Phase 1 callback.

Google, Microsoft, and Apple OAuth are intentionally not enabled here. A later
OAuth phase should route provider callbacks through this same callback parser
and Phase 0 route model. Universal links can replace or supplement the custom
scheme later without changing the route representation or account APIs.
