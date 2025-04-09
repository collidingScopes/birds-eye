import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.min.js';
import { FBXLoader } from 'https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/loaders/FBXLoader.js';
import { AnimationSystem } from './animation-system.js';

// --- Constants previously in helper-functions.js ---
export const playerMoveSpeed = 100.0;
export const cameraTurnSpeed = 1.3;
export const jumpVelocity = 50;
export const gravity = -50.0;
export const groundHeight = 0.5;
// Define fall height constant to reuse
export const DRAMATIC_FALL_HEIGHT = 2500;

// City Coordinates
export const cities = {
    nyc: { longitude: -73.9854, latitude: 40.7580, displayName: 'NYC' },
    london: { longitude: -0.1276, latitude: 51.5074, displayName: 'London' },
    tokyo: { longitude: 139.6917, latitude: 35.6895, displayName: 'Tokyo' },
    paris: { longitude: 2.3522, latitude: 48.8566, displayName: 'Paris' },
    sydney: { longitude: 151.2093, latitude: -33.8688, displayName: 'Sydney' },
    montreal: { longitude: -73.5674, latitude: 45.5019, displayName: 'Montreal' },
    toronto: { longitude: -79.3832, latitude: 43.6532, displayName: 'Toronto' },
    istanbul: { longitude: 28.9784, latitude: 41.0082, displayName: 'Istanbul' },
    hanoi: { longitude: 105.8342, latitude: 21.0278, displayName: 'Hanoi' },
    hongkong: { longitude: 114.1694, latitude: 22.3193, displayName: 'Hong Kong' },
    seoul: { longitude: 126.9780, latitude: 37.5665, displayName: 'Seoul' },
    shanghai: { longitude: 121.4737, latitude: 31.2304, displayName: 'Shanghai' },
    sanfrancisco: { longitude: -122.4194, latitude: 37.7749, displayName: 'San Francisco' },
    berlin: { longitude: 13.4050, latitude: 52.5200, displayName: 'Berlin' },
    riodejaneiro: { longitude: -43.1729, latitude: -22.9068, displayName: 'Rio de Janeiro' },
    chicago: { longitude: -87.6298, latitude: 41.8781, displayName: 'Chicago' },
    dubai: { longitude: 55.2708, latitude: 25.2048, displayName: 'Dubai' },
    kualalumpur: { longitude: 101.6869, latitude: 3.1390, displayName: 'Kuala Lumpur' },
    singapore: { longitude: 103.8591, latitude: 1.2838, displayName: 'Singapore' },
    venice: { longitude: 12.3155, latitude: 45.4408, displayName: 'Venice' },
    dubrovnik: { longitude: 18.0944, latitude: 42.6507, displayName: 'Dubrovnik' },
    amsterdam: { longitude: 4.9041, latitude: 52.3676, displayName: 'Amsterdam' },
    barcelona: { longitude: 2.1734, latitude: 41.3851, displayName: 'Barcelona' },
    rome: { longitude: 12.4964, latitude: 41.9028, displayName: 'Rome' },
    athens: { longitude: 23.7275, latitude: 37.9838, displayName: 'Athens' },
    bangkok: { longitude: 100.5018, latitude: 13.7563, displayName: 'Bangkok' },
    cairo: { longitude: 31.2357, latitude: 30.0444, displayName: 'Cairo' },
    capetown: { longitude: 18.4241, latitude: -33.9249, displayName: 'Cape Town' },
    mexicocity: { longitude: -99.1332, latitude: 19.4326, displayName: 'Mexico City' },
    moscow: { longitude: 37.6173, latitude: 55.7558, displayName: 'Moscow' },
    mumbai: { longitude: 72.8777, latitude: 19.0760, displayName: 'Mumbai' },
    oslo: { longitude: 10.7522, latitude: 59.9139, displayName: 'Oslo' },
    prague: { longitude: 14.4378, latitude: 50.0755, displayName: 'Prague' },
    saopaulo: { longitude: -46.6333, latitude: -23.5505, displayName: 'São Paulo' },
    seattle: { longitude: -122.3321, latitude: 47.6062, displayName: 'Seattle' },
    stockholm: { longitude: 18.0686, latitude: 59.3293, displayName: 'Stockholm' },
    sydney: { longitude: 151.2093, latitude: -33.8688, displayName: 'Sydney' },
    taipei: { longitude: 121.5654, latitude: 25.0330, displayName: 'Taipei' },
    vienna: { longitude: 16.3738, latitude: 48.2082, displayName: 'Vienna' },
    zurich: { longitude: 8.5417, latitude: 47.3769, displayName: 'Zurich' },
    losangeles: { longitude: -118.2437, latitude: 34.0522, displayName: 'Los Angeles' },
    miami: { longitude: -80.1918, latitude: 25.7617, displayName: 'Miami' },
    lasvegas: { longitude: -115.1398, latitude: 36.1699, displayName: 'Las Vegas' },
    neworleans: { longitude: -90.0715, latitude: 29.9511, displayName: 'New Orleans' },
    kyoto: { longitude: 135.7681, latitude: 35.0116, displayName: 'Kyoto' },
    buenosaires: { longitude: -58.3816, latitude: -34.6037, displayName: 'Buenos Aires' },
    marrakech: { longitude: -8.0083, latitude: 31.6295, displayName: 'Marrakech' },
    santorini: { longitude: 25.4615, latitude: 36.3932, displayName: 'Santorini' }
};
let currentCity = "NYC";

