
// Ensure THREE is loaded
if (typeof THREE === 'undefined') {
    console.error("THREE.js library not loaded. Check script tag in index.html.");
    document.getElementById('loadingScreen').innerHTML = '<h1>Error: Could not load 3D library!</h1>';
    // Stop execution if THREE isn't available
    throw new Error("THREE.js not loaded");
}
// Ensure io (Socket.IO client) is loaded
if (typeof io === 'undefined') {
    console.error("Socket.IO client library not loaded. Check script tag in index.html.");
    document.getElementById('loadingScreen').innerHTML = '<h1>Error: Could not load networking library!</h1>';
    // Stop execution if io isn't available
    throw new Error("Socket.IO client not loaded");
}


// --- Basic Three.js Scene Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('gameCanvas'),
    antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// --- Scene Elements (using Three.js objects) ---
let playerCar;      // Holds the local player's car (THREE.Group)
const opponentCars = {}; // Dictionary to hold opponent cars, keyed by socket ID
let groundPlane;    // The ground (THREE.Mesh)
let trackMesh;      // The race track (THREE.Mesh)

// --- Game State & Controls ---
const keyboard = {}; // Object to track pressed keys
let playerSpeed = 0;
const maxSpeed = 1.5;
const acceleration = 0.02;
const deceleration = 0.01;
const brakePower = 0.05;
const turnSpeed = 0.035;
const cameraOffset = new THREE.Vector3(0, 5, -10);
const INTERPOLATION_FACTOR = 0.15; // How quickly opponent cars move to their target state (lower = smoother but more lag)

// --- HTML Element References ---
const speedometerElement = document.getElementById('speedometer');
const positionElement = document.getElementById('position');
const lapCounterElement = document.getElementById('lapCounter');
const messageElement = document.getElementById('message');
const loadingScreen = document.getElementById('loadingScreen');

// --- Networking ---
let socket;         // Holds the Socket.IO connection instance
let myId = null;    // Holds the local player's socket ID once connected

// --- Initialization Function ---
function init() {
    console.log("Initializing Monad Velocity UI...");
    setupScene();
    setupLighting();
    createGround();
    createTrack();
    // Player car is NOT created here anymore - created after socket connection
    // Opponent cars are NOT placed statically anymore - added via socket events
    setupCamera();
    setupControls();
    setupSocketIO(); // Initialize Socket.IO connection and handlers

    // Hide loading screen initially, might re-show if connection fails
    loadingScreen.style.display = 'none';
    showMessage("Connecting to server...", 0); // Show indefinite connecting message
    console.log("Initialization base complete. Waiting for server connection...");

    animate(); // Start the main game loop
}

