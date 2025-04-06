// --- Constants ---
export const playerMoveSpeed = 100.0;
export const cameraTurnSpeed = 2.0;
export const cameraDistance = 0.0;
export const jumpVelocity = 50;
export const gravity = -50.0;
export const groundHeight = 10.0; // Base height when not on a building

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
 * @param {Object} forwardDirection - Forward direction vector to update
 * @param {Object} rightDirection - Right direction vector to update
 */
export function updateDirectionVectors(playerHeading, forwardDirection, rightDirection) {
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
 * @param {Object} inputState - Input state object
 * @param {Object} playerPosition - Player position object
 * @param {number} verticalVelocity - Reference to vertical velocity
 * @param {number} playerHeading - Reference to player heading
 * @param {number} cameraHeading - Reference to camera heading
 * @param {number} cameraPitch - Reference to camera pitch
 * @param {Function} updateDirectionVectors - Direction vectors update function
 * @param {Object} forwardDirection - Forward direction vector
 * @param {Object} rightDirection - Right direction vector
 * @param {Object} cities - City coordinates object
 * @param {Object} viewer - Cesium viewer instance
 * @param {Object} miniMap - Minimap instance
 */
export function setupInputListeners(inputState, playerPosition, verticalVelocity, playerHeading, cameraHeading, 
                              cameraPitch, updateDirectionVectors, forwardDirection, rightDirection, 
                              cities, viewer, miniMap) {
    const citySelector = document.getElementById('citySelector');
                                
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
            playerPosition.longitude = Cesium.Math.toRadians(cityCoords.longitude);
            playerPosition.latitude = Cesium.Math.toRadians(cityCoords.latitude);
            playerPosition.height = groundHeight;
            
            // Reset other player state
            verticalVelocity = 0;
            playerHeading = Cesium.Math.toRadians(0.0); // Reset heading to North
            cameraHeading = Cesium.Math.toRadians(0.0);
            cameraPitch = Cesium.Math.toRadians(-15.0); // Reset pitch
            updateDirectionVectors(playerHeading, forwardDirection, rightDirection); // Update vectors for new heading

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
                viewer.camera.setView({ 
                    destination: currentTargetPos, 
                    orientation: {
                        heading: cameraHeading, 
                        pitch: cameraPitch, 
                        roll: 0.0
                    }
                });
                viewer.camera.moveBackward(cameraDistance);
                
                // Force render after camera adjustment
                const needsRender = true;
            }, 1600); // Wait slightly longer than flight duration
        }
    });
}