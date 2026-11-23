/**
 * PNSB website - real-time 3D machined parts (three.js, procedural geometry).
 *
 * Loaded as a native ES module (outside Odoo's asset bundle) so it starts as
 * soon as the page is parsed. It only appends a <canvas> to elements marked
 * [data-pnsb-3d] and toggles classes; it never runs inside the website
 * builder (iframe) so nothing it does can be saved into a page.
 *
 *   data-pnsb-3d="turntable" home hero: PNSB's work on a turntable (small turned
 *                            pins, large machined shafts, a fabricated frame,
 *                            surface-treated parts), drag to rotate, part list
 *                            in [data-pnsb-turntable]
 *   data-pnsb-3d="process"   how we work: concept -> prototype -> production,
 *                            driven by the [data-pnsb-step] items (auto-plays)
 *   data-pnsb-3d="seal" | "sprocket" | "honeycomb" | "pulley"   single parts
 *
 * Every part is one PNSB makes (company profile and the client's photos):
 * timing pulleys, chain sprockets, mechanical seals, shafts, honeycomb
 * air-straightening screens, turned pins, sheet-metal frames, plated parts.
 */
import * as THREE from "../../lib/three/three.module.min.js";

const html = document.documentElement;
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOBILE = window.matchMedia("(max-width: 640px)").matches;
const TAU = Math.PI * 2;

function webglAvailable() {
    try {
        const canvas = document.createElement("canvas");
        return !!(window.WebGLRenderingContext && (canvas.getContext("webgl2") || canvas.getContext("webgl")));
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
function makeMaterials() {
    return {
        steel: new THREE.MeshPhysicalMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.24 }),
        steelDark: new THREE.MeshPhysicalMaterial({ color: 0xa9b0ba, metalness: 1, roughness: 0.32 }),
        blue: new THREE.MeshPhysicalMaterial({
            color: 0x2d62de, metalness: 0.75, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25,
        }),
        graphite: new THREE.MeshPhysicalMaterial({ color: 0x2a2f38, metalness: 0.7, roughness: 0.38 }),
        brass: new THREE.MeshPhysicalMaterial({ color: 0xd2ab62, metalness: 1, roughness: 0.28 }),
        aluminium: new THREE.MeshPhysicalMaterial({ color: 0xd8dce2, metalness: 1, roughness: 0.36 }),
        bronze: new THREE.MeshPhysicalMaterial({ color: 0xa08560, metalness: 1, roughness: 0.46 }),
        ptfe: new THREE.MeshPhysicalMaterial({ color: 0xf3f1ec, metalness: 0, roughness: 0.55, clearcoat: 0.2 }),
        clay: new THREE.MeshStandardMaterial({ color: 0xd3d9e2, metalness: 0, roughness: 0.85 }),
        copper: new THREE.MeshPhysicalMaterial({ color: 0xc9805a, metalness: 1, roughness: 0.3 }),
        gold: new THREE.MeshPhysicalMaterial({ color: 0xe3b552, metalness: 1, roughness: 0.22 }),
        hole: new THREE.MeshStandardMaterial({ color: 0x151a22, metalness: 0.2, roughness: 0.8, side: THREE.DoubleSide }),
    };
}

// Studio lighting baked into an environment map (soft boxes in a white room),
// which is what makes metal read as metal.
function studioEnvironment(renderer) {
    const env = new THREE.Scene();
    const room = new THREE.Mesh(
        new THREE.BoxGeometry(12, 8, 12),
        new THREE.MeshBasicMaterial({ color: 0xbfc5ce, side: THREE.BackSide })
    );
    env.add(room);
    const panel = (w, h, x, y, z, ry, rx, intensity) => {
        const m = new THREE.Mesh(
            new THREE.PlaneGeometry(w, h),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity, intensity) })
        );
        m.position.set(x, y, z);
        m.rotation.set(rx || 0, ry || 0, 0);
        env.add(m);
    };
    panel(6, 1.2, 0, 3.9, 0, 0, Math.PI / 2, 6); // ceiling strip
    panel(3, 5, -5.9, 0.5, 0, Math.PI / 2, 0, 3.5); // left soft box
    panel(3, 5, 5.9, 0.5, -1, -Math.PI / 2, 0, 2.2); // right soft box
    panel(5, 2, 0, 0.8, -5.9, 0, 0, 1.6); // back
    panel(4, 1, 0, -3.9, 0, 0, -Math.PI / 2, 0.6); // floor bounce
    // A cool blue card for brand-colored reflections.
    const blue = new THREE.Mesh(new THREE.PlaneGeometry(2, 4), new THREE.MeshBasicMaterial({ color: 0x3a6cf0 }));
    blue.position.set(5.9, 0.5, 3);
    blue.rotation.y = -Math.PI / 2;
    env.add(blue);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const texture = pmrem.fromScene(env, 0.035).texture;
    pmrem.dispose();
    return texture;
}

// Soft contact shadow: a blurred radial gradient on a plane.
function contactShadow(size = 4, opacity = 0.35) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(13,26,46,0.55)");
    g.addColorStop(0.45, "rgba(13,26,46,0.18)");
    g.addColorStop(1, "rgba(13,26,46,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, opacity, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
}

// ---------------------------------------------------------------------------
// Procedural parts (units: roughly 1 = 50 mm)
// ---------------------------------------------------------------------------
const CURVE = MOBILE ? 18 : 28;

function circlePath(r, x = 0, y = 0) {
    const p = new THREE.Path();
    p.absarc(x, y, r, 0, TAU, true);
    return p;
}

function extrude(shape, depth, bevel = 0.025) {
    const geo = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: bevel > 0,
        bevelThickness: bevel,
        bevelSize: bevel * 0.8,
        bevelSegments: 2,
        curveSegments: CURVE,
    });
    geo.translate(0, 0, -depth / 2);
    geo.computeVertexNormals();
    return geo;
}

