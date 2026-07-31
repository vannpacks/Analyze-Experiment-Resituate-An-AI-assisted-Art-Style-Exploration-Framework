from openai import OpenAI
import base64
import os
from dotenv import load_dotenv
import requests
import time
import base64
import numpy as np
import random
from PIL import Image

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
STABILITY_API_KEY = os.getenv("STABILITY_API_KEY")
BFL_API_KEY_1 = os.getenv("BFL_API_KEY_1")
BFL_API_KEY_2 = os.getenv("BFL_API_KEY_2")
BFL_API_KEYS = [BFL_API_KEY_1, BFL_API_KEY_2]

def get_response(prompt, model="gpt-4o", temperature=0.7, top_p=1, frequency_penalty=0, presence_penalty=0.5, response_format="text"):
    # def get_response(prompt, model="gpt-4-1106-preview", temperature=1, top_p=1, frequency_penalty=0, presence_penalty=0):
    try:
        response = client.chat.completions.create(
            model=model,
            messages=prompt,
            temperature=temperature,
            top_p=top_p,
            frequency_penalty=frequency_penalty,
            presence_penalty=presence_penalty,  # Adjust as needed
            response_format=response_format
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"An error occurred: {e}")
        return None
    
def generate_image(prompt, generation_type = "environment", model = "dall-e-3", quality = "standard", n = 1, ):
    prompt = "If there is any inappropriate content, ignore that part:\n" + prompt
    # if generation_type == "environment":
    #     img_size = "1792x1024"
    # elif generation_type == "character":
    #     img_size = "1024x1024"
    img_size = "1792x1024"
    response = client.images.generate(
    model=model,
    prompt=prompt,
    size = img_size,
    quality = quality,
    n=n
    )
    image_url = response.data[0].url
    
    return image_url


def generate_image_bfl(prompt, generation_type = "environment", model= "flux1.1pro", bfl_api_keys = BFL_API_KEYS, timeout=60, image_path = None, mask_path = None, seed = None):

    if not bfl_api_keys:
        print("Error: BFL_API_KEY is missing.")
        return

    # random select a bfl api key
    bfl_api_key = random.choice(bfl_api_keys)
    
    # Step 1: Send request to generate image
    if model == "flux1.1":
        response = requests.post(
            'https://api.us1.bfl.ai/v1/flux-pro-1.1',
            headers={
                'accept': 'application/json',
                'x-key': bfl_api_key,
                'Content-Type': 'application/json',
            },
            json={
                'prompt': prompt,
                'width': 1024,
                'height': 768,
            },
            timeout=timeout
        ).json()
    
    elif model == "flux1.1pro":
        response = requests.post(
            'https://api.us1.bfl.ai/v1/flux-pro-1.1-ultra',
            headers={
                'accept': 'application/json',
                'x-key': bfl_api_key,
                'Content-Type': 'application/json',
            },
            json={
                'prompt': prompt,
                'aspect_ratio': "16:9",
                # temporary
                'seed' : seed,
                "safety_tolerance": 2,
            },
            timeout=timeout
        ).json()
        
    elif model == "inpainting":
        
        try:
            # print(f"Image: {image_path}")
            # print(f"Mask: {mask_path}")
            image = image_to_base64(image_path)
            mask = image_to_base64(mask_path)
            # print("successfully encoded image and mask")
        except Exception as e:
            print(f"Error: {e}")
            return
        
        response = requests.post(
            'https://api.us1.bfl.ai/v1/flux-pro-1.0-fill',
            headers={
                'accept': 'application/json',
                'x-key': bfl_api_key,
                'Content-Type': 'application/json',
            },
            json={
                'prompt': prompt,
                'image': image,
                'mask': mask,
                'seed': seed,
            },
            timeout=timeout
        ).json()
        
    elif model == "control":
        try:
            image = image_to_base64(image_path)
        except Exception as e:
            print(f"Error: {e}")
            return
        
        response = requests.post(
            'https://api.us1.bfl.ai/v1/flux-pro-1.0-canny',
            headers={
                'accept': 'application/json',
                'x-key': bfl_api_key,
                'Content-Type': 'application/json',
            },
            json={
                'prompt': prompt,
                'control_image': image,
                'seed': seed,
            },
            timeout=timeout
        ).json()

    # Extract request ID
    request_id = response.get("id")
    url = response.get("polling_url")
    if not request_id:
        print("Error: Failed to get request ID.")
        return

    print(f"Request submitted. ID: {request_id}, URL: {url}")

    # Step 2: Poll until the result is ready
    while True:
        time.sleep(0.5)
        result = requests.get(
            # 'https://api.us1.bfl.ai/v1/get_result',
            url,
            headers={
                'accept': 'application/json',
                'x-key': bfl_api_key,
            },
            # params={'id': request_id},
            timeout=timeout
        ).json()

        status = result.get("status")
        
        if status == "Ready":
            # Step 3: Extract and return image URL
            image_url = result["result"]["sample"]
            print(f"Image URL: {image_url}")
            return image_url
        elif status == "Request Moderated":
            print("Error: Request was moderated.")
            return
        elif status == "Pending":
            #do nothing
            pass
        else:
            print(f"Error: {result}")
            return
