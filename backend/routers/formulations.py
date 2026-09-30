import json
import io
import csv
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import SavedFormulation, Material, Hardener
from backend.schemas import FormulationCreate, FormulationOut
from backend.routers.calculations import _mat_to_dict, _hardener_to_dict
from backend.engine.micromechanics import calculate_composite_properties
from backend.engine.feasibility import check_composite_feasibility
from backend.engine.astm_standards import generate_astm_card

router = APIRouter(prefix="/api/v1/formulations", tags=["Saved Formulations"])


@router.post("", response_model=FormulationOut, status_code=201)
def save_formulation(req: FormulationCreate, db: Session = Depends(get_db)):
    # Verify matrix exists
    m_obj = db.query(Material).filter(Material.id == req.matrix_id).first()
    if not m_obj:
        raise HTTPException(status_code=404, detail=f"Matrix '{req.matrix_id}' not found.")
    m_dict = _mat_to_dict(m_obj)

    h_dict = None
    if req.hardener_id:
        h_obj = db.query(Hardener).filter(Hardener.id == req.hardener_id).first()
        if h_obj:
            h_dict = _hardener_to_dict(h_obj)

    reinf_list = []
    reinf_stored = []
    for r in req.reinforcements:
        r_obj = db.query(Material).filter(Material.id == r.id).first()
        if not r_obj:
            raise HTTPException(status_code=404, detail=f"Reinforcement '{r.id}' not found.")
        reinf_list.append({
            "mat": _mat_to_dict(r_obj),
            "vf": r.vf,
            "orientation": r.orientation,
            "angle": r.angle
        })
        reinf_stored.append(r.model_dump())

    # Compute properties
    props = calculate_composite_properties(m_dict, h_dict, reinf_list)
    feasibility = check_composite_feasibility(m_dict, h_dict, reinf_list)
    astm = generate_astm_card(m_dict, reinf_list)

    full_results = {
        **props,
        "feasibility": feasibility,
        "astm_card": astm
    }

    formulation = SavedFormulation(
        title=req.title,
        matrix_id=req.matrix_id,
        hardener_id=req.hardener_id,
        reinforcements_json=json.dumps(reinf_stored),
        computed_properties_json=json.dumps(full_results)
    )
    db.add(formulation)
    db.commit()
    db.refresh(formulation)

    return FormulationOut(
        id=formulation.id,
        title=formulation.title,
        matrix_id=formulation.matrix_id,
        hardener_id=formulation.hardener_id,
        reinforcements_json=formulation.reinforcements_json,
        computed_properties_json=formulation.computed_properties_json,
        created_at=formulation.created_at.isoformat()
    )


@router.get("", response_model=List[FormulationOut])
def list_formulations(limit: int = 20, db: Session = Depends(get_db)):
    rows = db.query(SavedFormulation).order_by(SavedFormulation.created_at.desc()).limit(limit).all()
    return [
        FormulationOut(
            id=r.id,
            title=r.title,
            matrix_id=r.matrix_id,
            hardener_id=r.hardener_id,
            reinforcements_json=r.reinforcements_json,
            computed_properties_json=r.computed_properties_json,
            created_at=r.created_at.isoformat()
        )
        for r in rows
    ]


