// Import Three.js as an ES Module
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.min.js';
import { initThree, initCesium, loadOsmBuildings } from './initial-setup.js';
import { 
    updateDirectionVectors, 
    setupInputListeners, 
    getDirection, 
    playerMoveSpeed, 
    cameraTurnSpeed,
    jumpVelocity,
    gravity,
    groundHeight,
    cities
} from './helper-functions.js';
import { checkBuildingCollision } from './building-collision.js';
import { CameraSystem } from './camera-system.js';
import { SkyGradient } from './sky-gradient.js';

// --- Cesium Ion Access Token ---
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIxY2FhMzA2MS1jOWViLTRiYWUtODJmZi02YjAxMmM5MGI3MzkiLCJpZCI6MjkxMTc3LCJpYXQiOjE3NDM4ODA1Mjd9.Js54F7Sh9x04MT9-MjRAL5qm97R_pw7xSrAIS9I8wY4';

// --- State Variables ---
let playerPosition = Cesium.Cartographic.fromDegrees(cities.nyc.longitude, cities.nyc.latitude, groundHeight);

// Coordinate System Convention:
// playerHeading & cameraHeading: Radians. Measured CLOCKWISE from NORTH.
// 0 radians = North, PI/2 = East, PI = South, 3*PI/2 = West
let playerHeading = Cesium.Math.toRadians(0.0); // Start facing North
let verticalVelocity = 0.0; // For jumping/gravity

// Direction vectors in Cesium's East-North-Up (ENU) frame (X=East, Y=North)
let forwardDirection = { x: 0, y: 1 }; // Initial: North
let rightDirection = { x: 1, y: 0 };   // Initial: East

// Input state tracking
const inputState = {
    forward: false,     // W
    backward: false,    // S
    left: false,        // Arrow Left (Turn CCW)
    right: false,       // Arrow Right (Turn CW)
    up: false,          // Arrow Up (Pitch Up)
    down: false,        // Arrow Down (Pitch Down)
    jump: false,        // Space
    strafeLeft: false,  // A
    strafeRight: false  // D
};

// --- Building Detection Cache ---
const buildingCache = {
    valid: false,
    hit: false,
    height: 0
};

// DOM Elements
const instructionsElement = document.getElementById('instructions');
const citySelector = document.getElementById('citySelector');
const fpsCounter = document.getElementById('fpsCounter');

// FPS Tracking
let frameCount = 0;
let lastFpsUpdate = 0;
let currentFps = 0;

// Three.js and Cesium objects
let viewer, cesiumCamera, three, osmBuildingsTileset, FrustumCuller, miniMap, cameraSystem, skyGradient;

// --- Game Loop Variables ---
let lastTime = 0;
const renderInterval = 1000 / 60; // Target 60 FPS
let lastRenderTime = 0;
let needsRender = true;

// Time of day state (for sky gradient coloring)
let timeOfDay = 'day'; // 'day', 'sunset', 'night', 'sunrise'

/**
 * The main update function, called each frame.
 */
