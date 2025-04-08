/**
 * CameraSystem class - FIXED
 * Manages camera positioning, orientation, and controls for third-person view
 */
export class CameraSystem {
    /**
     * Creates a new camera system
     * @param {Object} cesiumCamera - The Cesium camera instance
     * @param {Object} threeCamera - The Three.js camera instance
     * @param {number} defaultDistance - Default distance from camera to player (optional)
     * @param {number} defaultHeight - Default height offset of camera (optional)
     */
    constructor(cesiumCamera, threeCamera, defaultDistance = 13, defaultHeight = 4) {
        this.cesiumCamera = cesiumCamera;
        this.threeCamera = threeCamera;
        this.cameraDistance = defaultDistance;
        this.cameraHeight = defaultHeight;
        this.initialCameraPitch = 0; //radians

        // Camera controls
        this.cameraHeading = 0.0; // Radians, clockwise from North
        this.cameraPitch = Cesium.Math.toRadians(this.initialCameraPitch); // Initial slight look-down angle
    }

    /**
     * Updates the camera position and orientation based on player position
     * @param {Object} playerPosition - Cartographic position (longitude, latitude, height)
     * @param {number} playerHeading - Player heading in radians
     * @param {Object} forwardDirection - Normalized forward direction vector
     */
    update(playerPosition, playerHeading, forwardDirection) {
        // 1. Calculate player position in world coordinates
        const playerWorldPos = Cesium.Cartesian3.fromRadians(
            playerPosition.longitude,
            playerPosition.latitude,
            playerPosition.height
        );

        // 2. Get the local ENU frame at player position
        const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(playerWorldPos);

        // 3. Calculate camera offset in local ENU frame
        // We want the camera to maintain a fixed orbital distance from the player
        // regardless of pitch angle
        const horizontalDistance = this.cameraDistance * Math.cos(this.cameraPitch);
        const verticalDistance = this.cameraDistance * Math.sin(this.cameraPitch);

        const offsetX = horizontalDistance * Math.sin(this.cameraHeading); // East
        const offsetY = horizontalDistance * Math.cos(this.cameraHeading); // North
        const offsetZ = verticalDistance; // Up - this is purely the vertical component of our spherical coordinate

        const cameraOffsetENU = new Cesium.Cartesian3(offsetX, offsetY, offsetZ);

        // 4. Transform offset to world coordinates
        const cameraOffsetECEF = Cesium.Matrix4.multiplyByPointAsVector(
            enuTransform,
            cameraOffsetENU,
            new Cesium.Cartesian3()
        );

        // 5. Set camera position
        const cameraWorldPos = Cesium.Cartesian3.add(
            playerWorldPos,
            cameraOffsetECEF,
            new Cesium.Cartesian3()
        );
        this.cesiumCamera.position = cameraWorldPos;

        // 6. Orient camera to look at player
        const directionToPlayer = Cesium.Cartesian3.subtract(
            playerWorldPos,
            cameraWorldPos,
            new Cesium.Cartesian3()
        );
        Cesium.Cartesian3.normalize(directionToPlayer, directionToPlayer);

        const upVector = Cesium.Matrix4.multiplyByPointAsVector(
            enuTransform,
            new Cesium.Cartesian3(0, 0, 1),
            new Cesium.Cartesian3()
        );
        Cesium.Cartesian3.normalize(upVector, upVector);

        this.cesiumCamera.direction = directionToPlayer;
        this.cesiumCamera.up = upVector;
        this.cesiumCamera.right = Cesium.Cartesian3.cross(
            directionToPlayer,
            upVector,
            new Cesium.Cartesian3()
        );
        Cesium.Cartesian3.normalize(this.cesiumCamera.right, this.cesiumCamera.right);

        // 7. Synchronize Three.js camera
        this.syncThreeCamera();
    }

    /**
     * Synchronizes the Three.js camera with the Cesium camera
     */
    syncThreeCamera() {
        if (this.threeCamera) {
            const cvm = this.cesiumCamera.viewMatrix;
            const cpm = this.cesiumCamera.frustum.projectionMatrix;

            this.threeCamera.projectionMatrix.fromArray(cpm);
            this.threeCamera.projectionMatrixInverse.copy(this.threeCamera.projectionMatrix).invert();

            const cesiumFrustum = this.cesiumCamera.frustum;
            if (cesiumFrustum.fov) {
                this.threeCamera.fov = Cesium.Math.toDegrees(cesiumFrustum.fov);
            }
            if (cesiumFrustum.near) this.threeCamera.near = cesiumFrustum.near;
            if (cesiumFrustum.far) this.threeCamera.far = cesiumFrustum.far;
            this.threeCamera.updateProjectionMatrix();

            // Position camera using spherical coordinates to maintain fixed orbital distance
            // Calculate the proper position in local space using the orbital distance
            const horizontalDistance = this.cameraDistance * Math.cos(this.cameraPitch);
            const verticalDistance = this.cameraDistance * Math.sin(this.cameraPitch);

            this.threeCamera.position.set(
                horizontalDistance * Math.sin(this.cameraHeading),
                horizontalDistance * Math.cos(this.cameraHeading),
                verticalDistance
            );
            this.threeCamera.lookAt(0, 0, 0);
        }
    }

