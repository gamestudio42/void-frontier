#!/usr/bin/env python3
"""Bake a studio ship (Blockbench .bbmodel from gamestudio42/assets/naves) into the game.

    python3 scripts/bake_hull.py <path/to/ship.bbmodel> <game ship id>

Writes packages/view3d/assets/<id>/: hull.json (geometry and nozzles) plus the atlas, ORM
and glow PNGs copied from next to the .bbmodel. See docs/assets.md and decision 064.

hull.json, in the game's model space:
- Blockbench's nose (-Z) turned to +X: (x, y, z) -> (-z, y, x), then centred on the
  bounding box. `length` is the X extent, which the game scales to hull.length.
- `atlas` and `glow`: flat-shaded triangles (positions, normals, uvs) of the faces on
  texture 0 and texture 1. Quads split as (0, 1, 2) and (0, 2, 3); UVs normalised with V
  flipped for three.js.
- `nozzles`: each `exhaust_*` locator is a main engine pointing aft; each RCS block
  (`rcs_<f|t><e|d>`, front or tail, left or right) gives a lateral jet, and the front
  blocks a forward one for reverse thrust.
"""
import json
import math
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def turn(p):
    return [-p[2], p[1], p[0]]


def sub(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def unit(a):
    n = math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2) or 1.0
    return [a[0] / n, a[1] / n, a[2] / n]


def r4(v):
    return round(v, 4)


def bake(path, ship):
    model = json.load(open(path, encoding="utf-8"))
    w = model["textures"][0]["uv_width"]
    h = model["textures"][0]["uv_height"]
    gw = model["textures"][1]["uv_width"]
    gh = model["textures"][1]["uv_height"]
    meshes = [e for e in model["elements"] if e["type"] == "mesh"]
    locators = {e["name"]: e["position"] for e in model["elements"] if e["type"] == "locator"}

    def world(e, key):
        o = e["origin"]
        v = e["vertices"][key]
        return turn([v[0] + o[0], v[1] + o[1], v[2] + o[2]])

    points = [world(e, k) for e in meshes for k in e["vertices"]]
    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    centre = [(lo[i] + hi[i]) / 2 for i in range(3)]
    length = hi[0] - lo[0]
    place = lambda p: [r4(p[i] - centre[i]) for i in range(3)]

    surfaces = {0: {"positions": [], "normals": [], "uvs": []}, 1: {"positions": [], "normals": [], "uvs": []}}
    for e in meshes:
        for face in e["faces"].values():
            keys = face["vertices"]
            tex = face.get("texture", 0)
            if tex not in surfaces:
                continue
            tw, th = (w, h) if tex == 0 else (gw, gh)
            pts = [place(world(e, k)) for k in keys]
            uvs = [[r4(face["uv"][k][0] / tw), r4(1 - face["uv"][k][1] / th)] for k in keys]
            tris = [(0, 1, 2)] if len(keys) == 3 else [(0, 1, 2), (0, 2, 3)]
            for a, b, c in tris:
                n = unit(cross(sub(pts[b], pts[a]), sub(pts[c], pts[a])))
                s = surfaces[tex]
                for i in (a, b, c):
                    s["positions"] += pts[i]
                    s["normals"] += [r4(v) for v in n]
                    s["uvs"] += uvs[i]

    def extent(name, axes):
        e = next((m for m in meshes if m["name"] == name), None)
        if not e:
            return None
        pts = [world(e, k) for k in e["vertices"]]
        return [max(p[i] for p in pts) - min(p[i] for p in pts) for i in axes]

    nozzles = []
    for name, pos in locators.items():
        if not name.startswith("exhaust_"):
            continue
        bell = extent(name[len("exhaust_"):] + "_sino", (1, 2))
        # The bell's mouth is 2.65/2.2 of the engine radius (a 12-gon, so its width is the
        # radius times cos 15°); the jet fills 0.8 of the radius.
        radius = (max(bell) / 2 / math.cos(math.pi / 12) / (2.65 / 2.2) * 0.8) if bell else 1.0
        nozzles.append({"name": name, "groups": ["main"], "position": place(turn(pos)), "direction": [-1, 0, 0],
                        "radius": r4(radius), "length": r4(length * 0.38)})
    for name, pos in sorted(locators.items()):
        if not name.startswith("rcs_") or len(name) != 6:
            continue
        front, left = name[4] == "f", name[5] == "e"
        port = extent(name + "_lat", (0, 1, 2))
        block = extent(name, (0, 1, 2))
        if not port or not block:
            continue
        # Out to the end of the lateral port (it sticks out sideways, along the game's z).
        reach = block[2] / 2 + port[2]
        jet = port[1] / 2
        centre_bb = turn(pos)
        side = -1 if left else 1
        lat = [centre_bb[0], centre_bb[1], centre_bb[2] + side * reach]
        # A port on the left pushes the ship right; at the bow that turns it clockwise, at the stern counter-clockwise.
        groups = ["pushRight" if left else "pushLeft", ("cw" if left else "ccw") if front else ("ccw" if left else "cw")]
        nozzles.append({"name": name + "_lat", "groups": groups, "position": place(lat), "direction": [0, 0, side],
                        "radius": r4(jet), "length": r4(length * 0.12)})
        if front:
            fwd = [centre_bb[0] + reach, centre_bb[1], centre_bb[2]]
            nozzles.append({"name": name + "_long", "groups": ["reverse"], "position": place(fwd), "direction": [1, 0, 0],
                            "radius": r4(jet), "length": r4(length * 0.12)})

    out = os.path.join(ROOT, "packages", "view3d", "assets", ship)
    os.makedirs(out, exist_ok=True)
    data = {"length": r4(length), "atlas": surfaces[0], "glow": surfaces[1], "nozzles": nozzles}
    with open(os.path.join(out, "hull.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
    base = os.path.splitext(path)[0]
    for src, dst in (("_atlas", "atlas"), ("_orm", "orm"), ("_glow", "glow")):
        shutil.copyfile(base + src + ".png", os.path.join(out, dst + ".png"))
    tris = len(surfaces[0]["positions"]) // 9 + len(surfaces[1]["positions"]) // 9
    print(f"{ship}: {tris} triangles, length {length:.2f}, {len(nozzles)} nozzles -> {out}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    bake(sys.argv[1], sys.argv[2])
