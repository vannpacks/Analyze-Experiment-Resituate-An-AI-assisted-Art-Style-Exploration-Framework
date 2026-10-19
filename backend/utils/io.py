import json
import random
from pathlib import Path

from paths import data_path, resource_path

PROMPT_ROOT = resource_path("prompts")
AGENT_PROMPT_ROOT = PROMPT_ROOT / "style" / "agent"
OUTPUT_ROOT = data_path("output")
BOARD_ROOT = OUTPUT_ROOT / "boards"

# Read prompt from file
def read_prompt(prompt_name: str) :
    """
    Reads a prompt from a file and returns it as a SystemMessage.
    
    Args:
        prompt_name (str): The name of the prompt file (without extension).
        
    Returns:
        SystemMessage: The system message containing the prompt content.
    """
    prompt_path = PROMPT_ROOT / f"{prompt_name}.txt"
    with prompt_path.open("r", encoding="utf-8") as file:
        content = file.read()
    return content

def read_prompt_list(prompt_type: str) -> list[str]:
    """
    Reads an agent prompt from a folder and returns it as a list of strings.
    Args:
        prompt_path (str): The path to the prompt folder.

    Returns:
        list[str]: A list of strings containing the prompt content.
    """
    prompt_path = AGENT_PROMPT_ROOT / prompt_type
    prompt_files = sorted(prompt_path.glob("*.txt"))
    if not prompt_files:
        raise FileNotFoundError("No prompt files found.")
    prompts = []
    for prompt_file in prompt_files:
        with prompt_file.open("r", encoding="utf-8") as file:
            prompts.append(file.read())
    return prompts

def write_plan(plan: str, output_name: str) -> None:
    """
    Writes a plan to a file.

    Args:
        plan (str): The plan content to write.
        output_name (str): The name of the output file (without extension).
    """
    # create the OUTPUT_ROOT directory if it does not exist
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    # write as json
    with (OUTPUT_ROOT / f"{output_name}.json").open("w", encoding="utf-8") as file:
        file.write(plan)
        
        
def write_json(content: str, output_name: str) -> None:
    """
    Writes a plan to a file.

    Args:
        plan (str): The plan content to write.
        output_name (str): The name of the output file (without extension).
    """
    # create the OUTPUT_ROOT directory if it does not exist
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    # write as json
    with (OUTPUT_ROOT / f"{output_name}.json").open("w", encoding="utf-8") as file:
        file.write(content)

def write_board(board_id:int, content: dict, stage: str) -> None:
    """
    Writes a board to a file as valid JSON, parsing content if it's a JSON string.

    Args:
        board_id (int): The board ID.
        content (str): The board content, as a JSON string or dict.
        stage (str): The board stage.
    """
    storage_path = BOARD_ROOT / stage
    storage_path.mkdir(parents=True, exist_ok=True)
    
    # Parse content if it's a JSON string
    board_content = {
        "board_id": board_id,
        "content": content
    }
    with (storage_path / f"{board_id:04d}.json").open("w", encoding="utf-8") as file:
        json.dump(board_content, file, ensure_ascii=False, indent=2)



def write_memory_context(memory_context: str, output_name: str) -> None:
    """
    Writes a memory context to a file.

    Args:
        memory_context (str): The memory context content to write.
        output_name (str): The name of the output file (without extension).
    """
    # create the OUTPUT_ROOT directory if it does not exist
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    # write as json
    with (OUTPUT_ROOT / f"{output_name}.json").open("w", encoding="utf-8") as file:
        file.write(memory_context)
