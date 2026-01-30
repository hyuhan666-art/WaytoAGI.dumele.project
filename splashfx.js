function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      console.log("[img.onload] loaded:", url, img.width, img.height);
      resolve(img);
    };
    img.onerror = (e) => {
      console.error("[img.onerror] failed:", url, e);
      reject(new Error("Failed to load image: " + url));
    };
    img.src = url;
  });
}

// splashfx.js — Shadertoy single-pass integration (no external libs)
console.log("准备加载 iChannel0 图片...");
loadImage("./assetstex/assetstexch0.png")

export function startSplashFx(canvas, opts = {}) {
  const gl = canvas.getContext("webgl", {
    antialias: false,
    premultipliedAlpha: false,
  });
  if (!gl) return { stop() {} };

  const vs = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main(){
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const fs = `
    precision highp float;
    varying vec2 vUv;
    uniform vec3 iResolution;
    uniform float iTime;
    uniform vec4 iMouse;
    uniform int iFrame;
    uniform sampler2D iChannel0;
    uniform sampler2D iChannel1; // key change: second texture channel

    float noise(vec3 p);
    float noise(vec2 p);

    vec2 Rot(vec2 p, float t) {
      float c = cos(t); float s = sin(t);
      return vec2(p.x*c+p.y*s,
                  -p.x*s+p.y*c);
    }
    vec2 RotCS(vec2 p, float c, float s) {
      return vec2( p.x*c+p.y*s,
                  -p.x*s+p.y*c);
    }
    float pot(vec2 pos)
    {
      float iTimeScaled = iTime * 0.35;
      float t = iTimeScaled*.1;

      vec3 p = vec3(pos+vec2(iTimeScaled*.4,0.),t);

      float n = noise(p);
      n += 0.5 *noise(p*2.13);
      n += 3. * noise(pos*0.333);

      return n;
    }

    vec2 field(vec2 pos)
    {
      float s = 1.5;
      pos *= s;

      float n = pot(pos);

      float e = 0.1;
      float nx = pot(vec2(pos+vec2(e,0.)));
      float ny = pot(vec2(pos+vec2(0.,e)));

      return vec2(-(ny-n),nx-n)/e;
    }


    void mainImage( out vec4 fragColor, in vec2 fragCoord )
    {
      float lod = 0.;

      float iTimeScaled = iTime * 0.35;

      vec2 uv = fragCoord.xy;
      uv /= iResolution.xy;
      uv.x *= iResolution.x/iResolution.y;
      uv.y = 1. - uv.y;
      vec2 src_uv = uv;

      vec3 d = vec3(0.);
      vec3 e = vec3(0.);
      for (int i=0; i<25; i++)
      {
        d += texture2D(iChannel0,uv+iTimeScaled*0.05).xyz;
        e += texture2D(iChannel1,-uv.yx*3.+iTimeScaled*0.0125).xyz;

        vec2 new_uv = field(uv)*.00625*.5;

        lod += length(new_uv)*5.;
        uv += new_uv;
      }

      vec3 c0 = texture2D(iChannel0,uv*.1+iTimeScaled*0.025).xyz;
      vec3 c1 = texture2D(iChannel1,uv*.12-iTimeScaled*0.02).xyz;
      vec3 c = mix(c0, c1, 0.35);

      d *= (1./50.);
      e *= (1./50.);
      c = mix(c,d,length(d));
      c = mix(c,e,length(e));

      fragColor = vec4( c,1);

    }



    /* Created by Nikita Miropolskiy, nikat/2013
     * This work is licensed under a 
     * Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License
     * http://creativecommons.org/licenses/by-nc-sa/3.0/
     *  - You must attribute the work in the source code 
     *    (link to https://www.shadertoy.com/view/XsX3zB).
     *  - You may not use this work for commercial purposes.
     *  - You may distribute a derivative work only under the same license.
     */

    /* discontinuous pseudorandom uniformly distributed in [-0.5, +0.5]^3 */
    vec3 random3(vec3 c) {
      float iTimeScaled = iTime * 0.35;
      float j = 4096.0*sin(dot(c,vec3(17.0, 59.4, 15.0)));
      vec3 r;
      r.z = fract(512.0*j);
      j *= .125;
      r.x = fract(512.0*j);
      j *= .125;
      r.y = fract(512.0*j);
      r = r-0.5;

      //rotate for extra flow!
      float t = -iTimeScaled*.5;
      r.xy = Rot(r.xy,t);


      return r;
    }

    /* skew constants for 3d simplex functions */
    const float F3 =  0.3333333;
    const float G3 =  0.1666667;

    /* 3d simplex noise */
    float noise(vec3 p) {
       /* 1. find current tetrahedron T and its four vertices */
       /* s, s+i1, s+i2, s+1.0 - absolute skewed (integer) coordinates of T vertices */
       /* x, x1, x2, x3 - unskewed coordinates of p relative to each of T vertices*/

       /* calculate s and x */
       vec3 s = floor(p + dot(p, vec3(F3)));
       vec3 x = p - s + dot(s, vec3(G3));

       /* calculate i1 and i2 */
       vec3 e = step(vec3(0.0), x - x.yzx);
       vec3 i1 = e*(1.0 - e.zxy);
       vec3 i2 = 1.0 - e.zxy*(1.0 - e);

       /* x1, x2, x3 */
       vec3 x1 = x - i1 + G3;
       vec3 x2 = x - i2 + 2.0*G3;
       vec3 x3 = x - 1.0 + 3.0*G3;

       /* 2. find four surflets and store them in d */
       vec4 w, d;

       /* calculate surflet weights */
       w.x = dot(x, x);
       w.y = dot(x1, x1);
       w.z = dot(x2, x2);
       w.w = dot(x3, x3);

       /* w fades from 0.6 at the center of the surflet to 0.0 at the margin */
       w = max(0.6 - w, 0.0);

       /* calculate surflet components */
       d.x = dot(random3(s), x);
       d.y = dot(random3(s + i1), x1);
       d.z = dot(random3(s + i2), x2);
       d.w = dot(random3(s + 1.0), x3);

       /* multiply d by w^4 */
       w *= w;
       w *= w;
       d *= w;

       /* 3. return the sum of the four surflets */
       return dot(d, vec4(52.0));
    }


    //iq 2d simplex noise

    vec2 hash( vec2 p )
    {
      float iTimeScaled = iTime * 0.35;
      p = vec2( dot(p,vec2(127.1,311.7)),
                dot(p,vec2(269.5,183.3)) );

      vec2 h = -1.0 + 2.0*fract(sin(p)*43758.5453123);

    #if 1
      //extra rotations for more flow!
      float t = -iTimeScaled*0.7;
      float co = cos(t); float si = sin(t);
      h = RotCS(h,co,si);
    #endif
      return h;
    }


    float noise( in vec2 p )
    {
      float iTimeScaled = iTime * 0.35;
      const float K1 = 0.366025404; // (sqrt(3)-1)/2;
      const float K2 = 0.211324865; // (3-sqrt(3))/6;

      vec2 i = floor( p + (p.x+p.y)*K1 );

      vec2 a = p - i + (i.x+i.y)*K2;
      vec2 o = (a.x>a.y) ? vec2(1.0,0.0) : vec2(0.0,1.0); //vec2 of = 0.5 + 0.5*vec2(sign(a.x-a.y), sign(a.y-a.x));
      vec2 b = a - o + K2;
      vec2 c = a - 1.0 + 2.0*K2;

    #if 1
      //even more extra rotations for more flow!
      float t = iTimeScaled*.5;
      float co = cos(t); float si = sin(t);
      a = RotCS(a,co,si);
      b = RotCS(b,co,si);
      c = RotCS(c,co,si);
    #endif

      vec3 h = max( 0.5-vec3(dot(a,a), dot(b,b), dot(c,c) ), 0.0 );

      vec3 n = h*h*h*h*vec3( dot(a,hash(i+0.0)), dot(b,hash(i+o)), dot(c,hash(i+1.0)));

      return dot( n, vec3(70.0) );

    }

    void main(){
      vec4 fragColor = vec4(0.0);
      mainImage(fragColor, gl_FragCoord.xy);
      vec3 c = fragColor.rgb;
      c = mix(vec3(0.02,0.02,0.025), c, 0.9);
      gl_FragColor = vec4(c, 1.0);
    }
  `;

  function compile(type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vsh = compile(gl.VERTEX_SHADER, vs);
  const fsh = compile(gl.FRAGMENT_SHADER, fs);
  if (!vsh || !fsh) return { stop() {} };

  const program = gl.createProgram();
  gl.attachShader(program, vsh);
  gl.attachShader(program, fsh);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    return { stop() {} };
  }
  gl.useProgram(program);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uResolution = gl.getUniformLocation(program, "iResolution");
  const uTime = gl.getUniformLocation(program, "iTime");
  const uMouse = gl.getUniformLocation(program, "iMouse");
  const uFrame = gl.getUniformLocation(program, "iFrame");
  const uChannel0 = gl.getUniformLocation(program, "iChannel0");
  const uChannel1 = gl.getUniformLocation(program, "iChannel1");

  // key change: load iChannel textures from local files
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        console.log(`[splashfx] loaded ${src} ${img.width}x${img.height}`);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`Failed to load ${src}`));
      img.src = src;
    });
  }

  // key change: Shadertoy-style sampler params (repeat + mipmap + no vflip)
  function nextPowerOfTwo(value) {
    return 2 ** Math.ceil(Math.log2(value));
  }

  function ensurePowerOfTwo(img) {
    const isPOT =
      (img.width & (img.width - 1)) === 0 &&
      (img.height & (img.height - 1)) === 0;
    if (isPOT) return { source: img, resized: false };

    const canvas = document.createElement("canvas");
    canvas.width = nextPowerOfTwo(img.width);
    canvas.height = nextPowerOfTwo(img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    console.log(
      `[splashfx] resized texture to POT ${canvas.width}x${canvas.height}`,
    );
    return { source: canvas, resized: true };
  }

  function createTextureFromImage(glCtx, unit, img) {
    const tex = glCtx.createTexture();
    glCtx.activeTexture(glCtx.TEXTURE0 + unit);
    glCtx.bindTexture(glCtx.TEXTURE_2D, tex);
    glCtx.pixelStorei(glCtx.UNPACK_FLIP_Y_WEBGL, false);
    const { source } = ensurePowerOfTwo(img);
    glCtx.texImage2D(
      glCtx.TEXTURE_2D,
      0,
      glCtx.RGBA,
      glCtx.RGBA,
      glCtx.UNSIGNED_BYTE,
      source,
    );
    glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_S, glCtx.REPEAT);
    glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_T, glCtx.REPEAT);
    glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MIN_FILTER, glCtx.LINEAR_MIPMAP_LINEAR);
    glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MAG_FILTER, glCtx.LINEAR);
    glCtx.generateMipmap(glCtx.TEXTURE_2D);
    return tex;
  }

  function createNoiseTexture(glCtx, unit, size = 256) {
    const noiseData = new Uint8Array(size * size * 4);
    for (let i = 0; i < noiseData.length; i += 4) {
      const v = Math.floor(Math.random() * 256);
      noiseData[i] = v;
      noiseData[i + 1] = v;
      noiseData[i + 2] = v;
      noiseData[i + 3] = 255;
    }
    const tex = glCtx.createTexture();
    glCtx.activeTexture(glCtx.TEXTURE0 + unit);
    glCtx.bindTexture(glCtx.TEXTURE_2D, tex);
    glCtx.pixelStorei(glCtx.UNPACK_FLIP_Y_WEBGL, false);
    glCtx.texImage2D(
      glCtx.TEXTURE_2D,
      0,
      glCtx.RGBA,
      size,
      size,
      0,
      glCtx.RGBA,
      glCtx.UNSIGNED_BYTE,
      noiseData,
    );
    glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_S, glCtx.REPEAT);
    glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_T, glCtx.REPEAT);
    glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MIN_FILTER, glCtx.LINEAR_MIPMAP_LINEAR);
    glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MAG_FILTER, glCtx.LINEAR);
    glCtx.generateMipmap(glCtx.TEXTURE_2D);
    return tex;
  }

  let running = true;
  let frame = 0;
  const start = performance.now();
  let renderStarted = false;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.floor(canvas.clientWidth * dpr);
    const height = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    gl.uniform3f(uResolution, canvas.width, canvas.height, 1.0);
  }

  function tick(now) {
    if (!running) return;
    resize();
    const time = (now - start) * 0.001;
    gl.uniform1f(uTime, time);
    gl.uniform4f(uMouse, 0.0, 0.0, 0.0, 0.0);
    gl.uniform1i(uFrame, frame++);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(tick);
  }

  const startRender = () => {
    if (renderStarted) return;
    renderStarted = true;
    requestAnimationFrame(tick);
  };

  const onResize = () => resize();
  window.addEventListener("resize", onResize);

  Promise.all([
    loadImage("./assetstex/assetstexch0.png"),
    loadImage("./assetstex/assetstexch1.png"),
  ])
    .then(([img0, img1]) => {
      createTextureFromImage(gl, 0, img0);
      createTextureFromImage(gl, 1, img1);
      gl.uniform1i(uChannel0, 0);
      gl.uniform1i(uChannel1, 1);
      console.log("[splashfx] textures ready");
      startRender();
    })
    .catch((error) => {
      console.warn("[splashfx] texture load failed, fallback to noise:", error);
      createNoiseTexture(gl, 0);
      createNoiseTexture(gl, 1);
      gl.uniform1i(uChannel0, 0);
      gl.uniform1i(uChannel1, 1);
      console.log("[splashfx] textures ready");
      startRender();
    });

  return {
    stop() {
      running = false;
      window.removeEventListener("resize", onResize);
    },
  };
}
