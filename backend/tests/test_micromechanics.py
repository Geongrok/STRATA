import pytest
from backend.engine.micromechanics import (
    halpin_tsai,
    sequential_halpin_tsai,
    clt_off_axis_modulus,
    calculate_composite_properties
)


def test_halpin_tsai_bounds():
    # When Vf = 0, E should be Em
    assert halpin_tsai(3.5, 230.0, 0.0) == pytest.approx(3.5, rel=1e-3)
    # Intermediate modulus
    E_ht = halpin_tsai(3.5, 230.0, 0.5, xi=2.0)
    assert 3.5 < E_ht < 230.0


def test_clt_off_axis_transformation():
    E1 = 140.0  # GPa (Unidirectional Carbon/Epoxy on-axis)
    E2 = 10.0   # GPa (Transverse)
    G12 = 5.0   # GPa (In-plane shear)
    nu12 = 0.3

    # At 0 degrees, Ex should equal E1
    assert clt_off_axis_modulus(E1, E2, G12, nu12, 0.0) == pytest.approx(E1, rel=1e-3)

    # At 90 degrees, Ex should equal E2
    assert clt_off_axis_modulus(E1, E2, G12, nu12, 90.0) == pytest.approx(E2, rel=1e-3)

    # At 45 degrees, Ex should be significantly lower than E1 and higher than transverse E2
    E_45 = clt_off_axis_modulus(E1, E2, G12, nu12, 45.0)
    assert E2 < E_45 < E1
    assert 12.0 < E_45 < 25.0


def test_calculate_composite_carbon_epoxy():
    matrix = {
        "id": "epoxy", "name": "Epoxy", "cat": "synpoly", "matrix": True, "reinf": False,
        "rho": 1.2, "E": 3.5, "ts": 80.0, "elong": 4.0, "k": 0.2, "cte": 60.0, "maxT": 150.0,
        "procT": 120.0, "elec": "I", "costLo": 3.0, "costHi": 8.0, "nu": 0.35, "ductile": False
    }
    reinf = {
        "id": "t300", "name": "Toray T300", "cat": "synfiber", "matrix": False, "reinf": True,
        "rho": 1.76, "E": 230.0, "ts": 3530.0, "elong": 1.5, "k": 10.5, "cte": -0.4, "maxT": 400.0,
        "procT": None, "elec": "C", "costLo": 22.0, "costHi": 35.0, "nu": 0.20, "ductile": False
    }
    reinf_list = [{"mat": reinf, "vf": 0.60, "orientation": "0", "angle": 0.0}]

    res = calculate_composite_properties(matrix, None, reinf_list)

    # Density should be 0.4*1.2 + 0.6*1.76 = 1.536
    assert res["rho"] == pytest.approx(1.536, abs=0.01)
    # Longitudinal modulus E1: 0.4*3.5 + 0.6*230 = 139.4 GPa
    assert res["E1"] == pytest.approx(139.4, abs=0.5)
    # E_eff at 0° should match E1
    assert res["E_eff"] == pytest.approx(139.4, abs=0.5)
    # Electrical should be conductive because carbon is conductive and Vf=0.60 > 0.12
    assert "Conductive" in res["electrical"]
    # Compression should be calculated via Rosen microbuckling
    assert res["tsCompr"] > 0

