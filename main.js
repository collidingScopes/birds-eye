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
    cities,
    DRAMATIC_FALL_HEIGHT // Import the fall height constant
} from './helper-functions.js';
import { checkBuildingCollision } from './building-collision.js';
import { CameraSystem } from './camera-system.js';
import { AnimationSystem } from './animation-system.js';
import { TerrainManager } from './terrain-manager.js';

// --- Cesium Ion Access Token ---
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIxY2FhMzA2MS1jOWViLTRiYWUtODJmZi02YjAxMmM5MGI3MzkiLCJpZCI6MjkxMTc3LCJpYXQiOjE3NDM4ODA1Mjd9.Js54F7Sh9x04MT9-MjRAL5qm97R_pw7xSrAIS9I8wY4';

// --- State Variables ---
// DRAMATIC FALL: Set initial height much higher
let playerPosition = Cesium.Cartographic.fromDegrees(
    cities.nyc.longitude, 
    cities.nyc.latitude, 
    groundHeight + DRAMATIC_FALL_HEIGHT
);
let terrainManager;

// Coordinate System Convention:
// playerHeading & cameraHeading: Radians. Measured CLOCKWISE from NORTH.
// 0 radians = North, PI/2 = East, PI = South, 3*PI/2 = West
let playerHeading = Cesium.Math.toRadians(0.0); // Start facing North
// DRAMATIC FALL: Start with negative vertical velocity to accelerate the initial drop
let verticalVelocity = -10.0; 

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