// --- End Constants ---

/**
 * Populates the city selector dropdown with cities sorted alphabetically
 * @param {Object} cities - Object containing city coordinates
 */
export function populateCitySelector(cities) {
    const citySelector = document.getElementById('citySelector');
    
    if (!citySelector) {
        console.error("City selector element not found");
        return;
    }
    
    // Clear any existing options
    citySelector.innerHTML = '';
    
    // Get city entries and sort them alphabetically by display name
    const cityEntries = Object.entries(cities).sort((a, b) => {
        return a[1].displayName.localeCompare(b[1].displayName);
    });
    
    // Add options to the selector
    cityEntries.forEach(([cityKey, cityData]) => {
        const option = document.createElement('option');
        option.value = cityKey;
        option.textContent = cityData.displayName;
        citySelector.appendChild(option);
    });
    
    // Set NYC as default selection
    citySelector.value = 'nyc';
}

/**
 * Updates the forwardDirection and rightDirection vectors based on the current playerHeading.
 * Assumes playerHeading is radians clockwise from North.
 * Updates vectors in the ENU (East-North-Up) frame.
 *
 * @param {number} playerHeading - Player heading in radians
 * @param {Object} forwardDirection - Forward direction vector to update {x: East, y: North}
 * @param {Object} rightDirection - Right direction vector to update {x: East, y: North}
 */
export function updateDirectionVectors(playerHeading, forwardDirection, rightDirection) {
    // playerHeading: 0 = North, positive = CLOCKWISE (East=PI/2)
    // Standard Trig functions: 0 = East, positive = COUNTER-CLOCKWISE (North=PI/2)
    // Angle for standard trig functions = PI/2 - playerHeading
    const trigAngle = Cesium.Math.PI_OVER_TWO - playerHeading;

    // Forward direction in ENU (X=East, Y=North)
    forwardDirection.x = Math.cos(trigAngle);
    forwardDirection.y = Math.sin(trigAngle);
    // Ensure normalization (might be redundant if trig functions are precise)
    const fwdMag = Math.sqrt(forwardDirection.x**2 + forwardDirection.y**2);
    if (fwdMag > 1e-6) {
        forwardDirection.x /= fwdMag;
        forwardDirection.y /= fwdMag;
    }


    // Right direction (relative to forward, 90deg clockwise) in ENU
    // Rotation matrix for -90 deg: [cos(-90) -sin(-90)] [x] = [ 0  1] [x] = [ y]
    //                              [sin(-90)  cos(-90)] [y]   [-1  0] [y]   [-x]
    // So, rightDirection = (forwardDirection.y, -forwardDirection.x)
    rightDirection.x = forwardDirection.y;
    rightDirection.y = -forwardDirection.x;
    // Ensure normalization
    const rightMag = Math.sqrt(rightDirection.x**2 + rightDirection.y**2);
     if (rightMag > 1e-6) {
        rightDirection.x /= rightMag;
        rightDirection.y /= rightMag;
    }
}

