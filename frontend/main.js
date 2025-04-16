//main.js
if (typeof THREE === "undefined") {
  console.error("THREE.js library not loaded. Check script tag in index.html.");
  document.getElementById("loadingScreen").innerHTML =
    "<h1>Error: Could not load 3D library!</h1>";
  throw new Error("THREE.js not loaded");
}
if (typeof io === "undefined") {
  console.error(
    "Socket.IO client library not loaded. Check script tag in index.html."
  );
  document.getElementById("loadingScreen").innerHTML =
    "<h1>Error: Could not load networking library!</h1>";
  throw new Error("Socket.IO client not loaded");
}

// --- Basic Three.js Scene Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  400
);
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("gameCanvas"),
  antialias: true,
  alpha: true, // Enable alpha channel in the renderer
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.setClearColor(0x000000, 0); // Set clear color to transparent
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true; // Enable shadow mapping
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Optional: Use soft shadows for better quality

// --- Scene Elements (using Three.js objects) ---
let existingPlayersLoaded = false;
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

// Paths to the .obj models and textures
const carModelPath = 'media/car_blue.fbx';
const oppCarModelPath = 'media/car_red.fbx'
const wheelModelPath = 'media/wheel.obj';
const carTexturePath = 'media/car_texture.jpg';
const wheelTexturePath = 'media/wheel_texture.webp';

// --- HTML Element References ---
const speedometerElement = document.getElementById("speedometer");
const positionElement = document.getElementById("position");
const lapCounterElement = document.getElementById("lapCounter");
const messageElement = document.getElementById("message");
const loadingScreen = document.getElementById("loadingScreen");


// --- Networking ---
let socket;
let myId = null;

// --- Initialization Function ---
// Add global variables for grass data
let grassData = null;

// main.js
function getStartingPosition(carIndex, trackCurve, trackWidth) {
    const rowSpacing = 10; // Distance between rows (adjust for car length)
    const laneOffset = trackWidth / 4; // Half the track width for left/right lanes
    const baseHeight = 0.5; // Height above the track surface

    const row = Math.floor(carIndex / 2); // Row number (0, 1, 2, ...)
    const isLeftLane = carIndex % 2 === 0; // Even indices go left, odd go right

    // Calculate position along the track curve
    const totalLength = trackCurve.getLength();
    const u = Math.max(0, 1 - (row * rowSpacing) / totalLength); // Move backward along the curve
    const point = trackCurve.getPointAt(u);
    const tangent = trackCurve.getTangentAt(u).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize(); // Perpendicular to track

    // Apply lane offset
    const offset = laneOffset * (isLeftLane ? -1 : 1); // Negative for left, positive for right
    const position = point.clone().add(normal.multiplyScalar(offset));
    position.y += baseHeight; // Adjust height

    // Set rotation to match track direction
    const angle = Math.atan2(tangent.x, tangent.z);
    const rotationY = angle;

    console.log(`Car ${carIndex}: Row ${row}, ${isLeftLane ? 'Left' : 'Right'} Lane, Position:`, position);

    return { position: position, rotationY: rotationY };
}

async function init() {
    console.log("Initializing Monad Velocity UI...");
    setupScene();
    setupSkybox();
    setupLighting();
    createGround();
    createTrack();
    await preloadFoliageTextures();
    addFoliage();
    await preloadGrassTexture();
    grassData = addGrass();
    await loadCarAssets(); // Load car models and textures
    setupCamera();
    setupControls(); // Only sets up event listeners now
    setupSocketIO();
    loadingScreen.style.display = 'none';
    showMessage("Connecting to server...", 0);
    console.log("Initialization base complete. Waiting for server connection...");
    animate();
}

// --- Skybox Setup ---
function setupSkybox() {
  const loader = new THREE.TextureLoader();
  const skyTexture = loader.load("media/seamless-sky-texture_739292-23602.jpg");
  skyTexture.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = skyTexture;
  scene.environment = skyTexture;
}

