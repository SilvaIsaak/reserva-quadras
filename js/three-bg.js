// Fundo animado 3D (three.js)
function initTennis3D() {
    const canvas = document.getElementById('tennis-canvas');
    if (!canvas) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const tennisElements = [];
    const ballCount = state.settings.performanceMode ? 5 : 15;
    const racketCount = state.settings.performanceMode ? 2 : 5;
    const trophyCount = state.settings.performanceMode ? 1 : 3;
    const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xccff00, roughness: 0.8, metalness: 0.1 });
    const racketFrameMaterial = new THREE.MeshStandardMaterial({ color: 0x2d3436, metalness: 0.9, roughness: 0.2 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x6366f1, metalness: 0.8, roughness: 0.3, emissive: 0x6366f1, emissiveIntensity: 0.4 });
    const gripMaterial = new THREE.MeshStandardMaterial({ color: 0x1e272e, roughness: 0.9 });
    const stringMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, shininess: 100 });
    const logoMaterial = new THREE.MeshBasicMaterial({ color: 0x6366f1, side: THREE.DoubleSide });
    const trophyMaterial = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1.0, roughness: 0.1 });

    // Shared Geometries (Optimized)
    const geoBall = new THREE.SphereGeometry(1.2, state.settings.performanceMode ? 8 : 24, state.settings.performanceMode ? 8 : 24);
    const geoLine = new THREE.TorusGeometry(1.21, 0.04, 12, 60, Math.PI * 1.5);
    const geoRacketFrame = new THREE.TorusGeometry(3, 0.22, state.settings.performanceMode ? 8 : 16, state.settings.performanceMode ? 16 : 80);
    const geoCylinderLow = new THREE.CylinderGeometry(0.3, 0.3, 1.3, 8);
    const geoCylinderMid = new THREE.CylinderGeometry(0.2, 0.2, 1.8, 8);
    const geoHandle = new THREE.CylinderGeometry(0.25, 0.28, 3.5, 8);
    const geoGrip = new THREE.CylinderGeometry(0.38, 0.38, 3.2, 8);
    const geoButt = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 8);
    const geoString = new THREE.CylinderGeometry(0.012, 0.012, 1, 6);
    const geoLogo = new THREE.BoxGeometry(1.5, 0.05, 0.05);
    const geoCupBody = new THREE.CylinderGeometry(1.8, 0.8, 3.5, state.settings.performanceMode ? 8 : 24);
    const geoCupBase = new THREE.BoxGeometry(2.2, 0.6, 2.2);
    const geoCupStem = new THREE.CylinderGeometry(0.5, 1.2, 1, 12);
    const geoCupHandle = new THREE.TorusGeometry(1, 0.15, 8, 40, Math.PI);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2); mainLight.position.set(10, 20, 10); scene.add(mainLight);
    const fillLight = new THREE.PointLight(0x6366f1, 0.5); fillLight.position.set(-15, -10, 5); scene.add(fillLight);
    
    function createBall() {
        const group = new THREE.Group();
        const ball = new THREE.Mesh(geoBall, ballMaterial);
        group.add(ball);
        if (!state.settings.performanceMode) {
            const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const s1 = new THREE.Mesh(geoLine, lineMat); s1.rotation.set(Math.PI/4, 0, 0); group.add(s1);
            const s2 = new THREE.Mesh(geoLine, lineMat); s2.rotation.set(-Math.PI/4, Math.PI, 0); group.add(s2);
        }
        resetElement(group); scene.add(group); tennisElements.push(group);
    }

    function createRacket() {
        const group = new THREE.Group();
        const racketColors = [0x6366f1, 0xef4444, 0x10b981, 0xf59e0b];
        const selectedColor = racketColors[Math.floor(Math.random() * racketColors.length)];
        const currentAccentMaterial = accentMaterial.clone(); currentAccentMaterial.color.setHex(selectedColor); currentAccentMaterial.emissive.setHex(selectedColor);
        const currentLogoMaterial = logoMaterial.clone(); currentLogoMaterial.color.setHex(selectedColor);
        
        const frame = new THREE.Mesh(geoRacketFrame, racketFrameMaterial); frame.scale.set(0.85, 1.15, 1); group.add(frame);
        
        const bridge = new THREE.Mesh(geoCylinderLow, racketFrameMaterial); bridge.rotation.z = Math.PI / 2; bridge.position.y = -2.8; group.add(bridge);
        const throatL = new THREE.Mesh(geoCylinderMid, racketFrameMaterial); throatL.position.set(-0.45, -3.6, 0); throatL.rotation.z = 0.25; group.add(throatL);
        const throatR = throatL.clone(); throatR.position.x = 0.45; throatR.rotation.z = -0.25; group.add(throatR);
        const handle = new THREE.Mesh(geoHandle, racketFrameMaterial); handle.position.y = -5.5; group.add(handle);
        const grip = new THREE.Mesh(geoGrip, gripMaterial); grip.position.y = -6.6; group.add(grip);
        const buttCap = new THREE.Mesh(geoButt, currentAccentMaterial); buttCap.position.y = -8.2; group.add(buttCap);

        const stringCount = state.settings.performanceMode ? 4 : 14;
        const stringGroup = new THREE.Group();
        for(let i = -stringCount/2; i <= stringCount/2; i++) {
            const pos = (i / (stringCount/2)) * 2.2;
            if (Math.abs(pos) < 2.3) {
                const vLen = Math.sqrt(1 - Math.pow(pos/2.6, 2)) * 6.8;
                const vStr = new THREE.Mesh(geoString, stringMaterial); vStr.scale.y = vLen; vStr.position.x = pos; vStr.position.z = (i % 2 === 0 ? 0.01 : -0.01); stringGroup.add(vStr);
            }
            const hPos = (i / (stringCount/2)) * 3.2;
            if (Math.abs(hPos) < 3.3) {
                const hLen = Math.sqrt(1 - Math.pow(hPos/3.6, 2)) * 5.4;
                const hStr = new THREE.Mesh(geoString, stringMaterial); hStr.scale.y = hLen; hStr.rotation.z = Math.PI / 2; hStr.position.y = hPos; hStr.position.z = (i % 2 === 0 ? -0.01 : 0.01); stringGroup.add(hStr);
            }
        }
        group.add(stringGroup);

        if (!state.settings.performanceMode) {
            const logoL = new THREE.Mesh(geoLogo, currentLogoMaterial); logoL.rotation.z = Math.PI / 3; logoL.position.set(-0.4, 0.5, 0.03); group.add(logoL);
            const logoR = logoL.clone(); logoR.rotation.z = -Math.PI / 3; logoR.position.x = 0.4; group.add(logoR);
        }
        resetElement(group); scene.add(group); tennisElements.push(group);
    }

    function createTrophy() {
        const group = new THREE.Group();
        const cupBody = new THREE.Mesh(geoCupBody, trophyMaterial); group.add(cupBody);
        const base = new THREE.Mesh(geoCupBase, gripMaterial); base.position.y = -2.1; group.add(base);
        const stem = new THREE.Mesh(geoCupStem, trophyMaterial); stem.position.y = -1.5; group.add(stem);
        const h1 = new THREE.Mesh(geoCupHandle, trophyMaterial); h1.position.set(1.8, 0.8, 0); h1.rotation.z = -Math.PI / 2.5; group.add(h1);
        const h2 = h1.clone(); h2.position.x = -1.8; h2.rotation.z = Math.PI / 2.5; group.add(h2);
        resetElement(group); scene.add(group); tennisElements.push(group);
    }
    function resetElement(el) {
        el.position.x = (Math.random() - 0.5) * 100; el.position.y = (Math.random() - 0.5) * 60; el.position.z = -180 - Math.random() * 200;
        el.userData.vx = (Math.random() - 0.5) * 0.08; el.userData.vy = (Math.random() - 0.5) * 0.08; el.userData.speed = 0.15 + Math.random() * 0.25;
        el.userData.rotationSpeedX = (Math.random() - 0.5) * 0.04; el.userData.rotationSpeedY = (Math.random() - 0.5) * 0.04;
    }
    for(let i = 0; i < ballCount; i++) createBall();
    for(let i = 0; i < racketCount; i++) createRacket();
    for(let i = 0; i < trophyCount; i++) createTrophy();
    camera.position.z = 20;
    let lastTime = 0;
    const fpsLimit = 60;

    function animate(time) {
        if (canvas.style.display === 'none' || (state.settings.performanceMode && state.currentView !== 'public')) {
            requestAnimationFrame(animate); return;
        }

        const delta = time - lastTime;
        if (delta < 1000 / fpsLimit) {
            requestAnimationFrame(animate);
            return;
        }
        lastTime = time;

        requestAnimationFrame(animate);
        tennisElements.forEach(el => {
            el.position.z += el.userData.speed; el.position.x += el.userData.vx; el.position.y += el.userData.vy;
            el.rotation.x += el.userData.rotationSpeedX; el.rotation.y += el.userData.rotationSpeedY;
            if (el.position.z > 30 || Math.abs(el.position.x) > 80 || Math.abs(el.position.y) > 50) resetElement(el);
        });
        renderer.render(scene, camera);
    }
    window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
    animate();
}

try { initTennis3D(); } catch (e) { console.error("Erro na inicialização:", e); }

// ============================================================
// TAREFA F — Reversão de atividade encerrada
// ============================================================

/** @param {string} historyId - ID da entrada em state.history a reverter */
