import hashlib
import json
import os
import re
import urllib.parse
import urllib.request
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import google.genai as genai


class ThemeRequest(BaseModel):
    school: str


class ThemeResponse(BaseModel):
    background: str
    backgroundElement: str
    text: str
    logo_url: str | None = None
    dining_systems: list[str]
    dining_system_summary: str


def normalize_school_name(school_name: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", " ", school_name.strip().lower())
    return normalized


def hash_color(seed: str) -> str:
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    return f"#{digest[:6]}"


def fetch_university_domain(school_name: str) -> str | None:
    try:
        encoded = urllib.parse.quote(school_name)
        url = f"http://universities.hipolabs.com/search?name={encoded}"
        with urllib.request.urlopen(url, timeout=4) as resp:
            data = json.loads(resp.read().decode())
            if data and data[0].get("domains"):
                return data[0]["domains"][0]
    except Exception:
        pass
    return None


def fetch_university_info_from_gemini(school_name: str) -> dict | None:
    prompt = (
        f'For the university "{school_name}", reply ONLY with a JSON object — no markdown, no extra text:\n'
        '{\n'
        '  "background": "#RRGGBB",\n'
        '  "backgroundElement": "#RRGGBB",\n'
        '  "text": "#ffffff or #000000",\n'
        '  "dining_systems": ["Plan name 1", "Plan name 2"],\n'
        '  "dining_summary": "One sentence about how campus dining works there.",\n'
        '  "known": true\n'
        '}\n'
        'Rules:\n'
        '- background: official primary brand/athletic color (typically the darker one)\n'
        '- backgroundElement: official secondary/accent brand color (typically the brighter one)\n'
        '- text: #ffffff if background is dark, #000000 if light\n'
        '- dining_systems: actual named dining currency types used at this school\n'
        '- known: false if you do not recognise this as a real university, then return {"known": false}'
    )

    hex_re = re.compile(r'^#[0-9a-fA-F]{6}$')
    if not gemini_client:
        return None
    for model_name in ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]:
        try:
            response = gemini_client.models.generate_content(
                model=model_name,
                contents=prompt,
            )
            text = response.text or ""
            start, end = text.find("{"), text.rfind("}")
            if start == -1 or end <= start:
                continue
            data = json.loads(text[start:end + 1])
            if data.get("known") is False:
                return None
            bg = data.get("background", "")
            be = data.get("backgroundElement", "")
            txt = data.get("text", "#ffffff")
            if hex_re.match(bg) and hex_re.match(be) and hex_re.match(txt):
                return {
                    "background": bg,
                    "backgroundElement": be,
                    "text": txt,
                    "dining_systems": data.get("dining_systems", ["Meal plan", "Dining dollars"]),
                    "dining_system_summary": data.get("dining_summary", ""),
                }
        except Exception:
            continue
    return None


def build_university_theme(school_name: str) -> dict:
    normalized = normalize_school_name(school_name)

    # Real-time: ask Gemini for brand colors and dining info
    info = fetch_university_info_from_gemini(school_name)

    # Real-time: look up university domain via hipolabs → Clearbit logo
    domain = fetch_university_domain(school_name)
    if domain:
        logo_url: str | None = f"https://logo.clearbit.com/{domain}"
    else:
        trimmed = normalized.strip()
        encoded = re.sub(r"\s+", "+", trimmed) if trimmed else "school"
        bg_hex = hash_color(normalized + "logo").lstrip("#")
        logo_url = f"https://ui-avatars.com/api/?name={encoded}&background={bg_hex}&color=ffffff&size=256" if trimmed else None

    if info:
        return {**info, "logo_url": logo_url}

    # Fallback: deterministic hash colors for unrecognised schools
    primary = hash_color(normalized + "primary")
    secondary = hash_color(normalized + "secondary")
    return {
        "background": primary,
        "backgroundElement": secondary,
        "text": "#ffffff" if int(primary[1:], 16) < 0x888888 else "#000000",
        "logo_url": logo_url,
        "dining_systems": ["Meal plan", "Dining dollars"],
        "dining_system_summary": "This university likely uses a meal plan plus dining dollars for campus dining.",
    }

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
    import warnings
    warnings.warn('GEMINI_API_KEY is not set — Gemini features will be unavailable.')

gemini_client = genai.Client(api_key=gemini_api_key) if gemini_api_key else None

class UserInput(BaseModel):
    balance: float
    craving: str
    context: str | None = None
    meal_plan_status: str | None = None
    delivery_frequency: str | None = None
    delivery_service: str | None = None


def strip_markdown(text: str) -> str:
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    return text.strip()


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


@app.post("/theme", response_model=ThemeResponse)
async def get_theme(request: ThemeRequest):
    if not request.school or not request.school.strip():
        raise HTTPException(status_code=400, detail="School name is required")
    theme = build_university_theme(request.school)
    return theme


@app.post("/nudge")
async def get_nudge(data: UserInput):
    service_note = f" They usually order via {data.delivery_service}." if data.delivery_service else ""
    prompt = (
        f"Student has ${data.balance:.2f} left, wants {data.craving}, and is in {data.context or 'a busy campus moment'}. "
        f"Their meal plan status is {data.meal_plan_status or 'unknown'} and their delivery frequency is {data.delivery_frequency or 'unknown'}."
        f"{service_note}"
        " Give one practical, low-cost campus dining suggestion and explain briefly why it is a better value than delivery."
    )

    model_candidates = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']
    last_error = None
    response = None

    if not gemini_client:
        return build_fallback_suggestion(data)

    for model_name in model_candidates:
        try:
            response = gemini_client.models.generate_content(
                model=model_name,
                contents=prompt,
            )
            break
        except Exception as exc:
            last_error = exc

    if response is None:
        raise HTTPException(status_code=500, detail=str(last_error))

    suggestion = strip_markdown(response.text or str(response))
    return {
        'suggestion': suggestion,
        'prompt': prompt,
        'savings_estimate': f"~${max(4.0, round((data.balance or 0) * 0.2, 2)):.2f} saved",
        'why_it_matches': (
            f"This fits {data.context or 'your current situation'} and uses your meal plan more efficiently."
        ),
    }