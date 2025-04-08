/**
 * Applies a futuristic neon effect to buildings and changes sky color
 * 
 * @param {Object} viewer - Cesium viewer instance
 * @param {Object} osmBuildingsTileset - OSM Buildings tileset
 * @param {Object} playerPosition - Player position in Cartographic coordinates
 * @param {number} effectRadius - Radius within which buildings are affected (default: 100.0)
 */
export function applyFuturisticEffect(viewer, osmBuildingsTileset, playerPosition, effectRadius = 100.0) {
    if (!viewer || !osmBuildingsTileset || !playerPosition) {
        console.warn("Missing required objects for building effect");
        return;
    }

    // Get current time for subtle pulsing animation
    const time = Date.now() / 1000;
    
    // Change sky color to pastel pink
    viewer.scene.backgroundColor = new Cesium.Color(0.98, 0.76, 0.84, 1.0);
    
    // Create a vibrant futuristic style
    // Use a mix of glowing pastel neon colors
    try {
        osmBuildingsTileset.style = new Cesium.Cesium3DTileStyle({
            color: `mix(
                        color('rgba(36, 255, 186, 0.96)'), 
                        color('rgba(255, 100, 221, 0.96)'), 
                        sin((${time}*0.2 + (${playerPosition.longitude} + ${playerPosition.latitude}) * 100.0) * 0.3) * 0.5 + 0.5
                    )`
        });
    } catch (error) {
        console.error("Error applying futuristic style to buildings:", error);
        
        // Fall back to a simple color style if the shader fails
        try {
            osmBuildingsTileset.style = new Cesium.Cesium3DTileStyle({
                color: "color('rgba(120, 180, 255, 0.96)')"
            });
        } catch (fallbackError) {
            console.error("Even fallback style failed:", fallbackError);
        }
    }
}

/**
 * Creates a building color manager to handle the futuristic building effect
 * 
 * @param {Object} viewer - Cesium viewer instance
 * @param {Object} osmBuildingsTileset - OSM Buildings tileset
 * @returns {Object} Color manager object with methods to control effect
 */
export function createBuildingColorManager(viewer, osmBuildingsTileset) {
    let isEnabled = false;
    let effectRadius = 100.0;
    let lastUpdateTime = 0;
    const updateInterval = 250; // Update every 250ms for performance
    
    // Store original tileset style
    let originalStyle = null;
    if (osmBuildingsTileset.style) {
        // Handle case where clone method is not available
        try {
            if (typeof osmBuildingsTileset.style.color === 'string') {
                originalStyle = new Cesium.Cesium3DTileStyle({
                    color: osmBuildingsTileset.style.color
                });
            } else {
                originalStyle = new Cesium.Cesium3DTileStyle({
                    color: "color('#e0e0e0')"
                });
            }
        } catch (error) {
            console.warn("Couldn't clone original style, creating default style", error);
            originalStyle = new Cesium.Cesium3DTileStyle({
                color: "color('#e0e0e0')"
            });
        }
    } else {
        // Default light gray style
        originalStyle = new Cesium.Cesium3DTileStyle({
            color: "color('#e0e0e0')"
        });
    }
    
    const manager = {
        /**
         * Enable futuristic effect
         */
        enable: function() {
            isEnabled = true;
            
            // Create CRT overlay effect
            this.createCrtEffect();
            
            console.log("Futuristic building effect enabled");
        },
        
        /**
         * Creates a CRT screen effect overlay
         */
        createCrtEffect: function() {
            // Remove existing overlay if any
            const existingOverlay = document.getElementById('crt-overlay');
            if (existingOverlay) {
                document.body.removeChild(existingOverlay);
            }
            
            // Create CRT overlay
            const overlay = document.createElement('div');
            overlay.id = 'crt-overlay';
            
            // Add CSS for CRT effect
            const style = document.createElement('style');
            style.textContent = `
                #crt-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                    z-index: 1000;
                    background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.15) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.04), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.04));
                    background-size: 100% 4px, 4px 100%;
                }
                
                #crt-overlay::before {
                    content: "";
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(18, 16, 16, 0.05);
                    opacity: 0.05;
                    z-index: 1000;
                    pointer-events: none;
                }
                
                #crt-overlay::after {
                    content: "";
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: repeating-linear-gradient(transparent, transparent 50%, rgba(0, 0, 0, 0.025) 50%, rgba(0, 0, 0, 0.025) 100%);
                    background-size: 100% 80px;
                    pointer-events: none;
                }
            `;
            
            document.head.appendChild(style);
            document.body.appendChild(overlay);
        },
        
        /**
         * Disable effect and restore original appearance
         */
        disable: function() {
            isEnabled = false;
            
            // Remove CRT overlay if it exists
            const crtOverlay = document.getElementById('crt-overlay');
            if (crtOverlay) {
                document.body.removeChild(crtOverlay);
            }
            
            // Reset sky color to default blue
            viewer.scene.backgroundColor = new Cesium.Color(0.678, 0.847, 0.902, 1.0);
            
            try {
                osmBuildingsTileset.style = originalStyle;
            } catch (error) {
                console.warn("Error resetting to original style:", error);
                // Attempt to apply a default style
                try {
                    osmBuildingsTileset.style = new Cesium.Cesium3DTileStyle({
                        color: "color('#e0e0e0')"
                    });
                } catch (fallbackError) {
                    console.error("Failed to reset building style:", fallbackError);
                }
            }
            console.log("Building color effects disabled");
        },
        
        /**
         * Set the effect radius
         * @param {number} radius - Radius in meters
         */
        setRadius: function(radius) {
            effectRadius = Math.max(10.0, radius); // Minimum 10 meter radius
            console.log(`Effect radius set to ${effectRadius}m`);
        },
        
        /**
         * Toggle effect on/off
         * @returns {boolean} New state (true = enabled, false = disabled)
         */
        toggle: function() {
            if (isEnabled) {
                this.disable();
            } else {
                this.enable();
            }
            return isEnabled;
        },
        
        /**
         * Update the shader effect (call this from the game loop)
         * @param {Object} playerPosition - Current player position
         */
        update: function(playerPosition) {
            if (!isEnabled || !playerPosition) return;
            
            const currentTime = performance.now();
            
            // Only update at specified interval to maintain performance
            if (currentTime - lastUpdateTime < updateInterval) return;
            
            applyFuturisticEffect(viewer, osmBuildingsTileset, playerPosition, effectRadius);
            lastUpdateTime = currentTime;
        },
        
        /**
         * Get the current effect settings
         * @returns {Object} Current effect settings
         */
        getSettings: function() {
            return {
                enabled: isEnabled,
                radius: effectRadius
            };
        }
    };
    
    return manager;
}