// --- Socket.IO Setup ---
function setupSocketIO() {
  socket = io("http://localhost:3000");

socket.on("connect", () => {
    console.log("Successfully connected to server! My ID:", socket.id);
    myId = socket.id;
    showMessage(`Connected! ID: ${myId}`, 3000);
    // Don’t create playerCar here—it will happen after currentPlayers
});

  socket.on("disconnect", (reason) => {
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

  socket.on("connect_error", (error) => {
    console.error("Connection error:", error);
    showMessage("Could not connect to server", 5000, true);
  });

socket.on("currentPlayers", (playersData) => {
    if (!myId) return;
    console.log("Receiving current players:", playersData);

    // Clear any existing opponent cars
    for (const id in opponentCars) {
        removeOpponent(id);
    }

    const trackData = trackMesh.userData;

    // Add existing players to opponentCars
    for (const id in playersData) {
        if (id !== myId) {
            const car = createCar('red', id);
            if (playersData[id].position) {
                car.position.set(
                    playersData[id].position.x,
                    playersData[id].position.y,
                    playersData[id].position.z
                );
            } else {
                const carIndex = Object.keys(opponentCars).length;
                const { position, rotationY } = getStartingPosition(carIndex, trackData.trackCurve, trackData.trackWidth);
                car.position.copy(position);
                car.rotation.y = rotationY;
            }
            if (playersData[id].rotation) {
                car.quaternion.set(
                    playersData[id].rotation.x,
                    playersData[id].rotation.y,
                    playersData[id].rotation.z,
                    playersData[id].rotation.w
                );
            } else if (!playersData[id].position) {
                car.quaternion.setFromEuler(new THREE.Euler(0, car.rotation.y, 0));
            }
            car.userData.lapCount = 0;
            opponentCars[id] = car;
            scene.add(car);
            console.log(`Added existing opponent car: ${id} at position:`, car.position);
        }
    }

    // Mark existing players as loaded and create playerCar
    existingPlayersLoaded = true;
    createPlayerCar();
    updateHUDPosition();
});

  socket.on("newPlayer", (playerData) => {
    if (!myId || playerData.id === myId) {
        console.log("Skipping newPlayer event: myId not set or same as player ID", { myId, playerId: playerData.id });
        return;
    }
    console.log("New player joined:", playerData);
    addOpponent(playerData);
    updateHUDPosition();
});

  socket.on("opponentUpdate", (playerData) => {
    if (!myId || playerData.id === myId) return;
    const opponentCar = opponentCars[playerData.id];
    if (opponentCar) {
      if (playerData.position && typeof playerData.position.x === "number") {
        const targetPos = new THREE.Vector3(
          playerData.position.x,
          playerData.position.y,
          playerData.position.z
        );
        opponentCar.position.lerp(targetPos, INTERPOLATION_FACTOR);
      }
      if (playerData.rotation && typeof playerData.rotation.w === "number") {
        const targetQuat = new THREE.Quaternion(
          playerData.rotation.x,
          playerData.rotation.y,
          playerData.rotation.z,
          playerData.rotation.w
        );
        if (
          !isNaN(targetQuat.x) &&
          !isNaN(targetQuat.y) &&
          !isNaN(targetQuat.z) &&
          !isNaN(targetQuat.w)
        ) {
          opponentCar.quaternion.slerp(targetQuat, INTERPOLATION_FACTOR);
        }
      }
    } else {
      console.warn(
        `Received update for unknown opponent ${playerData.id}. Adding.`
      );
      addOpponent(playerData);
      updateHUDPosition();
    }
  });

  socket.on("playerDisconnected", (playerId) => {
    console.log("Player disconnected:", playerId);
    removeOpponent(playerId);
    updateHUDPosition();
  });

  socket.on("lapCompleted", (data) => {
    if (data.id !== myId && opponentCars[data.id]) {
      opponentCars[data.id].userData.lapCount = data.lapCount;
      console.log(`Opponent ${data.id} completed lap ${data.lapCount}`);
    }
  });

  socket.on("playerWon", (data) => {
    if (data.id === myId) return;
    showMessage(`Player ${data.id} wins!`, 5000);
  });
}

function createPlayerCar() {
    if (!existingPlayersLoaded || playerCar) return; // Prevent multiple creations

    playerCar = createCar('blue', myId);
    playerCar.userData = { speed: 0, velocity: new THREE.Vector3(), lapCount: 0, prevSide: null };

    // Calculate carIndex based on the number of opponents plus self
    const totalCars = Object.keys(opponentCars).length + 1;
    const carIndex = totalCars - 1;

    const trackData = trackMesh.userData;
    const { position, rotationY } = getStartingPosition(carIndex, trackData.trackCurve, trackData.trackWidth);
    playerCar.position.copy(position);
    playerCar.rotation.y = rotationY;
    playerCar.quaternion.setFromEuler(new THREE.Euler(0, rotationY, 0));

    console.log('Player car initial position:', playerCar.position);
    console.log('Player car rotation (aligned with track):', playerCar.rotation.y);

    const forwardDirection = new THREE.Vector3(0, 0, 1).applyQuaternion(playerCar.quaternion);
    console.log('Car forward direction (world, after group rotation):', forwardDirection);

    scene.add(playerCar);

    // Send initial position and rotation to the server
    const pos = playerCar.position;
    const quat = playerCar.quaternion;
    socket.emit("playerUpdate", {
        position: { x: pos.x, y: pos.y, z: pos.z },
        rotation: { x: quat.x, y: quat.y, z: quat.z, w: quat.w }
    });
}

function addOpponent(playerData) {
    if (!playerData || !playerData.id) {
        console.error("Invalid playerData received for addOpponent", playerData);
        return;
    }
    if (opponentCars[playerData.id]) {
        console.warn(`Opponent ${playerData.id} already exists. Updating position.`);
        opponentCars[playerData.id].position.set(
            playerData.position.x,
            playerData.position.y,
            playerData.position.z
        );
        opponentCars[playerData.id].quaternion.set(
            playerData.rotation.x,
            playerData.rotation.y,
            playerData.rotation.z,
            playerData.rotation.w
        );
        return;
    }
    const car = createCar('red', playerData.id);

    const trackData = trackMesh.userData;
    const totalCars = Object.keys(opponentCars).length + (playerCar ? 1 : 0);
    const carIndex = totalCars; // Next index
    const { position, rotationY } = getStartingPosition(carIndex, trackData.trackCurve, trackData.trackWidth);
    car.position.copy(position);
    car.rotation.y = rotationY;

    if (playerData.rotation) {
        car.quaternion.set(
            playerData.rotation.x,
            playerData.rotation.y,
            playerData.rotation.z,
            playerData.rotation.w
        );
    } else {
        car.quaternion.setFromEuler(new THREE.Euler(0, rotationY, 0));
    }

    car.userData.lapCount = 0;
    opponentCars[playerData.id] = car;
    scene.add(car);
    console.log(`Added opponent car: ${playerData.id} at position:`, car.position);
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
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 100, 500);
}

function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x404040, 2.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(0, 500, 0);
    directionalLight.target.position.set(0, 0, 0);
    directionalLight.target.updateMatrixWorld();

    // Enable shadow casting
    directionalLight.castShadow = true;

    // Configure shadow camera
    directionalLight.shadow.mapSize.width = 2048; // Higher resolution for better shadow quality
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.left = -1000; // Adjust to cover the track area
    directionalLight.shadow.camera.right = 1000;
    directionalLight.shadow.camera.top = 1000;
    directionalLight.shadow.camera.bottom = -1000;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 2000; // Ensure it covers the light's position (distance to origin)

    // Optional: Reduce shadow bias to avoid shadow acne
    directionalLight.shadow.bias = -0.0001;

    scene.add(directionalLight);

    directionalLight.userData.trackCenter = new THREE.Vector3(0, 0, 0);
}

