"""Quick look at an exported GLB: python3 hata/blender/preview.py in.glb out.png"""
import math
import sys
import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
src, out = args[0], args[1]
only = args[2] if len(args) > 2 else ""
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name.startswith(only)]
for o in bpy.context.scene.objects:
    if o.type == "MESH" and o not in objs:
        o.hide_render = True
lo = Vector((1e9, 1e9, 1e9)); hi = -lo
for o in objs:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
mid = (lo + hi) / 2
size = max(hi - lo)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
bpy.context.scene.collection.objects.link(cam)
cam.location = mid + Vector((0.6, -0.5, 0.9)).normalized() * size * 2.4
cam.rotation_euler = (mid - cam.location).to_track_quat("-Z", "Y").to_euler()
bpy.context.scene.camera = cam
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3
sun.rotation_euler = (math.radians(40), math.radians(20), math.radians(30))
bpy.context.scene.collection.objects.link(sun)
s = bpy.context.scene
s.render.engine = "BLENDER_WORKBENCH"
s.display.shading.light = "STUDIO"
s.display.shading.color_type = "MATERIAL"
s.display.shading.show_cavity = True
s.display.shading.show_shadows = True
s.render.resolution_x, s.render.resolution_y = 1400, 700
s.render.filepath = out
bpy.ops.render.render(write_still=True)
print("wrote", out)
