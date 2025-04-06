/**
 * Performs a ray cast to check for building collision below the player
 * 
 * @param {Object} viewer - Cesium viewer instance
 * @param {Object} playerPosition - Player position in Cartographic coordinates
 * @param {Object} osmBuildingsTileset - OSM Buildings tileset
 * @param {number} maxDistance - Maximum distance for ray cast (how far down to check)
 * @returns {Object} Object with properties: { hit: boolean, height: number }
 */
export function checkBuildingCollision(viewer, playerPosition, osmBuildingsTileset, maxDistance = 150.0) {
    // Default result (no hit)
    const result = {
        hit: false,
        height: 0
    };
    
    // Check if we have a valid scene, viewer and tileset
    if (!viewer || !viewer.scene || !osmBuildingsTileset) {
        console.warn("Missing required objects for building collision check");
        return result;
    }

    // Instead of checking tileset.ready, we'll assume the tileset is available
    // since loadOsmBuildings already awaits the readyPromise

    try {
        // Create ray starting point at player position
        // Add a small height offset to ensure we're starting above any potential buildings
        const heightOffset = 1.0; // 1 meter above current position
        const rayStartHeight = playerPosition.height + heightOffset;
        
        const playerCartesian = Cesium.Cartesian3.fromRadians(
            playerPosition.longitude,
            playerPosition.latitude,
            rayStartHeight
        );
        
        // Get the local east-north-up (ENU) frame at player position
        const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(playerCartesian);
        
        // Create downward direction vector in local ENU frame (negative Z/Up axis)
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
        // First attempt: drill pick with explicit tileset array
        let intersections = viewer.scene.drillPickFromRay(ray, maxDistance, [osmBuildingsTileset]);
        
        // If no results, try without specifying the tileset (will check all primitives)
        if (!intersections || intersections.length === 0) {
            intersections = viewer.scene.drillPickFromRay(ray, maxDistance);
            // console.log("Fallback ray cast found intersections:", intersections ? intersections.length : 0);
        }
        
        if (!intersections || intersections.length === 0) {
            // console.log("No intersections found in ray cast");
            return result;
        }
        
        // Debug: Log number of intersections found
        // console.log(`Found ${intersections.length} intersections in ray cast`);
        
        // Process results - handle different possible formats of intersection results
        let closestIntersection = null;
        let closestDistance = Infinity;
        
        for (let i = 0; i < intersections.length; i++) {
            const intersection = intersections[i];
            
            // Skip null intersections
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
                    // console.log("Skipping intersection without position:", intersection);
                    continue;
                }
            }
            
            const distance = Cesium.Cartesian3.distance(playerCartesian, position);
            
            // Convert to cartographic to get height
            const intersectionCartographic = Cesium.Cartographic.fromCartesian(position);
            
            // Ensure we're below the player (within reason)
            const isBelow = intersectionCartographic.height < rayStartHeight - 0.5; // Small threshold
            
            if (isBelow && distance < closestDistance && distance > 0.01) { // Avoid extremely small distances
                closestDistance = distance;
                closestIntersection = {
                    position: position,
                    cartographic: intersectionCartographic
                };
            }
        }
        
        // If we found a valid intersection
        if (closestIntersection && closestIntersection.position) {
            // We've already calculated the cartographic in the loop above
            const intersectionCartographic = closestIntersection.cartographic;
            
            // For debugging - uncomment to log the actual building height
            console.log(`Building collision at height: ${intersectionCartographic.height.toFixed(2)}m`);
            
            // Return hit result with building height
            result.hit = true;
            result.height = intersectionCartographic.height;
        }
    } catch (error) {
        console.error("Error in building collision detection:", error);
    }
    
    return result;
}