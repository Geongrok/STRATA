import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, Boolean, Text, DateTime, ForeignKey
from backend.database import Base


class Material(Base):
    __tablename__ = "materials"

    id = Column(String(64), primary_key=True, index=True)
    name = Column(String(128), nullable=False, index=True)
    cat = Column(String(32), nullable=False, index=True)  # element, metal, ceramic, natfiber, synfiber, natpoly, synpoly, filler, bio, core
    matrix = Column(Boolean, default=False)
    reinf = Column(Boolean, default=False)
    rho = Column(Float, nullable=False)          # Density g/cm³
    E = Column(Float, nullable=False)            # Tensile Modulus GPa
    ts = Column(Float, nullable=False)           # Tensile Strength MPa
    elong = Column(Float, nullable=False)        # Elongation at break %
    k = Column(Float, nullable=False)            # Thermal conductivity W/mK
    cte = Column(Float, nullable=False)          # CTE 1e-6/K
    maxT = Column(Float, nullable=False)         # Max service temp °C
    procT = Column(Float, nullable=True)         # Processing / melt / cure temp °C
    elec = Column(String(4), nullable=False)     # C (conductor), S (semiconductor), I (insulator)
    costLo = Column(Float, nullable=False)       # USD/kg lower bound
    costHi = Column(Float, nullable=False)       # USD/kg upper bound
    source = Column(Text, nullable=True)
    moist = Column(String(4), default="L")       # L, M, H
    uv = Column(String(4), default="L")          # L, M, H
    chem = Column(String(4), default="G")        # P, F, G, E
    tough = Column(String(4), default="M")       # L, M, H
    ductile = Column(Boolean, default=False)
    note = Column(Text, nullable=True)
    nu = Column(Float, default=0.3)              # Poisson's ratio
    color = Column(String(16), default="#c9cdd0")
    astm = Column(String(256), nullable=True)    # Specific ASTM constituent test standard
    is_custom = Column(Boolean, default=False)


class Hardener(Base):
    __tablename__ = "hardeners"

    id = Column(String(64), primary_key=True, index=True)
    matrix_id = Column(String(64), index=True, nullable=False)
    name = Column(String(128), nullable=False)
    ratio = Column(String(64), nullable=False)
    cureTemp = Column(Float, default=25.0)
    postCure = Column(Float, default=80.0)
    tgShift = Column(Float, default=0.0)
    costBump = Column(Float, default=0.0)
    note = Column(Text, nullable=True)


class SavedFormulation(Base):
    __tablename__ = "saved_formulations"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(128), nullable=False)
    matrix_id = Column(String(64), nullable=False)
    hardener_id = Column(String(64), nullable=True)
    reinforcements_json = Column(Text, nullable=False)
    computed_properties_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

