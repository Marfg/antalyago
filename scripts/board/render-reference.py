"""
Ders tahtasının Blender referans çizimi (Cycles, ekran kartında).

Tarayıcıdaki 3D tahtanın (adapters/board3d.js) hedef görünümü: aynı GLB, aynı
kamera, aynı taşlar; ışık Blender'da fiziksel olarak hesaplanır. Tarayıcıdaki
LOOK ayarları bu kareye göre kalibre edilir (bkz. tests/verify-board3d.mjs).

Çalıştırma:
  blender --background --factory-startup --python scripts/board/render-reference.py -- \
      <kamera.json> <çıktı.png> [boyut=9]

kamera.json: board3d.state().cam (W, H, projCY, yaw, pitch, dist, width, boardH).
Taşlar: STONES listesi (satır, sütun, renk), tarayıcı karşılaştırmasıyla aynı dizilim.
"""
import bpy
import json
import math
import os
import sys
import time
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
argv = sys.argv[sys.argv.index('--') + 1:]
CAM, OUT = json.load(open(argv[0])), argv[1]
SIZE = int(argv[2]) if len(argv) > 2 else 9

EYE, MARGIN = 700, 0.82
CELL = {9: 48, 13: 32, 19: 22}.get(SIZE, 48)
HALF = (SIZE - 1) * CELL / 2
STONE_R = CELL * 20 / 48
LIGHT = (-0.897, 0.442)           # adaptörün LIGHT_X, LIGHT_Z değerleri
STONES = [(4, 4, 'B'), (3, 4, 'W'), (4, 5, 'B'), (5, 3, 'W'), (2, 6, 'B'), (6, 6, 'W')]

s = 1 / CAM['width']              # tarayıcı birimi → GLB birimi (tahta genişliği 1)
TOP = CAM['boardH'] / 2           # tarayıcıda tahtanın üst yüzü (Three.js Y)


def to_blender(X, Y, Z):
    """Three.js noktası → Blender (z yukarı, tahta üst yüzü z = 0)."""
    return Vector((X * s, -Z * s, (Y - TOP) * s))


def direction(X, Y, Z):
    return Vector((X, -Z, Y)).normalized()


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'assets', 'board', f'ders-{SIZE}.glb'))
objs = {o.name: o for o in bpy.data.objects}
board = objs['Tahta']

# Tarayıcıdaki ahşap tonu: taban rengi (1, .78, .48) ile çarpılır, cila .04.
for o in [board] + list(board.children):
    for slot in getattr(o, 'material_slots', []):
        nt = slot.material.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type, mix.blend_type = 'RGBA', 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1
        mix.inputs['B'].default_value = (1, .78, .48, 1)
        link = bsdf.inputs['Base Color'].links
        if link:
            nt.links.new(link[0].from_socket, mix.inputs['A'])
        else:
            mix.inputs['A'].default_value = bsdf.inputs['Base Color'].default_value
        nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
        bsdf.inputs['Coat Weight'].default_value = .04

sc = bpy.context.scene
B, W = objs['TasSiyah'], objs['TasBeyaz']
for i, (row, col, color) in enumerate(STONES):
    src = B if color == 'B' else W
    k = STONE_R * s / src['stoneRadius']
    o = src.copy()
    sc.collection.objects.link(o)
    o.scale = (k, k, k)
    o.location = to_blender(-HALF + col * CELL, TOP, HALF - row * CELL) + Vector((0, 0, src['stoneHeight'] * k / 2))
    o.rotation_euler = (0, 0, i * 2.399963)
B.hide_render = W.hide_render = True

bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, -0.12 - 0.5 * s))
bpy.context.object.is_shadow_catcher = True

# Kamera: board3d.js'teki görünüm matrisinin tersi.
cy, sy = math.cos(CAM['yaw']), math.sin(CAM['yaw'])
cp, sp = math.cos(CAM['pitch']), math.sin(CAM['pitch'])
back = (sy * cp, sp, cy * cp)                      # görünüm uzayının +Z ekseni (dünyada)
up = (-sy * sp, cp, -cy * sp)
right = (cy, 0, -sy)
cam = bpy.data.objects.new('Kamera', bpy.data.cameras.new('Kamera'))
sc.collection.objects.link(cam)
sc.camera = cam
cam.matrix_world = Matrix.Translation(to_blender(*(EYE * v for v in back))) @ Matrix((
    (*direction(*right), 0), (*direction(*up), 0), (*direction(*back), 0), (0, 0, 0, 1))).transposed()
cam.data.sensor_fit = 'HORIZONTAL'
cam.data.sensor_width = 36
cam.data.lens = EYE * CAM['dist'] / 500 / CAM['W'] * 36
cam.data.shift_y = (CAM['H'] / 2 - CAM['projCY']) / CAM['W']
cam.data.clip_start, cam.data.clip_end = 0.01, 100

# Işık: güneş adaptörün ışık yönünden ~50° yükseklikten, karşıdan zayıf serin dolgu.
def sun(energy, color, elevation, flip=False, angle=3):
    lx, lz = (-LIGHT[0], -LIGHT[1]) if flip else LIGHT
    pos = Vector((lx * math.cos(elevation), lz * math.cos(elevation), math.sin(elevation)))
    L = bpy.data.lights.new('Gunes', 'SUN')
    L.energy, L.color, L.angle = energy, color, math.radians(angle)
    o = bpy.data.objects.new('Gunes', L)
    sc.collection.objects.link(o)
    o.rotation_euler = (-pos).to_track_quat('-Z', 'Y').to_euler()


sun(3.2, (1, .82, .62), 0.87)
sun(0.35, (.62, .70, 1), 0.6, flip=True, angle=10)
world = bpy.data.worlds.new('Dunya')
sc.world = world
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs['Color'].default_value = (.5, .5, .5, 1)
bg.inputs['Strength'].default_value = .3

sc.render.engine = 'CYCLES'
sc.cycles.samples = 128
sc.cycles.use_denoising = True
prefs = bpy.context.preferences.addons['cycles'].preferences
for kind in ('OPTIX', 'CUDA'):
    try:
        prefs.compute_device_type = kind
        prefs.get_devices_for_type(kind)
        if any(d.type != 'CPU' for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type != 'CPU'
            sc.cycles.device = 'GPU'
            break
    except TypeError:
        continue
sc.view_settings.view_transform = 'AgX'
sc.render.film_transparent = True
sc.render.resolution_x, sc.render.resolution_y = CAM['W'], CAM['H']
sc.render.resolution_percentage = 100
sc.render.filepath = OUT
t = time.time()
bpy.ops.render.render(write_still=True)
print('referans', OUT, sc.cycles.device, round(time.time() - t, 1), 's')