/**
 * Gets cardinal direction name based on heading.
 * Assumes heading is radians clockwise from North.
 *
 * @param {number} headingRad - Heading in radians
 * @returns {string} Cardinal direction name
 */
export function getDirection(headingRad) {
    const twoPi = 2.0 * Math.PI;
    // Normalize heading to 0 <= heading < 2*PI
    let heading = headingRad % twoPi;
    if (heading < 0) {
        heading += twoPi;
    }
    let degrees = Cesium.Math.toDegrees(heading);

    if (degrees >= 337.5 || degrees < 22.5) return "North";
    if (degrees >= 22.5 && degrees < 67.5) return "Northeast";
    if (degrees >= 67.5 && degrees < 112.5) return "East";
    if (degrees >= 112.5 && degrees < 157.5) return "Southeast";
    if (degrees >= 157.5 && degrees < 202.5) return "South";
    if (degrees >= 202.5 && degrees < 247.5) return "Southwest";
    if (degrees >= 247.5 && degrees < 292.5) return "West";
    if (degrees >= 292.5 && degrees < 337.5) return "Northwest";
    return "Unknown"; // Should not happen
}

/**
 * Sets up keyboard and city selector listeners.
 *
 * @param {Object} inputState - Input state object to modify
 * @param {Object} playerPosition - Player position object to modify on city change
 * @param {Object} verticalVelocityRef - Reference object containing vertical velocity { value: number }
 * @param {Object} playerHeadingRef - Reference object containing player heading { value: number }
 * @param {Function} updateDirectionVectorsFunc - Function to update direction vectors
 * @param {Object} forwardDirection - Forward direction vector to update
 * @param {Object} rightDirection - Right direction vector to update
 * @param {Object} citiesData - City coordinates object (now defined in this file)
 * @param {Object} cesiumViewer - Cesium viewer instance
 * @param {Object} miniMapInstance - Minimap instance
 * @param {Object} cameraSystemInstance - Camera system instance
 * @param {Object} terrainManager - Terrain manager instance
 * @param {HTMLElement} instructionsElement - Element to display instructions
 * @param {Object} fallStateRef - Reference to the dramatic fall state variables
 * @param {Object} spaceFlightAnimation - Space flight animation instance (optional)
 */
