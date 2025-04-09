/**
 * ShaderSpeedEffect class - Optimized Version
 * Creates a wind tunnel/rushing air effect using Three.js and shaders
 * Uses a performant WebGL implementation with low performance mode always enabled
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
        
        // Initialize properties with low performance settings
        this.maxStreams = 80; // OPTIMIZATION: Greatly reduced from 300
        this.qualityScale = 0.6; // OPTIMIZATION: Render at reduced resolution
        
        this.active = false;
        this.intensity = 0;
        this.maxIntensity = 2.0;
        this.animationId = null;
        this.lastTime = 0;
        this.parent = parentElement || document.body;
        this.isAirborne = false; // Track airborne state
        this.frameSkip = 0; // OPTIMIZATION: For frame skipping
        
        // Create renderer
        this.createRenderer();
        
        // Create scene, camera and effect mesh
        this.createScene();
        
        // OPTIMIZATION: Use passive event listener for better performance
        window.addEventListener('resize', this.handleResize.bind(this), { passive: true });
    }
    
    /**
     * Create WebGL renderer with low performance optimizations
     */
    createRenderer() {
        // OPTIMIZATION: Create renderer with lowest performance settings
        this.renderer = new this.THREE.WebGLRenderer({ 
            alpha: true,
            antialias: false, // OPTIMIZATION: Disable antialiasing
            powerPreference: 'high-performance', // OPTIMIZATION: Prefer performance
            precision: 'lowp' // OPTIMIZATION: Use low precision for maximum performance
        });
        
        // OPTIMIZATION: Scale rendering resolution by qualityScale factor
        const width = Math.floor(window.innerWidth * this.qualityScale);
        const height = Math.floor(window.innerHeight * this.qualityScale);
        
        this.renderer.setSize(width, height, false);
        this.renderer.setPixelRatio(1); // OPTIMIZATION: Force pixel ratio to 1
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
        canvas.style.transition = 'opacity 0.2s ease-in-out';
        
        // OPTIMIZATION: Scale canvas to full size using CSS for upscaling
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        
        // Append to parent
        this.parent.appendChild(canvas);
        this.canvas = canvas;
    }
    
    /**
     * Create Three.js scene, camera and effect mesh with highly optimized shader
     */
    createScene() {
        // Create scene and camera
        this.scene = new this.THREE.Scene();
        this.camera = new this.THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        // OPTIMIZATION: Simplified shader with minimal calculations for low performance mode
        const windTunnelShader = {
            uniforms: {
                time: { value: 0 },
                intensity: { value: 0 },
                resolution: { value: new this.THREE.Vector2(window.innerWidth, window.innerHeight) },
                centerPoint: { value: new this.THREE.Vector2(0.5, 0.5) },
                maxStreams: { value: this.maxStreams }
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
                uniform float maxStreams;
                varying vec2 vUv;
                
                // OPTIMIZATION: Super efficient hash function
                float hash(float n) {
                    return fract(sin(n) * 43758.5453);
                }
                
                // OPTIMIZATION: Simplified line function using step for better performance
                float line(vec2 uv, vec2 start, vec2 end, float width) {
                    vec2 line = end - start;
                    float len = length(line);
                    line = normalize(line);
                    
                    vec2 toPoint = uv - start;
                    float t = clamp(dot(line, toPoint), 0.0, len);
                    vec2 projection = start + line * t;
                    
                    float dist = length(uv - projection);
                    
                    // OPTIMIZATION: Use cheaper step function instead of smoothstep
                    return step(dist, width);
                }
                
                void main() {
                    // Center-based coordinates
                    vec2 uv = vUv;
                    vec2 center = centerPoint;
                    
                    // Direction vector from center
                    vec2 dir = uv - center;
                    float distToCenter = length(dir);
                    
                    // Base color - transparent
                    vec4 color = vec4(0.0);
                    
                    // Only render if we have some intensity
                    if (intensity > 0.01) {
                        // OPTIMIZATION: Reduce stream count based on intensity
                        int numStreams = int(min(maxStreams, 30.0 + 50.0 * intensity));
                        
                        // Speed varies with distance from center
                        float speed = 0.5 * intensity;
                        
                        // Wind stream accumulation
                        float windAccum = 0.0;
                        
                        // OPTIMIZATION: Unrolled inner loop with reduced iterations
                        // Create multiple wind streams
                        for (int i = 0; i < 150; i++) {
                            if (i >= numStreams) break; // Respect dynamic count
                            
                            // Use efficient hash function with different seeds
                            float seedA = float(i) * 0.1;
                            float seedB = float(i) * 0.2;
                            float seedC = float(i) * 0.3;
                            
                            // Create a "random" angle
                            float angle = hash(seedA) * 6.28;
                            
                            // Start position - on a circle around the center
                            float radius = 0.1 + 0.9 * hash(seedB);
                            vec2 offset = vec2(cos(angle), sin(angle)) * radius;
                            
                            // Create wind stream position 
                            vec2 pos = center + offset;
                            
                            // Animation - move away from center over time
                            float t = fract(time * (0.1 + speed * 0.5) + hash(seedC));
                            
                            // OPTIMIZATION: Simplified stream calculations
                            float streamLength = 0.15 + 0.8 * intensity;
                            // INCREASED THICKNESS for more visible lines
                            float thickness = 0.003 * intensity;
                            
                            // Start and end positions
                            vec2 streamStart = mix(center, pos, t);
                            vec2 streamEnd = mix(center, pos, t + streamLength);
                            
                            // Draw the stream line
                            float stream = line(uv, streamStart, streamEnd, thickness);
                            
                            // Simple fade
                            float fade = (1.0 - t) * t * 4.0;
                            
                            // INCREASED OPACITY by 50%
                            windAccum += stream * fade * 0.08;
                        }
                                                
                        // Final color with wind streams only (no glow)
                        color = vec4(1.0, 1.0, 1.0, min(1.0, windAccum) * intensity);
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
     * Handle window resize with performance optimizations
     */
    handleResize() {
        if (!this.renderer || !this.camera) return;
        
        // OPTIMIZATION: Throttle resize handling with longer delay
        if (this._resizeTimeout) {
            clearTimeout(this._resizeTimeout);
        }
        
        this._resizeTimeout = setTimeout(() => {
            // OPTIMIZATION: Calculate scaled dimensions
            const width = Math.floor(window.innerWidth * this.qualityScale);
            const height = Math.floor(window.innerHeight * this.qualityScale);
            
            // Update renderer size
            this.renderer.setSize(width, height, false);
            
            // Update resolution uniform
            if (this.material && this.material.uniforms.resolution) {
                this.material.uniforms.resolution.value.set(
                    window.innerWidth, 
                    window.innerHeight
                );
            }
            
            this._resizeTimeout = null;
        }, 300); // Longer delay for better performance
    }
    
    /**
     * Set effect intensity with performance optimizations
     * @param {number} value - Intensity value from 0 to 1
     */
    setIntensity(value) {
        this.intensity = Math.max(0, Math.min(this.maxIntensity, value));
        
        // Update material uniform
        if (this.material && this.material.uniforms.intensity) {
            this.material.uniforms.intensity.value = this.intensity;
        }
        
        // Update canvas opacity based on intensity
        if (this.canvas) {
            this.canvas.style.opacity = Math.min(1.0, this.intensity).toString();
        }
        
        // OPTIMIZATION: Higher threshold for activation
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
     * Updates effect based on player look direction with reduced sensitivity
     * @param {Object} cameraSystem - The current camera system to get look direction
     */
    updateCameraDirection(cameraSystem) {
        if (!this.material || !this.material.uniforms.centerPoint) return;
        
        if (cameraSystem && typeof cameraSystem.getViewDirection === 'function') {
            // Get the forward view direction
            const viewDir = cameraSystem.getViewDirection();
            
            // Calculate center point (where lines should converge)
            let centerX = 0.5;
            let centerY = 0.5;
            
            if (viewDir) {
                // OPTIMIZATION: Reduced offset values and round to fewer decimal places for less GPU precision requirements
                centerX = 0.5 - Math.round(viewDir.x * 10) / 100; // Only use 2 decimal places
                centerY = 0.5 - Math.round(viewDir.y * 10) / 100; // Only use 2 decimal places
            }
            
            // Update uniform
            this.material.uniforms.centerPoint.value.set(centerX, centerY);
        }
    }
    
    /**
     * Animation loop with maximum performance optimizations
     */
    animate() {
        if (!this.active) return;
        
        // OPTIMIZATION: Always use frame skipping for better performance
        // Skip more frames at lower intensities
        const skipFrames = this.intensity < 0.7 ? 2 : 1; // Skip more frames at low intensity
        this.frameSkip = (this.frameSkip + 1) % (skipFrames + 1);
        if (this.frameSkip !== 0) {
            this.animationId = requestAnimationFrame(() => this.animate());
            return;
        }
        
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastTime) / 1000; // seconds
        this.lastTime = currentTime;
        
        // OPTIMIZATION: Slower animation at low intensity
        if (this.material && this.material.uniforms.time) {
            const timeScale = 0.5 + this.intensity * 1.5; // Lower base speed with less scaling
            this.material.uniforms.time.value += deltaTime * timeScale;
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
        // OPTIMIZATION: Early return if nothing changed with broader threshold
        if (this.isAirborne === isAirborne && 
            Math.abs(this._lastSpeedFactor - speedFactor) < 0.05 &&
            this.intensity === 0) {
            return;
        }
        
        // Store values for comparison
        this.isAirborne = isAirborne;
        this._lastSpeedFactor = speedFactor;
        
        // Only show effect if airborne and above threshold
        if (isAirborne && speedFactor > threshold) {
            // Map speedFactor from threshold-1.0 range to 0.0-1.0 range
            const normalizedIntensity = (speedFactor - threshold) / (1.0 - threshold);
            // Apply reduced intensity multiplier for better performance
            this.setIntensity(normalizedIntensity * 1.2);
        } else {
            this.setIntensity(0);
        }
        
        // Update camera direction if provided, but less frequently
        if (cameraSystem && Math.random() < 0.5) { // Only update 50% of the time
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
        
        if (this._resizeTimeout) {
            clearTimeout(this._resizeTimeout);
            this._resizeTimeout = null;
        }
        
        window.removeEventListener('resize', this.handleResize.bind(this));
        
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