//main.js
if (typeof THREE === 'undefined') {
    console.error("THREE.js library not loaded. Check script tag in index.html.");
    document.getElementById('loadingScreen').innerHTML = '<h1>Error: Could not load 3D library!</h1>';
    throw new Error("THREE.js not loaded");
}
if (typeof io === 'undefined') {
    console.error("Socket.IO client library not loaded. Check script tag in index.html.");
    document.getElementById('loadingScreen').innerHTML = '<h1>Error: Could not load networking library!</h1>';
    throw new Error("Socket.IO client not loaded");
}

// --- Basic Three.js Scene Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400);
const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('gameCanvas'),
    antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// --- Scene Elements (using Three.js objects) ---
let playerCar;
const opponentCars = {};
let groundPlane;
let trackMesh;

// --- Game State & Controls ---
const keyboard = {};
let playerSpeed = 0;
const maxSpeed = 1.5;
const acceleration = 0.02;
const deceleration = 0.01;
const brakePower = 0.05;
const turnSpeed = 0.035;
const cameraOffset = new THREE.Vector3(0, 5, -10);
const INTERPOLATION_FACTOR = 0.15;

// --- HTML Element References ---
const speedometerElement = document.getElementById('speedometer');
const positionElement = document.getElementById('position');
const lapCounterElement = document.getElementById('lapCounter');
const messageElement = document.getElementById('message');
const loadingScreen = document.getElementById('loadingScreen');

// --- Networking ---
let socket;
let myId = null;

// --- Initialization Function ---
function init() {
    console.log("Initializing Monad Velocity UI...");
    setupScene();
    setupSkybox();
    setupLighting();
    createGround();
    createTrack();
    addFoliage();
    setupCamera();
    setupControls();
    setupSocketIO();
    loadingScreen.style.display = 'none';
    showMessage("Connecting to server...", 0);
    console.log("Initialization base complete. Waiting for server connection...");
    animate();
}

// --- Skybox Setup ---
function setupSkybox() {
    const loader = new THREE.TextureLoader();
    const skyTexture = loader.load('media/clouds_autumn_sunset.97e16563.webp');
    skyTexture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = skyTexture;
    scene.environment = skyTexture;
}