def generate_image_bfl_kontext(prompt, generation_type = "environment", model= "fluxkontext", bfl_api_keys = BFL_API_KEYS, timeout=60, image_path = None, mask_path = None, seed = None):

    print(f"using bfl kontext")
    if not bfl_api_keys:
        print("Error: BFL_API_KEY is missing.")
        return

    # random select a bfl api key
    bfl_api_key = random.choice(bfl_api_keys)
    
    # Step 1: Send request to generate image
    response = None
    if not image_path:
        print("No image")
        response = requests.post(
            'https://api.bfl.ai/v1/flux-kontext-max',
            headers={
                "x-key": bfl_api_key,
                "Content-Type": "application/json",
            },
            json={
                "prompt": prompt,
                "output_format": "png",
                "prompt_upsampling": False,
                "safety_tolerance": 6,
                'aspect_ratio': "16:9",
                'seed': seed
            },
            timeout=timeout
        ).json()
    else:
        print(f"Using image: {image_path}")
        image = image_to_base64(image_path)
        # get aspect ratio from image
        # img = cv2.imread(image_path)
        # height, width, _ = img.shape
        with Image.open(image_path) as im:
            width, height = im.size
        aspect_ratio = f"{width}:{height}"
        response = requests.post(
            'https://api.bfl.ai/v1/flux-kontext-max',
            headers={
                'accept': 'application/json',
                'x-key': bfl_api_key,
                'Content-Type': 'application/json',
            },
            json={
                'prompt': prompt,
                'aspect_ratio': aspect_ratio,
                'input_image': image,
                'seed': seed
            },
            timeout=timeout
        ).json()
    
    # Extract request ID
    request_id = response.get("id")
    url = response.get("polling_url")
    if not request_id:
        print("Error: Failed to get request ID.")
        return

    print(f"Request submitted. ID: {request_id}, URL: {url}")

    # Step 2: Poll until the result is ready
    while True:
        time.sleep(0.5)
        result = requests.get(
            url,
            headers={
                'accept': 'application/json',
                'x-key': bfl_api_key,
            },
            timeout=timeout
        ).json()

        status = result.get("status")
        
        if status == "Ready":
            # Step 3: Extract and return image URL
            image_url = result["result"]["sample"]
            print(f"Image URL: {image_url}")
            return image_url
        elif status == "Request Moderated":
            print("Error: Request was moderated.")
            return
        elif status == "Pending":
            #do nothing
            pass
        else:
            print(f"Error: {result}")
            return

