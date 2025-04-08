// Import the groundHeight and DRAMATIC_FALL_HEIGHT constants from initial-setup.js
import { groundHeight, DRAMATIC_FALL_HEIGHT } from './initial-setup.js';

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
        return document.getElementById('coordsModal'); // Return existing modal
    }

    const modal = document.createElement('div');
    modal.id = 'coordsModal';
    modal.className = 'coords-modal';

    modal.innerHTML = `
        <div class="coords-modal-content">
            <span class="close-button">×</span>
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

    // Add styles for the modal (only if not already added)
    if (!document.getElementById('coordsModalStyle')) {
        const style = document.createElement('style');
        style.id = 'coordsModalStyle'; // Add ID to prevent duplicate styles
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
    }

    return modal;
}

// 4. Function to show the coordinates modal
function showCoordinatesModal() {
    const modal = document.getElementById('coordsModal') || createCoordinatesModal();
    modal.style.display = 'block';

    // Focus on the first input
    setTimeout(() => {
        document.getElementById('latitudeInput').focus();
    }, 100);

    // Set up the go button functionality if not already set
    const goButton = document.getElementById('goToCoordinates');
    // Use a property to track if listener is added to prevent duplicates
    if (goButton && !goButton._hasClickListener) {
        goButton.addEventListener('click', handleCustomCoordinates);
        goButton._hasClickListener = true; // Mark listener as added
    }
}

// 5. Function to handle custom coordinates submission
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

// 6. Update the setupInputListeners function to handle new location options
export function setupLocationOptions(
    inputState, playerPosition, verticalVelocityRef, playerHeadingRef,
    updateDirectionVectorsFunc, forwardDirection, rightDirection,
    citiesData, cesiumViewer, miniMapInstance, cameraSystemInstance,
    terrainManager, instructionsElement, fallStateRef
) {
    // Create the coordinates modal (ensures it exists)
    createCoordinatesModal();

    // Add new options to the city selector
    const citySelector = document.getElementById('citySelector');

    // Add a separator and new options if they don't exist
    if (!document.getElementById('currentLocationOption')) {
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '─────────────';
        citySelector.appendChild(separator);

        const currentLocationOption = document.createElement('option');
        currentLocationOption.id = 'currentLocationOption';
        currentLocationOption.value = 'current-location';
        currentLocationOption.textContent = '📍 Use My Location';
        citySelector.appendChild(currentLocationOption);

        const customCoordsOption = document.createElement('option');
        customCoordsOption.id = 'customCoordsOption';
        customCoordsOption.value = 'custom-coordinates';
        customCoordsOption.textContent = '🔍 Enter Coordinates...';
        citySelector.appendChild(customCoordsOption);
    }

    // Store the original selected value to revert if user cancels/fails
    let originalCitySelection = citySelector.value;

    // Handle city selector changes
    citySelector.addEventListener('change', async (event) => {
        const selectedOption = event.target.value;

        // Handle special options
        if (selectedOption === 'current-location') {
            // Reset the selector immediately to show 'Select City' or previous city
            citySelector.value = originalCitySelection;

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
                // On success, update original selection (optional, depends on desired behavior)
                // originalCitySelection = selectedOption; // Or maybe keep it as the city name?
            } catch (error) {
                console.error('Error getting user location:', error);
                instructionsElement.classList.remove('loading');
                instructionsElement.innerHTML = `Could not access location: ${error.message}`;
                setTimeout(() => { // Reset instructions after delay
                    if(fallStateRef.isInInitialFall){
                         instructionsElement.innerHTML = `Entering city... Brace for impact!`; // Or similar appropriate message
                    } else {
                         instructionsElement.innerHTML = `W/S: Move | A/D: Strafe | Arrows: Look | Space: Jump`;
                    }
                }, 5000);
            }
            return; // Prevent default city change logic
        } else if (selectedOption === 'custom-coordinates') {
            // Reset the selector immediately
            citySelector.value = originalCitySelection;

            // Show the coordinates input modal
            showCoordinatesModal();
            return; // Prevent default city change logic
        } else if (citiesData[selectedOption]) {
             // Update the original selection only when a valid city is chosen
             originalCitySelection = selectedOption;
             // Default city change logic is handled by the listener in initial-setup.js
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
                terrainHeight = groundHeight; // Use constant imported from initial-setup.js
            }

            // Reset player state
            playerPosition.longitude = Cesium.Math.toRadians(coords.longitude);
            playerPosition.latitude = Cesium.Math.toRadians(coords.latitude);

            // Set player height for dramatic fall using constant from initial-setup.js
            playerPosition.height = DRAMATIC_FALL_HEIGHT;
            console.log(`Setting initial player height to: ${playerPosition.height}m`);

            // Reset fall state
            fallStateRef.isInInitialFall = true;
            fallStateRef.initialFallComplete = false;
            fallStateRef.fallStartTime = performance.now();

            // Reset physics state
            verticalVelocityRef.value = -10.0;
            playerHeadingRef.value = Cesium.Math.toRadians(0.0);

            // Update direction vectors
            updateDirectionVectorsFunc(playerHeadingRef.value, forwardDirection, rightDirection);

            // Reset minimap
            if (miniMapInstance) {
                miniMapInstance.update(playerPosition, playerHeadingRef.value);
            }

            // Update UI
            if (instructionsElement) {
                instructionsElement.classList.remove('loading');
                instructionsElement.innerHTML = `Teleporting to ${displayName}...`;
            }

            // Use camera system for teleportation
            if (cameraSystemInstance) {
                const teleportCameraPitch = Cesium.Math.toRadians(-15);
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
                const targetWorldPos = Cesium.Cartesian3.fromRadians(
                    playerPosition.longitude, playerPosition.latitude, playerPosition.height
                );
                await cesiumViewer.camera.flyTo({
                    destination: targetWorldPos,
                    orientation: {
                        heading: playerHeadingRef.value,
                        pitch: Cesium.Math.toRadians(-30.0),
                        roll: 0.0
                    },
                    duration: 1.5 // Keep a short duration for quick teleport
                });
            }
            // Update original selection after successful custom teleport
            // originalCitySelection = 'custom'; // Or a placeholder value
            // Or maybe don't update it, so the dropdown still shows the last *city*

        } catch (error) {
            console.error(`Error teleporting to ${displayName}:`, error);

            // Fallback position using default ground height
            playerPosition.longitude = Cesium.Math.toRadians(coords.longitude);
            playerPosition.latitude = Cesium.Math.toRadians(coords.latitude);
            playerPosition.height = groundHeight + 1.0; // Use constant from initial-setup.js

            // Reset physics state
            verticalVelocityRef.value = 0;

            // Update UI
            if (instructionsElement) {
                instructionsElement.classList.remove('loading');
                instructionsElement.innerHTML = `Error loading location. Using default elevation.`;
                setTimeout(() => { // Reset instructions
                    if(fallStateRef.isInInitialFall){
                         instructionsElement.innerHTML = `Entering city... Brace for impact!`; // Or similar
                    } else {
                         instructionsElement.innerHTML = `W/S: Move | A/D: Strafe | Arrows: Look | Space: Jump`;
                    }
                }, 3000);
            }

            // Still attempt camera teleportation to the fallback position
            if (cameraSystemInstance) {
                cameraSystemInstance.teleport(playerPosition, playerHeadingRef.value, 1.0);
            }
        }
    });
}