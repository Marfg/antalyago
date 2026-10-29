"""
scripts/board/build-lesson-boards.py

Ders sahnelerinin (learning-scenes.html) 3D tahtasını üretir: ana sayfa
gobanının ahşabı ve taşlarıyla, ders motorunun ölçülerine uyan masa tipi
tahta. Çizgi aralığı iki eksende eşittir ve kenar payı 0,82 çizgi aralığıdır
(adapters/sceneBoardAdapter.js: bw = HALF + CELL * .82); çizgiler ve yıldız
noktaları üst yüz dokusuna çizilir.

Çıktı (assets/board/):
  ders-5.glb, ders-9.glb, ders-13.glb, ders-19.glb  üst yüz dokusu 2048
  ders-<n>-hafif.glb                                telefon, 1024

Model birimleri: tahta genişliği 1, üst yüz y = 0 (Three.js ekseninde),
taşlar gerçek oranında; adapters/board3d.js hepsini ders ölçüsüne getirir.

Kullanım:
  blender --background --factory-startup --python scripts/board/build-lesson-boards.py -- [--out assets/board]

Ahşap, ışık ve taş malzemeleri scripts/hero/build-hero-goban.py'den gelir.
"""
import bmesh
import bpy
import os
import runpy
import sys

import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
HERO = runpy.run_path(os.path.join(ROOT, 'scripts', 'hero', 'build-hero-goban.py'), run_name='hero')

MARGIN = 0.82                       # kenar payı, çizgi aralığı cinsinden
THICK = 0.12                        # kalınlık / genişlik
BEVEL = 0.006
LINE = {5: 0.022, 9: 0.030, 13: 0.040, 19: 0.055}   # çizgi kalınlığı, çizgi aralığı cinsinden
EDGE_LINE = 1.7                     # dış çerçeve çizgisi bu kat kalın
HOSHI = {
    5: [(2, 2)],
    9: [(2, 2), (6, 2), (4, 4), (2, 6), (6, 6)],
    13: [(3, 3), (9, 3), (6, 6), (3, 9), (9, 9)],
    19: [(3, 3), (9, 3), (15, 3), (3, 9), (9, 9), (15, 9), (3, 15), (9, 15), (15, 15)],
}
HOSHI_R = {5: 0.07, 9: 0.085, 13: 0.10, 19: 0.13}
COLLECTION = 'DersTahta'


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = argv[argv.index('--out') + 1] if '--out' in argv else 'assets/board'
    return out if os.path.isabs(out) else os.path.join(ROOT, out)


def wood():
    diff = HERO['kaya_tint'](HERO['load_px'](HERO['fetch']('diff'), 'sRGB'))
    rough = HERO['load_px'](HERO['fetch']('rough'), 'Non-Color')[:, :, 0]
    nor = HERO['load_px'](HERO['fetch']('nor_gl'), 'Non-Color')
    return diff, rough, nor


def crop_square(a, size):
    """Ahşabın kare bir bölgesi; damar tahtanın bir kenarı boyunca uzanır."""
    h, w = a.shape[:2]
    s = int(min(h, w) * 0.62)
    x0, y0 = int(w * 0.18), int(h * 0.20)
    return HERO['resize'](np.rot90(a[y0:y0 + s, x0:x0 + s]), size)


def draw_grid(rgb, n):
    """n x n çizgi ve yıldız noktaları, kenar yumuşatmalı."""
    px = rgb.shape[0]
    span = (n - 1) + 2 * MARGIN                       # dokunun kapsadığı genişlik, çizgi aralığı cinsinden
    u = (np.arange(px) + 0.5) / px * span - span / 2  # piksel merkezi, tahta merkezinden
    X, Y = np.meshgrid(u, u)
    step = span / px
    half = (n - 1) / 2
    cover = np.zeros_like(X)
    for i in range(n):
        lw = LINE[n] * (EDGE_LINE if i in (0, n - 1) else 1) / 2
        c = i - half
        dv = np.clip((lw - np.abs(X - c)) / step + 0.5, 0, 1)
        dh = np.clip((lw - np.abs(Y - c)) / step + 0.5, 0, 1)
        inside_v = np.abs(Y) <= half + lw
        inside_h = np.abs(X) <= half + lw
        cover = np.maximum(cover, np.maximum(np.where(inside_v, dv, 0), np.where(inside_h, dh, 0)))
    for i, j in HOSHI[n]:
        d = np.hypot(X - (i - half), Y - (j - half))
        cover = np.maximum(cover, np.clip((HOSHI_R[n] - d) / step + 0.5, 0, 1))
    ink = np.array([0.10, 0.065, 0.04])
    c = cover[:, :, None] * 0.9
    return rgb * (1 - c) + ink * c


