# DineWise DEVLOG

## Cleanup Summary

- Removed redundant backend environment folder: `backend/venv`
- Kept the valid backend virtual environment in `backend/.venv`
- Ensured `.gitignore` ignores backend local env file: `/backend/.env`, backend `.venv`, `node_modules`, Expo cache directories, and Python bytecode
- Removed stale temporary cache in `backend/__pycache__`
- Verified no untracked non-ignored files remain before staging changes
- Resolved an Expo startup issue caused by a port conflict on `8081` by clearing the old Metro process and restarting the dev server

## Backend

- Final backend entrypoint: `backend/main.py`
- Uses FastAPI and the installed `google.generativeai` package
- Configures Gemini API key with `genai.configure(...)` and calls `GenerativeModel.generate_content`
- Loads `GEMINI_API_KEY` from `backend/.env` with explicit path resolution
- Adds `httpx2` to backend requirements for FastAPI `TestClient` compatibility
- Supports `/` root health check and `/nudge` POST endpoint
- Cleans up duplicate venv artifacts and ensures only one backend venv remains

## Frontend

- Main Expo screen file: `src/app/index.tsx`
- Added form state for `balance`, `craving`, and `suggestion`
- `Fetch Nudge` button calls backend at `http://localhost:8000/nudge`
- Includes Android emulator host handling using `10.0.2.2`
- Displays backend suggestion result in the UI and shows errors clearly

## Summary by Day

- Day 1: Set up the FastAPI backend, added `/` and `/nudge` endpoints, and wired the Gemini SDK call in `backend/main.py`.
- Day 2: Built the Expo frontend screen in `src/app/index.tsx`, added the balance/craving form, and connected the app to the backend request flow.
- Day 3: Cleaned redundant environments, fixed the WSL backend venv, updated `.gitignore`, and confirmed the backend is reachable from WSL.

## Files to Edit

- `backend/main.py` — backend request handling, Gemini prompt generation, and response formatting.
- `src/app/index.tsx` — Expo UI, form state, fetch logic, and suggestion display.
- `backend/requirements.txt` — backend dependencies for FastAPI, Gemini client, dotenv, and test support.
- `.gitignore` — keep local envs and build artifacts ignored for a clean repo.

## Notes

- `backend/.venv` is the working backend virtual environment for WSL/Linux
- `backend/venv` was stale and removed to avoid duplicate venv confusion
- If you need to reinstall backend dependencies from WSL, run:
  ```bash
  cd backend
  .venv/bin/python -m pip install -r requirements.txt
  ```

## Local Run / Test Commands

- Start the backend from WSL:
  ```bash
  cd /mnt/c/Users/galva/Desktop/DineWise/backend
  source .venv/bin/activate
  python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
  ```
- Verify backend is reachable:
  ```bash
  curl http://127.0.0.1:8000/
  ```
- Test the backend `/nudge` endpoint directly:
  ```bash
  curl -X POST http://127.0.0.1:8000/nudge \
    -H 'Content-Type: application/json' \
    -d '{"balance": 50, "craving": "burger"}'
  ```
- Start the Expo frontend from project root:
  ```bash
  cd /mnt/c/Users/galva/Desktop/DineWise
  npm install
  npx expo start
  ```
- Run the frontend in web mode if needed:
  ```bash
  npm run web
  ```

## Next Steps

- Run the backend from WSL with:
  ```bash
  cd backend
  .venv/bin/python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
  ```
- Run the Expo frontend with:
  ```bash
  npm start
  ```
- Confirm `/nudge` responds with valid suggestion text and the Expo UI renders it.

---

## 2026-08-09 Detailed Session Log

### Scope Completed Today

- Extended onboarding and dynamic theming flow in the app UI.
- Added logo support and dining-system intelligence to backend theme responses.
- Added a configurable dining-session section in the main app page.
- Applied dynamic palette colors to cards and CTA buttons.
- Reworked school matching strategy from hardcoded mapping to real-time lookup.
- Migrated Gemini SDK usage in backend to current package/API.
- Stabilized Expo Go connectivity from phone to WSL backend.
- Fixed Metro crashes and dependency-platform issues on Windows.
- Reworked main-page scrolling/full-screen behavior across phone sizes.

### Frontend Workstream (src/app/index.tsx)

- Added onboarding reliability states:
  - `themeLoading`
  - `themeError`
  - disabled/loading state for progression CTA while theme request is pending.
- Added logo rendering in onboarding and hero areas when backend returns `logo_url`.
- Added delivery-service onboarding step and included that data in backend nudge payload.
- Added dining-session panel at bottom of main page:
  - unconfigured state with setup button
  - configured state showing selected plan
  - modal picker when multiple campus plans are available.
- Added dynamic text readability utility:
  - `contrastColor(hex)` to force legible light/dark text against theme backgrounds.
- Replaced fixed-color CTA behavior with theme-driven button visuals.
- Added timeout protection for backend requests using `AbortController`:
  - `/theme` timeout around 10 seconds
  - `/nudge` timeout around 10 seconds
  - clearer user-facing backend unreachable messages.
- Added runtime backend URL resolution:
  - `EXPO_PUBLIC_API_URL` override first
  - Expo host URI fallback for real-device testing
  - emulator fallback (`10.0.2.2`) for Android emulator.
- Added smoother main-page scrolling and then iterated layout fixes to address:
  - bottom card clipping
  - notch/safe-area behavior
  - full-width mobile layout with controlled horizontal gutter.

