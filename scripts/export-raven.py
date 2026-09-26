# Exports the CC0 "Raven" by (OpenGameArt: opengameart.org/content/raven-0; assets-src/raven/raven.blend)
# to a GLB with only its flight clip, for scripts/build-raven.mjs. Needs Blender's Python module:
#   python3 -m venv venv && venv/bin/pip install bpy==4.2.0
#   venv/bin/python scripts/export-raven.py
import bpy
bpy.ops.wm.open_mainfile(filepath="assets-src/raven/raven.blend")
arm = bpy.data.objects["raven_armature"]
if arm.animation_data is None: arm.animation_data_create()
arm.animation_data.action = bpy.data.actions["fly"]
for a in list(bpy.data.actions):
    if a.name != "fly": bpy.data.actions.remove(a)
bpy.context.scene.frame_start, bpy.context.scene.frame_end = 0, 34
bpy.ops.export_scene.gltf(filepath="assets-src/raven/raven_raw.glb", export_format="GLB", export_animations=True, export_animation_mode="ACTIONS", export_yup=True, export_apply=False)
print("ok")
