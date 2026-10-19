import base64
from utils.model import get_response
from pathlib import Path
from prompts.prompt_config import StylePrompt
from utils.io import read_prompt
import json
from tools.helper.executor_pool import executor
from tools.helper.Functional import get_random_varieties, get_random_seed
from tools.helper.iteration import append_task_status
from shared import task_status, task_events, model_agent, model_image_generation, model_general
from typing import List, Iterator
import shared
import concurrent.futures
import os
import requests
from PIL import Image as PILImage
from shared import get_current_project_language
from tools.helper.PromptGPT import generate_image_bfl_kontext, generate_image_bfl_kontext_2Ref
from utils.model import ProviderAPIError

class ImageGeneratorService:
    """Handles the generation of new images and style tweaking direction from a prompt."""

    def __init__(self, model_name: str = "your_image_generation_model", generation_number: int = 4):
        """Initializes the service with an image generation model."""
        self.generation_number = generation_number
        print(f"Image Generator initialized with model: {model_name}")

    def generate_style_tweaking_direction(self, instruction: str, image_path: str = None, reference_image_path: str = None, iteration_id: int = None, reference_image_id: int = None) -> str:
        """
        Generates a style tweaking direction based on the provided instruction and optional image.
        """
        prompt = read_prompt(StylePrompt.STYLE_TWEAKING_DIRECTION.value)
        # attatch to prompt with chinese language if current project language is set to zh
        if get_current_project_language() == "zh":
            # Read the Chinese version of the prompt
            prompt_zh = read_prompt(StylePrompt.LANGUAGE_ZH.value)
            prompt = f"{prompt}\n{prompt_zh}"
        
        # read the style description from the analysis result json file
        style_description = shared.current_project.read_style_analysis(iteration_id, reference_image_id)
        if style_description:
            prompt = f"{prompt}\n## Style Description of  the reference image: {style_description}"
        instruction = f"{prompt}\n## User's Intention: {instruction}"
        return get_response(instruction, image_path_1=image_path, image_path_2=reference_image_path, response_format="json_object")

    def generate_style_prompt(self, instruction: str, iteration_id: int = None, user_image_id: int = None, reference_image_id: int = None, keep_structure: bool = None) -> str:
        """
        Generates a prompt for image generation based on a single style direction's description.
        """
        print(f"Generating style prompt for instruction: {instruction}")
        
        
        content_description = shared.current_project.read_content_analysis(iteration_id, user_image_id)
        if content_description:
            instruction = f"## Content Description of the original image: {content_description}\n{instruction}"

        style_description = shared.current_project.read_style_analysis(iteration_id, reference_image_id)
        if style_description:
            instruction = f"## Style Description of the reference image: {style_description}\n{instruction}"
        
        if keep_structure:
            # Read the prompt that preserves structure
            prompt = read_prompt(StylePrompt.GENERATE_PROMPT_PRESERVE_STRUCTURE.value)
        else:
            prompt = read_prompt(StylePrompt.GENERATE_PROMPT.value)
        instruction = f"{prompt}\nStyle Tweaking Direction: {instruction}"
        print (f"Final instruction for prompt generation: {instruction}")
        # return instruction
        
        return get_response(instruction, model=model_general, response_format="text")

    def generate_single_image_direct(
        self, 
        prompt: str, 
        seed: int, 
        target_path: Path, 
        input_image: Path,  # Changed from str
        reference_image: Path = None, # Changed from str
        keep_structure: bool = False
    ) -> str:       
        """
        Directly generates an image to the specified path, avoiding image_from_input folder structure issues.
        
        Args:
            prompt: The prompt for image generation
            seed: Random seed for generation
            target_path: Exact path where the image should be saved
            input_image: Path to the input image for style transfer
            
        Returns:
            str: Path to the generated image if successful, None otherwise
        """
        input_image = Path(input_image)
        try:
            # Ensure target directory exists
            target_path.parent.mkdir(parents=True, exist_ok=True)
            
            if keep_structure:
                # # 方法二 flux 吃一張圖
                # Generate image URL
                image_url = generate_image_bfl_kontext(
                    prompt,
                    "flux-kontext",
                    "flux-2-pro", 
                    seed=seed, 
                    image_path=input_image,
                )
                
            else:
                ## 方法一 flux 吃兩張圖
                # Import image generation function w.2 ref
                
                print("Generating image with 2 references...")
                # Generate image URL
                image_url = generate_image_bfl_kontext_2Ref(
                    prompt,
                    "flux-2-pro",
                    "flux-2-pro",
                    seed=seed,
                    image_path_1=input_image,
                    image_path_2=reference_image
                )
            
            # 方法一 & 二要在這裡save image
            # Download and save image
            response = requests.get(image_url, stream=True, timeout=60)
            response.raise_for_status()

            image = PILImage.open(response.raw).convert("RGB")
            image.save(target_path, "PNG")

            print(f"Successfully generated image: {target_path}")
            return str(target_path)
            
        except ProviderAPIError:
            raise
        except Exception as e:
            print(f"Error generating image directly: {e}")
            return None

    # def generate_style_variations(self, instruction: str, original_image: str, reference_image: str, iteration_id: int, user_image_id: int, reference_image_id: int, keep_structure: bool = False) -> List[dict]:
    #     """
    #     Orchestrates an efficient, parallel image generation process.
    #     1. Fetches a single JSON object with multiple style directions.
    #     2. Parses the JSON and generates prompts for each direction in parallel.
    #     3. Generates images from the collected prompts.
        
    #     Returns:
    #         List[dict]: List of dictionaries containing image_path and description for each generated image
    #     """
    #     # Step 1: Make a single API call to get all tweaking directions
    #     print(f"Instruction: {instruction}")

    #     print(f"Keep structure: {keep_structure}")
    #     try:
    #         directions_json_str = self.generate_style_tweaking_direction(instruction, original_image, reference_image, iteration_id, reference_image_id)
    #         directions_data = json.loads(directions_json_str)
    #         style_directions = directions_data.get("style_tweaking_directions", [])

    #         if not style_directions:
    #             print("No style tweaking directions found in the response.")
    #             return []
    #     except (json.JSONDecodeError, KeyError, TypeError) as e:
    #         print(f"Failed to parse style directions from LLM response: {e}")
    #         return []

    #     # Step 2: Generate a final prompt for each direction in parallel
    #     print(f"Found {len(style_directions)} directions. Generating final prompts...")
        
    #     # This list will hold objects that pair a direction with its prompt
    #     prompt_data = []
    #     with concurrent.futures.ThreadPoolExecutor() as prompt_executor:
    #         # The future_to_prompt dict correctly maps a future to its original direction
    #         future_to_direction = {
    #             prompt_executor.submit(self.generate_style_prompt, str(direction), user_image_id, reference_image_id, keep_structure): direction
    #             for direction in style_directions
    #         }

    #         for future in concurrent.futures.as_completed(future_to_direction):
    #             try:
    #                 # Get the original direction associated with this completed future
    #                 original_direction = future_to_direction[future]
    #                 # Get the resulting prompt
    #                 final_prompt = future.result()

    #                 content_description = shared.current_project.read_content_analysis(user_image_id)
    #                 if content_description:
    #                     final_prompt = f"Content: \n{content_description}\n\n{final_prompt}"
    #                     # final_prompt = f"Use the content from image A\n and style from image B \n {final_prompt}"
                        
    #                 # Append a single object containing the paired data
    #                 prompt_data.append({
    #                     "style_description": original_direction,
    #                     "prompt": final_prompt
    #                 })
    #             except Exception as e:
    #                 print(f"Error generating a final prompt: {e}")

    #     if not prompt_data:
    #         print("No final prompts were successfully generated.")
    #         return []

    #     # Step 3: Pass the correctly paired data to the image generation step
    #     print(f"Successfully generated {len(prompt_data)} prompts. Now generating images.")
    #     return self.generate_style_image(prompt_data, original_image, reference_image, keep_structure=keep_structure)

    def generate_style_variations_stream(self, instruction: str, original_image: str, reference_image: str, iteration_id: int, user_image_id: int, reference_image_id: int, log_params: dict, keep_structure: bool = False) -> Iterator[dict]:
        """
        Orchestrates an efficient, parallel image generation process.
        NOW A GENERATOR: Yields results one by one as they complete.
        """
        # Step 1: Make a single API call to get all tweaking directions
        if log_params:
            print(f"Log parameters: {json.dumps(log_params, indent=4, ensure_ascii=False)}")

        print(f"Instruction: {instruction}")
        print(f"Keep structure: {keep_structure}")
        
        try:
            #
            directions_json_str = self.generate_style_tweaking_direction(instruction, original_image, reference_image, iteration_id, reference_image_id)
            if not directions_json_str:
                yield {
                    "status": "failed",
                    "error": "Style direction generation returned no response."
                }
                return
            directions_data = json.loads(directions_json_str)
            style_directions = directions_data.get("style_tweaking_directions", [])

            if not style_directions:
                yield {
                    "status": "failed",
                    "error": "No style tweaking directions were returned."
                }
                return # Stop iteration
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            print(f"Failed to parse style directions from LLM response: {e}")
            yield {
                "status": "failed",
                "error": f"Failed to parse style directions: {e}"
            }
            return # Stop iteration
        except Exception as e:
            print(f"Failed to generate style directions: {type(e).__name__}: {e}")
            yield {
                "status": "failed",
                "error": f"Failed to generate style directions: {type(e).__name__}: {e}"
            }
            return

        # Step 2: Generate a final prompt for each direction in parallel
        print(f"Found {len(style_directions)} directions. Generating final prompts...")
        
        prompt_data = []
        prompt_errors = []
        #
        with concurrent.futures.ThreadPoolExecutor() as prompt_executor:
            future_to_direction = {
                prompt_executor.submit(self.generate_style_prompt, str(direction), iteration_id, user_image_id, reference_image_id, keep_structure): direction
                for direction in style_directions
            }

            for future in concurrent.futures.as_completed(future_to_direction):
                try:
                    original_direction = future_to_direction[future]
                    final_prompt = future.result()

                    # content_description = shared.current_project.read_content_analysis(user_image_id)
                    # if content_description:
                    #     final_prompt = f"Content: \n{content_description}\n\n{final_prompt}"

                    prompt_data.append({
                        "style_description": original_direction,
                        "prompt": final_prompt
                    })
                except Exception as e:
                    print(f"Error generating a final prompt: {e}")
                    prompt_errors.append(str(e))

        if not prompt_data:
            print("No final prompts were successfully generated.")
            yield {
                "status": "failed",
                "error": prompt_errors[0] if prompt_errors else "No final image prompts were generated."
            }
            return # Stop iteration

        # Step 3: Stream the results instead of returning a list
        print(f"Successfully generated {len(prompt_data)} prompts. Streaming image generation...")
        
        # Iterate over your new stream function and yield immediately
        for result in self.generate_style_image_stream(
            prompt_data,
            original_image,
            reference_image,
            iteration_id,
            log_params,
            keep_structure=keep_structure,
        ):
            yield result


    # def generate_style_image(self, prompt_data: list[dict], original_image: str, reference_image: str, keep_structure: bool = False) -> list[dict]:
    #     """
    #     Generates images from the provided prompts using direct image generation method.
    #     Fixed version with timeout handling to prevent hanging on failed generations.
        
    #     Args:
    #         prompt_data: List of dictionaries, each containing 'style_description' and 'prompt'
    #         original_image: Path to the original image for style transfer
    #         reference_image: Path to the reference image for style transfer
    #         keep_structure: Whether to preserve structure
            
    #     Returns:
    #         List[dict]: List of dictionaries with image_path and description for each generated image
    #     """
    #     print(f"--- Generating images and saving artifacts directly ---")
    #     if shared.current_project is None:
    #         print("Warning: current_project is None, using default iteration_id")
    #         current_iteration_id = "default_iteration"
    #     else:
    #         current_iteration_id = shared.current_project.get_current_iteration_id()

    #     idea_count = len(prompt_data)
    #     append_task_status(current_iteration_id, idea_count)
    #     seeds = get_random_seed(idea_count)
        
    #     generated_images_path = shared.current_project.get_generated_images_path(current_iteration_id)
        
    #     print(f"Creating directory structure and metadata files...")
        
    #     # Create a mapping to track each generation task
    #     generation_tasks = []
        
    #     for i, item in enumerate(prompt_data):
    #         generated_image_id = shared.current_project.add_generated_image(current_iteration_id)
            
    #         try:
    #             # Extract the correctly paired data
    #             style_description_dict = item["style_description"]
    #             prompt = item["prompt"]

    #             generated_image_dir = generated_images_path / f"{generated_image_id:03d}"
    #             generated_image_dir.mkdir(parents=True, exist_ok=True)
                
    #             final_image_path = generated_image_dir / f"{generated_image_id:03d}.png"
                
    #             # Create metadata files BEFORE submitting the async task
    #             style_desc_path = generated_image_dir / "style_description.json"
    #             prompt_path = generated_image_dir / "prompt.txt"

    #             with open(style_desc_path, 'w', encoding='utf-8') as f:
    #                 json.dump(style_description_dict, f, indent=4, ensure_ascii=False)
                
    #             with open(prompt_path, 'w', encoding='utf-8') as f:
    #                 f.write(prompt)
    #             print(f"Created metadata for image {generated_image_id:03d}")
    #             final_image_path = Path(final_image_path)

    #             # Submit async image generation task
    #             future = executor.submit(
    #                 self.generate_single_image_direct,
    #                 prompt,
    #                 seeds[i],
    #                 final_image_path,
    #                 original_image,
    #                 reference_image,
    #                 keep_structure=keep_structure
    #             )
                
    #             # Store all related information together
    #             generation_task = {
    #                 'future': future,
    #                 'generated_image_id': generated_image_id,
    #                 'style_description_dict': style_description_dict,
    #                 'final_image_path': final_image_path,
    #                 'generated_image_dir': generated_image_dir,
    #                 'style_desc_path': style_desc_path,
    #                 'prompt_path': prompt_path
    #             }
                
    #             generation_tasks.append(generation_task)

    #         except Exception as e:
    #             print(f"Error preparing files for image {generated_image_id}: {e}")
    #             continue

    #     # Wait for image generation tasks to complete WITH TIMEOUT
    #     print(f"Waiting for {len(generation_tasks)} image generation tasks to complete...")
    #     futures_list = [task['future'] for task in generation_tasks]

    #     # Set timeout to 90 seconds (1.5 minutes) - adjust as needed
    #     GENERATION_TIMEOUT = 90
        
    #     try:
    #         done, not_done = concurrent.futures.wait(
    #             futures_list, 
    #             timeout=GENERATION_TIMEOUT,
    #             return_when=concurrent.futures.ALL_COMPLETED
    #         )
            
    #         if not_done:
    #             print(f"Warning: {len(not_done)} image generation tasks did not complete within {GENERATION_TIMEOUT} seconds")
    #             print("Proceeding with completed images...")
                
    #             # Cancel the remaining futures to free up resources
    #             for future in not_done:
    #                 future.cancel()
                    
    #     except Exception as e:
    #         print(f"Error during concurrent wait: {e}")
    #         # If wait fails, treat all as done and let individual processing handle errors
    #         done = set(futures_list)
    #         not_done = set()

    #     # Process results - handle both completed and failed generations
    #     results = []
    #     successful_generations = 0
    #     failed_generations = 0
        
    #     for task in generation_tasks:
    #         completed_future = task['future']
    #         generated_image_id = task['generated_image_id']
    #         style_description_dict = task['style_description_dict']
    #         final_image_path = task['final_image_path']
    #         generated_image_dir = task['generated_image_dir']
    #         style_desc_path = task['style_desc_path']
    #         prompt_path = task['prompt_path']
            
    #         # Check if this future completed successfully
    #         if completed_future in done:
    #             try:
    #                 image_path = completed_future.result()
    #                 description = style_description_dict.get("description", f"Style variation {generated_image_id}")
    #                 focus = style_description_dict.get("focus", "general")
    #                 target_effect = style_description_dict.get("target_effect", "none")
                    
    #                 if image_path and Path(image_path).exists():
    #                     results.append({
    #                         "image_path": image_path,
    #                         "description": description,
    #                         'focus': focus,
    #                         'target_effect': target_effect,
    #                     })
    #                     successful_generations += 1
    #                     print(f"Successfully generated image {generated_image_id:03d}")
    #                 else:
    #                     print(f"Warning: Generated image {generated_image_id:03d} failed to generate")
    #                     failed_generations += 1
                            
    #             except Exception as e:
    #                 print(f"Error processing generated image {generated_image_id}: {e}")
    #                 failed_generations += 1
    #         else:
    #             # Future did not complete (timeout or cancelled)
    #             print(f"Image {generated_image_id:03d} generation timed out or was cancelled")
    #             failed_generations += 1

    #     print(f"Image generation complete: {successful_generations}/{len(generation_tasks)} images generated successfully")
    #     if failed_generations > 0:
    #         print(f"Failed/timed out generations: {failed_generations}")
        
    #     return results
    
    
    
    
    def generate_style_image_stream(self, prompt_data: list[dict], original_image: str, reference_image: str, iteration_id: int, log_params: dict, keep_structure: bool = False):
        """
        Generator function that yields a single result as soon as an image is generated.
        
        Yields:
            dict: A dictionary containing the image path, description, and status for a single completed image.
        """
        print(f"--- Streaming images generation directly ---")
        
        # 1. Setup (use request iteration_id to avoid cross-tab folder mismatch)
        if shared.current_project is None:
            raise ValueError("current_project is None, cannot generate images.")

        current_iteration_id = iteration_id

        idea_count = len(prompt_data)
        append_task_status(current_iteration_id, idea_count)
        seeds = get_random_seed(idea_count)
        
        generated_images_path = shared.current_project.get_generated_images_path(current_iteration_id)
        
        # 2. Submit Tasks and Build Mapping
        # We need a dictionary to map a Future object back to its specific metadata (ID, path, etc.)
        future_to_metadata = {}
        
        for i, item in enumerate(prompt_data):
            try:
                style_description_dict = item["style_description"]
                prompt = item["prompt"]

                # Reserve a unique generated image id and directory atomically.
                with shared.lock:
                    generated_image_id = shared.current_project.add_generated_image(current_iteration_id)
                    generated_image_dir = generated_images_path / f"{generated_image_id:03d}"
                    generated_image_dir.mkdir(parents=True, exist_ok=True)
                
                final_image_path = generated_image_dir / f"{generated_image_id:03d}.png"
                style_desc_path = generated_image_dir / "style_description.json"
                prompt_path = generated_image_dir / "prompt.txt"
                log_path = generated_image_dir / "user_log.txt"

                # Save metadata immediately
                with open(style_desc_path, 'w', encoding='utf-8') as f:
                    json.dump(style_description_dict, f, indent=4, ensure_ascii=False)

                with open(log_path, 'w', encoding='utf-8') as f:
                    json.dump(log_params, f, indent=4, ensure_ascii=False)
                
                with open(prompt_path, 'w', encoding='utf-8') as f:
                    f.write(prompt)
                
                final_image_path = Path(final_image_path)

                # Submit task
                future = executor.submit(
                    self.generate_single_image_direct,
                    prompt,
                    seeds[i],
                    final_image_path,
                    original_image,
                    reference_image,
                    keep_structure=keep_structure
                )
                
                # Store metadata for retrieval later
                future_to_metadata[future] = {
                    'generated_image_id': generated_image_id,
                    'style_description_dict': style_description_dict,
                    'final_image_path': final_image_path
                }

            except Exception as e:
                print(f"Error preparing files for image {generated_image_id}: {e}")
                # We can yield an error result immediately if setup fails
                yield {
                    "error": str(e),
                    "generated_image_id": generated_image_id,
                    "status": "setup_failed"
                }

        # 3. Process and Yield as they complete
        print(f"Waiting for {len(future_to_metadata)} tasks to complete (streaming)...")
        
        # as_completed yields futures as they finish (in order of completion, not submission)
        for future in concurrent.futures.as_completed(future_to_metadata):
            metadata = future_to_metadata[future]
            generated_image_id = metadata['generated_image_id']
            style_description_dict = metadata['style_description_dict']
            
            result_data = {
                "generated_image_id": generated_image_id,
                "description": style_description_dict.get("description", f"Style variation {generated_image_id}"),
                "focus": style_description_dict.get("focus", "general"),
                "target_effect": style_description_dict.get("target_effect", "none"),
                "image_path": None,
                "status": "failed"
            }

            try:
                image_path = future.result() # This will raise an exception if the task failed
                
                if image_path and Path(image_path).exists():
                    print(f"Successfully generated image {generated_image_id:03d}")
                    result_data["image_path"] = image_path
                    result_data["status"] = "success"
                else:
                    print(f"Warning: Image {generated_image_id:03d} returned None or missing file")
                    
            except Exception as e:
                print(f"Error processing generated image {generated_image_id}: {e}")
                result_data["error"] = str(e)
            
            # YIELD the result immediately
            yield result_data