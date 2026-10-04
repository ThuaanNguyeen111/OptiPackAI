from __future__ import annotations

from itertools import combinations

from packer.feasibility import solve_combo
from packer.models import BoxIn, PlacementOut, UnitIn, VariantIn

ALL6 = ("LWH", "WLH", "LHW", "HLW", "WHL", "HWL")


def unit(
    key: str,
    dims: tuple[int, int, int],
    weight: int = 100,
    *,
    upright: bool = False,
    fragile: bool = False,
    cap: int | None = 50_000,
) -> UnitIn:
    ln, w, h = dims
    shapes = {
        "LWH": (ln, w, h),
        "WLH": (w, ln, h),
        "LHW": (ln, h, w),
        "HLW": (h, ln, w),
        "WHL": (w, h, ln),
        "HWL": (h, w, ln),
    }
    names = ("LWH", "WLH") if upright else ALL6
    seen: set[tuple[int, int, int]] = set()
    variants = []
    for name in names:
        d = shapes[name]
        if d in seen:
            continue
        seen.add(d)
        variants.append(VariantIn(dx=d[0], dy=d[1], dz=d[2], orientation=name))
    return UnitIn(
        key=key, weight_g=weight, fragile=fragile, max_stack_load_g=cap, variants=variants
    )


def box(code: str, dims: tuple[int, int, int], max_load: int = 20_000) -> BoxIn:
    return BoxIn(
        code=code, length_mm=dims[0], width_mm=dims[1], height_mm=dims[2], max_load_g=max_load
    )


def solve(units: list[UnitIn], boxes: list[BoxIn]) -> tuple[str, list[PlacementOut] | None]:
    ans = solve_combo(units, boxes, deterministic_time=5.0, wall_time=20.0, seed=1)
    return ans.status, ans.placements


def assert_geometry(placements: list[PlacementOut], boxes: list[BoxIn]) -> None:
    for p in placements:
        b = boxes[p.box_index]
        assert p.x >= 0 and p.y >= 0 and p.z >= 0
        assert p.x + p.dx <= b.length_mm and p.y + p.dy <= b.width_mm
        assert p.z + p.dz <= b.height_mm
    for p, q in combinations(placements, 2):
        if p.box_index != q.box_index:
            continue
        overlap = (
            p.x < q.x + q.dx
            and q.x < p.x + p.dx
            and p.y < q.y + q.dy
            and q.y < p.y + p.dy
            and p.z < q.z + q.dz
            and q.z < p.z + p.dz
        )
        assert not overlap, (p, q)


def test_exact_fit_is_feasible() -> None:
    units = [unit("A", (100, 100, 100)), unit("B", (100, 100, 100))]
    boxes = [box("B1", (200, 100, 100))]
    status, placements = solve(units, boxes)
    assert status == "feasible"
    assert placements is not None
    assert_geometry(placements, boxes)


def test_volume_overflow_is_infeasible() -> None:
    units = [unit(f"U{i}", (100, 100, 100)) for i in range(3)]
    assert solve(units, [box("B1", (200, 100, 100))])[0] == "infeasible"


def test_item_larger_than_box_is_infeasible() -> None:
    assert solve([unit("A", (300, 10, 10))], [box("S", (200, 200, 200))])[0] == "infeasible"


def test_fragile_cannot_carry_another_item() -> None:
    # Floor holds only one item; the second must stack — forbidden on a fragile one.
    units = [
        unit("G1", (100, 100, 50), fragile=True, upright=True),
        unit("G2", (100, 100, 50), fragile=True, upright=True),
    ]
    assert solve(units, [box("B", (100, 100, 100))])[0] == "infeasible"
    sturdy = [unit("T1", (100, 100, 50), upright=True), unit("T2", (100, 100, 50), upright=True)]
    status, placements = solve(sturdy, [box("B", (100, 100, 100))])
    assert status == "feasible"
    assert placements is not None
    assert sorted(p.z for p in placements) == [0, 50]


def test_shirt_across_two_shoeboxes() -> None:
    # Two shoeboxes fill the floor; the shirt must lie across both (2-supporter cover).
    units = [
        unit("SHOE1", (210, 330, 120), 900, upright=True, cap=5_000),
        unit("SHOE2", (210, 330, 120), 900, upright=True, cap=5_000),
        unit("TEE", (300, 220, 30), 250, upright=True),
    ]
    boxes = [box("B", (420, 330, 150))]
    status, placements = solve(units, boxes)
    assert status == "feasible"
    assert placements is not None
    assert_geometry(placements, boxes)
    tee = next(p for p in placements if p.key == "TEE")
    assert tee.z == 120


def test_stack_load_limit() -> None:
    # Only room to stack; the top item is heavier than what the bottom one may carry.
    heavy = unit("HEAVY", (100, 100, 50), 5_000, upright=True, cap=None)
    weak = unit("WEAK", (100, 100, 50), 100, upright=True, cap=1_000)
    boxes = [box("B", (100, 100, 100))]
    assert solve([heavy, weak], boxes)[0] == "infeasible"
    strong = unit("STRONG", (100, 100, 50), 100, upright=True, cap=6_000)
    assert solve([heavy, strong], boxes)[0] == "feasible"


def test_box_max_load() -> None:
    units = [unit("A", (10, 10, 10), 600), unit("B", (10, 10, 10), 600)]
    assert solve(units, [box("B", (100, 100, 100), max_load=1_000)])[0] == "infeasible"
    assert (
        solve(units, [box("B1", (100, 100, 100), 1_000), box("B2", (100, 100, 100), 1_000)])[0]
        == "feasible"
    )


def test_two_boxes_split_items() -> None:
    units = [unit("A", (100, 100, 100)), unit("B", (100, 100, 100))]
    boxes = [box("S", (100, 100, 100)), box("S", (100, 100, 100))]
    status, placements = solve(units, boxes)
    assert status == "feasible"
    assert placements is not None
    assert {p.box_index for p in placements} == {0, 1}
    assert_geometry(placements, boxes)
