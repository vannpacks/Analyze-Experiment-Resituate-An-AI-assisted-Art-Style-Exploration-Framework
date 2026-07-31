from dataclasses import dataclass
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from autogen_core.models import LLMMessage, SystemMessage, UserMessage

    
class UserTask(BaseModel):
    task_id: int
    content: str
    source: str
    # Add these new optional fields
    selected_stage: Optional[str] = None
    block_id: Optional[int] = None
    element: Optional[str] = None
    is_core_agent_instruction: bool = False

class UserLogin(BaseModel):
    pass




class ImageEvaluationTask(BaseModel):
    """
    Represents a user message that includes an image for evaluation.
    """
    iteration_id: int
    generated_image_id: int
    user_image_id: int
    content: str



class UserResponse(BaseModel):
    """
    Represents a user response to an evaluation task.
    """
    content: str
    user_image_id: int
    generated_image_id: int
    
@dataclass
class SseEvent:
    pass

@dataclass
class EvaluationResult(SseEvent):
    """
    Represents the result of an image evaluation.
    """
    user_image_id: int
    generated_image_id: int
    evaluation: str
    source: str
    message: str = "[DONE]"  # Default message indicating completion


class AgentResponse(BaseModel):
    """
    Represents a response from an agent.
    """
    user_image_id: int
    generated_image_id: int
    evaluation_type: str
    source: str