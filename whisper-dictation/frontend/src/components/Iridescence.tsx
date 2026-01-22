import { Renderer, Program, Mesh, Color, Triangle } from 'ogl';
import { useEffect, useRef } from 'react';

import './Iridescence.css';

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

// Optimized Shader - using mediump for better performance on low-end GPUs
const fragmentShader = `
precision mediump float;

uniform float uTime;
uniform vec3 uColor;
uniform vec3 uResolution;
uniform vec2 uMouse;
uniform float uScroll;
uniform float uAmplitude;
uniform float uSpeed;

varying vec2 vUv;

void main() {
  float mr = min(uResolution.x, uResolution.y);
  vec2 uv = (vUv.xy * 2.0 - 1.0) * uResolution.xy / mr;

  uv.y += uScroll * 0.5;
  uv += (uMouse - vec2(0.5)) * uAmplitude;

  float d = -uTime * 0.5 * uSpeed;
  float a = 0.0;

  for (float i = 0.0; i < 6.0; ++i) {
    a += cos(i - d - a * uv.x);
    d += sin(uv.y * i + a);
  }
  d += uTime * 0.5 * uSpeed;
  vec3 col = vec3(cos(uv * vec2(d, a)) * 0.6 + 0.4, cos(a + d) * 0.5 + 0.5);
  col = cos(col * cos(vec3(d, a, 2.5)) * 0.5 + 0.5) * uColor;
  gl_FragColor = vec4(col, 1.0);
}
`;

export default function Iridescence({ color = [1, 1, 1], speed = 1.0, amplitude = 0.1, mouseReact = true, ...rest }: { color?: [number, number, number], speed?: number, amplitude?: number, mouseReact?: boolean, [key: string]: any }) {
  const ctnDom = useRef<HTMLDivElement>(null);
  const mousePos = useRef({ x: 0.5, y: 0.5 });
  const mouseUpdatePending = useRef(false);
  const scrollYRef = useRef(0);
  const programRef = useRef<Program | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const animateIdRef = useRef<number | null>(null);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ctnDom.current) return;
    const ctn = ctnDom.current;

    const renderer = new Renderer({
      dpr: 1,
      alpha: true,
      powerPreference: "low-power", // Prefer low power GPU on dual-GPU systems
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false
    });
    rendererRef.current = renderer;

    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);

    const geometry = new Triangle(gl);
    const initialColor = new Color(...color);

    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: initialColor },
        uResolution: {
          value: new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height)
        },
        uMouse: { value: new Float32Array([mousePos.current.x, mousePos.current.y]) },
        uScroll: { value: 0 },
        uAmplitude: { value: amplitude },
        uSpeed: { value: speed }
      }
    });
    programRef.current = program;

    const mesh = new Mesh(gl, { geometry, program });

    // Render at 0.5x resolution for ~75% GPU workload reduction
    const RENDER_SCALE = 0.5;

    function resize() {
      if (!ctnDom.current) return;
      renderer.setSize(
        ctn.offsetWidth * RENDER_SCALE,
        ctn.offsetHeight * RENDER_SCALE
      );

      if (program) {
        program.uniforms.uResolution.value = new Color(
          gl.canvas.width,
          gl.canvas.height,
          gl.canvas.width / gl.canvas.height
        );
      }
    }

    // Debounced resize handler to prevent frame drops during window resizing
    function handleResize() {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(resize, 100);
    }

    window.addEventListener('resize', handleResize, false);
    resize();

    let lastFrameTime = 0;
    const targetFPS = 15; // Reduced from 20 for better CPU performance
    const frameInterval = 1000 / targetFPS;

    function update(t: number) {
      animateIdRef.current = requestAnimationFrame(update);

      const elapsed = t - lastFrameTime;
      if (elapsed < frameInterval) return;
      lastFrameTime = t - (elapsed % frameInterval);

      if (programRef.current) {
        programRef.current.uniforms.uTime.value = t * 0.001;
        programRef.current.uniforms.uScroll.value = scrollYRef.current / window.innerHeight;

        if (mouseUpdatePending.current) {
          programRef.current.uniforms.uMouse.value[0] = mousePos.current.x;
          programRef.current.uniforms.uMouse.value[1] = mousePos.current.y;
          mouseUpdatePending.current = false;
        }
      }

      renderer.render({ scene: mesh });
    }
    animateIdRef.current = requestAnimationFrame(update);
    ctn.appendChild(gl.canvas);

    function handleMouseMove(e: MouseEvent) {
      const rect = ctn.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1.0 - (e.clientY - rect.top) / rect.height;
      mousePos.current = { x, y };
      mouseUpdatePending.current = true;
    }

    function handleScroll() {
      scrollYRef.current = window.scrollY;
    }

    if (mouseReact) {
      ctn.addEventListener('mousemove', handleMouseMove as any, { passive: true });
    }

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      if (animateIdRef.current !== null) {
        cancelAnimationFrame(animateIdRef.current);
      }
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
      if (mouseReact) {
        ctn.removeEventListener('mousemove', handleMouseMove as any);
      }
      if (rendererRef.current && ctn.contains(rendererRef.current.gl.canvas)) {
        ctn.removeChild(rendererRef.current.gl.canvas);
        rendererRef.current.gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
      rendererRef.current = null;
      programRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (programRef.current) {
      programRef.current.uniforms.uColor.value.set(...color);
      programRef.current.uniforms.uSpeed.value = speed;
      programRef.current.uniforms.uAmplitude.value = amplitude;
    }
  }, [color, speed, amplitude]);

  return <div ref={ctnDom} className="iridescence-container" {...rest} />;
}
