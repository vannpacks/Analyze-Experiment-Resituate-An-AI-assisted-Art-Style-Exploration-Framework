from utils.model import get_response
from pathlib import Path

from prompts.prompt_config import StylePrompt
from utils.io import read_prompt
import json
import os
from shared import current_project
from typing import TYPE_CHECKING
from shared import get_current_project_language
from utils.helper import extract_json_from_string
import asyncio

if TYPE_CHECKING:
    from utils.project import Project

class StyleAnalyzerService:
    def __init__(self, model_name: str = "gpt-4.1-mini"):
        print(f"Style Analyzer initialized with model: {model_name}")
        self.model_name = model_name
        self.style_prompt = read_prompt(StylePrompt.EXTRACT_ELEMENTS.value)
        self.content_prompt = read_prompt(StylePrompt.CONTENT_EXTRACTION.value)
        
    def analyze_style(self, image_path: Path, iteration_id: int, reference_image_id: int, project: 'Project' = None) -> dict:
        """
        Analyzes an image and returns a structured dictionary of its style.

        Args:
            image_path: The file path to the reference image.
            iteration_id: The ID of the current iteration.
            reference_image_id: The ID of the reference image.
            project: The project instance to use for saving. If None, uses shared.current_project.

        Returns:
            A dictionary containing the technical and conceptual analysis,
            matching the format in your API.
        """
        style_prompt = self.style_prompt
        if get_current_project_language() == "zh":
            # Read the Chinese version of the prompt
            style_prompt_zh = read_prompt(StylePrompt.LANGUAGE_ZH.value)
            style_prompt = f"{self.style_prompt}\n{style_prompt_zh}"
            
        style_analysis = get_response(
            prompt=style_prompt,
            model=self.model_name,
            temperature=1,
            response_format= "json_object",
            image_path_1=str(image_path)
        )
        
        style_analysis_dict = json.loads(extract_json_from_string(style_analysis))

        # Use provided project or fall back to shared current_project
        target_project = project or current_project
        if target_project is None:
            raise ValueError("No project specified and no current project available")

        # save the style analysis to the project
        # project_path = target_project.get_project_path()
        # style_analysis_file = os.path.join(project_path, f"{user_image_id:03d}", "style_analysis", f"{reference_image_id:03d}.json")
        # if not os.path.exists(os.path.dirname(style_analysis_file)):
        #     os.makedirs(os.path.dirname(style_analysis_file))
        # with open(style_analysis_file, 'w', encoding='utf-8') as f:
        #     json.dump(style_analysis_dict, f, indent=4, ensure_ascii=False)
        
        target_project.write_style_analysis(iteration_id, reference_image_id, style_analysis_dict)

        return style_analysis_dict


    def analyze_content(self, image_path: Path, iteration_id: int, user_image_id: int, project: 'Project' = None) -> dict:
        """Synchronous content analysis. Saves {user_id}/content_analysis.json"""
        prompt = self.content_prompt
        content_json = get_response(
            prompt=prompt, model=self.model_name, temperature=1,
            response_format="json_object", image_path_1=str(image_path)
        )
        result = json.loads(extract_json_from_string(content_json))

        target_project = project or current_project
        if target_project is None:
            raise ValueError("No project specified and no current project available")

        # project_path = target_project.get_project_path()
        # out_file = os.path.join(project_path, f"{user_image_id:03d}", "content_analysis.json")
        # os.makedirs(os.path.dirname(out_file), exist_ok=True)
        # with open(out_file, "w", encoding="utf-8") as f:
        #     json.dump(result, f, indent=4, ensure_ascii=False)
        
        target_project.write_content_analysis(iteration_id, user_image_id, result)
        
        return result
    
        # --- Async wrappers (run sync code in thread pool) ---
    async def analyze_style_async(self, *args, **kwargs) -> dict:
        return await asyncio.to_thread(self.analyze_style, *args, **kwargs)

    async def analyze_content_async(self, *args, **kwargs) -> dict:
        return await asyncio.to_thread(self.analyze_content, *args, **kwargs)