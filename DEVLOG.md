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
