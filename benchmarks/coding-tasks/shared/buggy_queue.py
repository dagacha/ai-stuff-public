import asyncio
import logging
from typing import Callable

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


class AsyncJobQueue:
    def __init__(self, workers: int = 3, max_retries: int = 3):
        self.workers = workers
        self.max_retries = max_retries
        self._queue: asyncio.Queue = asyncio.Queue()
        self._results: list = []
        self._running: bool = False

    async def _process_job(self, job_id: int, fn: Callable, args: list = []):  # BUG 1
        for attempt in range(self.max_retries):
            try:
                result = await fn(*args)
                logger.info(f"Job {job_id} completed successfully")
                self._results.append((job_id, "success", result))
                return result
            except Exception as e:
                wait = 2 ** attempt  # BUG 3
                if attempt < self.max_retries - 1:
                    logger.warning(
                        f"Job {job_id} attempt {attempt + 1} failed: {e}. "
                        f"Retrying in {wait}s..."
                    )
                    await asyncio.sleep(wait)
                else:
                    logger.error(
                        f"Job {job_id} failed after {self.max_retries} attempts: {e}"
                    )
                    self._results.append((job_id, "failed", str(e)))
                    raise

    async def _worker(self, worker_id: int):
        logger.info(f"Worker {worker_id} started")
        while self._running:
            try:
                job_id, fn, args = await asyncio.wait_for(
                    self._queue.get(), timeout=0.5
                )
                try:
                    await self._process_job(job_id, fn, args)
                except Exception as e:
                    logger.error(
                        f"Worker {worker_id}: job {job_id} ultimately failed: {e}"
                    )
                finally:
                    self._queue.task_done()
            except asyncio.TimeoutError:
                continue
        logger.info(f"Worker {worker_id} stopped")

    async def submit(self, job_id: int, fn: Callable, args: list = None):
        if args is None:
            args = []
        await self._queue.put((job_id, fn, args))

    async def run(self, jobs: list[tuple]) -> list:
        # BUG 4: _results never cleared between calls
        self._running = True
        worker_tasks = [
            asyncio.create_task(self._worker(i)) for i in range(self.workers)
        ]
        for job_id, fn, *fn_args in jobs:
            await self.submit(job_id, fn, fn_args[0] if fn_args else [])
        await self._queue.join()
        self._running = False
        asyncio.gather(*worker_tasks)  # BUG 2: not awaited
        return self._results.copy()
