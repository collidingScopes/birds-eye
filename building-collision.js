/**
 * Performs a ray cast to check for building collision below the player
 * Caches building detection results for improved performance
 * 
 * @param {Object} viewer - Cesium viewer instance
 * @param {Object} playerPosition - Player position in Cartographic coordinates
 * @param {Object} osmBuildingsTileset - OSM Buildings tileset
 * @param {Object} inputState - Player input state to check for movement
 * @param {Object} cache - Object to store cached building height
 * @param {number} heightThreshold - Minimum height to check for collisions (default: 20.0)
 * @param {number} maxDistance - Maximum distance for ray cast (how far down to check)
 * @returns {Object} Object with properties: { hit: boolean, height: number }
 */
export function checkBuildingCollision(viewer, playerPosition, osmBuildingsTileset, inputState, cache, heightThreshold = 20.0) {
    // Check if horizontal movement occurred (WASD keys)
    const isHorizontalMovement = inputState && (
        inputState.forward || 
        inputState.backward || 
        inputState.strafeLeft || 
        inputState.strafeRight
    );
    
    // If we already have a cached result and the player hasn't moved horizontally, use it
    if (cache && cache.valid && !isHorizontalMovement) {
        return {
            hit: cache.hit,
            height: cache.height
        };
    }
    
    // Default result (no hit)
    const result = {
        hit: false,
        height: 0
    };
    
    // Early exit conditions - skip collision check if:
    // 1. Player is below the height threshold and we don't have a cached hit
    if (playerPosition.height < heightThreshold && !(cache && cache.hit)) {
        // Update cache to indicate no hit at current position
        if (cache && isHorizontalMovement) {
            cache.valid = true;
            cache.hit = false;
            cache.height = 0;
        }
        return result;
    }
    
    // 2. Check if we have a valid scene, viewer and tileset
    if (!viewer || !viewer.scene || !osmBuildingsTileset) {
        console.warn("Missing required objects for building collision check");
        return result;
    }

    // Only perform the ray cast if:
    // - Player has moved horizontally (WASD pressed), OR
    // - We don't have a valid cache yet
    if (isHorizontalMovement || !cache || !cache.valid) {
        const maxDistance = 150.0;

        try {
            // Create ray starting point at player position
            const heightOffset = 1.0; // 1 meter above current position
            const rayStartHeight = playerPosition.height + heightOffset;
            
            const playerCartesian = Cesium.Cartesian3.fromRadians(
                playerPosition.longitude,
                playerPosition.latitude,
                rayStartHeight
            );
            
            // Get the local east-north-up (ENU) frame at player position
            const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(playerCartesian);
            
            // Create downward direction vector
            const downDirectionENU = new Cesium.Cartesian3(0, 0, -1);
            
            // Transform the direction to ECEF frame
            const downDirectionECEF = new Cesium.Cartesian3();
            Cesium.Matrix4.multiplyByPointAsVector(
                enuTransform, 
                downDirectionENU, 
                downDirectionECEF
            );
            Cesium.Cartesian3.normalize(downDirectionECEF, downDirectionECEF);
            
            // Create ray for intersection testing
            const ray = new Cesium.Ray(playerCartesian, downDirectionECEF);
                    
            // Try different approaches to ray intersection
            let intersections = viewer.scene.drillPickFromRay(ray, maxDistance, [osmBuildingsTileset]);
            
            // If no results, try without specifying the tileset
            if (!intersections || intersections.length === 0) {
                intersections = viewer.scene.drillPickFromRay(ray, maxDistance);
            }
            
            if (!intersections || intersections.length === 0) {
                // Update cache to indicate no hit at current position
                if (cache) {
                    cache.valid = true;
                    cache.hit = false;
                    cache.height = 0;
                }
                return result;
            }
            
            // Process results
            let closestIntersection = null;
            let closestDistance = Infinity;
            
            for (let i = 0; i < intersections.length; i++) {
                const intersection = intersections[i];
                
                if (!intersection) {
                    continue;
                }
                
                // The position might be directly in the intersection object or in a .object property
                const position = intersection.position || 
                                (intersection.object ? intersection.object.position : null);
                
                if (!position) {
                    // Try to find position in other properties if available
                    if (intersection.primitive && intersection.primitive.boundingSphere && 
                        intersection.primitive.boundingSphere.center) {
                        const primitivePosition = intersection.primitive.boundingSphere.center;
                        position = primitivePosition;
                    } else {
                        continue;
                    }
                }
                
                const distance = Cesium.Cartesian3.distance(playerCartesian, position);
                
                // Convert to cartographic to get height
                const intersectionCartographic = Cesium.Cartographic.fromCartesian(position);
                
                // Ensure we're below the player (within reason)
                const isBelow = intersectionCartographic.height < rayStartHeight - 0.5;
                
                if (isBelow && distance < closestDistance && distance > 0.01) {
                    closestDistance = distance;
                    closestIntersection = {
                        position: position,
                        cartographic: intersectionCartographic
                    };
                }
            }
            
            // If we found a valid intersection
            if (closestIntersection && closestIntersection.position) {
                const intersectionCartographic = closestIntersection.cartographic;
                
                // Store the result in the cache
                if (cache) {
                    cache.valid = true;
                    cache.hit = true;
                    cache.height = intersectionCartographic.height;
                }
                
                // Return hit result with building height
                result.hit = true;
                result.height = intersectionCartographic.height;
                return result;
            }
        } catch (error) {
            console.error("Error in building collision detection:", error);
        }
    }
    
    // If no new detection was performed or it failed, return the cached result (if available)
    if (cache && cache.valid) {
        return {
            hit: cache.hit,
            height: cache.height
        };
    }
    
    return result;
}