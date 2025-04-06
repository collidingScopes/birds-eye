import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.min.js';

// Performance Settings
const tilesMaximumScreenSpaceError = 50;
const enableFrustumCulling = true; // Enable custom frustum culler (potentially redundant)
const enableLOD = true;

/**
 * Initializes the Three.js scene
 * @returns {Object} Three.js objects
 */
export function initThree() {
    const three = { scene: null, camera: null, renderer: null, playerMesh: null };
    
    const scene = new THREE.Scene();
    const canvas = document.getElementById('threeCanvas');

    // Three.js camera - Its parameters will be overwritten by Cesium's
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 50000); // Increased far plane for large scenes
    three.camera = camera;

    const renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true, // Allow transparency
        antialias: true,
        powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.autoClear = false; // Manual control for overlaying
    three.renderer = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 10, 5); // Relative light position
    scene.add(directionalLight);

    // Player Mesh (Cylinder)
    const radius = 0.3;
    const height = 1.0;
    // THREE.CylinderGeometry constructor: (radiusTop, radiusBottom, height, radialSegments)
    const cylinder = new THREE.CylinderGeometry(radius, radius, height, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0xff8800 }); // Orange
    const playerMesh = new THREE.Mesh(cylinder, material);
    // Position the cylinder pivot at its base for easier alignment with Cesium height
    playerMesh.position.set(0, height / 2, 0);
    // Initial rotation to make cylinder upright along the Y-axis in Three.js
    playerMesh.rotation.x = Math.PI / 2;
    scene.add(playerMesh);

    scene.add(camera); // Add camera to the scene

    three.scene = scene;
    three.playerMesh = playerMesh;
    console.log("Three.js scene initialized.");
    
    return three;
}

/**
 * Initializes the Cesium viewer
 * @returns {Object} Cesium viewer and camera
 */
export function initCesium() {
    // --- Cesium Viewer Initialization ---
    const viewer = new Cesium.Viewer('cesiumContainer', {
        animation: false, baseLayerPicker: false, fullscreenButton: false, geocoder: false,
        homeButton: false, infoBox: false, sceneModePicker: false, selectionIndicator: false,
        timeline: false, navigationHelpButton: false, scene3DOnly: true,
        useDefaultRenderLoop: false, // We manage the render loop
        maximumScreenSpaceError: tilesMaximumScreenSpaceError,
        requestRenderMode: false, // Use continuous rendering for smoother updates
        // terrainProvider: Cesium.createWorldTerrain() // Optional: Add terrain
        infoBox: false, // Disable info box on click
        selectionIndicator: false // Disable selection indicator
    });

    viewer.scene.screenSpaceCameraController.enableInputs = false; // Disable default Cesium controls
    viewer.scene.globe.depthTestAgainstTerrain = true; // Important for collision and rendering order
    const cesiumCamera = viewer.camera;

    // --- Frustum Culling Implementation (Optional/Redundant Check) ---
    const FrustumCuller = {
        initialized: false,
        init: function(camera) {
            if (this.initialized || !camera || !camera.frustum) return;
            this.camera = camera;
            if (camera.frustum.fov && camera.frustum.aspectRatio && camera.frustum.near && camera.frustum.far) {
                this.frustum = new Cesium.PerspectiveFrustum();
                this.frustum.fov = camera.frustum.fov;
                this.frustum.aspectRatio = camera.frustum.aspectRatio;
                this.frustum.near = camera.frustum.near;
                this.frustum.far = camera.frustum.far;
                this.initialized = true;
            } else {
                console.warn("FrustumCuller: Camera frustum properties not available yet for init.");
            }
        },
        update: function() {
            if (!this.initialized || !this.camera || !this.camera.frustum) return;
            if (this.camera.frustum instanceof Cesium.PerspectiveFrustum || this.camera.frustum instanceof Cesium.PerspectiveOffCenterFrustum) {
                if (Cesium.defined(this.camera.frustum.fov)) this.frustum.fov = this.camera.frustum.fov;
                if (Cesium.defined(this.camera.frustum.aspectRatio)) this.frustum.aspectRatio = this.camera.frustum.aspectRatio;
                if (Cesium.defined(this.camera.frustum.near)) this.frustum.near = this.camera.frustum.near;
                if (Cesium.defined(this.camera.frustum.far)) this.frustum.far = this.camera.frustum.far;
            } else {
                this.initialized = false;
            }
        }
    };

    // Initialize the frustum culler (if enabled) - defer slightly
    if (enableFrustumCulling) {
        setTimeout(() => FrustumCuller.init(cesiumCamera), 100);
    }

    return { viewer, cesiumCamera, FrustumCuller };
}

/**
 * Loads the OSM Buildings tileset
 * @param {Object} viewer - Cesium viewer instance
 * @param {HTMLElement} instructionsElement - Element to display instructions
 * @returns {Promise<Object>} Promise resolving to the tileset
 */
export async function loadOsmBuildings(viewer, instructionsElement) {
    try {
        // Use Ion asset ID
        const osmBuildingsTileset = await Cesium.Cesium3DTileset.fromIonAssetId(96188, {
            maximumScreenSpaceError: tilesMaximumScreenSpaceError,
            maximumMemoryUsage: 2048,
            cullWithChildrenBounds: true,
            skipLevelOfDetail: false, // Let Cesium manage LOD more dynamically
            preferLeaves: true // Improves performance for dense areas
        });

        viewer.scene.primitives.add(osmBuildingsTileset);
        osmBuildingsTileset.style = new Cesium.Cesium3DTileStyle({ color: "color('#e0e0e0')" });

        // Wait for tileset to be ready
        await osmBuildingsTileset.readyPromise;
        console.log("OSM Buildings Tileset Ready.");

        // Set up dynamic LOD
        if (enableLOD) {
            setupLOD(osmBuildingsTileset);
        }

        instructionsElement.innerHTML = "W/S: Move | A/D: Strafe | Arrows: Look | Space: Jump<br>Facing: North";
        
        return osmBuildingsTileset;
    } catch (error) {
        console.error(`Error loading Cesium OSM Buildings: ${error}`);
        instructionsElement.innerHTML = "Error loading city data.<br>Check console.";
        instructionsElement.style.color = 'red';
        if (error instanceof Cesium.RequestErrorEvent) {
            console.error("Network error or CORS issue loading tileset?");
        } else if (error.message && (error.message.includes("401") || error.message.includes("404"))) {
             console.error("Invalid Cesium ION Token or Asset ID permissions/not found?");
        }
        throw error;
    }
}

/**
 * Set up Level of Detail (LOD) for tileset
 * @param {Object} tileset - Cesium 3D Tileset
 */
function setupLOD(tileset) {
    if (!tileset) return;
    tileset.dynamicScreenSpaceError = true;
    tileset.dynamicScreenSpaceErrorDensity = 0.00278;
    tileset.dynamicScreenSpaceErrorFactor = 4.0;
    tileset.dynamicScreenSpaceErrorHeightFalloff = 0.25;
    tileset.maximumScreenSpaceError = tilesMaximumScreenSpaceError; // Base SSE
    console.log("LOD configured for tileset.");
}