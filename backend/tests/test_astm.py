from backend.engine.astm_standards import generate_astm_card


def test_astm_card_polymer_composite():
    matrix = {"id": "epoxy", "name": "Epoxy", "cat": "synpoly", "elec": "I", "astm": "ASTM D638"}
    reinf = {"id": "cf", "name": "Carbon Fibre", "cat": "synfiber", "elec": "C", "astm": "ASTM D4018"}
    reinf_list = [{"mat": reinf, "vf": 0.55, "orientation": "0"}]

    card = generate_astm_card(matrix, reinf_list)
    codes = [s["standard_code"] for s in card["standards"]]

    assert any("D3039" in c for c in codes)
    assert any("D6641" in c for c in codes)  # CLC compression
    assert any("D3518" in c for c in codes)  # Shear
    assert any("D2344" in c for c in codes)  # Short beam shear
    assert any("E1640" in c for c in codes)  # DMA Tg


def test_astm_card_ceramic_matrix():
    matrix = {"id": "sic_mat", "name": "SiC Matrix", "cat": "ceramic", "elec": "S", "astm": "ASTM C1161"}
    reinf = {"id": "sic_f", "name": "SiC Fibre", "cat": "synfiber", "elec": "S", "astm": "ASTM C1275"}
    reinf_list = [{"mat": reinf, "vf": 0.40, "orientation": "woven"}]

    card = generate_astm_card(matrix, reinf_list)
    codes = [s["standard_code"] for s in card["standards"]]

    assert any("C1359" in c or "C1275" in c for c in codes)
    assert any("C1424" in c for c in codes)

