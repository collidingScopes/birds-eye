/**
 * Terrain management system to handle terrain height sampling and surface detection
 * Provides efficient and performant access to terrain data with caching
 */
export class TerrainManager {
    /**
     * Creates a new terrain manager
     * @param {Cesium.Viewer} viewer - Cesium viewer instance
     * @param {number} defaultHeight - Default ground height to use when sampling fails
     */
    constructor(viewer, defaultHeight = 0.5) {
        this.viewer = viewer;
        this.defaultHeight = defaultHeight;
        this.cache = {};
        this.pendingSample = null;
        this.lastSampleTime = 0;
        this.sampleInterval = 200; // Milliseconds between samples
        this.currentHeight = defaultHeight;
        this.ready = false;
        this.useGlobeGetHeight = true; // Flag to track which method to use
        
        // Initialize with basic functionality
        this.ready = true;
        
        try {
            // Initialize terrain provider - handle different Cesium versions
            if (viewer && viewer.terrainProvider) {
                console.log("Terrain provider found");
                
                // For Cesium 1.104+, check for readyPromise
                if (viewer.terrainProvider.readyPromise) {
                    viewer.terrainProvider.readyPromise
                        .then(() => {
                            console.log("Terrain provider ready via promise");
                            this.ready = true;
                        })
                        .catch(error => {
                            console.warn("Terrain provider ready promise rejected:", error);
                            this.useGlobeGetHeight = true; // Fall back to globe.getHeight
                        });
                } 
                
                // For backward compatibility and Cesium 1.119
                if (typeof viewer.terrainProvider.ready === 'boolean') {
                    console.log("Terrain provider ready state:", viewer.terrainProvider.ready);
                    this.ready = viewer.terrainProvider.ready;
                }
                
                // Test terrain sampling to verify it works
                this._testTerrainSampling();
            } else {
                console.warn("No terrain provider available");
                this.useGlobeGetHeight = true;
            }
        } catch (error) {
            console.error("Error initializing terrain manager:", error);
            this.useGlobeGetHeight = true;
        }
    }
    
    /**
     * Test terrain sampling to see if it works correctly
     * @private
     */
    _testTerrainSampling() {
        try {
            // Test if sampleTerrain works with a simple case
            const testPosition = Cesium.Cartographic.fromDegrees(0, 0);
            
            if (typeof Cesium.sampleTerrain !== 'function') {
                console.warn("sampleTerrain function not available, using globe.getHeight");
                this.useGlobeGetHeight = true;
                return;
            }
            
            Cesium.sampleTerrain(this.viewer.terrainProvider, 0, [testPosition])
                .then(() => {
                    console.log("Terrain sampling test successful");
                })
                .catch(error => {
                    console.warn("Terrain sampling test failed:", error);
                    this.useGlobeGetHeight = true;
                });
        } catch (error) {
            console.warn("Error testing terrain sampling:", error);
            this.useGlobeGetHeight = true;
        }
    }
    
    /**
     * Gets terrain height at the specified position
     * @param {Cesium.Cartographic} position - Position to sample
     * @param {boolean} forceUpdate - Whether to force a new sample
     * @returns {number} - Current best estimate of terrain height
     */
    getHeight(position, forceUpdate = false) {
        try {
            // First check the cache
            const precision = 5;
            const lat = position.latitude.toFixed(precision);
            const lon = position.longitude.toFixed(precision);
            const cacheKey = `${lat},${lon}`;
            
            const now = Date.now();
            if (!forceUpdate && this.cache[cacheKey] && 
                this.cache[cacheKey].timestamp > now - 30000) { // 30s cache
                return this.cache[cacheKey].height;
            }
            
            // Try direct globe height first - most reliable method across versions
            if (this.viewer && this.viewer.scene && this.viewer.scene.globe) {
                try {
                    const height = this.viewer.scene.globe.getHeight(position);
                    if (height !== undefined && height !== null) {
                        // Update cache with this height
                        this.cache[cacheKey] = {
                            height: height,
                            timestamp: now
                        };
                        this.currentHeight = height;
                        return height;
                    }
                } catch (e) {
                    // If globe.getHeight fails, continue to other methods
                }
            }
            
            // If not using globe.getHeight or we need forced update, try async update
            if (!this.useGlobeGetHeight || forceUpdate) {
                // Update terrain height asynchronously if needed
                this._updateHeightAsync(position, forceUpdate);
            }
            
            // Return current best estimate from cache or default
            return this.cache[cacheKey]?.height || this.currentHeight || this.defaultHeight;
        } catch (error) {
            console.warn("Error in getHeight:", error);
            return this.defaultHeight;
        }
    }
    
