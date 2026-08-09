import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import google.generativeai as genai

root_dir = os.path.dirname(__file__)
load_dotenv(os.path.join(root_dir, '.env'))

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

gemini_api_key = os.getenv('GEMINI_API_KEY')
if not gemini_api_key:
    raise RuntimeError(
        'GEMINI_API_KEY is not set. Create backend/.env with GEMINI_API_KEY=your_api_key_here.'
    )

genai.configure(api_key=gemini_api_key)

class UserInput(BaseModel):
    balance: float
    craving: str


@app.get("/")
async def root():
    return {"message": "DineWise backend is running"}

@app.post("/nudge")
async def get_nudge(data: UserInput):
    prompt = (
        f"User has ${data.balance:.2f} and wants {data.craving}. "
        "Suggest one cheaper campus meal alternative and explain why it is a good value."
    )

    model_candidates = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash']
    last_error = None
    response = None

    for model_name in model_candidates:
        try:
            model = genai.GenerativeModel(model_name=model_name)
            response = model.generate_content(prompt)
            break
        except Exception as exc:
            last_error = exc

    if response is None:
        raise HTTPException(status_code=500, detail=str(last_error))

    suggestion = getattr(response, 'text', None)
    if suggestion is None:
        suggestion = getattr(response, 'output_text', None)
    if suggestion is None:
        suggestion = getattr(response, 'output', None)
    if suggestion is None:
        suggestion = str(response)

    return {
        'suggestion': suggestion,
        'prompt': prompt,
    }