export function setupInputListeners(
    inputState, playerPosition, verticalVelocityRef, playerHeadingRef,
    updateDirectionVectorsFunc, forwardDirection, rightDirection,
    citiesData, cesiumViewer, miniMapInstance, cameraSystemInstance,
    terrainManager, instructionsElement, fallStateRef, spaceFlightAnimation
) {
    // NOTE: citiesData is now the 'cities' constant defined in this file
    // groundHeight and DRAMATIC_FALL_HEIGHT are also defined in this file

    const citySelector = document.getElementById('citySelector');

    document.addEventListener('keydown', (event) => {
        const key = event.key.toUpperCase();
        let handled = true; // Flag to prevent default browser actions like scrolling
        event.preventDefault();

        if (spaceFlightAnimation && spaceFlightAnimation.isAnimating) {
            return;
        }
        
        switch (key) {
            case 'W': inputState.forward = true; break;
            case 'S': inputState.backward = true; break;
            case 'A': inputState.strafeLeft = true; break;
            case 'D': inputState.strafeRight = true; break;
            // --- Camera Controls (Arrows) - These only affect camera, not player ---
            case 'ARROWLEFT': inputState.left = true; break; // Camera turn Left
            case 'ARROWRIGHT': inputState.right = true; break; // Camera turn Right
            case 'ARROWUP': inputState.up = true; break; // Camera pitch up
            case 'ARROWDOWN': inputState.down = true; break; // Camera pitch down
            case ' ': inputState.jump = true; break; // Mark intent to jump
            default: handled = false; break; // Don't prevent default for other keys
        }
        if (handled) event.preventDefault(); // Prevent scrolling with arrow/space keys
    });

    document.addEventListener('keyup', (event) => {
        const key = event.key.toUpperCase();
        
        // If space flight animation is active, skip input handling
        if (spaceFlightAnimation && spaceFlightAnimation.isAnimating) {
            return;
        }
        
        switch (key) {
            case 'W': inputState.forward = false; break;
            case 'S': inputState.backward = false; break;
            case 'A': inputState.strafeLeft = false; break;
            case 'D': inputState.strafeRight = false; break;
            case 'ARROWLEFT': inputState.left = false; break;
            case 'ARROWRIGHT': inputState.right = false; break;
            case 'ARROWUP': inputState.up = false; break;
            case 'ARROWDOWN': inputState.down = false; break;
            // Note: We handle the jump action in the update loop based on the 'true' state
        }
    });

    // City selection logic
    citySelector.addEventListener('change', async (event) => {
        const selectedCity = event.target.value;
        // Check against the 'cities' constant defined in this file
        if (cities[selectedCity]) {
            console.log(`Changing city to: ${selectedCity}`);
            const cityCoords = cities[selectedCity];

            // Update UI to show loading state
            if (instructionsElement) {
                instructionsElement.innerHTML = `Loading ${cities[selectedCity].displayName}...`;
                instructionsElement.classList.add('loading');
            }

            try {
                // Pre-sample terrain at destination
                let terrainHeight;
            
                if (terrainManager) {
                    terrainHeight = await terrainManager.prepareDestination(
                        cityCoords.longitude,
                        cityCoords.latitude
                    );
                    console.log(`Terrain height at ${selectedCity}: ${terrainHeight}m`);
                } else {
                    console.warn("No terrain manager available, using default ground height");
                    terrainHeight = groundHeight; // Use constant from this file
                }
                
                // Store current position for animation
                const startPosition = {
                    longitude: playerPosition.longitude,
                    latitude: playerPosition.latitude,
                    height: playerPosition.height
                };
                
                // Prepare target position
                const targetPosition = {
                    longitude: Cesium.Math.toRadians(cityCoords.longitude),
                    latitude: Cesium.Math.toRadians(cityCoords.latitude),
                    height: DRAMATIC_FALL_HEIGHT // Use constant from this file
                };
                
                // If space flight animation is available, use it
                if (spaceFlightAnimation) {
                    console.log("Using space flight animation for city change");
                    document.querySelector("#display-text").classList.remove('hidden');
                    document.querySelector("#display-text").innerHTML = currentCity+" 🚀 "+cities[selectedCity].displayName;
                    currentCity = cities[selectedCity].displayName;
                    // Set camera system as animating
                    if (cameraSystemInstance) {
                        cameraSystemInstance.setAnimatingState(true);
                    }
                    
                    // Start the animation
                    spaceFlightAnimation.startAnimation(
                        startPosition,
                        targetPosition,
                        playerHeadingRef,
                        updateDirectionVectorsFunc,
                        forwardDirection,
                        rightDirection,
                        fallStateRef,
                        verticalVelocityRef,
                        () => {
                            // Animation complete callback
                            console.log("Space flight animation complete");
                            document.querySelector("#display-text").classList.add('hidden');

                            // Update player position at animation end
                            playerPosition.longitude = targetPosition.longitude;
                            playerPosition.latitude = targetPosition.latitude;
                            playerPosition.height = targetPosition.height;
                            
                            // Reset animation state in camera system
                            if (cameraSystemInstance) {
                                cameraSystemInstance.setAnimatingState(false);
                            }
                        }
                    );

                    // Return early as animation will handle the transition
                    return;
                }
            
                // Standard teleportation (fallback if animation unavailable)
                playerPosition.longitude = Cesium.Math.toRadians(cityCoords.longitude);
                playerPosition.latitude = Cesium.Math.toRadians(cityCoords.latitude);
            
                // Set player height for dramatic fall
                playerPosition.height = DRAMATIC_FALL_HEIGHT; // Use constant from this file
                console.log(`Setting initial player height to: ${playerPosition.height}m`);
            
                // Reset fall state
                fallStateRef.isInInitialFall = true;
                fallStateRef.initialFallComplete = false;
                fallStateRef.fallStartTime = performance.now();
            
                // Reset physics state
                verticalVelocityRef.value = -10.0;
                playerHeadingRef.value = Cesium.Math.toRadians(0.0);
            
                // Update direction vectors
                updateDirectionVectorsFunc(playerHeadingRef.value, forwardDirection, rightDirection);
            
                // Reset minimap
                if (miniMapInstance) {
                    miniMapInstance.update(playerPosition, playerHeadingRef.value);
                }
            
                // Update UI
                if (instructionsElement) {
                    instructionsElement.classList.remove('loading');
                    instructionsElement.innerHTML = `Teleporting to ${cities[selectedCity].displayName}... Use WASD to move and Arrow keys to look around while falling!`;
                }
            
                // Use camera system for teleportation - modified to look down more
                if (cameraSystemInstance) {
                    const teleportCameraPitch = Cesium.Math.toRadians(45); // Looking down more
                    await cameraSystemInstance.teleport(
                        playerPosition,
                        playerHeadingRef.value,
                        teleportCameraPitch
                    );
                    console.log("Teleportation complete, dramatic fall active with player control");
                    if (instructionsElement) {
                        instructionsElement.innerHTML = `Skydiving into ${cities[selectedCity].displayName}... Use WASD to move and Arrow keys to look!`;
                    }
                } else {
                    console.error("Camera System not available for teleport.");
                    const targetWorldPos = Cesium.Cartesian3.fromRadians(
                        playerPosition.longitude, playerPosition.latitude, playerPosition.height
                    );
                    await cesiumViewer.camera.flyTo({
                        destination: targetWorldPos,
                        orientation: {
                            heading: playerHeadingRef.value,
                            pitch: Cesium.Math.toRadians(45),
                            roll: 0.0
                        },
                        duration: 0.0
                    });
                }

            } catch (error) {
                console.error(`Error teleporting to ${selectedCity}:`, error);
                playerPosition.longitude = Cesium.Math.toRadians(cityCoords.longitude);
                playerPosition.latitude = Cesium.Math.toRadians(cityCoords.latitude);
                playerPosition.height = groundHeight + 1.0; // Use constant from this file
                verticalVelocityRef.value = 0;
                if (instructionsElement) {
                    instructionsElement.classList.remove('loading');
                    instructionsElement.innerHTML = `Error loading ${cities[selectedCity].displayName}. Using default elevation.`;
                    setTimeout(() => {
                        instructionsElement.innerHTML = `W/S: Move | A/D: Strafe | Arrows: Look | Space: Jump`;
                    }, 3000);
                }
                if (cameraSystemInstance) {
                    cameraSystemInstance.teleport(playerPosition, playerHeadingRef.value);
                }
            }
        }
    });
}