function gearGeometry({ teeth, radius, toothDepth, bore, depth, windows = 0 }) {
    const shape = new THREE.Shape();
    const rRoot = radius - toothDepth;
    const step = TAU / teeth;
    for (let i = 0; i < teeth; i++) {
        const a = i * step;
        const pts = [
            [rRoot, a],
            [rRoot, a + step * 0.12],
            [radius - toothDepth * 0.15, a + step * 0.26],
            [radius, a + step * 0.34],
            [radius, a + step * 0.5],
            [radius - toothDepth * 0.15, a + step * 0.58],
            [rRoot, a + step * 0.72],
        ];
        pts.forEach(([r, ang], j) => {
            const x = r * Math.cos(ang);
            const y = r * Math.sin(ang);
            if (i === 0 && j === 0) {
                shape.moveTo(x, y);
            } else {
                shape.lineTo(x, y);
            }
        });
    }
    shape.closePath();
    shape.holes.push(circlePath(bore));
    if (windows) {
        const rw = (rRoot + bore) / 2;
        const wr = (rRoot - bore) * 0.26;
        for (let i = 0; i < windows; i++) {
            const a = (i / windows) * TAU + step / 2;
            shape.holes.push(circlePath(wr, rw * Math.cos(a), rw * Math.sin(a)));
        }
    }
    return extrude(shape, depth, 0.02);
}

function hubGeometry(rOuter, rInner, length) {
    const pts = [
        new THREE.Vector2(rInner, -length / 2),
        new THREE.Vector2(rOuter - 0.03, -length / 2),
        new THREE.Vector2(rOuter, -length / 2 + 0.03),
        new THREE.Vector2(rOuter, length / 2 - 0.03),
        new THREE.Vector2(rOuter - 0.03, length / 2),
        new THREE.Vector2(rInner, length / 2),
        new THREE.Vector2(rInner, -length / 2),
    ];
    const geo = new THREE.LatheGeometry(pts, CURVE * 2);
    geo.rotateX(Math.PI / 2); // axis along Z like the extrusions
    return geo;
}

function hexNut(material, r = 0.42, bore = 0.2, depth = 0.34) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + Math.PI / 6;
        const x = r * Math.cos(a);
        const y = r * Math.sin(a);
        if (i === 0) {
            shape.moveTo(x, y);
        } else {
            shape.lineTo(x, y);
        }
    }
    shape.closePath();
    shape.holes.push(circlePath(bore));
    return new THREE.Mesh(extrude(shape, depth, 0.04), material);
}

function bearing(materials, r = 0.95, width = 0.42) {
    const group = new THREE.Group();
    const ring = (rIn, rOut) => {
        const w = width / 2;
        const pts = [
            new THREE.Vector2(rIn, -w),
            new THREE.Vector2(rOut - 0.03, -w),
            new THREE.Vector2(rOut, -w + 0.03),
            new THREE.Vector2(rOut, w - 0.03),
            new THREE.Vector2(rOut - 0.03, w),
            new THREE.Vector2(rIn, w),
        ];
        pts.push(new THREE.Vector2(rIn, -w));
        const g = new THREE.LatheGeometry(pts, CURVE * 2);
        g.rotateX(Math.PI / 2);
        return g;
    };
    const outer = new THREE.Mesh(ring(r * 0.8, r), materials.steel);
    const inner = new THREE.Mesh(ring(r * 0.36, r * 0.52), materials.steel);
    group.add(outer, inner);
    const cage = new THREE.Mesh(
        new THREE.TorusGeometry(r * 0.66, 0.035, 8, CURVE * 2),
        materials.brass
    );
    group.add(cage);
    const balls = new THREE.Group();
    const n = 11;
    const ballGeo = new THREE.SphereGeometry(r * 0.13, 20, 14);
    for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const b = new THREE.Mesh(ballGeo, materials.steelDark);
        b.position.set(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66, 0);
        balls.add(b);
    }
    group.add(balls);
    group.userData.inner = inner;
    group.userData.balls = balls;
    return group;
}

function pulleyParts(materials, scale = 1) {
    // Timing pulley, shaft, key and bearing: the assembly used in the process story.
    const parts = {};
    const toothCount = 24;
    const pulley = new THREE.Group();
    pulley.add(new THREE.Mesh(
        gearGeometry({ teeth: toothCount, radius: 0.92 * scale, toothDepth: 0.08 * scale, bore: 0.22 * scale, depth: 0.62 * scale }),
        materials.aluminium
    ));
    const flange = (z) => {
        const f = new THREE.Mesh(hubGeometry(1.06 * scale, 0.22 * scale, 0.06 * scale), materials.aluminium);
        f.position.z = z;
        return f;
    };
    pulley.add(flange(0.36 * scale), flange(-0.36 * scale));
    const hub = new THREE.Mesh(hubGeometry(0.42 * scale, 0.22 * scale, 0.5 * scale), materials.aluminium);
    hub.position.z = 0.6 * scale;
    pulley.add(hub);
    parts.pulley = pulley;

    const shaftPts = [
        [0, -2.1], [0.2, -2.1], [0.22, -2.08], [0.22, -0.9], [0.26, -0.88], [0.26, 0.9],
        [0.22, 0.92], [0.22, 2.08], [0.2, 2.1], [0, 2.1],
    ].map(([r, z]) => new THREE.Vector2(r * scale, z * scale));
    const shaftGeo = new THREE.LatheGeometry(shaftPts, CURVE);
    shaftGeo.rotateX(Math.PI / 2);
    parts.shaft = new THREE.Mesh(shaftGeo, materials.steel);

    parts.key = new THREE.Mesh(new THREE.BoxGeometry(0.1 * scale, 0.1 * scale, 0.7 * scale), materials.steelDark);
    parts.bearingA = bearing(materials, 0.62 * scale, 0.3 * scale);
    parts.bearingB = bearing(materials, 0.62 * scale, 0.3 * scale);
    parts.nut = hexNut(materials.graphite, 0.36 * scale, 0.2 * scale, 0.22 * scale);
    return parts;
}


