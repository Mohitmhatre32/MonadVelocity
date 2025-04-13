// Import the entire Three.js library AS the 'THREE' object
// This uses the global THREE object created by the script tag in index.html
// If you were using npm/bundlers, you'd use: import * as THREE from 'three';

// Ensure THREE is loaded from the global scope (CDN script)
if (typeof THREE === 'undefined') {
    console.error("THREE.js library not loaded. Check script tag in index.html.");
    // You could display an error message to the user here
    document.getElementById('loadingScreen').innerHTML = '<h1>Error: Could not load 3D library!</h1>';
}

// --- Basic Three.js Scene Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('gameCanvas'),
    antialias: true // Improves appearance of edges
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // Enable shadow rendering

// --- Scene Elements (using Three.js objects) ---
let playerCar; // Will hold the player's car (a THREE.Group)
const opponentCars = {}; // Dictionary to hold opponent cars
let groundPlane; // The ground (a THREE.Mesh)
let trackMesh;   // The race track (a THREE.Mesh)

// --- Game State & Controls ---
const keyboard = {}; // Object to track pressed keys
let playerSpeed = 0; // Current forward/backward speed of the player car
const maxSpeed = 1.5; // Maximum forward speed units per frame (adjust for feel)
const acceleration = 0.02; // How quickly speed increases
const deceleration = 0.01; // Natural speed loss (friction/drag)
const brakePower = 0.05; // How quickly speed decreases when braking
const turnSpeed = 0.035; // How quickly the car turns (radians per frame)
const cameraOffset = new THREE.Vector3(0, 5, -10); // Camera position relative to the car (behind and above)

// --- HTML Element References ---
const speedometerElement = document.getElementById('speedometer');
const positionElement = document.getElementById('position');
const lapCounterElement = document.getElementById('lapCounter');
const messageElement = document.getElementById('message');
const loadingScreen = document.getElementById('loadingScreen');

// --- Initialization Function ---
function init() {
    console.log("Initializing Monad Velocity UI...");
    setupScene();
    setupLighting();
    createGround();
    createTrack();
    playerCar = createCar(new THREE.Color(0xff0000), 'player'); // Create red player car
    playerCar.position.z = 55; // Start near the back straight of the oval
    placeOpponentCars(); // Create static blue/green/yellow cars
    setupCamera();
    setupControls();

    // Hide loading screen when setup is complete
    // (Later, you'd hide this after assets like models are loaded)
    loadingScreen.style.display = 'none';
    console.log("Initialization Complete. Starting game loop.");

    animate(); // Start the main game loop
}

// --- Three.js Scene Configuration ---
function setupScene() {
    scene.background = new THREE.Color(0x87CEEB); // Sky blue background
    scene.fog = new THREE.Fog(0x87CEEB, 100, 500); // Fog for depth perception
}

function setupLighting() {
    // Ambient light: illuminates all objects equally
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Directional light: simulates sunlight, casts shadows
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 75); // Position the light source
    directionalLight.castShadow = true; // Allow this light to cast shadows

    // Configure shadow quality/performance
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    const shadowCamSize = 150;
    directionalLight.shadow.camera.left = -shadowCamSize;
    directionalLight.shadow.camera.right = shadowCamSize;
    directionalLight.shadow.camera.top = shadowCamSize;
    directionalLight.shadow.camera.bottom = -shadowCamSize;

    scene.add(directionalLight);

    // Optional: Helpers to visualize light and shadow camera
    // const lightHelper = new THREE.DirectionalLightHelper(directionalLight, 5);
    // scene.add(lightHelper);
    // const shadowCameraHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
    // scene.add(shadowCameraHelper);
}

function createGround() {
    // Create a large flat plane geometry
    const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
    // Create a standard material (reacts to light)
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x55aa55, // Grassy green color
        roughness: 0.9, // Make it look rough, less shiny
        metalness: 0.1, // Make it look non-metallic
    });
    // Create the mesh (geometry + material)
    groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    groundPlane.rotation.x = -Math.PI / 2; // Rotate to lie flat on XZ plane
    groundPlane.receiveShadow = true; // Allow shadows to be cast onto the ground
    scene.add(groundPlane); // Add the ground to the scene
}

