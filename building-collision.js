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
 * @param {number} minMovementDistance - Minimum distance the player must move horizontally to trigger a new check (default: 15.0)
 * @param {number} minVerticalDistance - Minimum vertical distance change to trigger a new check (default: 15.0)
 * @returns {Object} Object with properties: { hit: boolean, height: number }
 */
export function checkBuildingCollision(
    viewer, 
    playerPosition, 
    osmBuildingsTileset, 
    inputState, 
    cache = {}, 
    heightThreshold = 20.0, 
    maxDistance = 150.0,
    minMovementDistance = 15.0,
    minVerticalDistance = 15.0
) {
    // Initialize cache if it's the first call
    if (!cache.initialized) {
        cache.initialized = true;
        cache.valid = false;
        cache.hit = false;
        cache.height = 0;
        cache.lastPosition = null;
        cache.lastVerticalCheck = null;
        cache.rooftopData = [];  // Store multiple rooftop heights for better landing accuracy
    }
    
    // Check if movement occurred
    const isHorizontalMovement = inputState && (
        inputState.forward || 
        inputState.backward || 
        inputState.strafeLeft || 
        inputState.strafeRight
    );
    
    // Also check for vertical movement (new)
    const isVerticalMovement = inputState && (
        inputState.moveUp || 
        inputState.moveDown ||
        inputState.jump
    );
    
    // Default result (no hit)
    const result = {
        hit: false,
        height: 0,
        rooftopType: null
    };
    
    // Early exit conditions 
    // 1. Missing required objects
    if (!viewer || !viewer.scene || !osmBuildingsTileset) {
        console.warn("Missing required objects for building collision check");
        return result;
    }
    
    // 2. Player is below the height threshold and we don't have a cached hit
    // (Keep this optimization for ground-level scenarios)
    if (playerPosition.height < heightThreshold && !(cache && cache.hit)) {
        // Only update cache if we need to
        if (cache.valid === false) {
            cache.valid = true;
            cache.hit = false;
            cache.height = 0;
        }
        return result;
    }
    
    // Check if we need a new raycast based on:
    // 1. Cache invalidation
    // 2. Horizontal movement beyond threshold
    // 3. Vertical movement beyond threshold (new)
    let needsNewRaycast = !cache.valid;
    
    if (cache.lastPosition) {
        if (isHorizontalMovement) {
            const horizontalDistanceMoved = calculateHorizontalDistance(
                playerPosition.longitude, 
                playerPosition.latitude, 
                cache.lastPosition.longitude, 
                cache.lastPosition.latitude
            );
            needsNewRaycast = needsNewRaycast || horizontalDistanceMoved >= minMovementDistance;
        }
        
        // Check vertical movement threshold (new)
        if (cache.lastVerticalCheck !== null) {
            const verticalDistanceMoved = Math.abs(playerPosition.height - cache.lastVerticalCheck);
            needsNewRaycast = needsNewRaycast || verticalDistanceMoved >= minVerticalDistance;
        }
    } else {
        // If there's no last position, we need a raycast
        needsNewRaycast = true;
    }
    
    // Also force raycast during active vertical movement for better landing accuracy (new)
    if (isVerticalMovement) {
        needsNewRaycast = true;
    }
    
    // Return cached result if we don't need a new raycast
    if (cache.valid && !needsNewRaycast) {
        return {
            hit: cache.hit,
            height: cache.height,
            rooftopData: cache.rooftopData
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
        
        // Use a more comprehensive approach with multiple intersection attempts
        // First, try with the buildings tileset specifically (most accurate)
        let intersections = viewer.scene.drillPickFromRay(ray, maxDistance, [osmBuildingsTileset]);
        
        // If no results, try with a wider sampling method
        if (!intersections || intersections.length === 0) {
            // Try without specifying the tileset
            intersections = viewer.scene.drillPickFromRay(ray, maxDistance);
            
            // If still no results and we're actively moving down, try with increased distance
            if ((!intersections || intersections.length === 0) && 
                inputState && inputState.moveDown) {
                const extendedMaxDistance = maxDistance * 1.5;
                intersections = viewer.scene.drillPickFromRay(ray, extendedMaxDistance);
            }
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
            cache.lastVerticalCheck = playerPosition.height;
            cache.rooftopData = [];
            return result;
        }
        
        // Process results - store multiple intersections for better accuracy
        let rooftops = [];
        
        for (let i = 0; i < intersections.length; i++) {
            const intersection = intersections[i];
            
            if (!intersection) {
                continue;
            }
            
            // Get position data using various methods, depending on what's available
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
            
            // Skip if too close (likely self-intersection)
            if (distance < 0.1) {
                continue;
            }
            
            // Convert to cartographic to get height
            const intersectionCartographic = Cesium.Cartographic.fromCartesian(position);
            
            // FIX: Validate building height - Skip negative heights or those too close to zero
            // This is the key fix that prevents negative building heights from being used
            if (intersectionCartographic.height <= 0) {
                //console.warn(`Ignoring invalid building height: ${intersectionCartographic.height}m`);
                continue;
            }
            
            // Ensure we're below the player (within reason)
            const isBelow = intersectionCartographic.height < rayStartHeight - 0.5;
            
            if (isBelow && distance > 0.01 && distance <= maxDistance) {
                // Calculate some properties about the rooftop
                const distanceFromPlayer = rayStartHeight - intersectionCartographic.height;
                
                // Get feature information if available
                let featureType = "unknown";
                if (intersection.primitive && intersection.primitive.metadata) {
                    featureType = intersection.primitive.metadata.getProperty("type") || 
                                intersection.primitive.metadata.getProperty("_batchId") || 
                                "building";
                }
                
                // Store this rooftop
                rooftops.push({
                    position: position,
                    cartographic: intersectionCartographic,
                    height: intersectionCartographic.height,
                    distance: distance,
                    distanceFromPlayer: distanceFromPlayer,
                    type: featureType
                });
            }
        }
        
        // If we found valid rooftops, sort them by distance and update the cache
        if (rooftops.length > 0) {
            // Sort rooftops by distance (closest first)
            rooftops.sort((a, b) => a.distance - b.distance);
            
            // Get the closest rooftop
            const closestRooftop = rooftops[0];
            
            // FIX: Additional validation to ensure we're not using a negative or invalid height
            if (closestRooftop.height <= 0) {
                console.warn(`Final rooftop has invalid height: ${closestRooftop.height}m. Using 0 instead.`);
                closestRooftop.height = 0;
            }
            
            // Store the results in the cache
            cache.valid = true;
            cache.hit = true;
            cache.height = closestRooftop.height;
            cache.lastPosition = {
                longitude: playerPosition.longitude,
                latitude: playerPosition.latitude
            };
            cache.lastVerticalCheck = playerPosition.height;
            cache.rooftopData = rooftops.slice(0, 3); // Store up to 3 closest rooftops
            
            // Return hit result with building height and type
            result.hit = true;
            result.height = closestRooftop.height;
            result.rooftopData = cache.rooftopData;
            
            // FIX: Log if we had to filter out negative heights
            if (intersections.length > rooftops.length) {
                console.debug(`Filtered ${intersections.length - rooftops.length} invalid building heights`);
            }
            
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
    cache.lastVerticalCheck = playerPosition.height;
    cache.rooftopData = [];
    
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