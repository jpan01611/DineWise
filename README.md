# DineWise

DineWise is a meal-plan decision engine for college students. Instead of only showing balances or menus, it combines a student's remaining plan value, days left, trusted campus options, delivery cost, and preferences into one concrete action. Deterministic code handles availability, ranking, costs, and savings; AI turns those verified facts into a short explanation.

The app centers on a few core ideas:

- prevent wasted meal-plan value and unnecessary delivery spending
- turn campus-specific data into a simple decision, not a wall of advice
- use university-specific theming pulled from live backend data
- show the smartest next move with a clear target, pace, and explanation
- keep onboarding stable, fast, and easy to scan
- resolve custom or unusual meal plans dynamically
- learn from logged outcomes so advice adapts to real follow-through
- never guess dining hall names, hours, menus, or specials
- reduce repeated input through one-tap decisions and remembered preferences
- compare delivery against student-configured campus spots using deterministic arithmetic

## Current experience

The home screen is built around four quick actions:

- **Use my meal plan** generates a recommendation with stored plan context.
- **Surprise me** chooses a craving/context pair and runs the decision immediately.
- **My usual** reuses the student's last saved preference when one exists.
- **I have a craving** opens optional refinement controls.

The **About to order delivery?** flow compares a typical delivery amount with the best currently open, student-configured campus spot. Students can choose a common amount, enter a custom amount, or reuse their previous amount. It can recommend campus, recommend delivery, or report a tie. The verdict and savings are computed locally; no language model supplies financial or availability facts.

### Trusted campus data

Campus spots are configured once in Settings with:

- name
- opening and closing times
- walking time
- meal-plan coverage
- optional typical price

DineWise supports overnight hours and ranks open options by meal-plan coverage, shortest walk, then most time before closing. It never invents a location, operating hours, distance, menu, or special.

### Meal-plan health

Students can add their remaining balance and days left in Settings. DineWise calculates the target spend per day and shows plan health in plain language. Waste projections are only shown when enough student-provided behavior data exists; unknown inputs are not replaced with fabricated defaults.

### Waste risk

Waste risk estimates how likely prepaid meal-plan value is to go unused while the student pays for food elsewhere. It uses only provided data:

- meal-plan status
- delivery frequency
- outside-food budget
- recent logged choices (rolling last seven)

Missing answers contribute nothing. Weekly-dollar estimates are shown only when delivery-frequency data exists. Meter Details explains every factor, the current answer used, and practical ways to lower the score.

### Recommendation architecture

DineWise separates facts from language:

1. Student-provided facts and configured campus spots
2. Deterministic availability, ranking, cost, savings, target, and verdict calculations
3. A structured recommendation
4. A constrained AI-generated action and one-sentence rationale

The default Best Move card stays concise. Evidence, confidence, supporting details, recent choices, and the trust policy are available under **Why this recommendation?**.

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the backend

   ```bash
   cd backend
   source .venv/bin/activate
   python server.py
   ```

3. Start the Expo app

   ```bash
   npx expo start --lan
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing files inside `src/app`. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Backend

The FastAPI backend provides authentication, university theme/dining lookup, custom meal-plan resolution, and concise recommendation rationales. Financial comparisons and campus availability decisions remain deterministic on the client.

```bash
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Environment variables:

- `GEMINI_API_KEY` (backend) is required for dynamic theme and nudge generation.
- `EXPO_PUBLIC_API_URL` (frontend) must point at your machine's LAN IP when testing on a physical device. Loopback hosts are rejected on device.

## Public prototype deployment

Deploy the FastAPI backend first, then export the frontend with its public HTTPS URL:

```bash
EXPO_PUBLIC_API_URL="https://<backend-host>" npm run web:export
```

Publish `dist` with EAS Hosting (`npx eas-cli@latest deploy --prod`) or another static host. The backend should use a persistent volume with `DINEWISE_USERS_DB_PATH` and restrict `DINEWISE_CORS_ORIGINS` to the final frontend origin. See [DEVLOG.md](DEVLOG.md) for the full tested deployment and smoke-test runbook.

### Accounts and local data

- Accounts and session tokens are stored in `backend/users.json`, which is git-ignored. Passwords are hashed with PBKDF2-SHA256.
- Profile, meal-plan economics, campus spots, and remembered preferences persist on-device via AsyncStorage. The auth token is intentionally not restored, so login is always required at launch.
- Logged recommendation outcomes are kept on-device and sent with nudge requests to inform follow-through-aware advice.

To clear stored accounts or revoke sessions:

```bash
cd backend
python reset_users.py                 # clear accounts and tokens
python reset_users.py --sessions-only # revoke tokens, keep accounts
```

The script prompts before deleting and writes a timestamped backup by default.

## Validation

The final freeze pass covers:

- TypeScript compilation and workspace diagnostics
- backend syntax and time-sensitive guardrails
- target-per-day arithmetic
- campus-cheaper, delivery-cheaper, and tie outcomes
- missing-data behavior
- standard and overnight opening windows
- fresh-account/session isolation

See [DEVLOG.md](DEVLOG.md) for the dated implementation and validation history.
