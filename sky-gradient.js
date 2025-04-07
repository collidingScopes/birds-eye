import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.min.js';

/**
 * SkyGradient class
 * Creates a simplified sky gradient background using Three.js
 * This replaces the default Cesium sky with a lightweight alternative
 */
export class SkyGradient {
    /**
     * Creates a new sky gradient
     * @param {Object} scene - The Three.js scene
     * @param {Object} camera - The Three.js camera
     */
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.initialized = false;
        
        // Sky colors - can be customized
        this.zenithColor = new THREE.Color(0x0077ff);  // Blue at top
        this.horizonColor = new THREE.Color(0xb0d8ff); // Light blue at horizon
        
        // Initialize immediately
        this.init();
        console.log("SkyGradient constructor completed");
    }
    
    /**
     * Initialize the sky gradient
     */
    init() {
        if (this.initialized) return;
        
        console.log("Initializing SkyGradient...");
        
        try {
            // Create a large sphere to represent the sky
            const skyGeometry = new THREE.SphereGeometry(1000000, 32, 15);
            
            // Invert the geometry so that faces point inward
            skyGeometry.scale(-1, 1, 1);
            
            // Create a shader material for the gradient
            const vertShader = `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `;
            
            const fragShader = `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition).y + offset;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
                }
            `;
            
            // Create shader material with error handling
            const skyMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    topColor: { value: this.zenithColor },
                    bottomColor: { value: this.horizonColor },
                    offset: { value: 0.4 },  // Adjusted offset for better gradient appearance
                    exponent: { value: 0.8 } // Adjusted exponent for smoother blending
                },
                vertexShader: vertShader,
                fragmentShader: fragShader,
                side: THREE.BackSide,
                transparent: false,
                depthWrite: false,  // Don't write to depth buffer
                depthTest: false    // Don't test against depth buffer
            });
            
            // Create the sky mesh
            this.skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
            
            // Set render order to ensure it renders first
            this.skyMesh.renderOrder = -1000;
            
            // Add to scene
            this.scene.add(this.skyMesh);
            
            console.log("SkyGradient initialized successfully");
            this.initialized = true;
            
            // Force an immediate update
            this.update();
        } catch (error) {
            console.error("Error initializing SkyGradient:", error);
        }
    }
    
    /**
     * Updates the sky mesh position to follow the camera
     */
    update() {
        if (!this.initialized || !this.skyMesh) {
            // If not initialized yet, try to initialize
            if (!this.initialized) {
                this.init();
                if (!this.initialized) return; // If still not initialized, return
            } else {
                return; // If initialized but no skyMesh, return
            }
        }
        
        try {
            // Follow the camera position
            this.skyMesh.position.copy(this.camera.position);
        } catch (error) {
            console.error("Error updating SkyGradient:", error);
        }
    }
    
    /**
     * Sets custom colors for the sky gradient
     * @param {string|number} zenithColor - Color for the top of the sky
     * @param {string|number} horizonColor - Color for the horizon
     */
    setColors(zenithColor, horizonColor) {
        if (!this.initialized || !this.skyMesh) {
            console.warn("Cannot set colors - SkyGradient not properly initialized");
            return;
        }
        
        try {
            this.zenithColor = new THREE.Color(zenithColor);
            this.horizonColor = new THREE.Color(horizonColor);
            
            const uniforms = this.skyMesh.material.uniforms;
            uniforms.topColor.value = this.zenithColor;
            uniforms.bottomColor.value = this.horizonColor;
            
            // Mark material as needing update
            this.skyMesh.material.needsUpdate = true;
            
            console.log(`Sky colors updated: zenith=${this.zenithColor.getHexString()}, horizon=${this.horizonColor.getHexString()}`);
        } catch (error) {
            console.error("Error setting SkyGradient colors:", error);
        }
    }
    
    /**
     * Remove the sky from the scene
     */
    dispose() {
        if (this.initialized && this.skyMesh) {
            try {
                this.scene.remove(this.skyMesh);
                if (this.skyMesh.geometry) {
                    this.skyMesh.geometry.dispose();
                }
                if (this.skyMesh.material) {
                    this.skyMesh.material.dispose();
                }
                this.initialized = false;
                console.log("SkyGradient disposed");
            } catch (error) {
                console.error("Error disposing SkyGradient:", error);
            }
        }
    }
}