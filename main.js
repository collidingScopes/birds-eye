// Import Three.js as an ES Module
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.min.js';

// --- Cesium Ion Access Token ---
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIxY2FhMzA2MS1jOWViLTRiYWUtODJmZi02YjAxMmM5MGI3MzkiLCJpZCI6MjkxMTc3LCJpYXQiOjE3NDM4ODA1Mjd9.Js54F7Sh9x04MT9-MjRAL5qm97R_pw7xSrAIS9I8wY4';

// --- Constants ---
const playerMoveSpeed = 100.0;
const cameraTurnSpeed = 2.0;
const cameraDistance = 20.0;
const jumpVelocity = 50;
const gravity = -50.0;
const groundHeight = 10.0; // Base height when not on a building

// Performance Settings
const tilesMaximumScreenSpaceError = 50;
const enableFrustumCulling = true; // Enable custom frustum culler (potentially redundant)
const enableLOD = true;

// City Coordinates
const cities = {
    nyc: { longitude: -73.9854, latitude: 40.7580 },
    london: { longitude: -0.1276, latitude: 51.5074 },
    tokyo: { longitude: 139.6917, latitude: 35.6895 },
    paris: { longitude: 2.3522, latitude: 48.8566 },
    sydney: { longitude: 151.2093, latitude: -33.8688 },
    montreal: { longitude: -73.5674, latitude: 45.5019 },
    toronto: { longitude: -79.3832, latitude: 43.6532 },
    istanbul: { longitude: 28.9784, latitude: 41.0082 },
    hanoi: { longitude: 105.8342, latitude: 21.0278 },
    hongkong: { longitude: 114.1694, latitude: 22.3193 }
};

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
    strafeRight: false // D
};

// DOM Elements
const instructionsElement = document.getElementById('instructions');
const citySelector = document.getElementById('citySelector');
const fpsCounter = document.getElementById('fpsCounter');

// FPS Tracking
let frameCount = 0;
let lastFpsUpdate = 0;
let currentFps = 0;

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
            // console.log("FrustumCuller initialized");
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
            // console.warn("FrustumCuller: Camera frustum is not Perspective type, cannot update.");
            this.initialized = false;
        }
    }
};

// Initialize the frustum culler (if enabled) - defer slightly
if (enableFrustumCulling) {
    setTimeout(() => FrustumCuller.init(cesiumCamera), 100);
}

// --- Mini-map Initialization ---
const miniMap = new MiniMap(1000); //radius in meters

