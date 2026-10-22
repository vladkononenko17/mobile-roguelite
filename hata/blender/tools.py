"""Builds the first-person tools for «Хата з краю» in Blender and exports GLB.

Run:  python3 hata/blender/tools.py   (needs the `bpy` module, Blender 4.2+)
Out:  public/hata/models/tools.glb with one root node per tool:
      washer, mower, blower, glove_grip (right hand, curled round a 3 cm bar)

Organic parts (gloves, grips, bodies) are metaballs converted to meshes,
voxel-remeshed and decimated, so they come out smooth at a few thousand
triangles. Hard parts are bevelled primitives. Materials are plain
Principled BSDF and export as glTF PBR.
"""
import math
import os
import bpy
import bmesh
from mathutils import Vector, Euler, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public", "hata", "models", "tools.glb")


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, color, rough=0.5, metal=0.0, coat=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if "Coat Weight" in b.inputs:
        b.inputs["Coat Weight"].default_value = coat
    return m


def srgb(h):
    def c(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c((h >> 16) & 255), c((h >> 8) & 255), c(h & 255))


M = {}


def mats():
    M["yellow"] = mat("PlasticYellow", srgb(0xF2B316), 0.35, 0, 0.4)
    M["black"] = mat("PlasticBlack", srgb(0x1C1F21), 0.55)
    M["rubber"] = mat("RubberGrip", srgb(0x26292B), 0.85)
    M["steel"] = mat("Steel", srgb(0xC8CCD0), 0.25, 1)
    M["red"] = mat("PaintRed", srgb(0xB3271D), 0.38, 0.15, 0.5)
    M["glove"] = mat("GloveNitrile", srgb(0x3E7A44), 0.5)
    M["cuff"] = mat("GloveCuff", srgb(0xD9D2C2), 0.9)
    M["sleeve"] = mat("SleeveDenim", srgb(0x34506E), 0.95)
    M["orange"] = mat("PlasticOrange", srgb(0xE8661E), 0.4, 0, 0.3)
    M["bag"] = mat("Canvas", srgb(0x3D4A3B), 0.95)


def link(obj, parent=None):
    if obj.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def empty(name, parent=None):
    e = bpy.data.objects.new(name, None)
    return link(e, parent)


def finish(obj, material, smooth=True, bevel=0.0, subsurf=0, decimate=None):
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    if bevel:
        m = obj.modifiers.new("bevel", "BEVEL")
        m.width = bevel
        m.segments = 3
        m.limit_method = "ANGLE"
    if subsurf:
        m = obj.modifiers.new("sub", "SUBSURF")
        m.levels = subsurf
        m.render_levels = subsurf
    if decimate:
        m = obj.modifiers.new("dec", "DECIMATE")
        m.ratio = decimate
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    if smooth:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(40)) if hasattr(bpy.ops.object, "shade_auto_smooth") else bpy.ops.object.shade_smooth()
    obj.data.materials.clear()
    obj.data.materials.append(material)
    return obj


def prim(kind, name, material, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), parent=None, bevel=0.0, subsurf=0, **kw):
    fn = {
        "cube": bpy.ops.mesh.primitive_cube_add,
        "cyl": bpy.ops.mesh.primitive_cylinder_add,
        "sphere": bpy.ops.mesh.primitive_uv_sphere_add,
        "torus": bpy.ops.mesh.primitive_torus_add,
        "cone": bpy.ops.mesh.primitive_cone_add,
    }[kind]
    fn(location=loc, rotation=rot, **kw)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish(o, material, bevel=bevel, subsurf=subsurf)
    if parent:
        o.parent = parent
    return o


def blob(name, elements, material, parent=None, voxel=0.004, ratio=0.35, resolution=0.004):
    """Metaball blob from capsules/balls -> remeshed, decimated mesh.

    elements: list of (type, location, radius, rotation_euler, size_x)
    """
    mb = bpy.data.metaballs.new(name + "_mb")
    mb.resolution = resolution
    mb.render_resolution = resolution
    mb.threshold = 0.6
    obj = bpy.data.objects.new(name + "_meta", mb)
    link(obj)
    for t, loc, r, rot, sx in elements:
        e = mb.elements.new()
        e.type = t
        e.co = loc
        e.radius = r * 1.45  # the iso-surface sits well inside the element radius
        e.stiffness = 2.0
        if t == "CAPSULE":
            e.size_x = sx
        q = Euler(rot).to_quaternion()
        e.rotation = q
    bpy.context.view_layer.update()
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    mesh_obj = bpy.context.active_object
    mesh_obj.name = name
    rm = mesh_obj.modifiers.new("remesh", "REMESH")
    rm.mode = "VOXEL"
    rm.voxel_size = voxel
    finish(mesh_obj, material, decimate=ratio)
    if parent:
        mesh_obj.parent = parent
    return mesh_obj


