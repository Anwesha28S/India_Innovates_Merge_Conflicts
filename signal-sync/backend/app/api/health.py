from fastapi import APIRouter
from app.redis_client import get_redis
from app.services.conflict_engine import ConflictEngine
from app.services.routing_engine import _graph

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    """
    Health check endpoint.
    Returns status of Redis, routing graph, and conflict engine.
    If backend is up but subsystems are degraded, still returns 200
    so signal nodes fall back to NORMAL mode gracefully.
    """
    redis_ok = False
    try:
        await get_redis().ping()
        redis_ok = True
    except Exception:
        pass

    return {
        "status": "ok",
        "redis": "ok" if redis_ok else "degraded",
        "graph_nodes": _graph.number_of_nodes(),
        "graph_edges": _graph.number_of_edges(),
        "conflict_queue": len(ConflictEngine._queue),
    }