def generate_image_bfl_kontext_2Ref(prompt, generation_type = "environment", model= "flux-2-pro", bfl_api_keys = BFL_API_KEYS, timeout=60, image_path_1 = None, image_path_2 = None, mask_path = None, seed = None):
    #  print the name of "model" parameter
    print(f"using bfl kontext 2ref with model: {model}")
    if not bfl_api_keys:
        print("Error: BFL_API_KEY is missing.")
        return

    # random select a bfl api key
    bfl_api_key = random.choice(bfl_api_keys)
    
    # Step 1: Send request to generate image
    response = None
    if not image_path_1 or not image_path_2:
        print("No image")
        if model == "flux-2-pro":
            response = requests.post(
                'https://api.bfl.ai/v1/flux-2-pro',
                headers={
                    "x-key": bfl_api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "prompt": prompt,
                    "output_format": "png",
                    "prompt_upsampling": False,
                    "safety_tolerance": 5,
                    'width': 1920,
                    'height': 1080,
                    'seed': seed
                },
                timeout=timeout
            ).json()
        else:
            response = requests.post(
                'https://api.bfl.ai/v1/flux-kontext-max',
                headers={
                    "x-key": bfl_api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "prompt": prompt,
                    "output_format": "png",
                    "prompt_upsampling": False,
                    "safety_tolerance": 2,
                    'aspect_ratio': "16:9",
                    'seed': seed
                },
                timeout=timeout
            ).json()
    else:
        print(f"Using image: {image_path_1} and {image_path_2}")
        image_1 = image_to_base64(image_path_1)
        image_2 = image_to_base64(image_path_2)

        # get aspect ratio from image
        # img = cv2.imread(image_path_1)
        # height, width, _ = img.shape
        with Image.open(image_path_1) as im:
            width, height = im.size
        aspect_ratio = f"{width}:{height}"
        # print(f"Aspect ratio: {aspect_ratio}")
        # full_prompt = f"## Critical!: <input_image> is original illustration (first image), <input_image_2> is for your style reference (second image). You have to tweak **original illustration's style** based on tweaking-direction-prompt. Tweaking Direction are derived from the style-reference, which is what user wants. You can also refer to <reference_image> to have better results.\n ### Tweaking Direction:{prompt}\n"
        if model == "flux-2-pro":
            response = requests.post(
                'https://api.bfl.ai/v1/flux-2-pro',
                headers={
                    'accept': 'application/json',
                    'x-key': bfl_api_key,
                    'Content-Type': 'application/json',
                },
                json={
                    'prompt': prompt,
                    'width': 1920,
                    'height': 1080,
                    'input_image': image_1,
                    'input_image_2': image_2,
                    'seed': seed
                },
                timeout=timeout
            ).json()
        else:
            response = requests.post(
                'https://api.bfl.ai/v1/flux-kontext-max',
                headers={
                    'accept': 'application/json',
                    'x-key': bfl_api_key,
                    'Content-Type': 'application/json',
                },
                json={
                    'prompt': prompt,
                    'aspect_ratio': aspect_ratio,
                    'input_image': image_1,
                    'input_image_2': image_2,
                    'seed': seed
                },
                timeout=timeout
            ).json()
    
    # Extract request ID
    request_id = response.get("id")
    url = response.get("polling_url")
    if not request_id:
        print("Error: Failed to get request ID.")
        return

    print(f"Request submitted. ID: {request_id}, URL: {url}")

    # Step 2: Poll until the result is ready
    while True:
        time.sleep(0.5)
        result = requests.get(
            url,
            headers={
                'accept': 'application/json',
                'x-key': bfl_api_key,
            },
            timeout=timeout
        ).json()

        status = result.get("status")
        
        if status == "Ready":
            # Step 3: Extract and return image URL
            image_url = result["result"]["sample"]
            print(f"Image URL: {image_url}")
            return image_url
        elif status == "Request Moderated":
            print("Error: Request was moderated.")
            return
        elif status == "Pending":
            #do nothing
            pass
        else:
            print(f"Error: {result}")
            return                              
                  

def image_to_base64(image_path):
    """Convert an image file to a Base64-encoded string."""
    with open(image_path, "rb") as image_file:
        encoded_string = base64.b64encode(image_file.read()).decode("utf-8")
    return encoded_string

def generate_image_stability(prompt: str, stability_api_keys=STABILITY_API_KEY, image_path= None, style_reference_path= None, seed = None, target_path= None):
    
    host = "https://api.stability.ai/v2beta/stable-image/control/style-transfer"
    headers = {
        "Accept": "image/*",
        "Authorization": f"Bearer {stability_api_keys}"
    }
    
    # paremeters
    params = {
        "prompt": prompt,
        # "negative_prompt": "", 
        "style_strength": 0.5,  
        "composition_fidelity": 0.5, 
        "change_strength": 0.5,  
        "output_format": "png",
        "seed": seed
    }
    # prepare files
    files = {}

    # If no image or style reference is provided, send an empty file
    if image_path is None and style_reference_path is None:
        files["none"] = ''
        print("No image or style reference provided, sending empty file.")
    else:
        if image_path and os.path.exists(image_path):
            files["init_image"] = open(image_path, 'rb')
        if style_reference_path and os.path.exists(style_reference_path):
            files["style_image"] = open(style_reference_path, 'rb')

        print(f"Stability AI Using image: {image_path} and style reference: {style_reference_path}")
    try:
        print(f"Sending REST request to {host}...")
        response = requests.post(
            host,
            headers=headers,
            files=files,
            data=params
        )
        
        if not response.ok:
            raise Exception(f"HTTP {response.status_code}: {response.text}")
        
        output_image = response.content
        finish_reason = response.headers.get("finish-reason")
        
        if finish_reason == 'CONTENT_FILTERED':
            raise Warning("Generation failed NSFW classifier")
        
        if target_path:
            with open(target_path, "wb") as f:
                f.write(output_image)
        else:
            print(f"Image not saved. No target path specified.")

        print(f"Image saved to: {target_path}")
        
        # return target_path
        
    finally:
        for file_handle in files.values():
            if hasattr(file_handle, 'close'):
                file_handle.close()
