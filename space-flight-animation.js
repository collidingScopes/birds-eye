/**
 * SpaceFlightAnimation class
 * Creates a cinematic camera transition that flies out to space and back down to a new location
 */
let cameraPitch = -90;
export class SpaceFlightAnimation {
    /**
     * Creates a new space flight animation
     * @param {Object} viewer - The Cesium viewer instance
     * @param {Object} cameraSystem - The camera system 
     * @param {Object} terrainManager - The terrain manager
     * @param {HTMLElement} displayElement - Element to display city names
     */
    constructor(viewer, cameraSystem, terrainManager, displayElement) {
        this.viewer = viewer;
        this.cameraSystem = cameraSystem;
        this.terrainManager = terrainManager;
        this.displayElement = displayElement;
        this.isAnimating = false;
        this.spaceHeight = 2000000; // Maximum height in meters (10,000 km - space altitude)
        this.animationDuration = 12.0; // Animation duration in seconds
        this.currentAnimationStep = 0;

        // Bind methods to this instance
        this.animate = this.animate.bind(this);
    }

    /**
     * Starts the space flight animation to a new destination
     * @param {Object} startPosition - Starting cartographic position
     * @param {Object} targetPosition - Target cartographic position to fly to
     * @param {number} playerHeadingRef - Reference to player heading value
     * @param {Function} updateDirectionVectorsFunc - Function to update direction vectors
     * @param {Object} forwardDirection - Forward direction vector to update
     * @param {Object} rightDirection - Right direction vector to update
     * @param {Object} fallStateRef - Reference to fall state
     * @param {Object} verticalVelocityRef - Reference to vertical velocity
     * @param {Function} onComplete - Callback function when animation completes
     */
    startAnimation(
        startPosition, 
        targetPosition, 
        playerHeadingRef, 
        updateDirectionVectorsFunc,
        forwardDirection,
        rightDirection,
        fallStateRef,
        verticalVelocityRef,
        onComplete
    ) {
        if (this.isAnimating) return;
        
        this.isAnimating = true;
        this.currentAnimationStep = 0;
        this.startPosition = {
            longitude: startPosition.longitude,
            latitude: startPosition.latitude,
            height: startPosition.height
        };
        this.targetPosition = {
            longitude: targetPosition.longitude,
            latitude: targetPosition.latitude,
            height: targetPosition.height
        };
        this.playerHeadingRef = playerHeadingRef;
        this.updateDirectionVectorsFunc = updateDirectionVectorsFunc;
        this.forwardDirection = forwardDirection;
        this.rightDirection = rightDirection;
        this.fallStateRef = fallStateRef;
        this.verticalVelocityRef = verticalVelocityRef;
        this.onComplete = onComplete;
        this.startTime = performance.now();
        
        // Disable standard camera controls during animation
        this.previousCameraControls = {
            enableRotate: this.viewer.scene.screenSpaceCameraController.enableRotate,
            enableTranslate: this.viewer.scene.screenSpaceCameraController.enableTranslate,
            enableZoom: this.viewer.scene.screenSpaceCameraController.enableZoom,
            enableTilt: this.viewer.scene.screenSpaceCameraController.enableTilt,
            enableLook: this.viewer.scene.screenSpaceCameraController.enableLook
        };
        
        // Disable all controls during animation
        this.viewer.scene.screenSpaceCameraController.enableRotate = false;
        this.viewer.scene.screenSpaceCameraController.enableTranslate = false;
        this.viewer.scene.screenSpaceCameraController.enableZoom = false;
        this.viewer.scene.screenSpaceCameraController.enableTilt = false;
        this.viewer.scene.screenSpaceCameraController.enableLook = false;
               
        // Start animation loop
        requestAnimationFrame(this.animate);
    }
    
    /**
     * Gets display name based on coordinates
     * @param {Object} position - Position to check
     * @returns {string|null} City name if found
     */
    getDisplayNameFromCoordinates(position) {
        // Import cities from elsewhere or pass it in
        // For now, just return null and the caller can supply the name
        return null;
    }
    
