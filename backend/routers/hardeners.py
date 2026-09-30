from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Hardener
from backend.schemas import HardenerOut

router = APIRouter(prefix="/api/v1/hardeners", tags=["Hardeners"])


@router.get("", response_model=List[HardenerOut])
def get_all_hardeners(db: Session = Depends(get_db)):
    return db.query(Hardener).all()


@router.get("/by-matrix/{matrix_id}", response_model=List[HardenerOut])
def get_hardeners_for_matrix(matrix_id: str, db: Session = Depends(get_db)):
    return db.query(Hardener).filter(Hardener.matrix_id == matrix_id).all()