function createGround() {
  const groundGeometry = new THREE.PlaneGeometry(8000, 8000);
  const groundMaterial = new THREE.MeshStandardMaterial({
    map: new THREE.TextureLoader().load("media/grass/texture.jpg"),
    roughness: 0.9,
    metalness: 0.1,
  });
  groundMaterial.map.repeat.set(3000, 3000);
  groundMaterial.map.wrapS = groundMaterial.map.wrapT = THREE.RepeatWrapping;
  groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.receiveShadow = true;
  scene.add(groundPlane);
}

/**
 * Creates the racetrack geometry, surface texture, and boundary rails.
 * Addresses potential seam issues at the start/finish line and ensures
 * rails are placed correctly outside the track surface.
 */
function createTrack() {
    // 1. Define Track Path
    const trackPoints = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(2000, 0, 0),
        new THREE.Vector3(3000, 0, 1000),
        new THREE.Vector3(2000, 0, 2000),
        new THREE.Vector3(0, 0, 2000),
        new THREE.Vector3(-1000, 0, 1000),
        // No need to repeat the first point here; CatmullRomCurve3 with 'true' handles closure.
    ];
    // Create a closed CatmullRom curve from the points
    const trackCurve = new THREE.CatmullRomCurve3(trackPoints, true, 'catmullrom', 0.5);
    const numPoints = 200; // Number of segments for geometry generation

    // 2. Define Track and Wall Dimensions
    const trackWidth = 15;
    const halfWidth = trackWidth / 2;
    const wallThickness = 0.5; // Thickness of the boundary walls
    const wallHeight = 2.0;   // Height of the boundary walls

    // 3. Define Wall Shape (origin at the bottom-inner corner)
    const wallShape = new THREE.Shape();
    wallShape.moveTo(0, 0); // Start at the point on the extrusion path
    wallShape.lineTo(0, wallHeight);
    wallShape.lineTo(wallThickness, wallHeight); // Extrude thickness outwards
    wallShape.lineTo(wallThickness, 0);
    wallShape.lineTo(0, 0); // Close the shape

    // 4. Calculate Points for Track Surface and Rail Paths
    const innerRailPoints = []; // Path for the inner rail extrusion
    const outerRailPoints = []; // Path for the outer rail extrusion
    const surfaceVertices = []; // Vertices for the visible track surface
    const surfaceUVs = [];      // UV coordinates for the track surface texture
    const textureRepeatsAlongLength = 50; // How many times the texture repeats along the track length

    for (let i = 0; i <= numPoints; i++) { // Loop to include the closing point (numPoints+1 total points)
        const u = i / numPoints; // Parameter along the curve (0 to 1)

        // Get position and tangent at this point on the centerline curve
        const point = trackCurve.getPointAt(u);
        const tangent = trackCurve.getTangentAt(u).normalize();

        // Calculate the normal vector pointing outwards (right) on the XZ plane
        const horizontalNormal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        // --- Calculate Rail Paths ---
        // Outer rail path: At the outer edge of the track
        const outerRailPos = point.clone().add(horizontalNormal.clone().multiplyScalar(halfWidth + wallHeight));
        outerRailPoints.push(outerRailPos);

        // Inner rail path: Shifted *inward* from the inner edge by wall thickness
        const innerRailPos = point.clone().add(horizontalNormal.clone().multiplyScalar(-halfWidth));
        innerRailPoints.push(innerRailPos);

        // --- Calculate Track Surface Vertices and UVs ---
        // Inner edge of the visible track surface
        const surfaceInner = point.clone().add(horizontalNormal.clone().multiplyScalar(-halfWidth));
        surfaceVertices.push(surfaceInner.x, surfaceInner.y, surfaceInner.z);

        // Outer edge of the visible track surface
        const surfaceOuter = point.clone().add(horizontalNormal.clone().multiplyScalar(halfWidth));
        surfaceVertices.push(surfaceOuter.x, surfaceOuter.y, surfaceOuter.z);

        // Calculate UV coordinates
        const v = (i / numPoints) * textureRepeatsAlongLength; // V coordinate progresses along the track length
        surfaceUVs.push(0, v); // U = 0 for the inner edge
        surfaceUVs.push(1, v); // U = 1 for the outer edge
    }

    // 5. Create Track Surface Geometry
    const trackGeometry = new THREE.BufferGeometry();
    trackGeometry.setAttribute('position', new THREE.Float32BufferAttribute(surfaceVertices, 3));
    trackGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(surfaceUVs, 2));

    // Create indices for the track surface triangles
    const indices = [];
    const lengthSegments = numPoints; // Number of segments between points
    for (let i = 0; i < lengthSegments; i++) {
        const a = i * 2;       // Current inner vertex index
        const b = i * 2 + 1;   // Current outer vertex index
        const c = (i + 1) * 2; // Next inner vertex index
        const d = (i + 1) * 2 + 1; // Next outer vertex index

        // Create two triangles for the quad segment
        indices.push(a, b, d); // Triangle 1: InnerCurrent, OuterCurrent, OuterNext
        indices.push(a, d, c); // Triangle 2: InnerCurrent, OuterNext, InnerNext
    }
    trackGeometry.setIndex(indices);
    trackGeometry.computeVertexNormals(); // Important for lighting

    // 6. Create Track Surface Material and Mesh
    const trackMaterial = new THREE.MeshStandardMaterial({
        roughness: 0.8,
        metalness: 0.2,
        side: THREE.DoubleSide, // Use DoubleSide if the underside might be visible, otherwise FrontSide
        polygonOffset: true,       // Enable polygon offset
        polygonOffsetFactor: -1.0, // Push slightly away from camera
        polygonOffsetUnits: -1.0
    });
    const textureLoader = new THREE.TextureLoader(); // Reuse loader if possible
    textureLoader.load(
        "media/road_03.29415d96.webp",
        (texture) => {
            trackMaterial.map = texture;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            // UVs handle the length repeat, set repeat based on texture aspect if needed across width
            texture.repeat.set(1, 1);
            texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
            texture.needsUpdate = true;
            trackMaterial.needsUpdate = true;
            console.log("Road texture loaded successfully");
        },
        undefined,
        (error) => {
            console.error("Error loading road texture:", error);
        }
    );

    trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);
    trackMesh.position.y = 0.5; // Slight offset to prevent Z-fighting with ground
    trackMesh.receiveShadow = true; // The track surface should receive shadows
    scene.add(trackMesh);

    // Store useful track data for game logic (lap counting, boundary checks)
    const finishLineCenter = trackCurve.getPointAt(0);
    const finishLineTangent = trackCurve.getTangentAt(0).normalize();
    trackMesh.userData = {
        trackCurve,
        points: trackCurve.getPoints(numPoints), // Store centerline points if needed
        trackWidth,
        finishLineCenter,
        finishLineTangent,
    };

    // 7. Create Rail Geometry
    // --- Explicitly close the rail point loops to prevent seam issues ---
    if (innerRailPoints.length > 1 && !innerRailPoints[0].equals(innerRailPoints[innerRailPoints.length - 1])) {
        console.log("Manually closing innerRailPoints loop for rail extrusion.");
        innerRailPoints[innerRailPoints.length - 1].copy(innerRailPoints[0]);
    }
    if (outerRailPoints.length > 1 && !outerRailPoints[0].equals(outerRailPoints[outerRailPoints.length - 1])) {
        console.log("Manually closing outerRailPoints loop for rail extrusion.");
        outerRailPoints[outerRailPoints.length - 1].copy(outerRailPoints[0]);
    }

    // --- Create curves from the *manually closed* points ---
    // Set 'closed' to false as the point arrays are already closed loops.
    const innerWallCurve = new THREE.CatmullRomCurve3(innerRailPoints, false, 'catmullrom', 0.5);
    const outerWallCurve = new THREE.CatmullRomCurve3(outerRailPoints, false, 'catmullrom', 0.5);

    // --- Create Rail Material ---
    const railMaterial = new THREE.MeshStandardMaterial({
        map: textureLoader.load("media/wall_barrier_02.44c5c0ea.webp"), // Reuse loader
        normalMap: textureLoader.load("media/wall_barrier_02_n.0c79c69f.webp"),
        side: THREE.DoubleSide, // Rails likely visible from both sides
        polygonOffset: true,       // Enable polygon offset
        polygonOffsetFactor: -1.0, // Push slightly away from camera
        polygonOffsetUnits: -1.0
    });
    // Ensure textures repeat correctly on rails if needed
    railMaterial.map.wrapS = railMaterial.map.wrapT = THREE.RepeatWrapping;
    railMaterial.normalMap.wrapS = railMaterial.normalMap.wrapT = THREE.RepeatWrapping;
    // railMaterial.map.repeat.set(X, Y); // Adjust repeat as necessary

    // --- Extrude the Wall Shape along the Curves ---
    const extrudeSteps = numPoints * 2; // Use high steps for smooth curves
    const extrudeSettings = {
        steps: extrudeSteps,
        bevelEnabled: false,
        // The extrudePath will be set per rail below
    };

    // Inner Rail
    const innerRailGeometry = new THREE.ExtrudeGeometry(wallShape, { ...extrudeSettings, extrudePath: innerWallCurve });
    const innerRail = new THREE.Mesh(innerRailGeometry, railMaterial);
    innerRail.castShadow = true;
    innerRail.receiveShadow = true; // Rails can receive shadows from cars/other objects
    innerRail.position.y = 0.6; // Match track y offset
    scene.add(innerRail);

    // Outer Rail
    const outerRailGeometry = new THREE.ExtrudeGeometry(wallShape, { ...extrudeSettings, extrudePath: outerWallCurve });
    const outerRail = new THREE.Mesh(outerRailGeometry, railMaterial);
    outerRail.castShadow = true;
    outerRail.receiveShadow = true;
    outerRail.position.y = 0.6; // Match track y offset
    scene.add(outerRail);

    console.log("Track and rail creation complete.");
}