def board_mesh(top_mat, side_mat):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x, v.co.y, (v.co.z - 0.5) * THICK))   # üst yüz z = 0
    bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=BEVEL, segments=3, profile=0.5, affect='EDGES')
    uv = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        n = f.normal
        f.smooth = True
        if n.z > 0.999:
            f.material_index = 0
            for l in f.loops:
                l[uv].uv = (l.vert.co.x + 0.5, l.vert.co.y + 0.5)
        else:
            f.material_index = 1
            ax = max(range(3), key=lambda k: abs(n[k]))
            for l in f.loops:
                co = l.vert.co
                a, b = [(co.y, co.z), (co.x, co.z), (co.x, co.y)][ax]
                l[uv].uv = (a * 0.5 + 0.5, b * 0.5 + 0.3)
    me = bpy.data.meshes.new('Tahta')
    bm.to_mesh(me)
    bm.free()
    me.materials.append(top_mat)
    me.materials.append(side_mat)
    return me


def build(n, size, src):
    diff, rough, nor = src
    c = bpy.data.collections.get(COLLECTION)
    if c is None:
        c = bpy.data.collections.new(COLLECTION)
        bpy.context.scene.collection.children.link(c)
    for o in list(c.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)
    mk = HERO['make_image']
    top_rgb = draw_grid(crop_square(diff, size), n)
    top_rough = crop_square(rough[:, :, None], size // 2)[:, :, 0] * 0.35 + 0.30
    top_nor = crop_square(nor, size // 2)
    top_nor[:, :, [0, 1]] = top_nor[:, :, [1, 0]]     # 90° döndürülen dokuda x/y yer değiştirir
    top_nor[:, :, 0] = 1 - top_nor[:, :, 0]
    top_nor = 0.5 + (top_nor - 0.5) * np.array([0.6, 0.6, 1.0])
    orm = np.stack([np.ones_like(top_rough), top_rough, np.zeros_like(top_rough)], axis=2)
    side = HERO['resize'](diff, size // 2)
    side_rough = HERO['resize'](rough[:, :, None], size // 4)[:, :, 0] * 0.35 + 0.32
    tag = f'{n}_{size}'
    mat = HERO['material']
    top = mat('DersUst', base_img=mk(f'ders_ust_{tag}', top_rgb, 'sRGB'), orm_img=mk(f'ders_ust_orm_{tag}', orm, 'Non-Color'),
              nor_img=mk(f'ders_ust_nor_{tag}', top_nor, 'Non-Color'), coat=0.12, coat_rough=0.3)
    side_m = mat('DersYan', base_img=mk(f'ders_yan_{tag}', side, 'sRGB'),
                 orm_img=mk(f'ders_yan_orm_{tag}', np.stack([np.ones_like(side_rough), side_rough, np.zeros_like(side_rough)], 2), 'Non-Color'),
                 coat=0.12, coat_rough=0.3)
    shell = bpy.data.images.get('kabuk') or HERO['shell_texture']()
    slate = mat('Arduvaz', base=(0.012, 0.012, 0.013), rough=0.42, coat=0.35, coat_rough=0.22)
    shellm = mat('Kabuk', base_img=shell, rough=0.26, coat=0.5, coat_rough=0.12)

    HERO['link'](c, 'Tahta', board_mesh(top, side_m))
    for key, m in (('B', slate), ('W', shellm)):
        r, h = HERO['STONE'][key]
        o = HERO['link'](c, 'TasSiyah' if key == 'B' else 'TasBeyaz', HERO['stone_mesh']('Tas' + key, r, h, m), (0, 0, -1))
        o['stoneHeight'] = h
        o['stoneRadius'] = r
    return c


if __name__ == '__main__':
    out = args()
    for o in list(bpy.data.objects):          # fabrika sahnesinin küpü, ışığı, kamerası
        bpy.data.objects.remove(o, do_unlink=True)
    src = wood()
    for n in (5, 9, 13, 19):
        HERO['export'](build(n, 1024, src), os.path.join(out, f'ders-{n}-hafif.glb'))
        HERO['export'](build(n, 2048, src), os.path.join(out, f'ders-{n}.glb'))
