// collision-system.js

// Collision detection parameters
const collisionCheckHeight = 1000.0; // Maximum height ABOVE SURFACE to start the ray
const minimumBuildingHeightOffset = 5.0; // Minimum height difference above terrain to be considered a building

// Create a collision detection module
const CollisionSystem = {
    init: function(scene, tileset, baseGroundHeight) { // Pass baseGroundHeight
        this.scene = scene;
        this.tileset = tileset;
        this.buildingHeights = {};
        this.baseGroundHeight = baseGroundHeight; // Store base ground height
        this.pendingChecks = 0; // Track ongoing checks
        console.log("Collision system initialized");
    },

    // Function to get terrain height (more robust than assuming global groundHeight)
    getTerrainHeight: function(cartographic) {
        // Placeholder: In a real scenario, you might query Cesium terrain provider
        // For now, we'll assume a base height or use the cached value if available
        const key = `${cartographic.longitude.toFixed(7)},${cartographic.latitude.toFixed(7)}_terrain`;
        if (this.buildingHeights[key] !== undefined) {
            return this.buildingHeights[key];
        }
        // Fallback to the configured base ground height
        this.buildingHeights[key] = this.baseGroundHeight; // Cache base height
        return this.baseGroundHeight;
    },

    // Function to cast a ray and find height at a specific position
    castRayAtPosition: function(cartographic, startHeight) {
        if (!this.tileset || !this.tileset.ready) return this.baseGroundHeight;
        
        // --- RAY CASTING ---
        // 1. Get the point on the ellipsoid (height 0) at the given location
        const pointOnEllipsoid = Cesium.Cartesian3.fromRadians(
            cartographic.longitude,
            cartographic.latitude,
            0.0 // Use ellipsoid height 0 as reference
        );

        // 2. Determine the 'up' direction at that point
        const up = Cesium.Cartesian3.normalize(pointOnEllipsoid, new Cesium.Cartesian3());

        // 3. Calculate the ray start position high above the surface or from specified height
        const rayStart = Cesium.Cartesian3.add(
            pointOnEllipsoid,
            Cesium.Cartesian3.multiplyByScalar(up, startHeight || collisionCheckHeight, new Cesium.Cartesian3()),
            new Cesium.Cartesian3()
        );

        // 4. Ray direction is straight down
        const rayDirection = Cesium.Cartesian3.negate(up, new Cesium.Cartesian3());

        const ray = new Cesium.Ray(rayStart, rayDirection);

        // Pick against the tileset ONLY
        const result = this.scene.pickFromRay(ray, [this.tileset]);
        
        // Get terrain height
        const terrainHeight = this.getTerrainHeight(cartographic);
        
        // Process the result
        if (result && result.position) {
            const intersectionCartographic = Cesium.Cartographic.fromCartesian(result.position);
            const intersectionHeight = intersectionCartographic.height;

            // Check if the intersection point is significantly higher than the terrain
            if (intersectionHeight > terrainHeight + minimumBuildingHeightOffset) {
                return intersectionHeight; // It's a building roof or structure
            } else {
                // Intersection is too low, likely ground within the tileset or small object
                return Math.max(intersectionHeight, terrainHeight);
            }
        }
        
        // No intersection, return terrain height
        return terrainHeight;
    },

    // Check for building/ground at the current position (regular collision check)
    checkForBuilding: function(cartographic) {
        const cacheKey = `${cartographic.longitude.toFixed(7)},${cartographic.latitude.toFixed(7)}_building`;
        
        // Check cache first
        if (this.buildingHeights[cacheKey] !== undefined) {
            return this.buildingHeights[cacheKey];
        }
        
        // Perform the ray cast
        const surfaceHeight = this.castRayAtPosition(cartographic);
        
        // Cache the result
        this.buildingHeights[cacheKey] = surfaceHeight;
        
        return surfaceHeight;
    },

    // Method to specifically check for roofs between current position and predicted next position
    checkForRoofsDuringFall: function(cartographic, currentHeight, predictedNextHeight) {
        // Ignore cache for this type of check
        // We need a fresh check between current position and next position
        
        // Cast a ray from the current height downward
        const surfaceHeight = this.castRayAtPosition(cartographic, currentHeight);
        
        // Check if we found a surface between current and predicted next position
        if (surfaceHeight < currentHeight && surfaceHeight > predictedNextHeight) {
            // Surface is between current and next position - we'll hit it this frame
            return surfaceHeight;
        }
        
        // No surface in between - use standard collision at bottom
        return null;
    },

    // Main collision check method, used by the game loop
    checkCollision: function(playerPosition) {
        return this.checkForBuilding(playerPosition);
    },

    clearCache: function() {
        this.buildingHeights = {};
    }
};

// This function needs to be called from main.js after the tileset is loaded
function initializeCollisionSystem() {
    if (osmBuildingsTileset && viewer) {
        // Pass the base groundHeight during initialization
        CollisionSystem.init(viewer.scene, osmBuildingsTileset, groundHeight);
        console.log("Enhanced collision system initialized with roof detection");

        // Clear cache periodically
        setInterval(() => CollisionSystem.clearCache(), 15000);
    } else {
        console.error("Cannot initialize collision system: Tileset or Viewer not ready.");
    }
}