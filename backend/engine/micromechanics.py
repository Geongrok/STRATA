"""
STRATA Micromechanics & Classical Laminate Theory (CLT) Physics Engine
Accurate engineering models for composite properties, multi-angle ply transformations,
Nicolais-Narkis particulate knockdowns, Rosen microbuckling, and Schapery CTE.
"""

import math
from typing import List, Dict, Any, Tuple
from backend.config import USD_TO_INR


def halpin_tsai(Em: float, Er: float, Vf: float, xi: float = 2.0) -> float:
    """Halpin-Tsai homogenization equation for semi-empirical composite stiffness."""
    if Em <= 0:
        return 0.0
    eta = (Er / Em - 1.0) / (Er / Em + xi)
    denom = 1.0 - eta * Vf
    if abs(denom) < 1e-6:
        denom = 1e-6
    return Em * (1.0 + xi * eta * Vf) / denom


def sequential_halpin_tsai(base_value: float, Vbase: float, reinf_list: List[Dict[str, Any]], prop_key: str, xi: float = 2.0) -> float:
    """
    Sequential / nested Halpin-Tsai: folds N reinforcements into one isotropic blended
    value by treating each addition as reinforcing the running matrix-so-far.
    """
    running = base_value
    running_vol = Vbase
    for r in reinf_list:
        vf = r["vf"]
        local_vf = vf / (running_vol + vf) if (running_vol + vf) > 0 else 0
        mat_val = r["mat"].get(prop_key, 0.0)
        running = halpin_tsai(running, mat_val, local_vf, xi)
        running_vol += vf
    return running


def get_ply_angle_and_krenchel(orientation: str, explicit_angle: float = None) -> Tuple[float, float]:
    """
    Returns (angle_in_degrees, krenchel_efficiency_factor).
    Supports numeric angles and named architecture modes.
    """
    orient = str(orientation).lower().strip()
    if explicit_angle is not None:
        theta = float(explicit_angle)
        rad = math.radians(theta)
        # Krenchel orientation factor for unidirectional off-axis: eta = cos^4(theta)
        eta = max(math.cos(rad) ** 4, 0.05)
        return theta, eta

    angle_map = {
        "0": (0.0, 1.0),
        "90": (90.0, 0.05),
        "45": (45.0, 0.25),
        "-45": (-45.0, 0.25),
        "30": (30.0, 0.56),
        "-30": (-30.0, 0.56),
        "60": (60.0, 0.08),
        "-60": (-60.0, 0.08),
        "uni": (0.0, 1.0),
        "woven": (0.0, 0.375),       # Plain weave balanced factor
        "quasi": (0.0, 0.375),       # Quasi-isotropic [0/+-45/90]s
        "random": (0.0, 0.20),       # Planar random chopped strand mat
        "particulate": (0.0, 0.0),   # 3D isotropic particle
    }
    return angle_map.get(orient, (0.0, 1.0))


def clt_off_axis_modulus(E1: float, E2: float, G12: float, nu12: float, theta_deg: float) -> float:
    """
    Classical Laminate Theory (CLT) off-axis transformation for Young's modulus E_x(theta).
    1/Ex = m^4/E1 + (1/G12 - 2*nu12/E1)*m^2*n^2 + n^4/E2
    where m = cos(theta), n = sin(theta).
    """
    if abs(theta_deg) < 1e-4:
        return E1
    if abs(abs(theta_deg) - 90.0) < 1e-4:
        return E2

    rad = math.radians(theta_deg)
    m = math.cos(rad)
    n = math.sin(rad)

    term1 = (m ** 4) / max(E1, 1e-6)
    term2 = (1.0 / max(G12, 1e-6) - 2.0 * nu12 / max(E1, 1e-6)) * (m ** 2) * (n ** 2)
    term3 = (n ** 4) / max(E2, 1e-6)

    inv_Ex = term1 + term2 + term3
    return 1.0 / max(inv_Ex, 1e-9)


