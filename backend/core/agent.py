import base64
from typing import Dict, Tuple, List, Union
import random

# Core autogen imports
from autogen_core import Agent, MessageContext, message_handler, RoutedAgent, TopicId, Image
import PIL.Image
from autogen_core.models import (
    ChatCompletionClient,
    SystemMessage,
    UserMessage,
    LLMMessage,
    AssistantMessage  
)
from autogen_core.model_context import BufferedChatCompletionContext
from autogen_ext.models.openai import OpenAIChatCompletionClient

from utils.io import read_prompt
# Your custom message types
from utils.messages_type import ImageEvaluationTask, UserResponse, EvaluationResult, AgentResponse, UserLogin
import shared
from shared import get_current_project_language
from prompts.prompt_config import StylePrompt

# A reusable model client configured for a strong vision model
eval_model_client = OpenAIChatCompletionClient(
    model="gpt-4o",
    temperature=0.5,
)

class EvaluationAgent(RoutedAgent):
    """
    Evaluates an image based on its persona and publishes a structured EvaluationResult.
    """
    def __init__(
        self,
        name: str,
        system_message: list[str], 
        agent_topic_type: str,
        model_client: ChatCompletionClient = eval_model_client,
        user_topic_type: str = "user"
    ) -> None:
        super().__init__(name)
        self._system_message = system_message
        self._model_client = model_client
        self._conversations: Dict[Tuple[int, int], BufferedChatCompletionContext] = {}
        self.agent_topic_type = agent_topic_type
        self.user_topic_type = user_topic_type

    def _get_or_create_context(self, iteration_id: int, user_image_id: int, generated_image_id: int) -> BufferedChatCompletionContext:
        """Retrieves or creates a conversation context for a specific evaluation task."""
        task_key = (iteration_id, user_image_id, generated_image_id)
        if task_key not in self._conversations:
            self._conversations[task_key] = BufferedChatCompletionContext(buffer_size=20)
        return self._conversations[task_key]

    async def _process_and_publish(self, message: ImageEvaluationTask | UserResponse, ctx: MessageContext) -> None:
        """Helper to process a message, call LLM, and publish the result."""
        task_context = self._get_or_create_context(message.iteration_id, message.user_image_id, message.generated_image_id)
        # print imageevaluation task details for debugging
        print(f"Processing evaluation task for {message}")
        # 1. Prepare the content for a standard UserMessage.
        #    The content can be a mix of text and images.
        user_message_content: List[Union[str, Image]] = [message.content]

        # 2. If it's an image task, read the image and add it to the same message content.
        if isinstance(message, ImageEvaluationTask):
            generated_image_path = shared.current_project.read_generated_image(
                iteration_id=message.iteration_id,
                generated_image_id=message.generated_image_id
            )
            user_image_path = shared.current_project.read_user_image(
                iteration_id=message.iteration_id,
                user_image_id=message.user_image_id
            )

            if user_image_path is None:
                raise ValueError(f"User image with ID {message.user_image_id} does not exist.")
            
            try:
                user_message_content.append("Original user input image:")
                user_image = Image(PIL.Image.open(user_image_path))
                user_message_content.append(user_image)
            except Exception as e:
                raise ValueError(f"Failed to read user image at {user_image_path}: {str(e)}")

            # image_path = "data/" + ctx.topic_id.source + "/" + f"{message.user_image_id:03d}" + "/" + f"{message.generated_image_id:03d}" + "/" + f"{message.generated_image_id:03d}.jpg"
            
            if generated_image_path is None:
                raise ValueError(f"Generated image with ID {message.generated_image_id} for user image ID {message.user_image_id} does not exist.")
            
            try:
                user_message_content.append("New image to evaluate:")
                image = Image(PIL.Image.open(generated_image_path))
                user_message_content.append(image)
            
            except Exception as e:
                raise ValueError(f"Failed to read image at {generated_image_path}: {str(e)}")
            

        # 3. Create a standard UserMessage and add it to the conversation history.
        #    This is what the LLM client understands.
        # message_to_history = UserMessage(content=user_message_content, source="User")
        # await task_context.add_message(message_to_history)
        
        # 4. Get all messages to be sent to the model.
        # select one prompt from system_message list randomly
        system_message_prompt = SystemMessage(content=random.choice(self._system_message))
        current_user_message  = UserMessage(content=user_message_content, source="User")
        messages_to_send: List[LLMMessage] = [system_message_prompt, current_user_message]
        # messages_to_send: List[LLMMessage] = [system_message_prompt] + await task_context.get_messages()

        if get_current_project_language() == "zh":
            # Read the Chinese version of the prompt
            prompt_zh = read_prompt(StylePrompt.LANGUAGE_ZH.value)
            messages_to_send.append(UserMessage(content=prompt_zh, source="System"))
        
        llm_response = await self._model_client.create(messages=messages_to_send)
        

        # assistant_message_to_history = AssistantMessage(content=llm_response.content, source=self.agent_topic_type)
        # await task_context.add_message(assistant_message_to_history)

        result_message = EvaluationResult(
            user_image_id=message.user_image_id,
            generated_image_id=message.generated_image_id,
            evaluation=llm_response.content,
            source=self.agent_topic_type
        )
        # Publish the result back to the original sender (the user proxy)
        await self.publish_message(
            result_message,
            topic_id=TopicId(self.user_topic_type, source=ctx.topic_id.source)  # Use the source from the original message
        )

    @message_handler
    async def handle_evaluation_task(self, message: ImageEvaluationTask, ctx: MessageContext) -> None:
        """Handles the initial request to evaluate an image."""
        print(f"\n[{self.agent_topic_type}] Received new evaluation task...")
        await self._process_and_publish(message, ctx)

    @message_handler
    async def handle_user_follow_up(self, message: UserResponse, ctx: MessageContext) -> None:
        """Handles follow-up questions from the user."""
        print(f"\n[{self.agent_topic_type}] Received follow-up question...")
        await self._process_and_publish(message, ctx)
        
        