### Backend Workstream (backend/main.py)

- Extended theme response payload with:
  - `logo_url`
  - `dining_systems`
  - `dining_system_summary`
- Extended nudge input schema with delivery-service context.
- Prompt now includes delivery-service signal for better recommendations.
- Added response cleaning utility (`strip_markdown`) for cleaner suggestion text.
- School intelligence evolution:
  1. Improved hardcoded disambiguation logic.
  2. Replaced hardcoded school map with real-time external enrichment:
     - Gemini for school-theme metadata hints
     - Hipolabs universities API for domain resolution
     - logo derivation/fallback behavior.
- Migrated Gemini SDK usage:
  - from deprecated `google.generativeai`
  - to current `google.genai`.
- Changed missing API key behavior:
  - from startup-fatal error
  - to warning + fallback-capable runtime path.

### Dependency / Config Updates

- Updated backend dependency stack:
  - replaced `google-generativeai` with `google-genai`
  - corrected `httpx2` entry to `httpx`.
- Removed Linux-only frontend package causing Windows install failure:
  - removed `lightningcss-linux-x64-gnu` from app dependencies.
- Updated Metro config to avoid scanning Python virtualenv folders:
  - blocklisted `backend/.venv`
  - blocklisted `backend/venv`
  - avoided EACCES symlink traversal failures on Windows.

### Expo Go Troubleshooting Log (Thorough)

#### Symptoms Observed

- Expo command availability issues (`expo`/`npx expo` confusion across shells).
- `npm install` failure with `EBADPLATFORM` due to Linux-only package in Windows environment.
- Ngrok authentication tunnel issues (Expo tunnel path unstable/unavailable).
- App on phone hanging while loading theme/nudge requests (backend not reachable from device).
- Metro process crashes with filesystem permission errors (`EACCES` around backend venv symlink).
- UI loaded but occasionally stuck waiting on network calls.

#### Root Causes Identified

- Mixed environment execution (Windows + WSL) created path/runtime mismatches.
- Frontend dependency list contained an OS-specific package incompatible with Windows.
- Phone could not directly reach WSL localhost backend without LAN exposure strategy.
- Metro watcher recursively scanned backend virtualenv symlinks and hit permission barriers.
- Requests lacked timeout handling, so unreachable backend looked like infinite loading.

#### Fixes Applied

- Standardized runtime strategy:
  - run Metro/Expo from Windows context for device connectivity.
  - run FastAPI in WSL, but expose on all interfaces (`0.0.0.0`).
- Removed incompatible package to resolve `EBADPLATFORM` install failures.
- Added backend URL override and host autodetection in frontend.
- Added request timeouts and explicit error messaging in UI.
- Added Windows portproxy flow to forward LAN `:8000` to WSL backend.
- Ensured firewall openness for backend port path.
- Updated Metro blockList so backend virtualenv is ignored.

#### Validated Working Pattern

1. Backend starts in WSL and binds `0.0.0.0:8000`.
2. Windows host exposes reachable backend path for phone over LAN.
3. Expo app uses `EXPO_PUBLIC_API_URL` when set, otherwise hostUri derivation.
4. Theme/nudge calls fail fast with timeout instead of hanging indefinitely.
5. Metro no longer crashes on backend venv scan.

### UI/UX Iterations Logged

- Replaced single-form onboarding with a step-by-step wizard.
- Added progress indicators, back/next progression, and school-step theme fetch.
- Added soft-scroll on main page and then refined layout to prevent clipping.
- Adjusted mobile full-screen behavior:
  - first pass removed too much side inset
  - second pass reintroduced mobile gutter to avoid side-squished cards.

### Known Good Commands (Reference)

#### Backend (WSL)

```bash
cd /mnt/c/Users/galva/Desktop/DineWise/backend
source .venv/bin/activate
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

#### Health Check (Host Reachability)

```bash
curl http://127.0.0.1:8000/
```

#### Frontend (Windows/Project Root)

```bash
npm install
npx expo start --lan
```

#### Phone-Oriented Override (if needed)

Set this before launching Expo:

```bash
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:8000
```

### Final State at End of Today

- Backend and frontend integration includes dynamic theme + dining metadata.
- Expo Go path is substantially stabilized with known startup/network pattern.
- Main-page layout has mobile/web split behavior and safe-area tuning.
- Remaining adjustments are visual tuning only (spacing preferences per device), not architecture blockers.

### Git Push Protection Incident (Documented)

- Push to `main` was rejected by GitHub repository rules (GH013).
- Secret scanning detected a committed credential in prior history:
  - commit: `bd53d7c0935173c493e1725e2330624bf9fa656b`
  - file path: `backend/.env.example:2`
  - rule: GCP API key bound to a service account.

#### Key Troubleshooting Finding

- Removing the key from the latest working tree was necessary but not sufficient.
- Push protection scans the entire pushed commit range, so any older commit containing the secret still blocks push.

#### Remediation Path Used

Rewrote local commits against `origin/main` to produce a clean commit history without the leaked secret:

```bash
cd /mnt/c/Users/galva/Desktop/DineWise
git fetch origin
git reset --soft origin/main
git commit -m "add features, troubleshoot expo go connectivity (secret removed)"
git push --force-with-lease origin main
```

#### Security Follow-up

- Rotate/revoke the previously exposed GCP key even after history cleanup.
- Keep `backend/.env.example` as placeholder-only guidance text with no real credential values.
