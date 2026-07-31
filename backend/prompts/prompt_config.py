
from enum import Enum


class StylePrompt(str, Enum):
    STYLE_TWEAKING_DIRECTION = "style/style_tweaking_direction"
    GENERATE_PROMPT = "style/generate_prompt_flux2"
    GENERATE_PROMPT_PRESERVE_STRUCTURE = "style/generate_prompt_preserve_structure"
    EXTRACT_ELEMENTS = "style/extract_elements"
    CONTENT_EXTRACTION = "style/content_extraction_short"
    # CONTENT_EXTRACTION = "style/content_extraction"

    AGENT_PROFESSIONAL = "style/agent_professional"
    AGENT_TRENDING = "style/agent_trending_tweak"
    AGENT_FANS = "style/agent_fans_tweak"

    LANGUAGE_ZH = "style/common_cn"