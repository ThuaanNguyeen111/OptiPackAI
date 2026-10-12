"""Answer a list of box combinations in order, stopping at the first one that is
not proven infeasible (feasible or unknown): the backend only needs every
CHEAPER combination proven infeasible before trusting a result."""

from __future__ import annotations

import time

from .feasibility import solve_combo
from .models import CheckCombosRequest, CheckCombosResponse, ComboResult


def check_combos(req: CheckCombosRequest) -> CheckCombosResponse:
    started = time.perf_counter()
    results: list[ComboResult] = []
    stopped = False
    for index, combo in enumerate(req.combos):
        remaining = req.wall_time_limit_s - (time.perf_counter() - started)
        if stopped or remaining <= 0:
            results.append(ComboResult(combo_index=index, status="skipped", wall_ms=0))
            stopped = True
            continue
        ans = solve_combo(
            req.units,
            combo,
            deterministic_time=req.deterministic_time_per_combo,
            wall_time=remaining,
            seed=req.seed,
        )
        results.append(
            ComboResult(
                combo_index=index,
                status=ans.status,  # type: ignore[arg-type]
                placements=ans.placements,
                wall_ms=ans.wall_ms,
            )
        )
        if ans.status != "infeasible":
            stopped = True
    return CheckCombosResponse(results=results, stopped_early=stopped)