class UserAgent(RoutedAgent):
    def __init__(self, description: str, user_topic_type: str, agent_topic_types: list[str]) -> None:
        super().__init__(description)
        self._user_topic_type = user_topic_type
        # Store the list of agents it can talk to
        self._agent_topic_types = agent_topic_types

    @message_handler
    async def handle_user_login(self, message: UserLogin, ctx: MessageContext) -> None:
        print(f"{'-'*80}\nUser login, session ID: {self.id.key}.", flush=True)
        print("Available agents to talk to:", self._agent_topic_types)
        # Get the user's initial input after login.
        user_input = input("User: ")
        # Here you would add logic to determine which agent to send the message to
        # For now, let's assume it always goes to the first one.
        target_agent = self._agent_topic_types[0]
        
        print(f"{'-'*80}\n{self.id.type} sending to {target_agent}:\n{user_input}")
        await self.publish_message(
            # This should be an ImageEvaluationTask or UserResponse
            UserResponse(
                content=user_input, 
                user_image_id=0, # Example ID
                generated_image_id=0 # Example ID
            ),
            topic_id=TopicId(target_agent, source=self.id.key),
        )

    @message_handler
    async def handle_task_result(self, message: EvaluationResult, ctx: MessageContext) -> None:
        # This handler now correctly receives EvaluationResult
        print(f"\n--- Response from [{message.source}] ---")
        print(message.evaluation)
        print("-" * (len(message.source) + 20))

        user_input = input("User (type 'exit' to close the session): ")
        if user_input.strip().lower() == "exit":
            print(f"{'-'*80}\nUser session ended.")
            return

        await self.publish_message(
            UserResponse(
                content=user_input,
                user_image_id=message.user_image_id,
                generated_image_id=message.generated_image_id
            ),
            # Send the follow-up to the same agent that sent the last message
            topic_id=TopicId(message.source, source=self.id.key),
        )