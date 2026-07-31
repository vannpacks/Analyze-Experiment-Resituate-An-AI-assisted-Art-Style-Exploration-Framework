import shared
import threading

def append_task_status(iteration_id: int, idea_count: int) -> None:
    """Initialise *task_status* and *task_events* entries for ``idea_count`` ideas."""
    if iteration_id not in shared.task_status:
        shared.task_status[iteration_id] = []
    if iteration_id not in shared.task_events:
        shared.task_events[iteration_id] = []

    for _ in range(idea_count):
        shared.task_status[iteration_id].append(
            {
                "image_status": "processing",
                "keyword_status": "processing",
                "suggestion_status": "processing",
                "embedding_status": "processing",
            }
        )
        shared.task_events[iteration_id].append(
            {
                "image_event": threading.Event(),
                "keyword_event": threading.Event(),
                "suggestion_event": threading.Event(),
                "embedding_event": threading.Event(),
            }
        )