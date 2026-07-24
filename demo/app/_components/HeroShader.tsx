"use client";

import { useEffect, useRef } from "react";
import { Renderer, Triangle, Program, Mesh, Vec2 } from "ogl";
import { prefersReducedMotion } from "../../lib/motion";

// Full-bleed molten-metal field. Rendered into a container <div> rather than a
// JSX <canvas>: OGL owns the canvas, one fresh WebGL context per mount, appended
// on setup and removed on teardown. This is deliberate — React Strict Mode
// (on in Next dev) mounts effects twice, and the cleanup below calls
// loseContext(); a single JSX canvas would hand the *second* mount the dead
// context from the first and every render() would throw. A per-mount canvas
// sidesteps that entirely and still cleans up correctly on real unmount.
//
// SSR-safe by construction: only ever reached via
// `next/dynamic(() => import("./HeroShader"), { ssr: false })`, and the effect
// never runs on the server. `coolRef` (0 → 1) is scrubbed by the hero's
// ScrollTrigger in page.tsx; the rAF loop eases toward it each frame instead of
// the parent re-rendering on scroll.

const VERTEX = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec2  uResolution;
uniform float uCool;        // 0 molten -> 1 cooled (scroll progress)
uniform vec2  uPointer;     // normalized 0..1, cursor position (desktop)
uniform float uPointerHeat; // 0..1, eased in/out on enter/leave

varying vec2 vUv;

const vec3 COAL  = vec3(0.047, 0.039, 0.035);
const vec3 IRON  = vec3(0.078, 0.067, 0.063);
const vec3 DEEP  = vec3(0.600, 0.188, 0.000);
const vec3 EMBER = vec3(0.937, 0.329, 0.067);
const vec3 GLOW  = vec3(1.000, 0.655, 0.400);

vec2 hash2(vec2 p){
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(dot(hash2(i+vec2(0.0,0.0)), f-vec2(0.0,0.0)),
                 dot(hash2(i+vec2(1.0,0.0)), f-vec2(1.0,0.0)), u.x),
             mix(dot(hash2(i+vec2(0.0,1.0)), f-vec2(0.0,1.0)),
                 dot(hash2(i+vec2(1.0,1.0)), f-vec2(1.0,1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++){ v += a*noise(p); p = m*p; a *= 0.5; }
  return v;
}

void main(){
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = uv; p.x *= aspect;

  float t = uTime * 0.06;
  float flow = mix(1.0, 0.15, uCool);

  vec2 q = vec2(fbm(p*2.5 + vec2(0.0, t*flow)),
                fbm(p*2.5 + vec2(5.2, -t*flow*0.8)));
  vec2 r = vec2(fbm(p*2.5 + 3.0*q + vec2(1.7, t*flow*0.6)),
                fbm(p*2.5 + 3.0*q + vec2(8.3, t*flow*0.4)));
  float field = fbm(p*2.5 + 3.5*r) * 0.5 + 0.5;

  float seams = pow(smoothstep(0.35,0.5,field) * smoothstep(0.75,0.55,field), 1.2);

  float pool = smoothstep(1.0, 0.0, uv.y) * mix(0.6, 1.0, uv.x);
  float heat = field * pool;

  vec2 pp = (uv - uPointer); pp.x *= aspect;
  heat += uPointerHeat * exp(-dot(pp,pp) * 8.0);

  float cc = mix(0.15, 0.85, uCool);
  float molten  = smoothstep(cc,        cc+0.35, heat);
  float glowM   = smoothstep(cc+0.15,   cc+0.5,  heat + seams*0.4);

  vec3 col = mix(COAL, IRON, smoothstep(0.0, 0.25, heat));
  col = mix(col, DEEP,  molten);
  col = mix(col, EMBER, glowM);
  col = mix(col, GLOW,  pow(glowM, 3.0) * (1.0 - uCool*0.6));
  col += EMBER * seams * (1.0 - uCool*0.7) * 0.6;

  float ember = 0.0;
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    vec2 gp = p * (8.0 + fi*4.0);
    gp.y += t * (2.0 + fi) * mix(1.0, 0.2, uCool);
    vec2 id = floor(gp);
    vec2 gv = fract(gp) - 0.5;
    vec2 rnd = hash2(id + fi*17.0);
    float spark = smoothstep(0.12, 0.0, length(gv - rnd*0.3));
    float life  = fract(rnd.x*13.0 + t*(0.5 + fi*0.2));
    ember += spark * (1.0 - life) * step(0.7, rnd.y);
  }
  col += GLOW * ember * (1.0 - uCool) * pool * 1.5;

  float vig = smoothstep(1.2, 0.2, length((uv-0.5) * vec2(aspect, 1.0)));
  col *= mix(0.85, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function HeroShader({ coolRef }: { coolRef: { current: number } }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return; // poster only, no renderer at all
    const parent = containerRef.current;
    if (!parent) return;

    // OGL creates and owns the canvas → a fresh context every mount.
    const renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio || 1, 2), alpha: false });
    const gl = renderer.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      opacity: "0",
      transition: "opacity 600ms ease",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    parent.appendChild(canvas);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: VERTEX,
      fragment: FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new Vec2(1, 1) },
        uCool: { value: 0 },
        uPointer: { value: new Vec2(0.7, 0.5) },
        uPointerHeat: { value: 0 },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = parent;
      renderer.setSize(w, h);
      (program.uniforms.uResolution.value as InstanceType<typeof Vec2>).set(w, h);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    resize();

    let raf = 0;
    let visible = true;
    const start = performance.now();

    const loop = () => {
      if (!visible) {
        raf = 0;
        return;
      }
      const now = performance.now();
      program.uniforms.uTime.value = (now - start) / 1000;
      program.uniforms.uCool.value += (coolRef.current - program.uniforms.uCool.value) * 0.08;
      const heatUniform = program.uniforms.uPointerHeat;
      heatUniform.value += (targetHeat - heatUniform.value) * 0.06;
      renderer.render({ scene: mesh });
      canvas.style.opacity = "1";
      raf = requestAnimationFrame(loop);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !raf) loop();
      },
      { threshold: 0 },
    );
    io.observe(parent);

    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    let targetHeat = 0;
    const onMove = (ev: PointerEvent) => {
      const b = parent.getBoundingClientRect();
      (program.uniforms.uPointer.value as InstanceType<typeof Vec2>).set(
        (ev.clientX - b.left) / b.width,
        1 - (ev.clientY - b.top) / b.height,
      );
      targetHeat = 0.6;
    };
    const onLeave = () => {
      targetHeat = 0;
    };
    if (fine) {
      parent.addEventListener("pointermove", onMove);
      parent.addEventListener("pointerleave", onLeave);
    }

    loop();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      if (fine) {
        parent.removeEventListener("pointermove", onMove);
        parent.removeEventListener("pointerleave", onLeave);
      }
      (gl.getExtension("WEBGL_lose_context") as { loseContext: () => void } | null)?.loseContext();
      canvas.remove();
    };
  }, [coolRef]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    />
  );
}
