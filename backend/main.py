import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import google.generativeai as genai


class SurveyResponse(BaseModel):
    balance: float
    craving: str
    context: str | None = None
    meal_plan_status: str | None = None
    delivery_frequency: str | None = None

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
    context: str | None = None
    meal_plan_status: str | None = None
    delivery_frequency: str | None = None


def build_fallback_suggestion(data: UserInput) -> dict:
    context_text = data.context or "a busy day"
    plan_text = data.meal_plan_status or "your meal plan"
    savings = max(4.0, round((data.balance or 0) * 0.2, 2))
    suggestion = (
        f"Try a campus dining hall combo meal or a grocery grab-and-go option instead of delivery. "
        f"It fits your {data.craving} craving and is usually about ${savings:.2f} cheaper than a delivery order."
    )
    return {
        "suggestion": suggestion,
        "savings_estimate": f"~${savings:.2f} saved",
        "why_it_matches": (
            f"This works well for {context_text} and uses {plan_text} more efficiently."
        ),
    }


@app.get("/")
async def root():
    return {"message": "DineWise backend is running"}


@app.post("/nudge")
async def get_nudge(data: UserInput):
    prompt = (
        f"Student has ${data.balance:.2f} left, wants {data.craving}, and is in {data.context or 'a busy campus moment'}. "
        f"Their meal plan status is {data.meal_plan_status or 'unknown'} and their delivery frequency is {data.delivery_frequency or 'unknown'}. "
        "Give one practical, low-cost campus dining suggestion and explain briefly why it is a better value than delivery."
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

    if response is None:
        return build_fallback_suggestion(data)

    return {
        'suggestion': suggestion,
        'prompt': prompt,
        'savings_estimate': f"~${max(4.0, round((data.balance or 0) * 0.2, 2)):.2f} saved",
        'why_it_matches': (
            f"This fits {data.context or 'your current situation'} and uses your meal plan more efficiently."
        ),
    }