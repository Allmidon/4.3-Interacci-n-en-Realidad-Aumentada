import * as THREE from 'three';
// CAMBIO: Importamos ARButton
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let camera, scene, renderer, clock, mixer, controls;
let controller; // Controlador para detectar toques en pantalla

// --- AR Variables ---
let hitTestSource = null;
let hitTestSourceRequested = false;
let arReticle; // El círculo guía en el suelo
let modelPlaced = false; // Bandera para saber si ya pusimos el modelo
let modelGroup; // Grupo contenedor del personaje

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

const container = document.getElementById('app-container');
const uiOverlay = document.getElementById('ui-overlay');
const buttonsContainer = document.getElementById('buttons-container');
const arInstructions = document.getElementById('ar-instructions');

window.triggerAnimation = function (name) { fadeToAction(name, 0.5); };

init();

function init() {
    clock = new THREE.Clock();
    scene = new THREE.Scene();

    // --- ILUMINACIÓN ---
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 2);
    hemiLight.position.set(0, 200, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(0, 200, 100);
    dirLight.castShadow = true;
    // Importante: En AR las sombras a veces requieren bias adjustment
    dirLight.shadow.bias = -0.0001;
    scene.add(dirLight);

    // --- CÁMARA ---
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 150, 350);

    // --- RENDERER CON ALPHA (TRANSPARENCIA) ---
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    // --- CONFIGURACIÓN AR ---
    // Usamos ARButton con 'dom-overlay' para que los botones HTML funcionen sobre la cámara
    document.body.appendChild(ARButton.createButton(renderer, {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.body }
    }));

    // --- RETÍCULA AR (El círculo guía) ---
    arReticle = new THREE.Mesh(
        new THREE.RingGeometry(15, 20, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial()
    );
    arReticle.matrixAutoUpdate = false;
    arReticle.visible = false;
    scene.add(arReticle);

    // --- CONTROLLER (Para detectar el toque) ---
    controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    // Controles Orbit (para cuando NO estamos en AR)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 100, 0);
    controls.enableDamping = true;

    // --- CARGA DEL MODELO ---
    modelGroup = new THREE.Group();
    scene.add(modelGroup);
    // Ocultamos el modelo al inicio hasta que se coloque en AR
    // (En modo escritorio lo haremos visible manualmente abajo)
    modelGroup.visible = false;

    const loader = new FBXLoader();
    loader.load(`models/fbx/${modelName}.fbx`, function (object) {
        const model = object;
        model.scale.setScalar(1.0);

        model.traverse(function (child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        modelGroup.add(model);
        mixer = new THREE.AnimationMixer(model);

        loadAnimations(loader);
        createHTMLButtons();

        // Si NO estamos en AR (escritorio), mostramos el modelo y añadimos suelo
        if (!renderer.xr.isPresenting) {
            modelGroup.visible = true;
            addFloorForDesktop();
        }

    }, undefined, function (e) { console.error(e); });

    window.addEventListener('resize', onWindowResize);

    // Render Loop
    renderer.setAnimationLoop(animate);
}

// Función auxiliar para añadir suelo solo en PC
function addFloorForDesktop() {
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(2000, 2000),
        new THREE.MeshStandardMaterial({ color: 0x99ff99, side: THREE.DoubleSide })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = "desktop_floor";
    scene.add(floor);
    scene.background = new THREE.Color(0xa0e9ff); // Cielo azul en PC
    scene.fog = new THREE.Fog(0xa0e9ff, 200, 1000);
}

function onSelect() {
    // Esta función se ejecuta cuando tocas la pantalla en modo AR
    if (arReticle.visible) {
        // Mover el modelo a donde está la retícula
        modelGroup.position.setFromMatrixPosition(arReticle.matrix);

        // Hacer que el modelo mire hacia la cámara (opcional, pero útil)
        // modelGroup.lookAt(camera.position.x, modelGroup.position.y, camera.position.z);

        modelGroup.visible = true;
        modelPlaced = true;
        arInstructions.style.display = 'none';
    }
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

        // IMPORTANTE: preventDefault en touchstart para evitar conflictos en AR
        btn.addEventListener('touchstart', (e) => {
            e.stopPropagation(); // Evitar que el toque atraviese al canvas y mueva la retícula
            triggerAnimation(name);
        }, { passive: false });

        btn.onclick = () => triggerAnimation(name);
        buttonsContainer.appendChild(btn);
    });
}

function animate(timestamp, frame) {
    const delta = clock.getDelta();

    // Actualizar animaciones
    if (mixer) mixer.update(delta);

    if (renderer.xr.isPresenting) {
        // --- LÓGICA AR ---

        // 1. Ocultar fondo (cielo) para ver la cámara
        scene.background = null;
        scene.fog = null;
        // Ocultar suelo de escritorio si existe
        const desktopFloor = scene.getObjectByName("desktop_floor");
        if (desktopFloor) desktopFloor.visible = false;

        // 2. Manejo de Hit-Test
        if (frame) {
            const referenceSpace = renderer.xr.getReferenceSpace();
            const session = renderer.xr.getSession();

            if (hitTestSourceRequested === false) {
                session.requestReferenceSpace('viewer').then(function (referenceSpace) {
                    session.requestHitTestSource({ space: referenceSpace }).then(function (source) {
                        hitTestSource = source;
                    });
                });
                session.addEventListener('end', function () {
                    hitTestSourceRequested = false;
                    hitTestSource = null;
                    // Restaurar vista escritorio al salir
                    scene.background = new THREE.Color(0xa0e9ff);
                    if (desktopFloor) desktopFloor.visible = true;
                    modelGroup.position.set(0, 0, 0);
                    modelGroup.visible = true;
                    arInstructions.style.display = 'none';
                });
                hitTestSourceRequested = true;
            }

            if (hitTestSource) {
                const hitTestResults = frame.getHitTestResults(hitTestSource);

                if (hitTestResults.length > 0) {
                    const hit = hitTestResults[0];
                    arReticle.visible = true;
                    arReticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);

                    if (!modelPlaced) arInstructions.style.display = 'block';
                } else {
                    arReticle.visible = false;
                    arInstructions.style.display = 'none';
                }
            }
        }
    } else {
        // Modo escritorio
        if (controls) controls.update();
    }

    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}