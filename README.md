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

The **About to order delivery?** flow compares a typed delivery total with the best currently open, student-configured campus spot. It can recommend campus, delivery, or report a tie. The verdict and savings are computed locally; no language model supplies financial or availability facts.

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

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing files inside `src/app`. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Backend

The app requires the FastAPI backend for theming, meal-plan resolution, auth, and nudges.

```bash
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Environment variables:

- `GEMINI_API_KEY` (backend) is required for dynamic theme and nudge generation.
- `EXPO_PUBLIC_API_URL` (frontend) must point at your machine's LAN IP when testing on a physical device. Loopback hosts are rejected on device.

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

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