// --- Socket.IO Setup ---
function setupSocketIO() {
    // Connect to the server (replace with your actual server address/port)
    socket = io('http://localhost:3000');

    // -- Event Handlers --

    socket.on('connect', () => {
        console.log('Successfully connected to server! My ID:', socket.id);
        myId = socket.id;
        showMessage(`Connected! ID: ${myId}`, 3000); // Show success message

        // Now that we are connected and have an ID, create the player's car
        if (!playerCar) { // Prevent creating multiple cars on reconnect
             // Red player car, associate with our socket ID
             playerCar = createCar(new THREE.Color(0xff0000), myId);
             // Set initial position matching server's default start
             playerCar.position.set(0, playerCar.position.y, 55);
             console.log("Player car created.");
        }
        // Request initial players list (server already sends this, but good practice if joining late)
        // socket.emit('requestInitialState'); // Could add this event on server if needed
    });

    socket.on('disconnect', (reason) => {
        console.log(`Disconnected from server: ${reason}`);
        myId = null;
        // Clean up local state on disconnect
        if (playerCar) {
            scene.remove(playerCar);
            playerCar = null;
        }
        for (const id in opponentCars) {
            removeOpponent(id);
        }
        positionElement.textContent = `Position: - / -`; // Reset HUD
        speedometerElement.textContent = `Speed: 0 km/h`;
        showMessage(`Disconnected: ${reason}`, 5000, true); // Show error message
        // Optionally show loading/disconnected overlay
        // loadingScreen.style.display = 'flex';
        // loadingScreen.innerHTML = `<h1>Disconnected. Attempting to reconnect...</h1>`;
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        showMessage("Could not connect to server", 5000, true);
        // Make sure loading/disconnected screen is visible
        // loadingScreen.style.display = 'flex';
        // loadingScreen.innerHTML = `<h1>Connection Error. Please check server and refresh.</h1>`;
    });

    // Received when connecting: contains data for all players already in the room
    socket.on('currentPlayers', (playersData) => {
        if (!myId) return; // Wait until we have our ID
        console.log('Receiving current players:', playersData);
        // Clear any potential leftover opponents from previous connections
        for (const id in opponentCars) {
             removeOpponent(id);
        }
        // Add all players except ourselves
        for (const id in playersData) {
            if (id !== myId) {
                addOpponent(playersData[id]);
            } else {
                // Optional: Sync our own car's initial state precisely from server if needed
                // (usually not necessary as we create it locally on connect)
                // if(playerCar && playersData[id].position) {
                //    playerCar.position.set(playersData[id].position.x, playersData[id].position.y, playersData[id].position.z);
                //    playerCar.quaternion.set(playersData[id].rotation.x, playersData[id].rotation.y, playersData[id].rotation.z, playersData[id].rotation.w);
                // }
            }
        }
         updateHUDPosition(); // Update N players display
    });

    // Received when a new player joins the room
    socket.on('newPlayer', (playerData) => {
         if (!myId || playerData.id === myId) return; // Ignore if it's us or we're not ready
         console.log('New player joined:', playerData.id);
         addOpponent(playerData);
         updateHUDPosition();
    });

    // Received when another player sends their updated state
    socket.on('opponentUpdate', (playerData) => {
        if (!myId || playerData.id === myId) return; // Ignore if it's us or we're not ready

        const opponentCar = opponentCars[playerData.id];
        if (opponentCar) {
            // Ensure data structure is valid before attempting interpolation
            if (playerData.position && typeof playerData.position.x === 'number') {
                const targetPos = new THREE.Vector3(playerData.position.x, playerData.position.y, playerData.position.z);
                opponentCar.position.lerp(targetPos, INTERPOLATION_FACTOR);
            }
            if (playerData.rotation && typeof playerData.rotation.w === 'number') {
                 // IMPORTANT: Assumes server sends quaternion {x, y, z, w}
                 const targetQuat = new THREE.Quaternion(
                     playerData.rotation.x,
                     playerData.rotation.y,
                     playerData.rotation.z,
                     playerData.rotation.w
                 );
                // Check for NaN values before slerping
                if (!isNaN(targetQuat.x) && !isNaN(targetQuat.y) && !isNaN(targetQuat.z) && !isNaN(targetQuat.w)) {
                   opponentCar.quaternion.slerp(targetQuat, INTERPOLATION_FACTOR);
                } else {
                    console.warn(`Received invalid quaternion data for ${playerData.id}`, playerData.rotation);
                }
            }
             // Update opponent speed if needed (for wheel animation etc.)
            // opponentCar.userData.speed = playerData.speed || 0;
        } else {
            // If we receive an update for a player we don't know, add them
             console.warn(`Received update for unknown opponent ${playerData.id}. Adding.`);
             addOpponent(playerData);
             updateHUDPosition();
        }
    });

    // Received when a player disconnects
    socket.on('playerDisconnected', (playerId) => {
        console.log('Player disconnected:', playerId);
        removeOpponent(playerId);
        updateHUDPosition();
    });
}

// --- Helper Functions for Opponents ---
function addOpponent(playerData) {
    if (!playerData || !playerData.id) {
        console.error("Invalid playerData received for addOpponent", playerData);
        return;
    }
    if (opponentCars[playerData.id]) {
        console.warn(`Opponent ${playerData.id} already exists.`);
        // Update existing opponent's state instead of re-adding
        opponentCars[playerData.id].position.set(playerData.position.x, playerData.position.y, playerData.position.z);
        opponentCars[playerData.id].quaternion.set(playerData.rotation.x, playerData.rotation.y, playerData.rotation.z, playerData.rotation.w);
        return;
    }

    // Use a default blue color, or get color from playerData if available
    const color = playerData.color || 0x0000ff;
    const car = createCar(new THREE.Color(color), playerData.id); // Pass ID

    // Set initial position and rotation from server data
    if (playerData.position) {
       car.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
    }
    if (playerData.rotation) {
       car.quaternion.set(playerData.rotation.x, playerData.rotation.y, playerData.rotation.z, playerData.rotation.w);
    }

    opponentCars[playerData.id] = car; // Store using socket ID as key
    console.log(`Added opponent car: ${playerData.id}`);
}

function removeOpponent(playerId) {
    if (opponentCars[playerId]) {
        scene.remove(opponentCars[playerId]); // Remove mesh from scene
        // Optional: Dispose of geometry/material to free up memory if needed
        // opponentCars[playerId].traverse(child => {
        //     if (child.isMesh) {
        //         child.geometry.dispose();
        //         child.material.dispose();
        //     }
        // });
        delete opponentCars[playerId]; // Remove from our tracking object
        console.log(`Removed opponent car: ${playerId}`);
    } else {
        console.warn(`Tried to remove non-existent opponent: ${playerId}`);
    }
}


