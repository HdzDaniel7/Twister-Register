# Piezas reales

**Esta carpeta no se versiona.** Lo único que sube al repo es este archivo.

## Por qué

El repositorio es público: sirve `index.html` por GitHub Pages. Un `.json` de
BARCOMP lleva la geometría completa de la pieza —avances, ángulos, radios, y las
nubes de puntos medidas— y eso es información del cliente. Publicarla por
descuido no se deshace: queda en el historial de git y en cualquier clon que ya
se hiciera.

Por eso `.gitignore` aparta todo lo que caiga aquí dentro salvo este `README.md`.
Si algún día hace falta publicar una pieza de ejemplo, se hace **a propósito**,
con `git add -f` y sabiendo lo que se sube.

## Dónde viven de verdad

En la carpeta de trabajo del taller o en la unidad de red, no en el repo. Esta
carpeta existe para que quien abra el proyecto tenga un sitio obvio donde dejar
los archivos mientras trabaja, sin que se le cuelen en un commit.

## Cómo nombrarlos

```
2026-09-15_barra-A_lote3.json      el documento del visor: nominal + medidas
2026-09-15_barra-A_lote3_p1.csv    los puntos crudos de cada pieza
2026-09-15_barra-A_lote3_p2.csv
```

Fecha delante para que ordenen solos, y el mismo prefijo para el `.json` y sus
CSV. El `.json` ya guarda dentro las piezas medidas que se importaron, así que
los CSV se conservan solo como copia de lo que salió del escáner.

## El único ejemplo que sí se versiona

`web/test/fixtures/demo-2.3.json`, y **no es un ejemplo**: es un candado de
formato. Antes de tocarlo, `web/test/fixtures/README.md`.
