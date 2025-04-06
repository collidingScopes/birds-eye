Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIxY2FhMzA2MS1jOWViLTRiYWUtODJmZi02YjAxMmM5MGI3MzkiLCJpZCI6MjkxMTc3LCJpYXQiOjE3NDM4ODA1Mjd9.Js54F7Sh9x04MT9-MjRAL5qm97R_pw7xSrAIS9I8wY4';

const playerMoveSpeed = 100.0;
const cameraTurnSpeed = 2.0;
const cameraFollowSpeed = 3.0;
const cameraDistance = 20.0;
const jumpVelocity = 50;
const gravity = -50.0;
const groundHeight = 30.0;

// Performance optimization settings
const visibilityRadius = 100.0; // Meters to render buildings around player (higher value for more visibility)
const tilesMaximumScreenSpaceError = 50; // Lower values = more detail (8-16 is a good balance)
const enableFrustumCulling = true; // Only render what's in the camera view
const enableLOD = true; // Use level of detail based on distance

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

let playerPosition = Cesium.Cartographic.fromDegrees(cities.nyc.longitude, cities.nyc.latitude, groundHeight);
let playerHeading = Cesium.Math.toRadians(0.0);
let cameraHeading = Cesium.Math.toRadians(0.0);
let cameraPitch = Cesium.Math.toRadians(-15.0);
let verticalVelocity = 0.0;
let forwardDirection = { x: 1, y: 0 };
let rightDirection = { x: 0, y: -1 };

const inputState = {
    forward: false, 
    backward: false, 
    left: false, 
    right: false,
    up: false, 
    down: false, 
    jump: false,
    strafeLeft: false,
    strafeRight: false
};

const instructionsElement = document.getElementById('instructions');
const citySelector = document.getElementById('citySelector');
const fpsCounter = document.getElementById('fpsCounter');

// FPS tracking variables
let frameCount = 0;
let lastFpsUpdate = 0;
let currentFps = 0;

const viewer = new Cesium.Viewer('cesiumContainer', {
    animation: false, baseLayerPicker: false, fullscreenButton: false, geocoder: false,
    homeButton: false, infoBox: false, sceneModePicker: false, selectionIndicator: false,
    timeline: false, navigationHelpButton: false, scene3DOnly: true,
    useDefaultRenderLoop: false,
    maximumScreenSpaceError: tilesMaximumScreenSpaceError,
    requestRenderMode: false  // Use continuous rendering to ensure buildings appear
});

viewer.scene.screenSpaceCameraController.enableInputs = false;
const cesiumCamera = viewer.camera;

// Frustum culling implementation
const FrustumCuller = {
    init: function(camera) {
        this.camera = camera;
        this.frustum = new Cesium.PerspectiveFrustum();
        this.frustum.fov = camera.frustum.fov;
        this.frustum.aspectRatio = camera.frustum.aspectRatio;
        this.frustum.near = camera.frustum.near;
        this.frustum.far = camera.frustum.far;
    },

    update: function() {
        this.frustum.fov = this.camera.frustum.fov;
        this.frustum.aspectRatio = this.camera.frustum.aspectRatio;
        this.frustum.near = this.camera.frustum.near;
        this.frustum.far = this.camera.frustum.far;
    }
};

// Initialize the frustum culler
if (enableFrustumCulling) {
    FrustumCuller.init(cesiumCamera);
}

let osmBuildingsTileset = null;
async function loadOsmBuildings() {
    try {
        osmBuildingsTileset = await Cesium.Cesium3DTileset.fromIonAssetId(96188, {
            maximumScreenSpaceError: tilesMaximumScreenSpaceError,
            maximumMemoryUsage: 2048,   // Allow up to 2GB memory
            cullWithChildrenBounds: true,
            skipLevelOfDetail: true,
            baseScreenSpaceError: 512,  // Lower value for better initial detail
            skipScreenSpaceErrorFactor: 8,
            skipLevels: 1,
            immediatelyLoadDesiredLevelOfDetail: true,
            loadSiblings: true,
            cullRequestsWhileMoving: false,  // Don't cull while moving to ensure buildings load
        });

        viewer.scene.primitives.add(osmBuildingsTileset);
        osmBuildingsTileset.style = new Cesium.Cesium3DTileStyle({ color: "color('#e0e0e0')" });
        
        // Initialize collision system
        CollisionSystem.init(viewer.scene, osmBuildingsTileset);
        
        // Set up dynamic LOD and visibility
        if (enableLOD) {
            setupLOD(osmBuildingsTileset);
        }
        
        instructionsElement.innerHTML = "W/S: Move Forward/Backward<br>A/D: Strafe Left/Right<br>Arrow Keys: Move Camera<br>Space: Jump<br>Facing: East";
    } catch (error) {
        console.error(`Error loading Cesium OSM Buildings: ${error}`);
        instructionsElement.innerHTML = "Error loading city data.<br>Check console.";
        instructionsElement.style.color = 'red';
    }
}