// --- Socket.IO Setup ---
function setupSocketIO() {
    socket = io('http://localhost:3000');

    socket.on('connect', () => {
        console.log('Successfully connected to server! My ID:', socket.id);
        myId = socket.id;
        showMessage(`Connected! ID: ${myId}`, 3000);
        if (!playerCar) {
            playerCar = createCar(new THREE.Color(0xff0000), myId);
            playerCar.position.set(0, playerCar.position.y, 55);
            playerCar.userData.lapCount = 0;
            playerCar.userData.prevSide = null;
            console.log("Player car created.");
        }
    });

    socket.on('disconnect', (reason) => {
        console.log(`Disconnected from server: ${reason}`);
        myId = null;
        if (playerCar) {
            scene.remove(playerCar);
            playerCar = null;
        }
        for (const id in opponentCars) {
            removeOpponent(id);
        }
        positionElement.textContent = `Position: - / -`;
        speedometerElement.textContent = `Speed: 0 km/h`;
        showMessage(`Disconnected: ${reason}`, 5000, true);
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        showMessage("Could not connect to server", 5000, true);
    });

    socket.on('currentPlayers', (playersData) => {
        if (!myId) return;
        console.log('Receiving current players:', playersData);
        for (const id in opponentCars) {
            removeOpponent(id);
        }
        for (const id in playersData) {
            if (id !== myId) {
                addOpponent(playersData[id]);
            }
        }
        updateHUDPosition();
    });

    socket.on('newPlayer', (playerData) => {
        if (!myId || playerData.id === myId) return;
        console.log('New player joined:', playerData.id);
        addOpponent(playerData);
        updateHUDPosition();
    });

    socket.on('opponentUpdate', (playerData) => {
        if (!myId || playerData.id === myId) return;
        const opponentCar = opponentCars[playerData.id];
        if (opponentCar) {
            if (playerData.position && typeof playerData.position.x === 'number') {
                const targetPos = new THREE.Vector3(playerData.position.x, playerData.position.y, playerData.position.z);
                opponentCar.position.lerp(targetPos, INTERPOLATION_FACTOR);
            }
            if (playerData.rotation && typeof playerData.rotation.w === 'number') {
                const targetQuat = new THREE.Quaternion(
                    playerData.rotation.x,
                    playerData.rotation.y,
                    playerData.rotation.z,
                    playerData.rotation.w
                );
                if (!isNaN(targetQuat.x) && !isNaN(targetQuat.y) && !isNaN(targetQuat.z) && !isNaN(targetQuat.w)) {
                    opponentCar.quaternion.slerp(targetQuat, INTERPOLATION_FACTOR);
                }
            }
        } else {
            console.warn(`Received update for unknown opponent ${playerData.id}. Adding.`);
            addOpponent(playerData);
            updateHUDPosition();
        }
    });

    socket.on('playerDisconnected', (playerId) => {
        console.log('Player disconnected:', playerId);
        removeOpponent(playerId);
        updateHUDPosition();
    });

    socket.on('lapCompleted', (data) => {
        if (data.id !== myId && opponentCars[data.id]) {
            opponentCars[data.id].userData.lapCount = data.lapCount;
            console.log(`Opponent ${data.id} completed lap ${data.lapCount}`);
        }
    });

    socket.on('playerWon', (data) => {
        if (data.id === myId) return;
        showMessage(`Player ${data.id} wins!`, 5000);
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
        opponentCars[playerData.id].position.set(playerData.position.x, playerData.position.y, playerData.position.z);
        opponentCars[playerData.id].quaternion.set(playerData.rotation.x, playerData.rotation.y, playerData.rotation.z, playerData.rotation.w);
        return;
    }
    const color = playerData.color || 0x0000ff;
    const car = createCar(new THREE.Color(color), playerData.id);
    if (playerData.position) {
        car.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
    }
    if (playerData.rotation) {
        car.quaternion.set(playerData.rotation.x, playerData.rotation.y, playerData.rotation.z, playerData.rotation.w);
    }
    car.userData.lapCount = 0;
    opponentCars[playerData.id] = car;
    console.log(`Added opponent car: ${playerData.id}`);
}

function removeOpponent(playerId) {
    if (opponentCars[playerId]) {
        scene.remove(opponentCars[playerId]);
        delete opponentCars[playerId];
        console.log(`Removed opponent car: ${playerId}`);
    }
}

// --- Three.js Scene Configuration ---
function setupScene() {
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 100, 500);
}

function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    scene.add(hemisphereLight);
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
    const groundGeometry = new THREE.PlaneGeometry(8000, 8000);
    const groundMaterial = new THREE.MeshStandardMaterial({
        map: new THREE.TextureLoader().load('media/grass_spring_01.768b870f.webp'),
        roughness: 0.9,
        metalness: 0.1
    });
    groundMaterial.map.repeat.set(100, 100);
    groundMaterial.map.wrapS = groundMaterial.map.wrapT = THREE.RepeatWrapping;
    groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);
}

// Assuming THREE, scene, trackMesh are defined elsewhere
// let scene; // Your Three.js scene object
// let trackMesh; // Variable to hold the track mesh

