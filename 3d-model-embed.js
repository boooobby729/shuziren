/**
 * 3D 数字人白模 - 光晕折射效果
 * 
 * 使用方式：
 * 1. 在 HTML 中添加 importmap：
 *    <script type="importmap">
 *    { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/" } }
 *    </script>
 * 
 * 2. 在页面中放置容器：
 *    <section class="screen5-model">
 *      <canvas class="screen5-model-canvas" id="modelCanvas"></canvas>
 *    </section>
 * 
 * 3. 添加 CSS：
 *    .screen5-model { position: relative; width: 100%; height: 100vh; overflow: hidden; background: #fff; }
 *    .screen5-model-canvas { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; }
 * 
 * 4. 引入本文件：
 *    <script type="module" src="3d-model-embed.js"></script>
 * 
 * 5. 确保 GLB 模型路径正确（默认 assets/digital-human.glb）
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

(function () {
  const canvas = document.getElementById('modelCanvas');
  if (!canvas) return;

  const section = canvas.closest('.screen5-model');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0xffffff, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
  keyLight.position.set(-3, 4, 3);
  scene.add(keyLight);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambientLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.2);
  fillLight.position.set(2, -1, 1);
  scene.add(fillLight);

  // Uniforms（参数已固定）
  const uniforms = {
    time: { value: 0 },
    baseColor: { value: new THREE.Color(0xf5f5f5) },
    ambientStrength: { value: 0.9 },
    specularStrength: { value: 0.5 },
    shininess: { value: 32.0 },
    fresnelStrength: { value: 0.3 },
    fresnelPow: { value: 3.0 },
    // 光晕折射（薄膜干涉）
    iriIntensity: { value: 0.35 },
    filmThickness: { value: 400.0 },
    thicknessVar: { value: 150.0 },
    edgeBias: { value: 2.0 },
    iriSpeed: { value: 0.4 },
    dispersion: { value: 1.2 },
    scrollProgress: { value: 0.0 },
    // 扫描网格
    gridColor: { value: new THREE.Color(0x8b7cf7) },
    gridDensity: { value: 12.0 },
    gridLineWidth: { value: 0.01 },
    gridIntensity: { value: 0.25 },
    scanSpeed: { value: 1.9 },
    scanWidth: { value: 0.27 },
    // 模型范围
    modelYMin: { value: -0.6 },
    modelYMax: { value: 0.6 }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewDir;
      varying vec3 vWorldNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 baseColor;
      uniform float ambientStrength;
      uniform float specularStrength;
      uniform float shininess;
      uniform float fresnelStrength;
      uniform float fresnelPow;

      uniform float iriIntensity;
      uniform float filmThickness;
      uniform float thicknessVar;
      uniform float edgeBias;
      uniform float iriSpeed;
      uniform float dispersion;
      uniform float scrollProgress;

      uniform vec3 gridColor;
      uniform float gridDensity;
      uniform float gridLineWidth;
      uniform float gridIntensity;
      uniform float scanSpeed;
      uniform float scanWidth;

      uniform float modelYMin;
      uniform float modelYMax;

      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewDir;
      varying vec3 vWorldNormal;

      vec3 wavelengthToRGB(float wavelength) {
        float w = clamp((wavelength - 380.0) / 400.0, 0.0, 1.0);
        float r = exp(-pow((w - 0.75) * 3.5, 2.0));
        float g = exp(-pow((w - 0.45) * 3.0, 2.0));
        float b = exp(-pow((w - 0.15) * 3.5, 2.0));
        return vec3(r, g, b);
      }

      vec3 thinFilmInterference(float cosTheta, float thickness) {
        float n = 1.33;
        float sinTheta = sqrt(1.0 - cosTheta * cosTheta);
        float sinThetaR = sinTheta / n;
        float cosThetaR = sqrt(1.0 - sinThetaR * sinThetaR);
        float opticalPath = 2.0 * n * thickness * cosThetaR;

        vec3 color = vec3(0.0);
        for (float i = 0.0; i < 3.0; i += 1.0) {
          float order = i + 1.0;
          float lambda = opticalPath / order;
          if (lambda >= 380.0 && lambda <= 780.0) {
            float intensity = 1.0 / (order * 0.7 + 0.3);
            color += wavelengthToRGB(lambda) * intensity;
          }
        }

        float phase = mod(opticalPath * dispersion / 550.0, 1.0) * 400.0 + 380.0;
        vec3 spectralColor = wavelengthToRGB(phase);
        color = mix(spectralColor, color, 0.4);
        return color;
      }

      float hash(vec3 p) {
        p = fract(p * vec3(443.897, 441.423, 437.195));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }

      float noise3D(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);

        float n000 = hash(i);
        float n100 = hash(i + vec3(1.0, 0.0, 0.0));
        float n010 = hash(i + vec3(0.0, 1.0, 0.0));
        float n110 = hash(i + vec3(1.0, 1.0, 0.0));
        float n001 = hash(i + vec3(0.0, 0.0, 1.0));
        float n101 = hash(i + vec3(1.0, 0.0, 1.0));
        float n011 = hash(i + vec3(0.0, 1.0, 1.0));
        float n111 = hash(i + vec3(1.0, 1.0, 1.0));

        float nx00 = mix(n000, n100, f.x);
        float nx10 = mix(n010, n110, f.x);
        float nx01 = mix(n001, n101, f.x);
        float nx11 = mix(n011, n111, f.x);

        float nxy0 = mix(nx00, nx10, f.y);
        float nxy1 = mix(nx01, nx11, f.y);

        return mix(nxy0, nxy1, f.z);
      }

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewDir);

        // 基础光照（白模）
        vec3 lightDir = normalize(vec3(-3.0, 4.0, 3.0));
        float diff = max(dot(normal, lightDir), 0.0);
        vec3 color = baseColor * (ambientStrength + diff * (1.0 - ambientStrength));

        // Blinn-Phong 高光
        vec3 halfDir = normalize(lightDir + viewDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), shininess);
        color += vec3(1.0) * spec * specularStrength;

        // 菲涅尔边缘光
        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), fresnelPow);
        color += vec3(1.0) * fresnel * fresnelStrength;

        // 光晕折射（薄膜干涉）
        float NdotV = max(dot(normal, viewDir), 0.0);

        vec3 noiseCoord = vWorldPosition * 3.0 + vec3(time * iriSpeed * 0.3, time * iriSpeed * 0.2, time * iriSpeed * 0.1);
        float thicknessNoise = noise3D(noiseCoord);

        vec3 noiseCoord2 = vWorldPosition * 1.2 + vec3(time * iriSpeed * 0.15, -time * iriSpeed * 0.1, time * iriSpeed * 0.05);
        float thicknessNoise2 = noise3D(noiseCoord2);

        float combinedNoise = mix(thicknessNoise, thicknessNoise2, 0.5);

        float scrollOffset = scrollProgress * 900.0;
        float thickness = filmThickness + scrollOffset + thicknessVar * (combinedNoise * 2.0 - 1.0);

        vec3 iriColor = thinFilmInterference(NdotV, thickness);

        float edgeFactor = pow(1.0 - NdotV, edgeBias);
        float specHighlight = pow(max(dot(normal, halfDir), 0.0), shininess * 0.5) * 0.3;

        float iriMask = edgeFactor + specHighlight;
        iriMask = clamp(iriMask, 0.0, 1.0);

        vec3 iriContribution = iriColor * iriMask * iriIntensity;
        iriContribution = min(iriContribution, vec3(0.4));

        color += iriContribution;

        // 扫描网格
        float normalizedY = (vWorldPosition.y - modelYMin) / (modelYMax - modelYMin);
        normalizedY = clamp(normalizedY, 0.0, 1.0);

        float scanPos = fract(time * scanSpeed * 0.5);
        float scanDist = abs(normalizedY - scanPos);
        scanDist = min(scanDist, 1.0 - scanDist);
        float scanMask = smoothstep(scanWidth, 0.0, scanDist);

        float parallaxOffset = scrollProgress * 1.0;
        float coordY = (vWorldPosition.y + parallaxOffset) * gridDensity;
        float coordX = vWorldPosition.x * gridDensity;
        float lineY = 1.0 - step(gridLineWidth, abs(fract(coordY) - 0.5));
        float lineX = 1.0 - step(gridLineWidth, abs(fract(coordX) - 0.5));
        float grid = max(lineY, lineX);

        float gridAlpha = grid * (scanMask * 0.7 + 0.3) * gridIntensity;
        vec3 iriColorBright = normalize(iriColor + 0.01) * 1.2;
        vec3 gridFinalColor = mix(gridColor, iriColorBright, 0.7);
        color += gridFinalColor * gridAlpha;

        // 滚动透明度：从 0 渐入到 1
        float fadeIn = smoothstep(0.0, 0.5, scrollProgress);
        gl_FragColor = vec4(color, fadeIn);
      }
    `
  });

  let modelYMin = -0.6;
  let modelYMax = 0.6;
  let modelLoaded = false;

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/libs/draco/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);

  loader.load('assets/digital-human.glb', function (gltf) {
    const model = gltf.scene;
    model.traverse(function (child) {
      if (child.isMesh) {
        child.material = material;
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    model.position.sub(center);
    scene.add(model);

    modelYMin = -size.y / 2;
    modelYMax = size.y / 2;
    uniforms.modelYMin.value = modelYMin;
    uniforms.modelYMax.value = modelYMax;

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const dist = maxDim / (2 * Math.tan(fov / 2)) * 1.2;
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    modelLoaded = true;
  });

  // 滚动驱动光晕折射变化 + 透明度
  function updateScroll() {
    const rect = section.getBoundingClientRect();
    const viewH = window.innerHeight;
    const progress = 1 - (rect.bottom / (viewH + rect.height));
    const clampedProgress = Math.max(0, Math.min(1, progress));
    uniforms.scrollProgress.value = clampedProgress;
  }
  window.addEventListener('scroll', updateScroll, { passive: true });
  updateScroll();

  // 尺寸适配
  function resize() {
    const rect = section.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // 渲染循环
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    uniforms.time.value = clock.getElapsedTime();
    renderer.render(scene, camera);
  }
  animate();
})();
