"""
scripts/hero/build-hero-goban.py

Ana sayfa açılış sahnesinin 3D varlıklarını üretir: ayaklı 9x9 kaya goban,
çift dışbükey arduvaz/kabuk taşlar, go-ke kase ve kapağı. Çizgiler ve yıldız
noktaları ahşap dokusuna çizilir; böylece GLB'de ek geometri olmaz.

Çıktı (assets/hero/):
  goban.glb             masaüstü (üst yüz dokusu 2048)
  goban-hafif.glb       telefon (üst yüz dokusu 1024)
  poster-masaustu.webp  --posters ile: 16:9 ilk kare (Cycles)
  poster-telefon.webp   --posters ile: 4:5 ilk kare
  sahne.json            --posters ile: posterlerin kamerası ve ışığı, Three.js
                        eksenlerinde (x, z, −y); home/heroBoard.js ilk kareyi
                        bunlarla kurar

Kullanım:
  blender --background --factory-startup --python scripts/hero/build-hero-goban.py -- [--out assets/hero] [--posters]

Ahşap kaynağı Poly Haven "Oak Veneer 03", ışık ortamı "Wooden Studio 17"
(ikisi de CC0); ilk çalıştırmada indirilip %LOCALAPPDATA%/antalyago-hero-cache
altında saklanır. Posterler ekran kartıyla (OptiX/CUDA) ~30 saniyede, yoksa
işlemciyle ~4 dakikada çizilir.

Birimler metredir. Tahta ölçüleri gerçek 9x9 gobandan: çizgi aralığı
22 mm (yatay) x 23,7 mm (dikey).
"""
import bmesh
import bpy
import math
import os
import sys
import urllib.request

import numpy as np
from mathutils import Vector

SX, SY = 0.022, 0.0237           # çizgi aralığı
MX, MY = 0.020, 0.021            # kenar payı
BW, BD = 8 * SX + 2 * MX, 8 * SY + 2 * MY
BT = 0.06                        # tahta kalınlığı
LEG_H = 0.035                    # ayak yüksekliği (tahta altı z=0, zemin z=-LEG_H)
BEVEL = 0.0025
LINE_W = 0.00055                 # çizgi kalınlığı
HOSHI_R = 0.0011
HOSHI = [(2, 2), (6, 2), (2, 6), (6, 6), (4, 4)]
STONE = {'B': (0.0111, 0.0094), 'W': (0.0109, 0.0088)}   # yarıçap, kalınlık
WOOD_SPAN = 0.6                  # 4k dokunun gerçek dünyada kapladığı genişlik (m)
COLLECTION = 'HeroGoban'

CACHE = os.path.join(os.environ.get('LOCALAPPDATA', os.path.expanduser('~')), 'antalyago-hero-cache')
POLYHAVEN = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/oak_veneer_03/oak_veneer_03_{}_4k.jpg'


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = 'assets/hero'
    if '--out' in argv:
        out = argv[argv.index('--out') + 1]
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return (os.path.join(root, out) if not os.path.isabs(out) else out), '--posters' in argv


# ---------------------------------------------------------------- dokular

def fetch(kind):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f'oak_veneer_03_{kind}_4k.jpg')
    if not os.path.exists(path):
        urllib.request.urlretrieve(POLYHAVEN.format(kind), path)
    return path


def load_px(path, colorspace):
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(h, w, 4)[:, :, :3]


def resize(a, size):
    """Bilinear yeniden örnekleme (numpy)."""
    h, w = a.shape[:2]
    ys = np.linspace(0, h - 1, size)
    xs = np.linspace(0, w - 1, size)
    y0 = np.floor(ys).astype(int); x0 = np.floor(xs).astype(int)
    y1 = np.minimum(y0 + 1, h - 1); x1 = np.minimum(x0 + 1, w - 1)
    fy = (ys - y0)[:, None, None]; fx = (xs - x0)[None, :, None]
    top = a[y0][:, x0] * (1 - fx) + a[y0][:, x1] * fx
    bot = a[y1][:, x0] * (1 - fx) + a[y1][:, x1] * fx
    return top * (1 - fy) + bot * fy


