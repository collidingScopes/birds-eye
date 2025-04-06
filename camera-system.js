/**
 * CameraSystem class
 * Manages camera positioning, orientation, and controls for third-person view
 */
export class CameraSystem {
    /**
     * Creates a new camera system
     * @param {Object} cesiumCamera - The Cesium camera instance
     * @param {Object} threeCamera - The Three.js camera instance
     * @param {number} defaultDistance - The default distance from player to camera
     * @param {number} defaultHeight - The default height offset for the camera
     */
    constructor(cesiumCamera, threeCamera, defaultDistance = 8.0, defaultHeight = 2.0) {
        this.cesiumCamera = cesiumCamera;
        this.threeCamera = threeCamera;
        this.cameraDistance = defaultDistance;
        this.cameraHeight = defaultHeight;

        // Camera controls
        this.cameraHeading = 0.0; // Radians, clockwise from North
        this.cameraPitch = Cesium.Math.toRadians(-15.0); // Initial look-down angle

        // Frame of reference transforms
        this.playerWorldPos = new Cesium.Cartesian3();
        this.enuTransform = new Cesium.Matrix4();
        this.cameraWorldPos = new Cesium.Cartesian3();
    }

    /**
     * Updates the camera position and orientation based on player position
     * @param {Object} playerPosition - Cartographic position (longitude, latitude, height)
     * @param {number} playerHeading - Player heading in radians (used for context, camera uses its own heading)
     * @param {Object} forwardDirection - Normalized forward direction vector (not directly used here, but passed)
     */
    update(playerPosition, playerHeading, forwardDirection) {
        // 1. Calculate player position in world coordinates
        this.playerWorldPos = Cesium.Cartesian3.fromRadians(
            playerPosition.longitude,
            playerPosition.latitude,
            playerPosition.height
        );

        // 2. Get the local ENU frame at player position
        // This transform gives us the orientation (East, North, Up axes) and origin at the player
        this.enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(this.playerWorldPos);

        // 3. Calculate camera offset in local ENU frame based on camera heading/pitch
        const headingOffset = Math.PI; // 180 degrees to position behind the player relative to camera heading

        // Calculate camera position using spherical coordinates relative to player
        const horizontalDistance = this.cameraDistance * Math.cos(this.cameraPitch);
        const verticalDistance = this.cameraDistance * Math.sin(-this.cameraPitch); // Pitch up moves camera down relative to horizon

        // Offset relative to the player's local ENU frame, using camera's heading
        const offsetX = horizontalDistance * Math.sin(this.cameraHeading + headingOffset); // East component
        const offsetY = horizontalDistance * Math.cos(this.cameraHeading + headingOffset); // North component
        const offsetZ = this.cameraHeight + verticalDistance; // Up component (base height + pitch adjustment)

        const cameraOffsetENU = new Cesium.Cartesian3(offsetX, offsetY, offsetZ);

        // 4. Transform the local offset vector to world coordinates (ECEF vector)
        // We use multiplyByPointAsVector because it's an offset, not a position
        const cameraOffsetECEF = Cesium.Matrix4.multiplyByPointAsVector(
            this.enuTransform,
            cameraOffsetENU,
            new Cesium.Cartesian3()
        );

        // 5. Add the ECEF offset to the player's world position to get the camera's world position
        this.cameraWorldPos = Cesium.Cartesian3.add(
            this.playerWorldPos,
            cameraOffsetECEF,
            new Cesium.Cartesian3()
        );

        // 6. Position the Cesium camera
        this.cesiumCamera.position = this.cameraWorldPos;

        // 7. Orient the Cesium camera to look at the player
        // Calculate the direction vector from camera to player
        const directionToPlayer = Cesium.Cartesian3.subtract(
            this.playerWorldPos,
            this.cameraWorldPos,
            new Cesium.Cartesian3()
        );
        Cesium.Cartesian3.normalize(directionToPlayer, directionToPlayer);

        // Calculate the 'up' vector for the camera in world space.
        // This should generally align with the local 'up' at the player's position.
        const upVector = Cesium.Matrix4.multiplyByPointAsVector(
            this.enuTransform,
            new Cesium.Cartesian3(0, 0, 1), // Local UP vector in ENU
            new Cesium.Cartesian3()
        );
        Cesium.Cartesian3.normalize(upVector, upVector);

        // Set camera orientation directly using direction and up
        this.cesiumCamera.direction = directionToPlayer;
        this.cesiumCamera.up = upVector;

        // Cesium automatically calculates the 'right' vector based on direction and up
        this.cesiumCamera.right = Cesium.Cartesian3.cross(
            directionToPlayer,
            upVector,
            new Cesium.Cartesian3()
        );
        Cesium.Cartesian3.normalize(this.cesiumCamera.right, this.cesiumCamera.right);


        // 8. Synchronize Three.js camera with Cesium camera
        this.syncThreeCamera();
    }