class Helix extends THREE.Curve {
    constructor(radius, length, turns) {
        super();
        this.radius = radius;
        this.length = length;
        this.turns = turns;
    }

    getPoint(t, target = new THREE.Vector3()) {
        const a = t * this.turns * TAU;
        return target.set(Math.cos(a) * this.radius, Math.sin(a) * this.radius, (t - 0.5) * this.length);
    }
}

function ringGeometry(rIn, rOut, width, chamfer = 0.025) {
    const w = width / 2;
    const pts = [
        new THREE.Vector2(rIn, -w),
        new THREE.Vector2(rOut - chamfer, -w),
        new THREE.Vector2(rOut, -w + chamfer),
        new THREE.Vector2(rOut, w - chamfer),
        new THREE.Vector2(rOut - chamfer, w),
        new THREE.Vector2(rIn, w),
        new THREE.Vector2(rIn, -w),
    ];
    const g = new THREE.LatheGeometry(pts, CURVE * 2);
    g.rotateX(Math.PI / 2);
    return g;
}

function mechanicalSeal(materials, r = 1) {
    // Rotating seal head: seat ring, carbon face, spring, retainer and sleeve.
    const group = new THREE.Group();
    const seat = new THREE.Mesh(ringGeometry(r * 0.55, r, r * 0.32), materials.steel);
    seat.position.z = r * 0.95;
    const face = new THREE.Mesh(ringGeometry(r * 0.56, r * 0.86, r * 0.16), materials.graphite);
    face.position.z = r * 0.7;
    const spring = new THREE.Mesh(
        new THREE.TubeGeometry(new Helix(r * 0.72, r * 1.05, 5.5), 260, r * 0.05, 10, false),
        materials.steel
    );
    spring.position.z = 0;
    const retainer = new THREE.Mesh(ringGeometry(r * 0.55, r * 0.9, r * 0.24), materials.steelDark);
    retainer.position.z = -r * 0.66;
    const sleeve = new THREE.Mesh(ringGeometry(r * 0.46, r * 0.55, r * 2.2, 0.01), materials.steel);
    group.add(seat, face, spring, retainer, sleeve);
    group.userData.rotating = [face, spring, retainer, sleeve];
    return group;
}

function sprocket(materials) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(
        gearGeometry({ teeth: 18, radius: 1.25, toothDepth: 0.2, bore: 0.32, depth: 0.22 }),
        materials.bronze
    ));
    group.add(new THREE.Mesh(hubGeometry(0.62, 0.32, 0.62), materials.bronze));
    const washer = new THREE.Mesh(ringGeometry(0.34, 0.62, 0.08), materials.ptfe);
    washer.position.z = -0.42;
    group.add(washer);
    return group;
}

function honeycombPanel(materials) {
    // Air-straightening unit: hexagonal cells in a sheet-metal frame.
    const group = new THREE.Group();
    const cell = 0.2; // across corners / 2
    const wall = 0.018;
    const hex = (r) => {
        const sh = new THREE.Shape();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU;
            const x = r * Math.cos(a);
            const y = r * Math.sin(a);
            if (i === 0) {
                sh.moveTo(x, y);
            } else {
                sh.lineTo(x, y);
            }
        }
        sh.closePath();
        return sh;
    };
    const outer = hex(cell);
    const inner = hex(cell - wall);
    outer.holes.push(new THREE.Path(inner.getPoints()));
    const cellGeo = new THREE.ExtrudeGeometry(outer, { depth: 0.5, bevelEnabled: false });
    cellGeo.translate(0, 0, -0.25);
    const cols = MOBILE ? 9 : 11;
    const rows = MOBILE ? 7 : 9;
    const dx = cell * 1.5;
    const dy = cell * Math.sqrt(3);
    const mesh = new THREE.InstancedMesh(cellGeo, materials.steel, cols * rows);
    const m4 = new THREE.Matrix4();
    let k = 0;
    const w = (cols - 1) * dx;
    const h = (rows - 1) * dy;
    for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
            const x = c * dx - w / 2;
            const y = r * dy + (c % 2 ? dy / 2 : 0) - h / 2 - dy / 4;
            m4.makeTranslation(x, y, 0);
            mesh.setMatrixAt(k++, m4);
        }
    }
    group.add(mesh);
    const fw = w / 2 + cell + 0.1;
    const fh = h / 2 + cell + 0.12;
    const frame = new THREE.Shape();
    frame.moveTo(-fw - 0.12, -fh - 0.12);
    frame.lineTo(fw + 0.12, -fh - 0.12);
    frame.lineTo(fw + 0.12, fh + 0.12);
    frame.lineTo(-fw - 0.12, fh + 0.12);
    frame.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-fw, -fh);
    hole.lineTo(-fw, fh);
    hole.lineTo(fw, fh);
    hole.lineTo(fw, -fh);
    hole.closePath();
    frame.holes.push(hole);
    group.add(new THREE.Mesh(extrude(frame, 0.62, 0.015), materials.steelDark));
    return group;
}

// --- Hero models (client's order, 2026-11) ----------------------------------
// Turned part: profile [[radius, y], ...] from the bottom face to the top face,
// revolved around Y.
function turned(profile, material) {
    const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), CURVE * 2);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, material);
}

// Thread crests (a saw-tooth profile) on radius r between y0 and y1.
function thread(r, y0, y1, pitch = 0.05, depth = 0.022) {
    const pts = [];
    for (let y = y0; y < y1 - pitch / 2; y += pitch) {
        pts.push([r - depth, y], [r, y + pitch / 2]);
    }
    pts.push([r - depth, y1]);
    return pts;
}

// A drilled hole seen on a surface (dark disc); faces +Z unless rotated.
function holeDisc(materials, r) {
    return new THREE.Mesh(new THREE.CircleGeometry(r, 24), materials.hole);
}