function createTrack() {
    // Define the shape of the oval track using Three.js Shape path commands
    const trackShape = new THREE.Shape();
    const outerRadius = 60; // Outer edge radius
    const innerRadius = 45; // Inner edge radius

    // Start at the bottom-center of the outer edge
    trackShape.moveTo(0, -outerRadius);
    // Draw the outer arc (top half, then bottom half)
    trackShape.absarc(0, 0, outerRadius, Math.PI * 1.5, Math.PI * 3.5, false);
    // Connect to the inner edge at the bottom-center
    trackShape.lineTo(0, -innerRadius);
    // Draw the inner arc (clockwise)
    trackShape.absarc(0, 0, innerRadius, Math.PI * 1.5, Math.PI * 3.5, true);
    // Close the shape path
    trackShape.lineTo(0, -outerRadius);

    // Extrude the 2D shape slightly to give it thickness
    const extrudeSettings = {
        steps: 1, // Number of steps along the extrusion depth
        depth: 0.2, // How thick the track is
        bevelEnabled: false, // No bevelled edges for simplicity
    };
    const trackGeometry = new THREE.ExtrudeGeometry(trackShape, extrudeSettings);

    // Material for the track (asphalt)
    const trackMaterial = new THREE.MeshStandardMaterial({
        color: 0x444444, // Dark grey color
        roughness: 0.8,
        metalness: 0.2,
    });
    // Create the track mesh
    trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);
    trackMesh.rotation.x = -Math.PI / 2; // Rotate flat
    trackMesh.position.y = 0.01; // Place slightly above ground to avoid graphical glitches
    trackMesh.receiveShadow = true; // Track can receive shadows
    scene.add(trackMesh); // Add track to the scene

    // TODO: Add visual elements like start/finish line, barriers
}


// --- Car Creation & Management ---
function createCar(color = 0x0000ff, id = 'car') {
    // Use a THREE.Group to hold all parts of the car together
    const carGroup = new THREE.Group();
    // Store custom data directly on the group object
    carGroup.userData = { id: id, speed: 0 };

    // Car Body (using a simple BoxGeometry)
    const bodyGeometry = new THREE.BoxGeometry(2, 1, 4); // Width, Height, Length
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: color, // Use the provided color
        roughness: 0.3,
        metalness: 0.5 // Slightly metallic look
    });
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.position.y = 0.5; // Lift the body so wheels are on the ground plane
    bodyMesh.castShadow = true; // Car body casts shadows
    carGroup.add(bodyMesh); // Add body to the group

    // Wheels (using CylinderGeometry)
    const wheelRadius = 0.4;
    const wheelWidth = 0.3;
    const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 16); // RadiusTop, RadiusBottom, Height, Segments
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });

    // Define positions for the four wheels relative to the car's center
    const wheelPositions = [
        { x: -1.1, y: 0.4, z: 1.5 }, // Front Left
        { x: 1.1, y: 0.4, z: 1.5 },  // Front Right
        { x: -1.1, y: 0.4, z: -1.5 }, // Rear Left
        { x: 1.1, y: 0.4, z: -1.5 }   // Rear Right
    ];

    // Create and add each wheel to the car group
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2; // Rotate cylinders to look like wheels
        wheel.position.set(pos.x, pos.y, pos.z);
        wheel.castShadow = true; // Wheels cast shadows
        carGroup.add(wheel);
    });

    // Position the whole car group slightly above the track surface
    carGroup.position.y = 0.1 + wheelRadius; // Adjust so wheels sit on track

    scene.add(carGroup); // Add the completed car group to the main scene
    return carGroup; // Return the group so we can control it

    // --- MODEL LOADING (Placeholder - uncomment and adjust to load a GLB/GLTF model) ---
    /*
    const loader = new THREE.GLTFLoader(); // Make sure GLTFLoader script is included in HTML
    const carGroup = new THREE.Group(); // Still use a group for positioning/rotation
    carGroup.userData = { id: id, speed: 0 };
    carGroup.position.y = 0.1; // Initial ground offset

    loader.load(
        'assets/car.glb', // Path to your 3D car model
        (gltf) => { // Function called when model loads successfully
            console.log("Car model loaded successfully");
            const model = gltf.scene;
            model.scale.set(0.5, 0.5, 0.5); // Adjust scale if needed
            model.traverse((node) => { // Apply shadows to all parts of the model
                if (node.isMesh) {
                    node.castShadow = true;
                    // node.receiveShadow = true; // Optional: Parts can receive shadows too
                }
            });
            carGroup.add(model); // Add the loaded model scene to our group
            scene.add(carGroup); // Add the group to the main scene
        },
        undefined, // Optional: Progress callback function
        (error) => { // Function called if model loading fails
            console.error('Error loading car model:', error);
            // Fallback: Create a simple box if loading fails?
            // Alternatively, display an error and stop.
        }
    );
    return carGroup; // Return the group immediately (model loads asynchronously)
    */
}

