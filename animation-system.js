import * as THREE from 'three';

/**
 * Animation system to manage and play FBX animations
 */
export class AnimationSystem {
    /**
     * Creates a new animation system
     * @param {THREE.Scene} scene - The Three.js scene
     * @param {THREE.Object3D} model - The FBX model to animate
     */
    constructor(scene, model) {
        this.scene = scene;
        this.model = model;
        this.mixer = new THREE.AnimationMixer(model);
        this.animations = {};
        this.currentAction = null;
        this.previousAction = null;
        this.animationsLoaded = false;
        this.transitionDuration = 0.1; // Transition time between animations in seconds
        
        // Add state tracking to prevent animation flickering
        this.isJumping = false;
        this.isFalling = false;
        this.currentAnimationName = null;
    }

    /**
     * Loads an animation from an FBX file
     * @param {string} name - Name identifier for the animation
     * @param {string} path - Path to the FBX file containing the animation
     * @param {Function} fbxLoader - Initialized FBXLoader instance
     * @returns {Promise} Promise that resolves when the animation is loaded
     */
    loadAnimation(name, path, fbxLoader) {
        return new Promise((resolve, reject) => {
            fbxLoader.load(
                path,
                (animFbx) => {
                    // Get the animation from the loaded FBX
                    const animation = animFbx.animations[0];
                    if (animation) {
                        animation.name = name;
                        
                        // Create an animation action
                        const action = this.mixer.clipAction(animation);
                        
                        // Store the animation
                        this.animations[name] = {
                            clip: animation,
                            action: action
                        };
                        
                        console.log(`Animation '${name}' loaded successfully`);
                        resolve(animation);
                    } else {
                        console.warn(`No animations found in FBX: ${path}`);
                        reject(new Error(`No animations found in FBX: ${path}`));
                    }
                },
                // Progress callback
                (xhr) => {
                    console.log(`${name} animation: ${(xhr.loaded / xhr.total * 100).toFixed(0)}% loaded`);
                },
                // Error callback
                (error) => {
                    console.error(`Error loading animation '${name}':`, error);
                    reject(error);
                }
            );
        });
    }

    /**
     * Plays an animation by name
     * @param {string} name - Name of animation to play
     * @param {boolean} crossFade - Whether to crossfade from the current animation
     * @param {number} duration - Override transition duration (optional)
     */
    play(name, crossFade = true, duration = null) {
        const animation = this.animations[name];
        
        if (!animation) {
            console.warn(`Animation '${name}' not found`);
            return;
        }
        
        // Track the current animation name
        this.currentAnimationName = name;
        
        // Don't restart the same animation
        if (this.currentAction === animation.action && animation.action.isRunning()) {
            return;
        }
        
        // Set previous action
        this.previousAction = this.currentAction;
        this.currentAction = animation.action;
        
        if (this.previousAction && crossFade) {
            // Enable crossfade
            this.currentAction.enabled = true;
            this.currentAction.setEffectiveTimeScale(1);
            this.currentAction.setEffectiveWeight(1);
            
            // Start crossfade
            const actualDuration = duration !== null ? duration : this.transitionDuration;
            this.currentAction.crossFadeFrom(this.previousAction, actualDuration, true);
            this.currentAction.play();
        } else {
            // Play without crossfade
            this.currentAction.play();
            
            // Stop any previous animation immediately
            if (this.previousAction) {
                this.previousAction.stop();
            }
        }
    }

    /**
     * Updates the animation mixer
     * @param {number} deltaTime - Time since last frame in seconds
     */
    update(deltaTime) {
        if (this.mixer) {
            this.mixer.update(deltaTime);
        }
    }

    /**
     * Loads all default animations
     * @param {FBXLoader} fbxLoader - FBX loader instance
     * @returns {Promise} Promise that resolves when all animations are loaded
     */
    async loadAllAnimations(fbxLoader) {
        try {
            await Promise.all([
                this.loadAnimation('idle', 'assets/pandaFBX/idle.fbx', fbxLoader),
                this.loadAnimation('running', 'assets/pandaFBX/running.fbx', fbxLoader),
                this.loadAnimation('jump', 'assets/pandaFBX/jump.fbx', fbxLoader),
                this.loadAnimation('fly', 'assets/pandaFBX/fly.fbx', fbxLoader)
            ]);
            
            this.animationsLoaded = true;
            
            // Set initial animation to idle
            if (this.animations['idle']) {
                this.play('idle', false);
            }
            
            return true;
        } catch (error) {
            console.error("Failed to load animations:", error);
            return false;
        }
    }

    /**
     * Determines which animation to play based on player state
     * @param {Object} inputState - Input state from the game
     * @param {boolean} onSurface - Whether the player is on a surface
     * @param {number} verticalVelocity - Player's vertical velocity
     */
    updatePlayerAnimation(inputState, onSurface, verticalVelocity) {
        if (!this.animationsLoaded) return;
        
        const isMoving = inputState.forward || inputState.backward || 
                         inputState.strafeLeft || inputState.strafeRight;
        
        // Handle state transitions for jumping/falling
        if (!onSurface) {
            // Player is in the air
            if (verticalVelocity > 0) {
                // Rising - play jump animation (only if we're not already jumping)
                if (!this.isJumping) {
                    this.play('jump');
                    this.isJumping = true;
                    this.isFalling = false;
                }
            } else {
                // Falling - play fly/fall animation (only if we're not already falling)
                if (!this.isFalling && !this.isJumping) {
                    this.play('fly');
                    this.isFalling = true;
                }
                
                // If we're transitioning from jumping to falling, we need to detect that
                if (this.isJumping && verticalVelocity < -2.0) {
                    this.isJumping = false;
                    this.isFalling = true;
                    this.play('fly');
                }
            }
        } else {
            // Player has landed
            if (this.isJumping || this.isFalling) {
                // Reset jump/fall states
                this.isJumping = false;
                this.isFalling = false;
                
                // Transition to appropriate grounded animation
                if (isMoving) {
                    this.play('running');
                } else {
                    this.play('idle');
                }
            } else {
                // Normal ground movement
                if (isMoving && this.currentAnimationName !== 'running') {
                    this.play('running');
                } else if (!isMoving && this.currentAnimationName !== 'idle') {
                    this.play('idle');
                }
            }
        }
    }
}