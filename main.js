// Import Three.js as an ES Module
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.min.js';
import { initThree, initCesium, loadOsmBuildings } from './initial-setup.js';
import { 
    updateDirectionVectors, 
    setupInputListeners, 
    getDirection, 
    playerMoveSpeed, 
    cameraTurnSpeed,
    cameraDistance,
    jumpVelocity,
    gravity,
    groundHeight,
    cities
} from './helper-functions.js';

// --- Cesium Ion Access Token ---
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIxY2FhMzA2MS1jOWViLTRiYWUtODJmZi02YjAxMmM5MGI3MzkiLCJpZCI6MjkxMTc3LCJpYXQiOjE3NDM4ODA1Mjd9.Js54F7Sh9x04MT9-MjRAL5qm97R_pw7xSrAIS9I8wY4';

// --- State Variables ---
let playerPosition = Cesium.Cartographic.fromDegrees(cities.nyc.longitude, cities.nyc.latitude, groundHeight);

// *** COORDINATE SYSTEM CONVENTION ***
// playerHeading & cameraHeading: Radians. Measured CLOCKWISE from NORTH.
// 0 radians = North
// PI/2 radians (90 deg) = East
// PI radians (180 deg) = South
// 3*PI/2 radians (270 deg) = West
let playerHeading = Cesium.Math.toRadians(0.0); // Start facing North
let cameraHeading = Cesium.Math.toRadians(0.0); // Keep aligned initially
let cameraPitch = Cesium.Math.toRadians(-15.0); // Angle looking down
let verticalVelocity = 0.0; // For jumping/gravity

// Direction vectors in Cesium's East-North-Up (ENU) frame (X=East, Y=North)
// These are updated by updateDirectionVectors() based on playerHeading
let forwardDirection = { x: 0, y: 1 }; // Initial: North (0 East, 1 North)
let rightDirection = { x: 1, y: 0 };   // Initial: East (1 East, 0 North)

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

// DOM Elements
const instructionsElement = document.getElementById('instructions');
const citySelector = document.getElementById('citySelector');
const fpsCounter = document.getElementById('fpsCounter');

// FPS Tracking
let frameCount = 0;
let lastFpsUpdate = 0;
let currentFps = 0;

// Three.js and Cesium objects
let viewer, cesiumCamera, three, osmBuildingsTileset, FrustumCuller, miniMap;

// --- Game Loop Variables ---
let lastTime = 0; // Timestamp of the last frame
const renderInterval = 1000 / 60; // Target 60 FPS update interval (approx 16.67ms)
let lastRenderTime = 0; // Timestamp of the last render execution
let needsRender = true; // Flag to force render when state changes significantly

/**
 * The main update function, called each frame.
 */
