"""
STRATA Materials Science Feasibility & Compatibility Engine
Evaluates thermodynamic compatibility, processing temperatures versus degradation thresholds,
and realistic microstructural packing limits.
"""

from typing import List, Dict, Any, Tuple


def check_composite_feasibility(m: Dict[str, Any], hardener: Dict[str, Any], reinf_list: List[Dict[str, Any]]) -> Dict[str, Any]:
    reasons = []
    ok = True

    matProcT = max(m.get("procT") or 0.0, hardener["postCure"]) if hardener else m.get("procT")

    if not m.get("matrix", False):
        ok = False
        reasons.append(f"{m['name']} cannot serve as a continuous binding (matrix) phase.")

    for r in reinf_list:
        r_mat = r["mat"]
        if r_mat["id"] == m["id"]:
            ok = False
            reasons.append(f"{m['name']} paired with itself is a single homogeneous material, not a composite.")

        if not r_mat.get("reinf", False):
            ok = False
            reasons.append(f"{r_mat['name']} is not typically classified as a load-bearing reinforcement phase.")

        # Thermal Degradation Check: Process temperature exceeds reinforcement stability
        if matProcT is not None and r_mat.get("maxT") is not None:
            if r_mat["maxT"] < matProcT:
                ok = False
                reasons.append(
                    f"{r_mat['name']} degrades or melts around {r_mat['maxT']:.0f}°C, which is below the ~{matProcT:.0f}°C "
                    f"required to process {m['name']}{' with ' + hardener['name'] if hardener else ''}. "
                    "Thermal processing would destroy the reinforcement before composite consolidation."
                )

    # Check for duplicate reinforcements
    reinf_ids = [r["mat"]["id"] for r in reinf_list]
    duplicates = set([x for x in reinf_ids if reinf_ids.count(x) > 1])
    if duplicates:
        ok = False
        reasons.append("The same reinforcement material is added in multiple rows. Each layer row must specify a distinct constituent.")

    if ok:
        for r in reinf_list:
            r_mat = r["mat"]
            if m.get("cat") in ("metal", "ceramic") and r_mat.get("cat") == "synfiber" and r_mat.get("maxT", 0) < 600:
                reasons.append(
                    f"Manufacturing Note: Molten or sintered {m['name']} operates far hotter than {r_mat['name']}'s "
                    "stable thermal window. This combination requires specialized low-temperature physical vapor deposition (PVD) or sol-gel infiltration."
                )

        if m.get("moist") == "H" and any(r["mat"].get("moist") == "H" for r in reinf_list):
            reasons.append(
                "Environmental Advisory: Both matrix and reinforcement exhibit high moisture sensitivity. "
                "Expect dimensional swelling and matrix-fiber debonding in humid service unless sealed with an impermeable topcoat."
            )

        total_vf = sum(r["vf"] for r in reinf_list)
        if total_vf > 0.65:
            reasons.append(
                f"Microstructural Advisory: Combined reinforcement volume fraction of {total_vf*100:.1f}% approaches the "
                "theoretical maximum packing limit (~70–74% for square-packed cylindrical fibers). Expect void formation and incomplete matrix wet-out."
            )

    return {"ok": ok, "reasons": reasons}