function roundedRect(x, y, w, h, r, path = new THREE.Path()) {
    path.moveTo(x + r, y);
    path.lineTo(x + w - r, y);
    path.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    path.lineTo(x + w, y + h - r);
    path.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    path.lineTo(x + r, y + h);
    path.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    path.lineTo(x, y + r);
    path.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    return path;
}

// Rounded window centred on (cx, cy).
const windowPath = (cx, cy, w, h, r) => roundedRect(cx - w / 2, cy - h / 2, w, h, r);

function rectShape(x0, y0, x1, y1) {
    const s = new THREE.Shape();
    s.moveTo(x0, y0);
    s.lineTo(x1, y0);
    s.lineTo(x1, y1);
    s.lineTo(x0, y1);
    s.closePath();
    return s;
}

// Flat part cut from plate: shape in XY, laid on the ground (thickness up).
function plate(shape, thickness, material, spin = 0) {
    const mesh = new THREE.Mesh(extrude(shape, thickness, 0.012), material);
    mesh.rotation.set(-Math.PI / 2, 0, spin);
    mesh.position.y = thickness / 2;
    return mesh;
}

/** 01 Small pin & turning items: pins, studs and threaded parts standing in a row. */
function smallTurnedItems(m) {
    const g = new THREE.Group();
    const stand = (profile, material, x, z) => {
        const mesh = turned(profile, material);
        mesh.position.set(x, 0, z);
        g.add(mesh);
        return mesh;
    };
    // Stepped sleeve pin with a bore in the top.
    stand([[0, 0], [0.15, 0], [0.165, 0.015], [0.165, 0.85], [0.15, 0.87], [0.12, 0.9], [0.12, 2.24],
        [0.11, 2.28], [0.06, 2.28], [0.06, 2.18], [0, 2.18]], m.steel, -0.95, -0.05);
    // Flanged bolt, threaded end.
    stand([[0, 0], [0.2, 0], [0.21, 0.02], [0.21, 0.08], [0.19, 0.1], [0.12, 0.11], [0.12, 1.5],
        ...thread(0.12, 1.52, 1.98, 0.06, 0.024), [0.1, 2.0], [0.08, 2.02], [0, 2.02]], m.steel, -0.48, -0.3);
    // Stud with a grooved collar.
    stand([[0, 0], [0.2, 0], [0.22, 0.03], [0.22, 0.15], [0.13, 0.26], [0.22, 0.37], [0.24, 0.4], [0.24, 0.52],
        [0.22, 0.54], [0.09, 0.58], [0.09, 0.92], [0.11, 0.94], ...thread(0.11, 0.96, 1.5),
        [0.09, 1.52], [0, 1.53]], m.steel, 0.02, -0.38);
    // Slim black-oxide pin.
    stand([[0, 0], [0.1, 0], [0.105, 0.02], [0.105, 0.1], [0.075, 0.12], [0.075, 1.18],
        ...thread(0.075, 1.2, 1.56, 0.045, 0.018), [0.055, 1.58], [0, 1.58]], m.graphite, 0.48, -0.25);
    // Bullet nozzle with a cross hole.
    const dome = [];
    for (let i = 1; i <= 8; i++) {
        const a = (i / 8) * (Math.PI / 2);
        dome.push([0.13 * Math.cos(a), 0.42 + 0.16 * Math.sin(a)]);
    }
    stand([[0, 0], [0.12, 0], [0.13, 0.02], [0.13, 0.42], ...dome], m.steel, 0.92, -0.02);
    const cross = holeDisc(m, 0.035);
    cross.position.set(0.92, 0.14, 0.131);
    g.add(cross);
    // Double-ended stud with a hex collar, lying in front.
    const stud = new THREE.Group();
    stud.add(turned([[0, 0], [0.07, 0], ...thread(0.07, 0.02, 0.56, 0.04, 0.016), [0.06, 0.58], [0.06, 0.68],
        ...thread(0.07, 0.7, 1.22, 0.04, 0.016), [0.05, 1.24], [0, 1.24]], m.steel));
    const hex = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 6), m.steel);
    hex.position.y = 0.63;
    stud.add(hex);
    stud.rotation.z = Math.PI / 2;
    stud.position.set(0.62, 0.13, 0.6);
    g.add(stud);
    g.scale.setScalar(1.15);
    g.position.y = -1.2;
    g.userData.view = { el: 0.16, y: 0.05 };
    return g;
}

/** One large turned shaft: hex end, shoulder, long neck, collar with cross holes, flange head. */
function largeShaft(m) {
    const g = new THREE.Group();
    g.add(turned([[0, 0.36], [0.2, 0.36], [0.26, 0.38], [0.26, 0.7], [0.24, 0.72], [0.17, 0.75], [0.17, 1.45],
        [0.2, 1.47], [0.45, 1.5], [0.47, 1.52], [0.47, 1.85], [0.45, 1.87], [0.4, 1.88], [0.4, 1.95],
        [0.45, 1.96], [0.5, 1.98], [0.5, 2.3], [0.48, 2.32], [0.13, 2.34], [0.13, 2.22], [0, 2.22]], m.steel));
    const hex = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.36, 6), m.steel);
    hex.position.y = 0.18;
    g.add(hex);
    const bore = holeDisc(m, 0.08);
    bore.rotation.x = Math.PI / 2;
    bore.position.y = -0.002;
    const cross = holeDisc(m, 0.07);
    cross.rotation.y = Math.PI / 2;
    cross.position.set(0.472, 1.68, 0);
    const pin = holeDisc(m, 0.045);
    pin.position.set(0, 2.14, 0.502);
    g.add(bore, cross, pin);
    return g;
}

