/**
 * Performs a ray cast to check for building collision below the player
 * Caches building detection results for improved performance
 * 
 * @param {Object} viewer - Cesium viewer instance
 * @param {Object} playerPosition - Player position in Cartographic coordinates
 * @param {Object} osmBuildingsTileset - OSM Buildings tileset
 * @param {Object} inputState - Player input state to check for movement
 * @param {Object} cache - Object to store cached building height and position
 * @param {number} heightThreshold - Minimum height to check for collisions (default: 20.0)
 * @param {number} maxDistance - Maximum distance for ray cast (default: 150.0)
 * @param {number} minMovementDistance - Minimum distance the player must move horizontally to trigger a new check (default: 20.0)
 * @returns {Object} Object with properties: { hit: boolean, height: number }
 */
export function checkBuildingCollision(
    viewer, 
    playerPosition, 
    osmBuildingsTileset, 
    inputState, 
    cache = {}, 
    heightThreshold = 20.0, 
    maxDistance = 100.0,
    minMovementDistance = 15.0,
) {
    // Initialize cache if it's the first call
    if (!cache.initialized) {
        cache.initialized = true;
        cache.valid = false;
        cache.hit = false;
        cache.height = 0;
        cache.lastPosition = null;
    }
    
    // Check if horizontal movement occurred (WASD keys) - preserved from original
    const isHorizontalMovement = inputState && (
        inputState.forward || 
        inputState.backward || 
        inputState.strafeLeft || 
        inputState.strafeRight
    );
    
    // Default result (no hit)
    const result = {
        hit: false,
        height: 0
    };
    
    // Early exit conditions 
    // 1. Missing required objects
    if (!viewer || !viewer.scene || !osmBuildingsTileset) {
        console.warn("Missing required objects for building collision check");
        return result;
    }
    
    // 2. Player is below the height threshold and we don't have a cached hit
    if (playerPosition.height < heightThreshold && !(cache && cache.hit)) {
        // Only update cache if we need to
        if (cache.valid === false) {
            cache.valid = true;
            cache.hit = false;
            cache.height = 0;
        }
        return result;
    }
    
    // Check if the player has moved far enough horizontally to warrant a new collision check
    let needsNewRaycast = !cache.valid;
    
    if (cache.lastPosition && isHorizontalMovement) {
        const horizontalDistanceMoved = calculateHorizontalDistance(
            playerPosition.longitude, 
            playerPosition.latitude, 
            cache.lastPosition.longitude, 
            cache.lastPosition.latitude
        );
        needsNewRaycast = horizontalDistanceMoved >= minMovementDistance;
    } else if (isHorizontalMovement) {
        // If there's no last position but movement is happening, we need a raycast
        needsNewRaycast = true;
    }
    
    // Return cached result if we don't need a new raycast
    if (cache.valid && !needsNewRaycast) {
        return {
            hit: cache.hit,
            height: cache.height
        };
    }
    
    // Perform the ray casting when needed
    try {
        // Create ray starting point at player position (with small upward offset)
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
        
        // Try different approaches to ray intersection - preserved from original for reliability
        let intersections = viewer.scene.drillPickFromRay(ray, maxDistance, [osmBuildingsTileset]);
        
        // If no results, try without specifying the tileset (fallback from original)
        if (!intersections || intersections.length === 0) {
            intersections = viewer.scene.drillPickFromRay(ray, maxDistance);
        }
        
        if (!intersections || intersections.length === 0) {
            // Update cache to indicate no hit at current position
            cache.valid = true;
            cache.hit = false;
            cache.height = 0;
            cache.lastPosition = {
                longitude: playerPosition.longitude,
                latitude: playerPosition.latitude
            };
            return result;
        }
        
        // Process results - using original logic which is proven to work well
        let closestIntersection = null;
        let closestDistance = Infinity;
        
        for (let i = 0; i < intersections.length; i++) {
            const intersection = intersections[i];
            
            if (!intersection) {
                continue;
            }
            
            // The position might be directly in the intersection object or in a .object property
            let position = intersection.position || 
                         (intersection.object ? intersection.object.position : null);
            
            if (!position) {
                // Try to find position in other properties if available
                if (intersection.primitive && intersection.primitive.boundingSphere && 
                    intersection.primitive.boundingSphere.center) {
                    position = intersection.primitive.boundingSphere.center;
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
            cache.valid = true;
            cache.hit = true;
            cache.height = intersectionCartographic.height;
            cache.lastPosition = {
                longitude: playerPosition.longitude,
                latitude: playerPosition.latitude
            };
            
            // Return hit result with building height
            result.hit = true;
            result.height = intersectionCartographic.height;
            return result;
        }
    } catch (error) {
        console.error("Error in building collision detection:", error);
    }
    
    // Update cache if the ray casting found no intersection
    cache.valid = true;
    cache.hit = false;
    cache.height = 0;
    cache.lastPosition = {
        longitude: playerPosition.longitude,
        latitude: playerPosition.latitude
    };
    
    return result;
}

/**
 * Calculate the approximate horizontal distance between two points on Earth (in meters)
 * Uses the haversine formula for better accuracy
 *
 * @param {number} lon1 - Longitude of point 1 (in radians)
 * @param {number} lat1 - Latitude of point 1 (in radians)
 * @param {number} lon2 - Longitude of point 2 (in radians)
 * @param {number} lat2 - Latitude of point 2 (in radians)
 * @return {number} - Approximate distance in meters
 */
function calculateHorizontalDistance(lon1, lat1, lon2, lat2) {
    const R = 6371000; // Earth radius in meters
    
    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return distance;
}