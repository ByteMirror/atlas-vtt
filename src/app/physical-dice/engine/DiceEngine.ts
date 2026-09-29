// @ts-nocheck -- vendored: type-checked in its source repo under that repo's (looser) config.
/**
 * Vendored from the Physical Dice plugin (github.com/evolJoaoBento/obsidian-physical-dice,
 * d20-dice.ts), which renders and simulates the dice with three.js and cannon-es.
 * Kept as one file, close to its source, so fixes can move between the two;
 * exempt from Atlas' file-size rule. Atlas talks to it only through
 * `PhysicalDiceTable` (../PhysicalDiceTable.ts).
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { DiceSettings } from './diceSettings';

/** Flip to true to get the roll and face-detection trace back on the console. */
const DEBUG = false;
const log = (...args: unknown[]): void => { if (DEBUG) console.log(...args); };

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Contact shadows, drawn as blurred discs under each die.
 *
 * This replaces a real shadow map, deliberately. See "Blurred discs, second
 * time around" in PERFORMANCE-NOTES.md — the map worked, but it was janky in a
 * way no amount of resolution or filtering fixed, and it dragged two bugs
 * along with it: a shadow that vanished the moment a die landed, and a
 * direction that could not be reconciled with the configured light.
 *
 * A disc centred under the die has neither problem. There is no direction to
 * keep in sync, and nothing to land on or miss.
 */

/** How dark the centre of a blob gets. */
const SHADOW_OPACITY = 0.38;

/**
 * Blob radius per die type, as a multiple of that die's `size`
 * (`diceSize` x the pack's scale for that type).
 *
 * Two different rules, because the types need different things.
 *
 * d8, d12 and d20 have near-round footprints, so their radius is the circle
 * with the same *area* as that footprint - it fills the shape and looks right.
 *
 * d4, d6 and d10 do not. A d6 rests on a square whose inscribed radius is 0.80
 * and circumscribed 1.13; an area-equivalent disc lands at 0.90, which bulges
 * past the flat edges while still missing the corners.
 *
 * d4 sits at its inscribed radius, tight inside the shape. d6 and d10 sit
 * between inscribed and area-equivalent - tighter than a disc that fills the
 * footprint, but not so tight that the shadow disappears under the die.
 *
 * All measured in the running app rather than derived. A single radius for
 * every type is exactly what makes blob shadows look wrong.
 */
const BLOB_RADIUS: Record<string, number> = {
    d4: 0.58, d6: 0.96, d8: 0.72, d10: 0.67, d12: 0.88, d20: 0.86
};

/**
 * Height of a resting die's centre above the plane it rests on, per unit of
 * `size`. Also measured. Used to tell "on the table" from "in the air" exactly,
 * so a die at rest gets a full-strength blob and not a slightly faded one.
 */
const BLOB_REST_HEIGHT: Record<string, number> = {
    d4: 0.58, d6: 1.00, d8: 1.00, d10: 0.95, d12: 0.93, d20: 0.85
};

/**
 * How far past the blob radius the gradient runs before it reaches zero. The
 * disc has to fade out inside its own quad or its edge shows as a hard circle,
 * so this is always > 1.
 *
 * 1.6 was the first value and it read as a soft halo rather than a shadow.
 * Tightening it to 1.25 while raising BLOB_CORE keeps the same amount of dark
 * but stops it spreading past the die. 1.0 was tried: at that width a d4 and a
 * d6 have no visible shadow at all, because each covers its own disc.
 */
const BLOB_SPREAD = 1.25;

/**
 * Fraction of the quad's radius that stays fully dark before the falloff
 * starts. With BLOB_SPREAD at 1.25 this puts the solid part at 0.75 of the
 * die's own footprint radius, so what shows past the die is the fade, not a
 * disc with a visible edge.
 */
const BLOB_CORE = 0.6;

/**
 * Types that want a softer gradient than the rest, as their own core fraction.
 *
 * A d4 is the smallest die and the only one resting on a triangle, so a disc
 * with the standard core reads as a hard pad under it rather than as a shadow.
 * A lower core means the solid centre is smaller and the fade longer - blurrier
 * at the same overall size. Each distinct value gets its own texture, built
 * once and shared by every die using it.
 */
const BLOB_CORE_BY_TYPE: Record<string, number> = {
    d4: 0.25
};

/**
 * How far the blob slides away from the light, as a fraction of its own radius.
 *
 * A disc dead centre under a die reads as a symmetric halo rather than as a
 * shadow. A small lean in the direction the light is coming from fixes that
 * without any of the trouble the old shadow map had: this is a fixed fraction
 * of the blob's radius, so it never depends on the light's elevation, never
 * grows with height, and cannot slide out from under the die.
 *
 * Kept deliberately slight. 0.28 was tried first and reads as a die standing
 * beside its shadow rather than on it; 0.09 is enough to break the symmetry and
 * no more. With the light exactly overhead there is no azimuth and the offset
 * is zero — which is what an overhead light should look like, and is what the
 * old SHADOW_DEFAULT_AZIMUTH got wrong by inventing a diagonal.
 */
const BLOB_OFFSET = 0.09;

/** A die this far above its resting height has no blob left. */
const BLOB_FADE_HEIGHT = 6;

/** How much wider the blob grows over that same distance. */
const BLOB_GROWTH = 0.6;

/** Pixels across the shared gradient texture. It is blurry; it can be small. */
const BLOB_TEXTURE_SIZE = 128;

/** The physics floor. Everything that claims to be a surface agrees with it. */
const FLOOR_Y = -2.4;

/**
 * A cell of a texture pack's atlas: where a number is printed, and which way up.
 *
 * `col`/`row` index a grid over the image, counting from the top-left the way
 * the image reads. `rotation` is quarter turns anticlockwise, for the flaps of
 * a net that fold in rotated - a cube net's bottom flap is printed upside down
 * so that it comes out the right way up on the die.
 */
interface AtlasQuad {
    number: number;
    col: number;
    row: number;
    rotation: 0 | 1 | 2 | 3;
}

/**
 * A face of a net that is not laid out on a grid.
 *
 * A cube unfolds onto squares that tile an image, which is why the d6 gets away
 * with columns and rows. Nothing else does: an octahedron unfolds to a zigzag
 * strip of triangles, a dodecahedron to two rings of pentagons. So a cell here
 * carries its own corners, in pixels of the sheet, read off the art rather than
 * derived - the sheets are drawn by hand and only roughly regular.
 *
 * `turn` says which of the cell's corners the die's first vertex lands on, and
 * `mirror` reverses the winding. Both exist for the same reason as the quad
 * atlas's `rotation`: the artist drew each digit for one particular unfolding,
 * and nothing in the geometry knows which.
 */
interface AtlasFace {
    number: number;
    /** Corners in sheet pixels, in the order the image draws them. */
    corners: Array<[number, number]>;
    turn: number;
    mirror?: boolean;
    /**
     * Which numbered corner of the die each corner of this cell is, for art
     * that is printed per corner rather than per face.
     *
     * A d4 has no upward face to read, so it is read at a corner instead, and
     * every face carries three digits - one by each corner - rather than one in
     * the middle. Fold the net up and the three digits that meet at a corner all
     * agree: 1 at the three outer corners of the sheet, and 3, 2 and 4 at the
     * midpoints. So a corner of the die owns a number, and lining the cell up
     * means matching corners to corners, not counting turns. Where this is set
     * `turn` and `mirror` are not consulted; there is nothing left for them to
     * decide.
     */
    vertices?: number[];
}

/**
 * A texture pack, as its pack.json describes it.
 *
 * Everything here used to be tables in this file, which meant a pack could
 * change what a die looked like but not how its art was laid out, how big it
 * was, or whether it had its edges taken off. A pack now brings all of that
 * with it: copy the folder, edit the images, describe them, and it is a
 * different set of dice.
 *
 * `numbers` is the one entry that is not free. It says which number each
 * geometry face carries, and the face order is three.js's, not the art's - so
 * it exists here to be kept in step with the cells, not to be chosen. The
 * values ship paired so opposite faces sum the way a die's should.
 */
export interface PackDie {
    /**
     * Which solid to build, when it is not the one the die is named after.
     *
     * A percentile die is a d10 with different numbers on it, not a different
     * shape, so it says `"geometry": "d10"` and gets the same hull, the same
     * ten faces and the same blob shadow. Everything else about it - its art,
     * its numbers, its size - is still its own.
     */
    geometry?: string;
    /** Face sheet, relative to the pack folder. */
    texture?: string;
    /** Normal map, same folder, optional. */
    normal?: string;
    /** Size relative to the other dice in the set. */
    scale?: number;
    /** This die's own colour, for a set that is not all one. */
    color?: string;
    /** A patch of sheet with nothing on it, for a bevel's rim to wear. */
    rimUV?: [number, number];
    /** Number per geometry face. See above. */
    numbers?: number[];
    /** Cells on a grid, for a net that lies on one - a cube's cross. */
    grid?: { cols: number; rows: number; cells: AtlasQuad[] };
    /** Sheet edge in pixels, for cells given as corners. */
    sheetSize?: number;
    /** Cells as corners, for a net that lies on no grid. */
    faces?: AtlasFace[];
}

export interface DicePack {
    name?: string;
    /** What the set is made of, unless a die says otherwise. */
    color?: string;
    /**
     * Edges taken off. `smooth` rounds the rim's shading from 0 (a flat
     * chamfer) to 1 (light running continuously round the corner), and costs
     * nothing: it changes normals, not geometry.
     */
    bevel?: { enabled?: boolean; depth?: number; smooth?: number };
    material?: { shininess?: number; specular?: string; transparent?: boolean; opacity?: number };
    dice?: Record<string, PackDie>;
}

/** What a die falls back to when its pack says nothing about it. */
const PACK_FALLBACK: Required<Pick<PackDie, 'scale' | 'rimUV' | 'color'>> = {
    scale: 1,
    rimUV: [0.97, 0.97],
    color: '#ff4444'
};

const BEVEL_FALLBACK = { enabled: true, depth: 0.1, smooth: 0 };

/** One die of a settled roll: its type (`d20`) and the number it came up. */
export interface RolledDie {
    type: string;
    value: number;
    /** Position of the die on the table (creation order), when known. */
    index?: number;
}

export class DiceEngine {
    private scene: THREE.Scene;
    private camera: THREE.OrthographicCamera;
    private renderer: THREE.WebGLRenderer;
    private dice: THREE.Mesh;
    private diceBody: CANNON.Body;
    private world: CANNON.World;
    private isRolling = false;
    private container: HTMLElement;
    private animationId: number | null = null;
    private rollTimeout: NodeJS.Timeout | null = null;
    private isDragging = false;
    private dragStartPosition = { x: 0, y: 0 };
    private mouse = new THREE.Vector2();
    private raycaster = new THREE.Raycaster();
    private lastMousePosition = { x: 0, y: 0, time: 0 };
    private mouseVelocity = { x: 0, y: 0 };
    private isHoveringDice = false;
    private diceGeometry: THREE.IcosahedronGeometry;
    private faceNumbers: number[] = [];
    private faceNormals: THREE.Vector3[] = [];
    private settings: DiceSettings;
    // Multi-dice support arrays
    private diceArray: THREE.Mesh[] = [];
    private diceBodyArray: CANNON.Body[] = [];
    private diceTypeArray: string[] = [];
    private selectedDice: THREE.Mesh[] = [];
    private draggedDiceIndex = -1;
    private trayBodies: CANNON.Body[] = [];
    /** One blurred disc per die, index-aligned with diceArray. */
    private blobShadows: THREE.Mesh[] = [];
    /** Shared by every blob: a unit quad and one gradient. */
    private blobGeometry: THREE.PlaneGeometry | null = null;
    private blobTextures = new Map<number, THREE.Texture>();
    /** World Y the blobs sit on: where the dice actually come to rest. */
    private shadowPlaneY = -2.38;
    private isTearingDown = false;
    private hoverCircle: THREE.Mesh | null = null;
    private hoverCircleMaterial: THREE.MeshBasicMaterial | null = null;
    private floorHeight = -2.4;
    public onRollComplete: ((result: number | string) => void) | null = null;
    /**
     * The dice behind the last result, one entry per die. The result string is
     * for people and comes in several shapes; this is what other plugins read.
     * Null when the last roll had no valid reading (a caught die).
     */
    private lastRoll: RolledDie[] | null = null;
    private ambientLight: THREE.AmbientLight | null = null;
    private directionalLight: THREE.DirectionalLight | null = null;
    public isViewActive: boolean = true; // Track if the view is active

    // Render loop state. The loop stops itself once nothing is moving; every
    // mutation that changes the picture has to call wake() to restart it.
    private needsRender = true;
    private lastFrameTime = 0;
    private lastDragRender = 0;
    private readonly animateBound = () => this.animate();
    // getBoundingClientRect() flushes layout, so it is read once per resize
    // rather than once per pointer event.
    private cachedRect: DOMRect | null = null;
    private currentCursor = '';
    private readonly pickVec = new THREE.Vector3();

    // The convex hull is identical for every die of a given type and size, and
    // building one throws away a whole BufferGeometry. Build each one once.
    private static shapeCache = new Map<string, CANNON.Shape>();
    private static faceNormalCache = new Map<string, THREE.Vector3[]>();
    private readonly normalScratch = new THREE.Vector3();
    // Instance-scoped on purpose: destroy() disposes textures through the
    // meshes that reference them, so a cache outliving the renderer would hand
    // out disposed handles to the next overlay.
    private readonly textureCache = new Map<string, THREE.Texture>();
    /**
     * The chosen pack, as read from its pack.json.
     *
     * Empty until one loads, and empty is a working state: a die with nothing
     * said about it keeps its own proportions, wears whatever texture the pack
     * folder gave it, and falls back to the geometry's own UVs rather than an
     * atlas. That is what a pack with no manifest looks like.
     */
    private pack: DicePack = {};

    public setPack(pack: DicePack): void {
        this.pack = pack || {};
        this.wake();
    }

    private packDie(diceType: string): PackDie {
        return this.pack.dice?.[diceType] || {};
    }

    /** Which number each geometry face carries, or nothing if the pack is silent. */
    private numbersFor(diceType: string): number[] | null {
        const numbers = this.packDie(diceType).numbers;
        return numbers && numbers.length ? numbers : null;
    }

    private scaleFor(diceType: string): number {
        return this.packDie(diceType).scale ?? PACK_FALLBACK.scale;
    }

    /** The solid a die is built from, which is usually the die itself. */
    private solidFor(diceType: string): string {
        return this.packDie(diceType).geometry || diceType;
    }

    /**
     * What colour a die is.
     *
     * The pack's, not the roller's: a set is red or bone or black the way it is
     * a particular shape, and a percentile die that does not match the d10 it
     * pairs with is a different set. A die may still say its own, for a set that
     * is not all one colour.
     */
    private colorFor(diceType: string): string {
        return this.packDie(diceType).color || this.pack.color || PACK_FALLBACK.color;
    }
    // cannon only consults a Material through a ContactMaterial pair; with none
    // registered every body falls back to world.defaultContactMaterial anyway,
    // so one shared instance behaves identically to one per body.
    private static readonly bodyMaterial = new CANNON.Material({ friction: 0.4, restitution: 0.3 });

    constructor(container: HTMLElement, settings: DiceSettings) {
        this.container = container;
        this.settings = settings;
        log('🎲 D20Dice initialized with settings:', {
            motionThreshold: settings.motionThreshold,
            enableResultAnimation: settings.enableResultAnimation,
            diceSize: settings.diceSize
        });
        this.init();
    }

    private init() {
        try {
            // Initialize Three.js scene with transparent background
            this.scene = new THREE.Scene();
            // No background color - will be transparent

            // Setup orthographic camera - will be properly sized in updateSize
            const aspect = window.innerWidth / (window.innerHeight - 44);
            const frustumSize = 20;
            this.camera = new THREE.OrthographicCamera(
                -frustumSize * aspect / 2, frustumSize * aspect / 2,
                frustumSize / 2, -frustumSize / 2,
                0.1, 1000
            );
            this.camera.position.set(0, 20, 0);
            this.camera.lookAt(0, -2, 0);
            this.camera.up.set(0, 0, -1);

            // Setup renderer to fill container
            this.renderer = new THREE.WebGLRenderer({
                antialias: true,
                alpha: true,
                preserveDrawingBuffer: false,
                powerPreference: "high-performance",
                // Flat-shaded solids plus one texture — highp buys nothing here.
                precision: "mediump"
            });
            // Add WebGL context loss/restore handlers
            const canvas = this.renderer.domElement;
            canvas.addEventListener('webglcontextlost', (event) => {
                if (!this.isTearingDown) {
                    console.warn('WebGL context lost, attempting to prevent default');
                }
                event.preventDefault();
            });

            canvas.addEventListener('webglcontextrestored', () => {
                log('WebGL context restored, reinitializing scene');
                this.reinitializeAfterContextLoss();
            });

            this.container.appendChild(canvas);

            // Set initial size to fill container
            this.setInitialSize();

            // Setup drag controls and mouse interactions
            this.setupDragControls();

            // Initialize physics world
            this.initPhysics();

            // Create tray but no initial dice (multi-dice system)
            this.createDiceTray();
            this.setupLighting();

            // wake() rather than animate(): setInitialSize() has already queued
            // a frame, and calling animate() directly here would leave two
            // independent loops stepping the same world.
            this.wake();
        } catch (error) {
            console.error('Failed to initialize D20 dice:', error);
            console.error('Error details:', error.message, error.stack);
            this.container.empty();
            const fallback = this.container.createDiv({ cls: 'atlas-physical-dice__error' });
            fallback.createSpan({ text: '3D rendering not available' });
            fallback.createEl('small', { text: `Error: ${error.message}` });
        }
    }

