import json
import os
import re
import hashlib
import hmac
import secrets
from datetime import datetime, timezone
import urllib.parse
import urllib.request
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import google.genai as genai
from google.genai import types as genai_types


class ThemeRequest(BaseModel):
    school: str
    student_level: str | None = None


class ThemeResponse(BaseModel):
    background: str
    backgroundElement: str
    secondary: str
    tertiary: str
    text: str
    logo_url: str | None = None
    dining_systems: list[str]
    dining_system_summary: str


THEME_CACHE: dict[str, dict] = {}


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


def hex_to_rgb(hex_color: str) -> tuple[int, int, int] | None:
    clean = hex_color.strip().lstrip('#')
    if not re.fullmatch(r'[0-9a-fA-F]{6}', clean):
        return None
    return int(clean[0:2], 16), int(clean[2:4], 16), int(clean[4:6], 16)


def relative_luminance(hex_color: str) -> float:
    rgb = hex_to_rgb(hex_color)
    if not rgb:
        return 1.0

    def srgb_to_linear(channel: int) -> float:
        c = channel / 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = rgb
    rl = srgb_to_linear(r)
    gl = srgb_to_linear(g)
    bl = srgb_to_linear(b)
    return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl


def normalize_palette_colors(background: str, secondary: str, tertiary: str, text: str) -> dict:
    unique_colors: list[str] = []
    for color in [background, secondary, tertiary]:
        upper = color.upper()
        if upper not in unique_colors:
            unique_colors.append(upper)

    while len(unique_colors) < 3:
        fallback = '#FFFFFF' if text.lower() == '#000000' else '#111111'
        if fallback.upper() not in unique_colors:
            unique_colors.append(fallback.upper())
        else:
            unique_colors.append('#9CA3AF')

    ordered = sorted(unique_colors[:3], key=relative_luminance)

    # Keep dark themes possible, but avoid defaulting to near-black page backgrounds
    # when a different brand color is available.
    non_black_candidates = [
        color for color in ordered
        if relative_luminance(color) > 0.03
    ]
    normalized_background = non_black_candidates[0] if non_black_candidates else ordered[0]

    remaining = [color for color in ordered if color != normalized_background]
    middle = remaining[0] if remaining else normalized_background
    lightest = remaining[-1] if remaining else normalized_background

    return {
        'background': normalized_background,
        'backgroundElement': lightest,
        'secondary': middle,
        'tertiary': lightest,
    }


def build_fallback_theme(school_name: str, student_level: str | None = None) -> dict:
    normalized_school = normalize_school_name(school_name)
    digest = hashlib.sha256(f'{normalized_school}:{student_level or ""}'.encode('utf-8')).hexdigest()
    seed = int(digest[:8], 16)

    palette_groups = [
        ('#0F172A', '#1E293B', '#334155', '#F8FAFC'),
        ('#111827', '#374151', '#6B7280', '#F9FAFB'),
        ('#1E1B4B', '#312E81', '#4F46E5', '#F8FAFC'),
        ('#3B0764', '#6B21A8', '#A855F7', '#F9FAFB'),
        ('#7F1D1D', '#991B1B', '#DC2626', '#FFF7ED'),
        ('#064E3B', '#065F46', '#10B981', '#ECFDF5'),
    ]
    background, background_element, secondary, text = palette_groups[seed % len(palette_groups)]

    return {
        'background': background,
        'backgroundElement': background_element,
        'secondary': secondary,
        'tertiary': secondary,
        'text': text,
        'dining_systems': [],
        'dining_system_summary': 'Live dining data is still loading for this campus. The default theme is being used for now.',
    }