/** 02 Large machine items: two large machined shafts lying crossed. */
function largeMachinedItems(m) {
    const g = new THREE.Group();
    const lay = (dir, x, z, turn) => {
        const holder = new THREE.Group();
        const shaft = largeShaft(m);
        shaft.rotation.z = dir * Math.PI / 2;
        shaft.position.set(dir * 1.17, 0.5, 0);
        holder.add(shaft);
        holder.rotation.y = turn;
        holder.position.set(x, 0, z);
        g.add(holder);
    };
    lay(1, -0.1, 0.5, 0.2);
    lay(-1, 0.15, -0.55, -0.35);
    g.scale.setScalar(0.74);
    g.position.y = -0.5;
    g.userData.view = { el: 0.34, y: -0.1 };
    return g;
}

/** Sheet panel in XY (bottom edge on y = 0) with cut-outs, `t` thick along Z. */
function sheetPanel(w, h, holes, material, t = 0.04) {
    const s = rectShape(-w / 2, 0, w / 2, h);
    holes.forEach((hole) => s.holes.push(hole));
    return new THREE.Mesh(extrude(s, t, 0.006), material);
}

/** 03 Fabrication with assembly: open sheet-metal frame with cut-outs on a base plate. */
function fabricatedFrame(m) {
    const g = new THREE.Group();
    const W = 2.5;
    const D = 1.4;
    const H = 1.05;
    const base = rectShape(-1.65, -1.05, 1.65, 1.05);
    [-1.4, -0.7, 0, 0.7, 1.4].forEach((x) => {
        base.holes.push(circlePath(0.035, x, 0.93), circlePath(0.035, x, -0.93));
    });
    g.add(plate(base, 0.05, m.steelDark));
    const y0 = 0.05;
    const small = (x, y) => circlePath(0.035, x, y);
    const front = sheetPanel(W, H, [
        windowPath(-0.75, 0.5, 0.5, 0.62, 0.06), windowPath(-0.15, 0.55, 0.2, 0.55, 0.05),
        windowPath(0.25, 0.9, 0.5, 0.06, 0.03), circlePath(0.17, 0.82, 0.55), circlePath(0.1, 0.82, 0.2),
        small(0.35, 0.25), small(0.35, 0.55), small(1.1, 0.9), small(1.1, 0.15), small(-1.1, 0.9), small(-1.1, 0.15),
    ], m.steel);
    front.position.set(0, y0, D / 2);
    const back = sheetPanel(W, H, [
        windowPath(-0.55, 0.92, 1.1, 0.06, 0.03), windowPath(0.6, 0.92, 0.7, 0.06, 0.03),
        windowPath(0, 0.45, 1.6, 0.45, 0.08), small(1.1, 0.15), small(-1.1, 0.15),
    ], m.steel);
    back.position.set(0, y0, -D / 2);
    g.add(front, back);
    [-1, 1].forEach((side) => {
        const end = sheetPanel(D, H, [
            windowPath(0, 0.5, 0.62, 0.5, 0.08), circlePath(0.11, -0.47, 0.78), circlePath(0.11, 0.47, 0.78),
            circlePath(0.08, -0.47, 0.25), circlePath(0.08, 0.47, 0.25),
        ], m.steel);
        end.rotation.y = Math.PI / 2;
        end.position.set(side * W / 2, y0, 0);
        g.add(end);
        // Bent-over top lips.
        const lipLong = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, 0.2), m.steel);
        lipLong.position.set(0, y0 + H, side * (D / 2 - 0.1));
        const lipEnd = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, D - 0.4), m.steel);
        lipEnd.position.set(side * (W / 2 - 0.1), y0 + H, 0);
        g.add(lipLong, lipEnd);
    });
    g.position.y = -0.62;
    g.userData.view = { el: 0.5, y: -0.12 };
    return g;
}

/** 04 Surface treatment with assembly: copper, gold-plated and steel parts laid out. */
function surfaceTreatedItems(m) {
    const g = new THREE.Group();
    const add = (mesh, x, z, y = mesh.position.y) => {
        mesh.position.set(x, y, z);
        g.add(mesh);
        return mesh;
    };
    // Copper cylinder with a square pocket and four tapped holes.
    const cyl = new THREE.Shape();
    cyl.absarc(0, 0, 0.55, 0, TAU, false);
    cyl.holes.push(windowPath(0, 0, 0.42, 0.42, 0.04));
    for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        cyl.holes.push(circlePath(0.05, 0.43 * Math.cos(a), 0.43 * Math.sin(a)));
    }
    add(plate(cyl, 0.75, m.copper, 0.3), -0.85, -0.35);
    // Gold-plated block with a window and tapped holes, standing.
    const block = rectShape(-0.38, 0, 0.38, 0.86);
    block.holes.push(windowPath(0, 0.43, 0.42, 0.36, 0.04));
    [[-0.27, 0.12], [0.27, 0.12], [-0.27, 0.74], [0.27, 0.74]].forEach(([x, y]) => block.holes.push(circlePath(0.05, x, y)));
    const blockMesh = new THREE.Mesh(extrude(block, 0.46, 0.015), m.gold);
    blockMesh.rotation.y = -0.3;
    add(blockMesh, 0.1, -0.6, 0);
    // Steel flanged bushing.
    const flange = new THREE.Shape();
    flange.absarc(0, 0, 0.6, 0, TAU, false);
    flange.holes.push(circlePath(0.26));
    for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        flange.holes.push(circlePath(0.06, 0.45 * Math.cos(a), 0.45 * Math.sin(a)));
    }
    add(plate(flange, 0.12, m.steel), 1.0, -0.15);
    add(turned([[0.25, 0.12], [0.34, 0.12], [0.34, 1.0], [0.32, 1.02], [0.25, 1.02], [0.25, 0.12]], m.steel), 1.0, -0.15, 0);
    // Gold-plated star wheel with a threaded bore.
    const star = new THREE.Mesh(gearGeometry({ teeth: 6, radius: 0.36, toothDepth: 0.14, bore: 0.11, depth: 0.2 }), m.gold);
    star.rotation.set(-Math.PI / 2, 0, 0.4);
    add(star, 0.05, 0.42, 0.1);
    // Copper block with six tapped holes.
    const bar = rectShape(-0.45, -0.26, 0.45, 0.26);
    [-0.28, 0, 0.28].forEach((x) => bar.holes.push(circlePath(0.06, x, 0.11), circlePath(0.06, x, -0.11)));
    add(plate(bar, 0.32, m.copper, 0.15), -0.85, 0.65);
    // Steel plate bracket.
    const bracket = new THREE.Shape();
    bracket.moveTo(-0.6, -0.32);
    bracket.lineTo(0.62, -0.32);
    bracket.lineTo(0.62, -0.06);
    bracket.lineTo(0.05, 0.48);
    bracket.lineTo(-0.6, 0.48);
    bracket.closePath();
    bracket.holes.push(circlePath(0.17, -0.2, 0.08), windowPath(0.32, -0.12, 0.32, 0.22, 0.06),
        circlePath(0.06, -0.45, 0.33), circlePath(0.06, -0.45, -0.18));
    add(plate(bracket, 0.08, m.steel, -0.2), 0.9, 0.62);
    g.position.y = -0.58;
    g.userData.view = { el: 0.55, y: -0.15 };
    return g;
}