// Assuming THREE, scene, trackMesh are defined elsewhere appropriately
function createTrack() {
    const trackPoints = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(2000, 0, 0),
        new THREE.Vector3(3000, 0, 1000),
        new THREE.Vector3(2000, 0, 2000),
        new THREE.Vector3(0, 0, 2000),
        new THREE.Vector3(-1000, 0, 1000),
        new THREE.Vector3(0, 0, 0) // Close the loop
    ];
    const trackCurve = new THREE.CatmullRomCurve3(trackPoints, true); // Set closed=true for CatmullRom
    const numPoints = 200; // Increased for smoother geometry, especially for UV mapping
    const trackWidth = 15;
    const innerPoints = [];
    const outerPoints = [];
    const halfWidth = trackWidth / 2;

    // Use getPoints to ensure consistent spacing for UV mapping along the length
    const curvePoints = trackCurve.getSpacedPoints(numPoints); // Get evenly spaced points

    for (let i = 0; i <= numPoints; i++) { // Loop needs to include the last point to close the geometry
        const point = curvePoints[i % numPoints]; // Use points from getSpacedPoints, wrap around for the last point
        const tangent = trackCurve.getTangentAt(i / numPoints).normalize(); // Get tangent at the corresponding parameter

        // --- Robust Normal Calculation (Handles potential vertical tangents better) ---
        const up = new THREE.Vector3(0, 1, 0);
        const binormal = new THREE.Vector3().crossVectors(up, tangent).normalize();
        const normal = new THREE.Vector3().crossVectors(tangent, binormal).normalize(); // This normal points outwards horizontally

        // Ensure normal is horizontal if the track is intended to be flat
        const horizontalNormal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        // --- End Robust Normal Calculation ---


        // Use horizontalNormal for a flat track
        const innerPoint = point.clone().add(horizontalNormal.clone().multiplyScalar(-halfWidth));
        const outerPoint = point.clone().add(horizontalNormal.clone().multiplyScalar(halfWidth));

        innerPoints.push(innerPoint);
        outerPoints.push(outerPoint);
    }

    const vertices = [];
    const uvs = [];
    const lengthSegments = numPoints; // Number of segments along the length

    // --- Define how many times the texture should repeat along the *entire* track length ---
    const textureRepeatsAlongLength = 50; // <--- ADJUST THIS VALUE AS NEEDED

    for (let i = 0; i < lengthSegments; i++) {
        // Segment i connects point i and point i+1
        const idx0 = i;
        const idx1 = i + 1; // Will use modulo later in indices

        // Vertices for the current segment
        vertices.push(innerPoints[idx0].x, innerPoints[idx0].y, innerPoints[idx0].z); // Inner point 0
        vertices.push(outerPoints[idx0].x, outerPoints[idx0].y, outerPoints[idx0].z); // Outer point 0
        // Vertices for the next point (will be used by indices) are added in subsequent iterations

        // --- Corrected UV Calculation ---
        // U coordinate represents width: 0 = inner, 1 = outer
        // V coordinate represents length: increases along the track, scaled by textureRepeats
        const v0 = (i / lengthSegments) * textureRepeatsAlongLength;
        //const v1 = ((i + 1) / lengthSegments) * textureRepeatsAlongLength; // V for the next point along

        uvs.push(0, v0); // Inner point UV (U=0, V=v0)
        uvs.push(1, v0); // Outer point UV (U=1, V=v0)
        // The UVs for the *next* point (v1) will be generated in the next iteration
        // We only need UVs corresponding to the vertices being added in *this* iteration.
    }

    // Add vertices for the very last point to close the loop explicitly in the vertex array
    // These correspond to the first point's position but will have the final V coordinate.
    vertices.push(innerPoints[lengthSegments].x, innerPoints[lengthSegments].y, innerPoints[lengthSegments].z);
    vertices.push(outerPoints[lengthSegments].x, outerPoints[lengthSegments].y, outerPoints[lengthSegments].z);

    // Add the final UV coordinates corresponding to the last vertices
    const v_final = textureRepeatsAlongLength; // (lengthSegments / lengthSegments) * textureRepeatsAlongLength
    uvs.push(0, v_final); // Inner point UV (U=0, V=end)
    uvs.push(1, v_final); // Outer point UV (U=1, V=end)


    // --- Corrected Index Generation ---
    // We now have (lengthSegments + 1) pairs of vertices. Total vertices = 2 * (lengthSegments + 1)
    const indices = [];
    for (let i = 0; i < lengthSegments; i++) {
        const a = i * 2;       // Current inner vertex
        const b = i * 2 + 1;   // Current outer vertex
        const c = (i + 1) * 2; // Next inner vertex
        const d = (i + 1) * 2 + 1; // Next outer vertex

        // Triangle 1: current inner, current outer, next outer
        indices.push(a, b, d);
        // Triangle 2: current inner, next outer, next inner
        indices.push(a, d, c);
    }


    const trackGeometry = new THREE.BufferGeometry();
    trackGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    trackGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    trackGeometry.setIndex(indices);
    trackGeometry.computeVertexNormals(); // Calculate normals for lighting

    const trackMaterial = new THREE.MeshStandardMaterial({
        roughness: 0.8,
        metalness: 0.2,
        side: THREE.DoubleSide // Render both sides, helpful for debugging UVs/normals
    });
    const loader = new THREE.TextureLoader();
    loader.load(
        'media/road_03.29415d96.webp',
        (texture) => {
            trackMaterial.map = texture;
            // --- Corrected Texture Wrapping and Repetition ---
            texture.wrapS = THREE.RepeatWrapping; // Wrap across width (U direction) - Use ClampToEdgeWrapping if texture edges shouldn't repeat horizontally
            texture.wrapT = THREE.RepeatWrapping; // Wrap along length (V direction) - THIS IS IMPORTANT
            // The repetition is now handled by the V coordinate scaling directly
            // We set repeat to (1, 1) because the UVs now span the desired repeat range
            texture.repeat.set(1, 1);
            // Anisotropy can improve texture appearance when viewed at sharp angles
            texture.anisotropy = 16; // renderer.capabilities.getMaxAnisotropy(); // Get max supported value
            texture.needsUpdate = true; // Ensure texture updates are applied
            trackMaterial.needsUpdate = true;
            console.log('Road texture loaded successfully');
        },
        undefined,
        (error) => {
            console.error('Error loading road texture:', error);
        }
    );

    trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);
    trackMesh.position.y = 0.1; // Slight offset to prevent Z-fighting if there's a ground plane
    trackMesh.receiveShadow = true;
    scene.add(trackMesh);

    // --- Finish Line Data ---
    // Ensure using the *actual* points used for geometry if needed
    const finishLineCenter = curvePoints[0]; // Center is the first point
    const finishLineTangent = trackCurve.getTangentAt(0).normalize(); // Tangent at the start
    trackMesh.userData = { trackCurve, points: curvePoints, trackWidth, finishLineCenter, finishLineTangent };


    // --- Wall/Rail Creation (Seems okay, but ensure curves match geometry points) ---

    // Create curves from the final calculated points used for the track mesh vertices
    // Note: innerPoints/outerPoints has numPoints + 1 elements
    const innerWallCurve = new THREE.CatmullRomCurve3(innerPoints, true); // Use the points generated, close loop
    const outerWallCurve = new THREE.CatmullRomCurve3(outerPoints, true); // Use the points generated, close loop


    const wallShape = new THREE.Shape();
    wallShape.moveTo(0, 0);     // Base inner
    wallShape.lineTo(0, 2);     // Height inner
    wallShape.lineTo(0.5, 2);   // Height outer
    wallShape.lineTo(0.5, 0);   // Base outer
    wallShape.lineTo(0, 0);     // Close shape

    const railMaterial = new THREE.MeshStandardMaterial({
        map: new THREE.TextureLoader().load('media/wall_barrier_02.44c5c0ea.webp'),
        normalMap: new THREE.TextureLoader().load('media/wall_barrier_02_n.0c79c69f.webp'),
        side: THREE.DoubleSide // Good for extruded shapes
    });

    // Adjust steps for extrude geometry - might need more or less than numPoints depending on curve complexity
    const extrudeSteps = numPoints * 2; // Often need more steps for smooth extrusion

    const extrudeSettingsInner = { steps: extrudeSteps, bevelEnabled: false, extrudePath: innerWallCurve };
    const innerRailGeometry = new THREE.ExtrudeGeometry(wallShape, extrudeSettingsInner);
    const innerRail = new THREE.Mesh(innerRailGeometry, railMaterial);
    innerRail.castShadow = true;
    innerRail.receiveShadow = true;
    scene.add(innerRail);

    const extrudeSettingsOuter = { steps: extrudeSteps, bevelEnabled: false, extrudePath: outerWallCurve };
    const outerRailGeometry = new THREE.ExtrudeGeometry(wallShape, extrudeSettingsOuter);
    const outerRail = new THREE.Mesh(outerRailGeometry, railMaterial);
    outerRail.castShadow = true;
    outerRail.receiveShadow = true;
    scene.add(outerRail);

    console.log("Track creation complete.");
}