def fetch_university_info_from_gemini(school_name: str, student_level: str | None = None) -> dict | None:
    level_note = (
        f' The requesting student is a {student_level} student — if this school offers separate '
        f'meal plans for undergraduate and graduate students, only list the plans available to '
        f'{student_level} students.'
        if student_level else ''
    )
    prompt = (
        f'Search the web for "{school_name}" official school colors (brand/athletics guide) and its '
        f'official campus dining services website to find the REAL, CURRENTLY-NAMED meal plan options.'
        f'{level_note}\n'
        'After researching, reply with a short explanation followed by ONE JSON object on its own line — '
        'the JSON must not contain markdown formatting:\n'
        '{\n'
        '  "background": "#RRGGBB",\n'
        '  "backgroundElement": "#RRGGBB",\n'
        '  "secondary": "#RRGGBB",\n'
        '  "tertiary": "#RRGGBB",\n'
        '  "text": "#ffffff or #000000",\n'
        '  "dining_systems": ["Exact plan name 1", "Exact plan name 2"],\n'
        '  "dining_summary": "One sentence about how campus dining works there.",\n'
        '  "known": true\n'
        '}\n'
        'Rules:\n'
        '- background: official primary school color from brand/athletics guidelines\n'
        '- secondary: official secondary/supporting color from the same source; neutral secondaries are valid (black/gray/white)\n'
        '- tertiary: official tertiary/accent color from the same source; neutral tertiary colors are valid\n'
        '- backgroundElement: card/surface companion color tied to the palette (often secondary or a light tint of it)\n'
        '- If multiple secondaries exist, prefer a practical UI companion color used broadly in branding\n'
        '- Example references: NYU can be violet primary with black or light gray secondary; BYU can be navy primary with white secondary\n'
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
            secondary = data.get("secondary", "")
            tertiary = data.get("tertiary", "")
            txt = data.get("text", "")
            if hex_re.match(bg) and hex_re.match(be) and hex_re.match(txt):
                sec = secondary if hex_re.match(secondary) else be
                if sec.lower() == bg.lower():
                    sec = '#ffffff' if txt.lower() == '#ffffff' else '#111111'
                ter = tertiary if hex_re.match(tertiary) else sec
                if ter.lower() in {bg.lower(), sec.lower()}:
                    ter = '#9ca3af' if txt.lower() == '#ffffff' else '#374151'
                palette = normalize_palette_colors(bg, sec, ter, txt)
                return {
                    "background": palette['background'],
                    "backgroundElement": palette['backgroundElement'],
                    "secondary": palette['secondary'],
                    "tertiary": palette['tertiary'],
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


def build_university_theme(school_name: str, student_level: str | None = None) -> dict | None:
    cache_key = f'{normalize_school_name(school_name)}::{student_level or ""}'

    cached_theme = THEME_CACHE.get(cache_key)
    if cached_theme:
        return cached_theme

    # Real-time: ask Gemini for brand colors and dining info
    info = fetch_university_info_from_gemini(school_name, student_level)

    # Real-time: look up university domain via hipolabs → Clearbit logo
    domain = fetch_university_domain(school_name)
    if domain:
        logo_url: str | None = f"https://logo.clearbit.com/{domain}"
    else:
        logo_url = None

    if info:
        theme = {**info, "logo_url": logo_url}
        THEME_CACHE[cache_key] = theme
        return theme

    fallback_theme = build_fallback_theme(school_name, student_level)
    fallback_theme['logo_url'] = logo_url
    THEME_CACHE[cache_key] = fallback_theme
    return fallback_theme

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
    recent_followed: int | None = None
    recent_logged: int | None = None


class MealPlanResolveRequest(BaseModel):
    school: str | None = None
    plan_name: str


class MealPlanResolveResponse(BaseModel):
    resolved_plan: str
    summary: str
    source_url: str | None = None


class AuthSignupRequest(BaseModel):
    username: str | None = None
    email: str | None = None
    password: str
    name: str | None = None


class AuthLoginRequest(BaseModel):
    username: str | None = None
    email: str | None = None
    password: str


class AuthResponse(BaseModel):
    token: str
    user_email: str
    user_username: str | None = None
    user_name: str | None = None


class AuthDeleteResponse(BaseModel):
    message: str


USERS_DB_PATH = os.path.join(root_dir, 'users.json')


def _normalize_username(username: str) -> str:
    return (username or '').strip().lower()


def _is_valid_username(username: str) -> bool:
    normalized = _normalize_username(username)
    return bool(re.fullmatch(r'[a-z0-9._-]{3,32}', normalized))


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_users_db() -> dict:
    try:
        if not os.path.exists(USERS_DB_PATH):
            return {'users': [], 'sessions': []}
        with open(USERS_DB_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {'users': [], 'sessions': []}
        users = data.get('users', [])
        sessions = data.get('sessions', [])
        return {
            'users': users if isinstance(users, list) else [],
            'sessions': sessions if isinstance(sessions, list) else [],
        }
    except Exception:
        return {'users': [], 'sessions': []}


def _save_users_db(data: dict) -> None:
    with open(USERS_DB_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)


def _hash_password(password: str, salt_hex: str | None = None) -> tuple[str, str]:
    salt = bytes.fromhex(salt_hex) if salt_hex else os.urandom(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 120_000)
    return salt.hex(), digest.hex()


def _verify_password(password: str, salt_hex: str, digest_hex: str) -> bool:
    _, candidate = _hash_password(password, salt_hex)
    return hmac.compare_digest(candidate, digest_hex)


def _find_user(users: list[dict], username: str) -> dict | None:
    target = _normalize_username(username)
    for user in users:
        if _normalize_username(str(user.get('email', ''))) == target:
            return user
    return None


def _issue_session(db: dict, username: str) -> str:
    token = secrets.token_urlsafe(32)
    db['sessions'].append({
        'token': token,
        'email': _normalize_username(username),
        'created_at': _utc_now_iso(),
    })
    return token


def _get_email_for_token(token: str) -> str | None:
    db = _load_users_db()
    for session in db.get('sessions', []):
        if str(session.get('token', '')) == token:
            return _normalize_username(str(session.get('email', '')))
    return None


def _require_authenticated_email(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail='Missing Authorization header.')

    prefix = 'Bearer '
    if not authorization.startswith(prefix):
        raise HTTPException(status_code=401, detail='Invalid Authorization scheme.')

    token = authorization[len(prefix):].strip()
    if not token:
        raise HTTPException(status_code=401, detail='Missing bearer token.')

    email = _get_email_for_token(token)
    if not email:
        raise HTTPException(status_code=401, detail='Invalid or expired session token.')
    return email


def _delete_account_by_email(email: str) -> None:
    target = _normalize_username(email)
    db = _load_users_db()

    db['users'] = [
        user for user in db.get('users', [])
        if _normalize_username(str(user.get('email', ''))) != target
    ]
    db['sessions'] = [
        session for session in db.get('sessions', [])
        if _normalize_username(str(session.get('email', ''))) != target
    ]

    _save_users_db(db)


def strip_markdown(text: str) -> str:
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    return text.strip()


def extract_json_object(text: str) -> dict | None:
    start, end = text.find('{'), text.rfind('}')
    if start == -1 or end <= start:
        return None
    try:
        data = json.loads(text[start:end + 1])
        if isinstance(data, dict):
            return data
    except Exception:
        return None
    return None


def _normalize_text(value: str | None) -> str:
    return (value or '').strip().lower()


def _contains_delivery_reference(text: str) -> bool:
    lowered = _normalize_text(text)
    delivery_terms = [
        'doordash',
        'uber eats',
        'ubereats',
        'grubhub',
        'postmates',
        'instacart',
        'delivery',
    ]
    return any(term in lowered for term in delivery_terms)


def _contains_location_claim(text: str) -> bool:
    lowered = _normalize_text(text)
    location_terms = [
        'dining hall',
        'dining commons',
        'cafeteria',
        'food court',
        'student center',
        'closest',
        'nearest',
        'near',
        'next to',
        'across from',
        'walk to',
        'minutes away',
        'north campus',
        'south campus',
        'east campus',
        'west campus',
    ]
    return any(term in lowered for term in location_terms)


def _contains_hours_or_menu_claim(text: str) -> bool:
    lowered = _normalize_text(text)
    service_terms = [
        'open until',
        'opens at',
        'closes at',
        'open now',
        'hours',
        'today\'s menu',
        'todays menu',
        'menu today',
        'serving today',
        'special today',
        'daily special',
        'specials',
    ]
    return any(term in lowered for term in service_terms)


def _context_includes_service_facts(context_text: str | None) -> bool:
    lowered = _normalize_text(context_text)
    context_markers = [
        'open',
        'close',
        'hours',
        'menu',
        'special',
        'serving',
    ]
    return any(marker in lowered for marker in context_markers)


def _parse_clock_time_label(label: str) -> tuple[int, int] | None:
    match = re.match(r'^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*$', label.strip(), re.IGNORECASE)
    if not match:
        return None

    hour = int(match.group(1))
    minute = int(match.group(2) or '0')
    suffix = match.group(3).lower()

    if hour < 1 or hour > 12 or minute < 0 or minute > 59:
        return None

    hour_24 = hour % 12
    if suffix == 'pm':
        hour_24 += 12
    return hour_24, minute


def _minutes_until_time(label: str, now_local: datetime) -> int | None:
    parsed = _parse_clock_time_label(label)
    if not parsed:
        return None

    hour_24, minute = parsed
    target = now_local.replace(hour=hour_24, minute=minute, second=0, microsecond=0)
    delta_seconds = int((target - now_local).total_seconds())
    return delta_seconds // 60


def _extract_timing_facts(context_text: str | None) -> dict[str, int]:
    lowered = _normalize_text(context_text)
    facts = {
        'closed_mentions': 0,
        'soon_closing_mentions': 0,
        'open_mentions': 0,
    }

    if not lowered:
        return facts

    facts['closed_mentions'] += len(re.findall(r'\b(closed|already closed|not open)\b', lowered))
    facts['soon_closing_mentions'] += len(re.findall(r'\b(closing soon|about to close|closing in \d+\s*(min|mins|minutes))\b', lowered))
    facts['open_mentions'] += len(re.findall(r'\b(open now|currently open|open)\b', lowered))

    now_local = datetime.now()
    for match in re.finditer(r'\b(?:closes at|open until)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b', lowered):
        minutes_until = _minutes_until_time(match.group(1), now_local)
        if minutes_until is None:
            continue
        if minutes_until <= 0:
            facts['closed_mentions'] += 1
        elif minutes_until <= 45:
            facts['soon_closing_mentions'] += 1
        else:
            facts['open_mentions'] += 1

    return facts


def _apply_time_sensitive_guardrails(
    quick_nudge: str | None,
    backup_option: str | None,
    concise_why: str | None,
    weekly_avoidable: float,
    timing_facts: dict[str, int],
) -> tuple[str | None, str | None, str | None]:
    closed_mentions = timing_facts.get('closed_mentions', 0)
    soon_closing_mentions = timing_facts.get('soon_closing_mentions', 0)
    open_mentions = timing_facts.get('open_mentions', 0)

    safe_quick = quick_nudge
    safe_backup = backup_option
    safe_why = concise_why

    # If user context indicates closures and no clearly open alternatives,
    # avoid recommending a hall trip right now.
    if closed_mentions > 0 and open_mentions == 0 and soon_closing_mentions == 0:
        safe_quick = 'Your halls look closed now; avoid a wasted trip.'
        safe_backup = f'Skip delivery if possible; save ~${weekly_avoidable:.1f}/week.'
        safe_why = 'Use confirmed opening windows before heading out.'
        return safe_quick, safe_backup, safe_why

    # If user context says a hall is about to close, make urgency explicit.
    if soon_closing_mentions > 0:
        safe_quick = 'If your hall closes soon, go now.'
        safe_backup = f'If it closes first, use your best open option and save ~${weekly_avoidable:.1f}/week.'
        safe_why = 'Your timing info suggests limited open-window minutes.'

    return safe_quick, safe_backup, safe_why


def _sanitize_location_copy(
    quick_nudge: str | None,
    backup_option: str | None,
    concise_why: str | None,
    weekly_avoidable: float,
    allow_service_fact_claims: bool,
) -> tuple[str | None, str | None, str | None]:
    safe_quick = quick_nudge
    safe_backup = backup_option
    safe_why = concise_why

    if quick_nudge and _contains_location_claim(quick_nudge):
        safe_quick = 'Pick your go-to hall and use swipes first.'

    if backup_option and _contains_location_claim(backup_option):
        safe_backup = f'Skip one delivery, save ~${weekly_avoidable:.1f}/week.'

    if concise_why and _contains_location_claim(concise_why):
        safe_why = 'You know your campus best; this keeps spending tighter.'

    if not allow_service_fact_claims:
        if safe_quick and _contains_hours_or_menu_claim(safe_quick):
            safe_quick = 'Use your meal plan at your preferred hall today.'

        if safe_backup and _contains_hours_or_menu_claim(safe_backup):
            safe_backup = f'Skip one delivery, save ~${weekly_avoidable:.1f}/week.'

        if safe_why and _contains_hours_or_menu_claim(safe_why):
            safe_why = 'Hours and specials vary; you know the best live options.'

    return safe_quick, safe_backup, safe_why


def _allow_delivery_as_primary(meal_plan_status: str | None, balance: float, delivery_frequency: str | None) -> bool:
    status = _normalize_text(meal_plan_status)
    freq = _normalize_text(delivery_frequency)
    return status == 'almost empty' and balance >= 20 and freq in {'often', 'daily'}


def _follow_through_rate(data: UserInput) -> float | None:
    logged = data.recent_logged or 0
    followed = data.recent_followed or 0
    if logged <= 0:
        return None
    return max(0.0, min(1.0, followed / logged))


def _estimate_weekly_avoidable_spend(
    meal_plan_status: str | None,
    delivery_frequency: str | None,
    follow_through: float | None = None,
) -> float:
    freq_weight = {
        'rarely': 3.5,
        'sometimes': 6.5,
        'often': 10.5,
        'daily': 14.5,
    }
    status_weight = {
        'plenty left': 1.2,
        'fair amount': 1.0,
        'running low': 0.8,
        'almost empty': 0.55,
    }
    freq_base = freq_weight.get(_normalize_text(delivery_frequency), 6.5)
    status_factor = status_weight.get(_normalize_text(meal_plan_status), 1.0)
    estimate = freq_base * status_factor
    if follow_through is not None:
        # Students who rarely follow through leave more spend on the table.
        estimate *= 0.85 + (1.0 - follow_through) * 0.3
    return round(max(4.0, estimate), 1)


def _build_confidence_metadata(data: UserInput, context_text: str) -> tuple[str, list[str], str]:
    evidence_inputs: list[str] = []

    if data.craving.strip():
        evidence_inputs.append(f'Craving: {data.craving.strip()}')
    if (data.meal_plan_status or '').strip():
        evidence_inputs.append(f'Meal plan: {(data.meal_plan_status or '').strip()}')
    if (data.delivery_frequency or '').strip():
        evidence_inputs.append(f'Delivery habit: {(data.delivery_frequency or '').strip()}')
    if data.balance > 0:
        evidence_inputs.append(f'Budget: ${data.balance:.2f}')
    if (data.recent_logged or 0) > 0:
        evidence_inputs.append(f'Follow-through: {data.recent_followed or 0}/{data.recent_logged}')
    if context_text:
        evidence_inputs.append('Context: student-provided')

    if context_text and len(evidence_inputs) >= 4:
        confidence = 'Student-confirmed'
    elif len(evidence_inputs) >= 3:
        confidence = 'Inferred from habits'
    else:
        confidence = 'Unknown'

    truth_policy = 'No guessed hall names, hours, menus, or specials.'
    return confidence, evidence_inputs[:4], truth_policy


def _build_campus_first_fallback(data: UserInput, weekly_avoidable: float) -> tuple[str, str, list[str]]:
    quick_nudge = 'Use your meal plan tonight.'
    backup_option = f'Skip one delivery, save ~${weekly_avoidable:.1f}/week.'
    why = 'You know your campus best; swipes protect your budget.'
    return quick_nudge, why, [quick_nudge, backup_option, why]


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
async def get_theme(request: ThemeRequest, authorization: str | None = Header(default=None)):
    _require_authenticated_email(authorization)
    if not request.school or not request.school.strip():
        raise HTTPException(status_code=400, detail="School name is required")
    theme = build_university_theme(request.school, request.student_level)
    return theme


@app.post('/auth/signup', response_model=AuthResponse)
async def auth_signup(data: AuthSignupRequest):
    username_source = data.username or data.email or ''
    username = _normalize_username(username_source)
    password = data.password or ''
    user_name = (data.name or '').strip() or None

    if not _is_valid_username(username):
        raise HTTPException(status_code=400, detail='Username must be 3-32 chars and use letters, numbers, ., _, or -.')
    if len(password) < 6:
        raise HTTPException(status_code=400, detail='Password must be at least 6 characters.')

    db = _load_users_db()
    if _find_user(db['users'], username):
        raise HTTPException(status_code=409, detail='An account with this username already exists.')

    salt_hex, digest_hex = _hash_password(password)
    db['users'].append({
        'email': username,
        'password_salt': salt_hex,
        'password_hash': digest_hex,
        'name': user_name,
        'created_at': _utc_now_iso(),
    })
    token = _issue_session(db, username)
    _save_users_db(db)

    return {
        'token': token,
        'user_email': username,
        'user_username': username,
        'user_name': user_name,
    }


@app.post('/auth/login', response_model=AuthResponse)
async def auth_login(data: AuthLoginRequest):
    username = _normalize_username(data.username or data.email or '')
    password = data.password or ''

    if not username:
        raise HTTPException(status_code=400, detail='Username is required.')

    db = _load_users_db()
    user = _find_user(db['users'], username)
    if not user:
        raise HTTPException(status_code=401, detail='Invalid username or password.')

    salt_hex = str(user.get('password_salt', ''))
    digest_hex = str(user.get('password_hash', ''))
    if not salt_hex or not digest_hex or not _verify_password(password, salt_hex, digest_hex):
        raise HTTPException(status_code=401, detail='Invalid username or password.')

    token = _issue_session(db, username)
    _save_users_db(db)

    return {
        'token': token,
        'user_email': username,
        'user_username': username,
        'user_name': user.get('name'),
    }


@app.delete('/auth/account', response_model=AuthDeleteResponse)
async def auth_delete_account(authorization: str | None = Header(default=None)):
    email = _require_authenticated_email(authorization)
    _delete_account_by_email(email)
    return {'message': 'Account deleted successfully.'}


@app.post("/nudge")
async def get_nudge(data: UserInput, authorization: str | None = Header(default=None)):
    _require_authenticated_email(authorization)
    service_note = f" They usually order via {data.delivery_service}." if data.delivery_service else ""
    context_text = (data.context or "").strip()
    meal_plan_status_text = (data.meal_plan_status or "").strip()
    delivery_frequency_text = (data.delivery_frequency or "").strip()
    follow_through = _follow_through_rate(data)
    if follow_through is None:
        follow_through_note = ""
    else:
        follow_through_note = (
            f" They followed the meal-plan-first move {data.recent_followed or 0} of the last"
            f" {data.recent_logged} logged decisions."
            + (
                " Their follow-through is strong, so reinforce the streak in one short phrase."
                if follow_through >= 0.6
                else " Their follow-through is weak, so make the move feel easy and low-effort."
            )
        )
    prompt = (
        f"Student has ${data.balance:.2f} left, wants {data.craving}, and is in {context_text}. "
        f"Their meal plan status is {meal_plan_status_text} and their delivery frequency is {delivery_frequency_text}."
        f"{service_note}"
        f"{follow_through_note}"
        " Give concise, action-first advice for a mobile app card. "
        " The product goal is meal-plan optimization and reducing unnecessary delivery spend. "
        " By default, prioritize campus dining/meal plan usage as the best move. "
        " Only make delivery the primary recommendation if meal plan is almost empty and external budget is strong. "
        " Never guess dining hall names, routes, or proximity claims. "
        " Students already know their best dining locations; do not pretend to know them. "
        " If location matters, tell the student to choose their preferred hall. "
        " Never guess dining hours, today\'s menu, or specials of the day. "
        " Only mention hours/menu/specials if those exact facts are explicitly provided in student context. "
        " If student-provided context indicates halls are closed, do not recommend going there now. "
        " If student-provided context indicates halls are about to close, explicitly say to go soon. "
        "Return ONLY one JSON object with no markdown and no extra text: "
        '{"quick_nudge":"...","backup_option":"...","why":"..."}. '
        "Rules: quick_nudge max 12 words, backup_option max 10 words, why max 12 words. "
        " Include a concrete money-saving angle when possible. "
        "Keep each line direct and specific."
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

    raw_output = strip_markdown(response.text or str(response))
    parsed = extract_json_object(raw_output)

    quick_nudge = None
    backup_option = None
    concise_why = None
    if parsed:
        quick_nudge = str(parsed.get('quick_nudge') or '').strip() or None
        backup_option = str(parsed.get('backup_option') or '').strip() or None
        concise_why = str(parsed.get('why') or '').strip() or None

    weekly_avoidable = _estimate_weekly_avoidable_spend(
        data.meal_plan_status,
        data.delivery_frequency,
        follow_through,
    )
    allow_delivery_primary = _allow_delivery_as_primary(
        data.meal_plan_status,
        data.balance,
        data.delivery_frequency,
    )
    allow_service_fact_claims = _context_includes_service_facts(context_text)
    timing_facts = _extract_timing_facts(context_text)

    quick_nudge, backup_option, concise_why = _sanitize_location_copy(
        quick_nudge,
        backup_option,
        concise_why,
        weekly_avoidable,
        allow_service_fact_claims,
    )

    if allow_service_fact_claims:
        quick_nudge, backup_option, concise_why = _apply_time_sensitive_guardrails(
            quick_nudge,
            backup_option,
            concise_why,
            weekly_avoidable,
            timing_facts,
        )

    if quick_nudge and _contains_delivery_reference(quick_nudge) and not allow_delivery_primary:
        quick_nudge, concise_why, fallback_points = _build_campus_first_fallback(data, weekly_avoidable)
        backup_option = fallback_points[1]
    elif not quick_nudge:
        quick_nudge, concise_why, fallback_points = _build_campus_first_fallback(data, weekly_avoidable)
        backup_option = backup_option or fallback_points[1]

    suggestion = quick_nudge or raw_output
    why_text = concise_why or (
        f"Matches {data.context or 'your situation'} and beats delivery cost."
    )
    nudge_points = [item for item in [quick_nudge, backup_option, concise_why] if item]
    confidence_label, evidence_inputs, truth_policy = _build_confidence_metadata(data, context_text)

    return {
        'suggestion': suggestion,
        'prompt': prompt,
        'savings_estimate': f"~${weekly_avoidable:.1f}/week potential",
        'why_it_matches': why_text,
        'nudge_points': nudge_points,
        'confidence_label': confidence_label,
        'evidence_inputs': evidence_inputs,
        'truth_policy': truth_policy,
    }


@app.post("/meal-plan/resolve", response_model=MealPlanResolveResponse)
async def resolve_meal_plan(data: MealPlanResolveRequest, authorization: str | None = Header(default=None)):
    _require_authenticated_email(authorization)
    if not data.plan_name or not data.plan_name.strip():
        raise HTTPException(status_code=400, detail="plan_name is required")

    school_name = data.school or ""
    return resolve_meal_plan_from_internet(school_name, data.plan_name.strip())