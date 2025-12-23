"use client"

import { useRef, useState, useMemo } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls, Stars, Text } from "@react-three/drei"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown } from "lucide-react"
import { type Mesh, type ShaderMaterial, type MeshStandardMaterial, Vector3, BufferGeometry, type Group } from "three"

type ViewMode = "wireframe" | "solid"

// Custom shader for organic gradient
const vertexShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  
  void main() {
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vPosition;
  
  // Noise function
  vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }
  
  vec4 mod289(vec4 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }
  
  vec4 permute(vec4 x) {
    return mod289(((x*34.0)+1.0)*x);
  }
  
  vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
  }
  
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    
    i = mod289(i);
    vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
  
  void main() {
    vec2 uv = vUv;
    
    // Create flowing organic pattern
    float time = uTime * 0.3;
    
    // Multiple layers of noise for complexity
    float noise1 = snoise(vec3(uv * 3.0, time));
    float noise2 = snoise(vec3(uv * 6.0, time * 0.7));
    float noise3 = snoise(vec3(uv * 12.0, time * 0.5));
    
    // Combine noises for organic flow
    float pattern = noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2;
    
    // Add swirling motion
    vec2 swirl = vec2(
      sin(uv.y * 6.28 + time) * 0.1,
      cos(uv.x * 6.28 + time * 0.8) * 0.1
    );
    
    float finalPattern = pattern + length(swirl);
    
    // Define colors - teal to deep blue gradient
    vec3 tealColor = vec3(0.204,0.827,0.6); // emerald-400
    vec3 skyColor = vec3(1., 1., 1.);  // white
    vec3 deepBlue = vec3(0.008,0.518,0.78);  // sky-600
    
    // Create smooth gradient based on pattern
    float t = smoothstep(-0.5, 0.5, finalPattern);
    vec3 color = mix(deepBlue, mix(skyColor, tealColor, sin(finalPattern * 3.14 + time) * 0.5 + 0.5), t);
    
    // Add some brightness variation
    color *= 0.8 + 0.4 * smoothstep(-0.3, 0.3, finalPattern);
    
    gl_FragColor = vec4(color, 1.0);
  }