function update(currentTime) {
    requestAnimationFrame(update);

    // Calculate delta time, capping it to prevent large jumps on lag
    const deltaTime = Math.min((currentTime - (lastTime || currentTime)) / 1000.0, 0.1);
    lastTime = currentTime;

    // --- FPS Counter ---
    frameCount++;
    if (currentTime - lastFpsUpdate >= 1000) {
        currentFps = Math.round(frameCount * 1000 / (currentTime - lastFpsUpdate));
        fpsCounter.textContent = `FPS: ${currentFps}`;
        frameCount = 0;
        lastFpsUpdate = currentTime;
    }

    // --- Check if update logic needs to run ---
    const isMoving = inputState.forward || inputState.backward || inputState.strafeLeft || inputState.strafeRight;
    const isTurning = inputState.left || inputState.right;
    const isPitching = inputState.up || inputState.down;
    const isJumping = inputState.jump;
    const physicsActive = verticalVelocity !== 0 || (playerPosition && playerPosition.height > groundHeight + 0.1);

    if (!isMoving && !isTurning && !isPitching && !isJumping && !physicsActive && !needsRender && (currentTime - lastRenderTime < renderInterval)) {
        if (viewer.scene.primitives.length > 0) {
            viewer.render();
            if (three.renderer && three.scene && three.camera) {
                three.renderer.render(three.scene, three.camera);
            }
        }
        return;
    }
    lastRenderTime = currentTime;
    needsRender = false;

    // --- 1. Update Camera Controls (Arrow Keys) INDEPENDENT of player orientation ---
    // Let the camera system handle camera controls instead of direct manipulation
    if (cameraSystem.updateControls(inputState, deltaTime, cameraTurnSpeed)) {
        needsRender = true;
        // Note: We're NOT updating player heading here anymore
    }

    // --- 2. Handle Jumping and Gravity ---
    const buildingCollision = checkBuildingCollision(viewer, playerPosition, osmBuildingsTileset, inputState, buildingCache, 20.0);

    let surfaceHeight = groundHeight;
    if (buildingCollision.hit && buildingCollision.height > groundHeight) {
        surfaceHeight = buildingCollision.height;
    }
    
    const onSurface = Math.abs(playerPosition.height - surfaceHeight) < 0.5 && verticalVelocity <= 0;
    
    if (inputState.jump) {
        verticalVelocity = jumpVelocity;
        playerPosition.height += 0.1;
        needsRender = true;
        inputState.jump = false; // Consume jump input
    }

    verticalVelocity += gravity * deltaTime;
    playerPosition.height += verticalVelocity * deltaTime;

    if (playerPosition.height < surfaceHeight) {
        playerPosition.height = surfaceHeight;
        verticalVelocity = 0;
    }

    needsRender = true;

    // --- 3. Update Player Horizontal Position (W/S/A/D for Movement) ---
    // Use the camera heading (not player heading) to determine movement direction
    // This makes movement relative to the camera view
    const moveAmount = playerMoveSpeed * deltaTime;
    let deltaEast = 0;
    let deltaNorth = 0;
    let movedHorizontally = false;

    // Get the camera heading for movement direction
    const cameraHeading = cameraSystem.getHeading();
    
    // Recalculate movement direction vectors based on camera heading
    const movementForward = { x: 0, y: 0 };
    const movementRight = { x: 0, y: 0 };
    updateDirectionVectors(cameraHeading, movementForward, movementRight);

    if (inputState.forward) {
        deltaEast += movementForward.x;
        deltaNorth += movementForward.y;
        movedHorizontally = true;
    }
    if (inputState.backward) {
        deltaEast -= movementForward.x;
        deltaNorth -= movementForward.y;
        movedHorizontally = true;
    }
    if (inputState.strafeLeft) {
        deltaEast -= movementRight.x;
        deltaNorth -= movementRight.y;
        movedHorizontally = true;
    }
    if (inputState.strafeRight) {
        deltaEast += movementRight.x;
        deltaNorth += movementRight.y;
        movedHorizontally = true;
    }

    if (movedHorizontally) {
        needsRender = true;
        const magnitude = Math.sqrt(deltaEast * deltaEast + deltaNorth * deltaNorth);
        let normalizedEast = 0;
        let normalizedNorth = 0;

        if (magnitude > 1e-6) {
            normalizedEast = deltaEast / magnitude;
            normalizedNorth = deltaNorth / magnitude;
        }

        const finalMoveEast = normalizedEast * moveAmount;
        const finalMoveNorth = normalizedNorth * moveAmount;

        const playerWorldPos = Cesium.Cartesian3.fromRadians(playerPosition.longitude, playerPosition.latitude, playerPosition.height);
        const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(playerWorldPos);
        const moveENU = new Cesium.Cartesian3(finalMoveEast, finalMoveNorth, 0);
        const moveECEF = Cesium.Matrix4.multiplyByPointAsVector(enuTransform, moveENU, new Cesium.Cartesian3());
        const newWorldPos = Cesium.Cartesian3.add(playerWorldPos, moveECEF, new Cesium.Cartesian3());
        const newCartographic = Cesium.Cartographic.fromCartesian(newWorldPos);

        let allowMove = true;
        if (allowMove) {
            playerPosition.longitude = newCartographic.longitude;
            playerPosition.latitude = newCartographic.latitude;

            if (onSurface && buildingCollision.hit) {
                const newPositionCheck = {
                    longitude: playerPosition.longitude,
                    latitude: playerPosition.latitude,
                    height: playerPosition.height
                };
                const tempCache = { valid: false, hit: false, height: 0 };
                const forcedInputState = { forward: true };
                const newBuildingCollision = checkBuildingCollision(
                    viewer,
                    newPositionCheck,
                    osmBuildingsTileset,
                    forcedInputState,
                    tempCache,
                    0
                );
                
                if (!newBuildingCollision.hit || Math.abs(newBuildingCollision.height - surfaceHeight) > 1.0) {
                    verticalVelocity = -0.1;
                }
            }
            
            // Update player facing direction to match movement direction when moving
            if (movedHorizontally) {
                // Only update player visual rotation for rendering, 
                // but keep the forwardDirection and rightDirection for calculations
                if (Math.abs(deltaEast) > 1e-6 || Math.abs(deltaNorth) > 1e-6) {
                    // Calculate facing angle based on movement direction
                    playerHeading = Math.atan2(deltaEast, deltaNorth);
                    if (playerHeading < 0) {
                        playerHeading += 2 * Math.PI;
                    }
                }
            }
        }
    }

    // --- 4. Update Tileset Visibility & Frustum Culling ---
    if (movedHorizontally || needsRender) {
        if (FrustumCuller && FrustumCuller.initialized) {
            FrustumCuller.update();
        }
    }

    // --- 5. Update Camera using CameraSystem ---
    cameraSystem.update(
        playerPosition,  // Player's cartographic position
        playerHeading,   // Player's heading (for reference only)
        forwardDirection // Player's forward direction
    );

    // --- 6. Update Three.js Player Mesh Orientation and Position ---
    if (three.playerMesh) {
        three.playerMesh.rotation.y = -playerHeading;
        three.playerMesh.position.set(0, 0, 0); // Keep at origin; Cesium camera will handle world placement
    }

   // --- 7. Update Sky Gradient ---
    if (skyGradient) {
        skyGradient.update();
    }

    // --- 8. Update Mini-map ---
    miniMap.update(playerPosition, playerHeading);

    // --- 9. Render Both Scenes ---
    // Important: Clear both renderers first
    if (three.renderer) {
        three.renderer.clear();
    }
    if (viewer) {
        viewer.scene.backgroundColor = new Cesium.Color(0, 0, 0, 0); // Ensure transparent background
    }

    // First, render the Three.js scene (sky only)
    if (three.renderer && three.scene && three.camera) {
        // Make sure the skyMesh is rendering with proper depth settings
        if (skyGradient && skyGradient.skyMesh) {
            skyGradient.skyMesh.renderOrder = -1000;  // Ensure it renders first
            skyGradient.skyMesh.material.depthWrite = false; // Don't write to depth buffer
        }
        
        // Render the Three.js scene with the sky
        three.renderer.render(three.scene, three.camera);
    }

    // Then render the Cesium scene on top with transparency
    viewer.render();

    // --- 10. Update Instructions Display ---
    const heightInfo = ` (Altitude: ${playerPosition.height.toFixed(1)}m)`;
    const buildingInfo = buildingCollision.hit ? ` | Building: ${buildingCollision.height.toFixed(1)}m` : "";
    instructionsElement.innerHTML = `W/S: Move | A/D: Strafe | Arrows: Look | Space: Jump<br>Facing: ${getDirection(playerHeading)}${heightInfo}${buildingInfo}`;
}

