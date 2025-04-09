import {
    initThree,
    initCesium,
    loadOsmBuildings,
    updateDirectionVectors,
    setupInputListeners,
    getDirection,
    playerMoveSpeed,
    cameraTurnSpeed,
    jumpVelocity,
    gravity,
    groundHeight,
    cities,
    populateCitySelector,
    DRAMATIC_FALL_HEIGHT // Import the fall height constant
} from './initial-setup.js';
import { checkBuildingCollision } from './building-collision.js';
import { CameraSystem } from './camera-system.js';
import { TerrainManager } from './terrain-manager.js';
import { createBuildingColorManager } from './building-shaders.js';
// Import the new location options module
import { setupLocationOptions } from './location-options.js';
import { JumpBoostEffect } from './jump-boost-animation.js';
import { ShaderSpeedEffect } from './speed-effect.js';

// --- Cesium Ion Access Token ---
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIxY2FhMzA2MS1jOWViLTRiYWUtODJmZi02YjAxMmM5MGI3MzkiLCJpZCI6MjkxMTc3LCJpYXQiOjE3NDM4ODA1Mjd9.Js54F7Sh9x04MT9-MjRAL5qm97R_pw7xSrAIS9I8wY4';

// --- State Variables ---
// DRAMATIC FALL: Set initial height much higher
let playerPosition = Cesium.Cartographic.fromDegrees(
    cities.nyc.longitude,
    cities.nyc.latitude,
    groundHeight + DRAMATIC_FALL_HEIGHT // Use constants imported from initial-setup.js
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

// Current acceleration state (0.0 to 1.0)
let currentSpeedFactor = 0.0;
// How quickly player accelerates (units per second)
const accelerationRate = 1.0;
// How quickly player decelerates when not moving (units per second)
const decelerationRate = 3.0;
let speedEffect = null;
const SPEED_EFFECT_THRESHOLD = 0.7; // Speed threshold to start showing the effect
let jumpBoostEffect = null;

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
const fpsCounter = document.getElementById('fpsCounter');

// FPS Tracking
let frameCount = 0;
let lastFpsUpdate = 0;
let currentFps = 0;

// Three.js and Cesium objects
let viewer, cesiumCamera, three, osmBuildingsTileset, FrustumCuller, miniMap, cameraSystem;

// Building color manager
let buildingColorManager = null;

// --- Game Loop Variables ---
let lastTime = 0;
const renderInterval = 1000 / 60; // Target 60 FPS
let lastRenderTime = 0;
let needsRender = true;

// --- Initialization Sequence ---
async function initialize() {
    console.log("Starting initialization sequence...");

    populateCitySelector(cities);
    console.log("City selector populated");

    three = await initThree(); // initThree is imported from initial-setup.js
    console.log("Three.js initialized");

    const result = initCesium(); // initCesium is imported from initial-setup.js
    viewer = result.viewer;
    cesiumCamera = result.cesiumCamera;
    FrustumCuller = result.FrustumCuller;
    console.log("Cesium initialized");

    // Create terrain manager with default ground height (imported from initial-setup.js)
    terrainManager = new TerrainManager(viewer, groundHeight);
    console.log("Terrain manager initialized");

    if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
    if (viewer.scene.sun) viewer.scene.sun.show = false;
    if (viewer.scene.moon) viewer.scene.moon.show = false;

    viewer.scene.skyBox = undefined;
    viewer.scene.skyAtmosphere = undefined;
    viewer.scene.sun = undefined;
    viewer.scene.moon = undefined;
    viewer.scene.backgroundColor = new Cesium.Color(0, 0, 0, 0);

    three.renderer.setClearColor(0x000000, 0);
    three.renderer.autoClear = false;

    cameraSystem = new CameraSystem(cesiumCamera, three.camera);
    console.log("Camera system initialized");

    miniMap = new MiniMap(1000); // Assuming MiniMap is defined elsewhere or in a script tag

    // Use updateDirectionVectors imported from initial-setup.js
    updateDirectionVectors(playerHeading, forwardDirection, rightDirection);

    const verticalVelocityRef = { value: verticalVelocity };
    const playerHeadingRef = { value: playerHeading };

    fallStateRef.fallStartTime = performance.now();

    // Set up standard input listeners using function imported from initial-setup.js
    setupInputListeners(
        inputState,
        playerPosition,
        verticalVelocityRef,
        playerHeadingRef,
        updateDirectionVectors, // Pass the function reference
        forwardDirection,
        rightDirection,
        cities, // Pass the cities object imported from initial-setup.js
        viewer,
        miniMap,
        cameraSystem,
        terrainManager,
        instructionsElement,
        fallStateRef
    );

    // Set up the new location options
    setupLocationOptions(
        inputState,
        playerPosition,
        verticalVelocityRef,
        playerHeadingRef,
        updateDirectionVectors, // Pass the function reference
        forwardDirection,
        rightDirection,
        cities, // Pass the cities object imported from initial-setup.js
        viewer,
        miniMap,
        cameraSystem,
        terrainManager,
        instructionsElement,
        fallStateRef
    );

    verticalVelocity = verticalVelocityRef.value;
    playerHeading = playerHeadingRef.value;

    try {
        // Load OSM buildings tileset using function imported from initial-setup.js
        osmBuildingsTileset = await loadOsmBuildings(viewer, instructionsElement);

        try {
            buildingColorManager = createBuildingColorManager(viewer, osmBuildingsTileset);
            console.log("Building color manager initialized");
            setupColorControls(buildingColorManager);
        } catch (colorError) {
            console.warn("Failed to initialize building color manager:", colorError);
            console.log("Game will continue without color effects");
            const colorControls = document.getElementById('colorControls');
            if (colorControls) {
                colorControls.style.display = 'none';
            }
        }

        console.log("Initial setup complete. Starting update loop.");
        console.log(`Initial player height: ${playerPosition.height}m`);
        console.log(`Initial fall state: ${fallStateRef.isInInitialFall}`);

        // Start with camera looking downward
        const initialCameraPitch = Cesium.Math.toRadians(45);
        cameraSystem.teleport(playerPosition, playerHeading, initialCameraPitch);
        cameraSystem.syncThreeCamera();

        instructionsElement.innerHTML = "Entering the city... Use WASD to move and Arrow keys to look around while falling!";

        lastTime = performance.now();
        requestAnimationFrame(update);
    } catch (error) {
        console.error("Failed to initialize application:", error);
        instructionsElement.innerHTML = "Failed to initialize. Check console for errors.";
        instructionsElement.style.color = 'red';
    }

    // Initialize jump boost effect
    jumpBoostEffect = new JumpBoostEffect(three.scene);
    console.log("Jump boost effect initialized");

    speedEffect = new ShaderSpeedEffect(document.body, three.THREE);
}

/**
 * Set up controls for building color effects
 * @param {Object} colorManager - Building color manager instance
 */
function setupColorControls(colorManager) {
    let toggleButton = document.getElementById('toggleShader');
    const colorInfo = document.getElementById('colorInfo'); // Assuming this might exist

    if (!toggleButton) { // Removed check for colorInfo as it wasn't used below
        console.warn("Color UI elements not found");

        // Create UI elements if they don't exist
        const controlsDiv = document.createElement('div');
        controlsDiv.id = 'colorControls';
        controlsDiv.className = 'shader-controls';
        controlsDiv.innerHTML = `
            <button id="toggleShader" class="shader-button">Enable Futuristic Mode (E)</button>
        `;
        document.body.appendChild(controlsDiv);

        toggleButton = document.getElementById('toggleShader');

        if (!toggleButton) {
            console.error("Failed to create color UI elements");
            return;
        }
    }

    function updateButtonState() {
        const settings = colorManager.getSettings();
        if (settings.enabled) {
            toggleButton.textContent = `Disable Futuristic Mode (E)`;
            toggleButton.classList.add('active');
        } else {
            toggleButton.textContent = `Enable Futuristic Mode (E)`;
            toggleButton.classList.remove('active');
        }
    }

    toggleButton.addEventListener('click', () => {
        colorManager.toggle();
        updateButtonState();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key.toUpperCase() === 'E') {
            colorManager.toggle();
            updateButtonState();
            event.preventDefault();
        }
    });

    updateButtonState();
}

