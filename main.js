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
import { AnimationSystem } from './animation-system.js';

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
let viewer, cesiumCamera, three, osmBuildingsTileset, FrustumCuller, miniMap, cameraSystem;

// --- Game Loop Variables ---
let lastTime = 0;
const renderInterval = 1000 / 60; // Target 60 FPS
let lastRenderTime = 0;
let needsRender = true;

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

    // --- 1. Update Camera Controls (Arrow Keys) and synchronize player orientation ---
    const cameraControlResult = cameraSystem.updateControls(inputState, deltaTime, cameraTurnSpeed);
    if (cameraControlResult.changed) {
        needsRender = true;
        
        // Synchronize player heading to always face away from camera
        playerHeading = (cameraSystem.getHeading() + Math.PI) % (2.0 * Math.PI);
        updateDirectionVectors(playerHeading, forwardDirection, rightDirection);
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
    const moveAmount = playerMoveSpeed * deltaTime;
    let deltaEast = 0;
    let deltaNorth = 0;
    let movedHorizontally = false;

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
        // three.playerMesh.rotation.set(0, -playerHeading, 0); // Keep upright, rotate around Y-axis only
        three.playerMesh.rotation.x = Math.PI/2;
        three.playerMesh.rotation.y = Math.PI - playerHeading;
        three.playerMesh.rotation.z = -playerHeading*0.92;
        
        //three.playerMesh.position.set(0, 0, 0); // Keep at origin; Cesium camera handles world placement
        
        // Update animations based on player state
        if (three.animationSystem) {
            three.animationSystem.updatePlayerAnimation(inputState, onSurface, verticalVelocity);
            three.animationSystem.update(deltaTime);
        }
    }

    // --- 8. Update Mini-map ---
    miniMap.update(playerPosition, playerHeading);

    // IMPORTANT: First render Cesium (the base map)
    viewer.scene.globe.show = true;
    viewer.scene.backgroundColor = new Cesium.Color(0, 0, 0, 0);
    viewer.scene.globe.baseColor = new Cesium.Color(0.5, 0.5, 0.5, 1.0); // Visible base color
    viewer.render();

    // Then render Three.js objects on top
    if (three.renderer && three.scene && three.camera) {
        three.renderer.render(three.scene, three.camera);
    }

    // --- 10. Update Instructions Display ---
    const heightInfo = ` (Altitude: ${playerPosition.height.toFixed(1)}m)`;
    const buildingInfo = buildingCollision.hit ? ` | Building: ${buildingCollision.height.toFixed(1)}m` : "";
    
    instructionsElement.innerHTML = `W/S: Move | A/D: Strafe | Arrows: Look | Space: Jump<br>Facing: ${getDirection(playerHeading)}${heightInfo}${buildingInfo}`;
}

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
    
    // viewer.scene.backgroundColor = new Cesium.Color(0, 0, 0, 0);
    //viewer.scene.globe.baseColor = new Cesium.Color(0.45, 0.45, 0.45, 1.0);
    
    if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
    if (viewer.scene.sun) viewer.scene.sun.show = false;
    if (viewer.scene.moon) viewer.scene.moon.show = false;
    
    three.renderer.setClearColor(0x000000, 0); // Transparent background
    three.renderer.autoClear = false; // Don't clear what Cesium has rendered
        
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
        cameraSystem
    );
    
    verticalVelocity = verticalVelocityRef.value;
    playerHeading = playerHeadingRef.value;
        
    try {
        osmBuildingsTileset = await loadOsmBuildings(viewer, instructionsElement);
        console.log("Initial setup complete. Starting update loop.");
        
        cameraSystem.teleport(playerPosition, playerHeading, 0);
        
        lastTime = performance.now();
        requestAnimationFrame(update);
    } catch (error) {
        console.error("Failed to initialize application:", error);
        instructionsElement.innerHTML = "Failed to initialize. Check console for errors.";
        instructionsElement.style.color = 'red';
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