/**
 * Changes the sky colors based on time of day
 * @param {string} timeOfDayValue - 'day', 'sunset', 'night', or 'sunrise'
 */
function changeTimeOfDay(timeOfDayValue) {
    if (!skyGradient) {
        console.warn("Sky gradient not initialized when changing time of day");
        return;
    }
    
    console.log(`Changing time of day to: ${timeOfDayValue}`);
    timeOfDay = timeOfDayValue;
    
    switch(timeOfDay) {
        case 'day':
            skyGradient.setColors(0x0077ff, 0xb0d8ff);
            break;
        case 'sunset':
            skyGradient.setColors(0x2b3043, 0xff7e22);
            break;
        case 'night':
            skyGradient.setColors(0x000011, 0x002244);
            break;
        case 'sunrise':
            skyGradient.setColors(0x0e1a40, 0xff9966);
            break;
        default:
            skyGradient.setColors(0x0077ff, 0xb0d8ff);
    }
    
    // Force an immediate render to show the change
    if (three.renderer && three.scene && three.camera) {
        three.renderer.render(three.scene, three.camera);
    }
    
    needsRender = true;
}

// --- Initialization Sequence ---
async function initialize() {
    console.log("Starting initialization sequence...");
    
    // Initialize Three.js scene with GLB model
    three = await initThree();
    console.log("Three.js initialized");
    
    // Initialize Cesium
    const result = initCesium();
    viewer = result.viewer;
    cesiumCamera = result.cesiumCamera;
    FrustumCuller = result.FrustumCuller;
    console.log("Cesium initialized");
    
    // Important: Modify Cesium viewer settings to allow for a transparent background
    viewer.scene.backgroundColor = new Cesium.Color(0, 0, 0, 0);
    viewer.scene.globe.baseColor = new Cesium.Color(0.5, 0.5, 0.5, 1.0);
    
    // Remove any sky-related elements from Cesium
    if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
    if (viewer.scene.sun) viewer.scene.sun.show = false;
    if (viewer.scene.moon) viewer.scene.moon.show = false;
    
    // Setup Three.js renderer for proper transparency
    three.renderer.setClearColor(0x000000, 0); // Set clear color with alpha = 0
    
    // Initialize our custom sky gradient
    // IMPORTANT: Create the sky gradient before any other elements
    console.log("Initializing SkyGradient...");
    skyGradient = new SkyGradient(three.scene, three.camera);

    // Set initial sky to daytime
    changeTimeOfDay('day');
    console.log("Sky gradient initialized");

    // And replace it with this updated code:
        
    // Initialize our custom sky gradient
    console.log("Initializing SkyGradient...");
    // Make sure Three.js renderer is properly configured for transparency
    three.renderer.setClearColor(0x000000, 0); // Set clear color with alpha = 0
    three.renderer.autoClear = false; // We'll control clearing manually

    // Create the sky gradient AFTER renderer is properly configured
    skyGradient = new SkyGradient(three.scene, three.camera);

    // Force sky gradient to update its position
    skyGradient.update();

    // Force a render of the Three.js scene to ensure sky is visible
    three.renderer.render(three.scene, three.camera);

    // Set initial sky to daytime
    changeTimeOfDay('day');
    console.log("Sky gradient initialized");

    // Force another render after setting time of day
    three.renderer.render(three.scene, three.camera);
    
    // Initialize camera system (increased default height to 4.0 for better view)
    cameraSystem = new CameraSystem(cesiumCamera, three.camera, 10.0, 0.1);
    console.log("Camera system initialized");
    
    // Ensure renderer order is correct
    // Cesium renders first, then Three.js on top
    viewer.scene.backgroundColor = new Cesium.Color(0, 0, 0, 0);
    viewer.scene.globe.depthTestAgainstTerrain = true;
    
    // Force a single render to ensure sky is visible
    if (three.renderer && three.scene && three.camera) {
        three.renderer.render(three.scene, three.camera);
    }
    viewer.render();
    
    // Initialize minimap
    miniMap = new MiniMap(1000);
    
    // Calculate initial direction vectors
    updateDirectionVectors(playerHeading, forwardDirection, rightDirection);
    
    // Set up input listeners with references to ensure variables can be modified from listeners
    const verticalVelocityRef = { value: verticalVelocity };
    const playerHeadingRef = { value: playerHeading };
    
    setupInputListeners(
        inputState, 
        playerPosition, 
        verticalVelocityRef,  // Pass as reference object
        playerHeadingRef,     // Pass as reference object
        updateDirectionVectors, 
        forwardDirection, 
        rightDirection, 
        cities, 
        viewer, 
        miniMap, 
        cameraSystem
    );
    
    // Add time of day selector to the UI
    addTimeOfDaySelector();
    
    // Retrieve values that might have been updated in setupInputListeners
    verticalVelocity = verticalVelocityRef.value;
    playerHeading = playerHeadingRef.value;
    
    try {
        // Load OSM buildings tileset
        osmBuildingsTileset = await loadOsmBuildings(viewer, instructionsElement);
        
        console.log("Initial setup complete. Starting update loop.");
        
        // Set initial camera view using the camera system
        cameraSystem.teleport(playerPosition, cameraSystem.getHeading(), 0);
        
        // Force a render of the sky gradient
        skyGradient.update();
        
        // Start the render loop
        lastTime = performance.now();
        requestAnimationFrame(update);
    } catch (error) {
        console.error("Failed to initialize application:", error);
        instructionsElement.innerHTML = "Failed to initialize. Check console for errors.";
        instructionsElement.style.color = 'red';
    }
}

