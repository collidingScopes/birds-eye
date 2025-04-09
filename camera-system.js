/**
 * CameraSystem class
 * Manages camera positioning, orientation, and controls for both first-person and third-person views
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
        
        // Player offset reference point - this is what we'll aim the camera at
        this.playerReferenceHeight = 0; // Height of the player's "eyes" or reference point above ground
        
        // Animation state
        this.isAnimating = false;
        
        // First-person camera settings
        this.isFirstPerson = false; // Default to third-person view
        this.firstPersonHeight = 1.7; // Height offset for first-person camera (eye level)
        this.firstPersonForwardOffset = 0.5; // Small forward offset to avoid seeing player model
        
        // Store reference to player mesh
        this.playerMesh = null;
    }

    /**
     * Updates the camera position and orientation based on player position
     * @param {Object} playerPosition - Cartographic position (longitude, latitude, height)
     * @param {number} playerHeading - Player heading in radians
     * @param {Object} forwardDirection - Normalized forward direction vector
     */
    update(playerPosition, playerHeading, forwardDirection) {
        // Store the player heading for use in setting camera direction
        this.playerHeading = playerHeading;
        // Skip normal updates if an animation is in progress
        if (this.isAnimating) return;
        
        // 1. Calculate player position in world coordinates
        const playerWorldPos = Cesium.Cartesian3.fromRadians(
            playerPosition.longitude,
            playerPosition.latitude,
            playerPosition.height
        );

        // 2. Get the local ENU frame at player position
        const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(playerWorldPos);

        // Create a consistent reference point that's always at the player's "eye level"
        const playerReferencePoint = Cesium.Matrix4.multiplyByPoint(
            enuTransform,
            new Cesium.Cartesian3(0, 0, this.playerReferenceHeight),
            new Cesium.Cartesian3()
        );

        if (this.isFirstPerson) {
            // First-person camera positioning
            // Place camera at player eye level
            const fpsCameraPos = Cesium.Matrix4.multiplyByPoint(
                enuTransform,
                // Add a small forward offset to avoid seeing the player model
                new Cesium.Cartesian3(
                    this.firstPersonForwardOffset * Math.sin(this.playerHeading),
                    this.firstPersonForwardOffset * Math.cos(this.playerHeading),
                    this.firstPersonHeight
                ),
                new Cesium.Cartesian3()
            );
            
            this.cesiumCamera.position = fpsCameraPos;
            
            // In first-person mode, we need to use playerHeading (not cameraHeading)
            // This is because in third-person, cameraHeading points AT the player
            // While in first-person, we want to look in the direction the player faces
            const fpsDirENU = new Cesium.Cartesian3(
                Math.sin(this.playerHeading),
                Math.cos(this.playerHeading),
                Math.sin(this.cameraPitch)
            );
            
            const fpsDirection = Cesium.Matrix4.multiplyByPointAsVector(
                enuTransform,
                fpsDirENU,
                new Cesium.Cartesian3()
            );
            Cesium.Cartesian3.normalize(fpsDirection, fpsDirection);
            
            const upVector = Cesium.Matrix4.multiplyByPointAsVector(
                enuTransform,
                new Cesium.Cartesian3(0, 0, 1),
                new Cesium.Cartesian3()
            );
            Cesium.Cartesian3.normalize(upVector, upVector);
            
            this.cesiumCamera.direction = fpsDirection;
            this.cesiumCamera.up = upVector;
            this.cesiumCamera.right = Cesium.Cartesian3.cross(
                fpsDirection,
                upVector,
                new Cesium.Cartesian3()
            );
            Cesium.Cartesian3.normalize(this.cesiumCamera.right, this.cesiumCamera.right);
        } else {
            // Original third-person camera positioning code
            // 3. Calculate camera offset in local ENU frame
            // Use spherical coordinates to position the camera at a fixed distance
            const horizontalDistance = this.cameraDistance * Math.cos(this.cameraPitch);
            const verticalDistance = this.cameraDistance * Math.sin(this.cameraPitch);

            const offsetX = horizontalDistance * Math.sin(this.cameraHeading); // East
            const offsetY = horizontalDistance * Math.cos(this.cameraHeading); // North
            const offsetZ = verticalDistance; // Up - relative to player reference height

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

            // 6. Orient camera to look at player's reference point (not ground position)
            const directionToPlayer = Cesium.Cartesian3.subtract(
                playerReferencePoint,
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
        }

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

            if (this.isFirstPerson) {
                // In first-person mode, position camera at origin (player model will be hidden)
                this.threeCamera.position.set(0, 0, this.firstPersonHeight);
                
                // In first-person mode, use player heading for direction
                // Create vectors using this.threeCamera's constructor to avoid direct THREE reference
                const lookDir = {
                    x: Math.sin(this.playerHeading),
                    y: Math.cos(this.playerHeading),
                    z: Math.sin(this.cameraPitch)
                };
                
                // Calculate look target point
                const lookTarget = {
                    x: this.threeCamera.position.x + lookDir.x,
                    y: this.threeCamera.position.y + lookDir.y,
                    z: this.threeCamera.position.z + lookDir.z
                };
                
                this.threeCamera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z);
            } else {
                // Original third-person camera positioning
                // Position camera using spherical coordinates to maintain fixed orbital distance
                const horizontalDistance = this.cameraDistance * Math.cos(this.cameraPitch);
                const verticalDistance = this.cameraDistance * Math.sin(this.cameraPitch);

                this.threeCamera.position.set(
                    horizontalDistance * Math.sin(this.cameraHeading),
                    horizontalDistance * Math.cos(this.cameraHeading),
                    verticalDistance
                );
                
                // Look at the player's reference point, not the origin
                this.threeCamera.lookAt(0, 0, this.playerReferenceHeight);
            }
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
        // Skip control updates if an animation is in progress
        if (this.isAnimating) return { changed: false };
        
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

        // Handle pitch differently based on camera mode
        if (this.isFirstPerson) {
            // First-person mode: up = look up, down = look down (inverse of third-person)
            if (inputState.up) {
                this.cameraPitch += turnSpeed * deltaTime * 0.7;
                changed = true;
            }
            if (inputState.down) {
                this.cameraPitch -= turnSpeed * deltaTime * 0.7;
                changed = true;
            }
        } else {
            // Third-person mode: keep existing behavior
            if (inputState.up) {
                this.cameraPitch -= turnSpeed * deltaTime * 0.7;
                changed = true;
            }
            if (inputState.down) {
                this.cameraPitch += turnSpeed * deltaTime * 0.7;
                changed = true;
            }
        }

        if (changed) {
            this.cameraPitch = Cesium.Math.clamp(
                this.cameraPitch,
                Cesium.Math.toRadians(-45.0),
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
     * Toggles between first-person and third-person camera views
     * @param {Object} playerMesh - The player mesh object (optional)
     * @returns {boolean} New camera mode (true = first-person, false = third-person)
     */
    toggleCameraMode(playerMesh = null) {
        const previousMode = this.isFirstPerson;
        this.isFirstPerson = !this.isFirstPerson;
        
        // When switching between modes, adjust the pitch to maintain the same view direction
        if (previousMode === false && this.isFirstPerson === true) {
            // Switching from third-person to first-person
            // Invert the pitch to maintain the same vertical viewing direction
            this.cameraPitch = -this.cameraPitch;
        } else if (previousMode === true && this.isFirstPerson === false) {
            // Switching from first-person to third-person
            // Invert the pitch again when switching back
            this.cameraPitch = -this.cameraPitch;
        }
        
        // Store the player mesh if provided
        if (playerMesh) {
            this.playerMesh = playerMesh;
        }
        
        return this.isFirstPerson;
    }

    /**
     * Gets the current camera mode
     * @returns {boolean} Current camera mode (true = first-person, false = third-person)
     */
    getIsFPSMode() {
        return this.isFirstPerson;
    }

    /**
     * Teleports the camera to a new position
     * @param {Object} playerPosition - New player position in cartographic coordinates
     * @param {number} playerHeading - New player heading in radians
     * @param {number} customPitch - Optional custom pitch angle in radians
     * @param {boolean} useAnimation - Whether to use space flight animation
     * @returns {Promise} Promise that resolves when teleport is complete
     */
    teleport(playerPosition, playerHeading, customPitch = null, useAnimation = false) {
        return new Promise((resolve) => {
            // If using animation and we have an animation system, delegate to it
            if (useAnimation && this.spaceFlightAnimation) {
                // Animation will be handled by the SpaceFlightAnimation class
                // This will be set up in main.js
                resolve();
                return;
            }
            
            // Standard teleport (no animation)
            this.cameraHeading = (playerHeading + Math.PI) % (2 * Math.PI);
            
            // Only reset pitch if customPitch is provided
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

            // Create the player reference point at eye level
            const playerReferencePoint = Cesium.Matrix4.multiplyByPoint(
                targetEnuTransform,
                new Cesium.Cartesian3(0, 0, this.playerReferenceHeight),
                new Cesium.Cartesian3()
            );

            if (this.isFirstPerson) {
                // First-person teleport
                const fpsCameraPos = Cesium.Matrix4.multiplyByPoint(
                    targetEnuTransform,
                    new Cesium.Cartesian3(
                        this.firstPersonForwardOffset * Math.sin(playerHeading),
                        this.firstPersonForwardOffset * Math.cos(playerHeading),
                        this.firstPersonHeight
                    ),
                    new Cesium.Cartesian3()
                );
                
                // Set camera position for first-person view
                this.cesiumCamera.position = fpsCameraPos;
                
                // Set direction based on player heading and pitch
                const fpsDirENU = new Cesium.Cartesian3(
                    Math.sin(playerHeading),
                    Math.cos(playerHeading),
                    Math.sin(this.cameraPitch)
                );
                
                const fpsDirection = Cesium.Matrix4.multiplyByPointAsVector(
                    targetEnuTransform,
                    fpsDirENU,
                    new Cesium.Cartesian3()
                );
                Cesium.Cartesian3.normalize(fpsDirection, fpsDirection);
                
                const upVector = Cesium.Matrix4.multiplyByPointAsVector(
                    targetEnuTransform,
                    new Cesium.Cartesian3(0, 0, 1),
                    new Cesium.Cartesian3()
                );
                Cesium.Cartesian3.normalize(upVector, upVector);
                
                this.cesiumCamera.direction = fpsDirection;
                this.cesiumCamera.up = upVector;
                this.cesiumCamera.right = Cesium.Cartesian3.cross(
                    fpsDirection,
                    upVector,
                    new Cesium.Cartesian3()
                );
                Cesium.Cartesian3.normalize(this.cesiumCamera.right, this.cesiumCamera.right);
            } else {
                // Original third-person teleport code
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

                // Direct the camera to look at the player's reference point
                const finalDirection = Cesium.Cartesian3.subtract(
                    playerReferencePoint,
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
            }
            
            this.syncThreeCamera();
            
            resolve();
        });
    }
    
    /**
     * Sets the space flight animation system
     * @param {Object} spaceFlightAnimation - Space flight animation instance
     */
    setSpaceFlightAnimation(spaceFlightAnimation) {
        this.spaceFlightAnimation = spaceFlightAnimation;
    }
    
    /**
     * Sets the animation state
     * @param {boolean} isAnimating - Whether animation is in progress
     */
    setAnimatingState(isAnimating) {
        this.isAnimating = isAnimating;
    }
}