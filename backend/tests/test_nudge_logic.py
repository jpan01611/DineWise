import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from main import strip_markdown


def test_strip_markdown_removes_basic_formatting():
    text = "**Bold** and *italic*\n## Header"
    result = strip_markdown(text)
    assert result == "Bold and italic\nHeader"
