let scene, camera, renderer, clock, mixer;
let arToolkitSource, arToolkitContext;
let markerRoot;

// --- Configuración ---
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
const buttonsContainer = document.getElementById('buttons-container');
const loadingDiv = document.getElementById('loading');

init();
animate();

function init() {
    clock = new THREE.Clock();
    scene = new THREE.Scene();

    camera = new THREE.Camera();
    scene.add(camera);

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0px';
    renderer.domElement.style.left = '0px';
    document.body.appendChild(renderer.domElement);

    // --- AR Toolkit Source (Webcam) ---
    arToolkitSource = new THREEx.ArToolkitSource({
        sourceType: 'webcam',
    });

    arToolkitSource.init(function onReady() {
        onResize();
    });

    window.addEventListener('resize', function () {
        onResize();
    });

    // --- AR Toolkit Context (Detección) ---
    arToolkitContext = new THREEx.ArToolkitContext({
        cameraParametersUrl: 'https://raw.githack.com/AR-js-org/AR.js/master/data/data/camera_para.dat',
        detectionMode: 'mono',
    });

    arToolkitContext.init(function onCompleted() {
        camera.projectionMatrix.copy(arToolkitContext.getProjectionMatrix());
    });

    // --- Marker Root (Grupo que sigue al Hiro) ---
    markerRoot = new THREE.Group();
    scene.add(markerRoot);

    new THREEx.ArMarkerControls(arToolkitContext, markerRoot, {
        type: 'pattern',
        patternUrl: 'https://raw.githack.com/AR-js-org/AR.js/master/data/data/patt.hiro',
    });

    // --- Luces ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(0, 5, 5);
    markerRoot.add(dirLight);

    // --- Carga del Modelo con AUTO-ESCALA ---
    const loader = new THREE.FBXLoader();

    loadingDiv.innerHTML = "Descargando modelo...";

    loader.load(`models/fbx/${modelName}.fbx`, function (object) {
        const model = object;

        // --- LÓGICA DE AUTO-AJUSTE ---
        // Calculamos el tamaño y centramos el modelo automáticamente
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        // Forzamos que mida 1.5 unidades (tamaño ideal para AR de mesa)
        const maxAxis = Math.max(size.x, size.y, size.z);
        const targetSize = 1.5;
        const scale = targetSize / maxAxis;

        model.scale.setScalar(scale);

        // Centramos en el origen (0,0,0)
        model.position.x = -center.x * scale;
        model.position.z = -center.z * scale;
        model.position.y = (-center.y * scale) + (size.y * scale / 2); // Pies en el suelo

        // -----------------------------

        model.traverse(function (child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) child.material.side = THREE.DoubleSide;
            }
        });

        markerRoot.add(model);
        mixer = new THREE.AnimationMixer(model);

        loadingDiv.innerHTML = "Cargando animaciones...";
        loadAnimations(loader);
        createHTMLButtons();

    }, undefined, function (e) {
        console.error(e);
        loadingDiv.innerText = "Error cargando modelo (Revisa consola)";
        loadingDiv.style.backgroundColor = "rgba(255,0,0,0.7)";
    });
}

function onResize() {
    arToolkitSource.onResizeElement();
    arToolkitSource.copyElementSizeTo(renderer.domElement);
    if (arToolkitContext.arController !== null) {
        arToolkitSource.copyElementSizeTo(arToolkitContext.arController.canvas);
    }
}

function loadAnimations(loader) {
    let loadedCount = 0;
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
            loadedCount++;
            if (loadedCount === animationAssets.length) {
                loadingDiv.style.display = 'none'; // Ocultar mensaje de carga
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

        // Soporte Touch
        btn.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            fadeToAction(name, 0.5);
        }, { passive: false });

        btn.onclick = () => fadeToAction(name, 0.5);
        buttonsContainer.appendChild(btn);
    });
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (mixer) mixer.update(delta);

    if (arToolkitSource.ready !== false) {
        arToolkitContext.update(arToolkitSource.domElement);
    }

    renderer.render(scene, camera);
}