function placeOpponentCars() {
    // Create some static opponent cars for visual placeholders
    // In a real game, their positions would come from the server
    const opponentData = [
        { x: 5, z: 50, color: 0x0000ff }, // Blue car
        { x: -5, z: 40, color: 0x00ff00 }, // Green car
        { x: 0, z: 30, color: 0xffff00 }, // Yellow car
    ];

    opponentData.forEach((data, index) => {
        const id = `opponent_${index}`;
        const car = createCar(new THREE.Color(data.color), id);
        car.position.x = data.x;
        car.position.z = data.z;
        // Give them a slightly random orientation
        car.rotation.y = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
        opponentCars[id] = car; // Store opponent car references
    });
    // Update the placeholder HUD text (N = number of opponents + player)
    positionElement.textContent = `Position: 1 / ${Object.keys(opponentCars).length + 1}`;
}

// --- Camera Setup and Control ---
function setupCamera() {
    // Set an initial high-level view of the track
    camera.position.set(0, 50, 80);
    camera.lookAt(scene.position); // Look at the center of the scene (0,0,0)
}

function updateCamera() {
    if (!playerCar) return; // Don't update if player car doesn't exist yet

    // Calculate the desired camera position based on car's current position and rotation
    const relativeCameraOffset = cameraOffset.clone(); // Start with the base offset
    // Rotate this offset vector by the car's current rotation (quaternion)
    relativeCameraOffset.applyQuaternion(playerCar.quaternion);
    // Add the rotated offset to the car's position to get the target camera position
    const desiredCameraPosition = playerCar.position.clone().add(relativeCameraOffset);

    // Smoothly move the camera towards the desired position using linear interpolation (lerp)
    // Lower factor = smoother/slower camera movement
    camera.position.lerp(desiredCameraPosition, 0.08);

    // Make the camera look at a point slightly in front of the car for better anticipation
    const lookAtTarget = playerCar.position.clone();
    // Calculate the car's forward direction vector
    // const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(playerCar.quaternion);
    // lookAtTarget.add(forward.multiplyScalar(5)); // Look 5 units ahead (optional)

    camera.lookAt(lookAtTarget); // Point the camera towards the target
}

// --- Input Handling ---
function setupControls() {
    // Listen for key presses and releases, update the 'keyboard' object state
    window.addEventListener('keydown', (event) => { keyboard[event.code] = true; });
    window.addEventListener('keyup', (event) => { keyboard[event.code] = false; });
}

