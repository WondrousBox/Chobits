import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Minimal 3D renderer using three.js that draws a rotating cube.
 * Purely UI: does not contain business logic. Dimensions are driven by props.
 */
export default function ThreeSprite({ width = 180, height = 240, onFirstFrame }: { width?: number; height?: number; onFirstFrame?: () => void }): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationRef = useRef<number | null>(null);
  const onFirstFrameRef = useRef(onFirstFrame);

  useEffect(() => {
    onFirstFrameRef.current = onFirstFrame;
  }, [onFirstFrame]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    // Transparent background for the canvas

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 3;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setClearColor(0x000000, 0); // fully transparent background
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    // ensure dom canvas is transparent as well
    try {
      renderer.domElement.style.background = 'transparent';
    } catch {
      // ignore unsupported style set
    }

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x66ccff });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    const light = new THREE.DirectionalLight(0xffffff, 1.0);
    light.position.set(2, 2, 5);
    scene.add(light);

    let firstFrameReported = false;
    const animate = (): void => {
      cube.rotation.x += 0.01;
      cube.rotation.y += 0.01;
      renderer.render(scene, camera);
      if (!firstFrameReported) {
        firstFrameReported = true;
        onFirstFrameRef.current?.();
      }
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = (): void => {
      const w = width;
      const h = height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      // remove canvas
      try {
        container.removeChild(renderer.domElement);
      } catch {
        // ignore if already removed
      }
    };
  }, [width, height]);

  return <div ref={containerRef} style={{ width, height, userSelect: 'none', background: 'transparent' }} />;
}
