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

Qué comprueba:
  · que entre ALGO (si no, es el fallo de arriba otra vez);
  · que haya un SÓLIDO, que es lo único que importa cualquier CAD. Si el archivo
    dice en su encabezado por qué no lo lleva, no se exige;
  · que el sólido sea válido y CERRADO;
  · que su volumen sea el de Pappus. El archivo trae escrito, en su comentario,
    el volumen que le toca —`área × longitud desarrollada`, las dos cuentas del
    motor—, así que este banco lo lee de ahí y lo contrasta con lo que mide el
    núcleo geométrico. Es la comprobación que de verdad dice si la topología
    está bien: una cara del revés, un parche complementario o un casco abierto
    mueven el volumen y no mueven nada más;
  · que los arcos entren como geometría exacta y no como polilínea.

Lo que cazó cuando se escribió: cuatro caras interiores de los codos de un tubo
redondo cubrían el 95 % del toro entero, porque se invirtió la normal sin
invertir el sentido del lazo. El sólido salía válido, cerrado y con buena pinta,
y daba 802868 mm³ donde tocaban 120681.
"""
import io
import re
import sys

import FreeCAD
import Part


def leer_encabezado(ruta):
    """El volumen que el archivo dice que le toca, y el motivo de no llevar
    sólido si es que no lo lleva. Los dos van escritos dentro del .stp."""
    txt = io.open(ruta, encoding="utf-8", errors="replace").read(200000)
    vol = re.search(r"volumen esperado \(Pappus\) = ([0-9.]+) mm3", txt)
    sin = re.search(r"SIN SOLIDO \(([^)]*)\)", txt)
    return (float(vol.group(1)) if vol else None), (sin.group(1) if sin else None)


def main(ruta):
    esperado, sin_solido = leer_encabezado(ruta)
    doc = FreeCAD.newDocument("chk")
    try:
        Part.insert(ruta, doc.Name)
    except Exception as err:                      # noqa: BLE001 - queremos el texto
        print("FALLA  el lector no sacó nada:", err)
        return 1

    aristas = vertices = circulos = rectas = 0
    objetos = 0
    cerrados = 0
    solidos = []
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
        if sh.Solids:
            solidos.append(sh)
            print("  objeto %r  SOLIDO  caras %d  valido %s  cerrado %s  vol %.6f mm3"
                  % (obj.Label, len(sh.Faces), sh.isValid(), sh.isClosed(), sh.Volume))
            tipos = {}
            for f in sh.Faces:
                n = type(f.Surface).__name__
                tipos[n] = tipos.get(n, 0) + 1
            print("      caras por tipo: %s"
                  % ", ".join("%s x%d" % kv for kv in sorted(tipos.items())))
            continue
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
        print("FALLA  todo vino en UN objeto: mira si hay una raíz por grupo")
        fallos += 1
    if sueltos:
        print("FALLA  con aristas sueltas y no en un hilo: %s" % ", ".join(sueltos))
        print("       mira el COMPOSITE_CURVE y si los tramos comparten el punto")
        print("       de unión")
        fallos += 1

    # --- el sólido, que es lo que se lleva el CAD ---
    if not solidos:
        if sin_solido:
            print("sin sólido, y el archivo dice por qué: %s" % sin_solido)
        else:
            print("FALLA  ni un sólido, y el archivo no dice por qué no lo lleva.")
            print("       Un STEP de alambre no lo importa SolidWorks")
            fallos += 1
    else:
        for sh in solidos:
            if not sh.isValid():
                print("FALLA  el sólido no es válido")
                fallos += 1
            if not sh.isClosed():
                print("FALLA  el sólido no cierra: no encierra volumen")
                fallos += 1
            if esperado is None:
                print("FALLA  el archivo no trae el volumen de Pappus; sin él, esto")
                print("       no puede decir si la topología está bien")
                fallos += 1
            else:
                err = abs(sh.Volume - esperado) / esperado if esperado else 1
                print("  volumen %.6f  esperado %.6f  error relativo %.2e"
                      % (sh.Volume, esperado, err))
                if err > 1e-7:
                    print("FALLA  el volumen no es el de Pappus. Una cara del revés, un")
                    print("       parche complementario o un casco abierto lo mueven")
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
