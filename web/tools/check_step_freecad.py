"""Abre un .stp con el MISMO lector que usa FreeCAD —OpenCASCADE— y dice qué
entró. Evidencia, no prueba: necesita FreeCAD instalado y por eso no está en
`npm test` ni en el banco de interfaz.

    node -e "..."                                   # produce el .stp
    freecadcmd tools/check_step_freecad.py pieza.stp

o, más fácil, el botón «Eje a STEP» del visor y luego la segunda línea.

POR QUÉ EXISTE. El 2026-09-20, el primer .stp que salió de `engine/step.ts` era
sintácticamente perfecto —toda referencia resuelta, ids sin hueco ni repetido,
unidades declaradas, 29 pruebas de motor en verde— y FreeCAD 1.1 contestaba
«No shapes found in file». La representación se llamaba
`GEOMETRICALLY_BOUNDED_WIREFRAME_REPRESENTATION` y la entidad de AP214 se llama
`GEOMETRICALLY_BOUNDED_WIREFRAME_SHAPE_REPRESENTATION`, con `SHAPE_` en medio.

Ese fallo es la razón de este archivo: un nombre de entidad que el lector no
conoce NO es un error de sintaxis. La entidad se ignora sin una queja, con ella
se va lo que colgaba de `SHAPE_DEFINITION_REPRESENTATION`, y lo que se pierde es
el archivo entero. Ninguna comprobación de texto lo ve — hace falta un lector de
STEP de verdad, y el que importa es el que va a usar el taller.

Qué dice que está bien:
  · que entre ALGO (si no, es el fallo de arriba otra vez);
  · que los arcos entren como `Circle` y no como polilínea, que es el motivo de
    escribir STEP en vez de mandar la malla del 3D.
"""
import sys

import FreeCAD
import Part


def main(ruta):
    doc = FreeCAD.newDocument("chk")
    try:
        Part.insert(ruta, doc.Name)
    except Exception as err:                      # noqa: BLE001 - queremos el texto
        print("FALLA  el lector no sacó nada:", err)
        return 1

    aristas = vertices = circulos = rectas = 0
    for obj in doc.Objects:
        sh = getattr(obj, "Shape", None)
        if sh is None:
            continue
        aristas += len(sh.Edges)
        vertices += len(sh.Vertexes)
        for e in sh.Edges:
            nombre = type(e.Curve).__name__
            if nombre == "Circle":
                circulos += 1
            elif nombre == "Line":
                rectas += 1
        print("  objeto %r  %s  aristas %d  vertices %d"
              % (obj.Label, sh.ShapeType, len(sh.Edges), len(sh.Vertexes)))

    print("TOTAL  aristas %d  vertices %d  (rectas %d, arcos %d)"
          % (aristas, vertices, rectas, circulos))

    fallos = 0
    if not aristas and not vertices:
        print("FALLA  no entró nada: mira el nombre de la entidad de representación")
        fallos += 1
    if not circulos:
        print("FALLA  ni un solo arco entró como Circle: el archivo está mandando")
        print("       una polilínea, o sea el error de cuerda que existe para evitar")
        fallos += 1
    print("sin problemas" if not fallos else "%d PROBLEMA(S)" % fallos)
    return 1 if fallos else 0


# Dos cosas que este lanzador hace distinto y que cuestan media hora cada una:
#   · freecadcmd carga el guion con su propio cargador, así que `__name__` NO es
#     "__main__" y un `if __name__ == "__main__"` deja el archivo mudo;
#   · `sys.exit()` termina el proceso sin vaciar el buffer de stdout cuando la
#     salida va a una tubería, y entonces se pierde TODO lo impreso. De ahí el
#     flush explícito.
if len(sys.argv) < 2:
    print(__doc__)
    sys.stdout.flush()
    sys.exit(2)

_codigo = main(sys.argv[-1])
sys.stdout.flush()
sys.exit(_codigo)
