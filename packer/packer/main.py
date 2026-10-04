"""FastAPI entrypoint. Internal service: no auth, never exposed through the Ingress."""

from fastapi import FastAPI, HTTPException

from . import SCHEMA_VERSION
from .models import CheckCombosRequest, CheckCombosResponse
from .service import check_combos

app = FastAPI(title="OptiPackAI packer (CP-SAT)", version="0.1.0")


@app.get("/healthz")
def healthz() -> dict[str, object]:
    return {"status": "ok", "schema_version": SCHEMA_VERSION}


@app.post("/v1/check-combos", response_model=CheckCombosResponse)
def check(req: CheckCombosRequest) -> CheckCombosResponse:
    # Sync handler: FastAPI runs it in a worker thread, so a long solve does not
    # block /healthz.
    if req.schema_version != SCHEMA_VERSION:
        raise HTTPException(
            status_code=400,
            detail=f"schema_version {req.schema_version} not supported (expected {SCHEMA_VERSION})",
        )
    return check_combos(req)
