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
from google.genai import types as genai_types


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
        f'Search the web for "{school_name}" official school colors (brand/athletics guide) and its '
        f'official campus dining services website to find the REAL, CURRENTLY-NAMED meal plan options.\n'
        'After researching, reply with a short explanation followed by ONE JSON object on its own line — '
        'the JSON must not contain markdown formatting:\n'
        '{\n'
        '  "background": "#RRGGBB",\n'
        '  "backgroundElement": "#RRGGBB",\n'
        '  "text": "#ffffff or #000000",\n'
        '  "dining_systems": ["Exact plan name 1", "Exact plan name 2"],\n'
        '  "dining_summary": "One sentence about how campus dining works there.",\n'
        '  "known": true\n'
        '}\n'
        'Rules:\n'
        '- background/backgroundElement: the two official school brand colors, verified from search results\n'
        '- text: #ffffff if background is dark, #000000 if light\n'
        '- dining_systems: only the actual, currently-named meal plan products offered by this school\'s dining '
        'services (e.g. as listed on their dining website) — do not invent generic names like "Meal plan"\n'
        '- known: false if you cannot find a real university matching this name, then return {"known": false}'
    )

    hex_re = re.compile(r'^#[0-9a-fA-F]{6}$')
    if not gemini_client:
        return None
    search_config = genai_types.GenerateContentConfig(
        tools=[genai_types.Tool(google_search=genai_types.GoogleSearch())],
    )
    for model_name in ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]:
        try:
            response = gemini_client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=search_config,
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
            txt = data.get("text", "")
            if hex_re.match(bg) and hex_re.match(be) and hex_re.match(txt):
                return {
                    "background": bg,
                    "backgroundElement": be,
                    "text": txt,
                    "dining_systems": [
                        item.strip() for item in data.get("dining_systems", [])
                        if isinstance(item, str) and item.strip()
                    ],
                    "dining_system_summary": (data.get("dining_summary") or "").strip(),
                }
        except Exception:
            continue
    return None


def build_university_theme(school_name: str) -> dict | None:
    _ = normalize_school_name(school_name)

    # Real-time: ask Gemini for brand colors and dining info
    info = fetch_university_info_from_gemini(school_name)

    # Real-time: look up university domain via hipolabs → Clearbit logo
    domain = fetch_university_domain(school_name)
    if domain:
        logo_url: str | None = f"https://logo.clearbit.com/{domain}"
    else:
        logo_url = None

    if info:
        return {**info, "logo_url": logo_url}

    return None

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


class MealPlanResolveRequest(BaseModel):
    school: str | None = None
    plan_name: str


class MealPlanResolveResponse(BaseModel):
    resolved_plan: str
    summary: str
    source_url: str | None = None


def strip_markdown(text: str) -> str:
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    return text.strip()


def resolve_meal_plan_from_internet(school: str, plan_name: str) -> dict:
    query_parts = [plan_name.strip()]
    if school.strip():
        query_parts.insert(0, school.strip())
    query_parts.append("meal plan")
    query = " ".join(query_parts)

    try:
        encoded = urllib.parse.quote(query)
        url = (
            "https://en.wikipedia.org/w/api.php"
            f"?action=opensearch&search={encoded}&limit=1&namespace=0&format=json"
        )
        with urllib.request.urlopen(url, timeout=6) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        titles = data[1] if len(data) > 1 else []
        descriptions = data[2] if len(data) > 2 else []
        links = data[3] if len(data) > 3 else []

        title = titles[0] if titles else plan_name
        description = descriptions[0] if descriptions else ""
        source_url = links[0] if links else None

        if description:
            summary = (
                f"Using internet lookup: {description}. "
                f"Saved for {school.strip() or 'your school'} as {title}."
            )
        else:
            summary = (
                f"Saved custom meal plan '{plan_name}' for {school.strip() or 'your school'}. "
                "Internet lookup did not return a detailed description."
            )

        return {
            "resolved_plan": title,
            "summary": summary,
            "source_url": source_url,
        }
    except Exception:
        return {
            "resolved_plan": plan_name,
            "summary": (
                f"Saved custom meal plan '{plan_name}' for {school.strip() or 'your school'} with fallback mode."
            ),
            "source_url": None,
        }


@app.get("/")
async def root():
    return {"message": "DineWise backend is running"}


@app.post("/theme", response_model=ThemeResponse)
async def get_theme(request: ThemeRequest):
    if not request.school or not request.school.strip():
        raise HTTPException(status_code=400, detail="School name is required")
    theme = build_university_theme(request.school)
    if theme is None:
        raise HTTPException(
            status_code=503,
            detail="Unable to fetch dynamic university theme and dining data for this school right now.",
        )
    return theme


@app.post("/nudge")
async def get_nudge(data: UserInput):
    service_note = f" They usually order via {data.delivery_service}." if data.delivery_service else ""
    context_text = (data.context or "").strip()
    meal_plan_status_text = (data.meal_plan_status or "").strip()
    delivery_frequency_text = (data.delivery_frequency or "").strip()
    prompt = (
        f"Student has ${data.balance:.2f} left, wants {data.craving}, and is in {context_text}. "
        f"Their meal plan status is {meal_plan_status_text} and their delivery frequency is {delivery_frequency_text}."
        f"{service_note}"
        " Give one practical, low-cost campus dining suggestion and explain briefly why it is a better value than delivery."
    )

    model_candidates = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']
    last_error = None
    response = None

    if not gemini_client:
        raise HTTPException(status_code=503, detail="Gemini is unavailable. Dynamic nudge generation cannot run right now.")

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


@app.post("/meal-plan/resolve", response_model=MealPlanResolveResponse)
async def resolve_meal_plan(data: MealPlanResolveRequest):
    if not data.plan_name or not data.plan_name.strip():
        raise HTTPException(status_code=400, detail="plan_name is required")

    school_name = data.school or ""
    return resolve_meal_plan_from_internet(school_name, data.plan_name.strip())