// Set up Level of Detail (LOD) for tileset
function setupLOD(tileset) {
    // Define distance-based LOD settings
    tileset.maximumScreenSpaceError = tilesMaximumScreenSpaceError;
    
    // Custom tileset specific screen space error
    tileset.dynamicScreenSpaceError = true;
    tileset.dynamicScreenSpaceErrorDensity = 0.00278;
    tileset.dynamicScreenSpaceErrorFactor = 4.0;
}

// Function to update visibility of 3D Tiles based on distance
function updateTilesetVisibility(position) {
    if (!osmBuildingsTileset) return;
    
    // Make sure buildings are visible
    osmBuildingsTileset.show = true;
    
    // Set a more generous visibility radius
    if (visibilityRadius > 0) {
        osmBuildingsTileset.distanceDisplayCondition = new Cesium.DistanceDisplayCondition(0, visibilityRadius);
    } else {
        // If visibility radius is 0 or negative, don't restrict by distance
        osmBuildingsTileset.distanceDisplayCondition = undefined;
    }
}

const three = { scene: null, camera: null, renderer: null, playerMesh: null };
function initThree() {
    const scene = new THREE.Scene();
    const canvas = document.getElementById('threeCanvas');
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    three.camera = camera;
    const renderer = new THREE.WebGLRenderer({ 
        canvas: canvas, 
        alpha: true, 
        antialias: true,
        powerPreference: 'high-performance'  // Prefer GPU performance over power saving
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.autoClear = false;
    three.renderer = renderer;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 10, 5);
    scene.add(directionalLight);

    const radius = 0.3;
    const height = 1.0;
    const cylinder = new THREE.CylinderGeometry(radius, radius, height, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0xff8800 });
    const playerMesh = new THREE.Mesh(cylinder, material);
    playerMesh.position.set(0, height / 2, 0);
    scene.add(playerMesh);
    scene.add(camera);
    three.scene = scene;
    three.playerMesh = playerMesh;
}

function updateDirectionVectors() {
    // Cesium uses East-North-Up coordinate system
    // East is 0 degrees, North is 90 degrees
    // Forward direction vector
    forwardDirection.x = Math.sin(playerHeading);  // East component
    forwardDirection.y = Math.cos(playerHeading);  // North component
    
    // Right direction vector (perpendicular to forward direction)
    rightDirection.x = Math.sin(playerHeading + Math.PI/2);  // East component
    rightDirection.y = Math.cos(playerHeading + Math.PI/2);  // North component
}

function setupInputListeners() {
    document.addEventListener('keydown', (event) => {
        const key = event.key.toUpperCase();
        switch (key) {
            case 'W': inputState.forward = true; break;
            case 'S': inputState.backward = true; break;
            case 'A': inputState.strafeLeft = true; break;
            case 'D': inputState.strafeRight = true; break;
            case 'ARROWLEFT': inputState.left = true; break;
            case 'ARROWRIGHT': inputState.right = true; break;
            case 'ARROWUP': inputState.up = true; break;
            case 'ARROWDOWN': inputState.down = true; break;
            case ' ': inputState.jump = true; break;
        }
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
            case ' ': inputState.jump = false; break;
        }
    });

    citySelector.addEventListener('change', (event) => {
        const selectedCity = event.target.value;
        const cityCoords = cities[selectedCity];
        playerPosition = Cesium.Cartographic.fromDegrees(cityCoords.longitude, cityCoords.latitude, groundHeight);
        verticalVelocity = 0;
        playerHeading = Cesium.Math.toRadians(0.0);
        cameraHeading = Cesium.Math.toRadians(0.0);
        updateDirectionVectors();

        // Force immediate update of tile visibility when changing city
        updateTilesetVisibility(playerPosition);
    });
}

function getDirection(heading) {
    let degrees = Cesium.Math.toDegrees(heading) % 360;
    if (degrees < 0) degrees += 360;
    if (degrees >= 337.5 || degrees < 22.5) return "North";
    if (degrees >= 22.5 && degrees < 67.5) return "Northeast";
    if (degrees >= 67.5 && degrees < 112.5) return "East";
    if (degrees >= 112.5 && degrees < 157.5) return "Southeast";
    if (degrees >= 157.5 && degrees < 202.5) return "South";
    if (degrees >= 202.5 && degrees < 247.5) return "Southwest";
    if (degrees >= 247.5 && degrees < 292.5) return "West";
    if (degrees >= 292.5 && degrees < 337.5) return "Northwest";
    return "Unknown";
}

