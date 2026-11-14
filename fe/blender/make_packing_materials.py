"""
Dựng model 3D vật tư đóng gói (xốp hơi, gối hơi, tem dễ vỡ, góc xốp, vách ngăn sóng, giấy lót, băng keo)
rồi xuất .glb vào fe/public/models/materials/.

Chạy (Blender chạy nền, không cần giao diện):

    "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" -b -P fe/blender/make_packing_materials.py -- ^
        --out fe/public/models/materials [--preview <thư mục ảnh xem trước>]

Quy ước (khớp các model đóng gói có sẵn trong fe/public/models):
- Đơn vị là mét, thực tế (VD tem 80 x 50 mm). Cảnh 3D thu phóng theo nhu cầu.
- Trục glTF: Y hướng lên. Gốc tọa độ ở giữa mặt đáy của vật (y = 0 là mặt đáy).
- Mọi mesh tự dựng, không dùng asset ngoài.
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, noise


# ---------------------------------------------------------------------------
# Tham số dòng lệnh
# ---------------------------------------------------------------------------
def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out, preview = None, None
    i = 0
    while i < len(argv):
        if argv[i] == "--out":
            out = argv[i + 1]
            i += 2
        elif argv[i] == "--preview":
            preview = argv[i + 1]
            i += 2
        else:
            i += 1
    if not out:
        raise SystemExit("Thiếu --out <thư mục>")
    return out, preview


# ---------------------------------------------------------------------------
# Hàm dùng chung
# ---------------------------------------------------------------------------
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material(name, color, roughness=0.6, metallic=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Alpha"].default_value = alpha
    mat.diffuse_color = (*color, alpha)
    mat.use_backface_culling = False
    if alpha < 1.0:
        # Blender 4.2+: surface_render_method; bản cũ: blend_method. Bản nào không có thì bỏ qua.
        for attr, value in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
            try:
                setattr(mat, attr, value)
            except (AttributeError, TypeError):
                pass
    return mat


def add_object(name, bm, material, smooth=True):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material)
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def box_geom(bm, size, center):
    """Hộp kích thước (x, y, z) với tâm `center`."""
    sx, sy, sz = size
    m = Matrix.Translation(center) @ Matrix.Diagonal((sx, sy, sz, 1.0))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


def add_bevel(obj, width, segments=2):
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"


# ---------------------------------------------------------------------------
# 1. Xốp hơi (bubble wrap) — tấm 300 x 200 mm
# ---------------------------------------------------------------------------
def build_bubble_wrap():
    film_mat = make_material("bubble_film", (0.86, 0.93, 0.98), roughness=0.08, alpha=0.42)
    bubble_mat = make_material("bubble_air", (0.9, 0.96, 1.0), roughness=0.05, alpha=0.55)
    w, d, t = 0.30, 0.20, 0.0006
    lift = 0.0058 * 0.8  # nâng cả tấm để đáy bong bóng chạm y = 0

    film = bmesh.new()
    box_geom(film, (w, d, t), (0, 0, lift + t / 2))
    add_object("bubble_wrap_film", film, film_mat, smooth=False)

    bubbles = bmesh.new()
    pitch, r = 0.016, 0.0058
    nx, ny = int(w / pitch) - 1, int(d / pitch) - 1
    x0 = -(nx - 1) * pitch / 2
    y0 = -(ny - 1) * pitch / 2
    for ix in range(nx):
        for iy in range(ny):
            m = Matrix.Translation((x0 + ix * pitch, y0 + iy * pitch, lift + t / 2)) @ Matrix.Diagonal((r, r, r * 0.8, 1.0))
            bmesh.ops.create_uvsphere(bubbles, u_segments=8, v_segments=5, radius=1.0, matrix=m)
    add_object("bubble_wrap_bubbles", bubbles, bubble_mat, smooth=True)


# ---------------------------------------------------------------------------
# 2. Gối hơi (air pillow) — 120 x 80 mm, 3 khoang
# ---------------------------------------------------------------------------
def build_air_pillow():
    plastic = make_material("pillow_plastic", (0.82, 0.9, 0.96), roughness=0.12, alpha=0.62)
    valve_mat = make_material("pillow_valve", (0.95, 0.95, 0.95), roughness=0.4)
    length, width, height = 0.12, 0.08, 0.026

    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=72, v_segments=36, radius=1.0)
    chambers = (-length * 0.17, length * 0.17)
    for v in bm.verts:
        # Elip dẹt, rồi bóp 2 đường hàn ngang để thành 3 khoang phồng.
        x, y, z = v.co.x * length / 2, v.co.y * width / 2, v.co.z * height / 2
        pinch = 1.0
        for cx in chambers:
            pinch *= 1.0 - 0.45 * math.exp(-((x - cx) / 0.0075) ** 2)
        # Mép dán phẳng quanh rìa.
        edge = 1.0 - 0.4 * max(0.0, abs(y) / (width / 2) - 0.8) / 0.2
        v.co = Vector((x, y, (z * pinch * edge) + height / 2))
    add_object("air_pillow_body", bm, plastic, smooth=True)

    valve = bmesh.new()
    bmesh.ops.create_cone(
        valve, cap_ends=True, segments=10, radius1=0.004, radius2=0.0028, depth=0.01,
        matrix=Matrix.Translation((length / 2 + 0.003, 0, height / 2)) @ Matrix.Rotation(math.radians(90), 4, "Y"),
    )
    add_object("air_pillow_valve", valve, valve_mat, smooth=True)


# ---------------------------------------------------------------------------
# 3. Tem cảnh báo "hàng dễ vỡ" — 80 x 50 mm, nằm phẳng, mặt hướng lên
# ---------------------------------------------------------------------------
def text_mesh(body, size, location):
    curve = bpy.data.curves.new("t", "FONT")
    curve.body = body
    curve.size = size
    curve.extrude = 0.00012
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    obj = bpy.data.objects.new("t", curve)
    obj.location = location
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.update()
    # Lấy depsgraph SAU khi thêm vật thể, nếu không chữ sẽ rỗng.
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(obj)
    bpy.data.curves.remove(curve)
    # Mesh lấy ra ở toạ độ cục bộ: phải tự dời tới vị trí cần đặt.
    mesh.transform(Matrix.Translation(location))
    return mesh


def prism(bm, points, z0, thickness):
    """Lăng trụ mỏng từ đa giác lồi 2D (x, y), đáy ở z0."""
    low = [bm.verts.new((x, y, z0)) for x, y in points]
    high = [bm.verts.new((x, y, z0 + thickness)) for x, y in points]
    bm.faces.new(low[::-1])
    bm.faces.new(high)
    n = len(points)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((low[i], low[j], high[j], high[i]))


def build_fragile_label():
    red = make_material("label_red", (0.78, 0.07, 0.07), roughness=0.5)
    white = make_material("label_white", (0.98, 0.98, 0.98), roughness=0.5)
    w, h, t = 0.080, 0.050, 0.0004

    base = bmesh.new()
    box_geom(base, (w, h, t), (0, 0, t / 2))
    obj = add_object("fragile_label_base", base, red, smooth=False)
    add_bevel(obj, 0.0022, 3)

    z0 = t  # mọi họa tiết nằm trên mặt tem
    ink = 0.00012

    # Viền trắng mảnh trong tem.
    frame = bmesh.new()
    box_geom(frame, (w - 0.006, 0.0007, ink), (0, h / 2 - 0.003, z0 + ink / 2))
    box_geom(frame, (w - 0.006, 0.0007, ink), (0, -h / 2 + 0.003, z0 + ink / 2))
    box_geom(frame, (0.0007, h - 0.006, ink), (w / 2 - 0.003, 0, z0 + ink / 2))
    box_geom(frame, (0.0007, h - 0.006, ink), (-w / 2 + 0.003, 0, z0 + ink / 2))
    add_object("fragile_label_frame", frame, white, smooth=False)

    # Biểu tượng ly rượu dạng phẳng (đài tam giác ngược + chân + đế), bên trái tem.
    gx = -0.0225
    glass = bmesh.new()
    prism(glass, [(gx - 0.0105, 0.0185), (gx + 0.0105, 0.0185), (gx, 0.0035)], z0, ink)   # đài ly
    prism(glass, [(gx - 0.0011, 0.0036), (gx + 0.0011, 0.0036), (gx + 0.0011, -0.0105), (gx - 0.0011, -0.0105)], z0, ink)  # chân
    prism(glass, [(gx - 0.0075, -0.0105), (gx + 0.0075, -0.0105), (gx + 0.0075, -0.0123), (gx - 0.0075, -0.0123)], z0, ink)  # đế
    # Vết nứt đỏ cắt ngang đài ly.
    add_object("fragile_label_glass", glass, white, smooth=False)
    crack = bmesh.new()
    prism(crack, [(gx - 0.0035, 0.0128), (gx - 0.0010, 0.0128), (gx + 0.0040, 0.0072), (gx + 0.0015, 0.0072)], z0 + ink, ink)
    add_object("fragile_label_crack", crack, red, smooth=False)

    # Chữ FRAGILE + dòng nhỏ HANDLE WITH CARE.
    for body, size, loc in (
        ("FRAGILE", 0.0108, (0.0105, 0.0075, z0 + 0.00003)),
        ("HANDLE WITH CARE", 0.0042, (0.0105, -0.0105, z0 + 0.00003)),
    ):
        mesh = text_mesh(body, size, loc)
        mesh.materials.append(white)
        label = bpy.data.objects.new(f"fragile_label_{body[:6].lower()}", mesh)
        bpy.context.scene.collection.objects.link(label)


# ---------------------------------------------------------------------------
# 4. Góc xốp bảo vệ (EPS corner) — 50 mm, 3 vách dày 8 mm
# ---------------------------------------------------------------------------
def build_foam_corner():
    foam = make_material("foam_eps", (0.93, 0.94, 0.95), roughness=0.95)
    s, t = 0.05, 0.008
    bm = bmesh.new()
    box_geom(bm, (t, s, s), (-s / 2 + t / 2, 0, s / 2))      # vách trái
    box_geom(bm, (s, t, s), (0, -s / 2 + t / 2, s / 2))      # vách trước
    box_geom(bm, (s, s, t), (0, 0, t / 2))                   # vách đáy
    obj = add_object("foam_corner", bm, foam, smooth=False)
    add_bevel(obj, 0.0016, 2)


# ---------------------------------------------------------------------------
# 5. Vách ngăn carton sóng (corrugated divider) — 300 x 200 mm, dày 4 mm
# ---------------------------------------------------------------------------
def build_corrugated_divider():
    kraft = make_material("kraft_card", (0.72, 0.55, 0.34), roughness=0.85)
    kraft_dark = make_material("kraft_flute", (0.62, 0.45, 0.26), roughness=0.9)
    w, d, t = 0.30, 0.20, 0.004

    liners = bmesh.new()
    box_geom(liners, (w, d, 0.0006), (0, 0, 0.0003))
    # Lớp giấy phẳng phía trên chỉ phủ phần lớn tấm, để lộ lớp sóng ở dải cuối (nhìn rõ cấu tạo carton sóng).
    box_geom(liners, (w, d - 0.05, 0.0006), (0, -0.025, t - 0.0003))
    add_object("divider_liners", liners, kraft, smooth=False)

    # Lớp sóng ở giữa: đường sin dọc trục X, kéo dài theo Y.
    period, amp = 0.0075, 0.0013
    samples = int(w / period) * 8
    flute = bmesh.new()
    rows = []
    for i in range(samples + 1):
        x = -w / 2 + w * i / samples
        z = t / 2 + amp * math.sin(2 * math.pi * (x + w / 2) / period)
        rows.append((flute.verts.new((x, -d / 2, z)), flute.verts.new((x, d / 2, z))))
    for a, b in zip(rows, rows[1:]):
        flute.faces.new((a[0], b[0], b[1], a[1]))
    obj = add_object("divider_flute", flute, kraft_dark, smooth=False)
    solid = obj.modifiers.new("solid", "SOLIDIFY")
    solid.thickness = 0.0004
    solid.offset = 0


# ---------------------------------------------------------------------------
# 6. Giấy kraft vò (độn lấp chỗ trống) — bóng giấy đường kính ~10 cm
# ---------------------------------------------------------------------------
def build_kraft_paper():
    kraft = make_material("kraft_paper", (0.74, 0.58, 0.38), roughness=0.92)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=5, radius=0.05)
    for v in bm.verts:
        p = v.co.copy()
        n = p.normalized()
        crease = noise.turbulence(p * 38.0, 3, False)
        lump = noise.noise(p * 14.0 + Vector((3.1, 1.7, 9.2)))
        v.co = n * (0.05 + 0.0085 * (crease - 0.5) + 0.006 * lump)
    for v in bm.verts:
        v.co.z += 0.05
    obj = add_object("kraft_paper_ball", bm, kraft, smooth=False)
    # Bẹp nhẹ đáy để đặt được xuống mặt phẳng.
    obj.data.transform(Matrix.Diagonal((1.0, 1.0, 0.82, 1.0)))


# ---------------------------------------------------------------------------
# 7. Giấy lót mỏng (tissue) — chồng 3 tờ 250 x 180 mm
# ---------------------------------------------------------------------------
def build_tissue_paper():
    tissue = make_material("tissue", (0.97, 0.95, 0.93), roughness=0.9)
    w, d = 0.25, 0.18
    nx, ny = 36, 26
    for k in range(3):
        bm = bmesh.new()
        verts = []
        for ix in range(nx + 1):
            col = []
            for iy in range(ny + 1):
                x = -w / 2 + w * ix / nx
                y = -d / 2 + d * iy / ny
                z = 0.0004 + k * 0.0016 + 0.0028 * noise.noise(Vector((x * 24 + k * 7, y * 24, k * 3.3)))
                col.append(bm.verts.new((x, y, max(0.0002, z))))
            verts.append(col)
        for ix in range(nx):
            for iy in range(ny):
                bm.faces.new((verts[ix][iy], verts[ix + 1][iy], verts[ix + 1][iy + 1], verts[ix][iy + 1]))
        add_object(f"tissue_sheet_{k + 1}", bm, tissue, smooth=True)


# ---------------------------------------------------------------------------
# 8. Cuộn băng keo — vành ngoài 76 mm, bản rộng 48 mm
# ---------------------------------------------------------------------------
def build_tape_roll():
    tape = make_material("tape_body", (0.80, 0.62, 0.35), roughness=0.35, alpha=0.78)
    core = make_material("tape_core", (0.70, 0.55, 0.36), roughness=0.9)
    width = 0.048

    def ring(name, r_in, r_out, mat, smooth=True):
        bm = bmesh.new()
        pts = [(r_in, 0, 0), (r_out, 0, 0), (r_out, 0, width), (r_in, 0, width)]
        verts = [bm.verts.new(p) for p in pts]
        bm.faces.new(verts)
        bmesh.ops.spin(
            bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), cent=(0, 0, 0),
            axis=(0, 0, 1), dvec=(0, 0, 0), angle=math.radians(360), steps=56, use_merge=True,
        )
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return add_object(name, bm, mat, smooth)

    ring("tape_roll_body", 0.0265, 0.038, tape)
    ring("tape_roll_core", 0.0245, 0.0268, core)


# ---------------------------------------------------------------------------
# 9. Hộp phụ kiện (hộp kính / hộp quà nhỏ) — 160 x 60 x 80 mm, dùng cho loại hàng `accessory`
# ---------------------------------------------------------------------------
def build_accessory_case():
    shell = make_material("case_shell", (0.2, 0.27, 0.36), roughness=0.55)
    trim = make_material("case_trim", (0.82, 0.85, 0.9), roughness=0.3, metallic=0.6)
    seam_mat = make_material("case_seam", (0.08, 0.1, 0.14), roughness=0.9)
    # Hệ Blender: x = dài, y = rộng (mặt trước là +y), z = cao.
    length, width, height = 0.16, 0.08, 0.06
    lid_h = 0.022
    base_h = height - lid_h - 0.0012

    base = bmesh.new()
    box_geom(base, (length, width, base_h), (0, 0, base_h / 2))
    obj = add_object("case_base", base, shell, smooth=False)
    add_bevel(obj, 0.003, 3)

    lid = bmesh.new()
    box_geom(lid, (length, width, lid_h), (0, 0, height - lid_h / 2))
    obj = add_object("case_lid", lid, shell, smooth=False)
    add_bevel(obj, 0.003, 3)

    seam = bmesh.new()  # khe giữa nắp và thân
    box_geom(seam, (length - 0.002, width - 0.002, 0.0012), (0, 0, base_h + 0.0006))
    add_object("case_seam", seam, seam_mat, smooth=False)

    clasp = bmesh.new()  # khoá gài phía trước
    box_geom(clasp, (0.026, 0.003, 0.02), (0, width / 2 + 0.0008, base_h - 0.002))
    obj = add_object("case_clasp", clasp, trim, smooth=False)
    add_bevel(obj, 0.0008, 2)

    hinge = bmesh.new()  # bản lề phía sau
    for hx in (-0.045, 0.045):
        box_geom(hinge, (0.02, 0.003, 0.014), (hx, -width / 2 - 0.0008, base_h - 0.002))
    add_object("case_hinge", hinge, trim, smooth=False)


MODELS = {
    "bubble_wrap": build_bubble_wrap,
    "air_pillow": build_air_pillow,
    "fragile_label": build_fragile_label,
    "foam_corner": build_foam_corner,
    "corrugated_divider": build_corrugated_divider,
    "kraft_paper": build_kraft_paper,
    "tissue_paper": build_tissue_paper,
    "tape_roll": build_tape_roll,
    "accessory_case": build_accessory_case,
}


# ---------------------------------------------------------------------------
# Xuất GLB + ảnh xem trước
# ---------------------------------------------------------------------------
def export_glb(path):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,       # áp modifier (bevel, solidify)
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )


def render_preview(path):
    scene = bpy.context.scene
    objs = [o for o in scene.objects if o.type == "MESH"]
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center = (lo + hi) / 2
    radius = max((hi - lo).length / 2, 0.01)

    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    direction = Vector((1.0, -1.25, 0.9)).normalized()
    cam.location = center + direction * radius * 3.1
    look = (center - cam.location).to_track_quat("-Z", "Y")
    cam.rotation_euler = look.to_euler()
    scene.camera = cam

    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = 640
    scene.render.resolution_y = 480
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("w")
    scene.world.color = (0.82, 0.84, 0.88)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    out_dir, preview_dir = parse_args()
    os.makedirs(out_dir, exist_ok=True)
    if preview_dir:
        os.makedirs(preview_dir, exist_ok=True)
    for name, builder in MODELS.items():
        reset_scene()
        builder()
        export_glb(os.path.join(out_dir, f"{name}.glb"))
        tris = sum(len(p.vertices) - 2 for o in bpy.context.scene.objects if o.type == "MESH" for p in o.data.polygons)
        print(f"[ok] {name}.glb  (~{tris} tam giác)")
        if preview_dir:
            render_preview(os.path.join(preview_dir, f"{name}.png"))


main()