// --- Foliage Optimization ---
const foliageTextures = [
  "media/my_trees_1/1.png",
  "media/my_trees_1/2.png",
  "media/my_trees_1/3.png",
  "media/my_trees_1/4.png",
  "media/my_trees_1/5.png",
  "media/my_trees_1/6.png",
  "media/my_trees_1/7.png",
  "media/my_trees_1/8.png",
];
const foliageMaterials = [];
const loadedFoliageTextures = []; // Store loaded textures for shadow material

function preloadFoliageTextures() {
    return new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        const loadPromises = foliageTextures.map((path, index) => {
            return new Promise((innerResolve, innerReject) => {
                loader.load(
                    path,
                    (texture) => {
                        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
                        texture.premultiplyAlpha = true;
                        const hasAlpha = texture.format === THREE.RGBAFormat;
                        console.log(`Loaded foliage texture: ${path}, dimensions: ${texture.image.width}x${texture.image.height}, hasAlpha: ${hasAlpha}`);
                        loadedFoliageTextures[index] = texture; // Store the texture
                        const material = new THREE.MeshBasicMaterial({
                            map: texture,
                            transparent: true,
                            side: THREE.DoubleSide,
                            blending: THREE.NormalBlending,
                            depthWrite: true,
                            alphaTest: 0.1,
                        });
                        foliageMaterials[index] = material;
                        innerResolve();
                    },
                    undefined,
                    (error) => {
                        console.error(`Error loading foliage texture ${path}:`, error);
                        innerReject(error);
                    }
                );
            });
        });

        Promise.all(loadPromises)
            .then(() => resolve())
            .catch((error) => reject(error));
    });
}