// --- OSM Buildings Tileset Loading ---
let osmBuildingsTileset = null;
async function loadOsmBuildings() {
    try {
        // Use Ion asset ID
        osmBuildingsTileset = await Cesium.Cesium3DTileset.fromIonAssetId(96188, {
            maximumScreenSpaceError: tilesMaximumScreenSpaceError,
            maximumMemoryUsage: 2048,
            cullWithChildrenBounds: true,
            skipLevelOfDetail: false, // Let Cesium manage LOD more dynamically
            // baseScreenSpaceError: 1024, // Can experiment with these
            // skipScreenSpaceErrorFactor: 16,
            // skipLevels: 1,
            // immediatelyLoadDesiredLevelOfDetail: false, // Prefer default lazy loading
            // loadSiblings: false, // Prefer default lazy loading
            // cullRequestsWhileMoving: true, // Allow culling while moving for performance
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
        updateDirectionVectors(); // Ensure directions are set based on initial North heading
        miniMap.update(playerPosition, playerHeading); // Update minimap

    } catch (error) {
        console.error(`Error loading Cesium OSM Buildings: ${error}`);
        instructionsElement.innerHTML = "Error loading city data.<br>Check console.";
        instructionsElement.style.color = 'red';
        if (error instanceof Cesium.RequestErrorEvent) {
            console.error("Network error or CORS issue loading tileset?");
        } else if (error.message && (error.message.includes("401") || error.message.includes("404"))) {
             console.error("Invalid Cesium ION Token or Asset ID permissions/not found?");
        }
    }
}

// Set up Level of Detail (LOD) for tileset
function setupLOD(tileset) {
    if (!tileset) return;
    tileset.dynamicScreenSpaceError = true;
    tileset.dynamicScreenSpaceErrorDensity = 0.00278;
    tileset.dynamicScreenSpaceErrorFactor = 4.0;
    tileset.dynamicScreenSpaceErrorHeightFalloff = 0.25;
    tileset.maximumScreenSpaceError = tilesMaximumScreenSpaceError; // Base SSE
    console.log("LOD configured for tileset.");
}

// Update tileset visibility (Potentially redundant with Cesium's culling)
function updateTilesetVisibility(position) {
    if (!osmBuildingsTileset || !osmBuildingsTileset.ready) return;
    osmBuildingsTileset.show = true; // Ensure it's shown
}


// --- Three.js Scene Initialization ---
const three = { scene: null, camera: null, renderer: null, playerMesh: null };
function initThree() {
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
}

// --- Input Handling and Movement Logic ---

/**
 * Updates the forwardDirection and rightDirection vectors based on the current playerHeading.
 * Assumes playerHeading is radians clockwise from North.
 * Updates vectors in the ENU (East-North-Up) frame.
 */
function updateDirectionVectors() {
    // playerHeading: 0 = North, positive = CLOCKWISE (East=PI/2)
    // Standard Trig functions: 0 = East, positive = COUNTER-CLOCKWISE (North=PI/2)
    // Angle for standard trig functions = PI/2 - playerHeading
    const trigAngle = Cesium.Math.PI_OVER_TWO - playerHeading;

    // Forward direction in ENU (X=East, Y=North)
    forwardDirection.x = Math.cos(trigAngle);
    forwardDirection.y = Math.sin(trigAngle);

    // Right direction (relative to forward, 90deg clockwise) in ENU
    // Rotation matrix for -90 deg: [cos(-90) -sin(-90)] [x] = [ 0  1] [x] = [ y]
    //                              [sin(-90)  cos(-90)] [y]   [-1  0] [y]   [-x]
    // So, rightDirection = (forwardDirection.y, -forwardDirection.x)
    rightDirection.x = forwardDirection.y;
    rightDirection.y = -forwardDirection.x;

    // Optional: Log to verify directions based on heading
    // console.log(`Heading: ${(Cesium.Math.toDegrees(playerHeading)).toFixed(1)} CW | Fwd(E,N): (${forwardDirection.x.toFixed(2)}, ${forwardDirection.y.toFixed(2)}) | Rgt(E,N): (${rightDirection.x.toFixed(2)}, ${rightDirection.y.toFixed(2)})`);
}

/**
 * Sets up keyboard and city selector listeners.
 */
function setupInputListeners() {
    document.addEventListener('keydown', (event) => {
        const key = event.key.toUpperCase();
        let handled = true; // Flag to prevent default browser actions like scrolling
        switch (key) {
            case 'W': inputState.forward = true; break;
            case 'S': inputState.backward = true; break;
            case 'A': inputState.strafeLeft = true; break;
            case 'D': inputState.strafeRight = true; break;
            // --- Camera/Player Turning ---
            case 'ARROWLEFT': inputState.left = true; break; // Turn Left (CCW -> decrease heading)
            case 'ARROWRIGHT': inputState.right = true; break; // Turn Right (CW -> increase heading)
            // --- Camera Pitch ---
            case 'ARROWUP': inputState.up = true; break;
            case 'ARROWDOWN': inputState.down = true; break;
            case ' ': inputState.jump = true; break;
            default: handled = false; break; // Don't prevent default for other keys
        }
        if (handled) event.preventDefault(); // Prevent scrolling with arrow/space keys
    });

    document.addEventListener('keyup', (event) => {
        const key = event.key.toUpperCase();
        switch (key) {
            case 'W': inputState.forward = false; break;
            case 'S': inputState.backward = false; break;
            case 'A': inputState.strafeLeft = false; break;
            case 'D': inputState.strafeRight = false; break;
            case 'ARROWLEFT': inputState.left = false; break;
            case 'ARROWRIGHT': inputState.right = false; break;
            case 'ARROWUP': inputState.up = false; break;
            case 'ARROWDOWN': inputState.down = false; break;
            case ' ': inputState.jump = false; break; // Set jump to false on key up
        }
    });

    // City selection logic
    citySelector.addEventListener('change', (event) => {
        const selectedCity = event.target.value;
        if (cities[selectedCity]) {
            const cityCoords = cities[selectedCity];
            // Reset player state
            playerPosition = Cesium.Cartographic.fromDegrees(cityCoords.longitude, cityCoords.latitude, groundHeight);
            verticalVelocity = 0;
            playerHeading = Cesium.Math.toRadians(0.0); // Reset heading to North
            cameraHeading = Cesium.Math.toRadians(0.0);
            cameraPitch = Cesium.Math.toRadians(-15.0); // Reset pitch
            updateDirectionVectors(); // Update vectors for new heading

            // Force immediate update of tile visibility might not be needed if relying on Cesium culling
            // updateTilesetVisibility(playerPosition);

            // Reset minimap
            miniMap.update(playerPosition, playerHeading);

            // Fly Cesium camera smoothly to the new location
             const targetWorldPos = Cesium.Cartesian3.fromRadians(playerPosition.longitude, playerPosition.latitude, playerPosition.height + 500); // Start slightly above
             viewer.camera.flyTo({
                 destination: targetWorldPos,
                 orientation: {
                     heading: cameraHeading,
                     pitch: cameraPitch,
                     roll: 0.0
                 },
                 duration: 1.5 // Duration in seconds
             });
             // Manually move camera back after flight to ensure correct distance
            setTimeout(() => {
                // Need to re-calculate target position as player might have moved slightly
                const currentTargetPos = Cesium.Cartesian3.fromRadians(playerPosition.longitude, playerPosition.latitude, playerPosition.height);
                viewer.camera.setView({ destination: currentTargetPos, orientation: {heading: cameraHeading, pitch: cameraPitch, roll: 0.0}});
                viewer.camera.moveBackward(cameraDistance);
                needsRender = true; // Force render after camera adjustment
            }, 1600); // Wait slightly longer than flight duration


            needsRender = true; // Ensure re-render after city change
        }
    });
}

/**
 * Gets cardinal direction name based on heading.
 * Assumes heading is radians clockwise from North.
 */
function getDirection(headingRad) {
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

// --- Game Loop ---
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
        updateDirectionVectors(); // Recalculate movement vectors based on new heading
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
        // updateTilesetVisibility(playerPosition); // Maybe not needed
        if (enableFrustumCulling && FrustumCuller.initialized) {
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
         // We might need to adjust the mesh's position slightly if its pivot isn't perfectly at the base
         // three.playerMesh.position.y = height / 2; // Ensure it sits on the ground plane in three.js space
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

// Initialize Three.js scene first
initThree();

// Set up input listeners
setupInputListeners();

// Calculate initial direction vectors based on starting heading (North)
updateDirectionVectors();

// Asynchronously load the Cesium 3D Tileset and then start the game loop
loadOsmBuildings().then(() => {
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

}).catch(error => {
    console.error("Failed to initialize application after loading buildings:", error);
     instructionsElement.innerHTML = "Failed to initialize. Check console for errors.";
     instructionsElement.style.color = 'red';
});


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