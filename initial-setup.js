import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.min.js';
import { FBXLoader } from 'https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/loaders/FBXLoader.js';
import { AnimationSystem } from './animation-system.js';

// Performance Settings
const tilesMaximumScreenSpaceError = 50;
const enableFrustumCulling = true;
const enableLOD = true;

/**
 * Initializes the Three.js scene
 * @returns {Object} Three.js objects and animation system
 */
export async function initThree() {
    const three = { 
        scene: null, 
        camera: null, 
        renderer: null, 
        playerMesh: null,
        animationSystem: null,
        clock: new THREE.Clock()
    };
    
    const scene = new THREE.Scene();
    const canvas = document.getElementById('threeCanvas');

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100000);
    three.camera = camera;

    const renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.autoClear = false;
    three.renderer = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
    scene.add(ambientLight);
    /*
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 10, 5);
    scene.add(directionalLight);
    */

    // Load FBX Model
    const loader = new FBXLoader();
    try {
        const fbx = await loader.loadAsync('assets/pandaFBX/panda.fbx');
        const playerMesh = fbx;

        // Add debugging to check model details
        console.log("FBX model details:", {
            children: playerMesh.children.length,
            animations: playerMesh.animations ? playerMesh.animations.length : 0,
            geometry: playerMesh.children.some(c => c.geometry !== undefined)
        });
        
        // Center the model properly
        const box = new THREE.Box3().setFromObject(playerMesh);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        console.log("Model dimensions:", size);
        
        playerMesh.position.x = -center.x;
        playerMesh.position.y = -center.y;
        playerMesh.position.z = -center.z;
        
        const scale = 1.2;
        playerMesh.scale.set(scale, scale, scale);

        playerMesh.rotation.set(0, Math.PI, 0); // Rotate 180 degrees so back faces camera
        playerMesh.position.set(0, -size.y/2, 0); // Adjust to stand on ground
        
        // Make sure the model is visible
        playerMesh.traverse(function(child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                
                // Check if material exists and is properly configured
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => {
                            mat.transparent = false;
                            mat.opacity = 1.0;
                            mat.side = THREE.DoubleSide;
                        });
                    } else {
                        child.material.transparent = false;
                        child.material.opacity = 1.0;
                        child.material.side = THREE.DoubleSide;
                    }
                }
            }
        });
        
        // Add the model to the scene
        scene.add(playerMesh);
        three.playerMesh = playerMesh;
        console.log("FBX player model added to scene successfully.");
        
        // Initialize animation system
        const animationSystem = new AnimationSystem(scene, playerMesh);
        three.animationSystem = animationSystem;
        
        // Load all animations
        await animationSystem.loadAllAnimations(loader);
        console.log("Animations loaded successfully.");
        
    } catch (error) {
        console.error("Failed to load FBX model:", error);
        // Fallback to cylinder if FBX fails to load
        const radius = 0.3;
        const height = 5.0;
        const cylinder = new THREE.CylinderGeometry(radius, radius, height, 8);
        const material = new THREE.MeshStandardMaterial({ color: 0xff8800 });
        const playerMesh = new THREE.Mesh(cylinder, material);
        playerMesh.position.set(0, height / 2, 0);
        playerMesh.rotation.x = Math.PI / 2;
        scene.add(playerMesh);
        three.playerMesh = playerMesh;
    }

    scene.add(camera);
    three.scene = scene;
    console.log("Three.js scene initialized.");
    
    return three;
}

/**
 * Initializes the Cesium viewer with all camera controls completely disabled
 * @returns {Object} Cesium viewer and camera
 */