    /**
     * Animation loop
     * @param {number} time - Current timestamp
     */
    animate(time) {
        if (!this.isAnimating) return;
        
        const elapsed = (time - this.startTime) / 1000; // Convert to seconds
        const progress = Math.min(elapsed / this.animationDuration, 1.0);
        
        // Animation has 3 phases:
        // 1. Rise to space (0-33% of animation)
        // 2. Move across globe (33-67% of animation)
        // 3. Descend to destination (67-100% of animation)
        
        if (progress < 0.2) {
            // Phase 1: Rise to space
            this.currentAnimationStep = 1;
            const riseProgress = progress / 0.2;
            this.animateRiseToSpace(riseProgress);
        } else if (progress < 0.8) {
            // Phase 2: Move across globe
            this.currentAnimationStep = 2;
            const moveProgress = (progress - 0.2) / 0.6;
            this.animateMoveAcrossGlobe(moveProgress);
        } else {
            // Phase 3: Descend to destination
            this.currentAnimationStep = 3;
            const descendProgress = (progress - 0.8) / 0.2;
            this.animateDescendToDestination(descendProgress);
        }
        
        // Continue animation if not finished
        if (progress < 1.0) {
            requestAnimationFrame(this.animate);
        } else {
            this.completeAnimation();
        }
    }
    
    /**
     * Phase 1: Rise to space animation
     * @param {number} progress - Animation progress (0-1)
     */
    animateRiseToSpace(progress) {
        // Easing function for smooth acceleration
        const easedProgress = this.easeOutCubic(progress);
        
        // Calculate current height (from start to space)
        const currentHeight = this.startPosition.height + 
            (this.spaceHeight - this.startPosition.height) * easedProgress;
        
        // Camera position during rise (stays at same longitude/latitude)
        const cameraPosition = {
            longitude: this.startPosition.longitude,
            latitude: this.startPosition.latitude,
            height: currentHeight
        };

        // Keep camera heading consistent
        const cameraHeading = this.cameraSystem.getHeading();
        
        // Update camera
        this.updateCameraForAnimation(cameraPosition, cameraHeading, cameraPitch);
    }
    
    /**
     * Phase 2: Move across globe animation
     * @param {number} progress - Animation progress (0-1)
     */
    animateMoveAcrossGlobe(progress) {
        // Easing function for smooth movement
        const easedProgress = this.easeInOutQuad(progress);
        
        // Interpolate longitude and latitude
        const currentLongitude = this.startPosition.longitude + 
            (this.targetPosition.longitude - this.startPosition.longitude) * easedProgress;
        const currentLatitude = this.startPosition.latitude + 
            (this.targetPosition.latitude - this.startPosition.latitude) * easedProgress;
        
        // Keep altitude in space
        const cameraPosition = {
            longitude: currentLongitude,
            latitude: currentLatitude,
            height: this.spaceHeight
        };

        // Update camera
        this.updateCameraForAnimation(cameraPosition, this.cameraSystem.getHeading(), cameraPitch);
    }
    
    /**
     * Phase 3: Descend to destination animation
     * @param {number} progress - Animation progress (0-1)
     */
    animateDescendToDestination(progress) {
        // Easing function for smooth deceleration
        const easedProgress = this.easeInCubic(progress);
        
        // Calculate current height (from space to dramatic fall height)
        const targetHeight = this.targetPosition.height;
        const currentHeight = this.spaceHeight - 
            (this.spaceHeight - targetHeight) * easedProgress;
        
        // Camera position during descent
        const cameraPosition = {
            longitude: this.targetPosition.longitude,
            latitude: this.targetPosition.latitude,
            height: currentHeight
        };

        const cameraHeading = this.cameraSystem.getHeading();
        
        // Update camera
        this.updateCameraForAnimation(cameraPosition, cameraHeading, cameraPitch);
    }
    
