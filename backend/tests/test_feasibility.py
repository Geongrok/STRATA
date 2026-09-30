from backend.engine.feasibility import check_composite_feasibility


def test_feasibility_valid():
    matrix = {"id": "epoxy", "name": "Epoxy", "cat": "synpoly", "matrix": True, "procT": 120.0, "maxT": 150.0}
    reinf = {"id": "cf", "name": "Carbon Fibre", "cat": "synfiber", "reinf": True, "maxT": 400.0}
    reinf_list = [{"mat": reinf, "vf": 0.50, "orientation": "0"}]

    res = check_composite_feasibility(matrix, None, reinf_list)
    assert res["ok"] is True


def test_feasibility_thermal_degradation():
    # Aluminum matrix processes at 660°C; UHMWPE Dyneema melts at 144°C
    matrix = {"id": "al", "name": "Aluminum", "cat": "metal", "matrix": True, "procT": 660.0, "maxT": 200.0}
    reinf = {"id": "uhmwpe", "name": "UHMWPE", "cat": "synfiber", "reinf": True, "maxT": 144.0}
    reinf_list = [{"mat": reinf, "vf": 0.30, "orientation": "uni"}]

    res = check_composite_feasibility(matrix, None, reinf_list)
    assert res["ok"] is False
    assert any("degrades or melts" in r for r in res["reasons"])

