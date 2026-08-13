# DineWise DEVLOG

## Update (2026-08-12)

### Outcome Logging Now Feeds Recommendations

- "I followed this" / "I ordered delivery" were previously local-only vanity stats; they now influence output.
- Frontend derives a follow-through rate from the last 7 logged outcomes.
- Risk meter weighting shifts when follow-through data exists:
  - status 0.40, delivery 0.28, budget 0.22, slip 0.10
  - falls back to the original weights when nothing has been logged
- Weekly avoidable waste increases slightly as slip rate rises.
- POST /nudge now accepts optional `recent_followed` and `recent_logged` (backward compatible).
- Backend uses follow-through to:
  - add a factual line to the nudge prompt (never invented, derived from real counts)
  - reinforce the streak when rate >= 0.6, or emphasize a low-effort move when below
  - scale the weekly avoidable spend estimate
  - surface a "Follow-through: X/Y" evidence chip feeding the confidence label

### Home Screen UX

- App icon now appears in a circular frame beside the DineWise title on the home header.
- Replaced the leftover Expo placeholder animated icon in that slot.
- Craving Check field order changed to: meal plan status, budget outside meal plan, vibe, delivery frequency, craving.
- "Surprise me" moved to the Craving field header; the duplicate in the panel header was removed.
- Generating a nudge now auto-collapses the Craving Check so results are visible without scrolling.
- While a nudge is generating, the "Crave Something?" slot becomes a spinner plus "Finding your best move...".
- Best Move card gained show/hide. When hidden it stays as a compact card with a Show button rather than disappearing.
- Best Move auto-expands whenever a new nudge arrives.

### Transitions

- Stack navigation now uses a consistent screen animation with gestures enabled.
- Login and loading screens fade in, so the splash-to-login handoff is no longer abrupt.
- Craving panel and Best Move card animate on both enter and exit.
- Shared collapsible component now animates on close, not just open.
- Motion constants retuned for a smoother feel: fast 170ms, balanced 240ms, cinematic 340ms.

### Bug Fixes and Optimizations

- Fixed a data-loss race where the outcome-state write ran before the AsyncStorage read resolved and could wipe saved history.
- DeviceMotion is now subscribed only while the dashboard is visible, instead of during login/onboarding.
- Looping wave/bob animations now start only on the dashboard and are cancelled on cleanup.
- Deduplicated `nudge_points` and `evidence_inputs` to remove duplicate React keys.
- Removed dead `authMode` state and its orphaned styles.

### App Icon Configuration

- `icon`, `ios.icon`, `android.adaptiveIcon.foregroundImage`, and `web.favicon` now point at the real app icon.
- Android adaptive icon background set to the startup palette color.
- Launcher icons still require a new native build to appear on a device home screen.

### Account Data Handling

- `backend/users.json`, its `.bak` backups, and `.tmp` file are now git-ignored (the store was never tracked).
- Added `backend/reset_users.py` to clear accounts and/or session tokens:
  - default clears both, `--sessions-only` revokes tokens but keeps accounts
  - confirmation prompt unless `--yes`, timestamped backup unless `--no-backup`
  - atomic write so an interrupted run cannot truncate the store

### Explored and Reverted

- Prototyped moving the risk tank out of the Decision Engine into a fixed floating overlay with a 2/3 - 1/3 lateral split.
- Reverted to the inline tank layout by request; no floating-tank code remains.

### Validation Completed On 2026-08-12

- TypeScript checks passed after each change set.
- backend/main.py parse check passed after the follow-through contract change.
- No diagnostics remained in touched frontend/backend files.
- `backend/reset_users.py` verified end to end against seeded data for both clear modes.

## Update (2026-08-11)

### Frontend UX and Flow Updates

- Onboarding setup transitions were tuned to remove flash-like behavior and feel smoother.
- Setup and edit meal-plan dropdown behavior was stabilized across re-entry/navigation.
- Student level (undergraduate/graduate) is now a first-class input in onboarding and setup.
- Delivery service in onboarding now uses a real dropdown with mainstream options and Other:
  - DoorDash, Uber Eats, Grubhub, Postmates, Instacart, Other
  - Selecting Other reveals custom text input.
- Craving Check labels were clarified to reduce ambiguity:
  - Meal plan status (qualitative)
  - Budget outside meal plan (numeric free entry)

### Nudge Experience Updates

- Nudge UX was redesigned for faster scanning and less reading fatigue.
- Backend prompt now requests concise, action-first output in structured JSON.
- Frontend renders compact phrase-style nudge points instead of long paragraphs.
- CTA text updated to Get quick nudge.

### University Theme/Palette Updates

- Theme contract now supports three main colors from backend:
  - background (primary)
  - secondary
  - tertiary
- Darkest of the three main colors is normalized to background.
- Card color is normalized from the remaining palette colors.
- Homepage accent usage was updated so key actions stay visible and distinct from page/card surfaces.
- Quick nudge button now enforces a color distinct from both background and card.
- Surprise me link and savings badge now follow the same distinct-color rule.

