import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from main import UserInput, build_fallback_suggestion


def test_fallback_suggestion_uses_context_and_balance():
    data = UserInput(
        balance=12.5,
        craving="burger",
        context="late-night study session",
        meal_plan_status="dining dollars",
    )

    result = build_fallback_suggestion(data)

    assert "burger" in result["suggestion"].lower()
    assert "$" in result["savings_estimate"]
    assert "study" in result["why_it_matches"].lower() or "late" in result["why_it_matches"].lower()
