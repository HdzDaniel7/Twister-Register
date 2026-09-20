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

Qué dice que está bien. Las dos primeras son que el archivo LLEGA; las tres
últimas son que además SIRVE, que no es lo mismo y también se descubrió abriendo
el archivo y no leyéndolo:
  · que entre ALGO (si no, es el fallo de arriba otra vez);
  · que los arcos entren como `Circle` y no como polilínea, que es el motivo de
    escribir STEP en vez de mandar la malla del 3D;
  · que NO venga todo en un solo objeto: con una sola raíz STEP el eje, el
    perfil y los PI llegan mezclados en un compuesto, y entonces el diálogo de
    barrido de FreeCAD no tiene ningún «perfil» que ofrecer;
  · que el eje sea UN hilo. Suelto en tramos, la trayectoria del barrido hay que
    clicarla arista por arista — 31 veces en la demo;
  · que el perfil sea un hilo CERRADO. Abierto no se puede barrer para sacar un
    sólido, y se abre con una facilidad ridícula: una costura que no cierre por
    7e-07 mm basta.
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
    objetos = 0
    cerrados = 0
    # Todo objeto QUE TENGA aristas tiene que ser exactamente un hilo con todas
    # ellas. Vale igual para el eje (abierto) y para el perfil (cerrado), y no
    # hay que adivinar cuál es cuál.
    sueltos = []
    for obj in doc.Objects:
        sh = getattr(obj, "Shape", None)
        if sh is None:
            continue
        objetos += 1
        aristas += len(sh.Edges)
        vertices += len(sh.Vertexes)
        for e in sh.Edges:
            nombre = type(e.Curve).__name__
            if nombre == "Circle":
                circulos += 1
            elif nombre == "Line":
                rectas += 1
        print("  objeto %r  aristas %d  vertices %d  hilos %d"
              % (obj.Label, len(sh.Edges), len(sh.Vertexes), len(sh.Wires)))
        for w in sh.Wires:
            print("      hilo de %d aristas, %s, %.3f mm"
                  % (len(w.Edges), "CERRADO" if w.isClosed() else "abierto", w.Length))
            if w.isClosed():
                cerrados += 1
        if sh.Edges and (len(sh.Wires) != 1 or len(sh.Wires[0].Edges) != len(sh.Edges)):
            sueltos.append(obj.Label)

    print("TOTAL  objetos %d  aristas %d  vertices %d  (rectas %d, arcos %d)"
          % (objetos, aristas, vertices, rectas, circulos))

    fallos = 0
    if not aristas and not vertices:
        print("FALLA  no entró nada: mira el nombre de la entidad de representación")
        fallos += 1
    if not circulos:
        print("FALLA  ni un solo arco entró como Circle: el archivo está mandando")
        print("       una polilínea, o sea el error de cuerda que existe para evitar")
        fallos += 1
    if objetos < 2:
        print("FALLA  todo vino en UN objeto: eje, perfil y PI mezclados. Así no hay")
        print("       perfil que darle al barrido — mira si hay una raíz por grupo")
        fallos += 1
    if sueltos:
        print("FALLA  con aristas sueltas y no en un hilo: %s" % ", ".join(sueltos))
        print("       la trayectoria habría que clicarla arista por arista — mira el")
        print("       COMPOSITE_CURVE y si los tramos comparten el punto de unión")
        fallos += 1
    if not cerrados:
        print("FALLA  ningún hilo cerrado: sin perfil cerrado no se puede barrer un")
        print("       sólido. Suele ser una costura que no cierra por menos de un micrón")
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