// Performance Settings
const tilesMaximumScreenSpaceError = 50; // This is defined above now, keep one definition
const enableFrustumCulling = true;
const enableLOD = true;

/**
 * Initializes the Three.js scene
 * @returns {Object} Three.js objects and animation system
 */
export async function initThree() {
    // Import THREE directly to have a reference to the library itself
    const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.min.js');
    const { FBXLoader } = await import('https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/loaders/FBXLoader.js');
    
    const three = {
        scene: null,
        camera: null,
        renderer: null,
        playerMesh: null,
        animationSystem: null,
        clock: new THREE.Clock(),
        // Add a reference to the THREE library itself
        THREE: THREE
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
    // const tilesMaximumScreenSpaceError = 50; // Defined above
    // const enableFrustumCulling = true; // Defined above

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
        maximumScreenSpaceError: tilesMaximumScreenSpaceError, // Use constant defined above
        requestRenderMode: false,
        baselayer: false,
        baseLayerPicker: false,
        imageryProvider: new Cesium.IonImageryProvider({ assetId: 3954 }),
        contextOptions: {
            webgl: {
                alpha: true
            }
        }
    });

    (async () => {
        try {
            const imageryLayer = viewer.imageryLayers.addImageryProvider(
                await Cesium.IonImageryProvider.fromAssetId(3954)
            );
            await viewer.zoomTo(imageryLayer);
        } catch (error) {
            console.log(error);
        }
    })();

    (async () => {
        try {
          const terrainProvider = await Cesium.createWorldTerrainAsync({
            requestWaterMask: true,
            requestVertexNormals: true
          });
          viewer.terrainProvider = terrainProvider;
          console.log("Cesium World Terrain successfully initialized");

          // Ensure terrain is enabled with correct settings
          viewer.scene.globe.enableLighting = false;
          viewer.scene.globe.depthTestAgainstTerrain = true;
          viewer.scene.logarithmicDepthBuffer = false; // Try disabling for better terrain rendering

        } catch (error) {
          console.error("Failed to initialize Cesium World Terrain:", error);
        }
    })();

    // After viewer creation, verify and adjust the imagery layers:
    console.log("Imagery layers count:", viewer.imageryLayers.length);
    if (viewer.imageryLayers && viewer.imageryLayers.length > 0) {
        const baseLayer = viewer.imageryLayers.get(0);

        // Ensure layer isn't accidentally hidden or modified
        baseLayer.show = true;
        baseLayer.alpha = 1.0;

        // Apply enhancements for visibility
        baseLayer.brightness = 2.0;  // Increase brightness
        baseLayer.contrast = 1.2;    // Increase contrast
    }

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

    // Set globe base color to be transparent when no imagery is available
    viewer.scene.globe.baseColor = new Cesium.Color(1, 1, 1, 0.0);

    // Enhance the imagery appearance
    if (viewer.imageryLayers && viewer.imageryLayers.length > 0) {
        const baseLayer = viewer.imageryLayers.get(0);
        baseLayer.brightness = 1.1;
        baseLayer.contrast = 1.1;
        baseLayer.gamma = 1.05;
    }

    // === DISABLE ALL CESIUM CONTROLS ===
    viewer.scene.screenSpaceCameraController.enableRotate = false;
    viewer.scene.screenSpaceCameraController.enableTranslate = false;
    viewer.scene.screenSpaceCameraController.enableZoom = false;
    viewer.scene.screenSpaceCameraController.enableTilt = false;
    viewer.scene.screenSpaceCameraController.enableLook = false;
    viewer.scene.screenSpaceCameraController.enableInputs = false;

    const cesiumContainer = document.getElementById('cesiumContainer');
    if (cesiumContainer) {
        const eventsToBlock = [
            'wheel', 'mousedown', 'mousemove', 'mouseup',
            'touchstart', 'touchmove', 'touchend'
        ];
        eventsToBlock.forEach(eventType => {
            cesiumContainer.addEventListener(eventType, (event) => {
                if (event.target.id === 'citySelector' ||
                    event.target.id === 'instructions' ||
                    event.target.id === 'fpsCounter') {
                    return;
                }
                event.stopPropagation();
                event.preventDefault();
            }, { passive: false });
        });
    }

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

    viewer.scene.globe.enableLighting = false;
    viewer.scene.fog.enabled = false;
    viewer.scene.backgroundColor = new Cesium.Color(0, 0, 0, 0);
    viewer.scene.globe.showGroundAtmosphere = false;
    viewer.scene.globe.baseColor = new Cesium.Color(0.5, 0.5, 0.5, 1.0);
    viewer.scene.globe.translucency.enabled = false;
    viewer.scene.globe.show = true;

    if (viewer.imageryLayers && viewer.imageryLayers.length > 0) {
        const baseLayer = viewer.imageryLayers.get(0);
        baseLayer.alpha = 1.0;
        baseLayer.brightness = 1.1;
        baseLayer.contrast = 1.1;
        baseLayer.gamma = 1.05;
    }

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
            maximumScreenSpaceError: tilesMaximumScreenSpaceError, // Use constant defined above
            cullWithChildrenBounds: true,
            skipLevelOfDetail: false,
            preferLeaves: true
        });

        viewer.scene.primitives.add(osmBuildingsTileset);
        osmBuildingsTileset.style = new Cesium.Cesium3DTileStyle({ color: "color('#e0e0e0')" });

        await osmBuildingsTileset.readyPromise;
        console.log("OSM Buildings Tileset Ready.");

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
    tileset.maximumScreenSpaceError = tilesMaximumScreenSpaceError; // Use constant defined above
    console.log("LOD configured for tileset.");
}