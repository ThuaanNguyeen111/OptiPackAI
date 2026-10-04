"""CP-SAT model: can these units be packed into exactly this set of boxes?

The model is deliberately STRICTER than the TypeScript validator, so every
"feasible" answer is valid there too (the backend still re-validates it):

* support: a unit rests on the floor, OR entirely on one supporter, OR on two
  supporters whose top faces exactly cover its base (split along x or along y);
  the validator also accepts covers made of 3+ pieces;
* stack load: each supporter is charged the FULL weight resting on the unit it
  carries (the validator splits it by contact area);
* a fragile unit or one with no stack allowance has nothing touching its top face.

Consequently "infeasible" means infeasible under these stricter rules, which is
why the backend labels the result `optimal_in_model`, not a global optimum.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from itertools import combinations

from ortools.sat.python import cp_model

from .models import BoxIn, PlacementOut, UnitIn


@dataclass
class ComboAnswer:
    status: str  # feasible | infeasible | unknown
    placements: list[PlacementOut] | None
    wall_ms: int


def _fits(v_dx: int, v_dy: int, v_dz: int, box: BoxIn) -> bool:
    return v_dx <= box.length_mm and v_dy <= box.width_mm and v_dz <= box.height_mm


def _bears(unit: UnitIn) -> bool:
    """Can anything rest on this unit?"""
    return not unit.fragile and unit.max_stack_load_g is not None


def solve_combo(
    units: list[UnitIn],
    boxes: list[BoxIn],
    deterministic_time: float,
    wall_time: float,
    seed: int,
) -> ComboAnswer:
    started = time.perf_counter()

    def answer(status: str, placements: list[PlacementOut] | None = None) -> ComboAnswer:
        return ComboAnswer(status, placements, int((time.perf_counter() - started) * 1000))

    n, k = len(units), len(boxes)
    total_weight = sum(u.weight_g for u in units)

    # Cheap necessary conditions first (the backend already checks most of them).
    for u in units:
        if not any(
            _fits(v.dx, v.dy, v.dz, b) and u.weight_g <= b.max_load_g
            for v in u.variants
            for b in boxes
        ):
            return answer("infeasible")

    m = cp_model.CpModel()
    max_l = max(b.length_mm for b in boxes)
    max_w = max(b.width_mm for b in boxes)
    max_h = max(b.height_mm for b in boxes)

    # --- assignment and variant choice -------------------------------------------------
    a = [[m.new_bool_var(f"a_{i}_{b}") for b in range(k)] for i in range(n)]
    v = [
        [m.new_bool_var(f"v_{i}_{s}") for s in range(len(u.variants))] for i, u in enumerate(units)
    ]
    for i, u in enumerate(units):
        m.add_exactly_one(a[i])
        m.add_exactly_one(v[i])
        for b, box in enumerate(boxes):
            if u.weight_g > box.max_load_g:
                m.add(a[i][b] == 0)
            for s, var in enumerate(u.variants):
                if not _fits(var.dx, var.dy, var.dz, box):
                    m.add_bool_or([a[i][b].Not(), v[i][s].Not()])

    dx, dy, dz, x, y, z = [], [], [], [], [], []
    for i, u in enumerate(units):
        ds = u.variants
        dx.append(m.new_int_var(min(s.dx for s in ds), max(s.dx for s in ds), f"dx_{i}"))
        dy.append(m.new_int_var(min(s.dy for s in ds), max(s.dy for s in ds), f"dy_{i}"))
        dz.append(m.new_int_var(min(s.dz for s in ds), max(s.dz for s in ds), f"dz_{i}"))
        m.add(dx[i] == sum(s.dx * v[i][t] for t, s in enumerate(ds)))
        m.add(dy[i] == sum(s.dy * v[i][t] for t, s in enumerate(ds)))
        m.add(dz[i] == sum(s.dz * v[i][t] for t, s in enumerate(ds)))
        x.append(m.new_int_var(0, max_l, f"x_{i}"))
        y.append(m.new_int_var(0, max_w, f"y_{i}"))
        z.append(m.new_int_var(0, max_h, f"z_{i}"))
        for b, box in enumerate(boxes):
            m.add(x[i] + dx[i] <= box.length_mm).only_enforce_if(a[i][b])
            m.add(y[i] + dy[i] <= box.width_mm).only_enforce_if(a[i][b])
            m.add(z[i] + dz[i] <= box.height_mm).only_enforce_if(a[i][b])

    # Box load + volume cut (min variant volume — folding never shrinks volume).
    for b, box in enumerate(boxes):
        m.add(sum(u.weight_g * a[i][b] for i, u in enumerate(units)) <= box.max_load_g)
        min_vol = [min(s.dx * s.dy * s.dz for s in u.variants) for u in units]
        m.add(
            sum(min_vol[i] * a[i][b] for i in range(n))
            <= box.length_mm * box.width_mm * box.height_mm
        )

    # Symmetry: consecutive identical boxes are filled in unit-index order.
    for b in range(k - 1):
        if boxes[b] == boxes[b + 1]:
            for j in range(n):
                m.add_bool_or([a[j][b + 1].Not(), *[a[i][b] for i in range(j)]])

    # Symmetry: identical units (same weight, rules and variants) are interchangeable, so
    # order them by (box, z, y, x). Two identical units never share a position (they would
    # overlap), hence the ordering keeps exactly one representative of each permutation.
    base = max(max_l, max_w, max_h) + 1
    box_of = [sum(b * a[i][b] for b in range(k)) for i in range(n)]
    rank = [box_of[i] * base**3 + z[i] * base**2 + y[i] * base + x[i] for i in range(n)]

    def signature(u: UnitIn) -> tuple[object, ...]:
        return (
            u.weight_g,
            u.fragile,
            u.max_stack_load_g,
            tuple((s.dx, s.dy, s.dz, s.folded) for s in u.variants),
        )

    groups: dict[tuple[object, ...], list[int]] = {}
    for i, u in enumerate(units):
        groups.setdefault(signature(u), []).append(i)
    for members in groups.values():
        for i, j in zip(members, members[1:], strict=False):
            m.add(rank[i] <= rank[j])

    # --- same box + non-overlap ----------------------------------------------------------
    same: dict[tuple[int, int], cp_model.IntVar] = {}
    sep: dict[tuple[int, int], list[cp_model.IntVar]] = {}
    for i, j in combinations(range(n), 2):
        if k == 1:
            s_ij = m.new_constant(1)
        else:
            s_ij = m.new_bool_var(f"same_{i}_{j}")
            both = []
            for b in range(k):
                ab = m.new_bool_var(f"ab_{i}_{j}_{b}")
                m.add_bool_and([a[i][b], a[j][b]]).only_enforce_if(ab)
                m.add_bool_or([a[i][b].Not(), a[j][b].Not(), ab])
                both.append(ab)
            m.add(s_ij == sum(both))
        same[(i, j)] = same[(j, i)] = s_ij

        lits = [m.new_bool_var(f"sep_{i}_{j}_{d}") for d in range(6)]
        m.add(x[i] + dx[i] <= x[j]).only_enforce_if(lits[0])
        m.add(x[j] + dx[j] <= x[i]).only_enforce_if(lits[1])
        m.add(y[i] + dy[i] <= y[j]).only_enforce_if(lits[2])
        m.add(y[j] + dy[j] <= y[i]).only_enforce_if(lits[3])
        m.add(z[i] + dz[i] <= z[j]).only_enforce_if(lits[4])
        m.add(z[j] + dz[j] <= z[i]).only_enforce_if(lits[5])
        m.add_bool_or([*lits, s_ij.Not()])
        sep[(i, j)] = lits
        # Same literals seen from j's side (left/right, behind/front, below/above swapped).
        sep[(j, i)] = [lits[1], lits[0], lits[3], lits[2], lits[5], lits[4]]

    # --- support ---------------------------------------------------------------------------
    bearing = [_bears(u) for u in units]
    rests_on: dict[tuple[int, int], list[cp_model.IntVar]] = {}  # (i, j) -> literals "i rests on j"

    for i in range(n):
        options: list[cp_model.IntVar] = []
        floor = m.new_bool_var(f"floor_{i}")
        m.add(z[i] == 0).only_enforce_if(floor)
        options.append(floor)

        supporters = [j for j in range(n) if j != i and bearing[j]]
        for j in supporters:
            on = m.new_bool_var(f"on_{i}_{j}")
            m.add_implication(on, same[(i, j)])
            m.add(z[i] == z[j] + dz[j]).only_enforce_if(on)
            m.add(x[j] <= x[i]).only_enforce_if(on)
            m.add(x[i] + dx[i] <= x[j] + dx[j]).only_enforce_if(on)
            m.add(y[j] <= y[i]).only_enforce_if(on)
            m.add(y[i] + dy[i] <= y[j] + dy[j]).only_enforce_if(on)
            options.append(on)
            rests_on.setdefault((i, j), []).append(on)

        for j, q in combinations(supporters, 2):
            # Two supporters with tops at z_i; for each axis, either may be the "low" side.
            for axis in ("x", "y"):
                for lo, hi in ((j, q), (q, j)):
                    lit = m.new_bool_var(f"pair_{i}_{lo}_{hi}_{axis}")
                    m.add_implication(lit, same[(i, lo)])
                    m.add_implication(lit, same[(i, hi)])
                    m.add(z[i] == z[lo] + dz[lo]).only_enforce_if(lit)
                    m.add(z[i] == z[hi] + dz[hi]).only_enforce_if(lit)
                    if axis == "x":
                        p, dp, r, dr = x, dx, y, dy
                    else:
                        p, dp, r, dr = y, dy, x, dx
                    # Both supporters span the unit's full extent on the OTHER axis.
                    for s in (lo, hi):
                        m.add(r[s] <= r[i]).only_enforce_if(lit)
                        m.add(r[i] + dr[i] <= r[s] + dr[s]).only_enforce_if(lit)
                    # Along this axis: lo covers the start, hi covers the end, no gap between.
                    m.add(p[lo] <= p[i]).only_enforce_if(lit)
                    m.add(p[hi] + dp[hi] >= p[i] + dp[i]).only_enforce_if(lit)
                    m.add(p[lo] + dp[lo] >= p[hi]).only_enforce_if(lit)
                    options.append(lit)
                    rests_on.setdefault((i, lo), []).append(lit)
                    rests_on.setdefault((i, hi), []).append(lit)

        m.add_bool_or(options)

    # Nothing may touch the top face of a unit that bears nothing (validator rule).
    for j in range(n):
        if bearing[j]:
            continue
        for i in range(n):
            if i == j:
                continue
            touch = m.new_bool_var(f"touch_{i}_{j}")
            m.add(z[i] == z[j] + dz[j]).only_enforce_if(touch)
            m.add(z[i] != z[j] + dz[j]).only_enforce_if(touch.Not())
            lits = sep[(i, j)]
            m.add_bool_or([touch.Not(), same[(i, j)].Not(), lits[0], lits[1], lits[2], lits[3]])

    # --- stack load (conservative: full weight above charged to every supporter) ----------
    load = [
        m.new_int_var(0, units[j].max_stack_load_g or 0, f"load_{j}") if bearing[j] else None
        for j in range(n)
    ]
    for j in range(n):
        load_j = load[j]
        if load_j is None:
            continue
        contributions = []
        for i in range(n):
            rest_lits = rests_on.get((i, j))
            if not rest_lits:
                continue
            rest = m.new_bool_var(f"rest_{i}_{j}")
            for lit in rest_lits:
                m.add_implication(lit, rest)
            c = m.new_int_var(0, total_weight, f"c_{i}_{j}")
            above = load[i]
            if above is None:
                m.add(c >= units[i].weight_g).only_enforce_if(rest)
            else:
                m.add(c >= units[i].weight_g + above).only_enforce_if(rest)
            contributions.append(c)
        if contributions:
            m.add(load_j >= sum(contributions))

    # --- solve ---------------------------------------------------------------------------
    solver = cp_model.CpSolver()
    solver.parameters.max_deterministic_time = deterministic_time
    solver.parameters.max_time_in_seconds = max(0.05, wall_time)
    solver.parameters.num_workers = 8
    # Interleaved search makes multi-worker solving deterministic for a fixed seed
    # and deterministic-time limit (same request -> same answer and placements).
    solver.parameters.interleave_search = True
    solver.parameters.random_seed = seed
    status = solver.solve(m)

    if status == cp_model.INFEASIBLE:
        return answer("infeasible")
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return answer("unknown")

    placements: list[PlacementOut] = []
    for i, u in enumerate(units):
        box_index = next(b for b in range(k) if solver.value(a[i][b]))
        s = next(t for t in range(len(u.variants)) if solver.value(v[i][t]))
        var = u.variants[s]
        placements.append(
            PlacementOut(
                key=u.key,
                box_index=box_index,
                x=solver.value(x[i]),
                y=solver.value(y[i]),
                z=solver.value(z[i]),
                dx=var.dx,
                dy=var.dy,
                dz=var.dz,
                orientation=var.orientation,
                folded=var.folded,
            )
        )
    return answer("feasible", placements)