// Variables for frame throttling to improve performance
let lastRenderTime = 0;
const renderInterval = 1000 / 60; // Target 60 FPS
let needsRender = true;

let lastTime = 0;
function update(currentTime) {
    const deltaTime = (currentTime - (lastTime || currentTime)) / 1000.0;
    lastTime = currentTime;

    // Update FPS counter
    frameCount++;
    if (currentTime - lastFpsUpdate >= 1000) {
        currentFps = Math.round(frameCount * 1000 / (currentTime - lastFpsUpdate));
        fpsCounter.textContent = `FPS: ${currentFps}`;
        frameCount = 0;
        lastFpsUpdate = currentTime;
    }

    // Limit rendering to target framerate to reduce CPU/GPU load when static
    if (currentTime - lastRenderTime < renderInterval && !needsRender) {
        requestAnimationFrame(update);
        return;
    }
    lastRenderTime = currentTime;
    
    // Reset render flag after rendering
    needsRender = false;

    // 1. Update Camera Heading (Left/Right arrows)
    if (inputState.left) {
        cameraHeading -= cameraTurnSpeed * deltaTime;
        playerHeading -= cameraTurnSpeed * deltaTime;
        updateDirectionVectors();
        needsRender = true;
    }
    if (inputState.right) {
        cameraHeading += cameraTurnSpeed * deltaTime;
        playerHeading += cameraTurnSpeed * deltaTime;
        updateDirectionVectors();
        needsRender = true;
    }
    cameraHeading = Cesium.Math.zeroToTwoPi(cameraHeading);
    playerHeading = Cesium.Math.zeroToTwoPi(playerHeading);

    // 2. Update Camera Pitch (Up/Down arrows)
    if (inputState.up) {
        cameraPitch += cameraTurnSpeed * deltaTime;
        needsRender = true;
    }
    if (inputState.down) {
        cameraPitch -= cameraTurnSpeed * deltaTime;
        needsRender = true;
    }
    cameraPitch = Cesium.Math.clamp(cameraPitch, -Cesium.Math.PI_OVER_TWO + 0.05, Cesium.Math.toRadians(groundHeight));

    // 3. Check for collision with buildings at the current position
    let currentGroundHeight = groundHeight;
    if (osmBuildingsTileset && osmBuildingsTileset.ready) {
        const buildingHeight = CollisionSystem.checkCollision(playerPosition);
        if (buildingHeight !== null && buildingHeight > groundHeight) {
            currentGroundHeight = buildingHeight;
        }
    }

    // 4. Handle Jumping and Gravity with improved collision detection
    if (inputState.jump) {
        // Only allow jumping when on a surface
        verticalVelocity = jumpVelocity;
        needsRender = true;
    }

    // Apply gravity
    verticalVelocity += gravity * deltaTime;

    // Calculate predicted next position after gravity
    const predictedNextHeight = playerPosition.height + verticalVelocity * deltaTime;

    // Check for roofs specifically when falling
    let landingHeight = currentGroundHeight;
    if (verticalVelocity < 0 && osmBuildingsTileset && osmBuildingsTileset.ready) {
        // Only check for roofs while falling
        const roofHeight = CollisionSystem.checkForRoofsDuringFall(
            playerPosition, 
            playerPosition.height, 
            predictedNextHeight
        );
        
        if (roofHeight !== null) {
            // We'll hit a roof during this frame
            landingHeight = roofHeight;
        }
    }

    // Update player height
    playerPosition.height += verticalVelocity * deltaTime;
    needsRender = true;

    // Handle landing on surfaces (either ground or roofs)
    if (playerPosition.height <= landingHeight) {
        // We've hit a surface (roof or ground)
        playerPosition.height = landingHeight;
        verticalVelocity = 0;
        
        // Log where we landed
        if (landingHeight > groundHeight + minimumBuildingHeightOffset) {
            console.log(`Landed on roof at height: ${landingHeight.toFixed(2)}m`);
        } else {
            console.log(`Landed on ground at height: ${landingHeight.toFixed(2)}m`);
        }
    }

    // 5. Update Player Position (W/S/A/D) using direction vectors
    const moveAmount = playerMoveSpeed * deltaTime;
    let moveDirection = new Cesium.Cartesian3(0, 0, 0);
    const playerWorldPos = Cesium.Cartesian3.fromRadians(playerPosition.longitude, playerPosition.latitude, playerPosition.height);
    const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(playerWorldPos);

    // Handle forward/backward movement
    if (inputState.forward || inputState.backward) {
        const direction = inputState.forward ? 1 : -1;
        moveDirection.x += forwardDirection.x * direction;
        moveDirection.y += forwardDirection.y * direction;
        needsRender = true;
    }
    
    // Handle strafing (left/right sideways movement)
    if (inputState.strafeLeft || inputState.strafeRight) {
        const direction = inputState.strafeLeft ? -1 : 1;
        moveDirection.x += rightDirection.x * direction;
        moveDirection.y += rightDirection.y * direction;
        needsRender = true;
    }
    
    // Apply movement if any direction keys are pressed
    if (inputState.forward || inputState.backward || inputState.strafeLeft || inputState.strafeRight) {
        Cesium.Cartesian3.normalize(moveDirection, moveDirection);
        Cesium.Cartesian3.multiplyByScalar(moveDirection, moveAmount, moveDirection);

        const moveECEF = Cesium.Matrix4.multiplyByPointAsVector(enuTransform, moveDirection, new Cesium.Cartesian3());
        const newWorldPos = Cesium.Cartesian3.add(playerWorldPos, moveECEF, new Cesium.Cartesian3());
        const newCartographic = Cesium.Cartographic.fromCartesian(newWorldPos);
        
        // Store old position in case we need to revert due to collision
        const oldLongitude = playerPosition.longitude;
        const oldLatitude = playerPosition.latitude;
        
        // Update position
        playerPosition.longitude = newCartographic.longitude;
        playerPosition.latitude = newCartographic.latitude;
        
        // Check if new position has a different ground height
        if (osmBuildingsTileset && osmBuildingsTileset.ready) {
            const newGroundHeight = CollisionSystem.checkCollision(playerPosition);
            
            // Modified to allow smoother movement on building roofs
            const heightDifference = newGroundHeight - currentGroundHeight;
            const isWalking = Math.abs(playerPosition.height - currentGroundHeight) < 1.0; // Increased tolerance
            
            if (isWalking && heightDifference > 5.0) {
                // Revert the position change - we hit a wall
                playerPosition.longitude = oldLongitude;
                playerPosition.latitude = oldLatitude;
            } else if (isWalking && newGroundHeight > currentGroundHeight) {
                // Step up onto slightly higher ground
                playerPosition.height = newGroundHeight;
            }
        }
    }

    // Only update tileset visibility if we moved enough to matter
    if (needsRender) {
        // Update the visibility of 3D tiles based on player position
        updateTilesetVisibility(playerPosition);
        
        // Update frustum culling if enabled
        if (enableFrustumCulling) {
            FrustumCuller.update();
        }
    }

    // 6. Position Camera Behind Player
    const targetWorldPosition = Cesium.Cartesian3.fromRadians(playerPosition.longitude, playerPosition.latitude, playerPosition.height);
    cesiumCamera.setView({
        destination: targetWorldPosition,
        orientation: { heading: cameraHeading, pitch: cameraPitch, roll: 0.0 }
    });
    cesiumCamera.moveBackward(cameraDistance);

    // 7. Update Player Mesh Orientation
    three.playerMesh.rotation.y = -playerHeading;

    // 8. Sync Three.js Camera
    three.renderer.clear();
    three.camera.projectionMatrix.fromArray(cesiumCamera.frustum.projectionMatrix);
    three.camera.matrixWorldInverse.fromArray(cesiumCamera.viewMatrix);
    three.camera.matrixWorld.copy(three.camera.matrixWorldInverse).invert();

    // 9. Render
    viewer.render();
    three.renderer.render(three.scene, three.camera);

    // 10. Update Instructions with enhanced building info
    const onBuilding = currentGroundHeight > groundHeight + 0.1 
        ? ` (On Building: ${(currentGroundHeight - groundHeight).toFixed(1)}m high)` 
        : "";
    instructionsElement.innerHTML = `W/S: Move Forward/Backward<br>A/D: Strafe Left/Right<br>Arrow Keys: Move Camera<br>Space: Jump (Infinite)<br>Facing: ${getDirection(playerHeading)}${onBuilding}`;

    requestAnimationFrame(update);
}

initThree();
setupInputListeners();
loadOsmBuildings();
updateDirectionVectors();

const initialTargetWorldPos = Cesium.Cartesian3.fromRadians(playerPosition.longitude, playerPosition.latitude, playerPosition.height);
cesiumCamera.setView({
    destination: initialTargetWorldPos,
    orientation: { heading: cameraHeading, pitch: cameraPitch, roll: 0.0 }
});
cesiumCamera.moveBackward(cameraDistance);

requestAnimationFrame(update);

window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    three.renderer.setSize(width, height);
    three.camera.aspect = width / height;
    three.camera.updateProjectionMatrix();
    needsRender = true; // Force a render after resize
});