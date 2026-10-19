
import json
import re
def format_json_for_readability(data_string: str) -> str:
    """
    Tries to parse a string as JSON and formats it into readable Markdown.
    Handles nested dictionaries and lists.
    If the string is not valid JSON, it returns the original string.
    """
    try:
        data = json.loads(data_string)
        if not isinstance(data, dict):
            # If the parsed data is not a dictionary (e.g., a list or a string),
            # just return the original string for now.
            return data_string
    except (json.JSONDecodeError, TypeError):
        # If it's not a JSON string at all, return it as is.
        return data_string

    def format_recursive(d: dict, indent_level: int = 0) -> str:
        """Recursively formats a dictionary into a Markdown string."""
        lines = []
        indent = "  " * indent_level  # Use two spaces for indentation

        for key, value in d.items():
            # Format the key nicely (e.g., 'story_concept' becomes '**Story concept:**')
            formatted_key = f"{indent}**{key.replace('_', ' ').capitalize()}:**"

            if isinstance(value, dict):
                lines.append(f"{formatted_key}")
                lines.append(format_recursive(value, indent_level + 1))
            elif isinstance(value, list):
                lines.append(f"{formatted_key}")
                for item in value:
                    # Indent list items
                    lines.append(f"{indent}  - {item}")
            else:
                lines.append(f"{formatted_key} {value}")

        return "\n".join(lines)

    return format_recursive(data)

def extract_json_from_string(text: str) -> str | None:
    if text is None:
        raise ValueError("The provider returned no response.")
    """
    Finds and extracts the first valid JSON object block from a string.
    Returns the JSON string if found, otherwise None.
    """
    # This regex finds a substring starting with '{' and ending with '}'
    # It handles nested braces.
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        json_string = match.group(0)
        try:
            # Final check to ensure the extracted string is valid JSON
            json.loads(json_string)
            return json_string
        except json.JSONDecodeError:
            return None
    return None


def combine_json_results(results):
    """
    Given a list of JSON strings or dicts, combine them into a single dict
    where values with the same key are aggregated into a list.
    """
    
    json_objs = []
    for res in results:
        try:
            if isinstance(res, dict):
                obj = res
            else:
                obj = json.loads(str(res))
            json_objs.append(obj)
        except Exception:
            pass  # skip non-JSON results

    if json_objs and all(isinstance(obj, dict) for obj in json_objs):
        combined = {}
        for obj in json_objs:
            for k, v in obj.items():
                if k not in combined:
                    combined[k] = []
                combined[k].append(v)
        return json.dumps(combined, ensure_ascii=False, indent=2)
    else:
        # fallback: join as string
        return "\n".join([str(res) for res in results])
