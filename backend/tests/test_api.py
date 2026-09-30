import pytest
from fastapi.testclient import TestClient
from backend.app import app
from backend.database import Base, engine, SessionLocal
from backend.seed_data import seed_database


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    seed_database(db)
    db.close()


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_get_materials(client):
    response = client.get("/api/v1/materials")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 80  # We seeded 110 materials
    assert any(m["id"] == "toray_t300" for m in data)
    assert any(m["id"] == "epoxy" for m in data)


def test_get_single_material(client):
    response = client.get("/api/v1/materials/inconel_718")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Special Metals Inconel 718"
    assert data["rho"] == 8.19
    assert data["maxT"] == 650.0


def test_filter_materials(client):
    response = client.get("/api/v1/materials?cat=synfiber")
    assert response.status_code == 200
    data = response.json()
    assert all(m["cat"] == "synfiber" for m in data)


def test_calculate_composite(client):
    payload = {
        "matrix_id": "epoxy",
        "hardener_id": "teta",
        "reinforcements": [
            {"id": "toray_t800s", "vf": 0.40, "orientation": "0", "angle": 0.0},
            {"id": "toray_t800s", "vf": 0.20, "orientation": "90", "angle": 90.0}
        ]
    }
    response = client.post("/api/v1/composite/calculate", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["rho"] > 1.2
    assert data["E_eff"] > 20.0
    assert data["ts"] > 100.0
    assert "astm_card" in data
    assert len(data["astm_card"]["standards"]) > 0


def test_save_and_retrieve_formulation(client):
    payload = {
        "title": "Aero Primary Wing Spar Laminate [0/90]",
        "matrix_id": "epoxy_cycom",
        "hardener_id": "dds_amine",
        "reinforcements": [
            {"id": "hexcel_im7", "vf": 0.50, "orientation": "0", "angle": 0.0},
            {"id": "hexcel_im7", "vf": 0.10, "orientation": "90", "angle": 90.0}
        ]
    }
    save_resp = client.post("/api/v1/formulations", json=payload)
    assert save_resp.status_code == 201
    saved_data = save_resp.json()
    formulation_id = saved_data["id"]

    # Retrieve
    get_resp = client.get(f"/api/v1/formulations/{formulation_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["title"] == payload["title"]

    # Export CSV
    csv_resp = client.get(f"/api/v1/formulations/{formulation_id}/export?format=csv")
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]
    assert "STRATA Composite Compendium" in csv_resp.text