// --- Grass Optimization ---

const grassTexturePath = 'media/grass/3.png';
let grassMaterial = null;
let loadedGrassTexture = null; // Store loaded grass texture

function preloadGrassTexture() {
    return new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.load(
            grassTexturePath,
            (texture) => {
                texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
                texture.premultiplyAlpha = true;
                const hasAlpha = texture.format === THREE.RGBAFormat;
                console.log(`Loaded grass texture: ${grassTexturePath}, dimensions: ${texture.image.width}x${texture.image.height}, hasAlpha: ${hasAlpha}`);
                loadedGrassTexture = texture; // Store the texture
                grassMaterial = new THREE.MeshBasicMaterial({
                    map: texture,
                    transparent: true,
                    side: THREE.DoubleSide,
                    blending: THREE.NormalBlending,
                    depthWrite: true,
                    alphaTest: 0.1,
                    // onBeforeCompile: (shader) => {
                    //     shader.fragmentShader = shader.fragmentShader.replace(
                    //         '#include <map_fragment>',
                    //         `
                    //         #include <map_fragment>
                    //         if (diffuseColor.r < 0 && diffuseColor.g < 0 && diffuseColor.b < 0) {
                    //             discard;
                    //         }
                    //         `
                    //     );
                    // }
                });
                resolve();
            },
            undefined,
            (error) => {
                console.error(`Error loading grass texture ${grassTexturePath}:`, error);
                reject(error);
            }
        );
    });
}