def calculate_composite_properties(m: Dict[str, Any], hardener: Dict[str, Any], reinf_list: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Main composite micromechanics calculation.
    m: Matrix material dictionary
    hardener: Optional Hardener dictionary
    reinf_list: List of dicts with keys {"mat": material_dict, "vf": float, "orientation": str, "angle": float}
    """
    VfTotal = sum(r["vf"] for r in reinf_list)
    Vm = max(1.0 - VfTotal, 0.0)

    # Temperature adjustments
    matMaxT = m["maxT"] + (hardener["tgShift"] if hardener else 0.0)
    matProcT = max(m.get("procT") or 0.0, hardener["postCure"]) if hardener else m.get("procT")

    # 1. Density (Rule of Mixtures)
    rho = Vm * m["rho"] + sum(r["vf"] * r["mat"]["rho"] for r in reinf_list)

    # 2. On-Axis Elastic Moduli
    E1 = Vm * m["E"] + sum(r["vf"] * r["mat"]["E"] for r in reinf_list)  # Voigt Upper Bound
    E2 = sequential_halpin_tsai(m["E"], Vm, reinf_list, "E", xi=2.0)     # Nested Halpin-Tsai Transverse

    # 3. Poisson's Ratio & In-Plane Shear Modulus G12
    nu_m = m.get("nu", 0.35)
    nu12 = Vm * nu_m + sum(r["vf"] * r["mat"].get("nu", 0.25) for r in reinf_list)
    GmBase = m["E"] / (2.0 * (1.0 + nu_m))

    reinf_with_G = []
    for r in reinf_list:
        r_mat = dict(r["mat"])
        nu_r = r_mat.get("nu", 0.22)
        r_mat["G"] = r_mat["E"] / (2.0 * (1.0 + nu_r))
        reinf_with_G.append({"mat": r_mat, "vf": r["vf"]})

    G12 = sequential_halpin_tsai(GmBase, Vm, reinf_with_G, "G", xi=1.0)

    # 4. Multi-Angle CLT Effective Modulus E_eff
    if VfTotal <= 0:
        E_eff = m["E"]
    else:
        weighted_E = 0.0
        for r in reinf_list:
            orient = r.get("orientation", "uni")
            angle = r.get("angle")
            theta, _ = get_ply_angle_and_krenchel(orient, angle)

            if orient in ("woven", "quasi"):
                # Balanced fabric: 50% along 0°, 50% along 90°
                layer_E = 0.5 * E1 + 0.5 * E2
            elif orient == "random":
                layer_E = 0.375 * E1 + 0.625 * E2
            elif orient == "particulate":
                layer_E = E2
            else:
                # Continuous ply at specific orientation angle theta
                layer_E = clt_off_axis_modulus(E1, E2, G12, nu12, theta)

            share = r["vf"] / VfTotal
            weighted_E += share * layer_E
        E_eff = weighted_E

    # 5. Tensile Strength
    fibre_rows = [r for r in reinf_list if r.get("orientation") != "particulate"]
    particulate_rows = [r for r in reinf_list if r.get("orientation") == "particulate"]

    matrix_ts = m["ts"]
    for r in particulate_rows:
        # Nicolais-Narkis particulate stress concentration knockdown
        matrix_ts = max(matrix_ts * (1.0 - 1.21 * (r["vf"] ** (2.0 / 3.0))), 0.15 * m["ts"])

    if len(fibre_rows) == 0:
        ts = matrix_ts
        strengthModel = (
            "Nicolais–Narkis equation — rigid particulate reinforcement concentrates stress rather "
            "than sharing load; composite tensile strength is bounded by the knocked-down matrix alone."
        )
        failureMode = "Matrix-controlled — microcracks nucleate at particle/matrix interfacial boundaries"
    else:
        eps_m = m["elong"] / 100.0
        strains = [r["mat"]["elong"] / 100.0 for r in fibre_rows] + [eps_m]
        governing_strain = min(strains)

        fibre_contribution = 0.0
        for r in fibre_rows:
            orient = r.get("orientation", "uni")
            angle = r.get("angle")
            _, eta_k = get_ply_angle_and_krenchel(orient, angle)
            max_stress_at_strain = min(r["mat"]["E"] * 1000.0 * governing_strain, r["mat"]["ts"])
            fibre_contribution += eta_k * r["vf"] * max_stress_at_strain

        matrix_stress_at_gov = min(m["E"] * 1000.0 * governing_strain, matrix_ts)
        ts = fibre_contribution + Vm * matrix_stress_at_gov

        governing_is_matrix = (governing_strain == eps_m) and all(r["mat"]["elong"] / 100.0 >= eps_m for r in fibre_rows)
        failureMode = (
            "Matrix-controlled — resin binder reaches its failure strain first, microcracks, and sheds load"
            if governing_is_matrix
            else "Fibre-controlled — most strain-limited reinforcement fails first, triggering progressive laminate redistribution"
        )
        part_clause = " — matrix term additionally knocked down by Nicolais–Narkis particulate effect." if particulate_rows else "."
        strengthModel = (
            f"Strain-compatibility modified rule of mixtures (Kelly–Tyson / Hull & Clyne) across all plies, "
            f"governed by limiting strain of {governing_strain * 100:.2f}%{part_clause}"
        )

    # 6. Compressive Strength (Rosen Microbuckling)
    vf_fiber = sum(r["vf"] for r in fibre_rows)
    if vf_fiber <= 0:
        tsCompr = ts * (1.0 if m.get("ductile", False) else 1.05)
        comprModel = "Particulate composite behaves symmetrically in tension and compression; estimated at parity with tensile strength."
    elif m.get("ductile", False):
        tsCompr = ts * 0.95
        comprModel = f"Ductile {m['name']} metallic matrix — compressive yield strength approximately equals tensile yield."
    else:
        denom = 2.0 * max(1.0 - vf_fiber, 0.05)
        rosen_est = (G12 * 1000.0) / denom
        tsCompr = min(rosen_est, ts * 0.65)
        comprModel = f"Rosen microbuckling (misalignment-corrected): σ_c ≈ G₁₂/(2(1−Vf_fibre)) = {rosen_est:.0f} MPa, capped at 0.65×σ_t."

    # 7. Thermal Expansion (Schapery's Generalized Equations)
    sum_vi_ei = sum(r["vf"] * r["mat"]["E"] for r in reinf_list)
    denom_cte = Vm * m["E"] + sum_vi_ei
    cte1 = (Vm * m["E"] * m["cte"] + sum(r["vf"] * r["mat"]["E"] * r["mat"]["cte"] for r in reinf_list)) / max(denom_cte, 1e-6)
    cte2 = (1.0 + nu_m) * m["cte"] * Vm + sum((1.0 + r["mat"].get("nu", 0.22)) * r["mat"]["cte"] * r["vf"] for r in reinf_list) - cte1 * nu12

    if VfTotal <= 0:
        cte_eff = m["cte"]
    else:
        weighted_cte = 0.0
        for r in reinf_list:
            orient = r.get("orientation", "uni")
            angle = r.get("angle")
            theta, _ = get_ply_angle_and_krenchel(orient, angle)
            rad = math.radians(theta)
            ply_cte = cte1 * (math.cos(rad) ** 2) + cte2 * (math.sin(rad) ** 2)
            weighted_cte += (r["vf"] / VfTotal) * ply_cte
        cte_eff = weighted_cte

    # 8. Thermal Conductivity
    k1 = Vm * m["k"] + sum(r["vf"] * r["mat"]["k"] for r in reinf_list)
    inv_k2 = (Vm / max(m["k"], 1e-4)) + sum(r["vf"] / max(r["mat"]["k"], 1e-4) for r in reinf_list)
    k2 = 1.0 / max(inv_k2, 1e-6)
    k_iso = sequential_halpin_tsai(m["k"], Vm, reinf_list, "k", xi=2.0)
    k_eff = 0.5 * k1 + 0.5 * k_iso if any(r.get("orientation") in ("woven", "random") for r in reinf_list) else k1

    # 9. Service Temperature Limit
    reinf_max_temps = [r["mat"]["maxT"] for r in reinf_list]
    maxTemp = min([matMaxT] + reinf_max_temps) if reinf_max_temps else matMaxT

    # 10. Electrical Behaviour & Percolation
    electrical = "Insulating"
    conductive_rows = [r for r in reinf_list if r["mat"].get("elec") == "C"]
    if m.get("elec") == "C":
        electrical = "Conductive — metallic continuous matrix phase dominates"
    elif conductive_rows:
        total_cond_vf = sum(r["vf"] for r in conductive_rows)
        perc_thresholds = {"0": 0.12, "90": 0.15, "45": 0.14, "woven": 0.15, "random": 0.20, "particulate": 0.25}
        min_perc = min(perc_thresholds.get(r.get("orientation", "uni"), 0.15) for r in conductive_rows)
        if total_cond_vf >= min_perc:
            electrical = f"Conductive — conductive reinforcement network exceeds percolation threshold ({total_cond_vf*100:.1f}% >= {min_perc*100:.0f}%)"
        else:
            electrical = f"Mostly insulating — conductive filler present ({total_cond_vf*100:.1f}%) but below percolation threshold ({min_perc*100:.0f}%)"

    # 11. Mass Fraction & Cost Aggregation
    total_vol_mass = Vm * m["rho"] + sum(r["vf"] * r["mat"]["rho"] for r in reinf_list)
    massM = (Vm * m["rho"]) / max(total_vol_mass, 1e-6)

    mass_rows = []
    for r in reinf_list:
        m_frac = (r["vf"] * r["mat"]["rho"]) / max(total_vol_mass, 1e-6)
        mass_rows.append({"name": r["mat"]["name"], "mass_fraction": round(m_frac, 4)})

    hardener_cost_bump = hardener["costBump"] if hardener else 0.0
    raw_cost_lo = massM * (m["costLo"] + hardener_cost_bump) + sum(
        ((r["vf"] * r["mat"]["rho"]) / max(total_vol_mass, 1e-6)) * r["mat"]["costLo"] for r in reinf_list
    )
    raw_cost_hi = massM * (m["costHi"] + hardener_cost_bump) + sum(
        ((r["vf"] * r["mat"]["rho"]) / max(total_vol_mass, 1e-6)) * r["mat"]["costHi"] for r in reinf_list
    )

    costLo = raw_cost_lo * 1.15
    costHi = raw_cost_hi * 1.60

    costLoINR = f"₹{costLo * USD_TO_INR:,.0f}"
    costHiINR = f"₹{costHi * USD_TO_INR:,.0f}"

    # Specific Properties
    E_specific = E_eff / max(rho, 1e-4)   # GPa·cm³/g
    ts_specific = ts / max(rho, 1e-4)     # MPa·cm³/g

    return {
        "rho": round(rho, 3),
        "E1": round(E1, 2),
        "E2": round(E2, 2),
        "E_eff": round(E_eff, 2),
        "ts": round(ts, 1),
        "tsCompr": round(tsCompr, 1),
        "comprModel": comprModel,
        "G12": round(G12, 2),
        "nu12": round(nu12, 3),
        "E_specific": round(E_specific, 2),
        "ts_specific": round(ts_specific, 1),
        "strengthModel": strengthModel,
        "failureMode": failureMode,
        "k1": round(k1, 2),
        "k2": round(k2, 2),
        "k_iso": round(k_iso, 2),
        "k_eff": round(k_eff, 2),
        "cte1": round(cte1, 2),
        "cte2": round(cte2, 2),
        "cte_eff": round(cte_eff, 2),
        "maxTemp": round(maxTemp, 1),
        "matMaxT": round(matMaxT, 1),
        "matProcT": round(matProcT, 1) if matProcT is not None else None,
        "electrical": electrical,
        "costLo": round(costLo, 2),
        "costHi": round(costHi, 2),
        "costLoINR": costLoINR,
        "costHiINR": costHiINR,
        "massM": round(massM, 3),
        "massRows": mass_rows,
        "VfTotal": round(VfTotal, 3),
        "Vm": round(Vm, 3),
    }