/**
 * Adds a time of day selector dropdown to the UI
 */
function addTimeOfDaySelector() {
    // Create container
    const container = document.createElement('div');
    container.id = 'timeOfDayContainer';
    
    // Style the container
    container.style.position = 'absolute';
    container.style.top = '70px'; // Position below city selector
    container.style.right = '10px';
    container.style.zIndex = '1000';
    
    // Create dropdown
    const select = document.createElement('select');
    select.id = 'timeOfDaySelector';
    
    // Style the select
    select.style.padding = '5px';
    select.style.borderRadius = '4px';
    select.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
    select.style.border = '1px solid #ccc';
    
    // Add options
    const options = [
        { value: 'day', label: 'Daytime' },
        { value: 'sunset', label: 'Sunset' },
        { value: 'night', label: 'Night' },
        { value: 'sunrise', label: 'Sunrise' }
    ];
    
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.value === timeOfDay) {
            option.selected = true;
        }
        select.appendChild(option);
    });
    
    // Add event listener
    select.addEventListener('change', (event) => {
        changeTimeOfDay(event.target.value);
    });
    
    // Append to DOM
    container.appendChild(select);
    document.body.appendChild(container);
}

// --- Window Resize Handling ---
window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (three.renderer && three.camera) {
        three.renderer.setSize(width, height);
        three.camera.aspect = width / height;
        three.camera.updateProjectionMatrix();
    }

    if (cesiumCamera && cesiumCamera.frustum && height > 0) {
        if (typeof cesiumCamera.frustum.aspectRatio !== 'undefined') {
            cesiumCamera.frustum.aspectRatio = width / height;
        }
    }

    needsRender = true;
});

// Start initialization
initialize();