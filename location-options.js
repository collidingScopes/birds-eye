// Import the groundHeight and DRAMATIC_FALL_HEIGHT constants
import { groundHeight, DRAMATIC_FALL_HEIGHT } from './helper-functions.js';

// 1. First, let's create a function to handle getting the user's location
function getUserLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by your browser'));
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    longitude: position.coords.longitude,
                    latitude: position.coords.latitude
                });
            },
            (error) => {
                reject(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });
}

// 2. Create custom coordinates modal
function createCoordinatesModal() {
    // Check if modal already exists
    if (document.getElementById('coordsModal')) {
        return;
    }
    
    const modal = document.createElement('div');
    modal.id = 'coordsModal';
    modal.className = 'coords-modal';
    
    modal.innerHTML = `
        <div class="coords-modal-content">
            <span class="close-button">&times;</span>
            <h3>Enter Coordinates</h3>
            <div class="input-group">
                <label for="latitudeInput">Latitude:</label>
                <input type="number" id="latitudeInput" step="0.0001" placeholder="e.g. 40.7580" min="-90" max="90">
            </div>
            <div class="input-group">
                <label for="longitudeInput">Longitude:</label>
                <input type="number" id="longitudeInput" step="0.0001" placeholder="e.g. -73.9854" min="-180" max="180">
            </div>
            <button id="goToCoordinates">Go to Location</button>
            <p class="coord-info">Enter decimal coordinates (e.g., 40.7580, -73.9854 for NYC)</p>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    const closeButton = modal.querySelector('.close-button');
    closeButton.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    // Close modal when clicking outside the content
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    // Add styles for the modal
    const style = document.createElement('style');
    style.textContent = `
        .coords-modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            overflow: auto;
        }
        
        .coords-modal-content {
            background-color: rgba(30, 30, 30, 0.9);
            margin: 15% auto;
            padding: 20px;
            border: 1px solid #888;
            border-radius: 8px;
            width: 300px;
            max-width: 80%;
            color: white;
            font-family: Arial, sans-serif;
        }
        
        .coords-modal h3 {
            margin-top: 0;
            color: #ffffff;
        }
        
        .close-button {
            color: #aaa;
            float: right;
            font-size: 28px;
            font-weight: bold;
            cursor: pointer;
        }
        
        .close-button:hover {
            color: #fff;
        }
        
        .input-group {
            margin-bottom: 15px;
        }
        
        .input-group label {
            display: block;
            margin-bottom: 5px;
            color: #ccc;
        }
        
        .input-group input {
            width: 100%;
            padding: 8px;
            border: 1px solid #444;
            border-radius: 4px;
            background-color: #333;
            color: white;
            box-sizing: border-box;
        }
        
        #goToCoordinates {
            width: 100%;
            padding: 10px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
        }
        
        #goToCoordinates:hover {
            background-color: #45a049;
        }
        
        .coord-info {
            margin-top: 15px;
            font-size: 12px;
            color: #aaa;
        }
    `;
    document.head.appendChild(style);
    
    return modal;
}

// 3. Function to show the coordinates modal
function showCoordinatesModal() {
    const modal = document.getElementById('coordsModal') || createCoordinatesModal();
    modal.style.display = 'block';
    
    // Focus on the first input
    setTimeout(() => {
        document.getElementById('latitudeInput').focus();
    }, 100);
    
    // Set up the go button functionality if not already set
    const goButton = document.getElementById('goToCoordinates');
    if (goButton && !goButton._hasClickListener) {
        goButton.addEventListener('click', handleCustomCoordinates);
        goButton._hasClickListener = true;
    }
}

// 4. Function to handle custom coordinates submission
function handleCustomCoordinates() {
    const latInput = document.getElementById('latitudeInput');
    const lngInput = document.getElementById('longitudeInput');
    
    let lat = parseFloat(latInput.value);
    let lng = parseFloat(lngInput.value);
    
    // Validate inputs
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        alert('Please enter valid coordinates!\nLatitude: -90 to 90\nLongitude: -180 to 180');
        return;
    }
    
    // Close the modal
    const modal = document.getElementById('coordsModal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Dispatch custom event with the coordinates
    const event = new CustomEvent('customLocationSelected', {
        detail: {
            latitude: lat,
            longitude: lng,
            displayName: `${lat.toFixed(4)}, ${lng.toFixed(4)}`
        }
    });
    document.dispatchEvent(event);
}

// 5. Update the setupInputListeners function to handle new location options
export function setupLocationOptions(
    inputState, playerPosition, verticalVelocityRef, playerHeadingRef,
    updateDirectionVectorsFunc, forwardDirection, rightDirection,
    citiesData, cesiumViewer, miniMapInstance, cameraSystemInstance, 
    terrainManager, instructionsElement, fallStateRef
) {
    // Create the coordinates modal
    createCoordinatesModal();
    
    // Add new options to the city selector
    const citySelector = document.getElementById('citySelector');
    
    // Add a separator and new options if they don't exist
    if (!document.getElementById('currentLocationOption')) {
        // Add separator
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '─────────────';
        citySelector.appendChild(separator);
        
        // Add current location option
        const currentLocationOption = document.createElement('option');
        currentLocationOption.id = 'currentLocationOption';
        currentLocationOption.value = 'current-location';
        currentLocationOption.textContent = '📍 Use My Location';
        citySelector.appendChild(currentLocationOption);
        
        // Add custom coordinates option
        const customCoordsOption = document.createElement('option');
        customCoordsOption.id = 'customCoordsOption';
        customCoordsOption.value = 'custom-coordinates';
        customCoordsOption.textContent = '🔍 Enter Coordinates...';
        citySelector.appendChild(customCoordsOption);
    }
    
    // Handle city selector changes
    citySelector.addEventListener('change', async (event) => {
        const selectedOption = event.target.value;
        
        // Handle special options
        if (selectedOption === 'current-location') {
            // Reset the selector to avoid re-triggering when selecting the same option again
            citySelector.value = '';
            
            // Try to get user's location
            try {
                instructionsElement.innerHTML = `Getting your location...`;
                instructionsElement.classList.add('loading');
                
                const position = await getUserLocation();
                console.log(`Got user location: ${position.latitude}, ${position.longitude}`);
                
                // Trigger teleport with user's coordinates
                const event = new CustomEvent('customLocationSelected', {
                    detail: {
                        latitude: position.latitude,
                        longitude: position.longitude,
                        displayName: 'Your Location'
                    }
                });
                document.dispatchEvent(event);
            } catch (error) {
                console.error('Error getting user location:', error);
                instructionsElement.classList.remove('loading');
                instructionsElement.innerHTML = `Could not access your location: ${error.message}`;
                
                // Reset instructions after 3 seconds
                setTimeout(() => {
                    instructionsElement.innerHTML = `W/S: Move | A/D: Strafe | Arrows: Look | Space: Jump`;
                }, 5000);
            }
            return;
        } else if (selectedOption === 'custom-coordinates') {
            // Reset the selector to avoid re-triggering
            citySelector.value = '';
            
            // Show the coordinates input modal
            showCoordinatesModal();
            return;
        }
    });
    
    // Listen for custom location events (from geolocation or custom coordinates)
    document.addEventListener('customLocationSelected', async (event) => {
        const coords = event.detail;
        const displayName = coords.displayName || `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;
        
        console.log(`Teleporting to custom location: ${displayName}`);
        
        // Update UI to show loading state
        if (instructionsElement) {
            instructionsElement.innerHTML = `Loading ${displayName}...`;
            instructionsElement.classList.add('loading');
        }
        
        try {
            // Pre-sample terrain at destination
            let terrainHeight;
            
            if (terrainManager) {
                terrainHeight = await terrainManager.prepareDestination(
                    coords.longitude,
                    coords.latitude
                );
                console.log(`Terrain height at ${displayName}: ${terrainHeight}m`);
            } else {
                console.warn("No terrain manager available, using default ground height");
                terrainHeight = groundHeight || 0.5;
            }
            
            // Reset player state
            playerPosition.longitude = Cesium.Math.toRadians(coords.longitude);
            playerPosition.latitude = Cesium.Math.toRadians(coords.latitude);
            
            // Set the player position height for dramatic fall
            playerPosition.height = DRAMATIC_FALL_HEIGHT;
            console.log(`Setting initial player height to: ${playerPosition.height}m`);
            
            // Reset fall state - ENABLE the fall state
            fallStateRef.isInInitialFall = true;
            fallStateRef.initialFallComplete = false;
            fallStateRef.fallStartTime = performance.now();
            
            // Reset physics state for the dramatic fall
            verticalVelocityRef.value = -10.0; // Initial downward velocity
            playerHeadingRef.value = Cesium.Math.toRadians(0.0); // Reset heading to North
            
            // Update direction vectors for new heading
            updateDirectionVectorsFunc(playerHeadingRef.value, forwardDirection, rightDirection);
            
            // Reset minimap
            if (miniMapInstance) {
                miniMapInstance.update(playerPosition, playerHeadingRef.value);
            }
            
            // Update UI to show teleportation state
            if (instructionsElement) {
                instructionsElement.classList.remove('loading');
                instructionsElement.innerHTML = `Teleporting to ${displayName}...`;
            }
            
            // Use camera system for teleportation with a dramatic view
            if (cameraSystemInstance) {
                const teleportCameraPitch = Cesium.Math.toRadians(-15); // Look down from above
                const teleportDuration = 0.0;
                
                await cameraSystemInstance.teleport(
                    playerPosition, 
                    playerHeadingRef.value, 
                    teleportDuration, 
                    teleportCameraPitch
                );
                
                console.log("Teleportation complete, drama fall active");
                
                if (instructionsElement) {
                    instructionsElement.innerHTML = `Entering ${displayName}... Brace for impact!`;
                }
            } else {
                console.error("Camera System not available for teleport.");
                // Fallback to basic camera movement
                const targetWorldPos = Cesium.Cartesian3.fromRadians(
                    playerPosition.longitude,
                    playerPosition.latitude,
                    playerPosition.height
                );
                await cesiumViewer.camera.flyTo({
                    destination: targetWorldPos,
                    orientation: {
                        heading: playerHeadingRef.value,
                        pitch: Cesium.Math.toRadians(-30.0),
                        roll: 0.0
                    },
                    duration: 1.5
                });
            }
        } catch (error) {
            console.error(`Error teleporting to ${displayName}:`, error);
            
            // Fallback to standard location if terrain sampling fails
            playerPosition.longitude = Cesium.Math.toRadians(coords.longitude);
            playerPosition.latitude = Cesium.Math.toRadians(coords.latitude);
            playerPosition.height = (groundHeight || 0.5) + 1.0; // Use default ground height + 1.0
            
            // Reset physics state
            verticalVelocityRef.value = 0;
            
            // Update UI to show error state
            if (instructionsElement) {
                instructionsElement.classList.remove('loading');
                instructionsElement.innerHTML = `Error loading location. Using default elevation.`;
                
                // Reset instructions after 3 seconds
                setTimeout(() => {
                    instructionsElement.innerHTML = `W/S: Move | A/D: Strafe | Arrows: Look | Space: Jump`;
                }, 3000);
            }
            
            // Still attempt camera teleportation
            if (cameraSystemInstance) {
                cameraSystemInstance.teleport(playerPosition, playerHeadingRef.value, 1.0);
            }
        }
    });
}