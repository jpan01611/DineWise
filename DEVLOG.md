# DineWise DEVLOG

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

### What Was Completed Today

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