export function initCesium() {
    // Performance Settings
    const tilesMaximumScreenSpaceError = 50;
    const enableFrustumCulling = true;
    
    const viewer = new Cesium.Viewer('cesiumContainer', {
        animation: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false, 
        infoBox: false, 
        sceneModePicker: false, 
        selectionIndicator: false,
        timeline: false, 
        navigationHelpButton: false, 
        scene3DOnly: true,
        useDefaultRenderLoop: false,
        maximumScreenSpaceError: tilesMaximumScreenSpaceError,
        requestRenderMode: false,
        baseLayerPicker: false,
        // Create the skyBox, atmosphere, etc. but we'll hide them after creation
        contextOptions: {
            webgl: {
                alpha: true
            }
        }
    });

    // Check if sky objects exist before trying to hide them
    if (viewer.scene.skyBox) {
        viewer.scene.skyBox.show = false;
    }
    
    if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.show = false;
    }
    
    if (viewer.scene.sun) {
        viewer.scene.sun.show = false;
    }
    
    if (viewer.scene.moon) {
        viewer.scene.moon.show = false;
    }
    
    // Set a transparent background
    viewer.scene.backgroundColor = new Cesium.Color(0, 0, 0, 0);
    viewer.scene.globe.baseColor = new Cesium.Color(0.5, 0.5, 0.5, 1.0);

    // Remove default base imagery layer
    if (viewer.imageryLayers && viewer.imageryLayers.length > 0) {
        viewer.imageryLayers.removeAll();
    }

    // === DISABLE ALL CESIUM CONTROLS ===
    // 1. Disable the screenSpaceCameraController completely
    viewer.scene.screenSpaceCameraController.enableRotate = false;
    viewer.scene.screenSpaceCameraController.enableTranslate = false;
    viewer.scene.screenSpaceCameraController.enableZoom = false;
    viewer.scene.screenSpaceCameraController.enableTilt = false;
    viewer.scene.screenSpaceCameraController.enableLook = false;
    viewer.scene.screenSpaceCameraController.enableInputs = false;
    
    // 2. Block direct mouse/touch events on the Cesium container
    const cesiumContainer = document.getElementById('cesiumContainer');
    if (cesiumContainer) {
        // List of events to prevent default behavior
        const eventsToBlock = [
            'wheel', 'mousedown', 'mousemove', 'mouseup', 
            'touchstart', 'touchmove', 'touchend'
        ];
        
        eventsToBlock.forEach(eventType => {
            cesiumContainer.addEventListener(eventType, (event) => {
                // Allow events for UI elements like city selector
                if (event.target.id === 'citySelector' || 
                    event.target.id === 'instructions' || 
                    event.target.id === 'fpsCounter') {
                    return;
                }
                // Block event propagation and default behavior
                event.stopPropagation();
                event.preventDefault();
            }, { passive: false });
        });
    }
    
    // 3. Add CSS to disable pointer events on Cesium elements
    const style = document.createElement('style');
    style.textContent = `
        #cesiumContainer .cesium-viewer-cesiumWidgetContainer {
            pointer-events: none;
        }
        #citySelector, #instructions, #fpsCounter, #animationInfo {
            pointer-events: auto;
        }
        #cesiumContainer canvas {
            pointer-events: none;
        }
    `;
    document.head.appendChild(style);
    
    console.log("All Cesium camera controls have been disabled");
    // === END DISABLE CONTROLS ===

    viewer.scene.globe.depthTestAgainstTerrain = true;
    const cesiumCamera = viewer.camera;

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

    if (enableFrustumCulling) {
        setTimeout(() => FrustumCuller.init(cesiumCamera), 100);
    }

    // Critical settings for proper transparency
    viewer.scene.globe.enableLighting = false;   // Disable lighting to prevent color shifts
    viewer.scene.fog.enabled = false;            // Disable fog to prevent it from blocking sky
    viewer.scene.backgroundColor = new Cesium.Color(0, 0, 0, 0);  // Transparent background
    viewer.scene.globe.showGroundAtmosphere = false;  // Disable ground atmosphere
    // viewer.scene.orderIndependentTranslucency = false; // Disable OIT for better performance

    // Set globe transparency for blending with sky
    const globeTransparency = 1.0; // Fully opaque terrain
    viewer.scene.globe.translucency.enabled = false; // Don't need globe translucency
    viewer.scene.globe.baseColor = new Cesium.Color(0.5, 0.5, 0.5, globeTransparency);

    // Make sure no leftover atmosphere exists
    viewer.scene.skyAtmosphere = undefined;

    return { viewer, cesiumCamera, FrustumCuller };
}

/**
 * Loads the OSM Buildings tileset with pastel glass appearance
 * @param {Object} viewer - Cesium viewer instance
 * @param {HTMLElement} instructionsElement - Element to display instructions
 * @returns {Promise<Object>} Promise resolving to the tileset
 */
export async function loadOsmBuildings(viewer, instructionsElement) {
    try {
        const osmBuildingsTileset = await Cesium.Cesium3DTileset.fromIonAssetId(96188, {
            maximumScreenSpaceError: tilesMaximumScreenSpaceError,
            cullWithChildrenBounds: true,
            skipLevelOfDetail: false,
            preferLeaves: true
        });

        viewer.scene.primitives.add(osmBuildingsTileset);
        
        // Create a colorful pastel glass style with transparency
        // Use a deterministic function based on feature properties to assign consistent colors
        osmBuildingsTileset.style = new Cesium.Cesium3DTileStyle({
            color: {
                evaluateColor: function(feature, result) {
                    // Get a property to base color on (height, feature ID, etc.)
                    const height = feature.getProperty('height') || feature.getProperty('render_height') || 20;
                    const id = feature.getProperty('id') || feature.getProperty('building');
                    
                    // Use a hash-like function to get consistent colors for same buildings
                    let hashValue = 0;
                    if (id) {
                        // Simple string hash for consistency
                        for (let i = 0; i < id.length; i++) {
                            hashValue = ((hashValue << 5) - hashValue) + id.charCodeAt(i);
                            hashValue |= 0; // Convert to 32bit integer
                        }
                    } else {
                        // If no ID, use height as fallback
                        hashValue = Math.floor(height * 1000);
                    }
                    
                    // Create a pastel color palette
                    // Pastel colors have high lightness and low to medium saturation
                    const hue = Math.abs(hashValue+100 % 360); // 0-359 degree hue
                    
                    // Create pastels by keeping saturation and value high
                    // Alpha is set to create transparency effect (0.65 = 35% transparent)
                    return Cesium.Color.fromHsl(
                        hue / 360.0,     // Hue (normalized 0-1)
                        0.5,             // Saturation (lower for more pastel look)
                        0.98,            // Lightness (higher for more pastel look)
                        1.0,            // Alpha (65% opaque)
                        result
                    );
                }
            }
        });

        await osmBuildingsTileset.readyPromise;
        console.log("OSM Buildings Tileset Ready with Pastel Glass Style.");

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
    tileset.maximumScreenSpaceError = tilesMaximumScreenSpaceError;
    console.log("LOD configured for tileset.");
}