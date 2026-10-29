"""Lectura de un test A/B de conversión: limpieza, chequeos de integridad y decisión."""
from __future__ import annotations

import math
from dataclasses import dataclass, asdict

import pandas as pd
from scipy import stats


@dataclass
class Resultado:
    n_control: int
    n_tratamiento: int
    conv_control: int
    conv_tratamiento: int
    tasa_control: float
    tasa_tratamiento: float
    diferencia: float          # puntos de tasa (tratamiento - control)
    lift_relativo: float       # diferencia / tasa_control
    ic95_bajo: float
    ic95_alto: float
    z: float
    p_valor: float             # bilateral

    def dict(self) -> dict:
        return asdict(self)


def limpiar(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Saca filas donde el grupo no coincide con la página y usuarios repetidos.

    Devuelve el dataframe limpio y un resumen de lo descartado.
    """
    esperado = {"control": "old_page", "treatment": "new_page"}
    ok = df["landing_page"] == df["group"].map(esperado)
    mal_asignados = int((~ok).sum())
    limpio = df[ok]
    duplicados = int(limpio["user_id"].duplicated().sum())
    limpio = limpio.sort_values("timestamp").drop_duplicates("user_id", keep="first")
    return limpio.reset_index(drop=True), {
        "filas_originales": int(len(df)),
        "mal_asignados": mal_asignados,
        "duplicados": duplicados,
        "filas_finales": int(len(limpio)),
    }


def test_proporciones(n_c: int, x_c: int, n_t: int, x_t: int, alpha: float = 0.05) -> Resultado:
    """Test z de dos proporciones (bilateral) con IC de Wald para la diferencia."""
    p_c, p_t = x_c / n_c, x_t / n_t
    p_pool = (x_c + x_t) / (n_c + n_t)
    se_pool = math.sqrt(p_pool * (1 - p_pool) * (1 / n_c + 1 / n_t))
    z = (p_t - p_c) / se_pool
    p = 2 * stats.norm.sf(abs(z))
    se = math.sqrt(p_c * (1 - p_c) / n_c + p_t * (1 - p_t) / n_t)
    zc = stats.norm.ppf(1 - alpha / 2)
    diff = p_t - p_c
    return Resultado(n_c, n_t, x_c, x_t, p_c, p_t, diff, diff / p_c, diff - zc * se, diff + zc * se, float(z), float(p))


def srm(n_c: int, n_t: int, esperado: float = 0.5) -> float:
    """p-valor del chequeo de Sample Ratio Mismatch (chi-cuadrado contra el reparto esperado)."""
    total = n_c + n_t
    return float(stats.chisquare([n_c, n_t], [total * esperado, total * (1 - esperado)]).pvalue)


def efecto_minimo_detectable(n_por_grupo: int, p_base: float, alpha: float = 0.05, potencia: float = 0.8) -> float:
    """MDE absoluto aproximado para un test bilateral con grupos iguales."""
    z = stats.norm.ppf(1 - alpha / 2) + stats.norm.ppf(potencia)
    return z * math.sqrt(2 * p_base * (1 - p_base) / n_por_grupo)


def tamano_muestra(p_base: float, mde_abs: float, alpha: float = 0.05, potencia: float = 0.8) -> int:
    """Usuarios por grupo necesarios para detectar mde_abs."""
    z = stats.norm.ppf(1 - alpha / 2) + stats.norm.ppf(potencia)
    p2 = p_base + mde_abs
    var = p_base * (1 - p_base) + p2 * (1 - p2)
    return math.ceil(z**2 * var / mde_abs**2)


def resumir(df: pd.DataFrame) -> Resultado:
    g = df.groupby("group")["converted"].agg(["count", "sum"])
    return test_proporciones(int(g.loc["control", "count"]), int(g.loc["control", "sum"]),
                             int(g.loc["treatment", "count"]), int(g.loc["treatment", "sum"]))


def por_segmento(df: pd.DataFrame, col: str) -> list[dict]:
    """Resultado por segmento, con corrección de Bonferroni por comparaciones múltiples."""
    segmentos = sorted(df[col].dropna().unique())
    out = []
    for s in segmentos:
        r = resumir(df[df[col] == s])
        d = r.dict()
        d["segmento"] = str(s)
        d["p_bonferroni"] = min(1.0, r.p_valor * len(segmentos))
        out.append(d)
    return out


def diario(df: pd.DataFrame) -> list[dict]:
    """Tasa diaria y acumulada por grupo, para ver efecto novedad y estabilidad."""
    t = df.assign(dia=pd.to_datetime(df["timestamp"]).dt.date.astype(str))
    g = t.groupby(["dia", "group"])["converted"].agg(["count", "sum"]).unstack("group").fillna(0)
    filas = []
    acum = {"control": [0, 0], "treatment": [0, 0]}
    for dia, row in g.iterrows():
        f = {"dia": dia}
        for grp in ("control", "treatment"):
            n, x = int(row[("count", grp)]), int(row[("sum", grp)])
            acum[grp][0] += n
            acum[grp][1] += x
            f[f"tasa_{grp}"] = x / n if n else None
            f[f"acum_{grp}"] = acum[grp][1] / acum[grp][0] if acum[grp][0] else None
            f[f"n_{grp}"] = n
        filas.append(f)
    return filas


def decidir(r: Resultado, mde_negocio: float, alpha: float = 0.05) -> dict:
    """Traduce el resultado estadístico a una recomendación de negocio."""
    significativo = r.p_valor < alpha
    if significativo and r.ic95_bajo > 0:
        if r.ic95_bajo >= mde_negocio:
            veredicto, texto = "lanzar", "La página nueva convierte mejor y el efecto supera el mínimo que le importa al negocio."
        else:
            veredicto, texto = "lanzar con cautela", "Hay mejora, pero puede ser menor que el mínimo que justifica el cambio."
    elif significativo and r.ic95_alto < 0:
        veredicto, texto = "no lanzar", "La página nueva convierte peor que la actual."
    elif r.ic95_alto < mde_negocio:
        veredicto, texto = "no lanzar", ("No hay diferencia detectable, y el intervalo descarta una mejora del tamaño "
                                         "que buscaba el negocio. Mantener la página actual.")
    else:
        veredicto, texto = "seguir midiendo", "El resultado no es concluyente: el intervalo todavía incluye mejoras relevantes."
    return {"veredicto": veredicto, "texto": texto, "significativo": bool(significativo)}
