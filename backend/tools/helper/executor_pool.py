# executor_pool.py
import atexit
from concurrent.futures import ThreadPoolExecutor
import multiprocessing

MAX_WORKERS = multiprocessing.cpu_count() * 3
executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)

# Optional: shut down the executor automatically when the process exits
atexit.register(executor.shutdown)