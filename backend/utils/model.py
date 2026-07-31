from openai import OpenAI
import base64
import os
from dotenv import load_dotenv
import requests
import time
# import cv2
import base64
import numpy as np
import random
from shared import model_general
from PIL import Image

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
BFL_API_KEY_1 = os.getenv("BFL_API_KEY_1")
BFL_API_KEY_2 = os.getenv("BFL_API_KEY_2")
BFL_API_KEYS = [BFL_API_KEY_1, BFL_API_KEY_2]

def get_response(prompt, image_path_1=None, image_path_2=None, model=model_general, temperature=1, response_format="text"):
    # if image_path_1 and image_path_2:
    #     print(f"GetResponseW2Image")
    #     prompt = f"## Critical!: The first image is original illustration, The second image is for style reference. You have to output concrete directions and results by analyzing both original illustration and style reference, so that original illustration can tweak its style without losing its essence.\n{prompt}"
    content = [{"type": "text", "text": prompt}]
    if image_path_1:
        with open(image_path_1, "rb") as f:
            image_data = base64.b64encode(f.read()).decode("utf-8")
        if image_path_1 and image_path_2:
            content.append({
                "type": "text",
                "text": "This is the ORIGINAL illustration:"
            })
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}
        })
    if image_path_2:
        with open(image_path_2, "rb") as f:
            image_data = base64.b64encode(f.read()).decode("utf-8")
        if image_path_1 and image_path_2:
            content.append({
                "type": "text",
                "text": "This is the STYLE REFERENCE illustration:"
            })    
        
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}
        })

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": content}],
            temperature=temperature,
            response_format={"type": response_format},
            reasoning_effort="minimal"
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
                "safety_tolerance": 2,
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
                  

def image_to_base64(image_path):
    """Convert an image file to a Base64-encoded string."""
    with open(image_path, "rb") as image_file:
        encoded_string = base64.b64encode(image_file.read()).decode("utf-8")
    return encoded_string