    /**
     * Updates terrain height asynchronously
     * @private
     * @param {Cesium.Cartographic} position - Position to sample
     * @param {boolean} forceUpdate - Whether to force a new sample 
     */
    _updateHeightAsync(position, forceUpdate) {
        const now = Date.now();
        
        // Skip update if too frequent and not forced
        if (!forceUpdate && now - this.lastSampleTime < this.sampleInterval) {
            return;
        }
        
        // Update last sample time
        this.lastSampleTime = now;
        
        // If we're using globe.getHeight exclusively, skip the rest
        if (this.useGlobeGetHeight) {
            return;
        }
        
        // Check if terrain provider is ready
        if (!this.ready || !this.viewer.terrainProvider) {
            return;
        }
        
        // Cancel any pending sample
        if (this.pendingSample) {
            this.pendingSample = null;
        }
        
        // Clone position to avoid modification
        const samplePosition = Cesium.Cartographic.clone(position);
        
        // Safely check if sampleTerrain exists
        if (typeof Cesium.sampleTerrain !== 'function') {
            this.useGlobeGetHeight = true;
            return;
        }
        
        try {
            // Sample terrain
            const terrainLevel = 9; // Less detailed but more reliable
            this.pendingSample = Cesium.sampleTerrain(this.viewer.terrainProvider, terrainLevel, [samplePosition])
                .then(updatedPositions => {
                    // Check if this sample is still valid
                    if (this.pendingSample) {
                        const sampledHeight = updatedPositions[0]?.height;
                        const height = (sampledHeight !== undefined) ? 
                            sampledHeight : this.defaultHeight;
                        
                        // Update cache
                        const precision = 5;
                        const lat = position.latitude.toFixed(precision);
                        const lon = position.longitude.toFixed(precision);
                        const cacheKey = `${lat},${lon}`;
                        
                        this.cache[cacheKey] = {
                            height: height,
                            timestamp: Date.now()
                        };
                        
                        // Update current height
                        this.currentHeight = height;
                        return height;
                    }
                })
                .catch(error => {
                    console.warn("Terrain sampling failed:", error);
                    this.useGlobeGetHeight = true; // Fall back to globe.getHeight
                    return this.defaultHeight;
                });
        } catch (error) {
            console.warn("Error in _updateHeightAsync:", error);
            this.useGlobeGetHeight = true; // Fall back to globe.getHeight
        }
    }
    