/**
 * The main update function, called each frame.
 * @param {number} currentTime - Current timestamp from requestAnimationFrame
 */
function update(currentTime) {
    requestAnimationFrame(update);

    const deltaTime = Math.min((currentTime - (lastTime || currentTime)) / 1000.0, 0.1);
    lastTime = currentTime;

    frameCount++;
    if (currentTime - lastFpsUpdate >= 1000) {
        currentFps = Math.round(frameCount * 1000 / (currentTime - lastFpsUpdate));
        fpsCounter.textContent = `FPS: ${currentFps}`;
        frameCount = 0;
        lastFpsUpdate = currentTime;
    }

    const isMoving = inputState.forward || inputState.backward || inputState.strafeLeft || inputState.strafeRight;
    const isTurning = inputState.left || inputState.right;
    const isPitching = inputState.up || inputState.down;
    const isJumping = inputState.jump;
    // Use groundHeight imported from initial-setup.js
    const physicsActive = verticalVelocity !== 0 || (playerPosition && playerPosition.height > groundHeight + 0.1);

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

    // MODIFICATION: Allow camera controls during fall
    // Remove the conditional block and allow camera controls at all times
    const cameraControlResult = cameraSystem.updateControls(inputState, deltaTime, cameraTurnSpeed);
    if (cameraControlResult.changed) {
        needsRender = true;
        playerHeading = (cameraSystem.getHeading() + Math.PI) % (2.0 * Math.PI);
        // Use updateDirectionVectors imported from initial-setup.js
        updateDirectionVectors(playerHeading, forwardDirection, rightDirection);
    }

    const buildingCollision = checkBuildingCollision(viewer, playerPosition, osmBuildingsTileset, inputState, buildingCache, 20.0);
    const surfaceHeight = terrainManager.getSurfaceHeight(playerPosition, buildingCollision);
    const onSurface = terrainManager.isOnSurface(playerPosition, verticalVelocity, buildingCollision);

    if (fallStateRef.isInInitialFall && (
        onSurface ||
        playerPosition.height <= surfaceHeight ||
        Math.abs(playerPosition.height - surfaceHeight) < 0.1 ||
        playerPosition.height <= 0
    )) {
        console.log("Fall complete! Landing detected.");
        fallStateRef.isInInitialFall = false;
        fallStateRef.initialFallComplete = true;
        playerPosition.height = surfaceHeight;
    }

    // Use gravity imported from initial-setup.js
    if (fallStateRef.isInInitialFall) {
        verticalVelocity += gravity * deltaTime * 1.5;
    } else {
        if (inputState.jump) {
            // Use jumpVelocity imported from initial-setup.js
            verticalVelocity = jumpVelocity;
            playerPosition.height += 0.1;
            needsRender = true;
            inputState.jump = false;

            // ADD THIS CODE:
            // Trigger jump boost effect
            if (jumpBoostEffect) {
                // Get player position in Three.js coordinates
                let threePosition = null;
                
                if (three.playerMesh) {
                    // If we have a player mesh, use its position
                    threePosition = three.playerMesh.position.clone();
                } else {
                    // Otherwise create a position at the origin
                    threePosition = new THREE.Vector3(0, 0, 0);
                }
                
                jumpBoostEffect.triggerJump(threePosition);
            }
        }
        verticalVelocity += gravity * deltaTime;
    }

    playerPosition.height += verticalVelocity * deltaTime;

    if (playerPosition.height < surfaceHeight) {
        playerPosition.height = surfaceHeight;
        if (fallStateRef.isInInitialFall || (fallStateRef.initialFallComplete && Math.abs(verticalVelocity) > 20)) {
            verticalVelocity = Math.abs(verticalVelocity) * -0.2;
            fallStateRef.initialFallComplete = false;
        } else {
            verticalVelocity = 0;
        }
    }

    needsRender = true;

    // Calculate acceleration/deceleration
    if (isMoving) {
        // Accelerate when moving, using a non-linear curve for more realistic acceleration
        const accelerationCurve = 1.0 - currentSpeedFactor; // Slows acceleration as speed increases
        currentSpeedFactor = Math.min(
            currentSpeedFactor + (accelerationRate * accelerationCurve * deltaTime),
            1.0
        );
    } else {
        // Decelerate when not moving
        currentSpeedFactor = Math.max(currentSpeedFactor - decelerationRate * deltaTime, 0.0);
    }
    
    // Apply surface factor if on ground
    const surfaceSpeedFactor = 0.4; // Adjust as needed (0.5 = half speed)
    const environmentFactor = onSurface ? surfaceSpeedFactor : 1.0;
    
    // Calculate final move amount with both acceleration and environment factors
    const moveAmount = playerMoveSpeed * deltaTime * currentSpeedFactor * environmentFactor;
    
    // --- Add this after updating the speed calculations ---
    if (speedEffect) {
        // Pass the camera system to update wind tunnel direction based on view
        speedEffect.update(currentSpeedFactor, SPEED_EFFECT_THRESHOLD, cameraSystem, !onSurface);
    }

    let deltaEast = 0;
    let deltaNorth = 0;
    let movedHorizontally = false;

    // MODIFICATION: Allow movement during fall
    // Remove conditional and process movement at all times
    const movementForward = { x: forwardDirection.x, y: forwardDirection.y };
    const movementRight = { x: rightDirection.x, y: rightDirection.y };

    if (inputState.forward) {
        deltaEast += movementForward.x; deltaNorth += movementForward.y; movedHorizontally = true;
    }
    if (inputState.backward) {
        deltaEast -= movementForward.x; deltaNorth -= movementForward.y; movedHorizontally = true;
    }
    if (inputState.strafeLeft) {
        deltaEast -= movementRight.x; deltaNorth -= movementRight.y; movedHorizontally = true;
    }
    if (inputState.strafeRight) {
        deltaEast += movementRight.x; deltaNorth += movementRight.y; movedHorizontally = true;
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
                const newPositionCheck = { ...playerPosition }; // Shallow copy
                const tempCache = { valid: false, hit: false, height: 0 };
                const forcedInputState = { forward: true };
                const newBuildingCollision = checkBuildingCollision(
                    viewer, newPositionCheck, osmBuildingsTileset, forcedInputState, tempCache, 0
                );
                if (!newBuildingCollision.hit || Math.abs(newBuildingCollision.height - surfaceHeight) > 1.0) {
                    verticalVelocity = -0.1;
                }
            }
        }
    }

    if (movedHorizontally || needsRender) {
        if (FrustumCuller && FrustumCuller.initialized) {
            FrustumCuller.update();
        }
    }

    cameraSystem.update(
        playerPosition,
        playerHeading,
        forwardDirection
    );

    if (three.playerMesh) {
        const cameraPitch = cameraSystem.getPitch();

        /*
        console.log("Player heading: "+playerHeading);
        console.log("Camera pitch: "+cameraPitch);
        console.log("Player z rotation: "+three.playerMesh.rotation.z);
        console.log("Player x rotation: "+three.playerMesh.rotation.x);
        console.log("Player y rotation: "+three.playerMesh.rotation.y);
        console.log("Player y position: "+three.playerMesh.position.y);
        */
       
        three.playerMesh.rotation.y = Math.PI - playerHeading;
        three.playerMesh.rotation.x = Math.PI/2;

        function normalizeAngle(angle) {
            return Math.atan2(Math.sin(angle), Math.cos(angle));
        }

        three.playerMesh.rotation.z = -normalizeAngle(playerHeading);

        /*
        if(cameraPitch > 0){
            three.playerMesh.rotation.z = -normalizeAngle(playerHeading);
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
        three.playerMesh.position.set(0, 0, 0);
        */

        if (three.animationSystem) {
            three.animationSystem.updatePlayerAnimation(inputState, onSurface, verticalVelocity);
            three.animationSystem.update(deltaTime);
        }
    }

    if (buildingColorManager) {
        const colorSettings = buildingColorManager.getSettings();
        if (colorSettings.enabled) {
            buildingColorManager.update(playerPosition);
        }
    }

    // Check if miniMap exists before updating (added conditional check)
    if (typeof miniMap !== 'undefined' && miniMap && typeof miniMap.update === 'function') {
        miniMap.update(playerPosition, playerHeading);
    }

    if (jumpBoostEffect) {
        // Use the player mesh position as reference if available
        const effectPosition = three.playerMesh ? three.playerMesh.position : null;
        jumpBoostEffect.update(currentTime, effectPosition);
    }

    viewer.scene.globe.show = true;
    if (!buildingColorManager || !buildingColorManager.getSettings().enabled) {
        viewer.scene.backgroundColor = new Cesium.Color(0.678, 0.847, 0.902, 1);
    }
    viewer.render();

    if (three.renderer && three.scene && three.camera) {
        three.renderer.render(three.scene, three.camera);
    }

    const heightInfo = ` (Altitude: ${playerPosition.height.toFixed(1)}m)`;
    const buildingInfo = buildingCollision.hit ? ` | Building: ${buildingCollision.height.toFixed(1)}m` : "";

    if (fallStateRef.isInInitialFall) {
        // MODIFICATION: Update instructions to include controls during fall
        instructionsElement.innerHTML = `Skydiving into city... Use WASD to move and Arrow keys to look around!${heightInfo}`;
    } else {
        // Use getDirection imported from initial-setup.js
        instructionsElement.innerHTML = `W/S: Move | A/D: Strafe | Arrows: Look | Space: Jump | E: Effects<br>Facing: ${getDirection(playerHeading)}${heightInfo}${buildingInfo}`;
    }
}

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

    if (speedEffect) {
        speedEffect.handleResize();
    }

    needsRender = true;
});

initialize();