// --- Three.js Scene Configuration ---
function setupScene() {
    scene.background = new THREE.Color(0x87CEEB); // Sky blue background
    scene.fog = new THREE.Fog(0x87CEEB, 100, 500);
}

function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 75);
    directionalLight.castShadow = true;
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
}

function createGround() {
    const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x55aa55, roughness: 0.9, metalness: 0.1 });
    groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);
}

function createTrack() {
    const trackShape = new THREE.Shape();
    const outerRadius = 60; const innerRadius = 45;
    trackShape.moveTo(0, -outerRadius);
    trackShape.absarc(0, 0, outerRadius, Math.PI * 1.5, Math.PI * 3.5, false);
    trackShape.lineTo(0, -innerRadius);
    trackShape.absarc(0, 0, innerRadius, Math.PI * 1.5, Math.PI * 3.5, true);
    trackShape.lineTo(0, -outerRadius);
    const extrudeSettings = { depth: 0.2, bevelEnabled: false };
    const trackGeometry = new THREE.ExtrudeGeometry(trackShape, extrudeSettings);
    const trackMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8, metalness: 0.2 });
    trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);
    trackMesh.rotation.x = -Math.PI / 2;
    trackMesh.position.y = 0.01;
    trackMesh.receiveShadow = true;
    scene.add(trackMesh);
}

// --- Car Creation & Management ---
function createCar(color = 0x0000ff, id = 'car') {
    const carGroup = new THREE.Group();
    // Store ID directly in userData for easy access
    carGroup.userData = { id: id, speed: 0 };

    const bodyGeometry = new THREE.BoxGeometry(2, 1, 4);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: color, roughness: 0.3, metalness: 0.5 });
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.position.y = 0.5;
    bodyMesh.castShadow = true;
    carGroup.add(bodyMesh);

    const wheelRadius = 0.4; const wheelWidth = 0.3;
    const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const wheelPositions = [
        { x: -1.1, y: 0.4, z: 1.5 }, { x: 1.1, y: 0.4, z: 1.5 },
        { x: -1.1, y: 0.4, z: -1.5 }, { x: 1.1, y: 0.4, z: -1.5 }
    ];
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos.x, pos.y, pos.z);
        wheel.castShadow = true;
        carGroup.add(wheel);
    });

    carGroup.position.y = 0.1 + wheelRadius; // Base position on ground

    scene.add(carGroup);
    return carGroup;
}

// --- Camera Setup and Control ---
function setupCamera() {
    camera.position.set(0, 50, 80);
    camera.lookAt(scene.position);
}

function updateCamera() {
    if (!playerCar) return;

    const relativeCameraOffset = cameraOffset.clone();
    relativeCameraOffset.applyQuaternion(playerCar.quaternion);
    const desiredCameraPosition = playerCar.position.clone().add(relativeCameraOffset);
    camera.position.lerp(desiredCameraPosition, 0.08);
    camera.lookAt(playerCar.position);
}

// --- Input Handling ---
function setupControls() {
    window.addEventListener('keydown', (event) => { keyboard[event.code] = true; });
    window.addEventListener('keyup', (event) => { keyboard[event.code] = false; });
}