    /**
     * Synchronizes the Three.js camera with the Cesium camera
     */
    syncThreeCamera() {
        if (this.threeCamera) {
            // Get Cesium's view and projection matrices
            const cvm = this.cesiumCamera.viewMatrix;
            const cpm = this.cesiumCamera.frustum.projectionMatrix;

            // Apply to Three.js camera
            this.threeCamera.matrixWorldInverse.fromArray(cvm); // View matrix is inverse of world matrix
            this.threeCamera.projectionMatrix.fromArray(cpm);

            // Calculate world matrix from inverse view matrix
            this.threeCamera.matrixWorld.copy(this.threeCamera.matrixWorldInverse).invert();

            // Disable automatic matrix updates for the Three.js camera
            this.threeCamera.matrixAutoUpdate = false;
        }
    }

    /**
     * Updates camera controls based on input
     * @param {Object} inputState - The current input state
     * @param {number} deltaTime - Time since last frame in seconds
     * @param {number} turnSpeed - Camera turn speed in radians per second
     * @returns {boolean} True if camera orientation changed
     */
    updateControls(inputState, deltaTime, turnSpeed) {
        let changed = false;

        // Update heading based on left/right input (Arrow Keys)
        if (inputState.left) {
            this.cameraHeading -= turnSpeed * deltaTime; // CCW rotation decreases heading
            changed = true;
        }
        if (inputState.right) {
            this.cameraHeading += turnSpeed * deltaTime; // CW rotation increases heading
            changed = true;
        }

        // Normalize heading to [0, 2π)
        if (changed) {
            const twoPi = 2.0 * Math.PI;
            this.cameraHeading = ((this.cameraHeading % twoPi) + twoPi) % twoPi;
        }

        // Update pitch based on up/down input (Arrow Keys)
        if (inputState.up) {
            this.cameraPitch += turnSpeed * deltaTime;
            changed = true;
        }
        if (inputState.down) {
            this.cameraPitch -= turnSpeed * deltaTime;
            changed = true;
        }

        // Clamp pitch to reasonable range for RPG-style camera
        if (changed) {
            this.cameraPitch = Cesium.Math.clamp(
                this.cameraPitch,
                Cesium.Math.toRadians(-60.0), // Allow looking down more
                Cesium.Math.toRadians(30.0)   // Allow looking up a bit
            );
        }

        return changed;
    }

    /**
     * Gets the current camera heading
     * @returns {number} Camera heading in radians
     */
    getHeading() {
        return this.cameraHeading;
    }

    /**
     * Gets the current camera pitch
     * @returns {number} Camera pitch in radians
     */
    getPitch() {
        return this.cameraPitch;
    }

    /**
     * Gets the ENU transform matrix at player position
     * @returns {Cesium.Matrix4} The ENU transform matrix
     */
    getEnuTransform() {
        // Ensure the transform is up-to-date if called externally
        // If update() hasn't run recently, this might be stale
        // Consider recalculating if needed, or ensure update() runs first
        return this.enuTransform;
    }

