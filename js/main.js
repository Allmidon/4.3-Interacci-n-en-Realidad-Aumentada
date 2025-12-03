import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let camera, scene, renderer, clock, mixer, controls;

// --- NOMBRES ---
const modelName = 'Paladin J Nordstrom';
const animationAssets = [
    'Texting While Standing',
    'Swimming',
    'Chapa-Giratoria',
    'Kneeling Pointing',
    'Taunt',
    'Silly Dancing',
];

let actions = {};
let activeAction;
let reticle, raycaster, interactableGroup;
let currentGazeTarget = null;
let gazeDwellTime = 0;
const DWELL_TIME_THRESHOLD = 1.5;

const container = document.getElementById('app-container');
const uiOverlay = document.getElementById('ui-overlay');
const buttonsContainer = document.getElementById('buttons-container');

window.triggerAnimation = function (name) { fadeToAction(name, 0.5); };

init();

function init() {
    clock = new THREE.Clock();
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa0e9ff);
    scene.fog = new THREE.Fog(0xa0e9ff, 200, 1000); // Aumenté la niebla por si el modelo está lejos

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 2);
    hemiLight.position.set(0, 200, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(0, 200, 100);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(2000, 2000),
        new THREE.MeshStandardMaterial({ color: 0x99ff99, side: THREE.DoubleSide })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // CÁMARA LEJOS POR SI EL MODELO ES GRANDE
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.set(0, 150, 350);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.xr.enabled = true;
    renderer.setAnimationLoop(animate);
    document.body.appendChild(VRButton.createButton(renderer));
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 100, 0);
    controls.enableDamping = true;

    // --- CARGA DEL MODELO ---
    const loader = new FBXLoader();

    loader.load(`models/fbx/${modelName}.fbx`, function (object) {
        const model = object;

        // *** AJUSTE DE ESCALA ***
        // Prueba cambiando esto si el modelo se ve muy chico o muy grande.
        // Si viene de Mixamo directo, a veces es 0.01, a veces 1.0.
        model.scale.setScalar(1.0);

        model.traverse(function (child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        scene.add(model);
        mixer = new THREE.AnimationMixer(model);

        loadAnimations(loader);
        createHTMLButtons();
        createVRInterface();
    }, undefined, function (e) {
        console.error("Error cargando el modelo:", e);
    });

    setupVRInteractions();

    renderer.xr.addEventListener('sessionstart', () => uiOverlay.style.display = 'none');
    renderer.xr.addEventListener('sessionend', () => uiOverlay.style.display = 'flex');
    window.addEventListener('resize', onWindowResize);
}

function loadAnimations(loader) {
    animationAssets.forEach((assetName, index) => {
        loader.load(`models/fbx/${assetName}.fbx`, (fbx) => {
            if (fbx.animations.length > 0) {
                const clip = fbx.animations[0];
                clip.name = assetName;
                const action = mixer.clipAction(clip);
                actions[assetName] = action;

                if (index === 0) {
                    activeAction = actions[assetName];
                    activeAction.play();
                    updateButtonsVisuals(assetName);
                }
            }
        });
    });
}

function fadeToAction(name, duration) {
    if (!actions[name]) return;
    const previousAction = activeAction;
    activeAction = actions[name];

    if (previousAction !== activeAction) {
        if (previousAction) previousAction.fadeOut(duration);
        activeAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(duration).play();
        updateButtonsVisuals(name);
    }
}

function updateButtonsVisuals(activeName) {
    document.querySelectorAll('.anim-btn').forEach(btn => {
        if (btn.dataset.anim === activeName) btn.classList.add('active');
        else btn.classList.remove('active');
    });
}

function createHTMLButtons() {
    buttonsContainer.innerHTML = '';
    animationAssets.forEach(name => {
        const btn = document.createElement('button');
        btn.innerText = name;
        btn.className = 'anim-btn';
        btn.dataset.anim = name;
        btn.onclick = () => triggerAnimation(name);
        buttonsContainer.appendChild(btn);
    });
}

function setupVRInteractions() {
    raycaster = new THREE.Raycaster();
    interactableGroup = new THREE.Group();
    scene.add(interactableGroup);

    const reticleGeo = new THREE.CircleGeometry(0.002, 16);
    const reticleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, opacity: 0.75, transparent: true });
    reticle = new THREE.Mesh(reticleGeo, reticleMat);
    reticle.position.z = -0.5;
    reticle.renderOrder = 999;
    camera.add(reticle);
    scene.add(camera);
}

// --- FUNCIÓN CORREGIDA ---
function createButtonMesh(text, animationName, yPos) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;

    ctx.fillStyle = '#007bff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'white';
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'white';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const geometry = new THREE.PlaneGeometry(60, 15);

    // CORREGIDO: renderOrder eliminado de aquí
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = animationName;

    // CORREGIDO: renderOrder asignado al mesh
    mesh.renderOrder = 998;

    mesh.position.set(-100, yPos, -50);
    mesh.rotation.y = Math.PI / 6;

    return mesh;
}

function createVRInterface() {
    let startY = 150;
    const gap = 20;
    animationAssets.forEach((animName, index) => {
        const btn = createButtonMesh(animName, animName, startY - (index * gap));
        interactableGroup.add(btn);
    });
}

function animate() {
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);
    if (controls) controls.update();
    handleGazeInteraction(delta);
    renderer.render(scene, camera);
}

function handleGazeInteraction(delta) {
    if (!renderer.xr.isPresenting) return;
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersects = raycaster.intersectObjects(interactableGroup.children);
    let target = null;
    if (intersects.length > 0) target = intersects[0].object;

    if (target !== currentGazeTarget) {
        currentGazeTarget = target;
        gazeDwellTime = 0;
        interactableGroup.children.forEach(c => c.scale.set(1, 1, 1));
    }

    if (currentGazeTarget) {
        currentGazeTarget.scale.set(1.1, 1.1, 1.1);
        gazeDwellTime += delta;
        if (gazeDwellTime >= DWELL_TIME_THRESHOLD) {
            triggerAnimation(currentGazeTarget.name);
            gazeDwellTime = 0;
            currentGazeTarget.scale.set(0.9, 0.9, 0.9);
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
