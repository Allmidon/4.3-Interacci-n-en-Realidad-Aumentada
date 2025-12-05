// --- Variables Globales ---
let scene, camera, renderer, clock, mixer;
let arToolkitSource, arToolkitContext;
let markerRoot; // El grupo que sigue al marcador Hiro

// --- Configuración del Modelo ---
const modelName = 'Paladin J Nordstrom';
// Ajusta esto si el modelo se ve muy grande o muy chico sobre el marcador
const scaleFactor = 0.005;

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

    // 1. Escena
    scene = new THREE.Scene();

    // 2. Cámara (AR.js controla la proyección, así que instanciamos una básica)
    camera = new THREE.Camera();
    scene.add(camera);

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true // Importante para que se vea el video de fondo
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0px';
    renderer.domElement.style.left = '0px';
    document.body.appendChild(renderer.domElement);

    // 4. Configuración ARToolKit (Fuente de video)
    arToolkitSource = new THREEx.ArToolkitSource({
        sourceType: 'webcam',
    });

    arToolkitSource.init(function onReady() {
        onResize();
    });

    // Manejar redimensionamiento de ventana
    window.addEventListener('resize', function () {
        onResize();
    });

    // 5. Contexto AR (Reconocimiento)
    arToolkitContext = new THREEx.ArToolkitContext({
        cameraParametersUrl: 'https://raw.githack.com/AR-js-org/AR.js/master/data/data/camera_para.dat',
        detectionMode: 'mono',
    });

    arToolkitContext.init(function onCompleted() {
        camera.projectionMatrix.copy(arToolkitContext.getProjectionMatrix());
    });

    // 6. Controles del Marcador (HIRO)
    markerRoot = new THREE.Group();
    scene.add(markerRoot);

    let markerControls = new THREEx.ArMarkerControls(arToolkitContext, camera, {
        type: 'pattern',
        patternUrl: 'https://raw.githack.com/AR-js-org/AR.js/master/data/data/patt.hiro',
        changeMatrixMode: 'modelViewMatrix',
        smooth: true // Suaviza el movimiento
    });

    // Hack para vincular el markerRoot con los controles
    // ArMarkerControls modifica la posición del objeto que le pasas, en este caso 'markerRoot' no se pasa directo,
    // sino que la librería usa la cámara. 
    // La forma estándar en Three puro con AR.js es añadir el markerRoot a la escena y actualizarlo manualmente, 
    // PERO la versión 'ar-threex' hace un truco: la cámara se mueve, el objeto se queda en 0,0,0 relativo a la matriz.
    // Para simplificar: En este modo, el 'scene' es el mundo real, y 'markerRoot' se pegará al marcador.
    // *Corrección para esta versión de librería*:
    // Encontrará el marcador y moverá la cámara. Nosotros pondremos el modelo fijo en la escena, 
    // pero para que parezca que está en el marcador, usamos un Anchor especial o simplemente
    // añadimos el markerRoot a la escena y dejamos que arMarkerControls lo controle si pasamos el objeto correcto.

    // Vamos a re-configurar markerControls para que controle el GRUPO, no la cámara.
    // Esto es más intuitivo: la cámara fija, el grupo se mueve.
    markerControls = new THREEx.ArMarkerControls(arToolkitContext, markerRoot, {
        type: 'pattern',
        patternUrl: 'https://raw.githack.com/AR-js-org/AR.js/master/data/data/patt.hiro',
    });


    // 7. Iluminación (Añadida al markerRoot para que ilumine al modelo correctamente)
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(0, 10, 10);
    markerRoot.add(dirLight); // La luz viaja con el marcador

    // 8. Cargar Modelo FBX
    const loader = new THREE.FBXLoader();

    // Asegúrate de tener la carpeta models/fbx/ en tu servidor
    loader.load(`models/fbx/${modelName}.fbx`, function (object) {
        const model = object;

        // --- AJUSTE DE ESCALA Y ROTACIÓN ---
        model.scale.setScalar(scaleFactor);
        // A veces los modelos no están centrados, esto ayuda a ponerlo sobre el marcador
        model.position.set(0, 0, 0);

        model.traverse(function (child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        markerRoot.add(model);
        mixer = new THREE.AnimationMixer(model);

        // Cargar Animaciones
        loadAnimations(loader);
        createHTMLButtons();

        loadingDiv.style.display = 'none'; // Ocultar mensaje de carga

    }, undefined, function (e) {
        console.error(e);
        loadingDiv.innerText = "Error cargando modelo (ver consola)";
    });
}

// --- Funciones de Utilidad ---

function onResize() {
    arToolkitSource.onResizeElement();
    arToolkitSource.copyElementSizeTo(renderer.domElement);
    if (arToolkitContext.arController !== null) {
        arToolkitSource.copyElementSizeTo(arToolkitContext.arController.canvas);
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

        // Eventos Touch para móviles
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

    // Actualizar Animaciones
    if (mixer) mixer.update(delta);

    // Actualizar ARToolKit (Detección del marcador)
    if (arToolkitSource.ready !== false) {
        arToolkitContext.update(arToolkitSource.domElement);
    }

    // Opcional: Suavizado visual si se pierde el marcador
    // markerRoot.visible = arToolkitContext.arController.patternMarkers[0].inCurrent;

    renderer.render(scene, camera);
}