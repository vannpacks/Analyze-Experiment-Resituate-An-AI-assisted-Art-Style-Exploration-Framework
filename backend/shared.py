# shared.py
# This file holds shared mutable state and objects to be used across app.py and blueprints.
import threading
from utils.project import Project
from autogen_core import AgentRuntime
from autogen_ext.models.openai import OpenAIChatCompletionClient
from dotenv import load_dotenv
import os
from typing import Dict
import asyncio

def get_executor():
    from tools.helper.executor_pool import executor
    return executor

# For managing status of background tasks
task_status = {}
task_events = {}

# Threading lock for shared resources like iteration_id
lock = threading.Lock()

# Global iteration ID, managed by next_iteration_id in app.py
iteration_id = -1

# Global generation type, can be modified by routes
generation_type = "environment"

data_path = "data"  # Path to the data directory

# intialize a project instance as None initially
# It will be set by the routes when a project is created/accessed
current_project: Project = None

load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


model_general = "gpt-5-2025-08-07"
# model_agent = "gpt-4.1-mini"
model_agent = "o4-mini-2025-04-16"
model_image_generation = "gpt-4o"

model_client = OpenAIChatCompletionClient(
    model=model_agent,
    temperature=1,
)

model_client_light = OpenAIChatCompletionClient(
    model="gpt-4.1-nano",
    temperature=1,
)


runtime: AgentRuntime = None
response_queues: Dict[str, asyncio.Queue] = {}


current_language: str = "en"

def set_current_project_language(language: str):
    global current_language
    current_language = language
    
def get_current_project_language() -> str:
    return current_language