// Wireframe (CAD) twins for every mesh of an object, used by the
// Concept / Prototype / Production views.
function addEdges(obj, color = 0x1f52c4) {
    const meshes = [];
    // Instanced meshes (honeycomb cells) keep their material: one edge set can't follow instances.
    obj.traverse((o) => o.isMesh && !o.isInstancedMesh && meshes.push(o));
    meshes.forEach((mesh) => {
        mesh.userData.metal = mesh.material;
        const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(mesh.geometry, 28),
            new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0 })
        );
        mesh.add(edges);
        mesh.userData.edges = edges;
    });
    return meshes;
}

// ---------------------------------------------------------------------------
// Stage: renderer + camera + loop that only runs while visible
// ---------------------------------------------------------------------------
class Stage {
    constructor(container, { fov = 32, distance = 7 } = {}) {
        this.container = container;
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MOBILE ? 1.5 : 1.75));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.renderer.domElement.className = "pn-3d__canvas";
        this.renderer.domElement.setAttribute("aria-hidden", "true");
        this.scene = new THREE.Scene();
        this.scene.environment = studioEnvironment(this.renderer);
        this.camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
        this.camera.position.set(0, 0.6, distance);
        this.camera.lookAt(0, 0, 0);
        const key = new THREE.DirectionalLight(0xffffff, 1.2);
        key.position.set(3, 5, 4);
        this.scene.add(key, new THREE.AmbientLight(0xffffff, 0.25));
        this.materials = makeMaterials();
        this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
        this.visible = false;
        this.clock = new THREE.Clock();
        this.updaters = [];
        container.appendChild(this.renderer.domElement);
        this.resize();
        new ResizeObserver(() => this.resize()).observe(container);
        new IntersectionObserver((entries) => {
            this.visible = entries[0].isIntersecting;
            if (this.visible) {
                this.clock.getDelta();
                this.loop();
            }
        }, { rootMargin: "120px" }).observe(container);
    }

    resize() {
        const w = this.container.clientWidth || 1;
        const h = this.container.clientHeight || 1;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.onResize?.(w, h);
        this.render();
    }

    trackPointer(target = window) {
        target.addEventListener("pointermove", (ev) => {
            this.pointer.tx = (ev.clientX / window.innerWidth) * 2 - 1;
            this.pointer.ty = (ev.clientY / window.innerHeight) * 2 - 1;
        }, { passive: true });
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    loop() {
        if (!this.visible || this.running) {
            return;
        }
        this.running = true;
        const tick = () => {
            if (!this.visible) {
                this.running = false;
                return;
            }
            const dt = Math.min(this.clock.getDelta(), 0.05);
            this.pointer.x += (this.pointer.tx - this.pointer.x) * Math.min(1, dt * 3);
            this.pointer.y += (this.pointer.ty - this.pointer.y) * Math.min(1, dt * 3);
            this.updaters.forEach((fn) => fn(dt, this.clock.elapsedTime));
            this.render();
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }
}

function ready(container) {
    container.classList.add("is-3d-ready");
}

/** Horizontal drag rotates `target` around Y with inertia; vertical page scroll still works. */
function dragRotate(container, target, onGrab) {
    const state = { dragging: false, x: 0, velocity: 0 };
    container.addEventListener("pointerdown", (ev) => {
        state.dragging = true;
        state.x = ev.clientX;
        state.velocity = 0;
        container.classList.add("is-grabbing");
        onGrab?.();
    });
    window.addEventListener("pointermove", (ev) => {
        if (!state.dragging) {
            return;
        }
        const dx = ev.clientX - state.x;
        state.x = ev.clientX;
        state.velocity = dx * 0.008;
        target.rotation.y += state.velocity;
    }, { passive: true });
    const release = () => {
        state.dragging = false;
        container.classList.remove("is-grabbing");
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return (dt) => {
        if (!state.dragging && Math.abs(state.velocity) > 0.0001) {
            target.rotation.y += state.velocity;
            state.velocity *= Math.pow(0.9, dt * 60);
        }
        return state.dragging || Math.abs(state.velocity) > 0.002;
    };
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------
/**
 * Home hero: PNSB's work on a turntable. Auto-advances through the four
 * models, each one drawn in as a blue wireframe before turning to metal; the
 * camera rises for the flat layouts. Visitors can drag to rotate or pick an
 * item from the list.
 */
function turntableScene(container) {
    const wrap = container.closest("[data-pnsb-turntable]") || container;
    const buttons = [...wrap.querySelectorAll("[data-pnsb-part]")];
    const captions = [...wrap.querySelectorAll("[data-pnsb-part-caption]")];
    const stage = new Stage(container, { fov: 28, distance: 7.4 });
    const m = stage.materials;
    const pivot = new THREE.Group();
    pivot.position.y = 0.15;
    stage.scene.add(pivot);

    // Order and names match the part list in website_home.xml.
    const builders = [smallTurnedItems, largeMachinedItems, fabricatedFrame, surfaceTreatedItems].map(
        (build) => () => build(m)
    );
    const models = builders.map((build) => {
        const holder = new THREE.Group();
        const model = build();
        holder.add(model);
        holder.userData.model = model;
        holder.userData.meshes = addEdges(model, 0x1f52c4);
        holder.visible = false;
        pivot.add(holder);
        return holder;
    });

    const shadow = contactShadow(4.4, 0.22);
    shadow.position.y = -1.75;
    stage.scene.add(shadow);
    // Camera elevation (radians) and look-at height follow the active model.
    const DIST = 7.4;
    const view = { el: 0.16, y: 0.05 };
    // Invisible body while the wireframe draws in (edges are children of the mesh).
    const ghost = m.clay.clone();
    ghost.transparent = true;
    ghost.opacity = 0;
    ghost.depthWrite = false;

    const HOLD = 5.5; // seconds per part
    let current = -1;
    let enter = 1; // 0..1 entry animation of the current part
    let since = 0;
    let pausedUntil = 0;
    let clock = 0;

    const show = (index) => {
        if (index === current) {
            return;
        }
        if (current >= 0) {
            models[current].visible = false;
        }
        current = index;
        const holder = models[current];
        holder.visible = true;
        enter = 0;
        since = 0;
        buttons.forEach((btn, i) => {
            btn.classList.toggle("is-active", i === current);
            btn.setAttribute("aria-pressed", String(i === current));
        });
        captions.forEach((cap, i) => cap.classList.toggle("is-active", i === current));
        wrap.dataset.part = String(current);
    };
    buttons.forEach((btn, i) => btn.addEventListener("click", () => {
        show(i);
        pausedUntil = clock + 12;
    }));
    const dragging = dragRotate(container, pivot, () => (pausedUntil = clock + 8));
    container.addEventListener("pointerenter", () => (pausedUntil = Math.max(pausedUntil, clock + 2)));
    show(0);

    stage.updaters.push((dt, t) => {
        clock = t;
        const busy = dragging(dt);
        if (!REDUCED && !busy && clock > pausedUntil) {
            since += dt;
            if (since > HOLD) {
                show((current + 1) % models.length);
            }
        }
        const active = buttons[current];
        active?.style.setProperty("--p", REDUCED ? "1" : Math.min(1, since / HOLD).toFixed(3));

        // Entry: wireframe draws in, then the metal part fades through.
        enter = Math.min(1, enter + dt / 1.1);
        const holder = models[current];
        const model = holder.userData.model;
        const target = model.userData.view || { el: 0.08, y: 0 };
        const ease = REDUCED ? 1 : Math.min(1, dt * 2.4);
        view.el += (target.el - view.el) * ease;
        view.y += (target.y - view.y) * ease;
        stage.camera.position.set(0, Math.sin(view.el) * DIST, Math.cos(view.el) * DIST);
        stage.camera.lookAt(0, view.y, 0);
        shadow.position.y += (0.14 + model.position.y - shadow.position.y) * ease;
        const e = 1 - Math.pow(1 - enter, 3);
        holder.scale.setScalar(0.82 + 0.18 * e);
        holder.userData.meshes.forEach((mesh) => {
            mesh.material = enter > 0.45 ? mesh.userData.metal : ghost;
            mesh.userData.edges.material.opacity = enter < 0.45 ? 1 : Math.max(0, 1 - (enter - 0.45) * 2.4);
        });
        if (!REDUCED) {
            if (!busy) {
                pivot.rotation.y += dt * 0.28;
            }
            holder.userData.model.userData.spin?.(dt);
            pivot.position.y = 0.15 + Math.sin(t * 0.8) * 0.04;
        }
        pivot.rotation.x = stage.pointer.y * 0.08;
    });
    stage.render();
    stage.loop();
    ready(container);
}

function singlePartScene(container, kind) {
    const stage = new Stage(container, { fov: 30, distance: 6.4 });
    const m = stage.materials;
    const root = new THREE.Group();
    stage.scene.add(root);
    let spin = () => {};
    if (kind === "seal") {
        const seal = mechanicalSeal(m, 1.05);
        seal.rotation.set(-0.5, 0.85, 0);
        root.add(seal);
        spin = (dt) => seal.userData.rotating.forEach((o) => (o.rotation.z += dt * 0.45));
    } else if (kind === "sprocket") {
        const sp = sprocket(m);
        sp.rotation.set(-0.45, 0.55, 0);
        root.add(sp);
        spin = (dt) => (sp.rotation.z += dt * 0.3);
    } else if (kind === "honeycomb") {
        const panel = honeycombPanel(m);
        // Smaller and slightly lower: the sway brings the near corner towards the camera.
        panel.scale.setScalar(MOBILE ? 0.66 : 0.68);
        panel.position.y = -0.12;
        panel.rotation.set(-0.3, 0.55, 0);
        root.add(panel);
        spin = (dt, t) => (panel.rotation.y = 0.55 + Math.sin(t * 0.4) * 0.25);
    } else {
        const p = pulleyParts(m, 1.15);
        p.pulley.rotation.set(-0.4, 0.6, 0);
        root.add(p.pulley);
        spin = (dt) => (p.pulley.rotation.z += dt * 0.3);
    }
    const shadow = contactShadow(5, 0.24);
    shadow.position.y = -1.75;
    stage.scene.add(shadow);
    stage.trackPointer();
    stage.updaters.push((dt, t) => {
        if (!REDUCED) {
            spin(dt, t);
            root.position.y = Math.sin(t * 0.9) * 0.04;
        }
        root.rotation.y = stage.pointer.x * 0.25;
        root.rotation.x = stage.pointer.y * 0.14;
    });
    stage.render();
    stage.loop();
    ready(container);
}

/**
 * How we work: four steps drive the assembly from an exploded wireframe
 * (Understand) to the finished metal parts (Deliver). The steps auto-play
 * while the section is on screen; visitors can click any step. No scroll
 * pinning, so the page never feels stuck.
 */
function processScene(container) {
    const section = container.closest("[data-pnsb-process]") || container;
    const steps = [...section.querySelectorAll("[data-pnsb-step]")];
    const stage = new Stage(container, { fov: 30, distance: 9.6 });
    const m = stage.materials;
    const parts = pulleyParts(m, 1);
    const root = new THREE.Group();
    root.rotation.set(-0.3, 0.75, 0);
    root.position.x = -0.35;
    stage.scene.add(root);

    const layout = [
        [parts.shaft, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)],
        [parts.pulley, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1.15, 0)],
        [parts.key, new THREE.Vector3(0.27, 0, 0), new THREE.Vector3(0.9, 0.35, 0)],
        [parts.bearingA, new THREE.Vector3(0, 0, 1.45), new THREE.Vector3(0, 0, 1.05)],
        [parts.bearingB, new THREE.Vector3(0, 0, -1.45), new THREE.Vector3(0, 0, -1.05)],
        [parts.nut, new THREE.Vector3(0, 0, 1.92), new THREE.Vector3(0, -0.15, 1.05)],
    ];
    const items = layout.map(([obj, home, offset]) => {
        const meshes = addEdges(obj);
        root.add(obj);
        return { obj, home, offset, meshes };
    });
    const clay = m.clay;
    clay.transparent = true;
    const shadow = contactShadow(7, 0.28);
    shadow.position.y = -2.1;
    stage.scene.add(shadow);
    // Portrait screens: pull the camera back so the exploded parts stay in frame.
    stage.onResize = (w, h) => {
        const distance = w / h < 0.95 ? 9.6 / Math.max(0.62, w / h) * 0.95 : 9.6;
        stage.camera.position.set(0, 0.6, distance);
        stage.camera.lookAt(0, 0, 0);
    };
    stage.resize();

    // Progress targets per step: exploded wire, assembling wire, clay, metal.
    const TARGETS = [0.06, 0.36, 0.66, 1];
    const HOLD = 3.6;
    let step = -1;
    let target = 0;
    let shown = 0;
    let since = 0;
    let auto = !REDUCED;
    let inView = false;
    const setStep = (i) => {
        step = i;
        target = TARGETS[i];
        since = 0;
        steps.forEach((el, k) => {
            el.classList.toggle("is-active", k === i);
            el.setAttribute("aria-pressed", String(k === i));
            el.style.removeProperty("--p");
        });
        section.querySelectorAll("[data-pnsb-step-tab]").forEach((tab) => {
            tab.setAttribute("aria-pressed", String(Number(tab.getAttribute("data-pnsb-step-tab")) === i));
        });
        section.dataset.step = String(i);
    };
    section.querySelectorAll("[data-pnsb-step-tab]").forEach((tab) => {
        tab.addEventListener("click", () => {
            auto = false;
            setStep(Number(tab.getAttribute("data-pnsb-step-tab")));
        });
    });
    steps.forEach((el, i) => {
        el.addEventListener("click", () => {
            auto = false;
            setStep(i);
        });
        el.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                auto = false;
                setStep(i);
            }
        });
    });
    new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting;
        if (inView && auto && step === 3) {
            setStep(0);
        }
    }, { threshold: 0.35 }).observe(section);
    setStep(REDUCED ? 3 : 0);
    shown = target;

    const smooth = (a, b, x) => {
        const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
    };
    stage.updaters.push((dt, t) => {
        if (auto && inView) {
            since += dt;
            steps[step]?.style.setProperty("--p", Math.min(1, since / HOLD).toFixed(3));
            if (since > HOLD) {
                setStep((step + 1) % steps.length);
            }
        }
        shown += (target - shown) * Math.min(1, dt * 2.6);
        const p = shown;
        const explode = 1 - smooth(0.18, 0.5, p);
        const wire = 1 - smooth(0.42, 0.58, p);
        const metal = smooth(0.7, 0.86, p);
        items.forEach(({ obj, home, offset, meshes }) => {
            obj.position.copy(home).addScaledVector(offset, explode);
            meshes.forEach((mesh) => {
                mesh.material = metal > 0.5 ? mesh.userData.metal : clay;
                mesh.userData.edges.material.opacity = Math.max(0.12 * (1 - metal), wire);
            });
        });
        clay.opacity = 1 - wire;
        clay.depthWrite = clay.opacity > 0.5;
        const turning = REDUCED ? 0 : metal;
        parts.pulley.rotation.z += dt * 0.8 * turning;
        parts.shaft.rotation.z = parts.pulley.rotation.z;
        root.rotation.y = 0.75 + p * 0.6 + stage.pointer.x * 0.12;
        root.rotation.x = -0.3 + stage.pointer.y * 0.08;
        root.position.y = REDUCED ? 0 : Math.sin(t * 0.8) * 0.04;
    });
    stage.trackPointer();
    stage.render();
    stage.loop();
    ready(container);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function boot() {
    const editing = document.body.classList.contains("editor_enable")
        || /[?&](enable_editor|edit_translations)=/.test(window.location.search);
    if (editing || !webglAvailable()) {
        html.classList.add("pn-no3d"); // website editor or no WebGL: show the photos
        return;
    }
    const scenes = { turntable: turntableScene, process: processScene };
    document.querySelectorAll("[data-pnsb-3d]").forEach((el) => {
        const kind = el.getAttribute("data-pnsb-3d");
        try {
            (scenes[kind] || ((c) => singlePartScene(c, kind)))(el);
        } catch (err) {
            console.warn("PNSB 3D scene failed", kind, err);
            el.classList.add("is-3d-failed");
        }
    });
    html.classList.add("pn-3d");
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
    boot();
}