// --- Make sure you have a scene defined before calling ---
// const scene = new THREE.Scene();
// --- Call the function ---
// createTrack();
function addFoliage() {
    const foliageTextures = [
        'media/foliage_grass_summer.2ca20eaf.webp',
        'media/foliage_bush_spring.53436f47.webp',
        'media/trees_summer_near_04.0b483335.webp'
    ];
    const trackData = trackMesh.userData;
    const numFoliage = 1000;

    for (let i = 0; i < numFoliage; i++) {
        const u = Math.random();
        const point = trackData.trackCurve.getPointAt(u);
        const tangent = trackData.trackCurve.getTangentAt(u);
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        const side = Math.random() < 0.5 ? -1 : 1;
        const distance = 10 + Math.random() * 20;
        const position = point.clone().add(normal.clone().multiplyScalar(side * (trackData.trackWidth / 2 + distance)));

        const texturePath = foliageTextures[Math.floor(Math.random() * foliageTextures.length)];
        const texture = new THREE.TextureLoader().load(texturePath);
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);
        sprite.position.copy(position);
        sprite.position.y = 0;

        const scale = 5 + Math.random() * 15;
        sprite.scale.set(scale, scale, 1);

        scene.add(sprite);
    }
}

// --- Car Creation & Management ---
function createCar(color = 0x0000ff, id = 'car') {
    const carGroup = new THREE.Group();
    carGroup.userData = { id: id, speed: 0 };
    const bodyGeometry = new THREE.BoxGeometry(2, 1, 4);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: color, roughness: 0.3, metalness: 0.5 });
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.position.y = 0.7;
    bodyMesh.castShadow = true;
    carGroup.add(bodyMesh);

    const wheelRadius = 0.4;
    const wheelWidth = 0.3;
    const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const wheelPositions = [
        { x: -1.1, y: 0.5, z: 1.5 }, { x: 1.1, y: 0.5, z: 1.5 },
        { x: -1.1, y: 0.5, z: -1.5 }, { x: 1.1, y: 0.5, z: -1.5 }
    ];
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos.x, pos.y, pos.z);
        wheel.castShadow = true;
        carGroup.add(wheel);
    });

    carGroup.position.y = 0.1 + wheelRadius;
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
    if (!playerCar || !socket || !myId || !socket.connected) return;

    let speedChanged = false;
    let rotationChanged = false;
    const oldSpeed = playerSpeed;

    if (keyboard['ArrowUp'] || keyboard['KeyW']) { playerSpeed += acceleration; speedChanged = true; }
    else if (keyboard['ArrowDown'] || keyboard['KeyS']) { playerSpeed -= brakePower; speedChanged = true; }
    else {
        if (playerSpeed > 0) { playerSpeed = Math.max(0, playerSpeed - deceleration); speedChanged = true; }
        else if (playerSpeed < 0) { playerSpeed = Math.min(0, playerSpeed + deceleration); speedChanged = true; }
    }
    playerSpeed = Math.max(-maxSpeed / 2, Math.min(maxSpeed, playerSpeed));
    if (Math.abs(playerSpeed - oldSpeed) < 0.001) speedChanged = false;

    let turnFactor = 0;
    if (Math.abs(playerSpeed) > 0.05) {
        if (keyboard['ArrowLeft'] || keyboard['KeyA']) turnFactor = 1;
        if (keyboard['ArrowRight'] || keyboard['KeyD']) turnFactor = -1;
    }
    if (turnFactor !== 0) {
        const deltaRotation = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            turnFactor * turnSpeed * (playerSpeed / maxSpeed)
        );
        playerCar.quaternion.multiplyQuaternions(deltaRotation, playerCar.quaternion);
        rotationChanged = true;
    }

    let positionChanged = false;
    if (Math.abs(playerSpeed) > 0.001) {
        const forwardDirection = new THREE.Vector3(0, 0, 1);
        forwardDirection.applyQuaternion(playerCar.quaternion);
        const moveDistance = forwardDirection.multiplyScalar(playerSpeed);
        playerCar.position.add(moveDistance);
        positionChanged = true;
    }

    if (playerCar) {
        const carPos = playerCar.position;
        const trackData = trackMesh.userData;
        const trackCurve = trackData.trackCurve;

        let minDist = Infinity;
        let closestU = 0;
        for (let i = 0; i <= 100; i++) {
            const u = i / 100;
            const point = trackCurve.getPointAt(u);
            const dist = carPos.distanceTo(point);
            if (dist < minDist) {
                minDist = dist;
                closestU = u;
            }
        }

        const closestPoint = trackCurve.getPointAt(closestU);
        const tangent = trackCurve.getTangentAt(closestU).normalize();
        const toCar = carPos.clone().sub(closestPoint);
        const alongTangent = toCar.dot(tangent);
        const perpendicularVector = toCar.clone().sub(tangent.clone().multiplyScalar(alongTangent));
        const distanceFromCenter = perpendicularVector.length();

        if (distanceFromCenter > trackData.trackWidth / 2) {
            const snapDirection = perpendicularVector.normalize();
            const boundaryPos = closestPoint.clone().add(snapDirection.multiplyScalar(trackData.trackWidth / 2));
            playerCar.position.copy(boundaryPos);
        }

        const vectorToCenter = carPos.clone().sub(trackData.finishLineCenter);
        const side = vectorToCenter.dot(trackData.finishLineTangent);
        if (playerCar.userData.prevSide !== null) {
            if (playerCar.userData.prevSide < 0 && side > 0) {
                playerCar.userData.lapCount++;
                console.log(`Lap completed! Total laps: ${playerCar.userData.lapCount}`);
                socket.emit('lapCompleted', { id: myId, lapCount: playerCar.userData.lapCount });
                if (playerCar.userData.lapCount >= 3) {
                    console.log("You win!");
                    showMessage("You win!", 5000);
                    socket.emit('playerWon', { id: myId });
                }
            }
        }
        playerCar.userData.prevSide = side;
    }

    const wheelRotationSpeed = playerSpeed * -2.0;
    playerCar.children.forEach(child => {
        if (child.geometry && child.geometry.type === 'CylinderGeometry') {
            child.rotation.x += wheelRotationSpeed;
        }
    });
    playerCar.userData.speed = playerSpeed;

    if (positionChanged || rotationChanged) {
        const pos = playerCar.position;
        const quat = playerCar.quaternion;
        const updateData = {
            position: { x: pos.x, y: pos.y, z: pos.z },
            rotation: { x: quat.x, y: quat.y, z: quat.z, w: quat.w }
        };
        socket.emit('playerUpdate', updateData);
    }
}

// --- HUD Update ---
function updateHUD() {
    if (!playerCar) return;
    const displaySpeed = Math.abs(playerCar.userData.speed * 50).toFixed(0);
    speedometerElement.textContent = `Speed: ${displaySpeed} km/h`;
    lapCounterElement.textContent = `Lap: ${playerCar.userData.lapCount} / 3`;
}

function updateHUDPosition() {
    const totalPlayers = (myId ? 1 : 0) + Object.keys(opponentCars).length;
    const currentPosition = 1;
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
    handleControls(deltaTime);
    updateCamera();
    updateHUD();
    for (const id in opponentCars) {
        const car = opponentCars[id];
        const approxSpeed = car.userData.speed || 0;
        const wheelRotationSpeed = approxSpeed * -2.0;
        car.children.forEach(child => {
            if (child.geometry && child.geometry.type === 'CylinderGeometry') {
                child.rotation.x += wheelRotationSpeed;
            }
        });
    }
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
    if (loadingElem) {
        loadingElem.style.display = 'flex';
        loadingElem.innerHTML = '<h1>Error: Failed to load required libraries! Refresh or check console.</h1>';
    }
}