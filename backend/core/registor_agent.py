from core.agent import EvaluationAgent, UserAgent
from core.reply import ReplyAgent# Make sure to import from your actual agent file
from autogen_core.models import SystemMessage, ChatCompletionClient
from autogen_core import TypeSubscription, TopicId
from utils.io import read_prompt, read_prompt_list
from prompts.prompt_config import StylePrompt

# It's good practice to define topic types as constants
USER_TOPIC = "user"
PROFESSIONAL_ARTIST_TOPIC = "professional_artist"
TRENDING_ARTIST_TOPIC = "trending_artist"
FANS_AGENT_TOPIC = "fans_agent"

# --- Define the Persona for Each Agent ---
# You can load these from files or define them directly.
# professional_artist_prompt =  read_prompt(StylePrompt.AGENT_PROFESSIONAL.value)
# trending_artist_prompt = read_prompt(StylePrompt.AGENT_TRENDING.value)
# fans_agent_prompt = read_prompt(StylePrompt.AGENT_FANS.value)

professional_artist_prompt= read_prompt_list("fans")
trending_artist_prompt= read_prompt_list("trending")
fans_agent_prompt= read_prompt_list("professional")


async def register_evaluation_agents(runtime, model_client: ChatCompletionClient):
    """
    Registers the three evaluation agents and the user agent with the runtime.
    """
    
    # 1. Register the Professional Artist Agent
    professional_agent_type = await EvaluationAgent.register(
        runtime,
        type=PROFESSIONAL_ARTIST_TOPIC,
        factory=lambda: EvaluationAgent(
            name="Professional_Artist",
            system_message=professional_artist_prompt,
            model_client=model_client,
            agent_topic_type=PROFESSIONAL_ARTIST_TOPIC,
            user_topic_type=USER_TOPIC,
        ),
    )
    # This agent will listen for messages published on its specific topic
    await runtime.add_subscription(
        TypeSubscription(topic_type=PROFESSIONAL_ARTIST_TOPIC, agent_type=professional_agent_type.type)
    )
    print(f"Registered agent: {professional_agent_type.type}")

    # 2. Register the Trending Artist Agent
    trending_agent_type = await EvaluationAgent.register(
        runtime,
        type=TRENDING_ARTIST_TOPIC,
        factory=lambda: EvaluationAgent(
            name="Trending_Artist",
            system_message=trending_artist_prompt,
            model_client=model_client,
            agent_topic_type=TRENDING_ARTIST_TOPIC,
            user_topic_type=USER_TOPIC,
        ),
    )
    await runtime.add_subscription(
        TypeSubscription(topic_type=TRENDING_ARTIST_TOPIC, agent_type=trending_agent_type.type)
    )
    print(f"Registered agent: {trending_agent_type.type}")

    # 3. Register the Fans Agent
    fans_agent_type = await EvaluationAgent.register(
        runtime,
        type=FANS_AGENT_TOPIC,
        factory=lambda: EvaluationAgent(
            name="Fans_Agent",
            system_message=fans_agent_prompt,
            model_client=model_client,
            agent_topic_type=FANS_AGENT_TOPIC,
            user_topic_type=USER_TOPIC,
        ),
    )
    await runtime.add_subscription(
        TypeSubscription(topic_type=FANS_AGENT_TOPIC, agent_type=fans_agent_type.type)
    )
    print(f"Registered agent: {fans_agent_type.type}")
    
    
        # Register a reply agent
    reply_agent_type = await ReplyAgent.register(
        runtime,
        type=USER_TOPIC,  # Using the core agent topic type.
        factory=lambda: ReplyAgent(
            description="A reply agent.",
        )
    )
    
    await runtime.add_subscription(TypeSubscription(topic_type=USER_TOPIC, agent_type=reply_agent_type.type))

    # 4. Register the User Agent
    # user_agent_type = await UserAgent.register(
    #     runtime,
    #     type=USER_TOPIC,
    #     factory=lambda: UserAgent(
    #         description="A user agent to proxy for the real user.",
    #         user_topic_type=USER_TOPIC,
    #         # The UserAgent needs to know which agents it can talk to.
    #         # We can pass a list of available evaluation agents.
    #         agent_topic_types=[
    #             PROFESSIONAL_ARTIST_TOPIC,
    #             TRENDING_ARTIST_TOPIC,
    #             FANS_AGENT_TOPIC
    #         ]
    #     ),
    # )
    # # The user agent listens for messages published to its own topic
    # await runtime.add_subscription(
    #     TypeSubscription(topic_type=USER_TOPIC, agent_type=user_agent_type.type)
    # )
    # print(f"Registered agent: {user_agent_type.type}")