@router.get("/{formulation_id}", response_model=FormulationOut)
def get_formulation(formulation_id: str, db: Session = Depends(get_db)):
    r = db.query(SavedFormulation).filter(SavedFormulation.id == formulation_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Saved formulation not found.")
    return FormulationOut(
        id=r.id,
        title=r.title,
        matrix_id=r.matrix_id,
        hardener_id=r.hardener_id,
        reinforcements_json=r.reinforcements_json,
        computed_properties_json=r.computed_properties_json,
        created_at=r.created_at.isoformat()
    )


@router.get("/{formulation_id}/export")
def export_formulation(
    formulation_id: str,
    export_format: str = Query("csv", alias="format", pattern="^(csv|json)$"),
    db: Session = Depends(get_db)
):
    r = db.query(SavedFormulation).filter(SavedFormulation.id == formulation_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Saved formulation not found.")

    props = json.loads(r.computed_properties_json)
    reinf = json.loads(r.reinforcements_json)

    if export_format == "json":
        fea_card = {
            "title": r.title,
            "id": r.id,
            "created_at": r.created_at.isoformat(),
            "material_model": "ORTHOTROPIC_ELASTIC_LAMINATE",
            "engineering_constants": {
                "density_g_cm3": props.get("rho"),
                "E1_GPa": props.get("E1"),
                "E2_GPa": props.get("E2"),
                "E_effective_GPa": props.get("E_eff"),
                "G12_GPa": props.get("G12"),
                "nu12": props.get("nu12"),
                "tensile_strength_MPa": props.get("ts"),
                "compressive_strength_MPa": props.get("tsCompr"),
                "CTE_1_per_K": props.get("cte1"),
                "CTE_2_per_K": props.get("cte2"),
                "thermal_conductivity_W_mK": props.get("k_eff"),
                "max_operating_temp_C": props.get("maxTemp"),
            },
            "stacking_sequence": reinf,
            "astm_qualification": props.get("astm_card", {}).get("standards", [])
        }
        return Response(content=json.dumps(fea_card, indent=2), media_type="application/json")

    # CSV Export
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["STRATA Composite Compendium — Material Property Datasheet"])
    writer.writerow(["Title", r.title])
    writer.writerow(["ID", r.id])
    writer.writerow(["Created At", r.created_at.isoformat()])
    writer.writerow(["Matrix", r.matrix_id])
    writer.writerow(["Hardener", r.hardener_id or "None"])
    writer.writerow([])
    writer.writerow(["Laminate Layer Stacking Sequence"])
    writer.writerow(["Layer Index", "Material ID", "Volume Fraction (Vf)", "Orientation / Angle"])
    for idx, layer in enumerate(reinf, 1):
        writer.writerow([idx, layer.get("id"), layer.get("vf"), layer.get("orientation")])
    writer.writerow([])
    writer.writerow(["Computed Mechanical & Physical Properties"])
    writer.writerow(["Property", "Value", "Unit"])
    writer.writerow(["Density (rho)", props.get("rho"), "g/cm3"])
    writer.writerow(["Effective Tensile Modulus (E_eff)", props.get("E_eff"), "GPa"])
    writer.writerow(["Longitudinal Modulus (E1)", props.get("E1"), "GPa"])
    writer.writerow(["Transverse Modulus (E2)", props.get("E2"), "GPa"])
    writer.writerow(["In-Plane Shear Modulus (G12)", props.get("G12"), "GPa"])
    writer.writerow(["Major Poisson's Ratio (nu12)", props.get("nu12"), "dimensionless"])
    writer.writerow(["Tensile Strength", props.get("ts"), "MPa"])
    writer.writerow(["Compressive Strength", props.get("tsCompr"), "MPa"])
    writer.writerow(["Specific Modulus (E/rho)", props.get("E_specific"), "GPa·cm3/g"])
    writer.writerow(["Specific Strength (ts/rho)", props.get("ts_specific"), "MPa·cm3/g"])
    writer.writerow(["Effective CTE", props.get("cte_eff"), "1e-6 / K"])
    writer.writerow(["Effective Thermal Conductivity", props.get("k_eff"), "W/m·K"])
    writer.writerow(["Max Service Temperature", props.get("maxTemp"), "°C"])
    writer.writerow(["Electrical Behavior", props.get("electrical"), ""])
    writer.writerow(["Estimated Cost (USD)", f"${props.get('costLo')} - ${props.get('costHi')}", "USD / kg"])
    writer.writerow(["Estimated Cost (INR)", f"{props.get('costLoINR')} - {props.get('costHiINR')}", "INR / kg"])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=strata_composite_{r.id[:8]}.csv"}
    )
