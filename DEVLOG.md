# DineWise DEVLOG

## Update (2026-08-14) — Product Freeze

### Recommendation Experience

- Reduced Best Move to the decision, verified savings (when available), one short rationale, and outcome actions.
- Moved evidence chips, confidence/source, supporting points, recent choices, and the trust policy behind an expandable **Why this recommendation?** section.
- Removed semester-potential and derived weekly-savings analytics that depended on assumptions difficult to defend.
- Filtered duplicate headline/rationale text from supporting points.
- Tightened the backend prompt contract:
  - one direct action (maximum 8 words)
  - one complete rationale (maximum 14 words)
  - no semicolon-heavy multi-clause copy
  - no repeated facts across fields
- Replaced the large AI-thinking state with a compact **Checking your plan...** indicator.

### Delivery Check Finalization

- Replaced **You could keep $X** with the direct **Save $X** headline.
- Added a **Use my meal plan** CTA when campus is the cheaper verified choice.
- Added common delivery-cost presets and remembered the last checked amount so students do not need to reach checkout or switch apps.
- Preserved all three deterministic outcomes: campus cheaper, delivery cheaper, and tie.
- Preserved the no-open-campus-option state and overnight-hours support.
- Kept the tone non-judgmental: DineWise shows the math and leaves the final choice to the student.

### Waste Risk Clarity and Correctness

- Added staged meter feedback: **Updating waste risk...** appears before the percentage and liquid move, followed by an increased/decreased result.
- Kept the percentage above liquid, waves, and glare with an adaptive contrast badge and explicit layer ordering.
- Expanded Meter Details with:
  - a plain-language definition
  - all four score drivers
  - current answers and missing-input states
  - practical ways to lower risk
  - clear separation between a risk score and an estimated weekly dollar amount
- Corrected score direction:
  - more unused meal-plan value raises risk
  - an almost-empty plan lowers risk
  - more outside-food spending capacity raises risk
  - better recent meal-plan follow-through lowers risk slightly
- Removed hidden defaults: unanswered fields contribute nothing.
- Weekly savings now requires an actual delivery-frequency answer; missing data no longer produces a fabricated estimate.
- Recent-choice displays use the actual number of logged choices (up to the rolling last seven), not a fixed `/7` denominator.

### Theme and Mobile Readability

- Added a minimum page/card contrast gate for saturated university palettes.
- MIT-like palettes now reject bright red-on-red surfaces and prefer an official neutral such as silver when it clears contrast.
- If no official university pair is readable, the full startup palette is used instead of synthesizing colors.
- Increased nested surface opacity for setup hints, quick actions, plan cards, stats, delivery checks, and impact blocks.
- Bumped client and backend palette-cache versions so previously stored low-contrast themes are discarded.

### UX and Reliability Cleanup

- Added setup guidance explaining why exact dollar comparisons are unavailable and linking directly to missing configuration.
- Replaced internal jargon such as **Spend pressure** with plain-language labels such as **Waste risk** and **Could save / week**.
- Added smooth auto-scroll to Craving Check and Best Move using measured offsets rather than nested relative layout values.
- Fixed new-account/session state leakage for cravings, usual choices, campus spots, balance, and open panels.
- Removed dead helpers, dead analytics styles, duplicate recommendation copy, and an accidental terminal-output artifact.
- Preserved source files' original line-ending conventions to avoid unrelated diff churn.

### Final Validation

- TypeScript diagnostics: clean.
- Workspace diagnostics: clean.
- Backend syntax: passed.
- Time-sensitive guardrail tests: passed when invoked directly (pytest is not installed in the backend virtualenv).
- Deterministic scenarios verified:
  - $50 / 16 days = $3.13/day
  - $225 / 28 days = $8.04/day
  - campus cheaper, delivery cheaper, and tie verdicts
  - no delivery data produces no weekly savings estimate
  - nearly-empty plans reduce risk relative to plans with plenty left
  - overnight campus hours remain open across midnight

### Working Prototype URL Runbook

The prototype requires two public HTTPS URLs: the FastAPI backend and the Expo static web app. Deploy the backend first because `EXPO_PUBLIC_API_URL` is embedded into the frontend bundle during export.

#### 1. Deploy the backend

Use a Python host that supports a persistent disk/volume (Render, Railway, Fly.io, or equivalent).

- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `python server.py`
- Required environment variable: `GEMINI_API_KEY`
- Initial CORS value: `DINEWISE_CORS_ORIGINS=*`
- Persistent account-store path: `DINEWISE_USERS_DB_PATH=<mounted-volume>/users.json`

Without a persistent volume, prototype accounts and sessions may disappear after a deploy/restart. Do not commit or upload the local `backend/users.json` file.

Verify the backend before continuing:

```text
https://<backend-host>/
```

Expected response:

```json
{"message":"DineWise backend is running"}
```

#### 2. Build the web app against the public backend

PowerShell:

```powershell
cd C:\Users\galva\Desktop\DineWise
$env:EXPO_PUBLIC_API_URL="https://<backend-host>"
npm ci
npm run web:export
```

Bash:

```bash
EXPO_PUBLIC_API_URL="https://<backend-host>" npm run web:export
```

The production bundle is generated in `dist`. The export command was tested successfully and generated all Expo Router static routes.

The current local test export was intentionally built with `https://example-backend.invalid` to verify environment-variable embedding. Do not publish that bundle. Delete/rebuild `dist` with the real public backend URL immediately before deployment.