// --- DRAMATIC FALL state reference ---
// Create an object reference so we can pass it to functions and update it
const fallStateRef = {
    isInInitialFall: true,           // Start in fall mode
    initialFallComplete: false,
    fallStartTime: performance.now() // Initialize with current time
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
let viewer, cesiumCamera, three, osmBuildingsTileset, FrustumCuller, miniMap, cameraSystem;

// --- Game Loop Variables ---
let lastTime = 0;
const renderInterval = 1000 / 60; // Target 60 FPS
let lastRenderTime = 0;
let needsRender = true;

// --- Initialization Sequence ---
async function initialize() {
    console.log("Starting initialization sequence...");
    
    three = await initThree();
    console.log("Three.js initialized");
    
    const result = initCesium();
    viewer = result.viewer;
    cesiumCamera = result.cesiumCamera;
    FrustumCuller = result.FrustumCuller;
    console.log("Cesium initialized");

    // Create terrain manager with default ground height
    terrainManager = new TerrainManager(viewer, groundHeight);
    console.log("Terrain manager initialized");
    
    // viewer.scene.backgroundColor = new Cesium.Color(0, 0, 0, 0);
    //viewer.scene.globe.baseColor = new Cesium.Color(0.45, 0.45, 0.45, 1.0);
    
    if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
    if (viewer.scene.sun) viewer.scene.sun.show = false;
    if (viewer.scene.moon) viewer.scene.moon.show = false;

    // Make sure Cesium sky elements are disabled
    viewer.scene.skyBox = undefined;
    viewer.scene.skyAtmosphere = undefined;
    viewer.scene.sun = undefined;
    viewer.scene.moon = undefined;
    viewer.scene.backgroundColor = new Cesium.Color(0, 0, 0, 0);
    
    // Make sure Three.js renderer has proper settings
    three.renderer.setClearColor(0x000000, 0);
    three.renderer.autoClear = false;
        
    cameraSystem = new CameraSystem(cesiumCamera, three.camera);
    console.log("Camera system initialized");
    
    miniMap = new MiniMap(1000);
    
    updateDirectionVectors(playerHeading, forwardDirection, rightDirection);
    
    const verticalVelocityRef = { value: verticalVelocity };
    const playerHeadingRef = { value: playerHeading };
    
    // Initialize fall start time
    fallStateRef.fallStartTime = performance.now();
    
    setupInputListeners(
        inputState, 
        playerPosition, 
        verticalVelocityRef,
        playerHeadingRef,
        updateDirectionVectors, 
        forwardDirection, 
        rightDirection, 
        cities, 
        viewer, 
        miniMap, 
        cameraSystem,
        terrainManager,
        instructionsElement,
        fallStateRef  // Pass the fall state reference
    );
    
    verticalVelocity = verticalVelocityRef.value;
    playerHeading = playerHeadingRef.value;
        
    try {
        osmBuildingsTileset = await loadOsmBuildings(viewer, instructionsElement);
        console.log("Initial setup complete. Starting update loop.");
        
        // Verify player height is set properly
        console.log(`Initial player height: ${playerPosition.height}m`);
        console.log(`Initial fall state: ${fallStateRef.isInInitialFall}`);
        
        // DRAMATIC FALL: Use a special camera setup for the fall
        // Set camera to look slightly downward at the start of the fall
        const initialCameraPitch = Cesium.Math.toRadians(-15); // Look down from above
        cameraSystem.teleport(playerPosition, playerHeading, 0, initialCameraPitch);
        cameraSystem.syncThreeCamera();
        
        // DRAMATIC FALL: Display special instructions for the dramatic fall
        instructionsElement.innerHTML = "Entering the city... Brace for impact!";
        
        lastTime = performance.now();
        requestAnimationFrame(update);
    } catch (error) {
        console.error("Failed to initialize application:", error);
        instructionsElement.innerHTML = "Failed to initialize. Check console for errors.";
        instructionsElement.style.color = 'red';
    }
}

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
    
    // DRAMATIC FALL: Always render during fall
    if (fallStateRef.isInInitialFall) {
        needsRender = true;
    }

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

    // --- 1. Update Camera Controls (Arrow Keys) and synchronize player orientation ---
    // DRAMATIC FALL: Disable camera controls during fall
    if (!fallStateRef.isInInitialFall) {
        const cameraControlResult = cameraSystem.updateControls(inputState, deltaTime, cameraTurnSpeed);
        if (cameraControlResult.changed) {
            needsRender = true;
            
            // Synchronize player heading to always face away from camera
            playerHeading = (cameraSystem.getHeading() + Math.PI) % (2.0 * Math.PI);
            updateDirectionVectors(playerHeading, forwardDirection, rightDirection);
        }
    } else {
        // DRAMATIC FALL: During fall, gradually adjust camera pitch to look more at the ground
        const fallProgress = Math.min((currentTime - fallStateRef.fallStartTime) / 10000, 1.0); // 10 seconds to reach max look-down
        cameraSystem.cameraPitch = Cesium.Math.toRadians(50 - fallProgress * 45); // Gradually pitch 50 to 5 degrees
        needsRender = true;
    }

    // --- 2. Handle Jumping and Gravity ---
    const buildingCollision = checkBuildingCollision(viewer, playerPosition, osmBuildingsTileset, inputState, buildingCache, 20.0);

    // Get the surface height by checking both terrain and buildings
    const surfaceHeight = terrainManager.getSurfaceHeight(playerPosition, buildingCollision);

    // Check if player is on a surface (ground or building)
    const onSurface = terrainManager.isOnSurface(playerPosition, verticalVelocity, buildingCollision);

    // DRAMATIC FALL: Handle the landing from the fall
    if (fallStateRef.isInInitialFall && (
        onSurface || 
        playerPosition.height <= surfaceHeight || 
        Math.abs(playerPosition.height - surfaceHeight) < 0.1 ||
        playerPosition.height <= 0
    )) {
        console.log("Fall complete! Landing detected.");
        fallStateRef.isInInitialFall = false;
        fallStateRef.initialFallComplete = true;
        // Ensure player is exactly at surface height
        playerPosition.height = surfaceHeight;
    }

    // DRAMATIC FALL: During fall, increase vertical velocity for more dramatic effect
    if (fallStateRef.isInInitialFall) {
        verticalVelocity += gravity * deltaTime * 1.5; // 1.5x normal gravity for more dramatic fall
    } else {
        // Normal jump handling
        if (inputState.jump) {
            verticalVelocity = jumpVelocity;
            playerPosition.height += 0.1;
            needsRender = true;
            inputState.jump = false; // Consume jump input
        }

        verticalVelocity += gravity * deltaTime;
    }
    
    playerPosition.height += verticalVelocity * deltaTime;

    if (playerPosition.height < surfaceHeight) {
        playerPosition.height = surfaceHeight;
        
        // DRAMATIC FALL: Add a small bounce effect when landing from the fall
        if (fallStateRef.isInInitialFall || (fallStateRef.initialFallComplete && Math.abs(verticalVelocity) > 20)) {
            verticalVelocity = Math.abs(verticalVelocity) * -0.2; // 20% bounce
            fallStateRef.initialFallComplete = false; // Reset once we've applied the bounce
        } else {
            verticalVelocity = 0;
        }
    }

    needsRender = true;

    // --- 3. Update Player Horizontal Position (W/S/A/D for Movement) ---
    // DRAMATIC FALL: Disable movement controls during fall
    const moveAmount = playerMoveSpeed * deltaTime;
    let deltaEast = 0;
    let deltaNorth = 0;
    let movedHorizontally = false;

    if (!fallStateRef.isInInitialFall) {
        // Use player heading for movement direction (aligned with camera)
        const movementForward = { x: forwardDirection.x, y: forwardDirection.y };
        const movementRight = { x: rightDirection.x, y: rightDirection.y };

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
        playerPosition,
        playerHeading,
        forwardDirection
    );

    // --- 6. Update Three.js Player Mesh Orientation and Position ---
    if (three.playerMesh) {
        // Get camera pitch from the camera system
        const cameraPitch = cameraSystem.getPitch();

        // Y-axis (yaw): Align with player heading (opposite camera)
        three.playerMesh.rotation.y = Math.PI - playerHeading;

        // X-axis (pitch): Adjust based on camera pitch to keep feet down
        three.playerMesh.rotation.x = Math.PI/2 + cameraPitch;

        // Normalize playerHeading to [-π, π]
        function normalizeAngle(angle) {
            return Math.atan2(Math.sin(angle), Math.cos(angle));
        }

        // Apply the normalized heading to the rotation
        if(cameraPitch > 0){
            three.playerMesh.rotation.z = -normalizeAngle(playerHeading); // Negative to align with typical coordinate systems
        } else {
            if(playerHeading>=Math.PI){
                three.playerMesh.rotation.z = -Math.PI*1.5;
            } else if(playerHeading>=0){
                three.playerMesh.rotation.z = -Math.PI/2;
            } else if (playerHeading>=-Math.PI){
                three.playerMesh.rotation.z = Math.PI/2;
            } else {
                three.playerMesh.rotation.z = Math.PI;
            }
        }
        three.playerMesh.position.set(0, 0, 0); // Keep at origin; Cesium camera handles world placement
        
        // Update animations based on player state
        if (three.animationSystem) {
            three.animationSystem.updatePlayerAnimation(inputState, onSurface, verticalVelocity);
            three.animationSystem.update(deltaTime);
        }
    }

    // --- 8. Update Mini-map ---
    miniMap.update(playerPosition, playerHeading);

    // --- Render Logic ---

    //Render Cesium scene
    viewer.scene.globe.show = true;
    viewer.scene.backgroundColor = new Cesium.Color(0.678, 0.847, 0.902, 1);
    viewer.render();

    // Render Three.js main scene (player, etc.) on top
    if (three.renderer && three.scene && three.camera) {
        three.renderer.render(three.scene, three.camera);
    }

    // --- 10. Update Instructions Display ---
    const heightInfo = ` (Altitude: ${playerPosition.height.toFixed(1)}m)`;
    const buildingInfo = buildingCollision.hit ? ` | Building: ${buildingCollision.height.toFixed(1)}m` : "";
    
    // Custom instructions during dramatic fall
    if (fallStateRef.isInInitialFall) {
        instructionsElement.innerHTML = `Entering city... Brace for impact!${heightInfo}`;
    } else {
        instructionsElement.innerHTML = `W/S: Move | A/D: Strafe | Arrows: Look | Space: Jump<br>Facing: ${getDirection(playerHeading)}${heightInfo}${buildingInfo}`;
    }
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

initialize();