function handleControls(deltaTime) { // deltaTime is time since last frame, not used here but good practice
    if (!playerCar) return; // Safety check

    // --- Acceleration / Braking ---
    if (keyboard['ArrowUp'] || keyboard['KeyW']) {
        playerSpeed += acceleration; // Increase speed forward
    } else if (keyboard['ArrowDown'] || keyboard['KeyS']) {
        playerSpeed -= brakePower; // Decrease speed (braking/reversing)
    } else {
        // Apply natural deceleration if no acceleration/braking input
        if (playerSpeed > 0) {
            playerSpeed -= deceleration;
            if (playerSpeed < 0) playerSpeed = 0; // Clamp to zero, don't go backwards automatically
        } else if (playerSpeed < 0) {
            playerSpeed += deceleration;
            if (playerSpeed > 0) playerSpeed = 0; // Clamp to zero when reversing
        }
    }
    // Clamp speed to maximum forward and reverse limits
    playerSpeed = Math.max(-maxSpeed / 2, Math.min(maxSpeed, playerSpeed));

    // --- Steering ---
    let turnFactor = 0;
    // Only allow steering if the car is moving significantly
    if (Math.abs(playerSpeed) > 0.05) {
        if (keyboard['ArrowLeft'] || keyboard['KeyA']) {
            turnFactor = 1; // Turn left
        }
        if (keyboard['ArrowRight'] || keyboard['KeyD']) {
            turnFactor = -1; // Turn right
        }
    }
    // Apply rotation around the Y-axis (yaw)
    playerCar.rotation.y += turnFactor * turnSpeed * (playerSpeed / maxSpeed); // Turn more sharply at lower speeds (optional)

    // --- Update Car Position ---
    // Get the car's forward direction vector (local Z axis rotated by car's quaternion)
    const forwardDirection = new THREE.Vector3(0, 0, 1);
    forwardDirection.applyQuaternion(playerCar.quaternion);
    // Calculate the distance to move this frame
    const moveDistance = forwardDirection.multiplyScalar(playerSpeed);
    // Add the movement vector to the car's current position
    playerCar.position.add(moveDistance);

    // --- Simple Car Boundary Check (very basic placeholder) ---
    // Keep the car roughly within the track's radius
    const distanceFromCenter = playerCar.position.length(); // Distance from origin (0,0,0)
    const outerTrackBoundary = 62;
    const innerTrackBoundary = 43;
    if (distanceFromCenter > outerTrackBoundary || distanceFromCenter < innerTrackBoundary) {
        // Crude 'bounce' effect - reverse speed slightly
        // playerSpeed *= -0.5;
        // A better approach would involve collision detection with track edges/barriers
        // and more realistic physics response.
    }

    // --- Visual Wheel Rotation ---
    const wheelRotationSpeed = playerSpeed * -2.0; // Adjust multiplier for visual speed
    playerCar.children.forEach(child => {
        // Identify wheels based on their geometry type (could also use names or userData)
        if (child.geometry && child.geometry.type === 'CylinderGeometry') {
            child.rotation.x += wheelRotationSpeed; // Rotate wheel around its axle (local X)
        }
    });

    // Update the speed stored in userData (optional)
    playerCar.userData.speed = playerSpeed;
}

// --- HUD Update ---
function updateHUD() {
    if (!playerCar) return;
    // Convert internal speed units to a display value (e.g., km/h)
    // The multiplier (e.g., 50) needs tuning based on maxSpeed and desired display range
    const displaySpeed = Math.abs(playerCar.userData.speed * 50).toFixed(0);
    speedometerElement.textContent = `Speed: ${displaySpeed} km/h`;

    // TODO: Implement actual lap counting and position calculation logic
    // For now, position just shows the initial placeholder text.
}

// --- Main Game Loop (Animation Loop) ---
const clock = new THREE.Clock(); // Three.js utility for time tracking
function animate() {
    // Request the browser to call this function again before the next repaint
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta(); // Get time elapsed since the last frame

    // Update game logic based on input
    handleControls(deltaTime);

    // Update camera position to follow the player
    updateCamera();

    // Update the information displayed on the HUD
    updateHUD();

    // --- TODO: Update Opponent Car Positions ---
    // This is where you would receive data from the server (via WebSockets)
    // and update the position and rotation of each opponent car mesh.
    // Example:
    // for (const id in opponentCars) {
    //     const carData = getNetworkDataForCar(id); // Function to get data from server
    //     if (carData) {
    //          opponentCars[id].position.lerp(carData.position, 0.1); // Smooth movement
    //          opponentCars[id].quaternion.slerp(carData.rotation, 0.1); // Smooth rotation
    //     }
    // }

    // Render the scene from the perspective of the camera
    renderer.render(scene, camera);
}

// --- Handle Browser Window Resizing ---
function onWindowResize() {
    // Update camera aspect ratio to match new window dimensions
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix(); // Apply the aspect ratio change

    // Update renderer size to fill the new window size
    renderer.setSize(window.innerWidth, window.innerHeight);
}
// Add an event listener to call onWindowResize when the window is resized
window.addEventListener('resize', onWindowResize);

// --- Start the Initialization Process ---
// Check if THREE is available before starting
if (typeof THREE !== 'undefined') {
    init();
}