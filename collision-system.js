// collision-system.js
// No changes required for the version upgrade, but added robustness.

// Collision detection parameters
const collisionCheckHeight = 1000.0; // Maximum height ABOVE SURFACE to start the ray
const minimumBuildingHeightOffset = 0.5; // Minimum height difference above terrain to be considered a building/obstacle

// Create a collision detection module
const CollisionSystem = {
    scene: null,
    tileset: null,
    buildingHeightsCache: {}, // Renamed for clarity
    baseGroundHeight: 0,    // Store base ground height provided during init
    initialized: false,

    init: function(scene, tileset, baseGroundHeight) {
        if (!scene || !tileset) {
            console.error("CollisionSystem init failed: Scene or Tileset missing.");
            return;
        }
        this.scene = scene;
        this.tileset = tileset;
        this.baseGroundHeight = baseGroundHeight;
        this.buildingHeightsCache = {}; // Clear cache on re-init
        this.initialized = true;
        console.log("Collision system initialized with base ground height:", baseGroundHeight);
    },

    // Function to get approximate terrain height (simple placeholder)
    // A proper implementation would use viewer.scene.globe.getHeight or sampleTerrainMostDetailed
    getTerrainHeight: function(cartographic) {
        // For this example, we assume the 'baseGroundHeight' is the terrain height
        // In a real app, query Cesium's terrain provider here.
        // Caching a simple base height isn't very useful for actual terrain.
        return this.baseGroundHeight;
    },

    // Function to cast a ray downwards and find the height of the first hit (tileset or terrain)
    castRayAtPosition: function(cartographic, startHeightOffset = collisionCheckHeight) {
        if (!this.initialized || !this.tileset || !this.tileset.ready || !Cesium.defined(cartographic)) {
            // console.warn("CollisionSystem: Cannot cast ray, not initialized or tileset not ready.");
            return this.baseGroundHeight; // Fallback
        }

        // --- RAY CASTING ---
        // 1. Get the point on the ellipsoid (height 0)
        const pointOnEllipsoid = Cesium.Cartesian3.fromRadians(
            cartographic.longitude,
            cartographic.latitude,
            0.0
        );

        // 2. Determine the 'up' direction at that point
        const up = Cesium.Cartesian3.normalize(pointOnEllipsoid, new Cesium.Cartesian3());

        // 3. Calculate the ray start position high above the potential surface
        const rayStart = Cesium.Cartesian3.add(
            pointOnEllipsoid,
            Cesium.Cartesian3.multiplyByScalar(up, this.getTerrainHeight(cartographic) + startHeightOffset, new Cesium.Cartesian3()), // Start relative to estimated terrain
            new Cesium.Cartesian3()
        );

        // 4. Ray direction is straight down (-up)
        const rayDirection = Cesium.Cartesian3.negate(up, new Cesium.Cartesian3());

        const ray = new Cesium.Ray(rayStart, rayDirection);

        // Pick against the specific tileset object for buildings
        // Use scene.drillPick for multiple results if needed
        const results = this.scene.drillPickFromRay(ray, 10, [this.tileset]); // Limit results, check only tileset

        let highestHitHeight = this.getTerrainHeight(cartographic); // Start with terrain height as minimum

        if (Cesium.defined(results) && results.length > 0) {
             // Find the highest intersection point from the drill pick results
             for (let i = 0; i < results.length; i++) {
                 if(results[i].position) {
                     const intersectionCartographic = Cesium.Cartographic.fromCartesian(results[i].position);
                     highestHitHeight = Math.max(highestHitHeight, intersectionCartographic.height);
                 }
             }
        }

        // Consider using scene.pickFromRay if drillPick is slow or overkill
        // const result = this.scene.pickFromRay(ray, [this.tileset]);
        // if (Cesium.defined(result) && Cesium.defined(result.position)) {
        //     const intersectionCartographic = Cesium.Cartographic.fromCartesian(result.position);
        //     highestHitHeight = Math.max(highestHitHeight, intersectionCartographic.height);
        // }


        // We return the highest point found (could be building or just terrain feature within tileset)
        return highestHitHeight;
    },

    // Check for the surface height (building or ground) at the player's current XY location
    checkForSurface: function(cartographic) {
        if (!this.initialized) return this.baseGroundHeight;

        const cacheKey = `${cartographic.longitude.toFixed(6)},${cartographic.latitude.toFixed(6)}`; // Reduced precision slightly

        // Check cache first
        if (this.buildingHeightsCache[cacheKey] !== undefined) {
            return this.buildingHeightsCache[cacheKey];
        }

        // Perform the ray cast from a significant height above
        const surfaceHeight = this.castRayAtPosition(cartographic, collisionCheckHeight);

        // Cache the result
        this.buildingHeightsCache[cacheKey] = surfaceHeight;

        return surfaceHeight;
    },

    // Method to specifically check for roofs between current height and predicted next height when falling
    checkForRoofsDuringFall: function(cartographic, currentActualHeight, predictedNextHeight) {
        if (!this.initialized) return null;

        // Cast ray from slightly *above* the current height downwards
        // This helps catch surfaces the player is about to fall through
        const checkStartHeight = currentActualHeight + 1.0; // Start check 1m above current pos

        const surfaceHeight = this.castRayAtPosition(cartographic, checkStartHeight - this.getTerrainHeight(cartographic)); // Offset relative to terrain

        // Check if we found a surface that is:
        // 1. Below our check start height
        // 2. Above or at the predicted next height after gravity/velocity
        // 3. Significantly above the base ground (to ensure it's likely a structure)
        if (surfaceHeight < checkStartHeight &&
            surfaceHeight >= predictedNextHeight &&
            surfaceHeight > this.baseGroundHeight + minimumBuildingHeightOffset)
        {
            // Found a valid roof/surface intercept during this frame's fall
            return surfaceHeight;
        }

        // No surface intercepted between current and next position
        return null;
    },

    // Main collision check method used by the game loop (gets surface height below player)
    checkCollision: function(playerPositionCartographic) {
        if (!this.initialized) return this.baseGroundHeight;
        return this.checkForSurface(playerPositionCartographic);
    },

    // Clear the cache (e.g., when changing cities or periodically)
    clearCache: function() {
        this.buildingHeightsCache = {};
        // console.log("Collision cache cleared.");
    }
};

// Example of periodic cache clearing (optional, manage from main.js if preferred)
// setInterval(() => {
//     if (CollisionSystem.initialized) {
//        CollisionSystem.clearCache();
//     }
// }, 15000); // Clear every 15 seconds