### Backend Contract Changes

- POST /theme response now includes secondary and tertiary fields in addition to background/backgroundElement/text.
- Theme extraction prompt includes guidance for primary/secondary/tertiary university color roles.
- Fallback normalization remains in place when color fields are missing/duplicated.

### Validation Completed On 2026-08-11

- TypeScript checks passed after each major UI/theme change.
- backend/main.py syntax compile checks passed after backend contract updates.
- No diagnostics remained in touched frontend/backend files after final passes.

## Current State (2026-08-10)

### Architecture

- Frontend: Expo Router with stack + tabs flow.
- Active app screens:
  - src/app/(tabs)/index.tsx (home + onboarding)
  - src/app/meal-plan-setup.tsx
  - src/app/meal-plan-other.tsx
  - src/app/index.tsx (redirect to /(tabs))
- Backend: FastAPI in backend/main.py.
- Shared frontend utilities:
  - src/utils/backend-url.ts
  - src/utils/theme-color.ts

### Runtime Contract

- Frontend expects backend availability before onboarding can fetch school theme data.
- Physical-device backend URL is LAN-only; loopback hosts are rejected on device.
- Initial setup meal-plan selection must be completed before onboarding can continue.

### Data and Behavior Rules

- No hardcoded meal-plan option defaults in onboarding/setup.
- Theme and dining metadata are dynamic-only.
- If dynamic theme data cannot be fetched, backend returns service-unavailable.
- Initial setup meal-plan control is a real dropdown:
  - open/close toggle
  - auto-close on selection
  - closes before navigating to Other flow.

### Backend Endpoints

- GET / health check.
- POST /theme returns dynamic school theme + dining metadata.
- POST /nudge returns dynamic nudge generation.
- POST /meal-plan/resolve resolves custom meal plans.

### Environment Variables

- Backend:
  - GEMINI_API_KEY required for dynamic nudge and theme generation.
- Frontend (device testing):
  - EXPO_PUBLIC_API_URL required when auto-host detection is insufficient.

### Networking Policy (Phone + Expo Go)

- Physical devices must not use localhost/loopback for backend.
- Use LAN IP via EXPO_PUBLIC_API_URL.
- Current known Wi-Fi IPv4 for this machine: 192.168.12.48.

Example:

```powershell
$env:EXPO_PUBLIC_API_URL="http://192.168.12.48:8000"
npx expo start --lan
```

### Runbook

Backend (WSL):

```bash
cd /mnt/c/Users/galva/Desktop/DineWise/backend
source .venv/bin/activate
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Frontend (Windows PowerShell):

```powershell
cd C:\Users\galva\Desktop\DineWise
$env:EXPO_PUBLIC_API_URL="http://192.168.12.48:8000"
npx expo start --clear --lan
```

Reachability check from phone browser:

```text
http://192.168.12.48:8000
```

### Quick Smoke Test

1. Backend up and reachable on LAN:
   - Phone browser opens http://192.168.12.48:8000
2. Onboarding school step:
   - Enter school, continue, theme loads without backend URL error.
3. Initial setup meal-plan dropdown:
   - Opens, selects, closes, enables Next.
4. Other plan flow:
   - Choosing Other navigates to custom screen, save returns to tabs with configured plan.
5. Nudge generation:
   - POST /nudge path returns suggestion and renders in UI.

### Known Failure Modes and Fixes

- Symptom: Backend URL unavailable on phone.
  - Fix: Set EXPO_PUBLIC_API_URL to LAN IP, restart Expo with --lan.
- Symptom: Backend unreachable timeout.
  - Fix: Confirm uvicorn is running on 0.0.0.0:8000 and firewall allows private inbound TCP 8000.
- Symptom: Dropdown appears stuck open.
  - Fix: Ensure latest onboarding dropdown toggle logic in src/app/(tabs)/index.tsx is present.
- Symptom: Native module mismatch after switching WSL/Windows installs.
  - Fix: Reinstall node_modules from Windows shell in project root.
- Symptom: Theme request fails with service-unavailable.
  - Fix: Verify GEMINI_API_KEY exists in backend environment and backend process restarted.

### What Was Completed On 2026-08-10

- Consolidated routing structure to avoid duplicate/competing home routes.
- Implemented standalone meal-plan setup and custom-plan screens.
- Added custom plan resolution endpoint and return-path handling.
- Removed stale hardcoded defaults and synthetic fallback data.
- Centralized backend URL resolution and theme-color helpers.
- Hardened device networking behavior and messaging for LAN-only backend access.
- Updated backend tests affected by fallback-removal changes.

### Maintenance Checklist

- Keep backend/.env out of commits.
- Keep frontend and backend dependency installs in their native host context.
- Re-verify LAN IP when network changes.
- Re-run npx expo start --clear after dependency or resolver changes.
- Update this log whenever routing, endpoint contracts, or networking policy changes.

### Repository Notes

- User preference honored: assistant does not run backend/frontend processes.
- Process execution remains user-controlled; assistant provides commands and code changes only.
