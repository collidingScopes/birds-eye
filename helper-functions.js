export const playerMoveSpeed = 100.0;
export const cameraTurnSpeed = 1.5;
export const jumpVelocity = 50;
export const gravity = -50.0;
export const groundHeight = 0.5;

// City Coordinates
export const cities = {
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
 * @param {Object} citiesData - City coordinates object
 * @param {Object} cesiumViewer - Cesium viewer instance
 * @param {Object} miniMapInstance - Minimap instance
 * @param {Object} cameraSystemInstance - Camera system instance
 */
export function setupInputListeners(inputState, playerPosition, verticalVelocityRef, playerHeadingRef,
    updateDirectionVectorsFunc, forwardDirection, rightDirection,
    citiesData, cesiumViewer, miniMapInstance, cameraSystemInstance) {

    const citySelector = document.getElementById('citySelector');

    document.addEventListener('keydown', (event) => {
        const key = event.key.toUpperCase();
        let handled = true; // Flag to prevent default browser actions like scrolling
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
            // Setting jump = false here isn't strictly necessary as it's consumed in update
            // case ' ': inputState.jump = false; break;
        }
    });

    // City selection logic
    citySelector.addEventListener('change', (event) => {
        const selectedCity = event.target.value;
        if (citiesData[selectedCity]) {
            console.log(`Changing city to: ${selectedCity}`);
            const cityCoords = citiesData[selectedCity];

            // Reset player state
            playerPosition.longitude = Cesium.Math.toRadians(cityCoords.longitude);
            playerPosition.latitude = Cesium.Math.toRadians(cityCoords.latitude);
            playerPosition.height = groundHeight + 1.0; // Start slightly above ground

            // Reset physics and orientation state using refs
            verticalVelocityRef.value = 0;
            playerHeadingRef.value = Cesium.Math.toRadians(0.0); // Reset heading to North

            // Update direction vectors for new heading
            updateDirectionVectorsFunc(playerHeadingRef.value, forwardDirection, rightDirection);

            // Reset minimap
            if (miniMapInstance) {
                 miniMapInstance.update(playerPosition, playerHeadingRef.value);
            }

            // Use camera system for teleportation
            if (cameraSystemInstance) {
                // Teleport camera to new position with a smooth flight animation
                // Pass the player heading (which is now North / 0 radians)
                // Camera will position itself behind the player accordingly
                cameraSystemInstance.teleport(playerPosition, playerHeadingRef.value, 1.5); // 1.5 second flight
            } else {
                console.error("Camera System not available for teleport.");
                // Legacy fallback (Consider removing if CameraSystem is always used)
                const targetWorldPos = Cesium.Cartesian3.fromRadians(
                    playerPosition.longitude,
                    playerPosition.latitude,
                    playerPosition.height + 500 // Fly to a point above
                );
                cesiumViewer.camera.flyTo({
                    destination: targetWorldPos,
                    orientation: {
                        heading: playerHeadingRef.value,
                        pitch: Cesium.Math.toRadians(-30.0), // Look down slightly more during flight
                        roll: 0.0
                    },
                    duration: 1.5
                });
            }
             // Indicate loading state while city potentially loads new tiles
            const instructionsElement = document.getElementById('instructions');
            if (instructionsElement) {
                instructionsElement.innerHTML = `Loading ${selectedCity}...`;
            }
        }
    });
}