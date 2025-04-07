// Improved Mini-map implementation with additional road names and secondary roads
class MiniMap {
    constructor(radius) { // Increased radius to show a wider area (500m)
        this.radius = radius; // Search radius in meters
        this.canvas = document.createElement('canvas');
        this.canvas.width = 200;
        this.canvas.height = 200;
        this.canvas.id = 'minimapCanvas';
        this.ctx = this.canvas.getContext('2d');
        this.container = document.createElement('div');
        this.container.id = 'minimapContainer';
        this.container.appendChild(this.canvas);
        document.body.appendChild(this.container);
        
        this.isLoading = false;
        this.hasData = false;
        this.currentData = null;
        this.lastQueryLocation = null;
        this.queryThreshold = 150; // Increased threshold to reduce queries
        this.lastQueryTime = 0;
        this.queryInterval = 1000; // Minimum time between queries (ms)
        
        // Keep track of player position and heading for drawing
        this.playerLat = 0;
        this.playerLon = 0;
        this.playerHeading = 0;
        
        // Coordinate bounds of current data
        this.bounds = {
            minLat: 0, maxLat: 0,
            minLon: 0, maxLon: 0
        };
        
        // Current neighborhood name
        this.neighborhood = "";
        
        // Setup the container styles
        this.setupStyles();
    
        // Create a toggle button
        this.toggleButton = document.createElement('button');
        this.toggleButton.id = 'minimapToggle';
        this.toggleButton.innerText = 'Hide Map';
        this.toggleButton.addEventListener('click', () => this.toggleMinimap());
        document.body.appendChild(this.toggleButton); // Append to body instead of container
        
        this.visible = true;
    }
    
    setupStyles() {
        // Apply styles programmatically
        this.container.style.position = 'absolute';
        this.container.style.top = '10px';
        this.container.style.right = '10px';
        this.container.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
        this.container.style.borderRadius = '50%';
        this.container.style.overflow = 'hidden';
        this.container.style.zIndex = '5';
        this.container.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
        this.container.style.border = '2px solid rgba(255, 255, 255, 0.3)';
        this.container.style.display = 'block'; // Ensure visibility is controlled here
    }
    
    toggleMinimap() {
        this.visible = !this.visible;
        if (this.visible) {
            this.container.style.display = 'block';
            this.toggleButton.innerText = 'Hide Map';
        } else {
            this.container.style.display = 'none';
            this.toggleButton.innerText = 'Show Map';
        }
    }
    
    // Convert lat/lon to canvas x/y, keeping player centered
    toCanvasCoords(lat, lon) {
        const canvas = this.canvas;
        
        // Calculate the distance from player in degrees
        const latDiff = lat - this.playerLat;
        const lonDiff = lon - this.playerLon;
        
        // Center-based mapping - player is always in center
        const x = (canvas.width / 2) + (lonDiff * (canvas.width / (this.bounds.maxLon - this.bounds.minLon)));
        const y = (canvas.height / 2) - (latDiff * (canvas.height / (this.bounds.maxLat - this.bounds.minLat)));
        
        return { x, y };
    }
    
    // Main update function to be called from the game loop
    update(playerPosition, playerHeading) {
        this.playerLat = Cesium.Math.toDegrees(playerPosition.latitude);
        this.playerLon = Cesium.Math.toDegrees(playerPosition.longitude);
        this.playerHeading = playerHeading;
        
        // Check if we need to fetch new data
        const shouldFetch = this.shouldFetchNewData();
        if (shouldFetch) {
            this.fetchMapData();
        }
        
        // Draw the mini-map if we have data
        if (this.hasData) {
            this.draw();
        }
    }
    
    shouldFetchNewData() {
        const now = Date.now();
        
        // Don't fetch if we're already loading
        if (this.isLoading) return false;
        
        // Don't fetch if we've fetched recently
        if (now - this.lastQueryTime < this.queryInterval) return false;
        
        // First time fetching
        if (!this.lastQueryLocation) return true;
        
        // Calculate distance to last query location
        const distance = this.calculateDistance(
            this.playerLat, this.playerLon,
            this.lastQueryLocation.lat, this.lastQueryLocation.lon
        );
        
        // Fetch if we've moved far enough
        return distance > this.queryThreshold;
    }
    
    calculateDistance(lat1, lon1, lat2, lon2) {
        // Approximate distance calculation in meters
        const R = 6371e3; // Earth radius in meters
        const φ1 = lat1 * Math.PI/180;
        const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180;
        const Δλ = (lon2-lon1) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c; // Distance in meters
    }
    
