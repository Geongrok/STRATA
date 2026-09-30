from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator


class MaterialBase(BaseModel):
    id: str
    name: str
    cat: str
    matrix: bool = False
    reinf: bool = False
    rho: float
    E: float
    ts: float
    elong: float
    k: float
    cte: float
    maxT: float
    procT: Optional[float] = None
    elec: str
    costLo: float
    costHi: float
    source: Optional[str] = None
    moist: str = "L"
    uv: str = "L"
    chem: str = "G"
    tough: str = "M"
    ductile: bool = False
    note: Optional[str] = None
    nu: float = 0.3
    color: str = "#c9cdd0"
    astm: Optional[str] = None


class MaterialCreate(MaterialBase):
    pass


class MaterialOut(MaterialBase):
    is_custom: bool = False

    model_config = {"from_attributes": True}


class HardenerOut(BaseModel):
    id: str
    matrix_id: str
    name: str
    ratio: str
    cureTemp: float
    postCure: float
    tgShift: float
    costBump: float
    note: Optional[str] = None

    model_config = {"from_attributes": True}


class ReinforcementLayerInput(BaseModel):
    id: str
    vf: float = Field(..., gt=0.0, le=0.74, description="Volume fraction (0 < vf <= 0.74)")
    orientation: str = Field(
        default="uni",
        description="Architecture or orientation: '0', '90', '45', '-45', '30', '-30', '60', '-60', 'uni', 'woven', 'quasi', 'random', 'particulate'"
    )
    angle: Optional[float] = Field(default=None, description="Explicit fiber orientation angle in degrees (e.g., 0, 45, 90)")

    @field_validator("orientation")
    def validate_orientation(cls, v):
        valid = {
            "0", "90", "45", "-45", "30", "-30", "60", "-60",
            "uni", "woven", "quasi", "random", "particulate"
        }
        if v.lower() not in valid:
            raise ValueError(f"Invalid orientation '{v}'. Must be one of {valid}")
        return v.lower()


class CompositeCalculationRequest(BaseModel):
    matrix_id: str
    hardener_id: Optional[str] = None
    reinforcements: List[ReinforcementLayerInput] = Field(default_factory=list)

    @field_validator("reinforcements")
    def validate_total_vf(cls, v):
        total_vf = sum(layer.vf for layer in v)
        if total_vf >= 0.95:
            raise ValueError(f"Total reinforcement volume fraction ({total_vf:.2f}) must be less than 0.95")
        return v


class ASTMStandardItem(BaseModel):
    property_name: str
    standard_code: str
    description: str


class ASTMQualificationCard(BaseModel):
    standards: List[ASTMStandardItem]
    constituent_standards: List[Dict[str, str]]
    warnings: List[str]


class CompositeCalculationResponse(BaseModel):
    rho: float
    E1: float
    E2: float
    E_eff: float
    ts: float
    tsCompr: float
    comprModel: str
    G12: float
    nu12: float
    E_specific: float
    ts_specific: float
    strengthModel: str
    failureMode: str
    k1: float
    k2: float
    k_iso: float
    k_eff: float
    cte1: float
    cte2: float
    cte_eff: float
    maxTemp: float
    matMaxT: float
    matProcT: Optional[float] = None
    electrical: str
    costLo: float
    costHi: float
    costLoINR: str
    costHiINR: str
    massM: float
    massRows: List[Dict[str, Any]]
    VfTotal: float
    Vm: float
    feasibility: Dict[str, Any]
    astm_card: ASTMQualificationCard


class FormulationCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=128)
    matrix_id: str
    hardener_id: Optional[str] = None
    reinforcements: List[ReinforcementLayerInput]


class FormulationOut(BaseModel):
    id: str
    title: str
    matrix_id: str
    hardener_id: Optional[str] = None
    reinforcements_json: str
    computed_properties_json: str
    created_at: str

    model_config = {"from_attributes": True}


class ChatMessagePart(BaseModel):
    text: str


class ChatMessage(BaseModel):
    role: str
    parts: Optional[List[ChatMessagePart]] = None
    content: Optional[str] = None


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(default_factory=list)
    forgeContext: Optional[str] = ""

