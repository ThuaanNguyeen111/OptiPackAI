from fastapi.testclient import TestClient

from packer.main import app

client = TestClient(app)

CUBE = {
    "key": "A",
    "weight_g": 100,
    "fragile": False,
    "max_stack_load_g": 5000,
    "variants": [{"dx": 100, "dy": 100, "dz": 100, "orientation": "LWH"}],
}


def box(code: str, size: int) -> dict[str, object]:
    return {
        "code": code,
        "length_mm": size,
        "width_mm": size,
        "height_mm": size,
        "max_load_g": 20000,
    }


def test_healthz() -> None:
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_rejects_unknown_schema_version() -> None:
    res = client.post(
        "/v1/check-combos",
        json={"schema_version": 99, "units": [CUBE], "combos": [[box("S", 100)]]},
    )
    assert res.status_code == 400


def test_stops_at_first_combo_not_proven_infeasible() -> None:
    res = client.post(
        "/v1/check-combos",
        json={
            "units": [CUBE],
            "combos": [[box("TINY", 50)], [box("S", 100)], [box("L", 500)]],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert [r["status"] for r in body["results"]] == ["infeasible", "feasible", "skipped"]
    assert body["stopped_early"] is True
    placement = body["results"][1]["placements"][0]
    assert placement["key"] == "A" and placement["box_index"] == 0