function update(currentTime) {
    requestAnimationFrame(update); // Schedule the next frame

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
    const isJumping = inputState.jump; // Check raw input state
    const physicsActive = verticalVelocity !== 0 || (playerPosition && playerPosition.height > groundHeight + 0.1); // Check if airborne or falling

    // If no input, not airborne, and not forced, potentially skip heavy updates
    if (!isMoving && !isTurning && !isPitching && !isJumping && !physicsActive && !needsRender && (currentTime - lastRenderTime < renderInterval)) {
        // Only render if needed due to Cesium's internal state changes (e.g., tiles loading)
        if (viewer.scene.primitives.length > 0) { // Basic check if there's something to see
             viewer.render();
             if (three.renderer && three.scene && three.camera) {
                 three.renderer.render(three.scene, three.camera); // Still need to render Three.js overlay
             }
        }
        return;
    }
    lastRenderTime = currentTime; // Record time of this full update/render cycle
    needsRender = false; // Reset render flag unless set again below

    // --- 1. Update Player Orientation (Arrow Keys for Turning) ---
    let headingChanged = false;
    // Arrow Left: Turn Left (Counter-Clockwise) -> DECREASE heading
    if (inputState.left) {
        const delta = cameraTurnSpeed * deltaTime;
        playerHeading -= delta;
        headingChanged = true;
    }
    // Arrow Right: Turn Right (Clockwise) -> INCREASE heading
    if (inputState.right) {
        const delta = cameraTurnSpeed * deltaTime;
        playerHeading += delta;
        headingChanged = true;
    }

    if (headingChanged) {
        // Normalize heading to be within [0, 2*PI)
        const twoPi = 2.0 * Math.PI;
        playerHeading = ((playerHeading % twoPi) + twoPi) % twoPi;
        cameraHeading = playerHeading; // Keep camera heading aligned with player
        updateDirectionVectors(playerHeading, forwardDirection, rightDirection); // Recalculate movement vectors based on new heading
        needsRender = true;
    }

    // --- 2. Update Camera Pitch (Arrow Keys) ---
    if (inputState.up) {
        cameraPitch += cameraTurnSpeed * deltaTime;
        needsRender = true;
    }
    if (inputState.down) {
        cameraPitch -= cameraTurnSpeed * deltaTime;
        needsRender = true;
    }
    // Clamp pitch to avoid looking too far up or down
    cameraPitch = Cesium.Math.clamp(cameraPitch, Cesium.Math.toRadians(-85.0), Cesium.Math.toRadians(20.0));

    // --- 4. Handle Jumping and Gravity ---
    //allow infinite jumping
    if (inputState.jump) {
        verticalVelocity = jumpVelocity;
        playerPosition.height += 0.1; // Give a small boost off the ground
        needsRender = true;
        inputState.jump = false; // Consume the jump input (single press = single jump)
    }

    // Apply gravity
    verticalVelocity += gravity * deltaTime;

    // Update player height based on vertical velocity
    playerPosition.height += verticalVelocity * deltaTime;

    // Ground collision check - prevent falling below groundHeight
    if (playerPosition.height < groundHeight) {
        playerPosition.height = groundHeight;
        verticalVelocity = 0; // Reset vertical velocity when on ground
    }

    needsRender = true; // Height changed

    // --- 5. Update Player Horizontal Position (W/S/A/D for Movement) ---
    const moveAmount = playerMoveSpeed * deltaTime;
    let deltaEast = 0; // Accumulate East(+) / West(-) movement component
    let deltaNorth = 0; // Accumulate North(+) / South(-) movement component
    let movedHorizontally = false;

    // W: Move Forward (along forwardDirection vector)
    if (inputState.forward) {
        deltaEast += forwardDirection.x;
        deltaNorth += forwardDirection.y;
        movedHorizontally = true;
    }
    // S: Move Backward (opposite to forwardDirection vector)
    if (inputState.backward) {
        deltaEast -= forwardDirection.x;
        deltaNorth -= forwardDirection.y;
        movedHorizontally = true;
    }
    // A: Strafe Left (vector opposite to rightDirection)
    if (inputState.strafeLeft) {
        deltaEast -= rightDirection.x;
        deltaNorth -= rightDirection.y;
        movedHorizontally = true;
    }
    // D: Strafe Right (along rightDirection vector)
    if (inputState.strafeRight) {
        deltaEast += rightDirection.x;
        deltaNorth += rightDirection.y;
        movedHorizontally = true;
    }

    // If there was any horizontal input, calculate the final move vector
    if (movedHorizontally) {
        needsRender = true;
        const magnitude = Math.sqrt(deltaEast * deltaEast + deltaNorth * deltaNorth);
        let normalizedEast = 0;
        let normalizedNorth = 0;

        // Normalize the direction vector if there's movement
        if (magnitude > 1e-6) {
             normalizedEast = deltaEast / magnitude;
             normalizedNorth = deltaNorth / magnitude;
        }

        // Final movement delta for this frame in East and North directions
        const finalMoveEast = normalizedEast * moveAmount;
        const finalMoveNorth = normalizedNorth * moveAmount;

        // --- Apply Movement using Cesium's ENU Frame ---
        // 1. Get current world position (ECEF) and ENU transform matrix
        const playerWorldPos = Cesium.Cartesian3.fromRadians(playerPosition.longitude, playerPosition.latitude, playerPosition.height);
        const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(playerWorldPos);

        // 2. Create movement vector in the local ENU frame (East, North, Up)
        const moveENU = new Cesium.Cartesian3(finalMoveEast, finalMoveNorth, 0); // No vertical movement from keys

        // 3. Transform the ENU movement vector to the ECEF frame
        const moveECEF = Cesium.Matrix4.multiplyByPointAsVector(enuTransform, moveENU, new Cesium.Cartesian3());

        // 4. Add the ECEF movement vector to the current ECEF position
        const newWorldPos = Cesium.Cartesian3.add(playerWorldPos, moveECEF, new Cesium.Cartesian3());

        // 5. Convert the new ECEF position back to Cartographic (Lat, Lon, Height)
        const newCartographic = Cesium.Cartographic.fromCartesian(newWorldPos);

        let allowMove = true;
        // Apply the new longitude and latitude if movement is allowed
        if (allowMove) {
            playerPosition.longitude = newCartographic.longitude;
            playerPosition.latitude = newCartographic.latitude;
            // Note: Height might have already been adjusted by the step-up logic above.
        }
    } // end if (movedHorizontally)


    // --- 6. Update Tileset Visibility & Frustum Culling ---
    // Update Cesium's internal visibility checks if player moved or forced render
    if (movedHorizontally || needsRender) {
        if (FrustumCuller && FrustumCuller.initialized) {
            FrustumCuller.update(); // Update custom culler if enabled
        }
    }

    // --- 7. Position Cesium Camera ---
    // Calculate the target position in world coordinates
    const targetWorldPosition = Cesium.Cartesian3.fromRadians(playerPosition.longitude, playerPosition.latitude, playerPosition.height);

    // Use setView for precise control based on heading and pitch
    cesiumCamera.setView({
        destination: targetWorldPosition,
        orientation: {
            heading: cameraHeading, // Use cameraHeading (synced with playerHeading)
            pitch: cameraPitch,
            roll: 0.0 // Usually keep roll at 0
        }
    });
    // Move the camera backward along its view direction to create the third-person distance
    cesiumCamera.moveBackward(cameraDistance);


    // --- 8. Update Three.js Player Mesh Orientation ---
    // Rotate the Three.js mesh around its Y-axis (up) to match the player's heading.
    // Cesium heading is clockwise from North. Three.js Y-rotation is counter-clockwise.
    // Therefore, Three.js rotation = -playerHeading.
    if (three.playerMesh) {
         three.playerMesh.rotation.y = -playerHeading;
    }


    // --- 9. Synchronize Three.js Camera with Cesium Camera ---
    if (three.renderer && three.camera && cesiumCamera) {
        // Clear the Three.js renderer before drawing the overlay
        three.renderer.clear();

        // Get Cesium's view and projection matrices
        const cvm = cesiumCamera.viewMatrix;
        const cpm = cesiumCamera.frustum.projectionMatrix;

        // Apply these matrices to the Three.js camera
        // Note: `fromArray` handles the column-major to row-major conversion needed by Three.js.
        three.camera.matrixWorldInverse.fromArray(cvm); // View matrix is inverse of world matrix
        three.camera.projectionMatrix.fromArray(cpm);   // Projection matrix

        // Calculate the world matrix from the inverse view matrix
        three.camera.matrixWorld.copy(three.camera.matrixWorldInverse).invert();

        // Disable Three.js's automatic matrix updates for this camera
        three.camera.matrixAutoUpdate = false;
    }

    // --- 10. Update Mini-map ---
     miniMap.update(playerPosition, playerHeading); // Update with current position and heading


    // --- 11. Render Both Scenes ---
    viewer.render(); // Render the Cesium scene (globe, tileset)
    if (three.renderer && three.scene && three.camera) {
        three.renderer.render(three.scene, three.camera); // Render the Three.js scene (player mesh) on top
    }

    // --- 12. Update Instructions Display ---
    const heightInfo = 
        ` (Altitude: ${playerPosition.height.toFixed(1)}m)`; // Show altitude relative to ellipsoid
    instructionsElement.innerHTML = `W/S: Move | A/D: Strafe | Arrows: Look | Space: Jump<br>Facing: ${getDirection(playerHeading)}${heightInfo}`;
} // End of update function