    /**
     * Forces an immediate terrain sample and returns a promise
     * @param {Cesium.Cartographic} position - Position to sample
     * @returns {Promise<number>} - Promise resolving to terrain height
     */
    forceSample(position) {
        // First try using the globe directly - most reliable method
        if (this.viewer && this.viewer.scene && this.viewer.scene.globe) {
            try {
                const height = this.viewer.scene.globe.getHeight(position);
                if (height !== undefined && height !== null) {
                    // Update cache
                    const precision = 5;
                    const lat = position.latitude.toFixed(precision);
                    const lon = position.longitude.toFixed(precision);
                    const cacheKey = `${lat},${lon}`;
                    
                    this.cache[cacheKey] = {
                        height: height,
                        timestamp: Date.now()
                    };
                    
                    this.currentHeight = height;
                    return Promise.resolve(height);
                }
            } catch (e) {
                // If globe.getHeight fails, continue to other methods
            }
        }
        
        // Fall back to direct terrain sampling
        // Clone position to avoid modification
        const samplePosition = Cesium.Cartographic.clone(position);
        
        if (!this.ready || !this.viewer.terrainProvider) {
            return Promise.resolve(this.defaultHeight);
        }
        
        try {
            // Safely check if sampleTerrain exists
            if (typeof Cesium.sampleTerrain !== 'function') {
                console.warn("sampleTerrain not available, using default height");
                return Promise.resolve(this.defaultHeight);
            }
            
            // Use a safer terrain level
            const terrainLevel = 9;
            
            return Cesium.sampleTerrain(this.viewer.terrainProvider, terrainLevel, [samplePosition])
                .then(updatedPositions => {
                    if (!updatedPositions || updatedPositions.length === 0) {
                        console.warn("No positions returned from sampleTerrain");
                        return this.defaultHeight;
                    }
                    
                    const sampledHeight = updatedPositions[0]?.height;
                    const height = (sampledHeight !== undefined) ? 
                        sampledHeight : this.defaultHeight;
                    
                    // Cache the result
                    const precision = 5;
                    const lat = position.latitude.toFixed(precision);
                    const lon = position.longitude.toFixed(precision);
                    const cacheKey = `${lat},${lon}`;
                    
                    this.cache[cacheKey] = {
                        height: height,
                        timestamp: Date.now()
                    };
                    
                    // Update current height
                    this.currentHeight = height;
                    return height;
                })
                .catch(error => {
                    console.warn("Forced terrain sampling failed:", error);
                    this.useGlobeGetHeight = true; // Fall back to globe.getHeight
                    return this.getSafeHeight(position) || this.defaultHeight;
                });
        } catch (error) {
            console.warn("Error in forceSample:", error);
            return Promise.resolve(this.getSafeHeight(position) || this.defaultHeight);
        }
    }
    
    /**
     * Gets the surface height at the player position, taking into account
     * both terrain and any buildings or structures
     * 
     * @param {Cesium.Cartographic} position - Player position
     * @param {Object} buildingCollision - Building collision data
     * @returns {number} - Surface height (terrain or building, whichever is higher)
     */
    getSurfaceHeight(position, buildingCollision) {
        try {
            // Get terrain height at current position
            const terrainHeight = this.getHeight(position);
            
            // Use building height if a building was hit and it's higher than terrain
            if (buildingCollision && buildingCollision.hit && 
                buildingCollision.height > terrainHeight) {
                return buildingCollision.height;
            }
            
            // Otherwise use terrain height
            return terrainHeight;
        } catch (error) {
            console.warn("Error getting surface height:", error);
            
            // Safety fallback - use building height or default
            if (buildingCollision && buildingCollision.hit) {
                return buildingCollision.height;
            }
            return this.defaultHeight;
        }
    }
    
    /**
     * Fallback method to get the height directly from the terrain if all else fails
     * This uses Cesium's globe to sample height directly, which works in most versions
     * 
     * @param {Cesium.Cartographic} position - Position to sample
     * @returns {number} - Terrain height
     */
    getSafeHeight(position) {
        try {
            if (this.viewer && this.viewer.scene && this.viewer.scene.globe) {
                // Try to get height from globe
                const cartographicPosition = new Cesium.Cartographic(
                    position.longitude,
                    position.latitude
                );
                
                const height = this.viewer.scene.globe.getHeight(cartographicPosition);
                
                if (height !== undefined && height !== null) {
                    return height;
                }
            }
        } catch (error) {
            console.warn("Error in getSafeHeight:", error);
        }
        
        // Fall back to default height
        return this.defaultHeight;
    }
    
    /**
     * Determines if the player is on a surface (ground or building)
     * 
     * @param {Cesium.Cartographic} position - Player position
     * @param {number} verticalVelocity - Player's vertical velocity
     * @param {Object} buildingCollision - Building collision data
     * @param {number} tolerance - Distance tolerance to consider "on surface"
     * @returns {boolean} - True if player is on a surface
     */
    isOnSurface(position, verticalVelocity, buildingCollision, tolerance = 0.5) {
        const surfaceHeight = this.getSurfaceHeight(position, buildingCollision);
        return Math.abs(position.height - surfaceHeight) < tolerance && verticalVelocity <= 0;
    }
    
