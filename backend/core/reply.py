from autogen_core import RoutedAgent, message_handler, MessageContext
import shared
from utils.messages_type import EvaluationResult, SseEvent
from typing import Union

class ReplyAgent(RoutedAgent):
    """
    This agent receives the final response from the core agent
    and resolves the future for the corresponding web request.
    """
    def __init__(self, description: str = "An agent that handles SSE events.") -> None:
        super().__init__(description)

    async def _distribute(self, event: Union[SseEvent, None], ctx: MessageContext) -> None:
        """A private helper method to avoid code duplication."""
        # Using ctx.id.source is a reliable way to get the session ID
        session_id = ctx.topic_id.source
        event_type = type(event).__name__
        
        print(f"ReplyAgent distributing event of type {event_type} for session: {session_id}")
        
        # print(f"Event content: {event}")  # Debugging line to see the event content
        
        if queue := shared.response_queues.get(session_id):
            await queue.put(event)
        else:
            print(f"Warning: No active response queue found for session {session_id}.")

    @message_handler
    async def handle_result_event(self, message: EvaluationResult, ctx: MessageContext) -> None:
        """Handles final results, including text and images."""
        # If the result is None, we can skip it.
        print(f"\n[{message.source} evaluation result : {message.evaluation}]")
        if message.evaluation:
            await self._distribute(message, ctx)
