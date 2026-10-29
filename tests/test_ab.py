import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
import ab_test as ab  # noqa: E402


def test_z_coincide_con_calculo_a_mano():
    # 1000 vs 1000 usuarios, 100 vs 130 conversiones
    r = ab.test_proporciones(1000, 100, 1000, 130)
    assert r.diferencia == pytest.approx(0.03)
    assert r.z == pytest.approx(2.1027, abs=1e-3)
    assert r.p_valor == pytest.approx(0.0355, abs=1e-3)
    assert r.ic95_bajo < r.diferencia < r.ic95_alto


def test_sin_efecto_no_es_significativo():
    r = ab.test_proporciones(5000, 600, 5000, 600)
    assert r.z == 0
    assert r.p_valor == pytest.approx(1.0)


def test_srm_detecta_reparto_desbalanceado():
    assert ab.srm(10_000, 10_050) > 0.05
    assert ab.srm(10_000, 11_000) < 0.001


def test_tamano_muestra_y_mde_son_consistentes():
    n = ab.tamano_muestra(0.12, 0.01)
    assert 15_000 < n < 20_000
    assert ab.efecto_minimo_detectable(n, 0.12) == pytest.approx(0.01, rel=0.05)


def test_limpiar_descarta_mal_asignados_y_duplicados():
    df = pd.DataFrame({
        "user_id": [1, 2, 3, 3, 4],
        "timestamp": ["2017-01-01", "2017-01-01", "2017-01-02", "2017-01-03", "2017-01-03"],
        "group": ["control", "treatment", "treatment", "treatment", "control"],
        "landing_page": ["old_page", "new_page", "new_page", "new_page", "new_page"],
        "converted": [0, 1, 0, 1, 0],
    })
    limpio, info = ab.limpiar(df)
    assert info["mal_asignados"] == 1
    assert info["duplicados"] == 1
    assert sorted(limpio["user_id"]) == [1, 2, 3]
    assert limpio.loc[limpio.user_id == 3, "converted"].item() == 0  # se queda la primera visita


@pytest.mark.parametrize("args, esperado", [
    ((1000, 100, 1000, 200), "lanzar"),
    ((100000, 12000, 100000, 11000), "no lanzar"),
    ((100000, 12000, 100000, 11990), "no lanzar"),
    ((500, 60, 500, 66), "seguir midiendo"),
])
def test_decision(args, esperado):
    assert ab.decidir(ab.test_proporciones(*args), mde_negocio=0.005)["veredicto"] == esperado