#### 3A. Publish with EAS Hosting

```bash
npx eas-cli@latest login
npx eas-cli@latest deploy --prod
```

EAS prints the final `https://<subdomain>.expo.app` URL.

#### 3B. Or publish with another static host

- Build command: `npm ci && npm run web:export`
- Publish/output directory: `dist`
- Build environment variable: `EXPO_PUBLIC_API_URL=https://<backend-host>`

#### 4. Lock CORS to the final frontend URL

After the frontend URL is known, change the backend setting from `*` to the exact origin:

```text
DINEWISE_CORS_ORIGINS=https://<frontend-host>
```

Multiple origins can be comma-separated. Redeploy/restart the backend after changing this value.

#### 5. Public smoke test

Run this from a browser/device that is not using the development machine's LAN:

1. Open the frontend HTTPS URL.
2. Create a fresh account and complete setup.
3. Add balance/days and one campus spot.
4. Run delivery check and generate Best Move.
5. Refresh the browser and log in again.
6. Delete the account and confirm login fails afterward.
7. Confirm no request uses `localhost`, a LAN IP, or mixed HTTP/HTTPS.

If the backend URL changes, re-export and redeploy the frontend; changing the backend alone does not update an already-built static bundle.

Deployment preparation also added lazy Gemini-client initialization and `backend/server.py`. This avoids blocking backend health/startup on external client construction and bypasses an import-string stall reproduced with this environment's Uvicorn path. The direct entry point was tested with deployment-style CORS/storage variables through Uvicorn's **Application startup complete** state, followed by a real `GET /` request returning HTTP 200 and `{"message":"DineWise backend is running"}`.

## Update (2026-08-13)

### Product Direction: One-Tap Decision Assistant

- Reframed the home experience around low-input actions instead of a form-first flow:
  - Use my meal plan
  - Surprise me
  - My usual (shown only after a preference has been learned)
  - I have a craving (opens optional refinement controls)
- Removed the duplicate Crave Something entry point while preserving loading feedback after the refinement panel collapses.
- Persisted the last craving and context so repeat use requires less input.
- Shortened post-auth onboarding by removing the delivery-service step; delivery preferences now live in Settings.
- Removed the unreachable delivery onboarding JSX and its orphaned state/effect branch.

### Delivery Check and Trusted Campus Spots

- Added the About to order delivery? check-first flow.
- Students enter the delivery total and receive a deterministic verdict:
  - Don't order yet when an open campus option is cheaper.
  - Order delivery when it is genuinely cheaper.
  - It is a wash when costs match.
  - Delivery may be the best option when all configured spots are closed.
- Added student-configured campus spots with name, hours, walking time, meal-plan coverage, and optional typical price.
- Added `src/utils/campus-decision.ts` for deterministic time parsing, overnight-hour handling, open/closed evaluation, and ranking by:
  - meal-plan coverage
  - shortest walk
  - most time before closing
- The comparison exposes its reasoning (coverage, availability, walking time) and never asks AI to invent campus facts.
- Added an explicit Check with DineWise action, a short checking state, and eased result animation so verdicts do not flicker while the amount is typed.

### Quantitative Meal-Plan Health

- Added persisted meal-plan balance and days-remaining fields in Settings.
- Home now displays balance, days left, and a deterministic target-per-day calculation.
- Added plain-language health states instead of making the raw risk score the primary message.
- Removed an invalid default waste projection that treated an unknown delivery habit as a real value; without habit data, the app now reports only known facts.
- The backend nudge contract now accepts plan balance, days left, target per day, projected waste, and quick-action intent as structured inputs.
- AI remains the explanation layer; costs, savings, availability, ranking, and verdicts are computed in code.

### Theme and Trust Corrections

- Reworked university palette resolution after reproducing incorrect purple results for UCI.
- Palette lookup now runs deterministically and requests verbatim official brand hex values.
- A declared chromatic primary is preserved as the background; neutral colors cannot displace the university identity color.
- Cards use the lightest official chromatic color when available, deprioritizing white/grey.
- Removed hardcoded university examples and arbitrary fallback palettes.
- Incomplete/failed palette lookups use the complete startup palette and are not cached, allowing later retries.
- Added palette versioning and a once-per-signed-in-launch refresh so stale stored themes self-heal.

### UX Polish

- Moved the risk meter beside the balance block and scaled it proportionally to preserve mobile text width.
- Matched balance/meter card heights to remove the dead vertical gap between them.
- The balance link deep-links and scrolls directly to the Meal plan section in Settings.
- Replaced the permanently filled Use my meal plan action with a neutral button plus accent border so it does not look preselected.
- Best Move remains inline but auto-scrolls into view using a custom eased scroll after its entrance animation.
- Shifted the home header group slightly right and tightened mobile layout behavior.
- Added a shared cross-platform dialog helper because React Native `Alert` is a no-op on web.

### Session and Account Isolation

- Fixed new accounts inheriting an open craving panel, My usual, balance, campus spots, or prior recommendation state.
- Added explicit profile and decision-state resets for signup, sign-out, and account deletion.
- Account deletion now clears all newer persisted personalization fields as well as the original profile data.

### Validation Completed On 2026-08-13

- TypeScript diagnostics are clean across all touched frontend files.
- `backend/main.py` parses successfully after contract and palette changes.
- Time-sensitive campus spot logic handles standard and overnight opening windows.
- Removed temporary palette probe output from the repository.

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