def kaya_tint(rgb):
    """Açık meşe kaplamayı kaya sarısına çeker (sRGB değerlerinde)."""
    grey = rgb.mean(axis=2, keepdims=True)
    sat = grey + (rgb - grey) * 1.3
    return np.clip(sat * np.array([1.0, 0.86, 0.60]) * 1.03, 0, 1)


def crop_top(a, size):
    """Tahta üst yüzüne düşen bölgeyi keser; damar tahtanın boyuna (y) uzanır."""
    h, w = a.shape[:2]
    cw = int(w * BW / WOOD_SPAN); ch = int(h * BD / WOOD_SPAN)
    x0 = int(w * 0.18); y0 = int(h * 0.22)
    region = np.rot90(a[y0:y0 + cw, x0:x0 + ch])     # 90° çevir: damar dikey
    return resize(region, size)


def draw_grid(rgb, rough):
    """Çizgileri ve yıldız noktalarını kenar yumuşatmalı olarak çizer."""
    n = rgb.shape[0]
    u = (np.arange(n) + 0.5) / n
    xs = u * BW - BW / 2                               # piksel merkezlerinin dünya koordinatı
    ys = u * BD - BD / 2                               # görüntü satırı 0 = tahtanın alt (−y) kenarı
    X, Y = np.meshgrid(xs, ys)
    px = BW / n
    cover = np.zeros_like(X)
    half = LINE_W / 2
    span_x, span_y = 4 * SX + half, 4 * SY + half
    inside = (np.abs(X) <= span_x) & (np.abs(Y) <= span_y)
    for i in range(9):
        lx = (i - 4) * SX; ly = (i - 4) * SY
        dv = np.clip((half - np.abs(X - lx)) / px + 0.5, 0, 1)
        dh = np.clip((half - np.abs(Y - ly)) / px + 0.5, 0, 1)
        cover = np.maximum(cover, np.where(inside, np.maximum(dv, dh), 0))
    for i, j in HOSHI:
        d = np.hypot(X - (i - 4) * SX, Y - (4 - j) * SY)
        cover = np.maximum(cover, np.clip((HOSHI_R - d) / px + 0.5, 0, 1))
    ink = np.array([0.10, 0.065, 0.04])
    c = cover[:, :, None] * 0.88
    rgb[:] = rgb * (1 - c) + ink * c
    rough[:] = rough * (1 - cover) + 0.58 * cover
    return rgb, rough


def make_image(name, arr, colorspace, alpha=None):
    h, w = arr.shape[:2]
    img = bpy.data.images.get(name)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.colorspace_settings.name = colorspace
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[:, :, :3] = arr
    img.pixels.foreach_set(rgba.ravel())
    img.file_format = 'WEBP'
    img.pack()
    return img


