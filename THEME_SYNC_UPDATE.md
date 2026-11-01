# RMCTI global theme synchronization

- Unified the landing page, login page, admin portal, teacher portal and student portal on the same `rmcti-theme` preference.
- Retained compatibility with the previous `tuition-theme` and `theme` localStorage keys.
- A theme selection now applies both the portal `html[data-theme]` CSS variables and the landing page `body.dark-mode` class.
- Theme changes synchronize across open tabs using the storage event and BroadcastChannel where supported.
- All pages load the updated theme controller with a new cache-busting version.
- Theme state is read at page startup, so navigation between pages keeps the selected appearance.
- No backend, database, login or business logic was changed.
