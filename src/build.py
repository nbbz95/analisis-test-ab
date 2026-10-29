"""Corre el análisis completo y escribe site/data.json para el reporte web."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

import ab_test as ab

RAIZ = Path(__file__).resolve().parent.parent
MDE_NEGOCIO = 0.005  # el negocio pide al menos +0,5 puntos de conversión para cambiar la página


def main() -> dict:
    df = pd.read_csv(RAIZ / "data" / "ab_data.csv.gz")
    paises = pd.read_csv(RAIZ / "data" / "countries.csv.gz")
    limpio, limpieza = ab.limpiar(df)
    limpio = limpio.merge(paises, on="user_id", how="left")

    r = ab.resumir(limpio)
    n_grupo = min(r.n_control, r.n_tratamiento)
    salida = {
        "limpieza": limpieza,
        "periodo": {"desde": str(limpio["timestamp"].min())[:10], "hasta": str(limpio["timestamp"].max())[:10]},
        "resultado": r.dict(),
        "srm_p": ab.srm(r.n_control, r.n_tratamiento),
        "mde_negocio": MDE_NEGOCIO,
        "mde_detectable": ab.efecto_minimo_detectable(n_grupo, r.tasa_control),
        "muestra_necesaria": ab.tamano_muestra(r.tasa_control, MDE_NEGOCIO),
        "decision": ab.decidir(r, MDE_NEGOCIO),
        "paises": ab.por_segmento(limpio, "country"),
        "diario": ab.diario(limpio),
    }
    out = RAIZ / "site" / "data.json"
    out.write_text(json.dumps(salida, ensure_ascii=False, indent=1))
    return salida


if __name__ == "__main__":
    s = main()
    r = s["resultado"]
    print(f"control {r['tasa_control']:.4%} | tratamiento {r['tasa_tratamiento']:.4%} | "
          f"dif {r['diferencia']:+.4%} IC95 [{r['ic95_bajo']:+.4%}, {r['ic95_alto']:+.4%}] p={r['p_valor']:.3f}")
    print("SRM p =", round(s["srm_p"], 3), "| MDE detectable", f"{s['mde_detectable']:.4%}", "|", s["decision"])