def board_textures(size):
    diff = kaya_tint(load_px(fetch('diff'), 'sRGB'))
    rough = load_px(fetch('rough'), 'Non-Color')[:, :, 0]
    nor = load_px(fetch('nor_gl'), 'Non-Color')
    top_rgb = crop_top(diff, size)
    top_rough = crop_top(rough[:, :, None], size)[:, :, 0] * 0.35 + 0.30
    top_rgb, top_rough = draw_grid(top_rgb, top_rough)
    nsize = size // 2
    top_nor = crop_top(nor, nsize)
    top_nor[:, :, [0, 1]] = top_nor[:, :, [1, 0]]       # 90° döndürülen dokuda x/y eksenleri yer değiştirir
    top_nor[:, :, 0] = 1 - top_nor[:, :, 0]
    top_nor = 0.5 + (top_nor - 0.5) * np.array([0.6, 0.6, 1.0])
    orm = np.stack([np.ones_like(top_rough), top_rough, np.zeros_like(top_rough)], axis=2)
    side = resize(diff, size // 2)
    side_rough = resize(rough[:, :, None], size // 4)[:, :, 0] * 0.35 + 0.32
    bowl = np.clip(resize(diff, size // 4) * np.array([0.42, 0.24, 0.14]), 0, 1)
    tag = str(size)
    return dict(
        top=make_image(f'kaya_ust_{tag}', top_rgb, 'sRGB'),
        top_orm=make_image(f'kaya_ust_orm_{tag}', resize(orm, nsize), 'Non-Color'),
        top_nor=make_image(f'kaya_ust_nor_{tag}', top_nor, 'Non-Color'),
        side=make_image(f'kaya_yan_{tag}', side, 'sRGB'),
        side_orm=make_image(f'kaya_yan_orm_{tag}', np.stack([np.ones_like(side_rough), side_rough, np.zeros_like(side_rough)], 2), 'Non-Color'),
        bowl=make_image(f'kase_{tag}', bowl, 'sRGB'),
    )


def shell_texture():
    """Beyaz kabuk taşın ince, hafif dalgalı bantları."""
    n = 512
    u = np.linspace(0, 1, n)
    X, Y = np.meshgrid(u, u)
    wave = np.sin((Y * 18 + np.sin(X * 4.0) * 0.4 + np.sin(X * 11 + Y * 3) * 0.1) * math.tau)
    t = (wave * 0.5 + 0.5)[:, :, None]
    lo = np.array([0.905, 0.893, 0.862]); hi = np.array([0.950, 0.942, 0.920])
    return make_image('kabuk', lo * (1 - t) + hi * t, 'sRGB')


# ---------------------------------------------------------------- malzemeler

def material(name, base=None, base_img=None, orm_img=None, nor_img=None, rough=0.5, coat=0.0, coat_rough=0.2):
    m = bpy.data.materials.get(name)
    if m:
        bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Roughness'].default_value = rough
    p.inputs['Coat Weight'].default_value = coat
    p.inputs['Coat Roughness'].default_value = coat_rough
    if base:
        p.inputs['Base Color'].default_value = (*base, 1)
    x = -700
    if base_img:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = base_img; t.location = (x, 300)
        nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    if orm_img:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = orm_img; t.location = (x, 0)
        sep = nt.nodes.new('ShaderNodeSeparateColor'); sep.location = (x + 300, 0)
        nt.links.new(t.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], p.inputs['Roughness'])
    if nor_img:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = nor_img; t.location = (x, -300)
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location = (x + 300, -300)
        nt.links.new(t.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    return m


# ---------------------------------------------------------------- geometri

def collection():
    c = bpy.data.collections.get(COLLECTION)
    if c is None:
        c = bpy.data.collections.new(COLLECTION)
        bpy.context.scene.collection.children.link(c)
    for o in list(c.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for me in list(bpy.data.meshes):          # ikinci çözünürlükte isimler '.001' almasın
        if me.users == 0:
            bpy.data.meshes.remove(me)
    return c


def link(c, name, me, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, me)
    o.location = loc
    c.objects.link(o)
    return o


def board_mesh(top_mat, side_mat):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * BW, v.co.y * BD, (v.co.z + 0.5) * BT))
    bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=BEVEL, segments=3, profile=0.5, affect='EDGES')
    uv = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        n = f.normal
        f.smooth = True
        if n.z > 0.999:
            f.material_index = 0
            for l in f.loops:
                l[uv].uv = ((l.vert.co.x + BW / 2) / BW, (l.vert.co.y + BD / 2) / BD)
        else:
            f.material_index = 1
            ax = max(range(3), key=lambda k: abs(n[k]))
            for l in f.loops:
                co = l.vert.co
                a, b = [(co.y, co.z), (co.x, co.z), (co.x, co.y)][ax]
                l[uv].uv = (a / 0.5 + 0.5, b / 0.5 + 0.3)
    me = bpy.data.meshes.new('Tahta')
    bm.to_mesh(me); bm.free()
    me.materials.append(top_mat); me.materials.append(side_mat)
    return me


def lathe(name, prof, seg, mat):
    bm = bmesh.new()
    vs = [bm.verts.new((r, 0, z)) for r, z in prof]
    es = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    bmesh.ops.spin(bm, geom=vs + es, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=seg, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    uv = bm.loops.layers.uv.new('UVMap')
    zmin = min(z for _, z in prof); zspan = (max(z for _, z in prof) - zmin) or 1
    for f in bm.faces:
        f.smooth = True
        for l in f.loops:
            co = l.vert.co
            l[uv].uv = ((math.atan2(co.y, co.x) / math.tau) % 1.0, (co.z - zmin) / zspan)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    return me


def stone_mesh(name, radius, height, mat, seg=48, rings=24):
    """Süperelips profilli çift dışbükey taş; kenar bir merceğinkinden yumuşak."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    uv = bm.loops.layers.uv.new('UVMap')
    for v in bm.verts:
        x, y, z = v.co
        rxy = math.hypot(x, y)
        phi = math.atan2(z, rxy)
        cr = abs(math.cos(phi)) ** (2 / 2.0)
        sz = abs(math.sin(phi)) ** (2 / 1.65)
        s = radius * cr / rxy if rxy > 1e-9 else 0
        v.co = Vector((x * s, y * s, math.copysign(height / 2 * sz, z)))
    for f in bm.faces:
        f.smooth = True
        for l in f.loops:
            l[uv].uv = (l.vert.co.x / radius * 0.5 + 0.5, l.vert.co.y / radius * 0.5 + 0.5)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    return me


LEG = [(0.0, -LEG_H), (0.0075, -LEG_H), (0.0105, -LEG_H + 0.004), (0.0122, -LEG_H + 0.012),
       (0.0118, -LEG_H + 0.020), (0.0098, -LEG_H + 0.027), (0.0078, -0.004), (0.0084, -0.0015),
       (0.0098, -0.0006), (0.0098, 0.0), (0.0, 0.0)]
BOWL = [(0.0, 0.0), (0.036, 0.0), (0.046, 0.003), (0.058, 0.02), (0.063, 0.045), (0.060, 0.068),
        (0.054, 0.078), (0.051, 0.078), (0.056, 0.066), (0.058, 0.045), (0.053, 0.022),
        (0.040, 0.012), (0.0, 0.012)]
LID = [(0.0, 0.030), (0.030, 0.028), (0.050, 0.020), (0.062, 0.006), (0.066, 0.0),
       (0.060, 0.0), (0.056, 0.004), (0.045, 0.014), (0.0, 0.022)]


def build(size):
    c = collection()
    tex = board_textures(size)
    shell = bpy.data.images.get('kabuk') or shell_texture()
    top = material('KayaUst', base_img=tex['top'], orm_img=tex['top_orm'], nor_img=tex['top_nor'], coat=0.12, coat_rough=0.3)
    side = material('KayaYan', base_img=tex['side'], orm_img=tex['side_orm'], coat=0.12, coat_rough=0.3)
    bowl = material('Kase', base_img=tex['bowl'], rough=0.35, coat=0.5, coat_rough=0.18)
    slate = material('Arduvaz', base=(0.012, 0.012, 0.013), rough=0.42, coat=0.35, coat_rough=0.22)
    shellm = material('Kabuk', base_img=shell, rough=0.26, coat=0.5, coat_rough=0.12)

    link(c, 'Tahta', board_mesh(top, side))
    bx, by = BW / 2 - 0.035, BD / 2 - 0.037
    leg = lathe('Ayak', LEG, 40, side)
    for k, (sx, sy) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)]):
        link(c, f'Ayak{k}', leg, (sx * bx, sy * by, 0))
    link(c, 'Kase', lathe('Kase', BOWL, 64, bowl), (0.20, 0.19, -LEG_H))
    lid = link(c, 'Kapak', lathe('Kapak', LID, 64, bowl), (0.27, 0.0, -LEG_H + 0.030))
    lid.rotation_euler = (math.pi, 0, 0)
    for key, mat in (('B', slate), ('W', shellm)):
        r, h = STONE[key]
        o = link(c, 'TasSiyah' if key == 'B' else 'TasBeyaz', stone_mesh('Tas' + key, r, h, mat), (0, 0, -1))
        o['stoneHeight'] = h
    return c


def export(c, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = c.objects[0]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True,
        export_image_format='WEBP', export_image_quality=82, export_extras=True,
        export_cameras=False, export_lights=False, export_animations=False,
        export_yup=True, export_texcoords=True, export_normals=True, export_tangents=False,
    )
    print('GLB', path, os.path.getsize(path) // 1024, 'KB')


# ---------------------------------------------------------------- posterler

TOP = BT
# İlk kare: siyah taş atari durumunda (ders 3. adım), iki uzak taş; son nefes (4,5).
POSTER_STONES = [('B', 4, 4), ('W', 4, 3), ('W', 3, 4), ('W', 5, 4), ('B', 2, 6), ('W', 6, 2)]
LAST_LIB = (4, 5)
RING = dict(r=0.0118, tube=0.00045, color=(1.0, 0.25, 0.18))
SUN = dict(rot=(76, 0, -112), energy=4.5, color=(1.0, 0.62, 0.34), angle=1.5)
FILL = dict(loc=(0.45, -0.45, 0.35), energy=6, size=0.5, color=(0.62, 0.70, 1.0))
BACKDROP = (0.012, 0.008, 0.006)
FLOOR = (0.03, 0.018, 0.012)
CAMERAS = {
    'masaustu': dict(size=(1920, 1080), lens=32, shift=(-0.14, 0.0), loc=(0.05, -0.098, TOP + 0.022), aim=(0.0, -0.01, TOP)),
    'telefon': dict(size=(1080, 1350), lens=28, shift=(0.0, -0.16), loc=(0.012, -0.108, TOP + 0.025), aim=(0.0, -0.012, TOP + 0.004)),
}
HDRI = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/wooden_studio_17_2k.hdr'


def three(v):
    """Blender (z yukarı) → Three.js (y yukarı)."""
    return [round(v[0], 5), round(v[2], 5), round(-v[1], 5)]


def aim(o, target):
    o.rotation_euler = (Vector(target) - o.location).to_track_quat('-Z', 'Y').to_euler()


def render_device():
    """Ekran kartı varsa OptiX (yoksa CUDA) ile, yoksa işlemciyle çizer."""
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
    except KeyError:
        return 'CPU'
    for kind in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = kind
            devices = prefs.get_devices_for_type(kind)
        except (TypeError, ValueError):
            continue
        gpus = [d for d in devices if d.type != 'CPU']
        if gpus:
            for d in prefs.devices:
                d.use = d.type != 'CPU'
            print('çizim:', kind, gpus[0].name)
            return 'GPU'
    return 'CPU'


def poster_scene():
    import random
    sc = bpy.context.scene
    pc = bpy.data.collections.get('HeroPoster')
    if pc is None:
        pc = bpy.data.collections.new('HeroPoster')
        sc.collection.children.link(pc)
    for o in list(pc.objects):
        bpy.data.objects.remove(o, do_unlink=True)

    random.seed(11)
    for key, i, j in POSTER_STONES:
        src = bpy.data.objects['TasSiyah' if key == 'B' else 'TasBeyaz']
        o = bpy.data.objects.new(f'Poster{key}{i}{j}', src.data)
        o.location = ((i - 4) * SX + random.uniform(-.0005, .0005), (4 - j) * SY + random.uniform(-.0005, .0005), TOP + STONE[key][1] / 2 + 0.00003)
        o.rotation_euler = (0, 0, random.uniform(0, math.tau))
        pc.objects.link(o)

    bpy.ops.mesh.primitive_torus_add(major_radius=RING['r'], minor_radius=RING['tube'], major_segments=96, minor_segments=12,
                                     location=((LAST_LIB[0] - 4) * SX, (4 - LAST_LIB[1]) * SY, TOP + 0.0006))
    ring = bpy.context.active_object
    ring.name = 'PosterHalka'
    for c in ring.users_collection:
        c.objects.unlink(ring)
    pc.objects.link(ring)
    m = material('PosterHalka', base=RING['color'])
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Emission Color'].default_value = (*RING['color'], 1)
    p.inputs['Emission Strength'].default_value = 25
    ring.data.materials.append(m)

    me = bpy.data.meshes.new('PosterZemin')
    me.from_pydata([(-6, -6, 0), (6, -6, 0), (6, 6, 0), (-6, 6, 0)], [], [(0, 1, 2, 3)])
    me.materials.append(material('PosterZemin', base=FLOOR, rough=0.45))
    floor = bpy.data.objects.new('PosterZemin', me)
    floor.location.z = -LEG_H
    pc.objects.link(floor)

    sun = bpy.data.objects.new('PosterGunes', bpy.data.lights.new('PosterGunes', 'SUN'))
    sun.data.energy = SUN['energy']; sun.data.color = SUN['color']; sun.data.angle = math.radians(SUN['angle'])
    sun.rotation_euler = [math.radians(a) for a in SUN['rot']]
    pc.objects.link(sun)
    fill = bpy.data.objects.new('PosterDolgu', bpy.data.lights.new('PosterDolgu', 'AREA'))
    fill.data.shape = 'DISK'; fill.data.size = FILL['size']; fill.data.energy = FILL['energy']; fill.data.color = FILL['color']
    fill.location = FILL['loc']
    aim(fill, (0, 0, TOP))
    pc.objects.link(fill)

    # Işık stüdyo HDRI'sinden, kameranın gördüğü arka plan düz koyu renk.
    os.makedirs(CACHE, exist_ok=True)
    hdr = os.path.join(CACHE, 'wooden_studio_17_2k.hdr')
    if not os.path.exists(hdr):
        urllib.request.urlretrieve(HDRI, hdr)
    world = sc.world or bpy.data.worlds.new('World')
    sc.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(hdr, check_existing=True)
    bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs['Strength'].default_value = 0.12
    flat = nt.nodes.new('ShaderNodeBackground'); flat.inputs['Color'].default_value = (*BACKDROP, 1)
    lp = nt.nodes.new('ShaderNodeLightPath'); mix = nt.nodes.new('ShaderNodeMixShader'); out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(env.outputs['Color'], bg.inputs['Color'])
    nt.links.new(lp.outputs['Is Camera Ray'], mix.inputs[0])
    nt.links.new(bg.outputs[0], mix.inputs[1]); nt.links.new(flat.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])

    cam = bpy.data.objects.new('PosterKamera', bpy.data.cameras.new('PosterKamera'))
    cam.data.clip_start = 0.001
    cam.data.dof.use_dof = True; cam.data.dof.aperture_fstop = 3.2; cam.data.dof.focus_object = ring
    pc.objects.link(cam)
    sc.camera = cam
    try:
        sc.render.engine = 'CYCLES'
    except TypeError as e:
        print('render motoru:', e)
    sc.cycles.device = render_device(); sc.cycles.samples = 96; sc.cycles.use_denoising = True
    sc.view_settings.view_transform = 'AgX'
    try:
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError as e:
        print('görünüm:', e)
    sc.view_settings.exposure = 0
    sc.render.image_settings.file_format = 'WEBP'; sc.render.image_settings.quality = 80
    sc.render.resolution_percentage = 100
    return cam, sun, fill, ring


def posters(out):
    import json
    cam, sun, fill, ring = poster_scene()
    info = {}
    for name, c in CAMERAS.items():
        cam.location = c['loc']; aim(cam, c['aim'])
        cam.data.lens = c['lens']; cam.data.shift_x, cam.data.shift_y = c['shift']
        sc = bpy.context.scene
        sc.render.resolution_x, sc.render.resolution_y = c['size']
        sc.render.filepath = os.path.join(out, f'poster-{name}.webp')
        bpy.ops.render.render(write_still=True)
        info[name] = dict(position=three(c['loc']), target=three(c['aim']), lens=c['lens'], sensor=36,
                          shiftX=c['shift'][0], shiftY=c['shift'][1], fstop=3.2, width=c['size'][0], height=c['size'][1])
        print('poster', name)
    sd = sun.matrix_world.to_3x3() @ Vector((0, 0, -1))
    info['isik'] = dict(gunesYon=three(-sd), gunesRenk=list(SUN['color']), gunesGuc=SUN['energy'],
                        dolguKonum=three(FILL['loc']), dolguRenk=list(FILL['color']), dolguGuc=FILL['energy'],
                        halka=dict(konum=three(ring.location), r=RING['r'], kalinlik=RING['tube'], renk=list(RING['color'])),
                        zeminY=-LEG_H, arkaPlan=list(BACKDROP))
    with open(os.path.join(out, 'sahne.json'), 'w', encoding='utf-8') as f:
        json.dump(info, f, indent=2)


if __name__ == '__main__':
    out, with_posters = args()
    # Fabrika sahnesindeki küp, ışık ve kamera: küp gobanı içine alıp ışığı keser.
    for o in list(bpy.data.objects):
        if not any(c.name in (COLLECTION, 'HeroPoster') for c in o.users_collection):
            bpy.data.objects.remove(o, do_unlink=True)
    export(build(1024), os.path.join(out, 'goban-hafif.glb'))
    export(build(2048), os.path.join(out, 'goban.glb'))
    if with_posters:
        posters(out)
