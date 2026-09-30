"""
STRATA Automated ASTM Standards Testing & Qualification Engine
Evaluates composite constituent chemistry, laminate stacking architecture, and service conditions
to output the exact authoritative ASTM / SACMA / ISO testing standards and conditioning protocols.
"""

from typing import List, Dict, Any


def generate_astm_card(m: Dict[str, Any], reinf_list: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Generates dynamic ASTM qualification and testing suite tailored to the matrix and reinforcements.
    """
    matrix_cat = m.get("cat", "synpoly")
    is_polymer = matrix_cat in ("synpoly", "natpoly")
    is_metal = matrix_cat in ("metal", "element")
    is_ceramic = matrix_cat in ("ceramic",)

    has_core = any(r["mat"].get("cat") == "core" for r in reinf_list)
    has_continuous_fiber = any(r.get("orientation") not in ("particulate", "random") for r in reinf_list)
    has_particulate = any(r.get("orientation") == "particulate" for r in reinf_list)
    any_conductive = m.get("elec") == "C" or any(r["mat"].get("elec") == "C" for r in reinf_list)

    standards: List[Dict[str, str]] = []
    warnings: List[str] = []

    # 1. Tensile Properties
    if has_core:
        standards.append({
            "property_name": "Facing Tensile Strength",
            "standard_code": "ASTM D3039 / ASTM C297",
            "description": "Standard Test Method for Tensile Properties of Polymer Matrix Composite Materials / Flatwise Tensile"
        })
    elif is_polymer:
        standards.append({
            "property_name": "Tensile Modulus & Strength",
            "standard_code": "ASTM D3039 / D3039M",
            "description": "Standard Test Method for Tensile Properties of Polymer Matrix Composite Materials"
        })
    elif is_metal:
        standards.append({
            "property_name": "Tensile Modulus & Yield Strength",
            "standard_code": "ASTM D3552 / ASTM E8M",
            "description": "Standard Test Method for Tensile Properties of Fiber-Reinforced Metal Matrix Composites"
        })
    elif is_ceramic:
        standards.append({
            "property_name": "High-Temperature Tensile Strength",
            "standard_code": "ASTM C1359 / ASTM C1275",
            "description": "Standard Test Method for Monotonic Tensile Strength of Continuous Fiber-Reinforced Advanced Ceramics"
        })

    # 2. Compressive Properties
    if is_polymer:
        standards.append({
            "property_name": "Compressive Strength (CLC)",
            "standard_code": "ASTM D6641 / D6641M",
            "description": "Combined Loading Compression (CLC) test fixture for polymer matrix composite laminates"
        })
    elif is_metal:
        standards.append({
            "property_name": "Compressive Yield Strength",
            "standard_code": "ASTM E9",
            "description": "Standard Test Methods of Compression Testing of Metallic Materials at Room Temperature"
        })
    elif is_ceramic:
        standards.append({
            "property_name": "Compressive Strength",
            "standard_code": "ASTM C1424",
            "description": "Monotonic Compressive Strength of Advanced Ceramics at Ambient Temperature"
        })

    # 3. Flexural Properties
    if is_polymer:
        standards.append({
            "property_name": "Flexural Modulus & Strength",
            "standard_code": "ASTM D7264 / ASTM D790",
            "description": "Standard Test Method for Flexural Properties of Polymer Matrix Composite Materials (3-point / 4-point)"
        })
    elif is_ceramic:
        standards.append({
            "property_name": "Flexural Strength (Modulus of Rupture)",
            "standard_code": "ASTM C1161",
            "description": "Flexural Strength of Advanced Ceramics at Ambient Temperature (4-point bend)"
        })

    # 4. In-Plane Shear & Interlaminar Shear Strength (ILSS)
    if is_polymer and has_continuous_fiber:
        standards.append({
            "property_name": "In-Plane Shear Modulus (G12)",
            "standard_code": "ASTM D3518 / D3518M",
            "description": "In-Plane Shear Response of Polymer Matrix Composite Materials by Tensile Test of a ±45° Laminate"
        })
        standards.append({
            "property_name": "Short-Beam Shear (ILSS)",
            "standard_code": "ASTM D2344 / D2344M",
            "description": "Standard Test Method for Short-Beam Strength of Polymer Matrix Composite Materials and Their Laminates"
        })
        standards.append({
            "property_name": "Mode I Interlaminar Fracture (G_Ic)",
            "standard_code": "ASTM D5528",
            "description": "Mode I Interlaminar Fracture Toughness of Unidirectional Polymer Matrix Composites"
        })
    elif is_ceramic:
        standards.append({
            "property_name": "Interlaminar Shear Strength",
            "standard_code": "ASTM C1425",
            "description": "Interlaminar Shear Strength of 1D and 2D Continuous Fiber-Reinforced Advanced Ceramics at Elevated Temp"
        })

    # 5. Sandwich Core Properties (if core present)
    if has_core:
        standards.append({
            "property_name": "Sandwich Flatwise Compression",
            "standard_code": "ASTM C365 / C365M",
            "description": "Standard Test Method for Flatwise Compressive Properties of Sandwich Cores"
        })
        standards.append({
            "property_name": "Core Shear Properties",
            "standard_code": "ASTM C273 / C273M",
            "description": "Standard Test Method for Shear Properties of Sandwich Core Materials"
        })
        standards.append({
            "property_name": "Sandwich Flexure (Long-Beam)",
            "standard_code": "ASTM C393 / C393M",
            "description": "Core Shear Properties of Sandwich Constructions by Beam Flexure"
        })

    # 6. Physical & Void Content
    if is_polymer:
        standards.append({
            "property_name": "Reinforcement Content & Void Ratio",
            "standard_code": "ASTM D3171 / ASTM D2734",
            "description": "Constituent Content of Composite Materials (Resin Burn-off / Acid Digestion) and Void Content"
        })
        standards.append({
            "property_name": "Specific Gravity / Density",
            "standard_code": "ASTM D792 / ASTM D1505",
            "description": "Standard Test Methods for Density and Specific Gravity of Plastics by Displacement"
        })
    elif is_metal:
        standards.append({
            "property_name": "Density & Porosity",
            "standard_code": "ASTM B311 / ASTM B962",
            "description": "Density of Powder Metallurgy and Metal Matrix Composite Materials"
        })
    elif is_ceramic:
        standards.append({
            "property_name": "Apparent Porosity & Bulk Density",
            "standard_code": "ASTM C373",
            "description": "Water Absorption, Bulk Density, Apparent Porosity of Fired White Ware Products"
        })

    # 7. Thermomechanical & Thermal Expansion
    standards.append({
        "property_name": "Coefficient of Thermal Expansion (CTE)",
        "standard_code": "ASTM E831 / ASTM E228",
        "description": "Linear Thermal Expansion of Solid Materials by Thermomechanical Analysis (TMA) and Push-Rod Dilatometry"
    })
    standards.append({
        "property_name": "Thermal Diffusivity / Conductivity",
        "standard_code": "ASTM E1461",
        "description": "Thermal Diffusivity by the Flash Method (Laser Flash Thermal Analysis)"
    })

    # 8. Glass Transition & Curing (Polymers)
    if is_polymer:
        standards.append({
            "property_name": "Glass Transition Temperature (Tg)",
            "standard_code": "ASTM E1640 (DMA) / ASTM D3418 (DSC)",
            "description": "Assignment of the Glass Transition Temperature by Dynamic Mechanical Analysis and DSC"
        })
        standards.append({
            "property_name": "Moisture Absorption Conditioning",
            "standard_code": "ASTM D5229 / D5229M",
            "description": "Moisture Absorption Properties and Equilibrium Conditioning of Polymer Matrix Composite Materials"
        })

    # 9. Electrical Characterization
    if any_conductive:
        standards.append({
            "property_name": "Electrical Resistivity (Conductor)",
            "standard_code": "ASTM B193",
            "description": "Standard Test Method for Resistivity of Electrical Conductor Materials"
        })
    else:
        standards.append({
            "property_name": "Insulation Resistance & Volume Resistivity",
            "standard_code": "ASTM D257",
            "description": "Standard Test Methods for DC Resistance or Conductance of Insulating Materials"
        })

    # 10. Flammability / FST
    if is_polymer:
        standards.append({
            "property_name": "Aerospace Flammability & Smoke Density",
            "standard_code": "FAR 25.853 (Appendix F) / ASTM E662",
            "description": "FAA 60-Second Vertical Bunsen Burner Flammability and Specific Optical Smoke Density"
        })

    # Constituent level standards
    constituent_standards = [{"name": f"{m['name']} (Matrix)", "standard": m.get("astm", "ASTM D638")}]
    for r in reinf_list:
        mat = r["mat"]
        constituent_standards.append({
            "name": f"{mat['name']} (Reinforcement)",
            "standard": mat.get("astm", "ASTM D3822")
        })

    # Test Warnings
    total_vf = sum(r["vf"] for r in reinf_list)
    if total_vf > 0.65:
        warnings.append(
            f"High fiber volume fraction ({total_vf*100:.1f}%): ASTM D3171 void content testing is highly recommended "
            "due to potential micro-void formation and incomplete resin wet-out near theoretical close-packing limits."
        )
    if m.get("moist") == "H":
        warnings.append(
            f"Moisture sensitivity flag: {m['name']} absorbs significant ambient humidity. Specimens must undergo "
            "equilibrium environmental conditioning per ASTM D5229 before executing tensile and short-beam shear tests."
        )

    return {
        "standards": standards,
        "constituent_standards": constituent_standards,
        "warnings": warnings
    }