    private initPhysics() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0); // Realistic Earth gravity (9.82 m/s²)
        log(`🌍 Physics world initialized with gravity: ${this.world.gravity.y}`);

        // Body.allowSleep defaults to true and every die sets sleepSpeedLimit /
        // sleepTimeLimit, but World.allowSleep is false unless asked — without
        // this line cannon never runs sleepTick and no body ever sleeps.
        this.world.allowSleep = true;

        // Set up advanced physics for more accurate simulation
        this.world.defaultContactMaterial.contactEquationStiffness = 1e7;
        this.world.defaultContactMaterial.contactEquationRelaxation = 4;
        this.world.broadphase = new CANNON.NaiveBroadphase();
        this.world.broadphase.useBoundingBoxes = true;
        // Leave solver.iterations at cannon-es's default of 10.
        //
        // The performance notes suggest dropping it to 2, and that is a real
        // trap: measured in the browser harness, anything below 8 leaves the d4
        // (and often the d8) permanently in sleepState SLEEPY. The solver never
        // fully resolves their resting contacts, so the residual jitter
        // occasionally spikes past sleepSpeedLimit, cannon re-wakes the body,
        // and the one-second sleep timer restarts forever.
        //
        // A body that never sleeps means the render loop never stops, which
        // costs far more than the handful of solver iterations saves. Over
        // three runs each: 2, 4 and 6 iterations settled 1/3, 0/3 and 0/3;
        // 8 and 10 settled 3/3. Re-run harness/ if you want to change this.
    }

    /**
     * The tray's footprint, in world units.
     *
     * Taken from the camera rather than from constants. It used to be a fixed
     * 32 x 24 while the camera shows `20 * aspect` wide by 20 deep - so on a
     * typical window the tray was narrower than the view left to right and
     * deeper than it top to bottom, and the brown border drew that mismatch on
     * screen. Dice also bounced off walls that were nowhere near the edges.
     *
     * The tray is exactly what you can see, and follows the overlay as it resizes.
     */
    private trayDimensions(): { width: number; length: number } {
        return {
            width: this.camera.right - this.camera.left,
            length: this.camera.top - this.camera.bottom
        };
    }

    private createDiceTray() {
        // updateSettings() and the context-loss handler both call this. Without
        // tearing the old one down first, every settings change stacked another
        // floor plane, four more walls and another set of border lines onto the
        // world — the broadphase then paid for all of them, forever.
        this.removeDiceTray();

        // Physics tray floor - realistic felt surface
        const floorMaterial = new CANNON.Material('floor');
        floorMaterial.restitution = 0.25;  // Felt absorbs energy (low bounce)
        floorMaterial.friction = 0.7;      // Felt has high friction

        const floorShape = new CANNON.Plane();
        const floorBody = new CANNON.Body({ mass: 0, material: floorMaterial });
        floorBody.addShape(floorShape);
        floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        floorBody.position.set(0, FLOOR_Y, 0);
        this.floorHeight = floorBody.position.y;
        this.addTrayBody(floorBody);

        // Dice rest on the floor whether or not the surface is drawn, so this
        // is the contact plane in both cases. It used to follow the visible
        // tray top instead, which put it 0.8 above where dice actually land.
        this.shadowPlaneY = this.floorHeight + 0.02;

        // Physics tray walls - realistic wood/plastic walls
        const wallMaterial = new CANNON.Material('wall');
        wallMaterial.restitution = 0.45;  // Moderate bounce off walls
        wallMaterial.friction = 0.3;      // Smooth wall surface

        // Calculate wall dimensions based on tray settings
        const { width: trayWidth, length: trayLength } = this.trayDimensions();
        const halfWidth = trayWidth / 2;
        const halfLength = trayLength / 2;

        // Left wall
        const leftWallShape = new CANNON.Box(new CANNON.Vec3(0.2, 4, halfLength));
        const leftWall = new CANNON.Body({ mass: 0, material: wallMaterial });
        leftWall.addShape(leftWallShape);
        leftWall.position.set(-halfWidth, 0, 0);
        this.addTrayBody(leftWall);

        // Right wall
        const rightWallShape = new CANNON.Box(new CANNON.Vec3(0.2, 4, halfLength));
        const rightWall = new CANNON.Body({ mass: 0, material: wallMaterial });
        rightWall.addShape(rightWallShape);
        rightWall.position.set(halfWidth, 0, 0);
        this.addTrayBody(rightWall);

        // Front wall
        const frontWallShape = new CANNON.Box(new CANNON.Vec3(halfWidth, 4, 0.2));
        const frontWall = new CANNON.Body({ mass: 0, material: wallMaterial });
        frontWall.addShape(frontWallShape);
        frontWall.position.set(0, 0, halfLength);
        this.addTrayBody(frontWall);

        // Back wall
        const backWallShape = new CANNON.Box(new CANNON.Vec3(halfWidth, 4, 0.2));
        const backWall = new CANNON.Body({ mass: 0, material: wallMaterial });
        backWall.addShape(backWallShape);
        backWall.position.set(0, 0, -halfLength);
        this.addTrayBody(backWall);
    }

    // =======================================================================
    // Blob shadows
    // =======================================================================

    /**
     * The gradient every blob wears: opaque in the middle, nothing at the edge.
     *
     * The falloff is a smoothstep rather than a linear ramp so the disc has no
     * visible rim at any scale — a linear gradient shows its outer circle as a
     * faint but perfectly round line, which is exactly the artefact this whole
     * change exists to get rid of. Built once and shared by every die.
     */
    private blobSprite(core: number): THREE.Texture {
        const cached = this.blobTextures.get(core);
        if (cached) return cached;

        const size = BLOB_TEXTURE_SIZE;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('blob shadow: no 2d context');

        const image = ctx.createImageData(size, size);
        const half = size / 2;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const r = Math.hypot(x + 0.5 - half, y + 0.5 - half) / half;
                // Solid out to the core, then smoothstep to nothing.
                const t = Math.min(1, Math.max(0, (r - core) / (1 - core)));
                const alpha = 1 - t * t * (3 - 2 * t);
                const i = (y * size + x) * 4;
                image.data[i] = 0;
                image.data[i + 1] = 0;
                image.data[i + 2] = 0;
                image.data[i + 3] = Math.round(alpha * 255);
            }
        }
        ctx.putImageData(image, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        this.blobTextures.set(core, texture);
        return texture;
    }

    private createBlob(): THREE.Mesh {
        if (!this.blobGeometry) this.blobGeometry = new THREE.PlaneGeometry(1, 1);

        const material = new THREE.MeshBasicMaterial({
            color: 0x000000,
            // The sprite depends on the die's type, which a blob only learns
            // when it is placed; updateBlobShadows() sets it.
            map: this.blobSprite(BLOB_CORE),
            transparent: true,
            opacity: SHADOW_OPACITY,
            // A blob lies flat under a die and must never occlude one.
            depthWrite: false
        });

        const blob = new THREE.Mesh(this.blobGeometry, material);
        blob.rotation.x = -Math.PI / 2;
        blob.renderOrder = -1;
        this.scene.add(blob);
        return blob;
    }

    /**
     * Reconcile the blobs to the dice, then place them.
     *
     * Called from renderFrame() rather than from every path that adds or
     * removes a die. There are five such paths and one of them will be added
     * later without this in mind; comparing two array lengths on a frame that
     * was going to be drawn anyway costs nothing and cannot be forgotten.
     */
    private updateBlobShadows(): void {
        const wanted = this.settings.enableShadows ? this.diceArray.length : 0;

        // Which way the light is coming from, flattened. Read once per frame
        // rather than per die.
        const lightX = this.settings.directionalLightPositionX;
        const lightZ = this.settings.directionalLightPositionZ;
        const horizontal = Math.hypot(lightX, lightZ);
        const leanX = horizontal > 1e-3 ? -(lightX / horizontal) * BLOB_OFFSET : 0;
        const leanZ = horizontal > 1e-3 ? -(lightZ / horizontal) * BLOB_OFFSET : 0;

        while (this.blobShadows.length > wanted) {
            const blob = this.blobShadows.pop();
            if (!blob) break;
            this.scene.remove(blob);
            (blob.material as THREE.Material).dispose();
        }
        while (this.blobShadows.length < wanted) this.blobShadows.push(this.createBlob());

        for (let i = 0; i < this.blobShadows.length; i++) {
            const die = this.diceArray[i];
            const blob = this.blobShadows[i];
            if (!die) continue;

            const type = this.diceTypeArray[i] || 'd20';
            const scale = this.scaleFor(type);
            const size = this.settings.diceSize * scale;
            const solid = this.solidFor(type);
            const radius = (BLOB_RADIUS[solid] ?? BLOB_RADIUS.d20) * size;
            const restHeight = (BLOB_REST_HEIGHT[solid] ?? BLOB_REST_HEIGHT.d20) * size;

            // Height above where this type of die sits when it is at rest, so a
            // settled die gets a full-strength blob rather than a nearly one.
            const height = Math.max(0, die.position.y - (this.shadowPlaneY + restHeight));
            const lift = Math.min(1, height / BLOB_FADE_HEIGHT);

            const width = radius * 2 * BLOB_SPREAD * (1 + BLOB_GROWTH * lift);
            blob.scale.set(width, width, 1);

            // Blobs are reused as dice come and go, so the one at this index
            // may have been wearing another type's sprite a frame ago.
            const material = blob.material as THREE.MeshBasicMaterial;
            const sprite = this.blobSprite(BLOB_CORE_BY_TYPE[this.solidFor(type)] ?? BLOB_CORE);
            if (material.map !== sprite) {
                material.map = sprite;
                material.needsUpdate = true;
            }

            blob.position.set(
                die.position.x + leanX * radius,
                this.shadowPlaneY,
                die.position.z + leanZ * radius
            );
            (blob.material as THREE.MeshBasicMaterial).opacity = SHADOW_OPACITY * (1 - lift);
            blob.visible = lift < 1;
        }
    }

    private disposeBlobShadows(): void {
        for (const blob of this.blobShadows) {
            this.scene.remove(blob);
            (blob.material as THREE.Material).dispose();
        }
        this.blobShadows = [];

        this.blobGeometry?.dispose();
        this.blobGeometry = null;
        for (const texture of this.blobTextures.values()) texture.dispose();
        this.blobTextures.clear();
    }

    private addTrayBody(body: CANNON.Body): void {
        this.world.addBody(body);
        this.trayBodies.push(body);
    }

    private removeDiceTray(): void {
        for (const body of this.trayBodies) {
            this.world.removeBody(body);
        }
        this.trayBodies.length = 0;
    }

    private createDice() {
        // DISABLED: Legacy single-dice creation method
        // Multi-dice system uses createSingleDice() instead
        log('createDice() called but disabled for multi-dice system');
        return;

        // Create a basic fallback material with all configured properties
        const fallbackMaterialProps: any = {
            color: this.colorFor(this.settings.diceType),
            ...this.packFinish()
        };

        // Add normal map to fallback material if available
        const normalMapData = this.getCurrentDiceNormalMapData();
        if (normalMapData) {
            const normalMap = this.loadNormalMap(normalMapData);
            if (normalMap) {
                fallbackMaterialProps.normalMap = normalMap;
            }
        }

        const fallbackMaterial = new THREE.MeshPhongMaterial(fallbackMaterialProps);

        this.dice = new THREE.Mesh(this.diceGeometry, fallbackMaterial);

        // Ensure dice is visible by making it reasonably sized
        log(`Creating dice with size: ${this.settings.diceSize}, type: ${this.settings.diceType}`);
        this.dice.position.set(0, 2, 0);
        this.scene.add(this.dice);

        // Initialize face numbers for d20 (1-20 mapped to faces)
        this.initializeFaceNumbers();

        // NOTE: Legacy single-dice physics disabled for multi-dice system
        // this.createPhysicsBody();

        // Calculate face normals for the dice type
        this.calculateFaceNormals();

        this.addDiceTextures();
    }

    private createDiceGeometry(): THREE.BufferGeometry {
        let geometry: THREE.BufferGeometry;

        switch (this.settings.diceType) {
            case 'd4':
                geometry = new THREE.TetrahedronGeometry(this.settings.diceSize, 0);
                this.applyTetrahedronUVMapping(geometry);
                return geometry;
            case 'd6':
                geometry = this.createGeometryForDiceType('d6');
                this.applySquareUVMapping(geometry);
                return geometry;
            case 'd8':
                geometry = new THREE.OctahedronGeometry(this.settings.diceSize, 0);
                this.applyTriangleUVMapping(geometry, 8);
                return geometry;
            case 'd10': {
                geometry = this.createD10PolyhedronGeometry(this.settings.diceSize);
                // Apply UV mapping for D10 (10 kite-shaped faces)
                this.applyD10UVMapping(geometry);
                return geometry;
            }
            case 'd12':
                geometry = new THREE.DodecahedronGeometry(this.settings.diceSize, 0);
                this.applyD12PentagonUVMapping(geometry);
                return geometry;
            case 'd20':
            default:
                geometry = new THREE.IcosahedronGeometry(this.settings.diceSize, 0);
                this.applyTriangleUVMapping(geometry, 20);
                return geometry;
        }
    }

    private createD10PolyhedronGeometry(size: number): THREE.BufferGeometry {
        // Based on react-3d-dice implementation
        const sides = 10;
        const vertices: number[] = [0, 0, 1, 0, 0, -1];

        // Create vertices around the middle
        for (let i = 0; i < sides; ++i) {
            const angle = (i * Math.PI * 2) / sides;
            vertices.push(
                -Math.cos(angle),
                -Math.sin(angle),
                0.105 * (i % 2 ? 1 : -1)
            );
        }

        /*
         * Twenty triangles, two to a face: a d10's faces are kites, and each is
         * a pair of these sharing the edge from the apex to the corner the kite
         * is built around.
         *
         * The order matters, because everything downstream reads a face as two
         * triangles running together in the buffer. A kite is only a kite if the
         * corner in the middle of its three equatorial ones sits on the far side
         * of the equator from its apex - the near corner and the two shoulders
         * have to fall on opposite sides, or the four are not even coplanar. The
         * top fan used to start one triangle early, which built its five faces
         * around the corners nearest the apex instead of the ones furthest from
         * it. They came out a different shape from the bottom five, and the art
         * laid on them was stretched to match. Starting at [0, 11, 2] fixes it;
         * the bottom fan was already right.
         */
        const faces = [
            [0, 11, 2], [0, 2, 3], [0, 3, 4], [0, 4, 5], [0, 5, 6],
            [0, 6, 7], [0, 7, 8], [0, 8, 9], [0, 9, 10], [0, 10, 11],
            [1, 3, 2], [1, 4, 3], [1, 5, 4], [1, 6, 5], [1, 7, 6],
            [1, 8, 7], [1, 9, 8], [1, 10, 9], [1, 11, 10], [1, 2, 11]
        ];

        // Create THREE.js PolyhedronGeometry
        const geometry = new THREE.PolyhedronGeometry(
            vertices,
            faces.flat(),
            size,
            0  // Detail level 0 for sharp edges
        );

        return geometry;
    }

    private applyD10UVMapping(geometry: THREE.BufferGeometry): void {
        // Convert to non-indexed geometry
        const nonIndexedGeometry = geometry.index ? geometry.toNonIndexed() : geometry;
        geometry.attributes = nonIndexedGeometry.attributes;
        geometry.index = null;

        const uvAttribute = geometry.attributes.uv;
        const uvArray = uvAttribute.array as Float32Array;
        const positionAttribute = geometry.attributes.position;
        const positionArray = positionAttribute.array as Float32Array;

        const totalTriangles = uvAttribute.count / 3;
        log(`D10: ${totalTriangles} triangles total`);

        // 5x2 grid for 10 faces
        const cols = 5;
        const rows = 2;
        const cellWidth = 1.0 / cols;
        const cellHeight = 1.0 / rows;
        const padding = 0.02;

        // Group triangles by face based on normals
        const faceGroups = [];
        const faceNormals = [];

        for (let i = 0; i < totalTriangles; i++) {
            const vertexOffset = i * 3;

            // Calculate triangle normal
            const v1 = new THREE.Vector3(
                positionArray[vertexOffset * 3],
                positionArray[vertexOffset * 3 + 1],
                positionArray[vertexOffset * 3 + 2]
            );
            const v2 = new THREE.Vector3(
                positionArray[(vertexOffset + 1) * 3],
                positionArray[(vertexOffset + 1) * 3 + 1],
                positionArray[(vertexOffset + 1) * 3 + 2]
            );
            const v3 = new THREE.Vector3(
                positionArray[(vertexOffset + 2) * 3],
                positionArray[(vertexOffset + 2) * 3 + 1],
                positionArray[(vertexOffset + 2) * 3 + 2]
            );

            const edge1 = new THREE.Vector3().subVectors(v2, v1);
            const edge2 = new THREE.Vector3().subVectors(v3, v1);
            const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

            // Find or create face group
            let faceIndex = -1;
            for (let j = 0; j < faceNormals.length; j++) {
                if (faceNormals[j].dot(normal) > 0.95) {
                    faceIndex = j;
                    break;
                }
            }

            if (faceIndex === -1) {
                faceIndex = faceNormals.length;
                faceNormals.push(normal.clone());
                faceGroups.push([]);
            }

            faceGroups[faceIndex].push(i);
        }

        log(`D10: Found ${faceGroups.length} faces`);

        // Map each face group to UV coordinates
        for (let faceIndex = 0; faceIndex < Math.min(faceGroups.length, 10); faceIndex++) {
            const triangles = faceGroups[faceIndex];

            //// Calculate face normal to determine if it's top or bottom hemisphere
            //const firstTriangle = triangles[0];
            //const vertexOffset = firstTriangle * 3;
            //const v1 = new THREE.Vector3(
            //    positionArray[vertexOffset * 3],
            //    positionArray[vertexOffset * 3 + 1],
            //    positionArray[vertexOffset * 3 + 2]
            //);
            //const v2 = new THREE.Vector3(
            //    positionArray[(vertexOffset + 1) * 3],
            //    positionArray[(vertexOffset + 1) * 3 + 1],
            //    positionArray[(vertexOffset + 1) * 3 + 2]
            //);
            //const v3 = new THREE.Vector3(
            //    positionArray[(vertexOffset + 2) * 3],
            //    positionArray[(vertexOffset + 2) * 3 + 1],
            //    positionArray[(vertexOffset + 2) * 3 + 2]
            //);

            //// Calculate face center and normal
            //const faceCenter = new THREE.Vector3().addVectors(v1, v2).add(v3).divideScalar(3);
            //const edge1 = new THREE.Vector3().subVectors(v2, v1);
            //const edge2 = new THREE.Vector3().subVectors(v3, v1);
            //const faceNormal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

            // Determine if this is a top face (Y > 0) or bottom face (Y < 0)
            /*const isTopFace = faceCenter.y > 0;*/

            const isTopFace = faceIndex >= 1 && faceIndex <=4;

            const col = faceIndex % cols;
            const row = Math.floor(faceIndex / cols);

            const cellLeft = col * cellWidth + padding;
            const cellRight = (col + 1) * cellWidth - padding;
            const cellTop = row * cellHeight + padding;
            const cellBottom = (row + 1) * cellHeight - padding;

            const cellCenterX = (cellLeft + cellRight) / 2;

            // Define the 4 vertices of the kite shape (top 80%, bottom 20%)
            const kiteCenter = cellTop + (cellBottom - cellTop) * 0.8; // 80% down from top
            let kiteVertices;


            // Map triangles to the kite
            for (let t = 0; t < triangles.length; t++) {
                const triangleIndex = triangles[t];
                const vertexOffset = triangleIndex * 3;
                const uvIndex = vertexOffset * 2;

                if (isTopFace) {
                    kiteVertices = [
                        { x: cellCenterX, y: cellTop },        // Top vertex (0)
                        { x: cellLeft, y: kiteCenter },       // Right vertex (1) - at 80% point
                        { x: cellCenterX, y: cellBottom },     // Bottom vertex (2)
                        { x: cellRight, y: kiteCenter }         // Left vertex (3) - at 80% point
                    ];
                    if (t === 0) {
                        // First triangle
                        uvArray[uvIndex] = kiteVertices[3].x;
                        uvArray[uvIndex + 1] = kiteVertices[3].y;
                        uvArray[uvIndex + 2] = kiteVertices[2].x;
                        uvArray[uvIndex + 3] = kiteVertices[2].y;
                        uvArray[uvIndex + 4] = kiteVertices[0].x;
                        uvArray[uvIndex + 5] = kiteVertices[0].y;
                    } else if (t === 1) {
                        // Second triangle
                        uvArray[uvIndex] = kiteVertices[2].x;
                        uvArray[uvIndex + 1] = kiteVertices[2].y;
                        uvArray[uvIndex + 2] = kiteVertices[1].x;
                        uvArray[uvIndex + 3] = kiteVertices[1].y;
                        uvArray[uvIndex + 4] = kiteVertices[0].x;
                        uvArray[uvIndex + 5] = kiteVertices[0].y;
                    }
                } else {
                    kiteVertices = [
                        { x: cellCenterX, y: cellBottom },        // Top vertex (0)
                        { x: cellRight, y: kiteCenter },       // Right vertex (1) - at 80% point
                        { x: cellCenterX, y: cellTop },     // Bottom vertex (2)
                        { x: cellLeft, y: kiteCenter }         // Left vertex (3) - at 80% point
                    ];
                    if (t === 0) {
                        // First triangle
                        uvArray[uvIndex] = kiteVertices[0].x;
                        uvArray[uvIndex + 1] = kiteVertices[0].y;
                        uvArray[uvIndex + 2] = kiteVertices[3].x;
                        uvArray[uvIndex + 3] = kiteVertices[3].y;
                        uvArray[uvIndex + 4] = kiteVertices[2].x;
                        uvArray[uvIndex + 5] = kiteVertices[2].y;
                    } else if (t === 1) {
                        // Second triangle
                        uvArray[uvIndex] = kiteVertices[1].x;
                        uvArray[uvIndex + 1] = kiteVertices[1].y;
                        uvArray[uvIndex + 2] = kiteVertices[0].x;
                        uvArray[uvIndex + 3] = kiteVertices[0].y;
                        uvArray[uvIndex + 4] = kiteVertices[2].x;
                        uvArray[uvIndex + 5] = kiteVertices[2].y;
                    }
                }
            }
        }

        uvAttribute.needsUpdate = true;
        log('Applied D10 UV mapping with proper kite faces');
    }

    private createPentagonalTrapezohedronGeometry(size: number): THREE.BufferGeometry {
        const geometry = new THREE.BufferGeometry();
        const topHeight = size * 0.75;
        const bottomHeight = -topHeight;
        const ringRadius = size * 0.9;

        const topVertices: THREE.Vector3[] = [];
        const bottomVertices: THREE.Vector3[] = [];

        for (let i = 0; i < 5; i++) {
            const angle = (i * Math.PI * 2) / 5;
            topVertices.push(new THREE.Vector3(Math.cos(angle) * ringRadius, topHeight, Math.sin(angle) * ringRadius));
            const bottomAngle = angle + Math.PI / 5;
            bottomVertices.push(new THREE.Vector3(Math.cos(bottomAngle) * ringRadius, bottomHeight, Math.sin(bottomAngle) * ringRadius));
        }

        const positions: number[] = [];
        const uvs: number[] = [];

        const addTriangle = (v1: THREE.Vector3, uv1: [number, number], v2: THREE.Vector3, uv2: [number, number], v3: THREE.Vector3, uv3: [number, number]) => {
            positions.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);
            uvs.push(uv1[0], uv1[1], uv2[0], uv2[1], uv3[0], uv3[1]);
        };

        const cols = 5;
        const rows = 2;
        const cellWidth = 1 / cols;
        const cellHeight = 1 / rows;
        const padding = 0.02;

        const getCell = (faceIndex: number) => {
            const col = faceIndex % cols;
            const row = Math.floor(faceIndex / cols);
            const left = col * cellWidth + padding;
            const right = (col + 1) * cellWidth - padding;
            const top = row * cellHeight + padding;
            const bottom = (row + 1) * cellHeight - padding;
            const center = (left + right) / 2;
            return { left, right, top, bottom, center };
        };

        // Upper ring faces (0-4)
        for (let i = 0; i < 5; i++) {
            const next = (i + 1) % 5;
            const { left, right, top, bottom, center } = getCell(i);

            const t0 = topVertices[i];
            const b0 = bottomVertices[i];
            const t1 = topVertices[next];
            const b1 = bottomVertices[next];

            addTriangle(t0, [center, top], b0, [left, bottom], t1, [right, top]);
            addTriangle(t1, [right, top], b0, [left, bottom], b1, [right, bottom]);
        }

        // Lower ring faces (5-9)
        for (let i = 0; i < 5; i++) {
            const prev = (i - 1 + 5) % 5;
            const { left, right, top, bottom, center } = getCell(i + 5);

            const t0 = topVertices[i];
            const bPrev = bottomVertices[prev];
            const tPrev = topVertices[prev];
            const b0 = bottomVertices[i];

            addTriangle(t0, [center, top], bPrev, [right, bottom], tPrev, [right, top]);
            addTriangle(t0, [center, top], b0, [left, bottom], bPrev, [right, bottom]);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.computeVertexNormals();
        return geometry;
    }

    private applyTriangleUVMapping(geometry: THREE.BufferGeometry, faceCount: number): void {
        // Convert to non-indexed geometry so each face has its own vertices
        const nonIndexedGeometry = geometry.index ? geometry.toNonIndexed() : geometry;
        geometry.attributes = nonIndexedGeometry.attributes;
        geometry.index = null;

        const uvAttribute = geometry.attributes.uv;
        const uvArray = uvAttribute.array as Float32Array;

        // Define UV layout in a grid that matches the template generation
        let cols, rows;
        if (faceCount === 4) {
            // D4: 2x2 grid to match template
            cols = 2;
            rows = 2;
        } else if (faceCount === 8) {
            // D8: 3x3 grid to match template
            cols = 3;
            rows = 3;
        } else if (faceCount === 12) {
            // D12: 4x3 grid to match template
            cols = 4;
            rows = 3;
        } else if (faceCount === 20) {
            // D20: 5x4 grid to match template
            cols = 5;
            rows = 4;
        } else {
            // Fallback: square-ish grid
            cols = Math.ceil(Math.sqrt(faceCount));
            rows = Math.ceil(faceCount / cols);
        }

        log(`Applying triangle UV mapping for ${faceCount} faces using ${cols}x${rows} grid`);
        const cellWidth = 1.0 / cols;
        const cellHeight = 1.0 / rows;
        const padding = 0.02; // Small padding between triangles

        for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
            // Calculate grid position
            const col = faceIndex % cols;
            const row = Math.floor(faceIndex / cols);

            // Calculate cell bounds with padding
            const cellLeft = col * cellWidth + padding;
            const cellRight = (col + 1) * cellWidth - padding;
            const cellTop = row * cellHeight + padding;
            const cellBottom = (row + 1) * cellHeight - padding;

            // Calculate cell center and size
            const cellCenterX = (cellLeft + cellRight) / 2;
            const cellCenterY = (cellTop + cellBottom) / 2;
            const cellW = cellRight - cellLeft;
            const cellH = cellBottom - cellTop;

            // Create equilateral triangle that fits within the cell
            const triangleHeight = Math.min(cellH, cellW * Math.sqrt(3) / 2);
            const triangleWidth = triangleHeight * 2 / Math.sqrt(3);

            // All triangles point up for consistency
            const v1 = {
                x: cellCenterX,
                y: cellTop
            };

            const v2 = {
                x: cellCenterX - triangleWidth / 2,
                y: cellTop + triangleHeight
            };

            const v3 = {
                x: cellCenterX + triangleWidth / 2,
                y: cellTop + triangleHeight
            };

            // Ensure triangles don't exceed cell boundaries
            const vertices = [v1, v2, v3];
            vertices.forEach(v => {
                v.x = Math.max(cellLeft, Math.min(cellRight, v.x));
                v.y = Math.max(cellTop, Math.min(cellBottom, v.y));
            });

            // Set UV coordinates for the three vertices of this face
            const vertexOffset = faceIndex * 3;

            // First vertex UVs (RESTORE D20 Y-FLIP)
            uvArray[(vertexOffset * 2)] = v1.x;
            uvArray[(vertexOffset * 2) + 1] = 1.0 - v1.y;

            // Second vertex UVs (RESTORE D20 Y-FLIP)
            uvArray[(vertexOffset * 2) + 2] = v2.x;
            uvArray[(vertexOffset * 2) + 3] = 1.0 - v2.y;

            // Third vertex UVs (RESTORE D20 Y-FLIP)
            uvArray[(vertexOffset * 2) + 4] = v3.x;
            uvArray[(vertexOffset * 2) + 5] = 1.0 - v3.y;
        }

        // Mark UV attribute as needing update
        uvAttribute.needsUpdate = true;

        log(`Applied triangle UV mapping with equilateral triangles for ${faceCount} faces`);
    }

    private applyTetrahedronUVMapping(geometry: THREE.BufferGeometry): void {
        // Convert to non-indexed geometry for proper UV mapping
        const nonIndexedGeometry = geometry.index ? geometry.toNonIndexed() : geometry;
        geometry.attributes = nonIndexedGeometry.attributes;
        geometry.index = null;

        log('Applying tetrahedron UV mapping for D4');

        const uvAttribute = geometry.attributes.uv;
        const uvArray = uvAttribute.array as Float32Array;

        // D4 has exactly 4 triangular faces in a 2x2 grid
        const cols = 2;
        const rows = 2;
        const cellWidth = 1.0 / cols;
        const cellHeight = 1.0 / rows;

        // TetrahedronGeometry has 4 triangular faces
        for (let faceIndex = 0; faceIndex < 4; faceIndex++) {
            const col = faceIndex % cols;
            const row = Math.floor(faceIndex / cols);

            // Equilateral triangles that use full grid cell width
            const cellLeft = col * cellWidth;
            const cellRight = (col + 1) * cellWidth;
            const cellTop = row * cellHeight;
            const cellBottom = (row + 1) * cellHeight;

            const cellCenterX = (cellLeft + cellRight) / 2;
            const cellCenterY = (cellTop + cellBottom) / 2;

            // Equilateral triangle with base = full cell width
            const triangleBase = cellWidth;
            const triangleHeight = triangleBase * Math.sqrt(3) / 2; // Height of equilateral triangle

            // Center the triangle vertically in the cell
            const topX = cellCenterX;
            const topY = cellCenterY - triangleHeight / 2;
            const leftX = cellLeft;
            const leftY = cellCenterY + triangleHeight / 2;
            const rightX = cellRight;
            const rightY = cellCenterY + triangleHeight / 2;

            // Set UV coordinates for the three vertices of this face
            const vertexOffset = faceIndex * 3;

            // First vertex UVs (top vertex)
            uvArray[(vertexOffset * 2)] = topX;
            uvArray[(vertexOffset * 2) + 1] = topY;

            // Second vertex UVs (left vertex)
            uvArray[(vertexOffset * 2) + 2] = leftX;
            uvArray[(vertexOffset * 2) + 3] = leftY;

            // Third vertex UVs (right vertex)
            uvArray[(vertexOffset * 2) + 4] = rightX;
            uvArray[(vertexOffset * 2) + 5] = rightY;
        }

        uvAttribute.needsUpdate = true;
        log('Applied simple tetrahedron UV mapping for D4 with full grid cells');
    }

    private applySquareUVMapping(geometry: THREE.BufferGeometry): void {
        // BoxGeometry has 6 faces, each with 2 triangles (12 triangles total)
        const uvAttribute = geometry.attributes.uv;
        const uvArray = uvAttribute.array as Float32Array;

        log('Applying square UV mapping for D6');

        // Define UV layout in a 3x2 grid for 6 faces to match template
        const cols = 3;
        const rows = 2;
        const cellWidth = 1.0 / cols;
        const cellHeight = 1.0 / rows;
        const padding = 0.02;

        // BoxGeometry face order: right, left, top, bottom, front, back
        // Template grid layout:
        // Row 0: [0-right, 1-left, 2-top]
        // Row 1: [3-bottom, 4-front, 5-back]

        for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
            const col = faceIndex % cols;
            const row = Math.floor(faceIndex / cols);

            const cellLeft = col * cellWidth + padding;
            const cellRight = (col + 1) * cellWidth - padding;
            const cellTop = row * cellHeight + padding;
            const cellBottom = (row + 1) * cellHeight - padding;

            // Each face has 2 triangles with 3 vertices each = 6 vertices
            // BoxGeometry uses 4 unique vertices per face with shared vertices for triangles
            const faceVertexStart = faceIndex * 4;

            // For each face, set UV coordinates for the 4 vertices
            // Fix mirroring by using correct orientation
            const uvCoords = [
                [cellLeft, cellBottom],     // Bottom-left
                [cellRight, cellBottom],    // Bottom-right
                [cellLeft, cellTop],        // Top-left
                [cellRight, cellTop]        // Top-right
            ];

            // Apply UV coordinates to each vertex of this face
            for (let vertexIndex = 0; vertexIndex < 4; vertexIndex++) {
                const uvIndex = (faceVertexStart + vertexIndex) * 2;
                uvArray[uvIndex] = uvCoords[vertexIndex][0];     // U coordinate
                uvArray[uvIndex + 1] = uvCoords[vertexIndex][1]; // V coordinate
            }
        }

        uvAttribute.needsUpdate = true;
        log('Applied square UV mapping for D6 with 3x2 grid layout');
    }

    private applyD12PentagonUVMapping(geometry: THREE.BufferGeometry): void {
        // Convert to non-indexed geometry so each triangle has its own vertices
        const nonIndexedGeometry = geometry.index ? geometry.toNonIndexed() : geometry;
        geometry.attributes = nonIndexedGeometry.attributes;
        geometry.index = null;

        const uvAttribute = geometry.attributes.uv;
        const uvArray = uvAttribute.array as Float32Array;

        log('Applying D12 pentagon UV mapping for 4x3 grid');

        const totalTriangles = uvAttribute.count / 3;
        log(`D12: ${totalTriangles} triangles total`);

        // 4x3 grid for 12 pentagon faces on 1024x1024 image
        const cols = 4;
        const rows = 3;
        const cellWidth = 1.0 / cols;
        const cellHeight = 1.0 / rows;
        const padding = 0.02;

        // DodecahedronGeometry creates 60 triangles (5 per face for center-based triangulation)
        const trianglesPerFace = totalTriangles / 12;
        log(`Triangles per face: ${trianglesPerFace}`);

        // Process each pentagon face
        for (let faceIndex = 0; faceIndex < 12; faceIndex++) {
            // Calculate grid position
            const col = faceIndex % cols;
            const row = Math.floor(faceIndex / cols);

            // Calculate cell bounds with padding
            const cellLeft = col * cellWidth + padding;
            const cellRight = (col + 1) * cellWidth - padding;
            const cellTop = row * cellHeight + padding;
            const cellBottom = (row + 1) * cellHeight - padding;

            const cellCenterX = (cellLeft + cellRight) / 2;
            const cellCenterY = (cellTop + cellBottom) / 2;
            const cellW = cellRight - cellLeft;
            const cellH = cellBottom - cellTop;
            const pentagonRadius = Math.min(cellW, cellH) * 0.4;

            // Generate pentagon vertices: v1 at top, then clockwise v2, v3, v4, v5
            const pentagonVertices = [];
            for (let i = 0; i < 5; i++) {
                // Start from top (-90°) and go clockwise
                const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2 + (Math.PI / 5);
                pentagonVertices.push({
                    x: cellCenterX + Math.cos(angle) * pentagonRadius,
                    y: cellCenterY + Math.sin(angle) * pentagonRadius
                });
            }

            // Now pentagonVertices[0] = v1 (top)
            // pentagonVertices[1] = v2 (clockwise from v1)
            // pentagonVertices[2] = v3 (clockwise from v2)
            // pentagonVertices[3] = v4 (clockwise from v3)
            // pentagonVertices[4] = v5 (clockwise from v4)

            // Map triangles for this face
            const baseTriangle = Math.floor(faceIndex * trianglesPerFace);
            const endTriangle = Math.floor((faceIndex + 1) * trianglesPerFace);

            for (let triangleIdx = baseTriangle; triangleIdx < endTriangle && triangleIdx < totalTriangles; triangleIdx++) {
                const localTriangle = triangleIdx - baseTriangle;
                const vertexOffset = triangleIdx * 3;
                const uvIndex = vertexOffset * 2;

                if (trianglesPerFace === 5) {
                    // 5 triangles per face: fan from center
                    // Each triangle goes from center to two consecutive vertices
                    const v1 = { x: cellCenterX, y: cellCenterY }; // Center
                    const v2 = pentagonVertices[localTriangle % 5];
                    const v3 = pentagonVertices[(localTriangle + 1) % 5];

                    uvArray[uvIndex] = v1.x;
                    uvArray[uvIndex + 1] = v1.y;
                    uvArray[uvIndex + 2] = v2.x;
                    uvArray[uvIndex + 3] = v2.y;
                    uvArray[uvIndex + 4] = v3.x;
                    uvArray[uvIndex + 5] = v3.y;
                } else if (trianglesPerFace === 3) {
                    // 3 triangles per face: fan from v1 (top vertex)
                    if (localTriangle === 0) {
                        // Third triangle: v1, v4, v5
                        uvArray[uvIndex] = pentagonVertices[4].x;     // v1 (top)
                        uvArray[uvIndex + 1] = pentagonVertices[4].y;
                        uvArray[uvIndex + 2] = pentagonVertices[0].x; // v4
                        uvArray[uvIndex + 3] = pentagonVertices[0].y;
                        uvArray[uvIndex + 4] = pentagonVertices[3].x; // v5
                        uvArray[uvIndex + 5] = pentagonVertices[3].y;
                    } else if (localTriangle === 1) {
                        // Second triangle: v1, v3, v4
                        uvArray[uvIndex] = pentagonVertices[2].x;     // v1 (top)
                        uvArray[uvIndex + 1] = pentagonVertices[2].y;
                        uvArray[uvIndex + 2] = pentagonVertices[3].x; // v3
                        uvArray[uvIndex + 3] = pentagonVertices[3].y;
                        uvArray[uvIndex + 4] = pentagonVertices[0].x; // v4
                        uvArray[uvIndex + 5] = pentagonVertices[0].y;
                    } else if (localTriangle === 2) {
                        // First triangle: v1, v2, v3
                        uvArray[uvIndex] = pentagonVertices[0].x;     // v1 (top)
                        uvArray[uvIndex + 1] = pentagonVertices[0].y;
                        uvArray[uvIndex + 2] = pentagonVertices[1].x; // v2 (clockwise from v1)
                        uvArray[uvIndex + 3] = pentagonVertices[1].y;
                        uvArray[uvIndex + 4] = pentagonVertices[2].x; // v3 (clockwise from v2)
                        uvArray[uvIndex + 5] = pentagonVertices[2].y;
                        
                    }
                } else {
                    // Fallback: distribute triangles around pentagon
                    const angle = (localTriangle / trianglesPerFace) * Math.PI * 2;
                    const nextAngle = ((localTriangle + 1) / trianglesPerFace) * Math.PI * 2;

                    uvArray[uvIndex] = cellCenterX;
                    uvArray[uvIndex + 1] = cellCenterY;
                    uvArray[uvIndex + 2] = cellCenterX + Math.cos(angle) * pentagonRadius;
                    uvArray[uvIndex + 3] = cellCenterY + Math.sin(angle) * pentagonRadius;
                    uvArray[uvIndex + 4] = cellCenterX + Math.cos(nextAngle) * pentagonRadius;
                    uvArray[uvIndex + 5] = cellCenterY + Math.sin(nextAngle) * pentagonRadius;
                }
            }
        }

        uvAttribute.needsUpdate = true;
        log('Applied adaptive D12 pentagon UV mapping');
    }

    // ============================================================================
    // MULTI-DICE HELPER METHODS
    // ============================================================================

    private getFaceCountForDiceType(diceType: string): number {
        switch (this.solidFor(diceType)) {
            case 'd4': return 4;
            case 'd6': return 6;
            case 'd8': return 8;
            case 'd10': return 10;
            case 'd12': return 12;
            case 'd20': return 20;
            default: return 20;
        }
    }

    createSingleDice(diceType: string): void {
        // Create geometry based on dice type
        const geometry = this.createGeometryForDiceType(diceType);

        // Apply UV mapping
        this.applyUVMappingForDiceType(geometry, diceType);

        // Create material with individual scaling
        const material = this.createMaterialForDiceType(diceType);

        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);

        // Position dice to prevent overlapping
        const position = this.getNextDicePosition(diceType);
        mesh.position.copy(position);

        // Create physics body
        const body = this.createPhysicsBodyForDiceType(diceType);
        body.position.set(position.x, position.y, position.z);

        // Add to scene and world
        this.scene.add(mesh);
        this.world.addBody(body);

        // Add to tracking arrays
        this.diceArray.push(mesh);
        this.diceBodyArray.push(body);
        this.diceTypeArray.push(diceType);

        this.wake();
    }

    /**
     * Round the rim off, without a single extra vertex.
     *
     * A chamfer built the obvious way is a ring of flat facets, and flat facets
     * read as exactly that: the edge stops being sharp and starts being a
     * bevel, which is a different hard edge. Real dice do not have either - the
     * light slides round the corner.
     *
     * Nothing here changes the shape. Every rim vertex sits on top of vertices
     * belonging to its neighbours - the facets either side of it, and the
     * numbered face it runs alongside - so averaging the normals that meet at a
     * point and pointing all of them the same way makes the light travel
     * continuously across the rim and off onto the face. The silhouette stays
     * faceted, but at a tenth of a die nobody is reading the silhouette.
     *
     * Numbered faces are left alone. They are the part being read, they are
     * meant to be flat, and bending their normals would shade the digit
     * unevenly. Only the rim gets it, so the join is one-sided: the rim leans
     * towards the face it meets and the face does not lean back.
     */
    private softenRim(geometry: THREE.BufferGeometry, rimStart: number, smooth: number): void {
        if (smooth <= 0) return;
        const position = geometry.attributes.position;
        const normal = geometry.attributes.normal;

        // Normals meeting at each point, from the whole die - the numbered faces
        // included, which is what lets the rim blend into them.
        const points: THREE.Vector3[] = [];
        const summed: THREE.Vector3[] = [];
        const at: number[] = [];
        const point = new THREE.Vector3();
        for (let v = 0; v < position.count; v++) {
            point.fromBufferAttribute(position, v);
            let found = points.findIndex((p) => p.distanceToSquared(point) < 1e-8);
            if (found < 0) {
                found = points.push(point.clone()) - 1;
                summed.push(new THREE.Vector3());
            }
            at.push(found);
            summed[found].add(new THREE.Vector3().fromBufferAttribute(normal, v));
        }

        const flat = new THREE.Vector3();
        for (let v = rimStart; v < position.count; v++) {
            const shared = summed[at[v]];
            if (shared.lengthSq() < 1e-12) continue;
            flat.fromBufferAttribute(normal, v);
            flat.lerp(shared.clone().normalize(), smooth).normalize();
            normal.setXYZ(v, flat.x, flat.y, flat.z);
        }
        normal.needsUpdate = true;
    }

    /**
     * Take the edges off a die.
     *
     * Real dice are not sharp, and under this tray's orthographic camera - which
     * looks straight down - a sharp solid loses most of what says it is solid: a
     * cube projects to a plain square and reads as a paper tile. The rim strips
     * face partly sideways, so they take the key light at their own angle and
     * draw a lit border around whatever number is up.
     *
     * Every face is pulled in towards its own centre, which leaves it flat, in
     * the same plane, and the same shape - so the atlas still lands on it
     * exactly as before. The gap that opens along each edge is bridged by a
     * strip, and the gap at each corner by a cap. Those come after the numbered
     * faces in the buffer, so anything walking faces by index has to be told
     * where they stop; that is what faceVertexCount is for.
     *
     * Shrinking towards the centre is a true chamfer only for a regular face.
     * The d10's kites are not regular and come out very slightly uneven, which
     * at the width of a rim is not a thing anyone can see.
     *
     * Physics keeps the full sharp hull. A tenth of a face is not worth a second
     * collision shape, and a die that looks a hair smaller than it collides is
     * the error nobody notices.
     */
    private chamferGeometry(
        source: THREE.BufferGeometry,
        faceCount: number,
        bevel: number,
        rimUV: [number, number],
        smooth: number
    ): THREE.BufferGeometry {
        const geometry = source.index ? source.toNonIndexed() : source;
        if (geometry !== source) source.dispose();

        const pos = geometry.attributes.position;
        const uvAttribute = geometry.attributes.uv;
        const perFace = pos.count / faceCount;
        if (!Number.isInteger(perFace) || perFace < 3) return geometry;

        // Which of the die's corners each buffer vertex sits on. Faces share
        // corners, and the strips and caps are built out of that sharing.
        const corners: THREE.Vector3[] = [];
        const cornerOf: number[] = [];
        for (let v = 0; v < pos.count; v++) {
            const point = new THREE.Vector3().fromBufferAttribute(pos, v);
            let at = corners.findIndex((c) => c.distanceToSquared(point) < 1e-8);
            if (at < 0) at = corners.push(point) - 1;
            cornerOf.push(at);
        }

        const positions = Array.from(pos.array as Float32Array);
        const uvs = uvAttribute ? Array.from(uvAttribute.array as Float32Array) : [];
        const indices: number[] = [];
        for (let i = 0; i < pos.count; i += 3) indices.push(i, i + 1, i + 2);

        // Where each corner of each face ends up once the face is pulled in.
        const pulled: Array<Map<number, THREE.Vector3>> = [];
        const ring: number[][] = [];

        for (let face = 0; face < faceCount; face++) {
            const base = face * perFace;
            const own: number[] = [];
            for (let v = 0; v < perFace; v++) {
                const at = cornerOf[base + v];
                if (!own.includes(at)) own.push(at);
            }

            const centre = own
                .reduce((sum, at) => sum.add(corners[at].clone()), new THREE.Vector3())
                .divideScalar(own.length);
            const span = own.reduce((most, at) => Math.max(most, corners[at].distanceTo(centre)), 0);
            const keep = span > 1e-6 ? Math.max(0, 1 - bevel / span) : 1;

            const moved = new Map<number, THREE.Vector3>();
            for (const at of own) {
                moved.set(at, centre.clone().lerp(corners[at], keep));
            }
            pulled.push(moved);

            for (let v = 0; v < perFace; v++) {
                const to = moved.get(cornerOf[base + v])!;
                positions[(base + v) * 3] = to.x;
                positions[(base + v) * 3 + 1] = to.y;
                positions[(base + v) * 3 + 2] = to.z;
            }

            // Corners walked round the face, so a strip knows which pairs are
            // edges and a cap knows which faces sit either side of it.
            const normal = new THREE.Vector3().crossVectors(
                corners[own[1]].clone().sub(corners[own[0]]),
                corners[own[2]].clone().sub(corners[own[0]])
            ).normalize();
            const across = corners[own[0]].clone().sub(centre).normalize();
            const along = new THREE.Vector3().crossVectors(normal, across);
            ring.push(own.slice().sort((a, b) => {
                const oa = corners[a].clone().sub(centre);
                const ob = corners[b].clone().sub(centre);
                return Math.atan2(oa.dot(along), oa.dot(across)) - Math.atan2(ob.dot(along), ob.dot(across));
            }));
        }

        /** Add one outward-facing patch, winding it away from the middle. */
        const patch = (points: THREE.Vector3[]) => {
            const first = positions.length / 3;
            const centre = points
                .reduce((sum, p) => sum.add(p.clone()), new THREE.Vector3())
                .divideScalar(points.length);
            const facing = new THREE.Vector3()
                .crossVectors(points[1].clone().sub(points[0]), points[2].clone().sub(points[0]));
            const ordered = facing.dot(centre) > 0 ? points : points.slice().reverse();

            for (const p of ordered) {
                positions.push(p.x, p.y, p.z);
                if (uvAttribute) uvs.push(rimUV[0], rimUV[1]);
            }
            for (let i = 1; i + 1 < ordered.length; i++) {
                indices.push(first, first + i, first + i + 1);
            }
        };

        // One strip per edge. An edge belongs to exactly two faces on a closed
        // solid, and anything else is not a die.
        const edges = new Map<string, Array<{ face: number; from: number; to: number }>>();
        for (let face = 0; face < faceCount; face++) {
            const round = ring[face];
            for (let i = 0; i < round.length; i++) {
                const from = round[i];
                const to = round[(i + 1) % round.length];
                const key = from < to ? `${from}:${to}` : `${to}:${from}`;
                if (!edges.has(key)) edges.set(key, []);
                edges.get(key)!.push({ face, from, to });
            }
        }
        for (const [, sides] of edges) {
            if (sides.length !== 2) continue;
            const [a, b] = sides;
            patch([
                pulled[a.face].get(a.from)!,
                pulled[a.face].get(a.to)!,
                pulled[b.face].get(a.to)!,
                pulled[b.face].get(a.from)!
            ]);
        }

        // One cap per corner, closing the hole the strips leave around it.
        for (let at = 0; at < corners.length; at++) {
            const meeting = pulled
                .map((moved, face) => ({ face, point: moved.get(at) }))
                .filter((entry) => entry.point) as Array<{ face: number; point: THREE.Vector3 }>;
            if (meeting.length < 3) continue;

            const out = corners[at].clone().normalize();
            const across = meeting[0].point.clone()
                .sub(corners[at]).sub(out.clone().multiplyScalar(meeting[0].point.clone().sub(corners[at]).dot(out)))
                .normalize();
            const along = new THREE.Vector3().crossVectors(out, across);
            meeting.sort((x, y) => {
                const ox = x.point.clone().sub(corners[at]);
                const oy = y.point.clone().sub(corners[at]);
                return Math.atan2(ox.dot(along), ox.dot(across)) - Math.atan2(oy.dot(along), oy.dot(across));
            });
            patch(meeting.map((entry) => entry.point));
        }

        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        if (uvAttribute) out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        out.setIndex(indices);
        // Safe to derive: no numbered face shares a vertex with a strip or a
        // cap, so averaging leaves every one of them flat.
        out.computeVertexNormals();
        this.softenRim(out, faceCount * perFace, smooth);
        out.userData.faceVertexCount = perFace;
        // Which corner of the die each numbered vertex used to sit on. Pulling
        // the faces apart is what makes room for the rim, and it also means they
        // no longer share vertices - so the corner a face omits, which is the
        // whole of how a d4 is read, cannot be recovered from the result. Keep
        // the answer from before the faces moved.
        out.userData.cornerOf = cornerOf.slice(0, faceCount * perFace);
        geometry.dispose();
        return out;
    }

    private createGeometryForDiceType(diceType: string): THREE.BufferGeometry {
        const baseSize = this.settings.diceSize;
        const scale = this.scaleFor(diceType);
        const size = baseSize * scale;

        let geometry: THREE.BufferGeometry;
        switch (this.solidFor(diceType)) {
            case 'd4':
                geometry = new THREE.TetrahedronGeometry(size, 0);
                break;
            case 'd6':
                geometry = new THREE.BoxGeometry(size * 2, size * 2, size * 2);
                break;
            case 'd8':
                geometry = new THREE.OctahedronGeometry(size, 0);
                break;
            case 'd10':
                geometry = this.createD10PolyhedronGeometry(size);
                break;
            case 'd12':
                geometry = new THREE.DodecahedronGeometry(size, 0);
                break;
            case 'd20':
            default:
                geometry = new THREE.IcosahedronGeometry(size, 0);
                break;
        }

        const bevel = this.pack.bevel || BEVEL_FALLBACK;
        if (bevel.enabled === false) return geometry;
        return this.chamferGeometry(
            geometry,
            this.getFaceCountForDiceType(diceType),
            size * (bevel.depth ?? BEVEL_FALLBACK.depth),
            this.packDie(diceType).rimUV || PACK_FALLBACK.rimUV,
            Math.min(1, Math.max(0, bevel.smooth ?? BEVEL_FALLBACK.smooth))
        );
    }

    /**
     * Lay a die's faces onto the cells of its atlas.
     *
     * Each face keeps the geometry's own unit-square UVs and has them mapped
     * into the cell printed with that face's number, rotated as the cell
     * demands. Working from the geometry's own UVs rather than writing corners
     * by hand means the face comes out the way three.js intended it to, mirrored
     * the same way and wound the same way.
     */
    private applyQuadAtlasUV(geometry: THREE.BufferGeometry, diceType: string): boolean {
        const atlas = this.packDie(diceType).grid;
        const numbers = this.numbersFor(diceType);
        if (!atlas || !numbers) return false;

        const uv = geometry.attributes.uv;
        if (!uv) return false;

        // A chamfered die parks its rim vertices after the numbered faces, so
        // the buffer no longer divides evenly into them; it says how long a face
        // is. Everything else is still a plain slice.
        const verticesPerFace = (geometry.userData.faceVertexCount as number)
            || uv.count / numbers.length;

        for (let face = 0; face < numbers.length; face++) {
            const cell = atlas.cells.find((c) => c.number === numbers[face]);
            if (!cell) continue;

            for (let v = 0; v < verticesPerFace; v++) {
                const at = face * verticesPerFace + v;
                let u0 = uv.getX(at);
                let v0 = uv.getY(at);

                for (let turn = 0; turn < cell.rotation; turn++) {
                    const spun = u0;
                    u0 = v0;
                    v0 = 1 - spun;
                }

                // Rows count downwards in the image, upwards in UV space.
                uv.setXY(
                    at,
                    (cell.col + u0) / atlas.cols,
                    (atlas.rows - 1 - cell.row + v0) / atlas.rows
                );
            }
        }

        uv.needsUpdate = true;
        return true;
    }

    /**
     * Lay a die's faces onto the cells of a net that is not a grid.
     *
     * Unlike the quad atlas there are no per-face UVs worth keeping: three.js
     * gives a polyhedron a spherical projection, which has nothing to do with
     * where the art is. So each corner of a face is assigned a corner of its
     * cell outright, `turn` choosing where the run starts and `mirror` which way
     * it goes round.
     */
    private applyPolyAtlasUV(geometry: THREE.BufferGeometry, diceType: string): boolean {
        const die = this.packDie(diceType);
        const atlas = die.faces && die.sheetSize ? { size: die.sheetSize, faces: die.faces } : null;
        const numbers = this.numbersFor(diceType);
        if (!atlas || !numbers) return false;

        const uv = geometry.attributes.uv;
        if (!uv) return false;

        // A bevelled die parks its rim after the numbered faces, so the buffer
        // no longer divides evenly into them; it says how long a face is.
        const verticesPerFace = (geometry.userData.faceVertexCount as number)
            || uv.count / numbers.length;
        if (!Number.isInteger(verticesPerFace)) return false;
        const position = geometry.attributes.position;

        for (let face = 0; face < numbers.length; face++) {
            const cell = atlas.faces.find((f) => f.number === numbers[face]);
            if (!cell) continue;

            // Read the cell backwards.
            //
            // A net is drawn to be looked at from outside the folded die - that
            // is what makes it a net - so walking a cell's corners as the image
            // draws them goes round the face the opposite way from walking the
            // face's own corners, which are wound outward. Taking them in the
            // order given turns every face into its own mirror image: the digits
            // still land in the right places, still upright, still on the right
            // faces, and every one of them back to front.
            //
            // It survived a long time because nothing compares a die with
            // anything outside itself. Faces agreeing with each other says only
            // that they are all wrong the same way, and a mirrored polygon has
            // exactly the edge lengths of an unmirrored one. What catches it is
            // posing a face at the camera and asking whether the walk turns the
            // same way on screen as it does in the image.
            //
            // The d6 does not come through here and is not affected: its net
            // lies on a grid, so it keeps three.js's own face UVs and only has
            // them moved onto the right cell.
            const wound = cell.corners.slice().reverse();
            const sides = wound.length;
            const base = face * verticesPerFace;

            if (cell.vertices) {
                // Corner-read art names its corners rather than walking them, so
                // reversing the corners alone is what flips it - the names stay
                // where they are and now describe the mirrored positions.
                const owners = this.cornerNumbersForFace(geometry, face, verticesPerFace, numbers.length);
                for (let v = 0; v < verticesPerFace; v++) {
                    const at = cell.vertices.indexOf(owners[v]);
                    if (at < 0) continue;
                    const corner = wound[at];
                    uv.setXY(base + v, corner[0] / atlas.size, 1 - corner[1] / atlas.size);
                }
                continue;
            }
            // A triangle arrives as three vertices in order and needs no work.
            // A pentagon does not: three.js hands a dodecahedron's face over as
            // nine vertices - three triangles cut off a strip, not a fan - so
            // they repeat, and the order they repeat in says nothing about the
            // way round the pentagon goes. Walking them by angle does.
            const ring = verticesPerFace === sides ? null : this.ringOrderForFace(position, base, verticesPerFace);
            // The cell has to be anchored by the same rule the face was, or the
            // two agree on where the walk starts only by luck.
            const anchor = ring ? this.anchorCorner(wound) : -1;
            const corners = anchor < 0
                ? wound
                : wound.slice(anchor).concat(wound.slice(0, anchor));

            for (let v = 0; v < verticesPerFace; v++) {
                const seat = ring ? ring[v] : v;
                const step = cell.mirror ? -seat : seat;
                const corner = corners[(((step + cell.turn) % sides) + sides) % sides];
                // Rows count downwards in the image, upwards in UV space.
                uv.setXY(base + v, corner[0] / atlas.size, 1 - corner[1] / atlas.size);
            }
        }

        uv.needsUpdate = true;
        return true;
    }

    /**
     * Seat each of a face's vertices at a corner of its polygon.
     *
     * Repeated vertices are collapsed by position, the survivors are sorted by
     * their angle about the face centre, and every vertex is given the seat its
     * position earned. Sorting about the face's own normal rather than about
     * anything in world space keeps the direction of travel the same for all
     * faces, which is what stops half a die coming out mirrored.
     */
    /**
     * The corner a lopsided shape can be lined up by, or -1 if it has none.
     *
     * Walking a face's corners in order fixes the direction of travel but not
     * where the walk starts, and where it starts is decided by whichever vertex
     * three.js happened to write first. For a triangle or a pentagon that costs
     * nothing - every corner is like every other, so a different start is only a
     * rotation, and these faces land at whatever angle they land at anyway.
     *
     * A kite has no such symmetry. Start one corner out and its long diagonal is
     * laid along the sheet's short one: the digit still appears, stretched, so
     * it survives being looked at. Eight of the d10's ten faces were seated that
     * way and only the diagonals gave it away. So a shape with one corner
     * plainly further from the middle than the rest is anchored there, at both
     * ends of the mapping, and a shape without one is left alone.
     */
    private anchorCorner(points: Array<[number, number] | THREE.Vector3>): number {
        const at = (p: [number, number] | THREE.Vector3) =>
            Array.isArray(p) ? new THREE.Vector3(p[0], p[1], 0) : p;
        const centre = points
            .reduce((sum, p) => sum.add(at(p).clone()), new THREE.Vector3())
            .divideScalar(points.length);
        const spans = points.map((p) => at(p).distanceTo(centre));
        const sorted = spans.slice().sort((a, b) => b - a);
        if (sorted[0] < sorted[1] * 1.02) return -1;
        return spans.indexOf(sorted[0]);
    }

    private ringOrderForFace(
        position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
        base: number,
        count: number
    ): number[] {
        const points: THREE.Vector3[] = [];
        for (let v = 0; v < count; v++) {
            points.push(new THREE.Vector3().fromBufferAttribute(position, base + v));
        }

        const corners: THREE.Vector3[] = [];
        const seatOf = points.map((p) => {
            let at = corners.findIndex((c) => c.distanceToSquared(p) < 1e-8);
            if (at < 0) at = corners.push(p) - 1;
            return at;
        });

        const centre = corners
            .reduce((sum, c) => sum.add(c), new THREE.Vector3())
            .divideScalar(corners.length);
        const normal = new THREE.Vector3()
            .crossVectors(
                points[1].clone().sub(points[0]),
                points[2].clone().sub(points[0])
            )
            .normalize();
        // Point it outward before using it. Taken from the first three vertices
        // as they happen to be written, this normal points whichever way that
        // triangle is wound, and the two halves of a d10 are not wound the same
        // way. An inward normal reverses the walk, which mirrors the face - and
        // a mirrored kite has exactly the edge lengths of an unmirrored one, so
        // it survives every check that measures the shape. Five of the ten faces
        // came out back to front.
        if (normal.dot(centre) < 0) normal.negate();
        const across = corners[0].clone().sub(centre).normalize();
        const along = new THREE.Vector3().crossVectors(normal, across);

        const order = corners
            .map((c, at) => {
                const offset = c.clone().sub(centre);
                return { at, angle: Math.atan2(offset.dot(along), offset.dot(across)) };
            })
            .sort((a, b) => a.angle - b.angle)
            .map((entry) => entry.at);

        const anchor = this.anchorCorner(corners);
        const from = anchor < 0 ? 0 : order.indexOf(anchor);
        const anchored = order.slice(from).concat(order.slice(0, from));

        const seatFor = new Array<number>(corners.length);
        anchored.forEach((corner, seat) => { seatFor[corner] = seat; });
        return seatOf.map((corner) => seatFor[corner]);
    }

    /**
     * Number every corner of a face, for corner-read art.
     *
     * A tetrahedron's face leaves exactly one of the die's four corners out, and
     * that is the corner you read when the die rests on that face - so the
     * corner a face omits carries that face's own number. Numbering the corners
     * that way costs nothing to derive and leaves no choice to make: each
     * corner's number falls out of which face does not touch it.
     */
    private cornerNumbersForFace(
        geometry: THREE.BufferGeometry,
        face: number,
        verticesPerFace: number,
        faceCount: number
    ): number[] {
        const position = geometry.attributes.position;
        const numbered = faceCount * verticesPerFace;

        // A bevelled die has had its faces pulled apart to make room for the
        // rim, so they no longer share vertices and which corner is which cannot
        // be read back off the positions - every face would look like it had
        // three corners of its own, nothing would be omitted, and the d4 lost
        // its digits entirely. The chamfer keeps the answer from before it moved
        // them.
        const kept = geometry.userData.cornerOf as number[] | undefined;
        const cornerOf: number[] = kept ? kept.slice(0, numbered) : [];
        if (!kept) {
            const corners: THREE.Vector3[] = [];
            for (let v = 0; v < numbered; v++) {
                const point = new THREE.Vector3().fromBufferAttribute(position, v);
                let at = corners.findIndex((c) => c.distanceToSquared(point) < 1e-8);
                if (at < 0) at = corners.push(point) - 1;
                cornerOf.push(at);
            }
        }
        const cornerCount = Math.max(...cornerOf) + 1;

        const numberOfCorner = new Array<number>(cornerCount).fill(0);
        for (let f = 0; f < faceCount; f++) {
            const touched = new Set(cornerOf.slice(f * verticesPerFace, (f + 1) * verticesPerFace));
            for (let c = 0; c < cornerCount; c++) {
                if (!touched.has(c)) numberOfCorner[c] = f + 1;
            }
        }

        const out: number[] = [];
        for (let v = 0; v < verticesPerFace; v++) {
            out.push(numberOfCorner[cornerOf[face * verticesPerFace + v]]);
        }
        return out;
    }

    private applyUVMappingForDiceType(geometry: THREE.BufferGeometry, diceType: string): void {
        // A type with an atlas is laid out from it; the rest keep the old
        // hand-built grids until their sheets are mapped too.
        if (this.applyQuadAtlasUV(geometry, diceType)) return;
        if (this.applyPolyAtlasUV(geometry, diceType)) return;

        switch (diceType) {
            case 'd4':
                this.applyTriangleUVMapping(geometry, 4);
                break;
            case 'd6':
                this.applySquareUVMapping(geometry);
                break;
            case 'd8':
                this.applyTriangleUVMapping(geometry, 8);
                break;
            case 'd10':
                this.applyD10UVMapping(geometry);
                break;
            case 'd12':
                this.applyD12PentagonUVMapping(geometry);
                break;
            case 'd20':
            default:
                this.applyTriangleUVMapping(geometry, 20);
                break;
        }
    }

    /** How the set is finished. */
    private packFinish(): { shininess: number; specular: string; transparent: boolean; opacity: number } {
        const finish = this.pack.material || {};
        return {
            shininess: finish.shininess ?? 100,
            specular: finish.specular ?? '#222222',
            transparent: finish.transparent ?? false,
            opacity: finish.opacity ?? 1
        };
    }

    private createMaterialForDiceType(diceType: string): THREE.MeshPhongMaterial {
        const materialProps: any = {
            color: this.colorFor(diceType),
            ...this.packFinish()
        };

        // Apply dice texture if available
        const textureData = this.getDiceTextureDataForType(diceType);
        if (textureData) {
            const texture = this.loadTextureFromData(
                textureData,
                this.colorFor(diceType),
                this.packDie(diceType).rimUV || PACK_FALLBACK.rimUV
            );
            if (texture) {
                materialProps.map = texture;
                // The die colour is already painted into the texture. Leaving it
                // here too would multiply it in a second time and put back the
                // dark, low-contrast face the composite exists to fix.
                materialProps.color = 0xffffff;
            }
        }

        // Apply normal map if available
        const normalMapData = this.getDiceNormalMapDataForType(diceType);
        if (normalMapData) {
            const normalMap = this.loadNormalMapFromData(normalMapData);
            if (normalMap) {
                materialProps.normalMap = normalMap;
            }
        }

        return new THREE.MeshPhongMaterial(materialProps);
    }

    /**
     * Where a die's face art comes from.
     *
     * A texture pack wins over an uploaded texture. The pack is a folder of
     * `<type>_Numbers.png` files handed over as `app://` resource URLs, which
     * THREE.TextureLoader takes directly - no base64, and none of it stored in
     * data.json.
     */
    private getDiceTextureDataForType(diceType: string): string | null {
        return this.packTextures[diceType] || null;
    }

    /** Resource URLs for the selected pack, keyed by die type. */
    private packTextures: Record<string, string> = {};
    private packNormals: Record<string, string> = {};

    public setPackTextures(textures: Record<string, string>, normals: Record<string, string> = {}): void {
        this.packTextures = textures;
        this.packNormals = normals;
        this.wake();
    }

    private getDiceNormalMapDataForType(diceType: string): string | null {
        return this.packNormals[diceType] || null;
    }

    /**
     * Give the bevel's rim the same wash the faces wear.
     *
     * A sheet paints two things over the die's colour: a faint wash across every
     * face, and the digits. The rim samples blank sheet, where there is no wash
     * - so it came out the die's colour undarkened while every face came out
     * about a sixth darker, and the bevel read as a brighter stripe round a
     * duller die rather than as part of it.
     *
     * The wash is measured off the sheet rather than declared: it is the
     * commonest colour-and-alpha the sheet paints, once the digits are set aside
     * as the opaque end. Laying that over the rim's corner of the canvas exactly
     * as a cell lays it over a face leaves the two the same colour, whatever the
     * pack is and whatever colour it is.
     *
     * Measured from the sheet and not from the finished composite: by then the
     * wash has already been blended into the die's colour, and telling a washed
     * red apart from a plain one means knowing which is which beforehand.
     */
    private paintRimPatch(
        ctx: CanvasRenderingContext2D,
        canvas: HTMLCanvasElement,
        img: HTMLImageElement,
        color: string,
        rimUV?: [number, number]
    ): void {
        if (!rimUV) return;

        const scratch = document.createElement('canvas');
        scratch.width = img.width;
        scratch.height = img.height;
        const sheet = scratch.getContext('2d', { willReadFrequently: true });
        if (!sheet) return;
        sheet.drawImage(img, 0, 0);

        let pixels: Uint8ClampedArray;
        try {
            pixels = sheet.getImageData(0, 0, img.width, img.height).data;
        } catch {
            // A sheet from somewhere that taints the canvas. The rim keeps the
            // plain colour, which is the old behaviour rather than a failure.
            return;
        }

        // Commonest painted colour, digits set aside. Every 37th pixel is ample
        // for something this flat and keeps it off the critical path.
        const seen = new Map<number, number>();
        for (let i = 0; i < pixels.length; i += 4 * 37) {
            const alpha = pixels[i + 3];
            if (alpha <= 8 || alpha > 240) continue;
            const packed = (pixels[i] << 24) | (pixels[i + 1] << 16) | (pixels[i + 2] << 8) | alpha;
            seen.set(packed, (seen.get(packed) || 0) + 1);
        }

        let wash = 0, most = 0;
        for (const [packed, count] of seen) {
            if (count > most) { most = count; wash = packed; }
        }
        if (!most) return;

        // A patch rather than a pixel: mipmaps average neighbours, and a lone
        // texel would be blended away at the sizes a die is actually drawn.
        const size = Math.max(8, Math.round(Math.min(canvas.width, canvas.height) / 32));
        const x = Math.round(rimUV[0] * canvas.width) - size / 2;
        const y = Math.round((1 - rimUV[1]) * canvas.height) - size / 2;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = `rgba(${(wash >>> 24) & 255}, ${(wash >> 16) & 255}, ${(wash >> 8) & 255}, ${(wash & 255) / 255})`;
        ctx.fillRect(x, y, size, size);
    }

    /**
     * Face art is a *mask*, not a picture, and has to be composited rather than
     * tinted.
     *
     * A pack sheet is transparent outside the net, a faint dark wash inside each
     * cell (rgb 88 at alpha 64), and opaque white digits. Handed straight to
     * `map` with `color: diceColor`, three multiplies the tint into the sampled
     * rgb and throws the alpha away - so the face came out as 88x tint and the
     * digits as 255x tint. Both ended up the same hue, one merely lighter: a red
     * die read as a dark maroon square with a slightly brighter red numeral on
     * it, about 1.2:1 apart.
     *
     * Painting the sheet over the die colour instead uses the alpha the art was
     * drawn with: the wash darkens the body a little and the digits stay white,
     * whatever colour the die is. The material then has to be left white or the
     * old multiply comes straight back.
     */
    private loadTextureFromData(
        textureData: string,
        color: string,
        rimUV?: [number, number]
    ): THREE.Texture | null {
        const key = `${textureData}|${color}|${rimUV ? rimUV.join(',') : ''}`;
        const cached = this.textureCache.get(key);
        if (cached) return cached;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return this.loadCachedTexture(textureData, 'dice texture');

        // Until the art decodes the die wears its plain colour, not a black or
        // untextured flash.
        canvas.width = canvas.height = 1;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        // The canvas is painted in sRGB. Left unlabelled, three reads those
        // bytes as linear and encodes them again on the way out, which lifts the
        // midtones: a saturated red die came out a dusty pink.
        texture.colorSpace = THREE.SRGBColorSpace;

        const img = new Image();
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            this.paintRimPatch(ctx, canvas, img, color, rimUV);
            // The placeholder above is 1x1, and the GPU allocation three made
            // for it does not grow: mark the texture dirty on its own and the
            // repaint is uploaded into a one-pixel target, so every face samples
            // the same flat colour and the digits never appear. Dropping the
            // allocation first makes the next render build one at 1024.
            texture.dispose();
            texture.needsUpdate = true;
            // Same reason as the loader callback below: decoding is async and
            // the render loop may already have gone idle.
            this.wake();
        };
        img.onerror = () => console.warn('Failed to load dice texture');
        img.src = textureData;

        // A die colour change asks for a fresh composite of art already in the
        // cache; the stale one would otherwise sit there holding a GPU texture
        // for a colour nothing renders any more.
        for (const [otherKey, otherTexture] of this.textureCache) {
            if (otherKey !== key && otherKey.startsWith(`${textureData}|`)) {
                otherTexture.dispose();
                this.textureCache.delete(otherKey);
            }
        }
        this.textureCache.set(key, texture);
        return texture;
    }

    private loadNormalMapFromData(normalMapData: string): THREE.Texture | null {
        return this.loadCachedTexture(normalMapData, 'dice normal map');
    }

    /**
     * One THREE.Texture per distinct image rather than one per die. The d20
     * face sheet is about a megabyte of base64 and a full tray used to upload
     * its own copy of it for every single die.
     */
    private loadCachedTexture(data: string, label: string): THREE.Texture | null {
        const cached = this.textureCache.get(data);
        if (cached) return cached;

        try {
            const texture = new THREE.TextureLoader().load(
                data,
                // Decoding is asynchronous. Without this the image can arrive
                // after the render loop has gone idle, leaving an untextured die
                // on screen until something else happens to wake it.
                () => this.wake()
            );
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            this.textureCache.set(data, texture);
            return texture;
        } catch (error) {
            console.warn(`Failed to load ${label}:`, error);
            return null;
        }
    }

    private createPhysicsBodyForDiceType(diceType: string): CANNON.Body {
        const baseSize = this.settings.diceSize;
        const scale = this.scaleFor(diceType);
        const size = baseSize * scale;

        // Create proper physics shape based on dice type
        const shape = this.createPhysicsShapeForDiceType(diceType, size);

        const body = new CANNON.Body({
            mass: 1,
            material: D20Dice.bodyMaterial
        });

        body.addShape(shape);
        body.linearDamping = 0.1; // Normal damping
        body.angularDamping = 0.1; // Normal damping

        // Enable sleeping for better performance
        body.allowSleep = true;
        body.sleepSpeedLimit = 0.1;
        body.sleepTimeLimit = 1;

        return body;
    }

    private createPhysicsShapeForDiceType(rawType: string, size: number): CANNON.Shape {
        const diceType = this.solidFor(rawType);
        // Every die of a given type and size has the same hull, and building one
        // costs a whole throwaway BufferGeometry, so keep them.
        const cacheKey = `${diceType}:${size.toFixed(4)}`;
        const cached = D20Dice.shapeCache.get(cacheKey);
        if (cached) return cached;

        let shape: CANNON.Shape;
        switch (diceType) {
            case 'd6':
                // D6 uses box shape for proper cube physics
                shape = new CANNON.Box(new CANNON.Vec3(size, size, size));
                break;

            case 'd4':
            case 'd8':
            case 'd10':
            case 'd12':
            case 'd20': {
                // For complex shapes, create convex polyhedron from geometry
                const geometry = this.createGeometryForDiceType(diceType);
                shape = this.createConvexPolyhedronFromGeometry(geometry);
                geometry.dispose(); // Clean up geometry after creating physics shape
                break;
            }

            default:
                // Fallback to sphere for unknown dice types
                console.warn(`Unknown dice type ${diceType}, using sphere shape`);
                shape = new CANNON.Sphere(size);
        }

        // The size comes off a slider, so the key space is not bounded. Dropping
        // the whole map is fine — it only costs the next build.
        if (D20Dice.shapeCache.size > 24) D20Dice.shapeCache.clear();
        D20Dice.shapeCache.set(cacheKey, shape);
        return shape;
    }

    private getNextDicePosition(diceType = 'd20'): THREE.Vector3 {
        const gridSize = 2.5; // Space between dice
        const cols = 8; // Dice per row
        const totalDice = this.diceArray.length;

        const col = totalDice % cols;
        const row = Math.floor(totalDice / cols);

        // Spawn at about resting height rather than two units up.
        //
        // The camera looks straight down, so a die falling vertically does not
        // move on screen at all — but its shadow does, because the offset from
        // the leaning shadow light is proportional to height. Dropping a die
        // from 2 units made the shadow slide 32 px out from under a die that
        // appeared perfectly still, which reads as a second object moving on its
        // own rather than as a die falling.
        const scale = this.scaleFor(diceType);
        const restingHeight = this.settings.diceSize * scale;

        return new THREE.Vector3(
            (col - cols / 2) * gridSize,
            this.floorHeight + restingHeight,
            (row - 2) * gridSize
        );
    }


    clearAllDice(): void {
        // Remove all dice from scene
        for (const mesh of this.diceArray) {
            this.scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material && !Array.isArray(mesh.material)) {
                mesh.material.dispose();
            }
        }

        // Remove all physics bodies
        for (const body of this.diceBodyArray) {
            this.world.removeBody(body);
        }

        // Clear arrays
        this.diceArray.length = 0;
        this.diceBodyArray.length = 0;
        this.diceTypeArray.length = 0;
        this.selectedDice.length = 0;
        this.draggedDiceIndex = -1;
        this.originalMaterials.forEach((material) => {
            const list = Array.isArray(material) ? material : [material];
            for (const entry of list) entry?.dispose();
        });
        this.originalMaterials.clear();

        for (const type of Object.keys(this.settings.diceCounts)) {
            (this.settings.diceCounts as any)[type] = 0;
        }

        this.wake();
    }

    removeSingleDice(diceType: string): boolean {
        // Find the last dice of the specified type
        for (let i = this.diceTypeArray.length - 1; i >= 0; i--) {
            if (this.diceTypeArray[i] === diceType) {
                // Remove from scene
                const mesh = this.diceArray[i];
                this.scene.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material && !Array.isArray(mesh.material)) {
                    mesh.material.dispose();
                }

                // Remove physics body
                const body = this.diceBodyArray[i];
                this.world.removeBody(body);

                // Remove from arrays
                this.diceArray.splice(i, 1);
                this.diceBodyArray.splice(i, 1);
                this.diceTypeArray.splice(i, 1);

                // Update selectedDice array
                this.selectedDice = this.selectedDice.filter(index => index !== i);
                this.selectedDice = this.selectedDice.map(index => index > i ? index - 1 : index);

                // Update draggedDiceIndex
                if (this.draggedDiceIndex === i) {
                    this.draggedDiceIndex = -1;
                } else if (this.draggedDiceIndex > i) {
                    this.draggedDiceIndex--;
                }

                this.wake();
                return true; // Successfully removed
            }
        }
        return false; // No dice of this type found
    }

    private getRandomResultForDiceType(diceType: string): number {
        const faceCount = this.getFaceCountForDiceType(diceType);
        return Math.floor(Math.random() * faceCount) + 1;
    }

    private checkSingleDiceSettling(diceIndex: number): void {
        if (!this.isViewActive || !this.isRolling || diceIndex < 0 || diceIndex >= this.diceBodyArray.length) return;

        const body = this.diceBodyArray[diceIndex];
        const motionThreshold = this.settings.motionThreshold;
        const velocityThreshold = 0.05 / motionThreshold;
        const angularThreshold = 0.5 / motionThreshold;

        const velocity = body.velocity.length();
        const angularVelocity = body.angularVelocity.length();

        const isSettled = velocity <= velocityThreshold &&
                         angularVelocity <= angularThreshold &&
                         body.position.y <= -0.5;

        if (isSettled) {
            log(`🎲 Single dice ${diceIndex} settled`);
            this.completeSingleDiceRoll(diceIndex);
        } else {
            // Check again in 100ms
            setTimeout(() => this.checkSingleDiceSettling(diceIndex), 100);
        }
    }

    private completeSingleDiceRoll(diceIndex: number): void {
        if (this.rollTimeout) {
            clearTimeout(this.rollTimeout);
            this.rollTimeout = null;
        }

        const diceType = this.diceTypeArray[diceIndex];

        // Wait 2 seconds before checking result to match multi-dice behavior
        setTimeout(() => {
            // Check if dice can be properly detected
            const checkResult = this.checkDiceResult(diceIndex);

            let formattedResult: string;

            if (checkResult.isCaught) {
                // Dice is caught - highlight it and show in result
                this.highlightCaughtDice(diceIndex, true);
                formattedResult = `1${diceType}(CAUGHT) = CAUGHT - Face confidence: ${checkResult.confidence.toFixed(3)}, required: ${checkResult.requiredConfidence.toFixed(3)}`;
                this.lastRoll = null;
                log(`🥅 Single dice ${diceIndex} (${diceType}) CAUGHT! Face confidence: ${checkResult.confidence.toFixed(3)}, required: ${checkResult.requiredConfidence.toFixed(3)}`);
            } else {
                // Valid result
                formattedResult = `1${diceType}(${checkResult.result}) = ${checkResult.result}`;
                this.lastRoll = [{ type: diceType, value: checkResult.result, index: diceIndex }];
                log(`📊 Single dice roll result: ${formattedResult}`);
            }

            this.isRolling = false;

            // Trigger the onRollComplete callback with formatted result
            if (this.onRollComplete) {
                this.onRollComplete(formattedResult);
            }
        }, 2000);
    }

    private checkMultiDiceSettling(): void {
        if (!this.isViewActive || !this.isRolling) return;

        // Check if all dice have settled
        let allSettled = true;
        const motionThreshold = this.settings.motionThreshold;
        const velocityThreshold = 0.05 / motionThreshold;
        const angularThreshold = 0.5 / motionThreshold;

        for (let i = 0; i < this.diceBodyArray.length; i++) {
            const body = this.diceBodyArray[i];
            const velocity = body.velocity.length();
            const angularVelocity = body.angularVelocity.length();

            if (velocity > velocityThreshold || angularVelocity > angularThreshold || body.position.y > -0.5) {
                allSettled = false;

                if (DEBUG) {
                    log(`Dice ${i} not settled:`, {
                        velocity: velocity.toFixed(3),
                        angularVelocity: angularVelocity.toFixed(3),
                        positionY: body.position.y.toFixed(3)
                    });
                }
                break;
            }
        }

        if (allSettled) {
            log('🎲 All dice motion thresholds met - completing roll');
            // Complete the roll immediately once settled
            this.completeMultiRoll();
        } else {
            // Check again in 100ms
            setTimeout(() => this.checkMultiDiceSettling(), 100);
        }
    }

    private completeMultiRoll(): void {
        // Clear timeout if it exists
        if (this.rollTimeoutId) {
            clearTimeout(this.rollTimeoutId);
            this.rollTimeoutId = null;
        }

        log('✅ All dice settled - calculating results');

        // Calculate results for all dice using physics-based face detection
        const results: { [key: string]: number[] } = {};
        let totalSum = 0;
        const rolled: RolledDie[] = [];

        for (let i = 0; i < this.diceArray.length; i++) {
            const diceType = this.diceTypeArray[i];
            const result = this.getTopFaceNumberForDice(i);
            rolled.push({ type: diceType, value: result, index: i });

            if (!results[diceType]) {
                results[diceType] = [];
            }
            results[diceType].push(result);
            totalSum += result;
        }

        // Format the result string
        const formattedResult = this.formatRollResults(results, totalSum);
        this.lastRoll = rolled;
        log(`📊 Final roll result: ${formattedResult}`);

        this.isRolling = false;
        if (this.rollTimeout) {
            clearTimeout(this.rollTimeout);
            this.rollTimeout = null;
        }

        // Also trigger the onRollComplete callback with formatted result
        if (this.onRollComplete) {
            this.onRollComplete(formattedResult);
        }

        if (this.multiRollResolve) {
            this.multiRollResolve(formattedResult);
            this.multiRollResolve = null;
        }
    }

    private forceStopMultiRoll(): void {
        log('⏰ Force stopping multi-dice roll due to timeout');
        this.completeMultiRoll();
    }

    // Check if dice can be determined, or if it's caught
    private checkDiceResult(diceIndex: number): { isCaught: boolean; result: number | null; confidence: number; requiredConfidence: number } {
        const diceType = this.diceTypeArray[diceIndex];
        const diceMesh = this.diceArray[diceIndex];

        if (!diceMesh) {
            return { isCaught: false, result: this.getRandomResultForDiceType(diceType), confidence: 0, requiredConfidence: 0 };
        }

        // Get face normals for this dice type
        const faceNormals = this.getFaceNormalsForDiceType(diceType);

        // Detection vector based on dice type
        const detectionVector = diceType === 'd4' ? DOWN : UP;

        let bestDotProduct = -Infinity;
        let bestFaceIndex = 0;

        // Check each face normal to find which face is pointing up/down
        for (let i = 0; i < faceNormals.length; i++) {
            // Transform face normal to world space using dice rotation. The
            // cached normals are shared, so copy into scratch rather than
            // rotating them in place.
            const worldNormal = this.normalScratch.copy(faceNormals[i]);
            worldNormal.applyQuaternion(diceMesh.quaternion);

            // Calculate dot product with detection vector
            const dotProduct = worldNormal.dot(detectionVector);

            if (dotProduct > bestDotProduct) {
                bestDotProduct = dotProduct;
                bestFaceIndex = i;
            }
        }

        // Check if the best face meets the confidence threshold
        const minConfidenceForValidFace = 1.0 - this.settings.faceDetectionTolerance;
        const isCaught = bestDotProduct < minConfidenceForValidFace;

        if (isCaught) {
            // Face detection failed - dice is caught
            return {
                isCaught: true,
                result: null,
                confidence: bestDotProduct,
                requiredConfidence: minConfidenceForValidFace
            };
        } else {
            // Face detection succeeded - return the result
            const result = this.mapFaceIndexToNumber(bestFaceIndex, diceType);
            log(`🎯 Dice ${diceIndex} (${diceType}) face detection: face index ${bestFaceIndex} = ${result}, confidence: ${bestDotProduct.toFixed(3)}`);
            return {
                isCaught: false,
                result: result,
                confidence: bestDotProduct,
                requiredConfidence: minConfidenceForValidFace
            };
        }
    }

    private getTopFaceNumberForDice(diceIndex: number): number {
        // Use the unified checkDiceResult method to perform face detection
        const checkResult = this.checkDiceResult(diceIndex);

        // Just return the result (or fallback if caught)
        // Note: Caught checking/highlighting is handled separately in monitoring code
        if (checkResult.isCaught) {
            return this.getRandomResultForDiceType(this.diceTypeArray[diceIndex]);
        }

        return checkResult.result!;
    }

    /**
     * Face normals depend only on the dice type, and checkDiceResult() runs ten
     * times a second per die while rolling — building a hundred Vector3s each
     * time was pure garbage.
     */
    private getFaceNormalsForDiceType(diceType: string): THREE.Vector3[] {
        let normals = D20Dice.faceNormalCache.get(diceType);
        if (!normals) {
            normals = this.computeFaceNormalsForDiceType(diceType);
            D20Dice.faceNormalCache.set(diceType, normals);
        }
        return normals;
    }

    /**
     * Face normals taken from the geometry, in the geometry's own face order.
     *
     * The hand-written tables below list the right normals in the wrong order:
     * three.js builds an octahedron's faces as +++, +-+, +--, ++-, -+-, ---,
     * --+, -++, and the table walks them round the equator instead. That is
     * invisible while the number is only a lookup - any permutation still gives
     * a number - but the atlas addresses faces by their geometry index, so the
     * two disagreed and every d8 showed a digit belonging to a different face.
     *
     * Anything with a polygon atlas therefore reads its normals from the same
     * buffer the UVs came from, which is the only way the two orders cannot
     * drift apart again.
     */
    private deriveFaceNormalsFromGeometry(diceType: string): THREE.Vector3[] {
        const geometry = this.createGeometryForDiceType(diceType);
        const pos = geometry.attributes.position;
        // A dodecahedron's face is nine vertices, not three, so the stride has
        // to come from how many faces the atlas says there are.
        const die = this.packDie(diceType);
        const atlas = die.faces ? { faces: die.faces } : null;
        const perFace = (geometry.userData.faceVertexCount as number)
            || (atlas ? pos.count / atlas.faces.length : 3);
        const normals: THREE.Vector3[] = [];
        // Numbered faces only. A bevelled die's rim sits behind them in the same
        // buffer, and walking the whole thing hands back a normal per rim facet
        // too: a d8 came back with thirty-two faces, and the result check duly
        // found a rim strip pointing more upward than any face and reported the
        // number belonging to whatever came first.
        const numbered = atlas ? atlas.faces.length * perFace : pos.count;

        for (let base = 0; base + 2 < numbered; base += perFace) {
            const a = new THREE.Vector3().fromBufferAttribute(pos, base);
            const b = new THREE.Vector3().fromBufferAttribute(pos, base + 1);
            const c = new THREE.Vector3().fromBufferAttribute(pos, base + 2);
            normals.push(new THREE.Vector3()
                .crossVectors(b.clone().sub(a), c.clone().sub(a))
                .normalize());
        }

        geometry.dispose();
        return normals;
    }

    private computeFaceNormalsForDiceType(diceType: string): THREE.Vector3[] {
        if (this.packDie(diceType).faces) return this.deriveFaceNormalsFromGeometry(diceType);

        switch (diceType) {
            case 'd4':
                // THREE.js TetrahedronGeometry creates a regular tetrahedron with vertices:
                // v0: (1, 1, 1), v1: (-1, -1, 1), v2: (-1, 1, -1), v3: (1, -1, -1)
                // Center is at (0, 0, 0)

                // The actual face structure from THREE.js TetrahedronGeometry:
                // Looking at the source, faces are created as:
                // Face 0: (2, 3, 0) - contains vertices v2, v3, v0
                // Face 1: (0, 3, 1) - contains vertices v0, v3, v1
                // Face 2: (1, 3, 2) - contains vertices v1, v3, v2
                // Face 3: (2, 0, 1) - contains vertices v2, v0, v1

                const v0 = new THREE.Vector3(1, 1, 1);
                const v1 = new THREE.Vector3(-1, -1, 1);
                const v2 = new THREE.Vector3(-1, 1, -1);
                const v3 = new THREE.Vector3(1, -1, -1);

                // Calculate face centers to ensure normals point outward
                const center = new THREE.Vector3(0, 0, 0);

                // Face 0: vertices 2, 3, 0
                const face0Center = new THREE.Vector3().addVectors(v2, v3).add(v0).divideScalar(3);
                const e0_1 = new THREE.Vector3().subVectors(v3, v2);
                const e0_2 = new THREE.Vector3().subVectors(v0, v2);
                let n0 = new THREE.Vector3().crossVectors(e0_1, e0_2).normalize();
                // Ensure normal points outward
                if (n0.dot(face0Center.clone().sub(center)) < 0) n0.negate();

                // Face 1: vertices 0, 3, 1
                const face1Center = new THREE.Vector3().addVectors(v0, v3).add(v1).divideScalar(3);
                const e1_1 = new THREE.Vector3().subVectors(v3, v0);
                const e1_2 = new THREE.Vector3().subVectors(v1, v0);
                let n1 = new THREE.Vector3().crossVectors(e1_1, e1_2).normalize();
                if (n1.dot(face1Center.clone().sub(center)) < 0) n1.negate();

                // Face 2: vertices 1, 3, 2
                const face2Center = new THREE.Vector3().addVectors(v1, v3).add(v2).divideScalar(3);
                const e2_1 = new THREE.Vector3().subVectors(v3, v1);
                const e2_2 = new THREE.Vector3().subVectors(v2, v1);
                let n2 = new THREE.Vector3().crossVectors(e2_1, e2_2).normalize();
                if (n2.dot(face2Center.clone().sub(center)) < 0) n2.negate();

                // Face 3: vertices 2, 0, 1
                const face3Center = new THREE.Vector3().addVectors(v2, v0).add(v1).divideScalar(3);
                const e3_1 = new THREE.Vector3().subVectors(v0, v2);
                const e3_2 = new THREE.Vector3().subVectors(v1, v2);
                let n3 = new THREE.Vector3().crossVectors(e3_1, e3_2).normalize();
                if (n3.dot(face3Center.clone().sub(center)) < 0) n3.negate();

                return [n0, n1, n2, n3];

            case 'd6':
                // Box/Cube face normals
                return [
                    new THREE.Vector3(1, 0, 0),   // Right
                    new THREE.Vector3(-1, 0, 0),  // Left
                    new THREE.Vector3(0, 1, 0),   // Top
                    new THREE.Vector3(0, -1, 0),  // Bottom
                    new THREE.Vector3(0, 0, 1),   // Front
                    new THREE.Vector3(0, 0, -1)   // Back
                ];

            case 'd8':
                // Octahedron face normals
                const oct = 1 / Math.sqrt(3);
                return [
                    new THREE.Vector3(oct, oct, oct),
                    new THREE.Vector3(-oct, oct, oct),
                    new THREE.Vector3(-oct, -oct, oct),
                    new THREE.Vector3(oct, -oct, oct),
                    new THREE.Vector3(oct, oct, -oct),
                    new THREE.Vector3(-oct, oct, -oct),
                    new THREE.Vector3(-oct, -oct, -oct),
                    new THREE.Vector3(oct, -oct, -oct)
                ];

            case 'd10':
                // D10 face normals (kite-shaped faces)
                const normals: THREE.Vector3[] = [];
                for (let i = 0; i < 10; i++) {
                    const angle = (i * 2 * Math.PI / 10);
                    const normal = new THREE.Vector3(
                        Math.cos(angle),
                        0.3, // Slight upward angle
                        Math.sin(angle)
                    ).normalize();
                    normals.push(normal);
                }
                return normals;

            case 'd12':
                // Dodecahedron face normals (12 pentagonal faces)
                const phi = (1 + Math.sqrt(5)) / 2;
                const invPhi = 1 / phi;
                return [
                    new THREE.Vector3(0, phi, invPhi).normalize(),
                    new THREE.Vector3(invPhi, phi, 0).normalize(),
                    new THREE.Vector3(invPhi, 0, phi).normalize(),
                    new THREE.Vector3(-invPhi, 0, phi).normalize(),
                    new THREE.Vector3(-invPhi, phi, 0).normalize(),
                    new THREE.Vector3(0, invPhi, phi).normalize(),
                    new THREE.Vector3(0, phi, -invPhi).normalize(),
                    new THREE.Vector3(invPhi, 0, -phi).normalize(),
                    new THREE.Vector3(0, -invPhi, -phi).normalize(),
                    new THREE.Vector3(0, -phi, -invPhi).normalize(),
                    new THREE.Vector3(-invPhi, 0, -phi).normalize(),
                    new THREE.Vector3(0, -phi, invPhi).normalize()
                ];

            case 'd20':
                // Icosahedron face normals (20 triangular faces)
                const t = (1 + Math.sqrt(5)) / 2;
                const vertices = [
                    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
                    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
                    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
                ];

                const faces = [
                    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
                    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
                    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
                    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
                ];

                return faces.map(face => {
                    const v1 = new THREE.Vector3(...vertices[face[0]]);
                    const v2 = new THREE.Vector3(...vertices[face[1]]);
                    const v3 = new THREE.Vector3(...vertices[face[2]]);

                    const edge1 = v2.clone().sub(v1);
                    const edge2 = v3.clone().sub(v1);
                    return edge1.cross(edge2).normalize();
                });

            default:
                console.warn(`Unknown dice type ${diceType}, using default normals`);
                return [new THREE.Vector3(0, 1, 0)];
        }
    }

    /**
     * The number on a face, from the same table that placed the art.
     *
     * Looked up rather than computed, so the two cannot drift: whatever face
     * comes up, the number reported is the one printed on it. A pack that says
     * nothing falls back to counting from one - except the d10, which counts
     * from zero, and really does have a face reading zero.
     */
    private mapFaceIndexToNumber(faceIndex: number, diceType: string): number {
        const numbers = this.numbersFor(diceType);
        if (numbers) {
            const number = numbers[faceIndex];
            if (number !== undefined) return number;
        }
        return diceType === 'd10' ? faceIndex : faceIndex + 1;
    }

    private formatRollResults(results: { [key: string]: number[] }, totalSum: number): string {
        const resultParts: string[] = [];

        // Sort dice types for consistent output
        const sortedTypes = Object.keys(results).sort((a, b) => {
            const order = ['d4', 'd6', 'd8', 'd10', 'd100', 'd12', 'd20'];
            return order.indexOf(a) - order.indexOf(b);
        });

        for (const diceType of sortedTypes) {
            const rolls = results[diceType];
            const rollsStr = rolls.join('+');
            resultParts.push(`${rolls.length}${diceType}(${rollsStr})`);
        }

        return `${resultParts.join(' + ')} = ${totalSum}`;
    }

    private animateAllDice(): void {
        // Simple animation - just spin all dice
        for (let i = 0; i < this.diceArray.length; i++) {
            const dice = this.diceArray[i];
            const body = this.diceBodyArray[i];

            // Add random rotation
            dice.rotation.x += (Math.random() - 0.5) * 2;
            dice.rotation.y += (Math.random() - 0.5) * 2;
            dice.rotation.z += (Math.random() - 0.5) * 2;

            // Add small physics impulse for visual effect
            body.wakeUp();
            body.velocity.set(
                (Math.random() - 0.5) * 2,
                Math.random() * 2,
                (Math.random() - 0.5) * 2
            );
        }
        this.wake();
    }

    // ============================================================================

    private createPhysicsBody(): void {
        // DISABLED: Legacy single-dice physics body creation
        // Multi-dice system uses createPhysicsBodyForDiceType() instead
        log('createPhysicsBody() called but disabled for multi-dice system');
        return;
    }

    private createConvexPolyhedronFromGeometry(geometry: THREE.BufferGeometry): CANNON.ConvexPolyhedron {
        const workingGeometry = geometry.index ? geometry.toNonIndexed() : geometry;
        const positionAttribute = workingGeometry.attributes.position;

        const ownsWorkingCopy = workingGeometry !== geometry;

        if (!positionAttribute) {
            if (ownsWorkingCopy) workingGeometry.dispose();
            throw new Error('Cannot create convex polyhedron: missing position attribute');
        }

        const vertices: CANNON.Vec3[] = [];
        const faces: number[][] = [];
        const vertexMap = new Map<string, number>();

        const addVertex = (vertex: THREE.Vector3): number => {
            const key = `${vertex.x.toFixed(5)}|${vertex.y.toFixed(5)}|${vertex.z.toFixed(5)}`;
            let index = vertexMap.get(key);
            if (index === undefined) {
                index = vertices.length;
                vertices.push(new CANNON.Vec3(vertex.x, vertex.y, vertex.z));
                vertexMap.set(key, index);
            }
            return index;
        };

        for (let i = 0; i < positionAttribute.count; i += 3) {
            const face: number[] = [];
            for (let j = 0; j < 3; j++) {
                const vertex = new THREE.Vector3().fromBufferAttribute(positionAttribute, i + j);
                face.push(addVertex(vertex));
            }
            faces.push(face);
        }

        if (ownsWorkingCopy) workingGeometry.dispose();

        const shape = new CANNON.ConvexPolyhedron({ vertices, faces });
        shape.computeNormals();
        shape.updateBoundingSphereRadius();
        return shape;
    }

    private initializeFaceNumbers() {
        // Initialize face numbers based on dice type
        const faceCount = this.getFaceCount();
        this.faceNumbers = [];

        for (let i = 0; i < faceCount; i++) {
            this.faceNumbers.push(i + 1);
        }

        log(`Initialized ${faceCount} face numbers for ${this.settings.diceType}:`, this.faceNumbers);
    }

    private calculateFaceNormals() {
        log(`🔍 Calculating face normals for ${this.settings.diceType}...`);

        if (!this.diceGeometry) {
            console.error('Cannot calculate face normals: dice geometry not available');
            return;
        }

        this.faceNormals = [];
        const positionAttribute = this.diceGeometry.attributes.position;
        const faceCount = this.getFaceCount();

        // Handle different dice types
        switch (this.settings.diceType) {
            case 'd6':
                // For box geometry, we need to handle the fact that it has 6 faces but 12 triangles
                this.calculateBoxFaceNormals();
                break;

            case 'd10':
                this.calculateD10FaceNormals();
                break;

            case 'd12':
                // For dodecahedron, use the actual 12 pentagonal face normals
                this.calculateDodecahedronFaceNormals();
                break;

            default:
                // For other dice (d4, d8, d20), use triangle-based calculation
                const triangleCount = positionAttribute.count / 3;

                for (let i = 0; i < triangleCount; i++) {
                    const vertexIndex = i * 3;

                    // Get the three vertices of the face
                    const v1 = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexIndex);
                    const v2 = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexIndex + 1);
                    const v3 = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexIndex + 2);

                    // Calculate two edge vectors
                    const edge1 = new THREE.Vector3().subVectors(v2, v1);
                    const edge2 = new THREE.Vector3().subVectors(v3, v1);

                    // Calculate face normal using cross product
                    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

                    this.faceNormals.push(normal);
                }
                break;
        }

        log(`✅ Calculated ${this.faceNormals.length} face normals for ${this.settings.diceType}`);

        // Debug: log the first few normals
        for (let i = 0; i < Math.min(5, this.faceNormals.length); i++) {
            const normal = this.faceNormals[i];
            log(`Face ${i + 1} normal:`, normal.x.toFixed(3), normal.y.toFixed(3), normal.z.toFixed(3));
        }
    }

    private calculateBoxFaceNormals() {
        // Box has 6 faces with specific normals
        this.faceNormals = [
            new THREE.Vector3(1, 0, 0),   // Right face
            new THREE.Vector3(-1, 0, 0),  // Left face
            new THREE.Vector3(0, 1, 0),   // Top face
            new THREE.Vector3(0, -1, 0),  // Bottom face
            new THREE.Vector3(0, 0, 1),   // Front face
            new THREE.Vector3(0, 0, -1)   // Back face
        ];
    }

    private calculateCylinderFaceNormals() {
        // For d10, create normals for 10 faces around the cylinder
        this.faceNormals = [];
        const faceCount = this.getFaceCount();

        for (let i = 0; i < faceCount; i++) {
            const angle = (i * 2 * Math.PI / faceCount);
            const normal = new THREE.Vector3(
                Math.cos(angle),
                0.3, // Slight upward angle for d10 shape
                Math.sin(angle)
            ).normalize();
            this.faceNormals.push(normal);
        }
    }

    private calculateDodecahedronFaceNormals() {
        // For D12, calculate the normals of the 12 actual pentagonal faces
        // Based on the physics body face definitions
        const phi = (1 + Math.sqrt(5)) / 2;
        const invPhi = 1 / phi;

        // Define the 12 pentagon face normals for a dodecahedron
        this.faceNormals = [
            new THREE.Vector3(0, phi, invPhi).normalize(),     // Face 1
            new THREE.Vector3(invPhi, phi, 0).normalize(),     // Face 2
            new THREE.Vector3(invPhi, 0, phi).normalize(),     // Face 3
            new THREE.Vector3(-invPhi, 0, phi).normalize(),    // Face 4
            new THREE.Vector3(-invPhi, phi, 0).normalize(),    // Face 5
            new THREE.Vector3(0, invPhi, phi).normalize(),     // Face 6
            new THREE.Vector3(0, phi, -invPhi).normalize(),    // Face 7
            new THREE.Vector3(invPhi, 0, -phi).normalize(),    // Face 8
            new THREE.Vector3(0, -invPhi, -phi).normalize(),   // Face 9
            new THREE.Vector3(0, -phi, -invPhi).normalize(),   // Face 10
            new THREE.Vector3(-invPhi, 0, -phi).normalize(),   // Face 11
            new THREE.Vector3(0, -phi, invPhi).normalize()     // Face 12
        ];
    }
    private calculateD10FaceNormals(): void {
        if (!this.diceGeometry) {
            return;
        }

        const positionAttribute = this.diceGeometry.attributes.position;
        if (!positionAttribute) {
            return;
        }

        this.faceNormals = [];

        // D10 has 10 faces, each made of 2 triangles (20 triangles total)
        const trianglesPerFace = 2;
        const totalTriangles = positionAttribute.count / 3;
        const totalFaces = 10;

        for (let faceIndex = 0; faceIndex < totalFaces; faceIndex++) {
            const baseTriangle = faceIndex * trianglesPerFace;
            if (baseTriangle < totalTriangles) {
                const vertexOffset = baseTriangle * 3;
                const v1 = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexOffset);
                const v2 = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexOffset + 1);
                const v3 = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexOffset + 2);

                const edge1 = new THREE.Vector3().subVectors(v2, v1);
                const edge2 = new THREE.Vector3().subVectors(v3, v1);
                const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

                this.faceNormals.push(normal);
            }
        }
    }

    private calculateTrapezohedronFaceNormals(): void {
        if (!this.diceGeometry) {
            return;
        }

        const positionAttribute = this.diceGeometry.attributes.position;
        if (!positionAttribute) {
            return;
        }

        this.faceNormals = [];
        const trianglesPerFace = 2;
        const verticesPerTriangle = 3;
        const faceVertexStride = trianglesPerFace * verticesPerTriangle;
        const totalFaces = positionAttribute.count / faceVertexStride;

        for (let faceIndex = 0; faceIndex < totalFaces; faceIndex++) {
            const vertexOffset = faceIndex * faceVertexStride;
            const v1 = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexOffset);
            const v2 = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexOffset + 1);
            const v3 = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexOffset + 2);

            const edge1 = new THREE.Vector3().subVectors(v2, v1);
            const edge2 = new THREE.Vector3().subVectors(v3, v1);
            const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

            this.faceNormals.push(normal);
        }
    }


    private addDiceTextures() {
        if (!this.dice) return;

        // Try to load custom texture for current dice type
        const textureData = this.getCurrentDiceTextureData();
        let customTexture: THREE.Texture | null = null;

        if (textureData) {
            customTexture = this.loadCustomTexture(textureData);
        }

        // Try to load normal map for current dice type
        const normalMapData = this.getCurrentDiceNormalMapData();
        let normalMap: THREE.Texture | null = null;

        if (normalMapData) {
            normalMap = this.loadNormalMap(normalMapData);
        }

        // Create material with all configurable properties
        const materialProperties: any = {
            // Textured dice carry their colour in the composite instead; see
            // loadTextureFromData.
            color: customTexture ? 0xffffff : this.colorFor(this.settings.diceType),
            ...this.packFinish()
        };

        // Add texture if available
        if (customTexture) {
            materialProperties.map = customTexture;
            log(`Applied custom texture to ${this.settings.diceType}`);
        } else {
            log(`Using solid color material for ${this.settings.diceType}`);
        }

        // Add normal map if available
        if (normalMap) {
            materialProperties.normalMap = normalMap;
            log(`Applied normal map to ${this.settings.diceType}`);
        }

        // Create and apply the material
        this.dice.material = new THREE.MeshPhongMaterial(materialProperties);
    }

    // Method to generate UV mapping template (for development/reference)
    public generateUVTemplate(): string {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';

        canvas.width = 512;
        canvas.height = 512;

        // D20 face colors and corresponding numbers
        const faceData = [
            { color: '#FF0000', number: 1 },   // Red
            { color: '#00FF00', number: 2 },   // Green
            { color: '#0000FF', number: 3 },   // Blue
            { color: '#FFFF00', number: 4 },   // Yellow
            { color: '#FF00FF', number: 5 },   // Magenta
            { color: '#00FFFF', number: 6 },   // Cyan
            { color: '#FFA500', number: 7 },   // Orange
            { color: '#800080', number: 8 },   // Purple
            { color: '#FFC0CB', number: 9 },   // Pink
            { color: '#A52A2A', number: 10 },  // Brown
            { color: '#808080', number: 11 },  // Gray
            { color: '#000000', number: 12 },  // Black
            { color: '#FFFFFF', number: 13 },  // White
            { color: '#90EE90', number: 14 },  // Light Green
            { color: '#FFB6C1', number: 15 },  // Light Pink
            { color: '#87CEEB', number: 16 },  // Sky Blue
            { color: '#DDA0DD', number: 17 },  // Plum
            { color: '#F0E68C', number: 18 },  // Khaki
            { color: '#20B2AA', number: 19 },  // Light Sea Green
            { color: '#DC143C', number: 20 }   // Crimson
        ];

        // Create a 4x5 grid layout for 20 faces
        const gridCols = 4;
        const gridRows = 5;
        const cellWidth = 512 / gridCols;
        const cellHeight = 512 / gridRows;

        // Fill background
        ctx.fillStyle = '#333333';
        ctx.fillRect(0, 0, 512, 512);

        // Draw each face
        for (let i = 0; i < 20; i++) {
            const row = Math.floor(i / gridCols);
            const col = i % gridCols;

            const x = col * cellWidth;
            const y = row * cellHeight;

            // Fill the cell with the face color
            ctx.fillStyle = faceData[i].color;
            ctx.fillRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4);

            // Add face number
            ctx.fillStyle = faceData[i].color === '#000000' || faceData[i].color === '#800080' ? '#FFFFFF' : '#000000';
            ctx.font = 'bold 32px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(faceData[i].number.toString(), x + cellWidth/2, y + cellHeight/2);

            // Add small border
            ctx.strokeStyle = '#CCCCCC';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, cellWidth, cellHeight);
        }

        // Add title
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('D20 UV Mapping Template', 10, 25);

        return canvas.toDataURL('image/png');
    }

    // Method to log the color mapping for reference
    public logColorMapping(): void {
        const colorMapping = [
            { face: 1, color: '#FF0000', name: 'Red' },
            { face: 2, color: '#00FF00', name: 'Green' },
            { face: 3, color: '#0000FF', name: 'Blue' },
            { face: 4, color: '#FFFF00', name: 'Yellow' },
            { face: 5, color: '#FF00FF', name: 'Magenta' },
            { face: 6, color: '#00FFFF', name: 'Cyan' },
            { face: 7, color: '#FFA500', name: 'Orange' },
            { face: 8, color: '#800080', name: 'Purple' },
            { face: 9, color: '#FFC0CB', name: 'Pink' },
            { face: 10, color: '#A52A2A', name: 'Brown' },
            { face: 11, color: '#808080', name: 'Gray' },
            { face: 12, color: '#000000', name: 'Black' },
            { face: 13, color: '#FFFFFF', name: 'White' },
            { face: 14, color: '#90EE90', name: 'Light Green' },
            { face: 15, color: '#FFB6C1', name: 'Light Pink' },
            { face: 16, color: '#87CEEB', name: 'Sky Blue' },
            { face: 17, color: '#DDA0DD', name: 'Plum' },
            { face: 18, color: '#F0E68C', name: 'Khaki' },
            { face: 19, color: '#20B2AA', name: 'Light Sea Green' },
            { face: 20, color: '#DC143C', name: 'Crimson' }
        ];

        log('🎲 D20 Face-to-Color Mapping:');
        console.table(colorMapping);
    }

    private getCurrentDiceTextureData(): string | null {
        return this.packTextures[this.settings.diceType] || null;
    }

    private getFaceCount(): number {
        switch (this.settings.diceType) {
            case 'd4': return 4;
            case 'd6': return 6;
            case 'd8': return 8;
            case 'd10': return 10;
            case 'd12': return 12;
            case 'd20': return 20;
            default: return 20;
        }
    }

    /**
     * The single-die path wants the same composite as the tray dice: art loaded
     * raw here was the half of the bug that survived fixing the other half.
     */
    private loadCustomTexture(textureData?: string): THREE.Texture | null {
        if (!textureData) return null;
        return this.loadTextureFromData(
            textureData,
            this.colorFor(this.settings.diceType),
            this.packDie(this.settings.diceType).rimUV || PACK_FALLBACK.rimUV
        );
    }

    private getCurrentDiceNormalMapData(): string | null {
        return this.packNormals[this.settings.diceType] || null;
    }

    private loadNormalMap(normalMapData?: string): THREE.Texture | null {
        if (!normalMapData) return null;

        try {
            // Create image element to load the normal map
            const img = new Image();
            img.crossOrigin = 'anonymous';

            const normalMap = new THREE.Texture();
            normalMap.image = img;
            normalMap.wrapS = THREE.ClampToEdgeWrapping; // Use clamp for clean edges
            normalMap.wrapT = THREE.ClampToEdgeWrapping;
            normalMap.minFilter = THREE.LinearFilter;
            normalMap.magFilter = THREE.LinearFilter;
            normalMap.generateMipmaps = false; // Disable mipmaps to reduce memory usage

            // Load the image
            img.onload = () => {
                normalMap.needsUpdate = true;
                log('Normal map loaded successfully');
            };

            img.onerror = (error) => {
                console.error('Failed to load normal map image:', error);
            };

            img.src = normalMapData;

            return normalMap;
        } catch (error) {
            console.error('Failed to load normal map:', error);
            return null;
        }
    }


    private setupLighting() {
        // Clear existing lights
        if (this.ambientLight) {
            this.scene.remove(this.ambientLight);
        }
        if (this.directionalLight) {
            this.scene.remove(this.directionalLight);
            if (this.directionalLight.target) {
                this.scene.remove(this.directionalLight.target);
            }
        }
        // Ambient light with configurable intensity and color
        this.ambientLight = new THREE.AmbientLight(
            new THREE.Color(this.settings.ambientLightColor),
            this.settings.ambientLightIntensity
        );
        this.scene.add(this.ambientLight);

        // Directional light with configurable properties
        this.directionalLight = new THREE.DirectionalLight(
            new THREE.Color(this.settings.directionalLightColor),
            this.settings.directionalLightIntensity
        );

        // Set configurable position
        this.directionalLight.position.set(
            this.settings.directionalLightPositionX,
            this.settings.directionalLightPositionY,
            this.settings.directionalLightPositionZ
        );

        // Target the center of the dice tray
        this.directionalLight.target.position.set(0, -2, 0);

        // Nothing casts any more. The contact shadows are drawn, not projected.
        this.directionalLight.castShadow = false;

        this.scene.add(this.directionalLight);
        this.scene.add(this.directionalLight.target);
    }

    private setupDragControls() {
        const canvas = this.renderer.domElement;

        // Set up events directly on canvas
        canvas.addEventListener('mousedown', (event) => this.onMouseDown(event));
        canvas.addEventListener('mouseup', (event) => this.onMouseUp(event));
        canvas.addEventListener('mousemove', (event) => this.onMouseMove(event));
        canvas.addEventListener('mouseleave', (event) => this.onMouseLeave(event));
        canvas.addEventListener('mouseenter', (event) => this.onMouseEnter(event));

        canvas.addEventListener('touchstart', (event) => this.onTouchStart(event));
        canvas.addEventListener('touchmove', (event) => this.onTouchMove(event));
        canvas.addEventListener('touchend', (event) => this.onTouchEnd(event));

        // Clicks reach the note everywhere except on a die. See trackPointer().
        canvas.style.pointerEvents = 'none';
        document.addEventListener('mousemove', this.trackPointer, true);
    }

    /** Cached because getBoundingClientRect() forces a layout flush. */
    private getRect(): DOMRect {
        if (!this.cachedRect) {
            this.cachedRect = this.renderer.domElement.getBoundingClientRect();
        }
        return this.cachedRect;
    }

    private setCursor(value: string): void {
        if (this.currentCursor === value) return;
        this.currentCursor = value;
        this.renderer.domElement.style.cursor = value;
    }

    private updateMousePosition(clientX: number, clientY: number) {
        const rect = this.getRect();
        this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    }

    /**
     * Hit-test by distance to the projected centre rather than by raycasting the
     * mesh. A tumbling icosahedron presents thin edges and sharp corners, so
     * "on the die" by geometry is a target that changes shape under the hand and
     * shrinks to a sliver when a die lands on an edge. A radius is the target a
     * person perceives, it allocates nothing, and it is pure arithmetic.
     * Returns -1 for a miss.
     */
    /**
     * Give the canvas the pointer only while it is over a die.
     *
     * `pointer-events` cannot be per-pixel, so the canvas is `none` by default
     * and flipped to `auto` for as long as the pointer is over a die. A
     * mousemove always precedes the mousedown that follows it, so by the time a
     * click lands the canvas is already listening - and everywhere else the
     * click goes straight through to the note underneath. That is why this
     * listens on the document: a canvas at `pointer-events: none` never hears a
     * move of its own, so it could never turn itself back on.
     *
     * This replaced a manual Clickthrough toggle. The toggle was a mode, and a
     * mode is a thing to be in the wrong one of.
     */
    private readonly trackPointer = (event: MouseEvent): void => {
        if (!this.isViewActive) return;

        // A drag holds the canvas open. The pointer can outrun the hit radius,
        // and losing the canvas mid-drag would drop the die.
        this.isHoveringDice = this.pickDiceIndex(event.clientX, event.clientY) !== -1;
        const wanted = this.isDragging || this.isHoveringDice ? 'auto' : 'none';

        const canvas = this.renderer.domElement;
        if (canvas.style.pointerEvents !== wanted) canvas.style.pointerEvents = wanted;
        if (wanted === 'auto') this.setCursor(this.isHoveringDice ? 'grab' : 'default');
    };

    private pickDiceIndex(clientX: number, clientY: number): number {
        if (this.diceArray.length === 0) return -1;

        const rect = this.getRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        // Orthographic camera: world units map linearly onto pixels.
        const pxPerUnit = rect.width / (this.camera.right - this.camera.left);

        let best = -1;
        let bestDist = Infinity;

        for (let i = 0; i < this.diceArray.length; i++) {
            const mesh = this.diceArray[i];
            if (!mesh) continue;

            this.pickVec.copy(mesh.position).project(this.camera);
            const sx = (this.pickVec.x * 0.5 + 0.5) * rect.width;
            const sy = (-this.pickVec.y * 0.5 + 0.5) * rect.height;

            const type = this.diceTypeArray[i] || 'd20';
            const scale = this.scaleFor(type);
            // 1.25 gives a little forgiveness around the silhouette.
            const radius = this.settings.diceSize * scale * 1.25 * pxPerUnit;

            const dx = sx - px;
            const dy = sy - py;
            const dist2 = dx * dx + dy * dy;
            if (dist2 <= radius * radius && dist2 < bestDist) {
                bestDist = dist2;
                best = i;
            }
        }

        return best;
    }

    private onMouseDown(event: MouseEvent) {
        this.updateMousePosition(event.clientX, event.clientY);
        this.dragStartPosition = { x: event.clientX, y: event.clientY };

        // Only handle the click if we clicked on the dice
        const didClickDice = this.checkDiceClick(event);

        if (!didClickDice) {
            // If not clicking on dice, don't prevent the event
            // Let it pass through to Obsidian
            return;
        }
    }

    private onTouchStart(event: TouchEvent) {
        if (event.touches.length === 1) {
            this.updateMousePosition(event.touches[0].clientX, event.touches[0].clientY);
            this.dragStartPosition = { x: event.touches[0].clientX, y: event.touches[0].clientY };

            // Create a mock mouse event for dice checking
            const mockEvent = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                clientX: event.touches[0].clientX,
                clientY: event.touches[0].clientY
            });

            const diceClicked = this.checkDiceClick(mockEvent);

            if (!diceClicked) {
                // Allow touch to pass through if not touching dice
                return;
            } else {
                event.preventDefault();
            }
        }
    }

    private onMouseMove(event: MouseEvent) {
        this.updateMousePosition(event.clientX, event.clientY);

        // Check for hover to show visual feedback only (multi-dice system)
        if (!this.isRolling && !this.isDragging && this.diceArray.length > 0) {
            this.isHoveringDice = this.pickDiceIndex(event.clientX, event.clientY) !== -1;
            this.setCursor(this.isHoveringDice ? 'grab' : 'default');
        }

        if (this.isDragging) {
            // Calculate mouse velocity for momentum
            const currentTime = Date.now();
            const deltaTime = currentTime - this.lastMousePosition.time;

            if (deltaTime > 0) {
                this.mouseVelocity.x = (event.clientX - this.lastMousePosition.x) / deltaTime;
                this.mouseVelocity.y = (event.clientY - this.lastMousePosition.y) / deltaTime;
            }

            this.lastMousePosition = { x: event.clientX, y: event.clientY, time: currentTime };

            this.updateDicePosition();
            this.setCursor('grabbing');
            // Draw from this event rather than waiting for the next frame: a rAF
            // callback can run before that frame's pointer move is delivered,
            // which leaves the die one move behind the cursor. Browsers coalesce
            // moves to one per frame, so this costs no extra draws.
            this.lastDragRender = performance.now();
            this.renderFrame(true);
        }
    }

    private onMouseEnter(event: MouseEvent) {
        // The overlay only moves on resize, so re-reading the rect on entry is
        // enough to keep the cached one honest.
        this.cachedRect = null;
        this.updateMousePosition(event.clientX, event.clientY);
        if (!this.isRolling && !this.isDragging && this.diceArray.length > 0) {
            this.isHoveringDice = this.pickDiceIndex(event.clientX, event.clientY) !== -1;
        }
    }

    private onMouseLeave(event: MouseEvent) {
        if (!this.isDragging) {
            this.isHoveringDice = false;
            this.setCursor('default');
        }
    }






    private onTouchMove(event: TouchEvent) {
        if (this.isDragging && event.touches.length === 1) {
            // Calculate touch velocity for momentum
            const currentTime = Date.now();
            const deltaTime = currentTime - this.lastMousePosition.time;

            if (deltaTime > 0) {
                this.mouseVelocity.x = (event.touches[0].clientX - this.lastMousePosition.x) / deltaTime;
                this.mouseVelocity.y = (event.touches[0].clientY - this.lastMousePosition.y) / deltaTime;
            }

            this.lastMousePosition = { x: event.touches[0].clientX, y: event.touches[0].clientY, time: currentTime };

            this.updateMousePosition(event.touches[0].clientX, event.touches[0].clientY);
            this.updateDicePosition();
            this.lastDragRender = performance.now();
            this.renderFrame(true);
            event.preventDefault();
        }
    }

    private onMouseUp(event: MouseEvent) {
        if (this.isDragging) {
            this.throwDice(event.clientX, event.clientY);
        }
    }

    private onTouchEnd(event: TouchEvent) {
        if (this.isDragging) {
            const touch = event.changedTouches[0];
            this.throwDice(touch.clientX, touch.clientY);
        }
    }

    private checkDiceClick(event: MouseEvent) {
        const clickedDiceIndex = this.pickDiceIndex(event.clientX, event.clientY);

        if (clickedDiceIndex !== -1) {
            // Only prevent event propagation when actually clicking on dice
            event.stopPropagation();
            event.preventDefault();

            // Handle different interaction modes
            if (event.ctrlKey && event.altKey) {
                // Ctrl+Alt+Click: Delete dice
                this.deleteDiceAtIndex(clickedDiceIndex);
                return true;
            } else if (event.ctrlKey) {
                // Ctrl+Click: Select/drag all dice
                this.startDragAllDice();
                return true;
            } else {
                // Regular click: Select/drag individual dice
                this.startDragSingleDice(clickedDiceIndex);
                return true;
            }
        }

        return false; // Indicate that no dice was clicked
    }

    private deleteDiceAtIndex(index: number): void {
        if (index < 0 || index >= this.diceArray.length) return;

        const diceType = this.diceTypeArray[index];

        // Remove from scene and physics
        this.scene.remove(this.diceArray[index]);
        this.world.removeBody(this.diceBodyArray[index]);

        // Dispose geometry and material
        this.diceArray[index].geometry.dispose();
        if (this.diceArray[index].material && !Array.isArray(this.diceArray[index].material)) {
            (this.diceArray[index].material as THREE.Material).dispose();
        }

        // Remove from arrays
        this.diceArray.splice(index, 1);
        this.diceBodyArray.splice(index, 1);
        this.diceTypeArray.splice(index, 1);

        // Update dice count in settings
        (this.settings.diceCounts as any)[diceType]--;

        this.wake();
    }

    private startDragSingleDice(index: number): void {
        this.isDragging = true;
        this.draggedDiceIndex = index;
        this.setCursor('grabbing');

        // Clear highlight if this dice is highlighted (completed)
        if (this.originalMaterials.has(index)) {
            log(`🔄 Clearing highlight from dice ${index} - starting drag`);
            this.highlightCaughtDice(index, false);
        }

        // Reset state if it exists (during active monitoring)
        const state = this.diceStates[index];
        if (state) {
            state.isCaught = false;
            state.isComplete = false;
            state.result = null;
            state.stableTime = 0;
            state.isRolling = true;
            state.lastMotion = Date.now();
        }

        // Initialize velocity tracking
        this.lastMousePosition = { x: this.dragStartPosition.x, y: this.dragStartPosition.y, time: Date.now() };
        this.mouseVelocity = { x: 0, y: 0 };

        // Stop any current rolling
        if (this.rollTimeout) {
            clearTimeout(this.rollTimeout);
            this.rollTimeout = null;
        }
        this.isRolling = false;

        // Reset the dragged dice position for dragging
        const body = this.diceBodyArray[index];
        body.wakeUp();
        body.position.set(0, 2, 0);
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
        this.wake();
    }

    private startDragAllDice(): void {
        this.isDragging = true;
        this.draggedDiceIndex = -1; // -1 indicates all dice
        this.setCursor('grabbing');

        // Initialize velocity tracking
        this.lastMousePosition = { x: this.dragStartPosition.x, y: this.dragStartPosition.y, time: Date.now() };
        this.mouseVelocity = { x: 0, y: 0 };

        // Stop any current rolling
        if (this.rollTimeout) {
            clearTimeout(this.rollTimeout);
            this.rollTimeout = null;
        }
        this.isRolling = false;

        // Reset all dice positions for dragging
        for (let i = 0; i < this.diceBodyArray.length; i++) {
            const body = this.diceBodyArray[i];
            const spread = Math.sqrt(this.diceArray.length) * 1.5;
            const angle = (i / this.diceArray.length) * Math.PI * 2;

            // Clear highlight if this dice is highlighted (completed)
            if (this.originalMaterials.has(i)) {
                log(`🔄 Clearing highlight from dice ${i} - starting drag all`);
                this.highlightCaughtDice(i, false);
            }

            // Reset state if it exists (during active monitoring)
            const state = this.diceStates[i];
            if (state) {
                state.isCaught = false;
                state.isComplete = false;
                state.result = null;
                state.stableTime = 0;
                state.isRolling = true;
                state.lastMotion = Date.now();
            }

            body.wakeUp();
            body.position.set(
                Math.cos(angle) * spread,
                2,
                Math.sin(angle) * spread
            );
            body.velocity.set(0, 0, 0);
            body.angularVelocity.set(0, 0, 0);
        }
        this.wake();
    }

    /** Pointer-driven move: place the held dice and spin them. */
    private updateDicePosition() {
        this.applyDragPosition(true);
    }

    /**
     * Write the held dice to the pointer position. The spin is only applied on
     * a real pointer move — animate() calls this after each step purely to undo
     * the solver's correction, and spinning there too would double the rate.
     */
    /** How far the whole set is fanned out when dragged together. */
    private dragSpread(): number {
        return Math.sqrt(this.diceArray.length) * 0.8;
    }

    /**
     * Size of the largest die being dragged, used to keep it off the walls.
     * For a d6 this is its half-extent, for the polyhedra its circumradius.
     */
    private draggedRadius(): number {
        const sizeOf = (i: number) => {
            const type = this.diceTypeArray[i] || 'd20';
            const scale = this.scaleFor(type);
            return this.settings.diceSize * scale;
        };

        if (this.draggedDiceIndex >= 0) return sizeOf(this.draggedDiceIndex);

        let largest = 0;
        for (let i = 0; i < this.diceArray.length; i++) largest = Math.max(largest, sizeOf(i));
        return largest;
    }

    private applyDragPosition(spin = false) {
        if (!this.isDragging) return;

        // For orthographic camera, convert mouse coordinates directly to world coordinates
        const frustumHeight = this.camera.top - this.camera.bottom;
        const frustumWidth = this.camera.right - this.camera.left;

        // Convert normalized mouse coordinates to world coordinates
        const worldX = (this.mouse.x * frustumWidth) / 2;
        const worldZ = -(this.mouse.y * frustumHeight) / 2; // Negative because Y is flipped

        // Set position at dice tray level (Y = 2)
        const worldPosition = new THREE.Vector3(worldX, 2, worldZ);

        // Keep the held die inside the tray walls.
        //
        // This used to clamp to a hardcoded +/-9 by +/-6, from back when the
        // tray was a fixed size. The tray is sized from the camera now, so on a
        // maximised window that reached less than half the width and a dragged
        // die stopped dead in open space, nowhere near a wall.
        //
        // The inset is the die's own size, so it stops against the wall rather
        // than half through it; dragging the whole set also has to allow for
        // the spread applied below.
        const tray = this.trayDimensions();
        const margin = this.draggedRadius() + (this.draggedDiceIndex === -1 ? this.dragSpread() : 0);
        const limitX = Math.max(0, tray.width / 2 - margin);
        const limitZ = Math.max(0, tray.length / 2 - margin);
        worldPosition.x = Math.max(-limitX, Math.min(limitX, worldPosition.x));
        worldPosition.z = Math.max(-limitZ, Math.min(limitZ, worldPosition.z));

        if (this.draggedDiceIndex === -1) {
            // Drag all dice - maintain relative positions
            for (let i = 0; i < this.diceBodyArray.length; i++) {
                const body = this.diceBodyArray[i];
                const mesh = this.diceArray[i];

                body.position.copy(worldPosition);

                // Add slight spread to prevent overlapping
                const spread = this.dragSpread();
                const angle = (i / this.diceArray.length) * Math.PI * 2;
                body.position.x += Math.cos(angle) * spread;
                body.position.z += Math.sin(angle) * spread;

                // Add rolling animation while dragging
                if (spin) {
                    mesh.rotation.x += 0.05;
                    mesh.rotation.y += 0.05;
                    mesh.rotation.z += 0.025;
                }
            }
        } else if (this.draggedDiceIndex >= 0 && this.draggedDiceIndex < this.diceBodyArray.length) {
            // Drag single dice
            const body = this.diceBodyArray[this.draggedDiceIndex];
            const mesh = this.diceArray[this.draggedDiceIndex];

            body.position.copy(worldPosition);

            // Add rolling animation while dragging
            if (spin) {
                mesh.rotation.x += 0.1;
                mesh.rotation.y += 0.1;
                mesh.rotation.z += 0.05;
            }
        }
    }

    private throwDice(endX: number, endY: number) {
        this.isDragging = false;
        this.setCursor('default');

        this.isRolling = true;

        // Track which dice we're rolling (single or all)
        const rollingSingleDice = this.draggedDiceIndex >= 0;

        // Use mouse velocity for realistic momentum-based throwing
        const velocityMultiplier = 50;
        const baseThrowForce = new CANNON.Vec3(
            this.mouseVelocity.x * velocityMultiplier,
            -Math.max(Math.abs(this.mouseVelocity.x + this.mouseVelocity.y) * velocityMultiplier * 0.5, 3),
            this.mouseVelocity.y * velocityMultiplier
        );

        // Cap maximum force to prevent dice from flying too far
        const maxForce = 25;
        const forceLength = baseThrowForce.length();
        if (forceLength > maxForce) {
            baseThrowForce.scale(maxForce / forceLength, baseThrowForce);
        }

        // Apply throwing force to the appropriate dice
        if (this.draggedDiceIndex === -1) {
            // Throw all dice
            for (let i = 0; i < this.diceBodyArray.length; i++) {
                const body = this.diceBodyArray[i];

                // Add some randomness for each dice
                const throwForce = baseThrowForce.clone();
                throwForce.x += (Math.random() - 0.5) * 5;
                throwForce.z += (Math.random() - 0.5) * 5;

                // Setting velocity on a sleeping body does nothing on its own.
                body.wakeUp();
                body.velocity.copy(throwForce);

                // Apply spin based on velocity direction and magnitude
                const spinIntensity = Math.min(Math.sqrt(this.mouseVelocity.x * this.mouseVelocity.x + this.mouseVelocity.y * this.mouseVelocity.y) * 100, 25);
                body.angularVelocity.set(
                    (Math.random() - 0.5) * spinIntensity + this.mouseVelocity.y * 10,
                    (Math.random() - 0.5) * spinIntensity,
                    (Math.random() - 0.5) * spinIntensity + this.mouseVelocity.x * 10
                );
            }
        } else if (this.draggedDiceIndex >= 0 && this.draggedDiceIndex < this.diceBodyArray.length) {
            // Throw single dice
            const body = this.diceBodyArray[this.draggedDiceIndex];
            body.wakeUp();
            body.velocity.copy(baseThrowForce);

            // Apply spin based on velocity direction and magnitude
            const spinIntensity = Math.min(Math.sqrt(this.mouseVelocity.x * this.mouseVelocity.x + this.mouseVelocity.y * this.mouseVelocity.y) * 100, 25);
            body.angularVelocity.set(
                (Math.random() - 0.5) * spinIntensity + this.mouseVelocity.y * 10,
                (Math.random() - 0.5) * spinIntensity,
                (Math.random() - 0.5) * spinIntensity + this.mouseVelocity.x * 10
            );
        }

        // Store which dice was rolled before resetting
        const rolledDiceIndex = this.draggedDiceIndex;

        // Reset dragged dice index
        this.draggedDiceIndex = -1;

        // Start checking for settling based on what was rolled
        if (rollingSingleDice) {
            // Check if this is part of an active group roll (monitoring is still running)
            if (this.currentMonitor !== null && this.diceStates.length > 0 && rolledDiceIndex < this.diceStates.length) {
                // This is a reroll of a caught dice from a group roll - just reset its state
                const state = this.diceStates[rolledDiceIndex];
                state.isRolling = true;
                state.isCaught = false;
                state.isComplete = false;
                state.result = null;
                state.stableTime = 0;
                state.lastMotion = Date.now();
                log(`🔄 Rerolling dice ${rolledDiceIndex} as part of active group roll - state reset`);
                // Don't call checkSingleDiceSettling - let the group monitor handle it
            } else {
                // True single dice roll - check only that dice
                this.checkSingleDiceSettling(rolledDiceIndex);
            }
        } else {
            // Multiple dice - use enhanced monitoring with catching detection
            this.initializeDiceStates();
            // Note: Forces already applied above, just start monitoring
            this.startIndividualDiceMonitoring(
                (result) => {
                    // The force-stop timeout would report this throw a second
                    // time, with whatever faces are up by then.
                    if (this.rollTimeout) {
                        clearTimeout(this.rollTimeout);
                        this.rollTimeout = null;
                    }
                    // On completion, trigger callback
                    if (this.onRollComplete) {
                        this.onRollComplete(result);
                    }
                    this.isRolling = false;
                },
                (error) => {
                    console.error('Throw monitoring error:', error);
                    this.isRolling = false;
                }
            );
        }

        // Set timeout for force stop
        const baseTimeout = 6000;
        const extendedTimeout = baseTimeout + (this.settings.motionThreshold * 1000);

        this.wake();

        this.rollTimeout = setTimeout(() => {
            if (rollingSingleDice) {
                this.completeSingleDiceRoll(rolledDiceIndex);
            } else {
                this.forceStopMultiRoll();
            }
        }, extendedTimeout);
    }

    private forceStop() {
        if (this.rollTimeout) {
            clearTimeout(this.rollTimeout);
            this.rollTimeout = null;
        }

        this.isRolling = false;
        this.setCursor('default');

        this.diceBody.velocity.set(0, 0, 0);
        this.diceBody.angularVelocity.set(0, 0, 0);

        this.calculateResult();
    }

    /**
     * Restart the render loop. Every mutation that changes what is on screen —
     * a throw, a drag, a resize, a new die, a settings change, a highlight —
     * has to call this, because animate() stops itself as soon as the dice are
     * asleep and nothing else is pending.
     */
    private wake(): void {
        this.needsRender = true;
        if (this.animationId === null && this.isViewActive && this.renderer) {
            this.lastFrameTime = 0;
            this.animationId = requestAnimationFrame(this.animateBound);
        }
    }

    /** Copy physics transforms onto the meshes and draw one frame. */
    private renderFrame(syncFromPhysics: boolean): void {
        if (syncFromPhysics) {
            for (let i = 0; i < this.diceArray.length; i++) {
                const dice = this.diceArray[i];
                const body = this.diceBodyArray[i];
                if (!dice || !body) continue;
                dice.position.copy(body.position as any);
                // updateDicePosition() spins the held die by hand; copying the
                // body quaternion over it would erase that spin every frame.
                const isHeld = this.isDragging &&
                    (this.draggedDiceIndex === -1 || this.draggedDiceIndex === i);
                if (!isHeld) {
                    dice.quaternion.copy(body.quaternion as any);
                }
            }
        }

        this.updateBlobShadows();

        this.renderer.render(this.scene, this.camera);
        this.needsRender = false;
    }

    private animate() {
        this.animationId = null;

        if (!this.isViewActive) {
            return;
        }

        const now = performance.now();
        // A backgrounded tab resumes with a delta of several seconds; integrating
        // that in one go teleports dice through the tray walls.
        const dt = this.lastFrameTime === 0
            ? 1 / 60
            : Math.min((now - this.lastFrameTime) / 1000, 0.05);
        this.lastFrameTime = now;

        let anyAwake = false;
        for (let i = 0; i < this.diceBodyArray.length; i++) {
            const body = this.diceBodyArray[i];
            if (body && body.sleepState !== CANNON.Body.SLEEPING) {
                anyAwake = true;
                break;
            }
        }

        if (anyAwake) {
            // Passing the real delta and a substep cap decouples the fall speed
            // from the display refresh rate.
            this.world.step(1 / 60, dt, 2);

            // The solver has just applied gravity to the held die and pushed it
            // back out of whatever it was resting against. Drawing that is what
            // reads as the die lagging behind the cursor, so put it back where
            // the pointer actually is before anything is rendered.
            if (this.isDragging) {
                this.applyDragPosition();
            }
        }

        // While the pointer is moving, onMouseMove has already drawn this frame
        // from a fresher position than this callback can see. Only draw here to
        // cover a held-still pointer with other dice still in motion.
        const pointerDrewRecently = this.isDragging && (now - this.lastDragRender) < 32;

        if (!pointerDrewRecently && (anyAwake || this.showingResult || this.needsRender)) {
            this.renderFrame(!this.showingResult);
        }

        // Nothing moving and nothing pending: let the loop die.
        const keepGoing = anyAwake || this.showingResult || this.needsRender || this.isDragging;
        this.animationId = keepGoing ? requestAnimationFrame(this.animateBound) : null;
        if (!keepGoing) {
            this.lastFrameTime = 0;
        }
    }


    // Old roll method removed - replaced by enhanced roll method with individual dice tracking

    private rollResolve: ((value: number) => void) | null = null;
    private multiRollResolve: ((value: string) => void) | null = null;
    private rollTimeoutId: NodeJS.Timeout | null = null;
    private showingResult = false;

    private calculateResult(): void {
        const result = this.getTopFaceNumber();
        log(`Natural dice result: ${result}`);
        this.lastRoll = [{ type: this.settings.diceType, value: result }];

        // Snap behavior removed - UV mapping handles proper face display

        if (this.onRollComplete) {
            this.onRollComplete(result);
        }

        if (this.rollResolve) {
            this.rollResolve(result);
            this.rollResolve = null;
        }
    }



    private calculateRotationForTopFace(targetFaceNumber: number): THREE.Euler {
        // Use the accurate Euler rotations captured for each face
        const faceRotations: { [key: number]: THREE.Euler } = {
            1: new THREE.Euler(-1.7, -0.9, -2.5),
            2: new THREE.Euler(-0.0, -0.5, 2.0),
            3: new THREE.Euler(0.00, -0.28, -1.94),
            4: new THREE.Euler(-0.5, -2.8, 0.6),
            5: new THREE.Euler(-0.89, -0.73, 0.10),
            6: new THREE.Euler(1.24, 0.17, -2.02),
            7: new THREE.Euler(-1.2, 0.1, -1.5),
            8: new THREE.Euler(-0.7, 2.2, -2.5),
            9: new THREE.Euler(2.47, -0.39, 2.06),
            10: new THREE.Euler(-2.8, 0.1, 0.1),
            11: new THREE.Euler(0.39, -0.33, 0.13),
            12: new THREE.Euler(-0.95, 0.78, 3.14),
            13: new THREE.Euler(-2.6, -0.0, -3.1),
            14: new THREE.Euler(1.51, 0.36, 0.18),
            15: new THREE.Euler(-1.2, -0.0, 1.6),
            16: new THREE.Euler(0.98, 0.82, 3.11),
            17: new THREE.Euler(-2.45, -0.45, 1.13),
            18: new THREE.Euler(-0.0, 0.6, 1.2),
            19: new THREE.Euler(-0.0, -0.5, -1.2),
            20: new THREE.Euler(-2.4, 2.7, -1.2)
        };

        const targetRotation = faceRotations[targetFaceNumber];

        if (targetRotation) {
            log(`Using calibrated rotation for face ${targetFaceNumber}:`, targetRotation);
            return targetRotation;
        } else {
            console.warn(`No calibrated rotation found for face ${targetFaceNumber}, using default`);
            return new THREE.Euler(0, 0, 0);
        }
    }

    public debugPhysics(): void {
        log('❌ Legacy debugPhysics() disabled for multi-dice system');
        return;

        log('🎲 DICE PHYSICS DEBUG');

        // Current detected face
        const detectedFace = this.getTopFaceNumber();
        log(`🎯 Detected Face: ${detectedFace}`);

        // Physics body properties
        log('⚙️ Physics Body');
        log(`Position: (${this.diceBody.position.x.toFixed(3)}, ${this.diceBody.position.y.toFixed(3)}, ${this.diceBody.position.z.toFixed(3)})`);
        log(`Velocity: (${this.diceBody.velocity.x.toFixed(3)}, ${this.diceBody.velocity.y.toFixed(3)}, ${this.diceBody.velocity.z.toFixed(3)})`);
        log(`Linear Speed: ${this.diceBody.velocity.length().toFixed(3)} m/s`);
        log(`Angular Velocity: (${this.diceBody.angularVelocity.x.toFixed(3)}, ${this.diceBody.angularVelocity.y.toFixed(3)}, ${this.diceBody.angularVelocity.z.toFixed(3)})`);
        log(`Angular Speed: ${this.diceBody.angularVelocity.length().toFixed(3)} rad/s`);
        log(`Mass: ${this.diceBody.mass} kg`);
        log(`Type: ${this.diceBody.type === CANNON.Body.DYNAMIC ? 'DYNAMIC' : this.diceBody.type === CANNON.Body.STATIC ? 'STATIC' : 'KINEMATIC'}`);
        

        // Visual mesh properties
        log('👁️ Visual Mesh');
        log(`Rotation (Euler): (${this.dice.rotation.x.toFixed(3)}, ${this.dice.rotation.y.toFixed(3)}, ${this.dice.rotation.z.toFixed(3)})`);
        log(`Position: (${this.dice.position.x.toFixed(3)}, ${this.dice.position.y.toFixed(3)}, ${this.dice.position.z.toFixed(3)})`);
        log(`Scale: (${this.dice.scale.x.toFixed(3)}, ${this.dice.scale.y.toFixed(3)}, ${this.dice.scale.z.toFixed(3)})`);
        

        // Physics quaternion vs Euler comparison
        log('🔄 Rotation Analysis');
        const physicsQuat = this.diceBody.quaternion;
        const visualEuler = this.dice.rotation;
        const physicsEuler = new THREE.Euler().setFromQuaternion(
            new THREE.Quaternion(physicsQuat.x, physicsQuat.y, physicsQuat.z, physicsQuat.w)
        );
        log(`Physics Quaternion: (${physicsQuat.x.toFixed(3)}, ${physicsQuat.y.toFixed(3)}, ${physicsQuat.z.toFixed(3)}, ${physicsQuat.w.toFixed(3)})`);
        log(`Physics as Euler: (${physicsEuler.x.toFixed(3)}, ${physicsEuler.y.toFixed(3)}, ${physicsEuler.z.toFixed(3)})`);
        log(`Visual Euler: (${visualEuler.x.toFixed(3)}, ${visualEuler.y.toFixed(3)}, ${visualEuler.z.toFixed(3)})`);
        

        // Material properties
        log('🧪 Material Properties');
        const material = this.diceBody.material;
        if (material) {
            log(`Friction: ${material.friction}`);
            log(`Restitution: ${material.restitution}`);
        }
        log(`Linear Damping: ${this.diceBody.linearDamping}`);
        log(`Angular Damping: ${this.diceBody.angularDamping}`);
        

        // State flags
        log('🏃 State Flags');
        log(`Is Rolling: ${this.isRolling}`);
        log(`Is Dragging: ${this.isDragging}`);
        log(`Showing Result: ${this.showingResult}`);
        

        // Face detection distances (for debugging face detection accuracy)
        log('📊 Face Detection Analysis');
        this.debugFaceDetectionDistances();
        

        
    }

    private debugFaceDetectionDistances(): void {
        const currentRotation = this.dice.rotation;

        const faceRotations: { [key: number]: THREE.Euler } = {
            1: new THREE.Euler(-1.7, -0.9, -2.5),
            2: new THREE.Euler(-0.0, -0.5, 2.0),
            3: new THREE.Euler(0.00, -0.28, -1.94),
            4: new THREE.Euler(-0.5, -2.8, 0.6),
            5: new THREE.Euler(-0.89, -0.73, 0.10),
            6: new THREE.Euler(1.24, 0.17, -2.02),
            7: new THREE.Euler(-1.2, 0.1, -1.5),
            8: new THREE.Euler(-0.7, 2.2, -2.5),
            9: new THREE.Euler(2.47, -0.39, 2.06),
            10: new THREE.Euler(-2.8, 0.1, 0.1),
            11: new THREE.Euler(0.39, -0.33, 0.13),
            12: new THREE.Euler(-0.95, 0.78, 3.14),
            13: new THREE.Euler(-2.6, -0.0, -3.1),
            14: new THREE.Euler(1.51, 0.36, 0.18),
            15: new THREE.Euler(-1.2, -0.0, 1.6),
            16: new THREE.Euler(0.98, 0.82, 3.11),
            17: new THREE.Euler(-2.45, -0.45, 1.13),
            18: new THREE.Euler(-0.0, 0.6, 1.2),
            19: new THREE.Euler(-0.0, -0.5, -1.2),
            20: new THREE.Euler(-2.4, 2.7, -1.2)
        };

        const distances: Array<{face: number, distance: number}> = [];

        for (const [faceNum, targetRotation] of Object.entries(faceRotations)) {
            const face = parseInt(faceNum);

            const dx = this.normalizeAngle(currentRotation.x - targetRotation.x);
            const dy = this.normalizeAngle(currentRotation.y - targetRotation.y);
            const dz = this.normalizeAngle(currentRotation.z - targetRotation.z);

            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            distances.push({ face, distance });
        }

        // Sort by distance (closest first)
        distances.sort((a, b) => a.distance - b.distance);

        log('Current rotation vs all calibrated face rotations:');
        console.table(distances.map(d => ({
            Face: d.face,
            Distance: parseFloat(d.distance.toFixed(3)),
            'Target Euler X': faceRotations[d.face].x.toFixed(2),
            'Target Euler Y': faceRotations[d.face].y.toFixed(2),
            'Target Euler Z': faceRotations[d.face].z.toFixed(2)
        })));

        log('🏆 TOP 5 CLOSEST MATCHES:');
        for (let i = 0; i < Math.min(5, distances.length); i++) {
            const { face, distance } = distances[i];
            const targetEuler = faceRotations[face];
            log(`${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i === 3 ? '4️⃣' : '5️⃣'} Face ${face}: distance ${distance.toFixed(3)}`);
            log(`   Target: (${targetEuler.x.toFixed(2)}, ${targetEuler.y.toFixed(2)}, ${targetEuler.z.toFixed(2)})`);
            log(`   Current: (${currentRotation.x.toFixed(2)}, ${currentRotation.y.toFixed(2)}, ${currentRotation.z.toFixed(2)})`);

            const dx = this.normalizeAngle(currentRotation.x - targetEuler.x);
            const dy = this.normalizeAngle(currentRotation.y - targetEuler.y);
            const dz = this.normalizeAngle(currentRotation.z - targetEuler.z);
            log(`   Diff: (${dx.toFixed(2)}, ${dy.toFixed(2)}, ${dz.toFixed(2)})`);
            log('');
        }
    }

    private calculateRotationToShowFace(faceNormal: THREE.Vector3): THREE.Euler {
        // We want this face normal to point upward (positive Y direction)
        const upVector = new THREE.Vector3(0, 1, 0);

        // Create a rotation that aligns the face normal with up vector
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(faceNormal, upVector);

        // Convert to Euler angles
        const euler = new THREE.Euler();
        euler.setFromQuaternion(quaternion);

        return euler;
    }

    private getTopFaceNumber(): number {
        try {
            if (this.faceNormals.length === 0) {
                console.warn('Face normals not calculated, falling back to random');
                const faceCount = this.getFaceCount();
                return Math.floor(Math.random() * faceCount) + 1;
            }

            // Define the detection vector based on dice type
            // D4 uses down vector since faces point downward when resting
            // All other dice use up vector since faces point upward when resting
            const detectionVector = this.settings.diceType === 'd4'
                ? new THREE.Vector3(0, -1, 0)  // Down vector for D4
                : new THREE.Vector3(0, 1, 0);  // Up vector for other dice

            // Detection tolerance - dot product must be within this range of 1.0 for "up"
            const tolerance = this.settings.faceDetectionTolerance;
            const minDotProduct = 1.0 - tolerance;

            let bestFace = 1;
            let bestDotProduct = -1;

            const detectionResults: Array<{face: number, dotProduct: number, worldNormal: THREE.Vector3}> = [];

            // Check each face normal against the up vector
            for (let i = 0; i < this.faceNormals.length; i++) {
                // Transform face normal to world space using dice rotation
                const worldNormal = this.faceNormals[i].clone();
                worldNormal.applyQuaternion(this.dice.quaternion);

                // Calculate dot product with detection vector
                const dotProduct = worldNormal.dot(detectionVector);

                // Get face number based on dice type
                const faceCount = this.getFaceCount();
                let faceNumber = Math.min(faceCount, (i % faceCount) + 1);

                // D10 specific face mapping correction
                if (this.settings.diceType === 'd10') {
                    const d10Mapping: { [key: number]: number } = {
                        1: 5, 2: 4, 3: 3, 4: 2, 5: 1,
                        6: 10, 7: 9, 8: 8, 9: 7, 10: 6
                    };
                    faceNumber = d10Mapping[faceNumber] || faceNumber;
                }
                detectionResults.push({ face: faceNumber, dotProduct, worldNormal });

                // Check if this face is pointing "up" (within tolerance)
                if (dotProduct > bestDotProduct) {
                    bestDotProduct = dotProduct;
                    bestFace = faceNumber;
                }
            }

            // Sort by dot product (best match first)
            detectionResults.sort((a, b) => b.dotProduct - a.dotProduct);

            // Debug logging
            const directionName = this.settings.diceType === 'd4' ? 'DOWN' : 'UP';
            log('🎯 Face Normal Detection Results:');
            log(`Detection vector (${directionName}): (${detectionVector.x}, ${detectionVector.y}, ${detectionVector.z})`);
            log(`Tolerance: ${tolerance} (min dot product: ${minDotProduct.toFixed(3)})`);
            log(`Best face: ${bestFace} (dot product: ${bestDotProduct.toFixed(3)})`);

            // Log top 5 candidates
            log('🏆 TOP 5 FACE CANDIDATES:');
            for (let i = 0; i < Math.min(5, detectionResults.length); i++) {
                const result = detectionResults[i];
                const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i === 3 ? '4️⃣' : '5️⃣';
                const isDetected = result.dotProduct >= minDotProduct ? `✅ ${directionName}` : '❌';
                log(`${emoji} Face ${result.face}: dot=${result.dotProduct.toFixed(3)} ${isDetected}`);
                log(`   World normal: (${result.worldNormal.x.toFixed(3)}, ${result.worldNormal.y.toFixed(3)}, ${result.worldNormal.z.toFixed(3)})`);
            }

            // Warn if no face is clearly detected
            const detectionType = this.settings.diceType === 'd4' ? 'down' : 'up';
            if (bestDotProduct < minDotProduct) {
                console.warn(`⚠️ No face is clearly pointing ${detectionType}! Best dot product: ${bestDotProduct.toFixed(3)} (threshold: ${minDotProduct.toFixed(3)})`);
                console.warn('Dice may still be moving or in an edge case orientation');
            }

            return bestFace;
        } catch (error) {
            console.error('Error in face normal detection:', error);
            const faceCount = this.getFaceCount();
            return Math.floor(Math.random() * faceCount) + 1;
        }
    }

    private snapDiceToFace(faceNumber: number, targetPosition?: THREE.Vector3): void {
        if (!this.diceGeometry || this.faceNormals.length === 0) {
            return;
        }

        const faceIndex = Math.max(0, Math.min(faceNumber - 1, this.faceNormals.length - 1));
        const faceNormal = this.faceNormals[faceIndex];
        if (!faceNormal) {
            return;
        }

        const targetRotation = this.calculateRotationToShowFace(faceNormal.clone());
        const targetQuaternion = new THREE.Quaternion().setFromEuler(targetRotation);
        const lowestVertexY = this.getLowestVertexYForQuaternion(targetQuaternion);
        const desiredY = this.floorHeight - lowestVertexY + 0.002;
        const nextPosition = targetPosition ? targetPosition.clone() : this.dice.position.clone();
        nextPosition.y = desiredY;

        this.dice.quaternion.copy(targetQuaternion);
        this.dice.position.copy(nextPosition);

        this.diceBody.quaternion.set(targetQuaternion.x, targetQuaternion.y, targetQuaternion.z, targetQuaternion.w);
        this.diceBody.position.set(nextPosition.x, nextPosition.y, nextPosition.z);
        this.diceBody.velocity.set(0, 0, 0);
        this.diceBody.angularVelocity.set(0, 0, 0);
        this.diceBody.force.set(0, 0, 0);
        this.diceBody.torque.set(0, 0, 0);
        this.diceBody.allowSleep = true;
        this.diceBody.sleepSpeedLimit = 0.02;
        this.diceBody.sleepTimeLimit = 0.2;
        this.diceBody.sleep();
    }

    private getLowestVertexYForQuaternion(quaternion: THREE.Quaternion): number {
        if (!this.diceGeometry) {
            return 0;
        }

        const positionAttribute = this.diceGeometry.attributes.position;
        if (!positionAttribute) {
            return 0;
        }

        const vertex = new THREE.Vector3();
        let minY = Infinity;

        for (let i = 0; i < positionAttribute.count; i++) {
            vertex.fromBufferAttribute(positionAttribute, i);
            vertex.applyQuaternion(quaternion);
            if (vertex.y < minY) {
                minY = vertex.y;
            }
        }

        return minY === Infinity ? 0 : minY;
    }

    private snapToNearestFace(): void {
        const nearestFace = this.getTopFaceNumber();

        // All snap behavior removed - dice settle naturally

        const faceRotations: { [key: number]: THREE.Euler } = {
            1: new THREE.Euler(-1.7, -0.9, -2.5),
            2: new THREE.Euler(-0.0, -0.5, 2.0),
            3: new THREE.Euler(-0.0, 0.6, -1.9),
            4: new THREE.Euler(-0.5, -2.8, 0.6),
            5: new THREE.Euler(-2.4, -0.4, -1.9),
            6: new THREE.Euler(-1.7, 2.9, 0.6),
            7: new THREE.Euler(-1.2, 0.1, -1.5),
            8: new THREE.Euler(-0.7, 2.2, -2.5),
            9: new THREE.Euler(0.7, 0.6, -1.2),
            10: new THREE.Euler(-2.8, 0.1, 0.1),
            11: new THREE.Euler(2.5, 1.0, -2.5),
            12: new THREE.Euler(-1.7, -0.9, 0.6),
            13: new THREE.Euler(-2.6, -0.0, -3.1),
            14: new THREE.Euler(-2.8, -2.7, 0.0),
            15: new THREE.Euler(-1.2, -0.0, 1.6),
            16: new THREE.Euler(-0.6, -2.8, -2.5),
            17: new THREE.Euler(-2.3, -0.5, 1.3),
            18: new THREE.Euler(-0.0, 0.6, 1.2),
            19: new THREE.Euler(-0.0, -0.5, -1.2),
            20: new THREE.Euler(-2.4, 2.7, -1.2)
        };

        const targetRotation = faceRotations[nearestFace];
        if (targetRotation) {
            const currentRotation = this.dice.rotation;
            const snapStrength = 0.5;

            this.dice.rotation.x = currentRotation.x + (targetRotation.x - currentRotation.x) * snapStrength;
            this.dice.rotation.y = currentRotation.y + (targetRotation.y - currentRotation.y) * snapStrength;
            this.dice.rotation.z = currentRotation.z + (targetRotation.z - currentRotation.z) * snapStrength;

            const quaternion = new THREE.Quaternion();
            quaternion.setFromEuler(this.dice.rotation);
            this.diceBody.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        }
    }

    private normalizeAngle(angle: number): number {
        // Normalize angle to [-π, π]
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    }


    /**
     * Size to the container the canvas is actually in.
     *
     * This used to derive the size from the window minus a hardcoded 44px for
     * Obsidian's header, which meant the canvas disagreed with the overlay
     * holding it at any zoom other than 100%. The container knows its own size.
     */
    private setInitialSize() {
        const rect = this.container.getBoundingClientRect();
        this.updateSize(
            rect.width || window.innerWidth,
            rect.height || window.innerHeight
        );
    }

    public updateSize(width: number, height: number) {
        // Force renderer to exactly match the provided dimensions
        this.renderer.setSize(width, height, true);

        // Uncapped devicePixelRatio means nine times the fragments on a 3x
        // display for dice about a hundred pixels across.
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

        // Set canvas to fill container completely without any constraints
        const canvas = this.renderer.domElement;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvas.style.display = 'block';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';

        // Update orthographic camera frustum to match the exact window dimensions
        const aspect = width / height;
        const frustumSize = 20;
        this.camera.left = -frustumSize * aspect / 2;
        this.camera.right = frustumSize * aspect / 2;
        this.camera.top = frustumSize / 2;
        this.camera.bottom = -frustumSize / 2;

        // Update the camera projection matrix for orthographic camera
        this.camera.updateProjectionMatrix();

        // The tray is sized from the camera, so a resize moves its walls. Only
        // once the world exists: the first call comes from init(), before
        // there is anything to rebuild.
        if (this.world) {
            this.createDiceTray();
            // A wall that moves out from under a sleeping die leaves it outside
            // the tray, and a sleeping body never notices.
            for (const body of this.diceBodyArray) body?.wakeUp();
        }

        this.cachedRect = null;
        this.wake();
    }

    private reinitializeAfterContextLoss() {
        try {
            // Recreate the scene elements
            this.createDiceTray();
            this.setupLighting();
            this.wake();
        } catch (error) {
            console.error('Failed to reinitialize scene after context loss:', error);
        }
    }

    /**
     * Build every die on the table again, keeping the set that was on it.
     *
     * updateSettings deliberately leaves the dice alone - it hands the renderer
     * new numbers, and a die's geometry is not one of them. Anything that
     * changes the shape rather than the look has to come through here instead.
     * Where the dice were is not worth preserving: they are laid out again from
     * scratch, which is what happens when one is added anyway.
     */
    public rebuildDice(): void {
        const present = this.diceTypeArray.slice();
        if (!present.length) return;
        this.clearAllDice();
        for (const type of present) this.createSingleDice(type);
        this.wake();
    }

    public updateSettings(newSettings: DiceSettings) {
        this.settings = newSettings;

        // Update dice material properties
        if (this.dice && this.dice.material) {
            const material = this.dice.material as THREE.MeshPhongMaterial;
            material.color.setStyle(this.colorFor(this.settings.diceType));
            const finish = this.packFinish();
            material.shininess = finish.shininess;
            material.specular = new THREE.Color(finish.specular);
            material.transparent = finish.transparent;
            material.opacity = finish.opacity;
            material.needsUpdate = true;
        }

        // Note: In multi-dice system, individual dice settings are handled when created
        // No need to recreate all dice on settings change

        // Update tray (createDiceTray removes the previous one)
        this.createDiceTray();

        // Update lighting (this also refits the shadow camera to the tray)
        this.setupLighting();

        this.wake();
    }

    public destroy() {
        this.isViewActive = false;
        document.removeEventListener('mousemove', this.trackPointer, true);
        // destroy() deliberately drops the WebGL context below; without this the
        // context-lost handler reports our own teardown as a fault.
        this.isTearingDown = true;

        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        if (this.rollTimeout) {
            clearTimeout(this.rollTimeout);
        }

        // Clean up hover circle
        if (this.hoverCircle) {
            this.scene.remove(this.hoverCircle);
            this.hoverCircle = null;
            this.hoverCircleMaterial = null;
        }

        // Remove event listeners
        if (this.renderer) {
            const canvas = this.renderer.domElement;

            this.container.removeChild(this.renderer.domElement);
            this.renderer.dispose();

            const gl = this.renderer.getContext();
            if (gl && gl.getExtension('WEBGL_lose_context')) {
                gl.getExtension('WEBGL_lose_context')!.loseContext();
            }
        }

        if (this.scene) {
            // scene.clear() only detaches — geometries, materials and the
            // megabyte-sized face textures stay resident on the GPU otherwise.
            this.scene.traverse((object) => {
                const mesh = object as THREE.Mesh;
                if (!mesh.isMesh) return;
                mesh.geometry?.dispose();
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                for (const material of materials) {
                    if (!material) continue;
                    const phong = material as THREE.MeshPhongMaterial;
                    phong.map?.dispose();
                    phong.normalMap?.dispose();
                    material.dispose();
                }
            });
            this.originalMaterials.forEach((material) => {
                const list = Array.isArray(material) ? material : [material];
                for (const entry of list) entry?.dispose();
            });
            this.originalMaterials.clear();
            this.textureCache.clear();
            this.disposeBlobShadows();
            this.scene.clear();
        }

        if (this.world) {
            // removeBody() splices world.bodies, so iterating it forwards skips
            // every second body.
            for (let i = this.world.bodies.length - 1; i >= 0; i--) {
                this.world.removeBody(this.world.bodies[i]);
            }
        }
    }

    public autoCalibrateFace(faceNumber: number): boolean {
        if (!this.dice || !this.diceBody) {
            console.error('Cannot calibrate: dice not initialized');
            return false;
        }

        const faceCount = this.getFaceCount();
        if (faceNumber < 1 || faceNumber > faceCount) {
            console.error(`Face number must be between 1 and ${faceCount} for ${this.settings.diceType}`);
            return false;
        }

        log(`🎯 AUTO-CALIBRATING Face ${faceNumber}`);

        // Find which face is currently pointing most upward
        const upVector = new THREE.Vector3(0, 1, 0);
        let bestFaceIndex = 0;
        let bestDotProduct = -1;

        for (let i = 0; i < this.faceNormals.length; i++) {
            // Transform face normal to world space
            const worldNormal = this.faceNormals[i].clone();
            worldNormal.applyQuaternion(this.dice.quaternion);

            // Calculate dot product with up vector
            const dotProduct = worldNormal.dot(upVector);

            if (dotProduct > bestDotProduct) {
                bestDotProduct = dotProduct;
                bestFaceIndex = i;
            }
        }

        log(`Current upward-facing geometry face index: ${bestFaceIndex}`);
        log(`Dot product with up vector: ${bestDotProduct.toFixed(3)}`);
        log(`Mapping face index ${bestFaceIndex} to number ${faceNumber}`);

        // Update the face mapping immediately
        this.settings.faceMapping[bestFaceIndex] = faceNumber;

        log(`✅ Face ${faceNumber} calibrated! Geometry face ${bestFaceIndex} now maps to ${faceNumber}`);
        log('Updated face mapping:', this.settings.faceMapping);

        // Trigger a settings save through the plugin
        if (this.onCalibrationChanged) {
            this.onCalibrationChanged();
        }

        return true;
    }

    // Callback for when calibration changes
    public onCalibrationChanged: (() => void) | null = null;

    // Individual dice states for enhanced roll system
    private diceStates: Array<{
        index: number;
        type: string;
        isRolling: boolean;
        isCaught: boolean;
        isComplete: boolean;
        result: number | null;
        lastMotion: number;
        stableTime: number;
    }> = [];
    private currentMonitor: (() => void) | null = null;
    private originalMaterials: Map<number, THREE.Material | THREE.Material[]> = new Map();

    /**
     * The dice of the last settled roll, handed over once. Some rolls report
     * through more than one path; taking clears it so each is passed on once.
     */
    /** True while dice are in the air or a roll is still being read. */
    public get rollInProgress(): boolean {
        return this.isRolling || this.currentMonitor !== null;
    }

    public takeLastRoll(): RolledDie[] | null {
        const roll = this.lastRoll;
        this.lastRoll = null;
        return roll;
    }

    // Enhanced roll method with individual dice detection
    public async roll(): Promise<string> {
        return new Promise((resolve, reject) => {
            try {
                if (this.diceArray.length === 0) {
                    reject(new Error('No dice to roll'));
                    return;
                }

                log(`🎲 Starting enhanced roll with ${this.diceArray.length} dice`);

                // Initialize dice states
                this.initializeDiceStates();

                // Apply physics impulse to all dice
                this.applyRollForces();

                // Start monitoring individual dice
                this.startIndividualDiceMonitoring(resolve, reject);

            } catch (error) {
                console.error('Roll error:', error);
                reject(error);
            }
        });
    }

    private initializeDiceStates() {
        this.diceStates = [];
        this.lastRoll = null;
        for (let i = 0; i < this.diceArray.length; i++) {
            this.diceStates.push({
                index: i,
                type: this.diceTypeArray[i] || 'd20',
                isRolling: true,
                isCaught: false,
                isComplete: false,
                result: null,
                lastMotion: Date.now(),
                stableTime: 0
            });
        }
        log(`🎯 Initialized ${this.diceStates.length} dice states`);
    }

    private applyRollForces() {
        this.diceBodyArray.forEach((body, index) => {
            if (body) {
                // A sleeping body ignores impulses and velocity writes until it
                // is woken explicitly — without this a second roll never starts.
                body.wakeUp();

                // Reset position to prevent stacking
                const spread = Math.min(this.diceArray.length * 0.3, 4);
                const angle = (index / this.diceArray.length) * Math.PI * 2;
                const radius = spread * 0.5;

                body.position.set(
                    Math.cos(angle) * radius,
                    5 + Math.random() * 2,
                    Math.sin(angle) * radius
                );

                // Apply random rotation
                body.quaternion.set(
                    Math.random() - 0.5,
                    Math.random() - 0.5,
                    Math.random() - 0.5,
                    Math.random() - 0.5
                );
                body.quaternion.normalize();

                // Apply strong impulse force
                const forceMultiplier = 15 + Math.random() * 10;
                const force = new CANNON.Vec3(
                    (Math.random() - 0.5) * forceMultiplier,
                    Math.random() * 5,
                    (Math.random() - 0.5) * forceMultiplier
                );
                body.applyImpulse(force);

                // Apply random torque
                const torque = new CANNON.Vec3(
                    (Math.random() - 0.5) * 20,
                    (Math.random() - 0.5) * 20,
                    (Math.random() - 0.5) * 20
                );
                body.applyTorque(torque);
            }
        });
        this.wake();
    }

    private startIndividualDiceMonitoring(resolve: (value: string) => void, reject: (reason?: any) => void) {
        const startTime = Date.now();
        const maxWaitTime = 15000; // Maximum 15 seconds
        const checkInterval = 100; // Check every 100ms

        const monitor = () => {
            try {
                // Early exit if view is no longer active
                if (!this.isViewActive) {
                    log('🛑 Monitoring stopped - view is no longer active');
                    this.currentMonitor = null;
                    this.diceStates = [];
                    return;
                }

                const now = Date.now();
                let allComplete = true;
                let statusUpdate = '';

                // Check each die individually
                for (let i = 0; i < this.diceStates.length; i++) {
                    const state = this.diceStates[i];
                    const body = this.diceBodyArray[i];

                    if (!state.isComplete && body) {
                        // Calculate motion (velocity + angular velocity)
                        const linearVel = body.velocity.length();
                        const angularVel = body.angularVelocity.length();
                        const totalMotion = linearVel + angularVel;

                        // Check if dice has settled
                        if (totalMotion < this.settings.motionThreshold) {
                            if (state.stableTime === 0) {
                                state.stableTime = now;
                            } else if (now - state.stableTime > 2000 && !state.isComplete) {
                                // Dice has been stable for 2 seconds - check if it can be determined
                                // Re-check every 500ms for caught dice in case they micro-settle
                                const shouldCheck = !state.isCaught || (now - state.lastMotion > 500);

                                if (shouldCheck) {
                                    const checkResult = this.checkDiceResult(i);

                                    if (checkResult.isCaught) {
                                        if (!state.isCaught) {
                                            // First time catching this dice - no highlight for caught state
                                            state.isCaught = true;
                                            state.isRolling = false;
                                            state.result = null;
                                            log(`🥅 Dice ${i} (${state.type}) CAUGHT! Face confidence: ${checkResult.confidence.toFixed(3)}, required: ${checkResult.requiredConfidence.toFixed(3)}`);
                                        }
                                        // Update lastMotion to prevent rapid re-checking
                                        state.lastMotion = now;
                                    } else {
                                        // Face detection succeeded - HIGHLIGHT the completed dice
                                        if (state.isCaught) {
                                            // Was caught but now valid - clear caught state and highlight as complete
                                            log(`✅ Dice ${i} (${state.type}) was caught but has now settled with result: ${checkResult.result}`);
                                        } else {
                                            log(`✅ Dice ${i} (${state.type}) settled with result: ${checkResult.result}`);
                                        }
                                        state.result = checkResult.result;
                                        state.isComplete = true;
                                        state.isRolling = false;
                                        state.isCaught = false;
                                        // Highlight completed dice
                                        this.highlightCaughtDice(i, true);
                                    }
                                }
                            }
                        } else {
                            // Dice is moving again - reset stability timer
                            state.stableTime = 0;
                            state.lastMotion = now;

                            // If dice was marked as caught but is moving again, give it another chance
                            if (state.isCaught) {
                                log(`🔄 Dice ${i} was caught but is moving again - clearing caught state`);
                                state.isCaught = false;
                                state.isRolling = true;
                            }

                            // If dice was completed but is moving again, remove highlight
                            if (state.isComplete) {
                                log(`🔄 Dice ${i} was complete but is moving again - clearing highlight`);
                                state.isComplete = false;
                                state.isRolling = true;
                                this.highlightCaughtDice(i, false);
                            }
                        }

                        if (!state.isComplete) {
                            allComplete = false;
                        }
                    }
                }

                // Update status
                const completed = this.diceStates.filter(d => d.isComplete).length;
                const caught = this.diceStates.filter(d => d.isCaught && !d.isComplete).length;
                const rolling = this.diceStates.filter(d => d.isRolling && !d.isCaught && !d.isComplete).length;

                statusUpdate = `Rolling: ${rolling}, Caught: ${caught}, Complete: ${completed}/${this.diceStates.length}`;


                // If there are caught dice, DON'T show results yet - wait for reroll
                if (caught > 0 && rolling === 0) {
                    // All dice have settled, but some are caught - wait for user to reroll
                    // Continue monitoring but don't resolve (only if view is still active)
                    if (this.isViewActive) {
                        setTimeout(monitor, checkInterval);
                    } else {
                        log('🛑 Monitoring stopped - view is no longer active');
                        this.currentMonitor = null;
                        this.diceStates = [];
                    }
                    return;
                }

                // Check if all dice are complete (and none are caught)
                if (allComplete && caught === 0) {
                    // All dice have valid results - show final result
                    const results = this.diceStates.map(d => d.result).filter(r => r !== null);
                    const total = results.reduce((sum, val) => sum + val!, 0);

                    const breakdown = this.diceStates
                        .map((state, i) => `${state.type}=${state.result}`)
                        .join(' + ');

                    const resultString = `${breakdown} = ${total}`;
                    this.lastRoll = this.diceStates.map(state => ({ type: state.type, value: state.result!, index: state.index }));
                    log(`🏆 All dice complete! Result: ${resultString}`);

                    // Clear monitoring state
                    this.currentMonitor = null;
                    this.diceStates = [];

                    resolve(resultString);
                    return;
                }

                // Check for timeout
                if (now - startTime > maxWaitTime) {
                    log(`⏰ Roll timeout after ${maxWaitTime/1000}s`);
                    // Force completion with current results
                    const partialResults = this.diceStates.map((state, i) => {
                        if (state.result !== null) {
                            return state.result;
                        } else {
                            // Force detect result for incomplete dice
                            return this.getTopFaceNumberForDice(i);
                        }
                    });
                    const total = partialResults.reduce((sum, val) => sum + val, 0);
                    const breakdown = partialResults
                        .map((result, i) => `${this.diceStates[i].type}=${result}`)
                        .join(' + ');
                    this.lastRoll = partialResults.map((value, i) => ({ type: this.diceStates[i].type, value, index: i }));

                    // Clear all highlights before resolving
                    this.clearAllHighlights();

                    // Clear monitoring state
                    this.currentMonitor = null;
                    this.diceStates = [];

                    resolve(`${breakdown} = ${total}`);
                    return;
                }

                // Continue monitoring (only if view is still active)
                if (this.isViewActive) {
                    setTimeout(monitor, checkInterval);
                } else {
                    log('🛑 Monitoring stopped - view is no longer active');
                    this.currentMonitor = null;
                    this.diceStates = [];
                }

            } catch (error) {
                console.error('Monitoring error:', error);
                // Clear monitoring state on error
                this.currentMonitor = null;
                this.diceStates = [];
                reject(error);
            }
        };

        // Store the monitor function so it can be resumed after reroll
        this.currentMonitor = monitor;

        // Start monitoring
        monitor();
    }

    // Method to manually reroll caught dice
    public rerollCaughtDice(): boolean {
        const caughtDice = this.diceStates.filter(d => d.isCaught && !d.isComplete);

        if (caughtDice.length === 0) {
            log('No caught dice to reroll');
            return false;
        }

        log(`🎲 Rerolling ${caughtDice.length} caught dice`);

        caughtDice.forEach(state => {
            const body = this.diceBodyArray[state.index];
            if (body) {
                // Remove highlight from caught dice
                this.highlightCaughtDice(state.index, false);

                // Reset dice state
                state.isCaught = false;
                state.isRolling = true;
                state.stableTime = 0;
                state.lastMotion = Date.now();

                // Apply new force to caught dice - ensure they fall down
                body.wakeUp();
                const forceMultiplier = 10 + Math.random() * 8;
                const force = new CANNON.Vec3(
                    (Math.random() - 0.5) * forceMultiplier,
                    -5, // Strong downward force to prevent recatching
                    (Math.random() - 0.5) * forceMultiplier
                );
                body.applyImpulse(force);

                log(`🔄 Rerolled dice ${state.index} with force ${force.length().toFixed(2)}`);
            }
        });

        this.wake();
        return true;
    }

    // Get current dice status for UI updates
    public getDiceStatus(): Array<{index: number, type: string, status: string, result?: number}> {
        return this.diceStates.map(state => ({
            index: state.index,
            type: state.type,
            status: state.isComplete ? 'complete' :
                   state.isCaught ? 'caught' :
                   state.isRolling ? 'rolling' : 'unknown',
            result: state.result || undefined
        }));
    }

    // Highlight completed dice with emissive glow
    private highlightCaughtDice(index: number, highlight: boolean) {
        const dice = this.diceArray[index];
        if (!dice) return;

        // Still take the un-highlight branch when the feature is off, so a die
        // highlighted before the setting was turned off gets its material back.
        if (highlight && this.settings.highlightCompletedDice) {
            // Store original material if not already stored
            if (!this.originalMaterials.has(index)) {
                this.originalMaterials.set(index, dice.material);
            }

            // Create highlighted material with configured color
            const currentMaterial = Array.isArray(dice.material) ? dice.material[0] : dice.material;
            const highlightedMaterial = (currentMaterial as THREE.MeshStandardMaterial).clone();
            // Convert hex color string to number (e.g., "#00ff00" -> 0x00ff00)
            const colorHex = parseInt(this.settings.completedDiceHighlightColor.replace('#', ''), 16);
            highlightedMaterial.emissive.setHex(colorHex);
            highlightedMaterial.emissiveIntensity = 0.8;
            dice.material = highlightedMaterial;
        } else {
            // Restore original material
            const originalMaterial = this.originalMaterials.get(index);
            if (originalMaterial) {
                // The highlight is a clone; dropping the reference without
                // disposing leaks its GPU program.
                const clone = dice.material;
                dice.material = originalMaterial;
                if (clone !== originalMaterial && !Array.isArray(clone)) {
                    clone.dispose();
                }
                this.originalMaterials.delete(index);
            }
        }
        // The monitor can swap materials long after everything has gone to
        // sleep; without a wake the change never reaches the screen.
        this.wake();
    }

    // Clear all highlights
    private clearAllHighlights() {
        this.originalMaterials.forEach((originalMaterial, index) => {
            const dice = this.diceArray[index];
            if (dice) {
                dice.material = originalMaterial;
            }
        });
        this.originalMaterials.clear();
        log('🔅 Cleared all dice highlights');
    }
}





