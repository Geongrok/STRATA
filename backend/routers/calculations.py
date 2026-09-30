from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Material, Hardener
from backend.schemas import CompositeCalculationRequest, CompositeCalculationResponse
from backend.engine.micromechanics import calculate_composite_properties
from backend.engine.feasibility import check_composite_feasibility
from backend.engine.astm_standards import generate_astm_card

router = APIRouter(prefix="/api/v1/composite", tags=["Composite Calculations"])


def _mat_to_dict(mat: Material) -> dict:
    return {
        "id": mat.id,
        "name": mat.name,
        "cat": mat.cat,
        "matrix": mat.matrix,
        "reinf": mat.reinf,
        "rho": mat.rho,
        "E": mat.E,
        "ts": mat.ts,
        "elong": mat.elong,
        "k": mat.k,
        "cte": mat.cte,
        "maxT": mat.maxT,
        "procT": mat.procT,
        "elec": mat.elec,
        "costLo": mat.costLo,
        "costHi": mat.costHi,
        "source": mat.source,
        "moist": mat.moist,
        "uv": mat.uv,
        "chem": mat.chem,
        "tough": mat.tough,
        "ductile": mat.ductile,
        "note": mat.note,
        "nu": mat.nu,
        "color": mat.color,
        "astm": mat.astm,
    }


def _hardener_to_dict(h: Hardener) -> dict:
    if not h:
        return None
    return {
        "id": h.id,
        "matrix_id": h.matrix_id,
        "name": h.name,
        "ratio": h.ratio,
        "cureTemp": h.cureTemp,
        "postCure": h.postCure,
        "tgShift": h.tgShift,
        "costBump": h.costBump,
        "note": h.note,
    }


@router.post("/calculate", response_model=CompositeCalculationResponse)
def calculate_composite(req: CompositeCalculationRequest, db: Session = Depends(get_db)):
    # 1. Fetch matrix
    matrix_obj = db.query(Material).filter(Material.id == req.matrix_id).first()
    if not matrix_obj:
        raise HTTPException(status_code=404, detail=f"Matrix material '{req.matrix_id}' not found.")
    m_dict = _mat_to_dict(matrix_obj)

    # 2. Fetch hardener if specified
    hardener_dict = None
    if req.hardener_id:
        hardener_obj = db.query(Hardener).filter(Hardener.id == req.hardener_id).first()
        if hardener_obj:
            hardener_dict = _hardener_to_dict(hardener_obj)

    # 3. Fetch reinforcements
    reinf_list = []
    for r_input in req.reinforcements:
        r_mat_obj = db.query(Material).filter(Material.id == r_input.id).first()
        if not r_mat_obj:
            raise HTTPException(status_code=404, detail=f"Reinforcement material '{r_input.id}' not found.")
        reinf_list.append({
            "mat": _mat_to_dict(r_mat_obj),
            "vf": r_input.vf,
            "orientation": r_input.orientation,
            "angle": r_input.angle
        })

    # 4. Check feasibility
    feasibility = check_composite_feasibility(m_dict, hardener_dict, reinf_list)

    # 5. Run micromechanics calculations
    comp_props = calculate_composite_properties(m_dict, hardener_dict, reinf_list)

    # 6. Generate ASTM Standards Qualification Card
    astm_card = generate_astm_card(m_dict, reinf_list)

    return {
        **comp_props,
        "feasibility": feasibility,
        "astm_card": astm_card
    }