// --- Initialization Sequence ---
async function initialize() {
    // Initialize Three.js scene first
    three = initThree();

    // Initialize Cesium and get viewer
    const result = initCesium();
    viewer = result.viewer;
    cesiumCamera = result.cesiumCamera;
    FrustumCuller = result.FrustumCuller;

    // Initialize the minimap
    miniMap = new MiniMap(1000); // radius in meters

    // Set up input listeners
    setupInputListeners(inputState, playerPosition, verticalVelocity, playerHeading, cameraHeading, 
                        cameraPitch, updateDirectionVectors, forwardDirection, rightDirection, 
                        cities, viewer, miniMap);

    // Calculate initial direction vectors based on starting heading (North)
    updateDirectionVectors(playerHeading, forwardDirection, rightDirection);

    try {
        // Load the OSM buildings tileset
        osmBuildingsTileset = await loadOsmBuildings(viewer, instructionsElement);
        
        console.log("Initial setup complete. Starting update loop.");

        // Set initial camera view after Cesium and tileset are ready
        const initialTargetWorldPos = Cesium.Cartesian3.fromRadians(playerPosition.longitude, playerPosition.latitude, playerPosition.height);
        cesiumCamera.setView({
            destination: initialTargetWorldPos,
            orientation: { heading: cameraHeading, pitch: cameraPitch, roll: 0.0 }
        });
        cesiumCamera.moveBackward(cameraDistance); // Apply initial camera distance

        // Start the custom render loop
        lastTime = performance.now(); // Initialize time for first delta calculation
        requestAnimationFrame(update);
    } catch (error) {
        console.error("Failed to initialize application after loading buildings:", error);
        instructionsElement.innerHTML = "Failed to initialize. Check console for errors.";
        instructionsElement.style.color = 'red';
    }
}

// --- Window Resize Handling ---
window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Update Three.js renderer and camera aspect ratio
    if (three.renderer && three.camera) {
        three.renderer.setSize(width, height);
        three.camera.aspect = width / height;
        three.camera.updateProjectionMatrix(); // Crucial after changing aspect ratio
    }

    // Update Cesium camera aspect ratio (important for accurate projection)
     if(cesiumCamera && cesiumCamera.frustum && height > 0) {
         // Check if frustum has aspectRatio property before setting
         if (typeof cesiumCamera.frustum.aspectRatio !== 'undefined') {
            cesiumCamera.frustum.aspectRatio = width / height;
         }
     }

    needsRender = true; // Force a re-render after resize
});

// Start initialization
initialize();