    /**
     * Updates camera during animation
     * @param {Object} position - Cartographic position
     * @param {number} heading - Camera heading in radians
     * @param {number} pitch - Camera pitch in radians
     */
    updateCameraForAnimation(position, heading, pitch) {
        const cesiumCamera = this.viewer.camera;
        
        // Convert cartographic to cartesian
        const worldPos = Cesium.Cartesian3.fromRadians(
            position.longitude,
            position.latitude,
            position.height
        );
        
        // Get ENU frame
        const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(worldPos);
        
        // Calculate view direction based on heading and pitch
        const pitchQuat = Cesium.Quaternion.fromAxisAngle(
            Cesium.Cartesian3.UNIT_X,
            pitch,
            new Cesium.Quaternion()
        );
        
        const headingQuat = Cesium.Quaternion.fromAxisAngle(
            Cesium.Cartesian3.UNIT_Z,
            -heading,
            new Cesium.Quaternion()
        );
        
        const combinedQuat = Cesium.Quaternion.multiply(
            headingQuat,
            pitchQuat,
            new Cesium.Quaternion()
        );
        
        const viewDirLocal = new Cesium.Cartesian3(0, 1, 0); // Forward in local frame
        const viewDir = Cesium.Matrix3.multiplyByVector(
            Cesium.Matrix3.fromQuaternion(combinedQuat),
            viewDirLocal,
            new Cesium.Cartesian3()
        );
        
        // Transform to world coordinates
        const viewDirWorld = Cesium.Matrix4.multiplyByPointAsVector(
            enuTransform,
            viewDir,
            new Cesium.Cartesian3()
        );
        Cesium.Cartesian3.normalize(viewDirWorld, viewDirWorld);
        
        // Set up vector
        const upVectorLocal = new Cesium.Cartesian3(0, 0, 1); // Up in local frame
        const upVectorWorld = Cesium.Matrix4.multiplyByPointAsVector(
            enuTransform,
            upVectorLocal,
            new Cesium.Cartesian3()
        );
        Cesium.Cartesian3.normalize(upVectorWorld, upVectorWorld);
        
        // Set camera position and orientation
        cesiumCamera.position = worldPos;
        cesiumCamera.direction = viewDirWorld;
        cesiumCamera.up = upVectorWorld;
        cesiumCamera.right = Cesium.Cartesian3.cross(
            viewDirWorld,
            upVectorWorld,
            new Cesium.Cartesian3()
        );
        Cesium.Cartesian3.normalize(cesiumCamera.right, cesiumCamera.right);
    }
    
    /**
     * Completes the animation and restores control to the player
     */
    completeAnimation() {
        this.isAnimating = false;
        
        // Reset controls to previous state
        if (this.previousCameraControls) {
            this.viewer.scene.screenSpaceCameraController.enableRotate = 
                this.previousCameraControls.enableRotate;
            this.viewer.scene.screenSpaceCameraController.enableTranslate = 
                this.previousCameraControls.enableTranslate;
            this.viewer.scene.screenSpaceCameraController.enableZoom = 
                this.previousCameraControls.enableZoom;
            this.viewer.scene.screenSpaceCameraController.enableTilt = 
                this.previousCameraControls.enableTilt;
            this.viewer.scene.screenSpaceCameraController.enableLook = 
                this.previousCameraControls.enableLook;
        }
        
        // Update player state to prepare for dramatic fall
        if (this.targetPosition && this.playerHeadingRef) {
            // Update player heading to face north
            this.playerHeadingRef.value = Cesium.Math.toRadians(0.0);
            
            // Update direction vectors
            if (this.updateDirectionVectorsFunc) {
                this.updateDirectionVectorsFunc(
                    this.playerHeadingRef.value,
                    this.forwardDirection,
                    this.rightDirection
                );
            }
            
            // Set up fall state
            if (this.fallStateRef) {
                this.fallStateRef.isInInitialFall = true;
                this.fallStateRef.initialFallComplete = false;
                this.fallStateRef.fallStartTime = performance.now();
            }
            
            // Set initial vertical velocity
            if (this.verticalVelocityRef) {
                this.verticalVelocityRef.value = -10.0;
            }
        }
                
        // Call completion callback
        if (typeof this.onComplete === 'function') {
            this.onComplete();
        }
    }
    
    // Easing Functions
    easeOutCubic(x) {
        return 1 - Math.pow(1 - x, 3);
    }
    
    easeInCubic(x) {
        return x * x * x;
    }
    
    easeInOutQuad(x) {
        return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    }
    
    /**
     * Cancels the current animation
     */
    cancelAnimation() {
        if (!this.isAnimating) return;
        
        this.isAnimating = false;
        
        // Reset controls to previous state
        if (this.previousCameraControls) {
            this.viewer.scene.screenSpaceCameraController.enableRotate = 
                this.previousCameraControls.enableRotate;
            this.viewer.scene.screenSpaceCameraController.enableTranslate = 
                this.previousCameraControls.enableTranslate;
            this.viewer.scene.screenSpaceCameraController.enableZoom = 
                this.previousCameraControls.enableZoom;
            this.viewer.scene.screenSpaceCameraController.enableTilt = 
                this.previousCameraControls.enableTilt;
            this.viewer.scene.screenSpaceCameraController.enableLook = 
                this.previousCameraControls.enableLook;
        }
    }
}