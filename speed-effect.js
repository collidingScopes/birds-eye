/**
 * ShaderSpeedEffect class
 * Creates a wind tunnel/rushing air effect using Three.js and shaders
 * Uses a performant WebGL implementation
 */
export class ShaderSpeedEffect {
    /**
     * Creates a new shader-based speed effect
     * @param {HTMLElement} parentElement - The parent element to attach the effect to
     * @param {Object} THREE - The THREE.js library instance
     */
    constructor(parentElement, THREE) {
        // Store the THREE instance
        this.THREE = THREE || window.THREE; // Try using global THREE if not provided
        
        if (!this.THREE) {
            console.error('THREE.js is required for ShaderSpeedEffect');
            return;
        }
        
        // Initialize properties
        this.active = false;
        this.intensity = 0;
        this.maxIntensity = 2.0;
        this.animationId = null;
        this.lastTime = 0;
        this.parent = parentElement || document.body;
        this.isAirborne = false; // Track airborne state
        
        // Create renderer
        this.createRenderer();
        
        // Create scene, camera and effect mesh
        this.createScene();
        
        // Handle window resize
        window.addEventListener('resize', () => this.handleResize());
    }
    
    /**
     * Create WebGL renderer
     */
    createRenderer() {
        this.renderer = new this.THREE.WebGLRenderer({ 
            alpha: true,
            antialias: true 
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.autoClear = false;
        
        // Style the canvas
        const canvas = this.renderer.domElement;
        canvas.id = 'speedEffectShader';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '10';
        canvas.style.opacity = '0';
        canvas.style.transition = 'opacity 0.2s ease-in-out'; // Faster transition
        
        // Append to parent
        this.parent.appendChild(canvas);
        this.canvas = canvas;
    }
    
    /**
     * Create Three.js scene, camera and effect mesh
     */
    createScene() {
        // Create scene and camera
        this.scene = new this.THREE.Scene();
        this.camera = new this.THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        // Wind tunnel shader material
        const windTunnelShader = {
            uniforms: {
                time: { value: 0 },
                intensity: { value: 0 },
                resolution: { value: new this.THREE.Vector2(window.innerWidth, window.innerHeight) },
                centerPoint: { value: new this.THREE.Vector2(0.5, 0.5) }, // Default center is middle of screen
            },
            vertexShader: `
                varying vec2 vUv;
                
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform float intensity;
                uniform vec2 resolution;
                uniform vec2 centerPoint;
                varying vec2 vUv;
                
                // Hash function for randomness
                float hash(vec2 p) {
                    p = fract(p * vec2(123.34, 456.21));
                    p += dot(p, p + 45.32);
                    return fract(p.x * p.y);
                }
                
                // Line function with smooth edges
                float line(vec2 uv, vec2 start, vec2 end, float width) {
                    vec2 line = end - start;
                    float len = length(line);
                    line = normalize(line);
                    
                    // Vector from start to current position
                    vec2 toPoint = uv - start;
                    
                    // Project onto line
                    float t = clamp(dot(line, toPoint), 0.0, len);
                    vec2 projection = start + line * t;
                    
                    // Distance to line
                    float dist = length(uv - projection);
                    
                    // Smooth step for antialiased line
                    return smoothstep(width, width * 0.5, dist);
                }
                
                void main() {
                    // Center-based coordinates
                    vec2 uv = vUv;
                    vec2 center = centerPoint; // This is the vanishing point
                    
                    // Direction vector from center
                    vec2 dir = uv - center;
                    float distToCenter = length(dir);
                    
                    // Base color - transparent
                    vec4 color = vec4(0.0);
                    
                    // Only render if we have some intensity
                    if (intensity > 0.01) {
                        // Number of wind streams based on intensity
                        int numStreams = int(300.0 * intensity); // Increased from 250 to 350
                        
                        // Speed varies with distance from center - INCREASED SPEED by 60%
                        float speed = 0.6 * intensity;
                        
                        // Wind stream accumulation
                        float windAccum = 0.0;
                        
                        // Create multiple wind streams
                        for (int i = 0; i < 300; i++) { //
                            if (i >= numStreams) break; // Respect dynamic count
                            
                            // Create a "random" angle with hash
                            float angle = hash(vec2(float(i), 23.45)) * 6.28;
                            
                            // Start position - on a circle around the center
                            float radius = 0.1 + 0.9 * hash(vec2(float(i), 78.12));
                            vec2 offset = vec2(cos(angle), sin(angle)) * radius;
                            
                            // Create wind stream position 
                            vec2 pos = center + offset;
                            
                            // Animation - move away from center over time - INCREASED SPEED
                            float t = fract(time * (0.1 + speed * 0.6) + hash(vec2(float(i), 56.78))); // Increased from 0.4 to 0.6
                                                        
                            // Stream length depends on distance and intensity
                            float streamLength = 0.12 + 0.95 * intensity * (0.2 + hash(vec2(float(i), 12.34)) * 0.8); // Increased
                            
                            // Line thickness varies with intensity and randomness - INCREASED THICKNESS
                            float thickness = 0.0015 * intensity * (0.5 + hash(vec2(float(i), 90.12)) * 0.8); // Increased from 0.002 to 0.003
                            
                            // Start and end positions
                            vec2 streamStart = mix(center, pos, t);
                            vec2 streamEnd = mix(center, pos, t + streamLength);
                            
                            // Draw the stream line
                            float stream = line(uv, streamStart, streamEnd, thickness);
                            
                            // Fade based on length and phase - MODIFIED FOR STRONGER APPEARANCE
                            float fade = smoothstep(0.0, 0.15, t) * smoothstep(1.0, 0.75, t);
                            
                            // Add to accumulation - INCREASED OPACITY
                            windAccum += stream * fade * 0.03; // Increased from 0.03 to 0.045
                        }
                        
                        // Add radial glow near center - INCREASED GLOW
                        float glow = smoothstep(0.4, 0.0, distToCenter) * 0.08 * intensity; // Increased from 0.15 to 0.25
                        
                        // Final color with wind streams and glow - INCREASED MAX OPACITY
                        color = vec4(1.0, 1.0, 1.0, min(1.0, windAccum + glow) * intensity); // Increased from 0.8 to 1.0
                    }
                    
                    gl_FragColor = color;
                }
            `
        };
        
        // Create shader material
        this.material = new this.THREE.ShaderMaterial({
            uniforms: windTunnelShader.uniforms,
            vertexShader: windTunnelShader.vertexShader,
            fragmentShader: windTunnelShader.fragmentShader,
            transparent: true,
            depthWrite: false,
            depthTest: false
        });
        
        // Create fullscreen quad
        const geometry = new this.THREE.PlaneGeometry(2, 2);
        this.quad = new this.THREE.Mesh(geometry, this.material);
        this.scene.add(this.quad);
    }
    
    /**
     * Handle window resize
     */
    handleResize() {
        if (!this.renderer || !this.camera) return;
        
        // Update renderer size
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        
        // Update resolution uniform
        if (this.material && this.material.uniforms.resolution) {
            this.material.uniforms.resolution.value.set(
                window.innerWidth, 
                window.innerHeight
            );
        }
    }
    
    /**
     * Set effect intensity (0.0 to 1.0)
     * @param {number} value - Intensity value from 0 to 1
     */
    setIntensity(value) {
        this.intensity = Math.max(0, Math.min(this.maxIntensity, value));
        
        // Update material uniform
        if (this.material && this.material.uniforms.intensity) {
            this.material.uniforms.intensity.value = this.intensity;
        }
        
        // Update canvas opacity based on intensity - INCREASED MAX OPACITY
        if (this.canvas) {
            this.canvas.style.opacity = Math.min(1.0, this.intensity).toString(); // Increased from 0.9 to 1.0
        }
        
        // Activate/deactivate based on intensity
        if (this.intensity > 0.05 && !this.active) {
            this.active = true;
            this.lastTime = performance.now();
            this.animate();
        } else if (this.intensity < 0.05 && this.active) {
            this.active = false;
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
        }
    }
    
    /**
     * Updates effect based on player look direction
     * @param {Object} cameraSystem - The current camera system to get look direction
     */
    updateCameraDirection(cameraSystem) {
        if (!this.material || !this.material.uniforms.centerPoint) return;
        
        if (cameraSystem && typeof cameraSystem.getViewDirection === 'function') {
            // Get the forward view direction
            const viewDir = cameraSystem.getViewDirection();
            
            // Calculate center point (where lines should converge)
            // This creates the effect of wind rushing "past" the player in their view direction
            // Default to center if we can't get direction
            let centerX = 0.5;
            let centerY = 0.5;
            
            if (viewDir) {
                // Create offset based on view direction
                // Invert X because we want streams to come FROM that direction
                // INCREASED OFFSET for more dramatic effect
                centerX = 0.5 - (viewDir.x * 0.2); // Increased from 0.15 to 0.2
                centerY = 0.5 - (viewDir.y * 0.2); // Increased from 0.15 to 0.2
            }
            
            // Update uniform
            this.material.uniforms.centerPoint.value.set(centerX, centerY);
        }
    }
    
    /**
     * Animation loop for the effect
     */
    animate() {
        if (!this.active) return;
        
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastTime) / 1000; // seconds
        this.lastTime = currentTime;
        
        // Update time uniform - INCREASED ANIMATION SPEED
        if (this.material && this.material.uniforms.time) {
            this.material.uniforms.time.value += deltaTime * (0.7 + this.intensity * 2.0); // Increased from 0.5/1.5 to 0.7/2.0
        }
        
        // Render
        this.renderer.render(this.scene, this.camera);
        
        // Continue animation loop if active
        this.animationId = requestAnimationFrame(() => this.animate());
    }
    
    /**
     * Updates effect based on current speed factor and airborne state
     * @param {number} speedFactor - Current speed factor (0.0 to 1.0)
     * @param {number} threshold - Speed threshold to start showing effect
     * @param {Object} [cameraSystem] - Optional camera system to update direction
     * @param {boolean} [isAirborne=false] - Whether the player is airborne
     */
    update(speedFactor, threshold = 0.7, cameraSystem = null, isAirborne = false) {
        // Store airborne state
        this.isAirborne = isAirborne;
        
        // Only show effect if airborne and above threshold
        if (isAirborne && speedFactor > threshold) {
            // Map speedFactor from threshold-1.0 range to 0.0-1.0 range
            const normalizedIntensity = (speedFactor - threshold) / (1.0 - threshold);
            // Apply increased intensity for more dramatic effect
            this.setIntensity(normalizedIntensity * 1.4); // Multiplier for stronger effect
        } else {
            this.setIntensity(0);
        }
        
        // Update camera direction if provided
        if (cameraSystem) {
            this.updateCameraDirection(cameraSystem);
        }
    }
    
    /**
     * Cleanup and remove the effect
     */
    destroy() {
        this.active = false;
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        
        // Clean up Three.js resources
        if (this.quad) {
            this.scene.remove(this.quad);
            this.quad.geometry.dispose();
            this.quad.material.dispose();
        }
        
        if (this.renderer) {
            this.renderer.dispose();
        }
    }
}