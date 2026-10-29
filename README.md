# Lectura de un test A/B: ¿lanzamos la página nueva?

**Reporte en vivo:** https://nbbz95.github.io/analisis-test-ab/

Un e-commerce probó una landing nueva contra la actual durante 23 días con 290 mil usuarios. La pregunta de negocio: **¿la página nueva convierte al menos 0,5 puntos más?** Si no, no vale el costo de cambiarla.

## Resultado

| | Página actual | Página nueva |
|---|---|---|
| Usuarios | 145.274 | 145.310 |
| Conversión | 12,04% | 11,88% |

- Diferencia: **−0,16 pp** (IC 95%: −0,39 a +0,08 pp), p = 0,19.
- **Recomendación: no lanzar.** No hay diferencia detectable, y el intervalo completo queda por debajo de la mejora mínima que pedía el negocio. Más tiempo de test no cambiaría la decisión.
- Por país (US, UK, CA) tampoco aparece un segmento donde la página nueva gane, después de corregir por comparaciones múltiples.

## Qué muestra este proyecto

- **Chequeos de integridad antes de leer el resultado:** filas con grupo y página que no coinciden (3.893), usuarios repetidos y Sample Ratio Mismatch.
- **Estadística aplicada al negocio:** test z de dos proporciones, intervalo de confianza, efecto mínimo detectable y tamaño de muestra.
- **Decisión explícita:** una regla que traduce el intervalo a "lanzar / no lanzar / seguir midiendo", con el umbral de negocio como dato de entrada.
- **Estabilidad en el tiempo:** conversión acumulada por día para descartar efecto novedad.

## Cómo correrlo

```bash
pip install -r requirements.txt
python -m pytest -q        # tests de la estadística y de la limpieza
python src/build.py        # recalcula site/data.json
python -m http.server -d site
```

## Estructura

```
data/            ab_data.csv.gz y countries.csv.gz (dataset público)
src/ab_test.py   limpieza, test de proporciones, SRM, potencia y regla de decisión
src/build.py     arma site/data.json
site/            reporte estático (HTML + SVG, sin dependencias)
tests/           pytest
```

GitHub Actions corre los tests, recalcula el reporte y lo publica en la rama `gh-pages`.

**Datos:** experimento público de e-commerce (`ab_data.csv`) del curso de Data Analyst de Udacity.
