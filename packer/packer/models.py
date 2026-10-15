"""Request/response contract between the NestJS backend and this service.

Units are millimetres and grams (integers), same axes as the TypeScript engine:
x = length, y = width, z = height (up). Each unit carries its allowed variants
(orientation x fold) already expanded by the backend, so this service never
re-derives business rules such as "clothes lie flat".
"""

from typing import Literal

from pydantic import BaseModel, Field

from . import SCHEMA_VERSION


class VariantIn(BaseModel):
    dx: int = Field(gt=0)
    dy: int = Field(gt=0)
    dz: int = Field(gt=0)
    orientation: str
    folded: bool = False


class UnitIn(BaseModel):
    key: str
    weight_g: int = Field(ge=0)
    fragile: bool = False
    # None = nothing may rest on this unit (same meaning as max_stack_load_g in TS).
    max_stack_load_g: int | None = None
    variants: list[VariantIn] = Field(min_length=1)


class BoxIn(BaseModel):
    code: str
    length_mm: int = Field(gt=0)
    width_mm: int = Field(gt=0)
    height_mm: int = Field(gt=0)
    max_load_g: int = Field(gt=0)


class CheckCombosRequest(BaseModel):
    schema_version: int = SCHEMA_VERSION
    units: list[UnitIn] = Field(min_length=1)
    # Combinations to test, in the order the backend wants them answered
    # (fewest boxes first, then cheapest). Each is a list of boxes.
    combos: list[list[BoxIn]] = Field(min_length=1)
    # Deterministic-time budget per combination (CP-SAT "deterministic seconds").
    deterministic_time_per_combo: float = Field(default=2.0, gt=0, le=60)
    # Safety cap on wall time for the whole request.
    wall_time_limit_s: float = Field(default=8.0, gt=0, le=120)
    seed: int = 1


class PlacementOut(BaseModel):
    key: str
    box_index: int
    x: int
    y: int
    z: int
    dx: int
    dy: int
    dz: int
    orientation: str
    folded: bool


ComboStatus = Literal["feasible", "infeasible", "unknown", "skipped"]


class ComboResult(BaseModel):
    combo_index: int
    status: ComboStatus
    placements: list[PlacementOut] | None = None
    wall_ms: int


class CheckCombosResponse(BaseModel):
    schema_version: int = SCHEMA_VERSION
    results: list[ComboResult]
    # True when stopped at the first feasible/unknown combination (the rest are 'skipped').
    stopped_early: bool
