import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.min.js';

/**
 * Creates a visual effect of expanding rings and particles when the player jumps
 */
export class JumpBoostEffect {
    constructor(scene) {
        this.scene = scene;
        this.rings = [];
        this.maxRings = 4;
        this.active = false;
        this.lastJumpTime = 0;
        this.effectDuration = 0.4; // seconds

        // Create shader material for rings
        this.ringMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                color1: { value: new THREE.Color(0x00ffff) }, // Cyan
                color2: { value: new THREE.Color(0xff00ff) }, // Magenta
                progress: { value: 0.0 } // 0.0 to 1.0
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
                uniform vec3 color1;
                uniform vec3 color2;
                uniform float progress;
                varying vec2 vUv;
                
                void main() {
                    // Create ring effect
                    vec2 center = vec2(0.5, 0.5);
                    float dist = distance(vUv, center);
                    
                    // Ring shape with smooth edges
                    float ringThickness = 0.05;
                    float outerEdge = 0.5 * progress;
                    float ring = smoothstep(outerEdge - ringThickness, outerEdge, dist) - 
                                 smoothstep(outerEdge, outerEdge + ringThickness, dist);
                    
                    // Add pulse effect
                    float pulse = sin(time * 10.0) * 0.1 + 0.9;
                    ring *= pulse;
                    
                    // Color transition with time
                    vec3 color = mix(color1, color2, sin(time * 3.0) * 0.5 + 0.5);
                    
                    // Fade out as ring expands
                    float alpha = ring * (1.0 - progress * 0.8);
                    
                    gl_FragColor = vec4(color, alpha);
                }
            `,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        // Initialize rings
        this.initRings();
    }

    /**
     * Create the ring meshes that will be used for the effect
     */
    initRings() {
        for (let i = 0; i < this.maxRings; i++) {
            // Create a circular plane for each ring
            const geometry = new THREE.CircleGeometry(1, 8);
            const material = this.ringMaterial.clone();
            
            // Each ring gets its own uniform instances
            material.uniforms.time = { value: 0.0 };
            material.uniforms.progress = { value: 0.0 };
            material.uniforms.color1 = { value: new THREE.Color(0x00ffff) };
            material.uniforms.color2 = { value: new THREE.Color(0xff00ff) };
            
            const ring = new THREE.Mesh(geometry, material);
            ring.rotation.x = -Math.PI / 2; // Make it horizontal
            ring.scale.set(0.1, 0.1, 0.1); // Start small
            ring.visible = false;
            
            this.scene.add(ring);
            this.rings.push({
                mesh: ring,
                active: false,
                startTime: 0,
                delay: i * 0.05 // Staggered activation
            });
        }
    }

    /**
     * Trigger the jump boost effect at the player's position
     * @param {THREE.Vector3|Object} playerPosition - Position to show the effect
     */
    triggerJump(playerPosition) {
        if (!this.rings || this.rings.length === 0) return;
        if (!playerPosition) return;

        // Convert to seconds for consistent timing
        this.active = true;
        this.lastJumpTime = performance.now() / 1000.0;
        
        for (let i = 0; i < this.rings.length; i++) {
            const ring = this.rings[i];
            ring.active = true;
            ring.startTime = this.lastJumpTime + ring.delay;
            ring.mesh.visible = false; // Will be made visible with delay
            
            // Position the ring at the player's current position, slightly below
            const ringPosition = new THREE.Vector3(
                playerPosition.x || 0,
                (playerPosition.y || 0) - 0.1, // Slightly below player
                playerPosition.z || 0
            );
            ring.mesh.position.copy(ringPosition);
            
            // Randomize colors for variety
            const hue1 = Math.random();
            const hue2 = (hue1 + 0.5) % 1.0; // Complementary color
            const color1 = new THREE.Color().setHSL(hue1, 1.0, 0.5);
            const color2 = new THREE.Color().setHSL(hue2, 1.0, 0.5);
            
            ring.mesh.material.uniforms.color1.value = color1;
            ring.mesh.material.uniforms.color2.value = color2;
        }
    }

    /**
     * Update the effect animation
     * @param {number} currentTime - Current time from requestAnimationFrame
     * @param {THREE.Vector3|Object} playerPosition - Current player position
     */
    update(currentTime, playerPosition) {
        if (!this.active) return;

        // Convert to seconds for shader uniforms
        const time = currentTime / 1000.0;
        let anyRingActive = false;

        for (let i = 0; i < this.rings.length; i++) {
            const ring = this.rings[i];
            
            // Skip if this ring is not active
            if (!ring.active) continue;
            
            // Check if it's time to show this ring
            if (time < ring.startTime) {
                anyRingActive = true;
                continue;
            }
            
            // Calculate progress (0 to 1)
            const elapsed = time - ring.startTime;
            const progress = Math.min(elapsed / this.effectDuration, 1.0);
            
            // If complete, deactivate
            if (progress >= 1.0) {
                ring.active = false;
                ring.mesh.visible = false;
                continue;
            }
            
            anyRingActive = true;
            ring.mesh.visible = true;
            
            // Update uniforms
            ring.mesh.material.uniforms.time.value = time;
            ring.mesh.material.uniforms.progress.value = progress;
            
            // Scale the ring as it expands
            const scale = 0.1 + progress * 2.0; // Grow from 0.1 to 5.1
            ring.mesh.scale.set(scale, scale, scale);
            
            // Position the ring at player's horizontal position, keeping the original y
            if (playerPosition) {
                const originalY = ring.mesh.position.y;
                ring.mesh.position.set(
                    playerPosition.x || 0, 
                    originalY, 
                    playerPosition.z || 0
                );
            }
        }
        
        // Update overall active state
        this.active = anyRingActive;
    }

    /**
     * Clean up resources when no longer needed
     */
    dispose() {
        for (const ring of this.rings) {
            if (ring.mesh) {
                if (ring.mesh.geometry) ring.mesh.geometry.dispose();
                if (ring.mesh.material) ring.mesh.material.dispose();
                this.scene.remove(ring.mesh);
            }
        }
        this.rings = [];
    }
}