    async fetchMapData() {
        this.isLoading = true;
        this.lastQueryTime = Date.now();
        this.lastQueryLocation = { lat: this.playerLat, lon: this.playerLon };
        
        try {
            // Modified query to include secondary roads
            const radius = this.radius;
            const query = `
                [out:json];
                (
                    way["highway"~"motorway|trunk|primary|secondary"](around:${radius},${this.playerLat},${this.playerLon});
                    relation["place"="neighbourhood"](around:${radius},${this.playerLat},${this.playerLon});
                );
                out body;
                >;
                out skel qt;
            `;
            
            // Perform API request with 10s timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                body: 'data=' + encodeURIComponent(query),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`Overpass API returned ${response.status}`);
            }
            
            const data = await response.json();
            this.processData(data);
            
            // Also get neighborhood data
            this.fetchNeighborhoodData();
            
        } catch (error) {
            console.warn('Error fetching map data:', error);
            // If we failed to load data, try again later
            this.hasData = this.hasData && this.currentData !== null;
        } finally {
            this.isLoading = false;
        }
    }
    
    async fetchNeighborhoodData() {
        try {
            const query = `
                [out:json];
                is_in(${this.playerLat},${this.playerLon})->.a;
                relation(pivot.a)["place"="neighbourhood"];
                out tags;
            `;
            
            const response = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                body: 'data=' + encodeURIComponent(query),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.elements && data.elements.length > 0) {
                    // Find neighborhood with name
                    const neighborhood = data.elements.find(el => el.tags && el.tags.name);
                    if (neighborhood) {
                        this.neighborhood = neighborhood.tags.name;
                    }
                }
            }
        } catch (error) {
            console.warn('Error fetching neighborhood data:', error);
        }
    }
    
    processData(data) {
        // Skip if no elements
        if (!data || !data.elements || data.elements.length === 0) {
            this.hasData = false;
            return;
        }
        
        // Process and store data
        this.currentData = data;
        
        // Calculate bounds
        let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
        
        // Get all nodes (both standalone and from ways)
        const nodes = {};
        
        // First pass: collect all nodes
        data.elements.forEach(el => {
            if (el.type === 'node') {
                nodes[el.id] = { lat: el.lat, lon: el.lon };
                
                // Update bounds
                minLat = Math.min(minLat, el.lat);
                maxLat = Math.max(maxLat, el.lat);
                minLon = Math.min(minLon, el.lon);
                maxLon = Math.max(maxLon, el.lon);
            }
        });
        
        // Second pass: collect way nodes
        data.elements.forEach(el => {
            if (el.type === 'way' && el.nodes) {
                el.nodes.forEach(nodeId => {
                    if (nodes[nodeId]) {
                        const node = nodes[nodeId];
                        minLat = Math.min(minLat, node.lat);
                        maxLat = Math.max(maxLat, node.lat);
                        minLon = Math.min(minLon, node.lon);
                        maxLon = Math.max(maxLon, node.lon);
                    }
                });
            }
        });
        
        // Add a small buffer around the bounds
        const buffer = 0.0001; // About 10 meters
        this.bounds = {
            minLat: minLat - buffer,
            maxLat: maxLat + buffer,
            minLon: minLon - buffer,
            maxLon: maxLon + buffer
        };
        
        this.hasData = true;
    }
    
    draw() {
        const ctx = this.ctx;
        const canvas = this.canvas;
        const data = this.currentData;
        
        if (!data || !data.elements) return;
        
        // Clear canvas
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw grid
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 0.5;
        const gridSize = 40; // Larger grid size for cleaner look
        
        for (let i = 0; i < canvas.width; i += gridSize) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, canvas.height);
            ctx.stroke();
        }
        
        for (let i = 0; i < canvas.height; i += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(canvas.width, i);
            ctx.stroke();
        }
        
        // Collection of nodes for ways
        const nodes = {};
        
        // First, collect all nodes
        data.elements.forEach(el => {
            if (el.type === 'node') {
                nodes[el.id] = { lat: el.lat, lon: el.lon, tags: el.tags };
            }
        });
        
        // Draw major roads with their names
        ctx.lineWidth = 2;
        
        // Store road lines for later labeling
        const roadSegments = [];
        
        data.elements.forEach(el => {
            if (el.type === 'way' && el.tags && el.tags.highway) {
                // Include secondary roads now
                if (!['motorway', 'trunk', 'primary', 'secondary'].includes(el.tags.highway)) {
                    return;
                }
                
                ctx.beginPath();
                
                // Style based on road type
                switch (el.tags.highway) {
                    case 'motorway':
                    case 'trunk':
                        ctx.strokeStyle = '#ff6600';
                        ctx.lineWidth = 3;
                        break;
                    case 'primary':
                        ctx.strokeStyle = '#ffcc00';
                        ctx.lineWidth = 2;
                        break;
                    case 'secondary':
                        ctx.strokeStyle = '#cccc00'; // Yellow-ish for secondary roads
                        ctx.lineWidth = 1.5;
                        break;
                    default:
                        return; // Skip other road types
                }
                
                // Draw the road
                let firstNode = true;
                let points = [];
                
                el.nodes.forEach(nodeId => {
                    if (nodes[nodeId]) {
                        const node = nodes[nodeId];
                        const point = this.toCanvasCoords(node.lat, node.lon);
                        points.push(point);
                        
                        if (firstNode) {
                            ctx.moveTo(point.x, point.y);
                            firstNode = false;
                        } else {
                            ctx.lineTo(point.x, point.y);
                        }
                    }
                });
                
                ctx.stroke();
                
                // Store road segment for labeling if it has a name
                if (el.tags.name && points.length > 1) {
                    // Find middle point of the way for label placement
                    const midIndex = Math.floor(points.length / 2) - 1;
                    const p1 = points[midIndex];
                    const p2 = points[midIndex + 1];
                    
                    if (p1 && p2) {
                        roadSegments.push({
                            name: el.tags.name,
                            type: el.tags.highway,
                            p1: p1,
                            p2: p2,
                            midX: (p1.x + p2.x) / 2,
                            midY: (p1.y + p2.y) / 2,
                            angle: Math.atan2(p2.y - p1.y, p2.x - p1.x),
                            // Calculate length of road segment on screen for importance
                            length: Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))
                        });
                    }
                }
            }
        });
        
        // Sort road segments by importance (highway type) and length
        roadSegments.sort((a, b) => {
            // First sort by road type importance
            const typeImportance = { 'motorway': 4, 'trunk': 3, 'primary': 2, 'secondary': 1 };
            const typeA = typeImportance[a.type] || 0;
            const typeB = typeImportance[b.type] || 0;
            
            if (typeB !== typeA) {
                return typeB - typeA;
            }
            
            // Then by segment length (longer segments are more important)
            return b.length - a.length;
        });
        
        // Increased to 7 road labels
        const maxLabels = 7;
        const importantRoads = roadSegments.slice(0, maxLabels);
        
        // Add road labels with de-duplication
        ctx.font = '14px Arial'; // Increased font size
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3; // Thicker outline for better visibility
        
        // De-duplicate road labels by name
        const labeledRoads = {};
        
        importantRoads.forEach(segment => {
            // Skip if we've already labeled this road
            if (labeledRoads[segment.name]) return;
            
            // Mark this road as labeled
            labeledRoads[segment.name] = true;
            
            ctx.save();
            
            // Position at the middle of the segment
            ctx.translate(segment.midX, segment.midY);
            
            // Rotate text to match road direction
            let angle = segment.angle;
            
            // Adjust angle to make text readable from bottom to top
            if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
                angle += Math.PI;
            }
            
            ctx.rotate(angle);
            
            // Style based on road type
            switch (segment.type) {
                case 'motorway':
                case 'trunk':
                    ctx.fillStyle = '#ffffff';
                    break;
                case 'primary':
                    ctx.fillStyle = '#ffffff';
                    break;
                case 'secondary':
                    ctx.fillStyle = '#dddddd'; // Slightly darker for secondary roads
                    break;
                default:
                    ctx.fillStyle = '#cccccc';
            }
            
            // Draw text with outline
            ctx.strokeText(segment.name, 0, 0);
            ctx.fillText(segment.name, 0, 0);
            
            ctx.restore();
        });
        
        // Draw neighborhood name in the top-left corner
        if (this.neighborhood) {
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#33ccff'; // Light blue for neighborhood name
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
            
            // Position in upper right with padding
            const padding = 20;
            ctx.strokeText(this.neighborhood, padding, padding);
            ctx.fillText(this.neighborhood, padding, padding);
        }
        
        // Draw player position (always centered)
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        
        // Draw player direction (triangle)
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(this.playerHeading); // Don't negate heading for correct direction
        
        // Player marker
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.moveTo(0, -12); // Point at top
        ctx.lineTo(-8, 8); // Bottom left
        ctx.lineTo(8, 8);  // Bottom right
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
        
        // Draw a compass rose in the corner
        this.drawCompass();
        
        // Draw circular mask
        ctx.globalCompositeOperation = 'destination-in';
        ctx.beginPath();
        ctx.arc(canvas.width/2, canvas.height/2, canvas.width/2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        
        // Draw border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(canvas.width/2, canvas.height/2, canvas.width/2 - 1, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    drawCompass() {
        const ctx = this.ctx;
        const center = { x: this.canvas.width/2, y: this.canvas.height/2 };
        const radius = 40;
        
        ctx.save();
        ctx.translate(center.x, center.y);

        // Draw compass points
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // North
        ctx.fillStyle = '#ff6666';
        ctx.fillText('N', 0, -radius*2);
        
        // East
        ctx.fillStyle = 'white';
        ctx.fillText('E', radius*2, 0);
        
        // South
        ctx.fillText('S', 0, radius*2);
        
        // West
        ctx.fillText('W', -radius*2, 0);
        
        ctx.restore();
    }
}

// Export the MiniMap class
window.MiniMap = MiniMap;