    /**
     * Updates camera controls based on input
     * @param {Object} inputState - The current input state
     * @param {number} deltaTime - Time since last frame in seconds
     * @param {number} turnSpeed - Camera turn speed in radians per second
     * @returns {Object} Object containing changed flag
     */
    updateControls(inputState, deltaTime, turnSpeed) {
        let changed = false;

        if (inputState.left) {
            this.cameraHeading -= turnSpeed * deltaTime;
            changed = true;
        }
        if (inputState.right) {
            this.cameraHeading += turnSpeed * deltaTime;
            changed = true;
        }

        if (changed) {
            this.cameraHeading = ((this.cameraHeading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        }

        if (inputState.up) {
            this.cameraPitch -= turnSpeed * deltaTime * 0.7;
            changed = true;
        }
        if (inputState.down) {
            this.cameraPitch += turnSpeed * deltaTime * 0.7;
            changed = true;
        }

        if (changed) {
            this.cameraPitch = Cesium.Math.clamp(
                this.cameraPitch,
                Cesium.Math.toRadians(-20.0),
                Cesium.Math.toRadians(45.0)
            );
        }

        return { changed };
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
     * Teleports the camera to a new position
     * @param {Object} playerPosition - New player position in cartographic coordinates
     * @param {number} playerHeading - New player heading in radians
     * @param {number} duration - Flight duration in seconds (0 for instant)
     */
    teleport(playerPosition, playerHeading, duration, customPitch = null) {
        this.cameraHeading = (playerHeading + Math.PI) % (2 * Math.PI);
        // Only reset pitch if customPitch is not provided
        if (customPitch !== null) {
            this.cameraPitch = customPitch;
        } else {
            this.cameraPitch = Cesium.Math.toRadians(this.initialCameraPitch);
        }

        // Create a copy of the player position to ensure it isn't modified during teleportation
        const teleportPosition = {
            longitude: playerPosition.longitude,
            latitude: playerPosition.latitude,
            height: playerPosition.height
        };

        const targetPlayerWorldPos = Cesium.Cartesian3.fromRadians(
            teleportPosition.longitude,
            teleportPosition.latitude,
            teleportPosition.height
        );

        const targetEnuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(targetPlayerWorldPos);

        const horizontalDistance = this.cameraDistance * Math.cos(this.cameraPitch);
        const verticalDistance = this.cameraDistance * Math.sin(this.cameraPitch);
        const offsetX = horizontalDistance * Math.sin(this.cameraHeading);
        const offsetY = horizontalDistance * Math.cos(this.cameraHeading);
        const offsetZ = verticalDistance;
        const cameraOffsetENU = new Cesium.Cartesian3(offsetX, offsetY, offsetZ);

        const cameraOffsetECEF = Cesium.Matrix4.multiplyByPointAsVector(
            targetEnuTransform,
            cameraOffsetENU,
            new Cesium.Cartesian3()
        );

        const finalCameraPos = Cesium.Cartesian3.add(
            targetPlayerWorldPos,
            cameraOffsetECEF,
            new Cesium.Cartesian3()
        );

        const finalDirection = Cesium.Cartesian3.subtract(
            targetPlayerWorldPos,
            finalCameraPos,
            new Cesium.Cartesian3()
        );
        Cesium.Cartesian3.normalize(finalDirection, finalDirection);

        const finalUp = Cesium.Matrix4.multiplyByPointAsVector(
            targetEnuTransform,
            new Cesium.Cartesian3(0, 0, 1),
            new Cesium.Cartesian3()
        );
        Cesium.Cartesian3.normalize(finalUp, finalUp);

        this.cesiumCamera.position = finalCameraPos;
        this.cesiumCamera.direction = finalDirection;
        this.cesiumCamera.up = finalUp;
        this.cesiumCamera.right = Cesium.Cartesian3.cross(finalDirection, finalUp, new Cesium.Cartesian3());
        Cesium.Cartesian3.normalize(this.cesiumCamera.right, this.cesiumCamera.right);
        this.syncThreeCamera();
    }
}