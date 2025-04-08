/**
 * Applies a proximity-based color effect to buildings
 * Buildings closer to the player will have a different appearance
 * 
 * @param {Object} viewer - Cesium viewer instance
 * @param {Object} osmBuildingsTileset - OSM Buildings tileset
 * @param {Object} playerPosition - Player position in Cartographic coordinates
 * @param {number} effectRadius - Radius within which buildings are affected (default: 100.0)
 * @param {string} effectType - Type of effect to apply ('neon', 'hologram', 'highlight', 'pulse')
 */
export function applyProximityEffect(viewer, osmBuildingsTileset, playerPosition, effectRadius = 100.0, effectType = 'neon') {
    if (!viewer || !osmBuildingsTileset || !playerPosition) {
        console.warn("Missing required objects for building effect");
        return;
    }

    // Get current time for animation effects
    const time = Date.now() / 1000;
    
    // Create style based on effect type
    let styleExpression;
    
    switch (effectType) {
        case 'neon':
            // Neon effect - blue/purple buildings
            styleExpression = 
                `${playerPosition.longitude < 0 ? '' : '+'}${playerPosition.longitude} * ${playerPosition.latitude < 0 ? '' : '+'}${playerPosition.latitude} * ${effectRadius} === 0 ? color('rgba(0, 150, 255, 0.8)') : color('rgba(230, 230, 255, 0.9)')`;
            break;
            
        case 'hologram':
            // Hologram effect - transparent blue
            styleExpression = 
                `${playerPosition.longitude < 0 ? '' : '+'}${playerPosition.longitude} * ${playerPosition.latitude < 0 ? '' : '+'}${playerPosition.latitude} * ${effectRadius} === 0 ? color('rgba(0, 210, 255, 0.6)') : color('rgba(230, 230, 255, 0.9)')`;
            break;
            
        case 'highlight':
            // Highlight effect - golden/orange color
            styleExpression = 
                `${playerPosition.longitude < 0 ? '' : '+'}${playerPosition.longitude} * ${playerPosition.latitude < 0 ? '' : '+'}${playerPosition.latitude} * ${effectRadius} === 0 ? color('rgba(255, 200, 50, 0.9)') : color('rgba(230, 230, 255, 0.9)')`;
            break;
            
        case 'pulse':
            // Pulse effect - buildings pulse based on time
            const pulseIntensity = Math.floor((Math.sin(time * 2) * 0.5 + 0.5) * 255);
            styleExpression = 
                `${playerPosition.longitude < 0 ? '' : '+'}${playerPosition.longitude} * ${playerPosition.latitude < 0 ? '' : '+'}${playerPosition.latitude} * ${effectRadius} === 0 ? color('rgba(${pulseIntensity}, 100, 255, 0.9)') : color('rgba(230, 230, 255, 0.9)')`;
            break;
            
        case 'scanwave':
            // Scan wave effect (simpler version)
            const waveIntensity = Math.floor((Math.sin(time * 4) * 0.5 + 0.5) * 255);
            styleExpression = 
                `${playerPosition.longitude < 0 ? '' : '+'}${playerPosition.longitude} * ${playerPosition.latitude < 0 ? '' : '+'}${playerPosition.latitude} * ${effectRadius} === 0 ? color('rgba(50, ${waveIntensity}, 255, 0.9)') : color('rgba(230, 230, 255, 0.9)')`;
            break;
            
        default:
            // Default effect (subtle blue tint)
            styleExpression = `color('rgba(230, 230, 255, 0.9)')`;
    }

    // Apply the style to the tileset with error handling
    try {
        osmBuildingsTileset.style = new Cesium.Cesium3DTileStyle({
            color: styleExpression
        });
    } catch (error) {
        console.error("Error applying style to buildings:", error);
        
        // Fall back to a simple color style if the shader fails
        try {
            osmBuildingsTileset.style = new Cesium.Cesium3DTileStyle({
                color: "color('rgb(100, 150, 255)')"
            });
        } catch (fallbackError) {
            console.error("Even fallback style failed:", fallbackError);
        }
    }
}

/**
 * Creates a building color manager to handle dynamic building effects
 * 
 * @param {Object} viewer - Cesium viewer instance
 * @param {Object} osmBuildingsTileset - OSM Buildings tileset
 * @returns {Object} Color manager object with methods to control effects
 */
export function createBuildingColorManager(viewer, osmBuildingsTileset) {
    let currentEffect = 'none';
    let effectRadius = 100.0;
    let isEnabled = false;
    let lastUpdateTime = 0;
    const updateInterval = 250; // Update every 250ms for performance
    
    // Available effect types
    const effectTypes = ['neon', 'hologram', 'highlight', 'pulse', 'scanwave'];
    
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
         * Enable color effects
         * @param {string} effectType - Type of effect to apply (optional)
         */
        enable: function(effectType = 'neon') {
            if (effectTypes.includes(effectType)) {
                currentEffect = effectType;
            } else {
                currentEffect = 'neon'; // Default to neon if invalid type
                console.warn(`Invalid effect type: ${effectType}. Using 'neon' instead.`);
            }
            isEnabled = true;
            console.log(`Building color effect enabled: ${currentEffect}`);
        },
        
        /**
         * Disable color effects and restore original appearance
         */
        disable: function() {
            isEnabled = false;
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
         * Cycle to the next effect type
         * @returns {string} New effect name
         */
        cycleEffect: function() {
            const currentIndex = effectTypes.indexOf(currentEffect);
            const nextIndex = (currentIndex + 1) % effectTypes.length;
            currentEffect = effectTypes[nextIndex];
            
            if (isEnabled) {
                console.log(`Switched to ${currentEffect} effect`);
                // Force immediate update
                lastUpdateTime = 0;
            }
            
            return currentEffect;
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
            
            applyProximityEffect(viewer, osmBuildingsTileset, playerPosition, effectRadius, currentEffect);
            lastUpdateTime = currentTime;
        },
        
        /**
         * Get the current effect settings
         * @returns {Object} Current effect settings
         */
        getSettings: function() {
            return {
                enabled: isEnabled,
                effectType: currentEffect,
                radius: effectRadius
            };
        }
    };
    
    return manager;
}