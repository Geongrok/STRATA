from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from backend.database import get_db
from backend.models import Material
from backend.schemas import MaterialOut, MaterialCreate

router = APIRouter(prefix="/api/v1/materials", tags=["Materials"])


@router.get("", response_model=List[MaterialOut])
def get_materials(
    cat: Optional[str] = Query(None, description="Category filter (e.g. synfiber, metal, synpoly)"),
    matrix: Optional[bool] = Query(None, description="Filter materials that can act as matrix"),
    reinf: Optional[bool] = Query(None, description="Filter materials that can act as reinforcement"),
    q: Optional[str] = Query(None, description="Search by name, note, or source"),
    db: Session = Depends(get_db)
):
    query = db.query(Material)

    if cat and cat.lower() != "all":
        query = query.filter(Material.cat == cat.lower())

    if matrix is not None:
        query = query.filter(Material.matrix == matrix)

    if reinf is not None:
        query = query.filter(Material.reinf == reinf)

    if q:
        search_term = f"%{q.strip().lower()}%"
        query = query.filter(
            or_(
                Material.name.ilike(search_term),
                Material.id.ilike(search_term),
                Material.note.ilike(search_term),
                Material.source.ilike(search_term)
            )
        )

    return query.all()


@router.get("/{material_id}", response_model=MaterialOut)
def get_material(material_id: str, db: Session = Depends(get_db)):
    mat = db.query(Material).filter(Material.id == material_id).first()
    if not mat:
        raise HTTPException(status_code=404, detail=f"Material with id '{material_id}' not found.")
    return mat


@router.post("", response_model=MaterialOut, status_code=201)
def create_custom_material(mat_in: MaterialCreate, db: Session = Depends(get_db)):
    existing = db.query(Material).filter(Material.id == mat_in.id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Material with id '{mat_in.id}' already exists.")

    new_mat = Material(**mat_in.dict(), is_custom=True)
    db.add(new_mat)
    db.commit()
    db.refresh(new_mat)
    return new_mat