def finger(base, direction, side, lengths, radius, curl, spread):
    """Capsules for one finger, curling about `side` axis by `curl` per joint."""
    out = []
    p = Vector(base)
    d = Vector(direction).normalized()
    ax = Vector(side).normalized()
    d.rotate(Matrix.Rotation(spread, 3, Vector((0, 0, 1))))
    for i, L in enumerate(lengths):
        r = radius * (1 - 0.1 * i)
        mid = p + d * (L / 2)
        # capsule along local X: rotation that maps X to d
        rot = Vector((1, 0, 0)).rotation_difference(d).to_euler()
        out.append(("CAPSULE", mid, r, rot, L / 2))
        p = p + d * L
        d.rotate(Matrix.Rotation(curl, 3, ax))
    return out


def glove_grip(name, parent=None, mirror=False):
    """Right hand in a nitrile glove, fingers wrapped round a bar along X
    (bar centre at the origin, radius ~1.6 cm), wrist toward -Z/-Y."""
    root = empty(name, parent)
    el = []
    # palm: a flattened cluster behind the bar
    for x in (-0.03, -0.01, 0.01, 0.03):
        el.append(("BALL", (x, -0.035, -0.012), 0.032, (0, 0, 0), 0))
    el.append(("CAPSULE", (0.0, -0.06, -0.035), 0.036, (0, 0, 0), 0.03))
    # fingers start on top of the bar's back side and wrap forward over it
    for i, x in enumerate((-0.033, -0.011, 0.011, 0.031)):
        L = [0.042, 0.027, 0.022] if i in (1, 2) else [0.036, 0.024, 0.019]
        el += finger((x, -0.03, 0.022), (0, 1, 0.15), (1, 0, 0), L, 0.0115, -1.05, 0)
    # thumb crosses in front on the other side
    el += finger((0.04, -0.045, -0.02), (-0.3, 0.6, 0.55), (0.3, 0.2, -1), [0.035, 0.03], 0.013, 0.55, 0)
    # wrist
    el.append(("CAPSULE", (0.0, -0.1, -0.06), 0.034, (0, math.radians(90), math.radians(30)), 0.02))
    g = blob(name + "_glove", el, M["glove"], root, voxel=0.0028, ratio=0.3, resolution=0.003)
    cuff = prim("cyl", name + "_cuff", M["cuff"], loc=(0, -0.13, -0.08), rot=(math.radians(-60), 0, 0), scale=(0.039, 0.039, 0.016), parent=root, vertices=28)
    # long gauntlet cuff instead of a sleeve: the forearm is out of frame in first person
    prim("cyl", name + "_gauntlet", M["glove"], loc=(0, -0.15, -0.095), rot=(math.radians(-60), 0, 0), scale=(0.042, 0.042, 0.035), parent=root, vertices=28, subsurf=1)
    if mirror:
        root.scale = (-1, 1, 1)
    return root