function handleControls(deltaTime) {
    // Only allow control if connected and playerCar exists
    if (!playerCar || !socket || !myId || !socket.connected) return;

    // --- Acceleration / Braking ---
    let speedChanged = false;
    let rotationChanged = false;
    const oldSpeed = playerSpeed;

    if (keyboard['ArrowUp'] || keyboard['KeyW']) { playerSpeed += acceleration; speedChanged = true; }
    else if (keyboard['ArrowDown'] || keyboard['KeyS']) { playerSpeed -= brakePower; speedChanged = true; }
    else { // Natural deceleration
        if (playerSpeed > 0) { playerSpeed = Math.max(0, playerSpeed - deceleration); speedChanged = true; }
        else if (playerSpeed < 0) { playerSpeed = Math.min(0, playerSpeed + deceleration); speedChanged = true; }
    }
    playerSpeed = Math.max(-maxSpeed / 2, Math.min(maxSpeed, playerSpeed));
    if (Math.abs(playerSpeed - oldSpeed) < 0.001) speedChanged = false; // Prevent tiny updates

    // --- Steering ---
    let turnFactor = 0;
    if (Math.abs(playerSpeed) > 0.05) {
        if (keyboard['ArrowLeft'] || keyboard['KeyA']) turnFactor = 1;
        if (keyboard['ArrowRight'] || keyboard['KeyD']) turnFactor = -1;
    }
    if (turnFactor !== 0) {
        const deltaRotation = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            turnFactor * turnSpeed * (playerSpeed / maxSpeed) // Adjust turn rate based on speed
        );
        playerCar.quaternion.multiplyQuaternions(deltaRotation, playerCar.quaternion);
        rotationChanged = true;
    }

    // --- Update Car Position ---
    let positionChanged = false;
    if (Math.abs(playerSpeed) > 0.001) { // Only move if speed is significant
        const forwardDirection = new THREE.Vector3(0, 0, 1);
        forwardDirection.applyQuaternion(playerCar.quaternion);
        const moveDistance = forwardDirection.multiplyScalar(playerSpeed); // Use current frame's speed
        playerCar.position.add(moveDistance);
        positionChanged = true; // Position likely changed if speed > 0
    }


    // --- Simple Boundary Check (Placeholder) ---
    // const distanceFromCenter = playerCar.position.length();
    // const outerTrackBoundary = 62; const innerTrackBoundary = 43;
    // if (distanceFromCenter > outerTrackBoundary || distanceFromCenter < innerTrackBoundary) {
    //     // Implement better collision/response later
    // }

    // --- Visual Wheel Rotation ---
    const wheelRotationSpeed = playerSpeed * -2.0;
    playerCar.children.forEach(child => {
        if (child.geometry && child.geometry.type === 'CylinderGeometry') {
            child.rotation.x += wheelRotationSpeed;
        }
    });
    playerCar.userData.speed = playerSpeed;

    // --- SEND UPDATE TO SERVER (only if changed) ---
    if (positionChanged || rotationChanged) { // Only send if position or rotation actually changed
        const pos = playerCar.position;
        const quat = playerCar.quaternion;
        const updateData = {
            position: { x: pos.x, y: pos.y, z: pos.z },
            rotation: { x: quat.x, y: quat.y, z: quat.z, w: quat.w }
        };
        // Consider adding throttling here if updates are too frequent
        // e.g., using Date.now() comparison like commented out before
        socket.emit('playerUpdate', updateData);
    }
}

// --- HUD Update ---
function updateHUD() {
    if (!playerCar) return;
    const displaySpeed = Math.abs(playerCar.userData.speed * 50).toFixed(0); // Scale factor needs tuning
    speedometerElement.textContent = `Speed: ${displaySpeed} km/h`;
    // Lap/Position updated separately by other logic or events
}

function updateHUDPosition() {
    // Calculate total number of players (us + opponents)
    const totalPlayers = (myId ? 1 : 0) + Object.keys(opponentCars).length;
    // Placeholder for actual position calculation (needs lap/progress logic)
    const currentPosition = 1; // Needs real logic
    positionElement.textContent = `Position: ${currentPosition} / ${totalPlayers}`;
}

// --- Utility Functions ---
let messageTimeout;
function showMessage(text, duration = 3000, isError = false) {
    messageElement.textContent = text;
    messageElement.style.backgroundColor = isError ? 'rgba(255, 0, 0, 0.7)' : 'rgba(0, 150, 50, 0.7)';
    messageElement.classList.remove('hidden');
    clearTimeout(messageTimeout);
    if (duration > 0) {
        messageTimeout = setTimeout(() => {
            messageElement.classList.add('hidden');
        }, duration);
    }
}

// --- Main Game Loop (Animation Loop) ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();

    // Update local player's car based on input (sends updates if needed)
    handleControls(deltaTime);

    // Update camera to follow local player
    updateCamera();

    // Update HUD for local player
    updateHUD();

    // Update opponent wheel rotations (visual approximation)
    for (const id in opponentCars) {
        const car = opponentCars[id];
        // Crude speed approximation based on position change (could be improved if server sent speed)
        // Or just use a default rolling speed if position changed recently
        const approxSpeed = car.userData.speed || 0; // Use last known speed or 0 for now
        const wheelRotationSpeed = approxSpeed * -2.0;
         car.children.forEach(child => {
            if (child.geometry && child.geometry.type === 'CylinderGeometry') {
                // Only rotate if the car is likely moving (based on interpolation target changing?)
                // For simplicity, just rotate based on player speed for now. Needs better logic.
                child.rotation.x += wheelRotationSpeed;
            }
        });
    }

    // Render the scene
    renderer.render(scene, camera);
}

// --- Handle Browser Window Resizing ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onWindowResize);

// --- Start the Initialization Process ---
if (typeof THREE !== 'undefined' && typeof io !== 'undefined') {
    init();
} else {
     console.error("Initialization aborted due to missing libraries.");
     const loadingElem = document.getElementById('loadingScreen');
     if(loadingElem) {
        loadingElem.style.display = 'flex'; // Make sure it's visible
        loadingElem.innerHTML = '<h1>Error: Failed to load required libraries! Refresh or check console.</h1>';
     }
}