function addGrass() {
    const numGrass = 700000;
    const numMeshes = 10;
    const instancesPerMesh = Math.floor(numGrass / numMeshes);
    const trackData = trackMesh.userData;
    const gridSize = 400;
    const grid = {};

    const positions = [];
    const scales = [];
    const sides = []; // Store side value for each instance

    for (let i = 0; i < numGrass; i++) {
        const u = i / numGrass;
        const point = trackData.trackCurve.getPointAt(u);
        const tangent = trackData.trackCurve.getTangentAt(u);
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        const side = Math.random() < 0.5 ? -1 : 1;
        sides.push(side); // Track side for rotation
        const distance = 2.2 + Math.random() * 17;
        const position = point.clone().add(normal.multiplyScalar(side * (trackData.trackWidth / 2 + distance)));
        const scale = 0.5 + Math.random();
        position.y = scale / 2;

        positions.push(position);
        scales.push(scale);

        const gridX = Math.floor(position.x / gridSize);
        const gridZ = Math.floor(position.z / gridSize);
        const gridKey = `${gridX},${gridZ}`;
        if (!grid[gridKey]) {
            grid[gridKey] = { indices: [], meshIndex: Math.floor(i / instancesPerMesh) };
        }
        grid[gridKey].indices.push(i % instancesPerMesh);
    }

    const planeGeometry = new THREE.PlaneGeometry(1, 1);
    const instancedMeshes = [];
    for (let m = 0; m < numMeshes; m++) {
        const startIndex = m * instancesPerMesh;
        const count = m === numMeshes - 1 ? numGrass - startIndex : instancesPerMesh;
        const instancedMesh = new THREE.InstancedMesh(planeGeometry, grassMaterial, count);

        const dummy = new THREE.Object3D();
        for (let i = 0; i < count; i++) {
            const idx = startIndex + i;
            const pos = positions[idx];
            const scale = scales[idx];
            const side = sides[idx]; // Get side

            dummy.position.copy(pos);
            dummy.scale.set(scale, scale, 1);
            dummy.rotation.y = THREE.MathUtils.degToRad(side === 1 ? 45 : -45); // Conditional rotation
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
        }

        instancedMesh.castShadow = true;

        const shadowMaterial = new THREE.ShadowMaterial({
            transparent: true,
            side: THREE.DoubleSide
        });
        shadowMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.map = { value: loadedGrassTexture };
            shader.vertexShader = `
                varying vec2 vUvShadow;
                ${shader.vertexShader}
            `;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <uv_vertex>',
                `
                #include <uv_vertex>
                vUvShadow = uv;
                `
            );
            shader.fragmentShader = `
                uniform sampler2D map;
                varying vec2 vUvShadow;
                ${shader.fragmentShader}
            `;
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <map_fragment>',
                `
                vec4 texelColor = texture2D(map, vUvShadow);
                if (texelColor.a < 0.1) discard;
                `
            );
        };
        instancedMesh.customDepthMaterial = shadowMaterial;

        instancedMesh.onBeforeCompile = (shader) => {
            shader.vertexShader = `
                attribute vec3 instancePosition;
                varying vec3 vInstancePosition;
                ${shader.vertexShader}
            `;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                vInstancePosition = instancePosition;

                vec3 camPos = vec3(cameraPosition.x, 0.0, cameraPosition.z);
                vec3 instancePosXZ = vec3(instancePosition.x, 0.0, instancePosition.z);
                vec3 direction = normalize(camPos - instancePosXZ);

                float angle = atan(direction.z, direction.x) - 1.5708;
                mat3 rotation = mat3(
                    cos(angle), 0.0, sin(angle),
                    0.0,        1.0, 0.0,
                    -sin(angle), 0.0, cos(angle)
                );
                transformed = rotation * transformed;
                `
            );

            shader.fragmentShader = `
                varying vec3 vInstancePosition;
                ${shader.fragmentShader}
            `;
        };

        const instancePositions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const idx = startIndex + i;
            instancePositions[i * 3] = positions[idx].x;
            instancePositions[i * 3 + 1] = positions[idx].y;
            instancePositions[i * 3 + 2] = positions[idx].z;
        }
        instancedMesh.geometry.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(instancePositions, 3));

        instancedMesh.userData = { positions: positions.slice(startIndex, startIndex + count), gridCells: [] };
        instancedMeshes.push(instancedMesh);
        scene.add(instancedMesh);
    }

    for (const gridKey in grid) {
        const meshIndex = grid[gridKey].meshIndex;
        instancedMeshes[meshIndex].userData.gridCells.push(gridKey);
    }

    console.log(`Added ${numGrass} grass instances with ${numMeshes} draw calls along the track.`);
    return { instancedMeshes, grid };
}


function addFoliage() {
    const numFoliage = 10000;
    const trackData = trackMesh.userData;
    const positions = [];
    const scales = [];
    const materialIndices = [];

    for (let i = 0; i < numFoliage; i++) {
        const u = i / numFoliage;
        const point = trackData.trackCurve.getPointAt(u);
        const tangent = trackData.trackCurve.getTangentAt(u);
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        const side = Math.random() < 0.5 ? -1 : 1;
        const distance = 5 + Math.random() * 40;
        const position = point.clone().add(normal.multiplyScalar(side * (trackData.trackWidth / 2 + distance)));
        const scale = 15 + Math.random() * 2;
        position.y = scale / 2;

        positions.push(position);
        scales.push(scale);
        materialIndices.push(Math.floor(Math.random() * foliageTextures.length));
    }

    const foliageGroups = {};
    for (let i = 0; i < numFoliage; i++) {
        const matIndex = materialIndices[i];
        if (!foliageGroups[matIndex]) {
            foliageGroups[matIndex] = { positions: [], scales: [], indices: [] };
        }
        foliageGroups[matIndex].positions.push(positions[i]);
        foliageGroups[matIndex].scales.push(scales[i]);
        foliageGroups[matIndex].indices.push(i);
    }

    const planeGeometry = new THREE.PlaneGeometry(1, 1);
    for (const matIndex in foliageGroups) {
        const group = foliageGroups[matIndex];
        if (!foliageMaterials[matIndex]) continue;

        const count = group.positions.length;
        const instancedMesh = new THREE.InstancedMesh(planeGeometry, foliageMaterials[matIndex], count);

        const dummy = new THREE.Object3D();
        for (let i = 0; i < count; i++) {
            const pos = group.positions[i];
            const scale = scales[i];
            dummy.position.copy(pos);
            dummy.scale.set(scale, scale, 1);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
        }

        instancedMesh.castShadow = true;

        // Custom shadow material to respect alpha channel
        const shadowMaterial = new THREE.ShadowMaterial({
            transparent: true,
            side: THREE.DoubleSide
        });
        shadowMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.map = { value: loadedFoliageTextures[matIndex] };
            shader.vertexShader = `
                varying vec2 vUvShadow;
                ${shader.vertexShader}
            `;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <uv_vertex>',
                `
                #include <uv_vertex>
                vUvShadow = uv;
                `
            );
            shader.fragmentShader = `
                uniform sampler2D map;
                varying vec2 vUvShadow;
                ${shader.fragmentShader}
            `;
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <map_fragment>',
                `
                vec4 texelColor = texture2D(map, vUvShadow);
                if (texelColor.a < 0.1) discard; // Match alphaTest value
                `
            );
        };
        instancedMesh.customDepthMaterial = shadowMaterial;

        instancedMesh.onBeforeRender = function (renderer, scene, camera) {
            for (let i = 0; i < this.count; i++) {
                const matrix = new THREE.Matrix4();
                this.getMatrixAt(i, matrix);
                const position = new THREE.Vector3();
                position.setFromMatrixPosition(matrix);

                const direction = new THREE.Vector3().subVectors(camera.position, position);
                direction.y = 0;
                direction.normalize();

                if (direction.lengthSq() === 0) continue;

                const quaternion = new THREE.Quaternion();
                quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);

                dummy.position.copy(position);
                const scale = new THREE.Vector3();
                matrix.decompose(dummy.position, dummy.quaternion, scale);
                dummy.quaternion.copy(quaternion);
                dummy.scale.copy(scale);
                dummy.updateMatrix();
                this.setMatrixAt(i, dummy.matrix);
            }
            this.instanceMatrix.needsUpdate = true;
        };

        instancedMesh.userData = { positions: group.positions };
        scene.add(instancedMesh);
    }

    console.log(`Added ${numFoliage} foliage instances with ${Object.keys(foliageGroups).length} draw calls.`);
}

// Cache for loaded models and textures
// Cache for loaded model
let carModelMe = null;
let carModelOpp = null;
let carTexture = null; // Keep for fallback

function loadCarAssets() {
    return new Promise((resolve, reject) => {
        const fbxLoader = new THREE.FBXLoader();
        const textureLoader = new THREE.TextureLoader();

        const loadMyCarModel = new Promise((res, rej) => {
            fbxLoader.load(
                carModelPath,
                (object) => {
                    carModelMe = object;
                    console.log('Loaded car model:', carModelPath);
                    const carBox = new THREE.Box3().setFromObject(carModelMe);
                    const carSize = new THREE.Vector3();
                    carBox.getSize(carSize);
                    console.log('Car model bounding box size (before scaling):', carSize);

                    // Check if the FBX file loaded a texture
                    let textureFound = false;
                    carModelMe.traverse((child) => {
                        if (child.isMesh && child.material && child.material.map) {
                            textureFound = true;
                            carTexture = child.material.map;
                            console.log('Car texture loaded from FBX:', carTexture);
                        }
                    });
                    if (!textureFound) {
                        console.warn('No texture found in car.fbx. Loading manually.');
                        textureLoader.load(
                            'media/car_texture.jpg', // Fallback texture path
                            (texture) => {
                                texture.flipY = false; // FBX typically uses flipY = false
                                carTexture = texture;
                                console.log('Loaded car texture manually:', 'media/car_texture.jpg');
                                res();
                            },
                            undefined,
                            (error) => {
                                console.error('Error loading car texture:', error);
                                rej(error);
                            }
                        );
                    } else {
                        res();
                    }
                },
                undefined,
                (error) => {
                    console.error('Error loading car model:', error);
                    rej(error);
                }
            );
        });

        const loadOppCarModel = new Promise((res, rej) => {
            fbxLoader.load(
                oppCarModelPath,
                (object) => {
                    carModelOpp = object;
                    console.log('Loaded car model:', oppCarModelPath);
                    const carBox = new THREE.Box3().setFromObject(carModelOpp);
                    const carSize = new THREE.Vector3();
                    carBox.getSize(carSize);
                    console.log('Car model bounding box size (before scaling):', carSize);

                    // Check if the FBX file loaded a texture
                    let textureFound = false;
                    carModelOpp.traverse((child) => {
                        if (child.isMesh && child.material && child.material.map) {
                            textureFound = true;
                            carTexture = child.material.map;
                            console.log('Car texture loaded from FBX:', carTexture);
                        }
                    });
                    if (!textureFound) {
                        console.warn('No texture found in car.fbx. Loading manually.');
                        textureLoader.load(
                            'media/car_texture.jpg', // Fallback texture path
                            (texture) => {
                                texture.flipY = false; // FBX typically uses flipY = false
                                carTexture = texture;
                                console.log('Loaded car texture manually:', 'media/car_texture.jpg');
                                res();
                            },
                            undefined,
                            (error) => {
                                console.error('Error loading car texture:', error);
                                rej(error);
                            }
                        );
                    } else {
                        res();
                    }
                },
                undefined,
                (error) => {
                    console.error('Error loading car model:', error);
                    rej(error);
                }
            );
        });

        Promise.all([loadMyCarModel, loadOppCarModel])
            .then(() => resolve())
            .catch((error) => reject(error));
    });
}


// --- Car Creation & Management ---
function createCar(color, id) {
    const car = new THREE.Group();
    // Handle both string and THREE.Color inputs
    const isBlue = typeof color === 'string' && color === 'blue';
    const carBody = isBlue ? carModelMe.clone() : carModelOpp.clone();

    let hasFBXMaterial = false;
    carBody.traverse((child) => {
        if (child.isMesh) {
            if (child.material && child.material.map) {
                hasFBXMaterial = true;
                child.material.side = THREE.DoubleSide;
                child.material.castShadow = true;
                child.material.receiveShadow = true;
                console.log('Using FBX material for car:', child.material);
            }
            if (!child.geometry.attributes.uv) {
                console.error('Car model is missing UV coordinates. Please fix the .fbx file in a 3D modeling tool (e.g., Blender) by unwrapping the model.');
            } else {
                console.log('Car model UVs found. Sample UV coordinates:', child.geometry.attributes.uv.array.slice(0, 8));
            }
        }
    });

    if (!hasFBXMaterial) {
        const carMaterial = new THREE.MeshStandardMaterial({
            map: carTexture || null,
            color: carTexture ? (isBlue ? 0x0000ff : 0xff0000) : (isBlue ? 0x0000ff : 0xff0000),
            side: THREE.DoubleSide
        });
        carBody.traverse((child) => {
            if (child.isMesh) {
                child.material = carMaterial;
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
    }

    const scaleFactor = 0.012;
    carBody.scale.set(scaleFactor, scaleFactor, scaleFactor);
    car.add(carBody);

    const carBox = new THREE.Box3().setFromObject(carBody);
    const carSize = new THREE.Vector3();
    carBox.getSize(carSize);
    const carCenter = new THREE.Vector3();
    carBox.getCenter(carCenter);
    car.castShadow = true; // Fixed: Set castShadow on the car group
    console.log('Car bounding box size:', carSize);
    console.log('Car bounding box center:', carCenter);

    car.position.y = -carBox.min.y * scaleFactor + 0.5;
    car.position.x = 1800; // This will be overridden by socket.on("connect")
    console.log('Final car position:', car.position);

    const forwardDirection = new THREE.Vector3(0, 0, 1).applyQuaternion(carBody.quaternion);
    console.log('Car forward direction (local, after carBody rotation):', forwardDirection);

    return car;
}
// --- Camera Setup and Control ---
function setupCamera() {
  camera.position.set(0, 50, 80);
  camera.lookAt(scene.position);
}

function updateCamera() {
    if (!playerCar) return;

    // Determine if the car is moving in reverse
    const playerSpeed = playerCar.userData.speed || 0;
    const isReversing = playerSpeed < 0;

    // Use different camera offsets based on direction
    const cameraOffset = isReversing
        ? new THREE.Vector3(0, 5, 10)  // Camera in front when reversing (positive z)
        : new THREE.Vector3(0, 5, -10); // Camera behind when moving forward (negative z)

    const relativeCameraOffset = cameraOffset.clone();
    relativeCameraOffset.applyQuaternion(playerCar.quaternion);
    const desiredCameraPosition = playerCar.position
        .clone()
        .add(relativeCameraOffset);
    camera.position.lerp(desiredCameraPosition, 0.1);
    camera.lookAt(playerCar.position);
}

// --- Input Handling ---
function setupControls() {
    // Remove car creation from here; it will be handled in socket.on("connect")
    window.addEventListener("keydown", (event) => {
        keyboard[event.code] = true;
    });
    window.addEventListener("keyup", (event) => {
        keyboard[event.code] = false;
    });
}

function handleControls(deltaTime) {
  if (!playerCar || !socket || !myId || !socket.connected) return;

  let speedChanged = false;
  let rotationChanged = false;
  const oldSpeed = playerSpeed;

  if (keyboard["ArrowUp"] || keyboard["KeyW"]) {
    playerSpeed += acceleration;
    speedChanged = true;
  } else if (keyboard["ArrowDown"] || keyboard["KeyS"]) {
    playerSpeed -= brakePower;
    speedChanged = true;
  } else {
    if (playerSpeed > 0) {
      playerSpeed = Math.max(0, playerSpeed - deceleration);
      speedChanged = true;
    } else if (playerSpeed < 0) {
      playerSpeed = Math.min(0, playerSpeed + deceleration);
      speedChanged = true;
    }
  }
  playerSpeed = Math.max(-maxSpeed / 2, Math.min(maxSpeed, playerSpeed));
  if (Math.abs(playerSpeed - oldSpeed) < 0.001) speedChanged = false;

  let turnFactor = 0;
  if (Math.abs(playerSpeed) > 0.05) {
    if (keyboard["ArrowLeft"] || keyboard["KeyA"]) turnFactor = 1;
    if (keyboard["ArrowRight"] || keyboard["KeyD"]) turnFactor = -1;
  }
  if (turnFactor !== 0) {
    const deltaRotation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      turnFactor * turnSpeed * (playerSpeed / maxSpeed)
    );
    playerCar.quaternion.multiplyQuaternions(
      deltaRotation,
      playerCar.quaternion
    );
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
    const perpendicularVector = toCar
      .clone()
      .sub(tangent.clone().multiplyScalar(alongTangent));
    const distanceFromCenter = perpendicularVector.length();

    // --- Boundary Check and Correction ---
    if (distanceFromCenter > trackData.trackWidth / 2) {
        const snapDirection = perpendicularVector.normalize();
        const boundaryPos = closestPoint
            .clone()
            .add(snapDirection.multiplyScalar(trackData.trackWidth / 2));
        const penetrationDepth = distanceFromCenter - trackData.trackWidth / 2;
        const correctionMagnitude = penetrationDepth * 1.1; // Push back slightly more than needed
        const correctionVector = snapDirection.multiplyScalar(-correctionMagnitude);

        // Apply the correction to the car's position
        playerCar.position.add(correctionVector);
        const velocity = moveDistance.clone(); // Assuming moveDistance holds this frame's velocity vector
        const velocityPerpendicular = snapDirection.clone().multiplyScalar(velocity.dot(snapDirection));
        playerCar.position.sub(velocityPerpendicular.multiplyScalar(0.5)); // Reduce perpendicular bounce slightly

        positionChanged = true; // Ensure update is sent if position was corrected
    }
    // --- End Boundary Check ---

    const vectorToCenter = carPos.clone().sub(trackData.finishLineCenter);
    const side = vectorToCenter.dot(trackData.finishLineTangent);
    if (playerCar.userData.prevSide !== null) {
      if (playerCar.userData.prevSide < 0 && side > 0) {
        playerCar.userData.lapCount++;
        console.log(
          `Lap completed! Total laps: ${playerCar.userData.lapCount}`
        );
        socket.emit("lapCompleted", {
          id: myId,
          lapCount: playerCar.userData.lapCount,
        });
        if (playerCar.userData.lapCount >= 3) {
          console.log("You win!");
          showMessage("You win!", 5000);
          socket.emit("playerWon", { id: myId });
        }
      }
    }
    playerCar.userData.prevSide = side;
  }

  const wheelRotationSpeed = playerSpeed * -2.0;
  playerCar.children.forEach((child) => {
    if (child.geometry && child.geometry.type === "CylinderGeometry") {
      child.rotation.x += wheelRotationSpeed;
    }
  });
  playerCar.userData.speed = playerSpeed;

  if (positionChanged || rotationChanged) {
    const pos = playerCar.position;
    const quat = playerCar.quaternion;
    const updateData = {
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotation: { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
    };
    socket.emit("playerUpdate", updateData);
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
  messageElement.style.backgroundColor = isError
    ? "rgba(255, 0, 0, 0.7)"
    : "rgba(0, 150, 50, 0.7)";
  messageElement.classList.remove("hidden");
  clearTimeout(messageTimeout);
  if (duration > 0) {
    messageTimeout = setTimeout(() => {
      messageElement.classList.add("hidden");
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

    const directionalLight = scene.children.find(child => child instanceof THREE.DirectionalLight);
    if (directionalLight && playerCar) {
        const targetPos = playerCar.position.clone();
        const trackCenter = directionalLight.userData.trackCenter;
        const trackBox = new THREE.Box3().setFromCenterAndSize(
            trackCenter,
            new THREE.Vector3(4000, 0, 3000)
        );
        targetPos.clamp(trackBox.min, trackBox.max);
        directionalLight.target.position.copy(targetPos);
        directionalLight.target.updateMatrixWorld();
    }

    const cullingDistance = 1000;
    const cullingDistanceSq = cullingDistance * cullingDistance;

    scene.children.forEach(child => {
        if (child instanceof THREE.InstancedMesh && child.userData.positions && !child.userData.gridCells) {
            const positions = child.userData.positions;
            for (let i = 0; i < child.count; i++) {
                const pos = positions[i];
                const distance = camera.position.distanceTo(pos);
                const visible = distance < cullingDistance;
                child.setColorAt(i, new THREE.Color(visible ? 1 : 0, visible ? 1 : 0, visible ? 1 : 0));
            }
            child.instanceColor.needsUpdate = true;
        }
    });
    renderer.render(scene, camera);
}

// --- Handle Browser Window Resizing ---
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onWindowResize);

// --- Start the Initialization Process ---
if (typeof THREE !== "undefined" && typeof io !== "undefined") {
  init();
} else {
  console.error("Initialization aborted due to missing libraries.");
  const loadingElem = document.getElementById("loadingScreen");
  if (loadingElem) {
    loadingElem.style.display = "flex";
    loadingElem.innerHTML =
      "<h1>Error: Failed to load required libraries! Refresh or check console.</h1>";
  }
}
