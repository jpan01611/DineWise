import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from main import _apply_time_sensitive_guardrails


def test_guardrail_blocks_closed_hall_recommendation():
    quick, backup, why = _apply_time_sensitive_guardrails(
        quick_nudge='Go to your dining hall now.',
        backup_option='Try your backup hall.',
        concise_why='Open options are nearby.',
        weekly_avoidable=9.5,
        timing_facts={
            'closed_mentions': 2,
            'soon_closing_mentions': 0,
            'open_mentions': 0,
        },
    )

    assert quick == 'Your saved halls appear closed right now.'
    assert backup == 'Delivery may be the practical choice tonight.'
    assert why == 'Use confirmed opening windows before heading out.'


def test_guardrail_adds_urgency_when_closing_soon():
    quick, backup, why = _apply_time_sensitive_guardrails(
        quick_nudge='Use your meal plan tonight.',
        backup_option='Skip delivery.',
        concise_why='Protect your budget.',
        weekly_avoidable=7.0,
        timing_facts={
            'closed_mentions': 0,
            'soon_closing_mentions': 1,
            'open_mentions': 1,
        },
    )

    assert quick == 'If your hall closes soon, go now.'
    assert 'save ~$7.0/week' in (backup or '')
    assert why == 'Your timing info suggests limited open-window minutes.'