    /**
     * Sets the camera distance from the player
     * @param {number} distance - New camera distance
     */
    setDistance(distance) {
        this.cameraDistance = Math.max(1.0, distance); // Ensure minimum distance
    }

    /**
     * Sets the camera height offset above the player
     * @param {number} height - New camera height offset
     */
    setHeight(height) {
        this.cameraHeight = height;
    }

    /**
     * Teleports the camera to look at a new player position
     * Used when changing cities or resetting position
     * @param {Object} playerPosition - New player position in cartographic coordinates
     * @param {number} heading - New desired camera heading in radians
     * @param {number} duration - Flight duration in seconds (0 for instant)
     */
    teleport(playerPosition, heading, duration = 0) {
        // Reset camera orientation based on provided heading
        this.cameraHeading = heading;
        this.cameraPitch = Cesium.Math.toRadians(-15.0); // Reset pitch to default

        // Calculate target player world position
        const targetPlayerWorldPos = Cesium.Cartesian3.fromRadians(
            playerPosition.longitude,
            playerPosition.latitude,
            playerPosition.height
        );

        // Get ENU transform at the target location
        const targetEnuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(targetPlayerWorldPos);

        // Calculate camera offset in local ENU frame at the target location
        const headingOffset = Math.PI;
        const horizontalDistance = this.cameraDistance * Math.cos(this.cameraPitch);
        const verticalDistance = this.cameraDistance * Math.sin(-this.cameraPitch);
        const offsetX = horizontalDistance * Math.sin(this.cameraHeading + headingOffset);
        const offsetY = horizontalDistance * Math.cos(this.cameraHeading + headingOffset);
        const offsetZ = this.cameraHeight + verticalDistance;
        const cameraOffsetENU = new Cesium.Cartesian3(offsetX, offsetY, offsetZ);

        // Transform the offset to world coordinates (ECEF vector)
        const cameraOffsetECEF = Cesium.Matrix4.multiplyByPointAsVector(
            targetEnuTransform,
            cameraOffsetENU,
            new Cesium.Cartesian3()
        );

        // Calculate final camera position in world coordinates
        const finalCameraPos = Cesium.Cartesian3.add(
            targetPlayerWorldPos,
            cameraOffsetECEF,
            new Cesium.Cartesian3()
        );

        // Calculate the direction the camera should face (towards the player)
        const finalDirection = Cesium.Cartesian3.subtract(
            targetPlayerWorldPos,
            finalCameraPos,
            new Cesium.Cartesian3()
        );
        Cesium.Cartesian3.normalize(finalDirection, finalDirection);

        // Calculate the up vector at the target location
        const finalUp = Cesium.Matrix4.multiplyByPointAsVector(
            targetEnuTransform,
            new Cesium.Cartesian3(0, 0, 1),
            new Cesium.Cartesian3()
        );
        Cesium.Cartesian3.normalize(finalUp, finalUp);

        if (duration > 0) {
            // Use flyTo for smooth transition
            this.cesiumCamera.flyTo({
                destination: finalCameraPos,
                orientation: {
                    direction: finalDirection,
                    up: finalUp
                },
                duration: duration,
                complete: () => {
                     // Ensure internal state matches after flight
                     this.update(playerPosition, heading, {}); // Run update to sync internal vars
                },
                cancel: () => {
                     // Ensure internal state matches if flight is cancelled
                     this.update(playerPosition, heading, {});
                }
            });
        } else {
            // Set camera position and orientation directly for instant teleport
            this.cesiumCamera.position = finalCameraPos;
            this.cesiumCamera.direction = finalDirection;
            this.cesiumCamera.up = finalUp;
            this.cesiumCamera.right = Cesium.Cartesian3.cross(finalDirection, finalUp, new Cesium.Cartesian3());
            Cesium.Cartesian3.normalize(this.cesiumCamera.right, this.cesiumCamera.right);

            // Update internal state and sync Three.js camera
            this.update(playerPosition, heading, {});
        }
    }
}