`

export default function Component() {
  const [speed, setSpeed] = useState([1.0])
  const [gravity, setGravity] = useState([1.0])
  const [isOpen, setIsOpen] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>("wireframe")

  return (
    <div className="w-full h-screen bg-gray-900 relative">
      <Canvas camera={{ position: [0, 5, 15], fov: 60 }}>
        <color attach="background" args={["#0a0a0a"]} />
        <ambientLight intensity={0.2} />
        <pointLight position={[10, 10, 10]} intensity={0.5} />
        <Stars radius={300} depth={60} count={20000} factor={7} saturation={0} fade />

        <EarthMoonSystem speed={speed[0]} gravity={gravity[0]} viewMode={viewMode} />

        <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} minDistance={5} maxDistance={50} />
      </Canvas>

      <div className="absolute top-4 left-4 z-10">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <div
            className={`w-96 p-6 border dark rounded-lg font-mono`}
            style={{
              backgroundColor: "rgba(21, 21, 21, 0.8)",
              borderColor: "#808080",
            }}
          >
            <CollapsibleTrigger className="flex items-center gap-3 w-full text-left hover:opacity-80 transition-opacity">
              <ChevronDown
                className={`h-5 w-5 text-white transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`}
              />
              <h1 className="text-xl text-white font-semibold">Earth-Moon System</h1>
            </CollapsibleTrigger>

            <CollapsibleContent className="mt-8">
              <div className="space-y-6">
                <div>
                  <label className="text-base font-normal text-white mb-3 block">View Mode</label>
                  <div className="flex gap-2">
                    <Button
                      variant={viewMode === "wireframe" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setViewMode("wireframe")}
                      className={`flex-1 text-sm ${viewMode === "wireframe" ? "!text-black" : "!text-white"}`}
                    >
                      Wireframe
                    </Button>
                    <Button
                      variant={viewMode === "solid" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setViewMode("solid")}
                      className={`flex-1 text-sm ${viewMode === "solid" ? "!text-black" : "!text-white"}`}
                    >
                      Solid
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-base font-normal text-white mb-3 block">
                    Orbital Speed {speed[0].toFixed(1)}x
                  </label>
                  <Slider
                    value={speed}
                    onValueChange={setSpeed}
                    max={5.0}
                    min={0.1}
                    step={0.1}
                    className="w-full dark:bg-gray-800"
                  />
                </div>

                <div>
                  <label className="text-base font-normal text-white mb-3 block">
                    Gravitational Pull {gravity[0].toFixed(1)}x
                  </label>
                  <Slider
                    value={gravity}
                    onValueChange={setGravity}
                    max={3.0}
                    min={0.1}
                    step={0.1}
                    className="w-full dark:bg-gray-800"
                  />
                </div>
              </div>

              <div className="mt-8 text-sm text-gray-300 space-y-1">
                <p>• Moon orbits 100x faster than real life</p>
                <p>• Speed controls orbital velocity</p>
                <p>• Gravity affects orbital radius</p>
                <p>• Use mouse to rotate, zoom, and pan</p>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </div>
    </div>
  )
}

function EarthMoonSystem({ speed, gravity, viewMode }: { speed: number; gravity: number; viewMode: ViewMode }) {
  return (
    <group>
      <Earth viewMode={viewMode} />
      <Moon speed={speed} gravity={gravity} viewMode={viewMode} />
      <OrbitPath gravity={gravity} />
    </group>
  )
}

function Earth({ viewMode }: { viewMode: ViewMode }) {
  const earthRef = useRef<Mesh>(null)
  const shaderMaterialRef = useRef<ShaderMaterial>(null)

  // Memoize the shader uniforms to prevent recreation
  const shaderUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
    }),
    [],
  )

  useFrame((state, delta) => {
    if (earthRef.current) {
      earthRef.current.rotation.y += delta * 0.1 // Slow Earth rotation
    }

    // Always update shader time uniform, regardless of viewMode
    if (shaderMaterialRef.current) {
      shaderMaterialRef.current.uniforms.uTime.value = state.clock.elapsedTime
    }
  })

  return (
    <mesh ref={earthRef} position={[0, 0, 0]}>
      <sphereGeometry args={[2, 64, 64]} />
      {viewMode === "wireframe" ? (
        <meshStandardMaterial color="#ffffff" wireframe={true} wireframeLinewidth={2} />
      ) : (
        <shaderMaterial
          ref={shaderMaterialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={shaderUniforms}
        />
      )}
      <Text position={[0, -3, 0]} fontSize={0.3} color="white" anchorX="center" anchorY="middle">
        Earth
      </Text>
    </mesh>
  )
}

function Moon({ speed, gravity, viewMode }: { speed: number; gravity: number; viewMode: ViewMode }) {
  const moonRef = useRef<Mesh>(null)
  const moonGroupRef = useRef<Group>(null)
  const moonMaterialRef = useRef<MeshStandardMaterial>(null)

  // Base orbital parameters
  const baseOrbitRadius = 8
  const baseOrbitSpeed = 2 // Base speed (already 100x faster than real life)

  // Calculate orbit radius based on gravity (higher gravity = closer orbit)
  const orbitRadius = baseOrbitRadius / Math.sqrt(gravity)

  useFrame((state, delta) => {
    if (moonGroupRef.current && moonRef.current) {
      // Calculate orbital speed based on speed slider
      const orbitalSpeed = baseOrbitSpeed * speed

      // Rotate the moon around Earth
      moonGroupRef.current.rotation.y += delta * orbitalSpeed

      // Rotate the moon on its own axis
      moonRef.current.rotation.y += delta * 0.5

      // Add shimmering effect for solid mode
      if (moonMaterialRef.current && viewMode === "solid") {
        moonMaterialRef.current.emissive.setHSL(0, 0, 0.3 + Math.sin(state.clock.elapsedTime * 3) * 0.2)
      }
    }
  })

  return (
    <group ref={moonGroupRef}>
      <mesh ref={moonRef} position={[orbitRadius, 0, 0]}>
        <sphereGeometry args={[0.5, 16, 16]} />
        {viewMode === "wireframe" ? (
          <meshStandardMaterial color="#ffffff" wireframe={true} wireframeLinewidth={2} />
        ) : (
          <meshStandardMaterial
            ref={moonMaterialRef}
            color="#ffffff"
            metalness={0.9}
            roughness={0.1}
            emissive="#ffffff"
            emissiveIntensity={0.8}
          />
        )}
        <Text position={[0, -1, 0]} fontSize={0.2} color="white" anchorX="center" anchorY="middle">
          Moon
        </Text>
      </mesh>
    </group>
  )
}

function OrbitPath({ gravity }: { gravity: number }) {
  const baseOrbitRadius = 8
  const orbitRadius = baseOrbitRadius / Math.sqrt(gravity)
  const points = []

  // Create circular orbit path
  for (let i = 0; i <= 64; i++) {
    const angle = (i / 64) * Math.PI * 2
    points.push(new Vector3(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius))
  }

  const geometry = new BufferGeometry().setFromPoints(points)

  return (
    <line geometry={geometry}>
      <lineBasicMaterial color="#ffffff" opacity={0.6} transparent />
    </line>
  )
}