def washer():
    root = empty("washer")
    # body: trigger gun, rounded
    body = blob("washer_body", [
        ("CAPSULE", (0, 0, 0), 0.03, (0, 0, math.radians(90)), 0.09),
        ("CAPSULE", (0, -0.02, -0.075), 0.026, (math.radians(-20), 0, 0), 0.04),
        ("BALL", (0, 0.07, 0.01), 0.034, (0, 0, 0), 0),
    ], M["yellow"], root, voxel=0.003, ratio=0.4)
    body.rotation_euler = (0, 0, 0)
    grip = blob("washer_grip", [
        ("CAPSULE", (0, -0.07, -0.08), 0.019, (math.radians(70), 0, math.radians(90)), 0.05),
    ], M["rubber"], root, voxel=0.003, ratio=0.4)
    # trigger
    trig = prim("cube", "washer_trigger", M["black"], loc=(0, -0.03, -0.045), scale=(0.008, 0.012, 0.03), parent=root)
    # lance + nozzle
    prim("cyl", "washer_lance", M["steel"], loc=(0, 0.5, 0.012), rot=(math.radians(90), 0, 0), scale=(0.009, 0.009, 0.42), parent=root, vertices=20)
    prim("cyl", "washer_coupler", M["black"], loc=(0, 0.1, 0.012), rot=(math.radians(90), 0, 0), scale=(0.016, 0.016, 0.03), parent=root, vertices=24)
    prim("cone", "washer_nozzle", M["black"], loc=(0, 0.94, 0.012), rot=(math.radians(-90), 0, 0), scale=(0.018, 0.018, 0.035), parent=root, vertices=24, radius2=0.5)
    prim("cyl", "washer_nozzle_band", M["orange"], loc=(0, 0.91, 0.012), rot=(math.radians(90), 0, 0), scale=(0.019, 0.019, 0.008), parent=root, vertices=24)
    tip = empty("washer_tip", root)
    tip.location = (0, 0.985, 0.012)
    # second hand grip half-way on the lance
    prim("cyl", "washer_foregrip", M["rubber"], loc=(0, 0.42, 0.012), rot=(math.radians(90), 0, 0), scale=(0.017, 0.017, 0.06), parent=root, vertices=24)
    # hose
    curve = bpy.data.curves.new("hose", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 0.008
    curve.bevel_resolution = 3
    sp = curve.splines.new("BEZIER")
    pts = [(0, -0.09, -0.11), (0.03, -0.2, -0.3), (0.12, -0.25, -0.6)]
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    ho = bpy.data.objects.new("washer_hose", curve)
    link(ho, root)
    bpy.context.view_layer.objects.active = ho
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ho.select_set(True)
    bpy.ops.object.convert(target="MESH")
    ho = bpy.context.active_object
    finish(ho, M["black"])
    # hands
    rh = glove_grip("washer_hand_r", root)
    rh.location = (0, -0.07, -0.08)
    rh.rotation_euler = (math.radians(-15), math.radians(90), 0)
    lh = glove_grip("washer_hand_l", root)
    lh.location = (0, 0.42, 0.012)
    lh.rotation_euler = (0, 0, math.radians(-90))
    return root


def mower():
    root = empty("mower")
    prim("cube", "mower_deck", M["red"], loc=(0, 0, 0.13), scale=(0.29, 0.31, 0.07), parent=root, bevel=0.06, subsurf=1)
    prim("cube", "mower_skirt", M["black"], loc=(0, 0, 0.065), scale=(0.3, 0.32, 0.02), parent=root, bevel=0.02)
    prim("cyl", "mower_engine", M["black"], loc=(0, 0.02, 0.24), scale=(0.15, 0.15, 0.1), parent=root, vertices=40)
    prim("cyl", "mower_engine_top", M["red"], loc=(0, 0.02, 0.35), scale=(0.11, 0.11, 0.02), parent=root, vertices=40)
    prim("cyl", "mower_cap", M["yellow"], loc=(0.07, -0.05, 0.38), scale=(0.025, 0.025, 0.02), parent=root, vertices=20)
    for x, y in ((-0.3, -0.24), (0.3, -0.24), (-0.3, 0.27), (0.3, 0.27)):
        prim("cyl", "mower_wheel", M["rubber"], loc=(x, y, 0.1), rot=(0, math.radians(90), 0), scale=(0.1, 0.1, 0.025), parent=root, vertices=32)
        prim("cyl", "mower_hub", M["steel"], loc=(x * 1.08, y, 0.1), rot=(0, math.radians(90), 0), scale=(0.04, 0.04, 0.012), parent=root, vertices=20)
    # handle loop
    curve = bpy.data.curves.new("handle", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 0.013
    curve.bevel_resolution = 4
    sp = curve.splines.new("POLY")
    pts = [(-0.24, 0.32, 0.2), (-0.26, 0.75, 0.68), (-0.26, 1.02, 0.98), (-0.2, 1.08, 1.02), (0.2, 1.08, 1.02), (0.26, 1.02, 0.98), (0.26, 0.75, 0.68), (0.24, 0.32, 0.2)]
    sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts):
        p.co = (*c, 1)
    sp.use_smooth = True
    ho = bpy.data.objects.new("mower_handle", curve)
    link(ho, root)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ho.select_set(True)
    bpy.context.view_layer.objects.active = ho
    bpy.ops.object.convert(target="MESH")
    finish(bpy.context.active_object, M["steel"], subsurf=1)
    prim("cyl", "mower_foam", M["rubber"], loc=(0, 1.08, 1.02), rot=(0, math.radians(90), 0), scale=(0.02, 0.02, 0.2), parent=root, vertices=24)
    bag = prim("cube", "mower_bag", M["bag"], loc=(0, 0.48, 0.3), rot=(math.radians(-25), 0, 0), scale=(0.2, 0.17, 0.14), parent=root, bevel=0.06, subsurf=2)
    rh = glove_grip("mower_hand_r", root)
    rh.location = (0.12, 1.08, 1.02)
    rh.rotation_euler = (math.radians(-83), 0, math.radians(180))
    lh = glove_grip("mower_hand_l", root)
    lh.location = (-0.12, 1.08, 1.02)
    lh.rotation_euler = (math.radians(-83), 0, math.radians(180))
    return root


def blower():
    root = empty("blower")
    body = blob("blower_body", [
        ("ELLIPSOID", (0, 0, 0), 0.11, (0, 0, 0), 0),
        ("CAPSULE", (0, 0.12, 0.02), 0.06, (0, 0, math.radians(90)), 0.06),
    ], M["orange"], root, voxel=0.004, ratio=0.35)
    body.scale = (0.8, 1.0, 0.85)
    prim("cyl", "blower_tube", M["black"], loc=(0, 0.55, -0.04), rot=(math.radians(84), 0, 0), scale=(0.035, 0.035, 0.35), parent=root, vertices=28)
    prim("cyl", "blower_mouth", M["orange"], loc=(0, 0.9, -0.08), rot=(math.radians(84), 0, 0), scale=(0.04, 0.04, 0.02), parent=root, vertices=28)
    prim("torus", "blower_handle", M["rubber"], loc=(0, -0.02, 0.12), rot=(0, math.radians(90), 0), parent=root, major_radius=0.06, minor_radius=0.014, major_segments=32, minor_segments=10)
    rh = glove_grip("blower_hand_r", root)
    rh.location = (0, -0.02, 0.18)
    rh.rotation_euler = (math.radians(-90), 0, math.radians(90))
    return root


def detector():
    """Metal detector held out in front: shaft along +Y (away from the player),
    coil flat on the ground at the far end, grip and arm cuff near the player."""
    root = empty("detector")
    # shaft: from the grip (0, 0, 0) down-forward to the coil (0, 1.05, -0.95)
    a, b = Vector((0, -0.05, 0.05)), Vector((0, 1.0, -0.92))
    mid, d = (a + b) / 2, (b - a)
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_euler()
    prim("cyl", "det_shaft", M["black"], loc=mid, rot=rot, scale=(0.012, 0.012, d.length / 2), parent=root, vertices=16)
    prim("cyl", "det_shaft_low", M["steel"], loc=a.lerp(b, 0.8), rot=rot, scale=(0.009, 0.009, 0.16), parent=root, vertices=16)
    # coil: a flat ring with a filled disc, tilted to lie on the ground
    prim("torus", "det_coil", M["black"], loc=(0, 1.06, -0.96), rot=(0, 0, 0), parent=root, major_radius=0.13, minor_radius=0.018, major_segments=48, minor_segments=12)
    prim("cyl", "det_coil_disc", M["orange"], loc=(0, 1.06, -0.96), scale=(0.12, 0.12, 0.008), parent=root, vertices=48)
    # control box with a little screen
    prim("cube", "det_box", M["black"], loc=(0, 0.12, -0.04), rot=(math.radians(42), 0, 0), scale=(0.045, 0.07, 0.03), parent=root, bevel=0.01)
    prim("cube", "det_screen", mat("Screen", srgb(0x2BD4A0), 0.2), loc=(0, 0.115, -0.008), rot=(math.radians(42), 0, 0), scale=(0.032, 0.045, 0.004), parent=root)
    # arm cuff behind the grip
    rh = glove_grip("det_hand", root)
    rh.location = (0, 0.0, 0.03)
    rh.rotation_euler = (math.radians(-40), math.radians(90), 0)
    return root


def main():
    reset()
    mats()
    roots = [washer(), mower(), blower(), detector(), glove_grip("glove_grip")]
    # spread them out so the file is easy to inspect; the game re-positions them
    for i, r in enumerate(roots):
        r.location.x += i * 1.5
    # glTF is Y-up; Blender is Z-up — the exporter converts.
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True, export_yup=True)
    tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
    print(f"exported {OUT} ({os.path.getsize(OUT) // 1024} KB, {tris} faces)")


if __name__ == "__main__":
    main()
