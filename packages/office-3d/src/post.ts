import * as THREE from "three";

/**
 * Hand-drawn pixel-art finish, applied to the low-resolution render:
 *  - dark outlines wherever depth or surface direction changes sharply,
 *  - warm colour grade,
 *  - a limited palette with ordered (Bayer) dithering, so gradients become pixel-art bands.
 */
export class PixelPost {
  private color: THREE.WebGLRenderTarget;
  private normal: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private normalMat = new THREE.MeshNormalMaterial();
  private mat: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private clear = new THREE.Color();

  constructor(w: number, h: number, private near: number, private far: number) {
    const mk = () => {
      const rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
      return rt;
    };
    this.color = mk();
    this.color.depthTexture = new THREE.DepthTexture(w, h);
    this.normal = mk();
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.color.texture },
        tDepth: { value: this.color.depthTexture },
        tNormal: { value: this.normal.texture },
        texel: { value: new THREE.Vector2(1 / w, 1 / h) },
        size: { value: new THREE.Vector2(w, h) },
        depthT: { value: 0.5 / (far - near) },
        levels: { value: 13 },
        tint: { value: new THREE.Vector3(1.05, 1.0, 0.93) },
      },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tColor, tDepth, tNormal;
        uniform vec2 texel, size;
        uniform float depthT, levels;
        uniform vec3 tint;
        varying vec2 vUv;
        float bayer(vec2 p){
          int x = int(mod(p.x, 4.0)); int y = int(mod(p.y, 4.0));
          int i = y * 4 + x;
          float m[16] = float[16](0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);
          return (m[i] + 0.5) / 16.0;
        }
        vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
        void main(){
          vec3 col = texture2D(tColor, vUv).rgb;
          float d0 = texture2D(tDepth, vUv).r;
          vec3 n0 = texture2D(tNormal, vUv).rgb * 2.0 - 1.0;
          vec2 o[4] = vec2[4](vec2(texel.x,0.), vec2(-texel.x,0.), vec2(0.,texel.y), vec2(0.,-texel.y));
          float de = 0.0; float ne = 0.0;
          for (int i = 0; i < 4; i++) {
            float d = texture2D(tDepth, vUv + o[i]).r;
            vec3 n = texture2D(tNormal, vUv + o[i]).rgb * 2.0 - 1.0;
            de = max(de, abs(d - d0));
            ne = max(ne, 1.0 - dot(n, n0));
          }
          // tone, then grade in display space
          col = aces(col * 1.05);
          col = pow(col, vec3(1.0 / 2.2));
          float l = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(vec3(l), col, 1.06) * tint;
          // outlines: strong on silhouettes, soft on creases
          if (de > depthT) col *= vec3(0.30, 0.22, 0.20);
          else if (ne > 0.45) col *= vec3(0.62, 0.55, 0.55);
          // limited palette with ordered dithering
          float t = (bayer(floor(vUv * size)) - 0.5) * 0.7 + 0.5;
          col = floor(clamp(col, 0.0, 1.0) * (levels - 1.0) + t) / (levels - 1.0);
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  setSize(w: number, h: number) {
    this.color.setSize(w, h);
    this.normal.setSize(w, h);
    this.mat.uniforms.texel!.value.set(1 / w, 1 / h);
    this.mat.uniforms.size!.value.set(w, h);
  }

  /** Warmer or cooler grade for the time of day. */
  setGrade(tint: [number, number, number]) {
    this.mat.uniforms.tint!.value.set(...tint);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    renderer.setRenderTarget(this.color);
    renderer.render(scene, camera);

    const bg = scene.background;
    const auto = renderer.shadowMap.autoUpdate;
    renderer.getClearColor(this.clear);
    const alpha = renderer.getClearAlpha();
    scene.background = null;
    scene.overrideMaterial = this.normalMat;
    renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(0x8080ff, 1);
    renderer.setRenderTarget(this.normal);
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    scene.background = bg;
    renderer.shadowMap.autoUpdate = auto;
    renderer.setClearColor(this.clear, alpha);

    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.cam);
  }

  dispose() {
    this.color.dispose();
    this.color.depthTexture?.dispose();
    this.normal.dispose();
    this.mat.dispose();
    this.quad.geometry.dispose();
    this.normalMat.dispose();
  }
}