    /**
     * Samples terrain height along a path between two points
     * Useful for checking if terrain blocks movement
     * 
     * @param {Cesium.Cartographic} startPosition - Start position
     * @param {Cesium.Cartographic} endPosition - End position
     * @param {number} sampleCount - Number of samples along path
     * @returns {Promise<Array<number>>} - Promise resolving to array of heights
     */
    async sampleTerrainPath(startPosition, endPosition, sampleCount = 5) {
        if (!this.viewer) {
            return Promise.resolve(Array(sampleCount).fill(this.defaultHeight));
        }
        
        try {
            // Create sample positions along path
            const positions = [];
            for (let i = 0; i < sampleCount; i++) {
                const t = i / (sampleCount - 1);
                const position = new Cesium.Cartographic(
                    startPosition.longitude * (1 - t) + endPosition.longitude * t,
                    startPosition.latitude * (1 - t) + endPosition.latitude * t
                );
                positions.push(position);
            }
            
            // If using globe.getHeight, sample directly
            if (this.useGlobeGetHeight && this.viewer.scene && this.viewer.scene.globe) {
                return positions.map(pos => {
                    try {
                        const height = this.viewer.scene.globe.getHeight(pos);
                        return height !== undefined && height !== null ? height : this.defaultHeight;
                    } catch (e) {
                        return this.defaultHeight;
                    }
                });
            }
            
            // Check if sampleTerrain exists
            if (typeof Cesium.sampleTerrain !== 'function') {
                console.warn("sampleTerrain not available, using default heights");
                return Promise.resolve(Array(sampleCount).fill(this.defaultHeight));
            }
            
            // Sample terrain at all positions
            const terrainLevel = 9; // Use a more reliable level
            
            try {
                const updatedPositions = await Cesium.sampleTerrain(
                    this.viewer.terrainProvider, 
                    terrainLevel, 
                    positions
                );
                
                if (!updatedPositions || updatedPositions.length === 0) {
                    console.warn("No positions returned from path sampling");
                    return Array(sampleCount).fill(this.defaultHeight);
                }
                
                // Extract heights with safety checks
                return updatedPositions.map(pos => {
                    if (!pos || pos.height === undefined) {
                        return this.defaultHeight;
                    }
                    return pos.height;
                });
            } catch (error) {
                console.warn("Terrain path sampling with sampleTerrain failed:", error);
                this.useGlobeGetHeight = true;
                
                // Try using globe.getHeight as fallback
                if (this.viewer.scene && this.viewer.scene.globe) {
                    return positions.map(pos => {
                        try {
                            const height = this.viewer.scene.globe.getHeight(pos);
                            return height !== undefined && height !== null ? height : this.defaultHeight;
                        } catch (e) {
                            return this.defaultHeight;
                        }
                    });
                }
                
                return Array(sampleCount).fill(this.defaultHeight);
            }
            
        } catch (error) {
            console.warn("Terrain path sampling failed:", error);
            return Array(sampleCount).fill(this.defaultHeight);
        }
    }
    
    /**
     * Prepares terrain for a teleport destination by pre-sampling
     * 
     * @param {number} longitude - Destination longitude in degrees
     * @param {number} latitude - Destination latitude in degrees
     * @returns {Promise<number>} - Promise resolving to terrain height
     */
    async prepareDestination(longitude, latitude) {
        // Create cartographic position
        const position = Cesium.Cartographic.fromDegrees(longitude, latitude);
        
        // Try direct globe height first - most reliable method
        if (this.viewer && this.viewer.scene && this.viewer.scene.globe) {
            try {
                const height = this.viewer.scene.globe.getHeight(position);
                if (height !== undefined && height !== null) {
                    // Update cache
                    const precision = 5;
                    const lat = position.latitude.toFixed(precision);
                    const lon = position.longitude.toFixed(precision);
                    const cacheKey = `${lat},${lon}`;
                    
                    this.cache[cacheKey] = {
                        height: height,
                        timestamp: Date.now()
                    };
                    
                    return height;
                }
            } catch (e) {
                // If globe.getHeight fails, continue to other methods
            }
        }
        
        // Force terrain sampling at higher resolution
        try {
            return await this.forceSample(position);
        } catch (error) {
            console.warn("Failed to prepare destination terrain:", error);
            return this.getSafeHeight(position) || this.defaultHeight;
        }
    }
    
    /**
     * Clears the height cache
     */
    clearCache() {
        this.cache = {};
    }
}