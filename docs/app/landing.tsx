'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';

export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    import('three')
      .then(
        ({
          Scene,
          OrthographicCamera,
          WebGLRenderer,
          ACESFilmicToneMapping,
          PointLight,
          AmbientLight,
          MeshPhongMaterial,
          FrontSide,
          Mesh,
          BufferGeometry,
          Float32BufferAttribute,
          Vector3,
        }) => {
          const canvas = canvasRef.current;
          const wrap = wrapRef.current;
          if (!canvas || !wrap) {
            return;
          }

          const scene = new Scene();
          const frustum = 7;
          let W = wrap.clientWidth;
          let H = wrap.clientHeight;
          let aspect = W / H;

          const camera = new OrthographicCamera(
            -frustum * aspect,
            frustum * aspect,
            frustum,
            -frustum,
            0.1,
            100,
          );

          const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
          renderer.setSize(W, H);
          renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
          renderer.setClearColor(0x000000, 0);
          renderer.toneMapping = ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.2;

          // Theme detection
          const isDark = () => document.documentElement.classList.contains('dark');
          let dark = isDark();

          // Invect palette colours
          const LIGHT_PRIMARY = 0x5b5bd6; // #5b5bd6
          const DARK_PRIMARY = 0x7b7bde; // #7b7bde
          const LIGHT_ACCENT = 0x8b8be8; // lighter indigo for fill light
          const DARK_ACCENT = 0x9b9bf0; // brighter indigo for fill in dark

          // Dramatic lighting — strong coloured keys, faint ambient
          const light1 = new PointLight(dark ? DARK_PRIMARY : LIGHT_PRIMARY, 160, 40, 2);
          const light2 = new PointLight(dark ? DARK_ACCENT : LIGHT_ACCENT, 90, 40, 2);
          const rimLight = new PointLight(dark ? 0xc4b5fd : 0x8b8be8, 60, 40, 2);
          const topLight = new PointLight(dark ? DARK_ACCENT : LIGHT_ACCENT, 50, 30, 2);
          topLight.position.set(0, 12, 0);
          const ambient = new AmbientLight(dark ? 0x2a2a4a : 0xddddf0, dark ? 0.08 : 0.18);
          const lightRadius = 8;
          let lightAngle = 0;
          const lightY = 6;
          scene.add(light1, light2, rimLight, topLight, ambient);

          // Watch for theme changes
          const themeObserver = new MutationObserver(() => {
            const nowDark = isDark();
            if (nowDark === dark) {
              return;
            }
            dark = nowDark;
            light1.color.setHex(dark ? DARK_PRIMARY : LIGHT_PRIMARY);
            light2.color.setHex(dark ? DARK_ACCENT : LIGHT_ACCENT);
            rimLight.color.setHex(dark ? 0xc4b5fd : 0x8b8be8);
            topLight.color.setHex(dark ? DARK_ACCENT : LIGHT_ACCENT);
            ambient.color.setHex(dark ? 0x2a2a4a : 0xddddf0);
            ambient.intensity = dark ? 0.08 : 0.18;
            mat.color.setHex(dark ? 0xe8e8f8 : 0xffffff);
            mat.shininess = dark ? 100 : 80;
            mat.specular.setHex(dark ? 0x4444aa : 0x333366);
          });
          themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class'],
          });

          const s = 1.5,
            h = 6;
          const twistAngle = -Math.PI / 4;

          const bottomVertsBase: number[][] = [
            [-s, -h, s],
            [s, -h, s],
            [s, -h, -s],
            [-s, -h, -s],
          ];
          const topVertsBase: number[][] = [
            [-s, h, s],
            [s, h, s],
            [s, h, -s],
            [-s, h, -s],
          ];

          const topVerts = topVertsBase.map(([x, y, z]) => [
            Math.cos(twistAngle) * x - Math.sin(twistAngle) * z,
            y,
            Math.sin(twistAngle) * x + Math.cos(twistAngle) * z,
          ]);
          const bottomVerts = bottomVertsBase.map(([x, y, z]) => [
            Math.cos(-twistAngle) * x - Math.sin(-twistAngle) * z,
            y,
            Math.sin(-twistAngle) * x + Math.cos(-twistAngle) * z,
          ]);

          function buildGeometry(bv: number[][], tv: number[][], positive: boolean) {
            const all = [
              ...bv.map((v) => new Vector3(...(v as [number, number, number]))),
              ...tv.map((v) => new Vector3(...(v as [number, number, number]))),
            ];
            const faces: number[][] = [
              [0, 2, 1],
              [0, 3, 2],
              [4, 5, 6],
              [4, 6, 7],
            ];
            const sides = [
              [0, 1, 5, 4],
              [2, 3, 7, 6],
              [1, 2, 6, 5],
              [3, 0, 4, 7],
            ];
            for (const [a, b, c, d] of sides) {
              if (positive) {
                faces.push([a, b, d], [b, c, d]);
              } else {
                faces.push([a, b, c], [a, c, d]);
              }
            }
            const positions: number[] = [];
            for (const tri of faces) {
              for (const idx of tri) {
                positions.push(all[idx].x, all[idx].y, all[idx].z);
              }
            }
            const geo = new BufferGeometry();
            geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
            geo.computeVertexNormals();
            return geo;
          }

          const mat = new MeshPhongMaterial({
            color: dark ? 0xe8e8f8 : 0xffffff,
            shininess: dark ? 100 : 80,
            specular: dark ? 0x4444aa : 0x333366,
            side: FrontSide,
          });

          const mesh = new Mesh(buildGeometry(bottomVerts, topVerts, twistAngle >= 0), mat);
          scene.add(mesh);

          const baseDist = 12,
            baseRotX = Math.PI / 12,
            baseRotY = Math.PI / 2;
          let mouseX = 0,
            mouseY = 0,
            scrollYVal = 0;
          let tiltX = 0,
            tiltY = 0;
          let smoothMX = 0,
            smoothMY = 0,
            smoothTX = 0,
            smoothTY = 0;
          const isMobile = /Mobi|Android/i.test(navigator.userAgent);

          const onMouse = (e: MouseEvent) => {
            mouseX = (e.clientX / window.innerWidth) * 2 - 1;
            mouseY = (e.clientY / window.innerHeight) * 2 - 1;
          };
          const onScroll = () => {
            scrollYVal = window.pageYOffset || document.documentElement.scrollTop;
          };
          const onOrientation = (e: DeviceOrientationEvent) => {
            if (e.gamma !== null) {
              tiltX = Math.max(-1, Math.min(1, e.gamma / 30));
            }
            if (e.beta !== null) {
              tiltY = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
            }
          };

          if (!isMobile) {
            window.addEventListener('mousemove', onMouse);
          }
          window.addEventListener('scroll', onScroll);
          if (isMobile && window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', onOrientation);
          }

          function lerp(a: number, b: number, t: number) {
            return a + (b - a) * t;
          }

          let rafId: number;
          function animate(time: number) {
            rafId = requestAnimationFrame(animate);
            const t = time * 0.001;
            const lerpSpeed = 0.04;
            if (isMobile) {
              smoothTX = lerp(smoothTX, tiltX, lerpSpeed);
              smoothTY = lerp(smoothTY, tiltY, lerpSpeed);
            } else {
              smoothMX = lerp(smoothMX, mouseX, lerpSpeed);
              smoothMY = lerp(smoothMY, mouseY, lerpSpeed);
            }

            const idleDriftX = Math.sin(t * 0.3) * 0.04;
            const idleDriftY = Math.cos(t * 0.2) * 0.06;
            const inputX = isMobile ? smoothTX : smoothMX;
            const inputY = isMobile ? smoothTY : smoothMY;
            const scrollOffset = scrollYVal * 0.0003;

            const rotX = baseRotX + inputY * 0.15 + idleDriftX + scrollOffset;
            const rotY = baseRotY + inputX * 0.2 + idleDriftY;

            camera.position.set(
              baseDist * Math.cos(rotX) * Math.sin(rotY),
              baseDist * Math.sin(rotX),
              baseDist * Math.cos(rotX) * Math.cos(rotY),
            );
            camera.lookAt(0, 0, 0);
            camera.updateMatrixWorld();

            lightAngle += 0.003;
            light1.position.set(
              lightRadius * Math.cos(lightAngle),
              lightY,
              lightRadius * Math.sin(lightAngle),
            );
            light2.position.set(
              lightRadius * Math.cos(lightAngle + Math.PI),
              lightY * 0.8,
              lightRadius * Math.sin(lightAngle + Math.PI),
            );
            rimLight.position.set(
              lightRadius * Math.sin(lightAngle * 0.7),
              -lightY * 0.6,
              lightRadius * Math.cos(lightAngle * 0.7),
            );

            mesh.rotation.y = Math.sin(t * 0.5) * 0.2;
            renderer.render(scene, camera);
          }
          animate(0);

          const ro = new ResizeObserver(() => {
            W = wrap.clientWidth;
            H = wrap.clientHeight;
            aspect = W / H;
            camera.left = -frustum * aspect;
            camera.right = frustum * aspect;
            camera.top = frustum;
            camera.bottom = -frustum;
            camera.updateProjectionMatrix();
            renderer.setSize(W, H);
          });
          ro.observe(wrap);

          cleanup = () => {
            cancelAnimationFrame(rafId);
            ro.disconnect();
            themeObserver.disconnect();
            window.removeEventListener('mousemove', onMouse);
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('deviceorientation', onOrientation);
            renderer.dispose();
          };
        },
      )
      .catch(() => {});

    return () => cleanup?.();
  }, []);

  return (
    <>
      <style>{landingStyles}</style>
      <div className="landing">
        {/* Nav */}
        <nav>
          <div className="container">
            <a href="#" className="logo">
              invect
            </a>
            <ul className="nav-links">
              <li>
                <a href="#features">Features</a>
              </li>
              <li>
                <Link href="/docs/quickstart">Quickstart</Link>
              </li>
              <li>
                <Link href="/docs">Docs</Link>
              </li>
              <li>
                <Link href="/demo">Demo</Link>
              </li>
              <li>
                <a href="https://github.com/robase/invect" className="btn-nav">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </nav>

        {/* Hero */}
        <section className="hero">
          <div className="container">
            <div className="hero-canvas-wrap" ref={wrapRef}>
              <canvas ref={canvasRef} id="hero-canvas" />
              <div className="hero-overlay" />
            </div>
            <div className="hero-text">
              <div className="badge">
                <span className="dot" />
                Open Source · MIT Licensed
              </div>
              <h1>
                Drop-in AI workflows
                <br />
                for your{' '}
                <span className="hero-scroller">
                  <span className="hero-scroller-inner">
                    <span>Node</span>
                    <span>Next</span>
                    <span>Bun</span>
                    <span>Deno</span>
                    <span>Nest</span>
                    <span>Node</span>
                  </span>
                </span>{' '}
                app
              </h1>
              <p>Build on a canvas. Ship as code. Same workflow, same engine.</p>
              <div
                className="install-bar"
                onClick={(e) => {
                  navigator.clipboard.writeText('npx invect-cli init');
                  const el = (e.currentTarget as HTMLElement).querySelector('.copy-label');
                  if (el) {
                    el.textContent = 'Copied!';
                    setTimeout(() => {
                      el.textContent = 'Copy';
                    }, 1500);
                  }
                }}
              >
                <code>
                  <span className="install-muted">$</span> <span className="install-cmd">npx</span>{' '}
                  <span className="install-pkg">invect-cli</span> init
                </code>
                <span className="copy-label copy-icon">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copy</span>
                </span>
              </div>
              <div className="hero-actions">
                <Link href="/docs/quickstart" className="btn-primary">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                  </svg>
                  Get Started
                </Link>
                <a href="https://github.com/robase/invect" className="btn-secondary">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  GitHub
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Flow screenshot */}
        <section className="screenshot-section">
          <div className="container">
            <p className="section-label">Visual Workflow Editor</p>
            <h2 className="section-title">Build complex workflows visually</h2>
            <p className="section-desc">
              Connect AI agents, API integrations, and conditional logic into production-ready
              pipelines — all from a drag-and-drop canvas.
            </p>
            <div className="screenshot-wrap">
              <img
                src="/flow-screenshot.png"
                alt="Invect flow editor showing a Linear ticket triage workflow with AI agent, switch routing, and integrations"
                className="screenshot-img"
              />
            </div>
          </div>
        </section>

        {/* Why Invect */}
        <section className="why-section" id="features">
          <div className="container">
            <p className="section-label">Why Invect</p>
            <h2 className="section-title">
              An open-source workflow engine that lives inside your app, not next to&nbsp;it
            </h2>
            <div className="why-grid">
              <div className="why-item">
                <div className="why-item-text">
                  <h3>It&apos;s a library, not a platform</h3>
                  <p>
                    You <code>npm install</code> it into your Express, NestJS, or Next.js app. It
                    uses your database, your auth, your deployment pipeline. No separate server to
                    maintain, no vendor lock-in, no &quot;outgrowing&quot; the&nbsp;tool.
                  </p>
                  <ul>
                    <li>Mount alongside your existing routes — same server, same&nbsp;database</li>
                    <li>Scale horizontally the same way you scale the rest of your&nbsp;app</li>
                    <li>No per-execution pricing — it&apos;s a library, not a&nbsp;service</li>
                  </ul>
                  <Link href="/docs/installation" className="why-link">
                    See integration guides →
                  </Link>
                </div>
                <div className="why-code">
                  <div className="code-header">
                    <span className="code-dot red" />
                    <span className="code-dot yellow" />
                    <span className="code-dot green" />
                    <span>your-app.ts</span>
                  </div>
                  <pre
                    dangerouslySetInnerHTML={{
                      __html: `<span class="comment">// Your existing Express app</span>
<span class="keyword">import</span> { <span class="type">createInvectRouter</span> } <span class="keyword">from</span> <span class="string">'@invect/express'</span>;

<span class="comment">// Mount alongside your existing routes</span>
app.<span class="func">use</span>(<span class="string">'/api'</span>, yourRouter);
app.<span class="func">use</span>(<span class="string">'/workflows'</span>, <span class="keyword">await</span> <span class="func">createInvectRouter</span>({
  <span class="type">encryptionKey</span>: process.env.<span class="type">INVECT_ENCRYPTION_KEY</span>,
  <span class="type">database</span>: {
    <span class="type">type</span>: <span class="string">'sqlite'</span>,
    <span class="type">connectionString</span>: process.env.<span class="type">DATABASE_URL</span>,
  },
}));

<span class="comment">// That's it. Same server, same database,</span>
<span class="comment">// same deployment.</span>`,
                    }}
                  />
                </div>
              </div>

              <div className="why-item">
                <div className="why-item-text">
                  <h3>Not another LangChain wrapper</h3>
                  <p>
                    Invect has a custom-built execution engine from the ground up. Topological sort
                    determines node order. If/else branches auto-prune unreachable subgraphs — no
                    wasted API calls. It&apos;s an orchestration runtime, not a thin layer over
                    library &nbsp;abstractions.
                  </p>
                  <ul>
                    <li>
                      Smart branching — inactive paths and their downstream nodes are&nbsp;skipped
                    </li>
                    <li>
                      Upstream outputs auto-aggregated by node name into downstream&nbsp;inputs
                    </li>
                    <li>
                      Full JavaScript expressions in config params via QuickJS WASM&nbsp;sandbox
                    </li>
                  </ul>
                  <Link href="/docs/execution-model" className="why-link">
                    Learn about the execution model →
                  </Link>
                </div>
                <div className="why-visual">
                  <div className="visual-label">Incoming data for each node</div>
                  <div className="merge-entries">
                    <div className="merge-entry">
                      <span className="merge-key">fetch_users</span>
                      <span className="merge-val">{`[{ id: 1, name: "Alice" }]`}</span>
                    </div>
                    <div className="merge-entry">
                      <span className="merge-key">get_config</span>
                      <span className="merge-val">{`{ env: "prod" }`}</span>
                    </div>
                    <div className="merge-entry">
                      <span className="merge-key">api_response</span>
                      <span className="merge-val">{`{ status: 200 }`}</span>
                    </div>
                  </div>
                  <div className="visual-divider" />
                  <div className="visual-sublabel">Full JS in any config field</div>
                  <div className="merge-template">
                    <code>{`Process {{ fetch_users.filter(u => u.active).length }} users in {{ get_config.env }}`}</code>
                  </div>
                </div>
              </div>

              <div className="why-item">
                <div className="why-item-text">
                  <h3>Native batch processing</h3>
                  <p>
                    Flows automatically pause for OpenAI and Anthropic batch jobs, then resume when
                    results arrive. Batch APIs are 50% cheaper — and no other flow builder handles
                    this&nbsp;natively.
                  </p>
                  <ul>
                    <li>
                      <code>PAUSED_FOR_BATCH</code> is a first-class execution&nbsp;state
                    </li>
                    <li>Background polling handles the full batch lifecycle&nbsp;automatically</li>
                    <li>No custom polling infrastructure or webhooks&nbsp;required</li>
                  </ul>
                  <Link href="/docs/execution-model" className="why-link">
                    Learn about batch processing →
                  </Link>
                </div>
                <div className="why-visual">
                  <div className="timeline">
                    <div className="timeline-step is-done">
                      <svg
                        className="tl-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Fetch data</span>
                    </div>
                    <div className="timeline-step is-done">
                      <svg
                        className="tl-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Transform inputs</span>
                    </div>
                    <div className="timeline-step is-paused">
                      <svg className="tl-icon" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                      </svg>
                      <div>
                        <span>AI Model</span>
                        <div className="tl-detail">
                          <span>→ batch submitted, flow pauses</span>
                          <span>→ polling checks batch status</span>
                          <span>→ completes after ~20 min</span>
                          <span>→ flow resumes automatically</span>
                        </div>
                      </div>
                    </div>
                    <div className="timeline-step is-done">
                      <svg
                        className="tl-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Process results</span>
                    </div>
                    <div className="timeline-step is-done">
                      <svg
                        className="tl-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Send notification</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="why-item">
                <div className="why-item-text">
                  <h3>Version-pinned execution</h3>
                  <p>
                    Every flow save creates an immutable version. Pin production to version 5 while
                    you iterate on version 6. Webhooks and crons bind to the version they were
                    created with — editing the latest version can&apos;t break&nbsp;prod.
                  </p>
                  <ul>
                    <li>Run any historical version on&nbsp;demand</li>
                    <li>Roll back instantly if something goes&nbsp;wrong</li>
                    <li>Full audit trail of every flow&nbsp;change</li>
                  </ul>
                  <Link href="/docs/plugins/version-control" className="why-link">
                    Learn about flow versioning →
                  </Link>
                </div>
                <div className="why-code">
                  <div className="code-header">
                    <span className="code-dot red" />
                    <span className="code-dot yellow" />
                    <span className="code-dot green" />
                    <span>consumer.ts</span>
                  </div>
                  <pre
                    dangerouslySetInnerHTML={{
                      __html: `<span class="keyword">import</span> { <span class="type">createInvect</span> } <span class="keyword">from</span> <span class="string">'@invect/core'</span>;

<span class="keyword">const</span> invect = <span class="keyword">await</span> <span class="func">createInvect</span>({
  <span class="type">encryptionKey</span>: process.env.<span class="type">INVECT_ENCRYPTION_KEY</span>,
  <span class="type">database</span>: {
    <span class="type">type</span>: <span class="string">'postgresql'</span>,
    <span class="type">connectionString</span>: process.env.<span class="type">DATABASE_URL</span>,
  },
});

<span class="comment">// Run the tested, pinned version in prod</span>
<span class="keyword">const</span> result = <span class="keyword">await</span> invect.runs.<span class="func">start</span>(
  flowId,
  { order },
  { <span class="type">version</span>: <span class="string">5</span> }  <span class="comment">// immutable — always the same</span>
);

<span class="comment">// Meanwhile, iterate freely on version 6</span>
<span class="comment">// in the visual editor. Prod is unaffected.</span>`,
                    }}
                  />
                </div>
              </div>

              <div className="why-item">
                <div className="why-item-text">
                  <h3>Deploy anywhere</h3>
                  <p>
                    SQLite for local dev, PostgreSQL for production, serverless on Vercel, Docker
                    on-prem. Not vendor-locked — run in air-gapped networks with zero
                    external&nbsp;dependencies.
                  </p>
                  <ul>
                    <li>
                      Extend without forking — plugins add DB tables, auth, RBAC, and
                      API&nbsp;routes
                    </li>
                    <li>
                      Call <code>core.startFlowRun()</code> from queue workers, cron jobs, or
                      CLI&nbsp;scripts
                    </li>
                    <li>Test workflows in CI with in-memory SQLite — no Docker&nbsp;required</li>
                  </ul>
                </div>
                <div className="why-visual">
                  <div className="compare-group">
                    <div className="compare-label">Hosted platforms</div>
                    <div className="compare-row">
                      <span>Zapier</span>
                      <span className="compare-cost">$0.01–0.05 / task</span>
                    </div>
                    <div className="compare-row">
                      <span>Make</span>
                      <span className="compare-cost">metered ops</span>
                    </div>
                    <div className="compare-row">
                      <span>Inngest</span>
                      <span className="compare-cost">per-execution pricing</span>
                    </div>
                  </div>
                  <div className="compare-group">
                    <div className="compare-label">Self-hosted alternatives</div>
                    <div className="compare-row">
                      <span>n8n</span>
                      <span className="compare-cost">separate Docker service</span>
                    </div>
                    <div className="compare-row">
                      <span>Temporal</span>
                      <span className="compare-cost">cluster + workers + DB</span>
                    </div>
                    <div className="compare-row">
                      <span>Windmill</span>
                      <span className="compare-cost">dedicated server</span>
                    </div>
                  </div>
                  <div className="compare-group is-invect">
                    <div className="compare-label">Invect</div>
                    <div className="compare-invect">
                      <code>npm install @invect/core</code>
                      <p>
                        Runs in your app. Uses your database. Costs nothing beyond your
                        existing&nbsp;infra.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Frameworks */}
        <section className="frameworks">
          <div className="container">
            <p className="section-label">Integrations</p>
            <h2 className="section-title">Works with your stack</h2>
            <div className="framework-logos">
              <Link href="/docs/installation#express" className="framework-item">
                <div className="framework-icon">
                  <svg width="24" height="24" viewBox="0 0 128 128" fill="none">
                    <path
                      d="M126.67 98.44c-4.56 1.16-7.38.05-9.91-3.75-5.68-8.51-11.95-16.63-18-24.9-.78-1.07-1.59-2.12-2.6-3.45C89 76 81.85 85.2 75.14 94.77c-2.4 3.42-4.92 4.91-9.22 3.71l26.5-37.1-24.8-33.41c4.14-.63 7.17-.2 9.65 3.54 5.87 8.86 12.16 17.43 18.59 26.5 6.56-9.15 12.8-17.73 18.7-26.55 2.38-3.56 5.05-4.36 9.19-3.56L98.36 61.2l27.04 37.23h1.27zM1.33 61.74c.72-3.61 1.2-7.29 2.2-10.83 6-21.43 30.6-30.34 47.5-17.06C60.93 41.64 63.39 52.62 62.9 65H7.1c-.84 22.21 15.15 35.62 35.53 28.78 7.15-2.4 11.36-8 13.47-15 1.07-3.51 2.84-4.06 6.14-3.06-1.69 8.76-5.52 16.08-13.52 20.66-12 6.86-29.13 5.04-38.28-4.1C3.32 85.36.63 77.15.07 67.97c-.04-.72-.05-1.45-.07-2.18 0-1.35 0-2.71 0-4.05h1.33zm5.77-3.91h50.49C56.98 40.18 43.87 30.05 30.2 32.3c-12.72 2.1-21.3 12.58-23.1 25.53z"
                      fill="#a1a1aa"
                    />
                  </svg>
                </div>
                Express
              </Link>
              <Link href="/docs/installation#nestjs" className="framework-item">
                <div className="framework-icon">
                  <svg width="24" height="24" viewBox="0 0 128 128" fill="none">
                    <path
                      d="M64 0C28.65 0 0 28.65 0 64s28.65 64 64 64 64-28.65 64-64S99.35 0 64 0zm0 119c-7.85 0-14.85-3.69-19.34-9.43l19.34-46.01 19.34 46.01C78.85 115.31 71.85 119 64 119zm23.24-14.01L64 50.51l-23.24 54.48C30.28 97.75 23 82.2 23 64c0-22.63 18.37-41 41-41s41 18.37 41 41c0 18.2-7.28 33.75-17.76 40.99z"
                      fill="#a1a1aa"
                    />
                  </svg>
                </div>
                NestJS
              </Link>
              <Link href="/docs/installation#nextjs" className="framework-item">
                <div className="framework-icon">
                  <svg width="24" height="24" viewBox="0 0 128 128" fill="none">
                    <path
                      d="M64 0C28.7 0 0 28.7 0 64s28.7 64 64 64c11.2 0 21.7-2.9 30.8-7.9L48.4 55.3v36.6h-6.8V41.8h6.8l50.5 75.8C116.4 106.2 128 86.5 128 64c0-35.3-28.7-64-64-64zm22.1 84.6l-7.5-11.3V41.8h7.5v42.8z"
                      fill="#a1a1aa"
                    />
                  </svg>
                </div>
                Next.js
              </Link>
              <div className="framework-item">
                <div className="framework-icon">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#a1a1aa"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </div>
                React
              </div>
              <Link href="/docs/reference/database-schema" className="framework-item">
                <div className="framework-icon">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#a1a1aa"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <ellipse cx="12" cy="5" rx="9" ry="3" />
                    <path d="M3 5V19A9 3 0 0 0 21 19V5" />
                    <path d="M3 12A9 3 0 0 0 21 12" />
                  </svg>
                </div>
                SQLite / PG / MySQL
              </Link>
              <div className="framework-item">
                <div className="framework-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 2L2 19.5h20L12 2z"
                      fill="none"
                      stroke="#a1a1aa"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                    <path d="M12 2v17.5" stroke="#a1a1aa" strokeWidth="1.5" />
                    <path d="M12 19.5L2 19.5" stroke="#a1a1aa" strokeWidth="1.5" />
                  </svg>
                </div>
                Drizzle
              </div>
              <div className="framework-item">
                <div className="framework-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M21.8 13.1C21.93 12.42 22 11.72 22 11c0-5.52-4.48-10-10-10S2 5.48 2 11c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3l-.5 3H13v5.95c5.05-.5 9-4.76 9-9.85 0-.35-.02-.7-.05-1.05"
                      fill="#a1a1aa"
                    />
                  </svg>
                </div>
                Prisma
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="cta">
          <div className="container">
            <div className="cta-box">
              <h2>Start building workflows today</h2>
              <p>Invect is free, open-source. Add it to your project in&nbsp;minutes.</p>
              <div className="cta-buttons">
                <Link href="/docs/quickstart" className="btn-primary">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                  </svg>
                  Read the Docs
                </Link>
                <a href="https://github.com/robase/invect" className="btn-secondary">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                  </svg>
                  Star on GitHub
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer>
          <div className="container">
            <p>© 2026 Invect · MIT License</p>
            <ul className="footer-links">
              <li>
                <Link href="/docs">Documentation</Link>
              </li>
              <li>
                <a href="https://github.com/robase/invect">GitHub</a>
              </li>
              <li>
                <a href="https://www.npmjs.com/search?q=%40invect">npm</a>
              </li>
            </ul>
          </div>
        </footer>
      </div>
    </>
  );
}

const landingStyles = `
  .landing {
    font-family: var(--font-sans);
    background: var(--background);
    color: var(--foreground);
    line-height: 1.6;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
    --bg: var(--background);
    --bg-subtle: var(--muted);
    --bg-card: var(--card);
    --border: var(--border);
    --text: var(--foreground);
    --text-muted: var(--muted-foreground);
    --accent: var(--primary);
    --accent-bright: color-mix(in srgb, var(--primary) 72%, white);
    --accent-glow: color-mix(in srgb, var(--primary) 16%, transparent);
    --radius: var(--radius-lg);
  }
  .landing *, .landing *::before, .landing *::after { margin: 0; padding: 0; box-sizing: border-box; }
  .landing .container { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
  .landing a { color: inherit; }
  .landing code, .landing pre, .landing kbd, .landing samp { font-family: var(--font-mono); }

  /* Nav */
  .landing nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; padding: 16px 0; background: color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter: blur(16px); border-bottom: 1px solid var(--border); }
  .landing nav .container { display: flex; align-items: center; justify-content: space-between; }
  .landing .logo { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: var(--text); text-decoration: none; }
  .landing .logo span { color: var(--accent); }
  .landing .nav-links { display: flex; align-items: center; gap: 32px; list-style: none; }
  .landing .nav-links a { color: var(--text-muted); text-decoration: none; font-size: 14px; font-weight: 500; transition: color 0.2s; }
  .landing .nav-links a:hover { color: var(--text); }
  .landing .nav-links .btn-nav { display: inline-flex; align-items: center; gap: 6px; background: transparent; color: var(--text); padding: 8px 18px; border: 1px solid var(--border); border-radius: var(--radius); font-weight: 500; transition: border-color 0.2s, background 0.2s; }
  .landing .nav-links .btn-nav:hover { background: var(--bg-subtle); border-color: var(--text-muted); }

  /* Hero */
  .landing .hero { padding: 140px 0 100px; position: relative; min-height: 100vh; }
  .landing .hero::before { content: ''; position: absolute; top: -10%; left: -5%; width: 55%; height: 90%; background: radial-gradient(ellipse at center, var(--accent-glow) 0%, transparent 70%); pointer-events: none; z-index: 0; }
  .landing .hero > .container { display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 0; position: relative; z-index: 2; min-height: calc(100vh - 240px); }
  .landing .hero-canvas-wrap { position: relative; width: 100%; height: 100%; min-height: 500px; }
  .landing #hero-canvas { display: block; width: 100%; height: 100%; }
  .landing .hero-text { text-align: left; }
  .landing .hero-overlay { display: none; }

  .landing .badge { display: inline-flex; align-items: center; gap: 8px; background: var(--bg-subtle); border: 1px solid var(--border); padding: 6px 16px; border-radius: 999px; font-size: 12px; color: var(--text-muted); margin-bottom: 24px; }
  .landing .dot { width: 6px; height: 6px; background: var(--accent); border-radius: 50%; }

  .landing .hero h1 { font-size: clamp(36px, 5vw, 56px); font-weight: 800; line-height: 1.1; letter-spacing: -1.5px; margin-bottom: 20px; }
  .landing .hero h1 span.hero-scroller { display: inline-block; vertical-align: bottom; height: 1.1em; overflow: hidden; position: relative; }
  .landing .hero h1 .hero-scroller-inner { display: flex; flex-direction: column; animation: scroll-words 8s ease-in-out infinite; }
  .landing .hero h1 .hero-scroller-inner span { display: block; height: 1.1em; line-height: 1.1; color: var(--accent-bright); }
  @keyframes scroll-words { 0%,16% { transform: translateY(0); } 20%,36% { transform: translateY(-1.1em); } 40%,56% { transform: translateY(-2.2em); } 60%,76% { transform: translateY(-3.3em); } 80%,96% { transform: translateY(-4.4em); } 100% { transform: translateY(-5.5em); } }

  .landing .hero p { font-size: 16px; color: var(--text-muted); max-width: 480px; margin-bottom: 32px; line-height: 1.7; }
  .landing .hero-actions { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }

  .landing .btn-primary { display: inline-flex; align-items: center; gap: 8px; background: var(--text); color: var(--bg); padding: 12px 24px; border-radius: var(--radius); font-weight: 600; font-size: 14px; text-decoration: none; transition: opacity 0.2s; border: none; cursor: pointer; font-family: inherit; }
  .landing .btn-primary:hover { opacity: 0.85; }
  .landing .btn-secondary { display: inline-flex; align-items: center; gap: 8px; background: transparent; color: var(--text); padding: 12px 24px; border: 1px solid var(--border); border-radius: var(--radius); font-weight: 500; font-size: 14px; text-decoration: none; transition: background 0.2s, border-color 0.2s; font-family: inherit; cursor: pointer; }
  .landing .btn-secondary:hover { background: var(--bg-subtle); border-color: var(--accent); }

  .landing .install-bar { display: inline-flex; align-items: center; gap: 16px; background: var(--bg-subtle); border: 1px solid var(--border); padding: 14px 24px; font-size: 16px; color: var(--text-muted); cursor: pointer; transition: border-color 0.2s, background 0.2s; border-radius: var(--radius); margin-bottom: 24px; font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', ui-monospace, monospace; }
  .landing .install-bar:hover { border-color: var(--accent); background: color-mix(in srgb, var(--bg-subtle) 80%, var(--accent) 8%); }
  .landing .install-bar code { color: var(--text); font-family: inherit; font-size: inherit; }
  .landing .install-bar .install-muted { color: var(--text-muted); opacity: 0.5; }
  .landing .install-bar .install-cmd { color: var(--accent); }
  .landing .install-bar .install-pkg { color: #e879a8; }
  :root.dark .landing .install-bar .install-pkg { color: #f0abcb; }
  .landing .install-bar .copy-icon { display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-sans, system-ui, sans-serif); font-size: 13px; color: var(--text-muted); opacity: 0.7; transition: opacity 0.2s; }
  .landing .install-bar:hover .copy-icon { opacity: 1; }

  /* Section common */
  .landing .section-label { font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: var(--accent); margin-bottom: 12px; }
  .landing .section-title { font-size: clamp(28px, 4vw, 40px); font-weight: 800; letter-spacing: -1px; margin-bottom: 16px; }
  .landing .section-desc { font-size: 15px; color: var(--text-muted); max-width: 560px; margin-bottom: 48px; line-height: 1.7; }

  /* Features */
  .landing .features { padding: 100px 0; border-top: 1px solid var(--border); }

  /* Screenshot */
  .landing .screenshot-section { padding: 100px 0; border-top: 1px solid var(--border); }
  .landing .screenshot-wrap { border-radius: 12px; overflow: hidden; border: 1px solid var(--border); background: var(--bg-subtle); }
  .landing .screenshot-img { width: 100%; height: auto; display: block; }


  .landing .features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .landing .feature-card { background: var(--bg-card); border: 1px solid var(--border); padding: 32px 28px; transition: border-color 0.2s, transform 0.2s; text-decoration: none; color: inherit; display: block; border-radius: var(--radius); }
  .landing .feature-card:hover { border-color: var(--accent); transform: translateY(-2px); }
  .landing .feature-icon { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 20px; margin-bottom: 16px; background: var(--bg-subtle); border: 1px solid var(--border); }
  .landing .feature-card h3 { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
  .landing .feature-card p { font-size: 13px; color: var(--text-muted); line-height: 1.6; }

  /* Code section */
  .landing .code-section { padding: 100px 0; border-top: 1px solid var(--border); }
  .landing .code-section > .container { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: start; }
  .landing .code-block { background: var(--bg-subtle); border: 1px solid var(--border); overflow: hidden; }
  .landing .code-header { display: flex; align-items: center; gap: 6px; padding: 10px 16px; border-bottom: 1px solid var(--border); font-size: 12px; color: var(--text-muted); }
  .landing .code-dot { width: 10px; height: 10px; border-radius: 50%; }
  .landing .code-dot.red { background: #3a3a3a; }
  .landing .code-dot.yellow { background: #3a3a3a; }
  .landing .code-dot.green { background: #3a3a3a; }
  .landing .code-block pre { padding: 20px; font-size: 14px; line-height: 1.7; overflow-x: auto; white-space: pre; }
  .landing .code-block .keyword { color: #d6a4f1; }
  .landing .code-block .string { color: #98e087; }
  .landing .code-block .type { color: #f0c96e; }
  .landing .code-block .func { color: #6dc0ff; }
  .landing .code-block .comment { color: #5c5c5c; font-style: italic; }

  /* Why section */
  .landing .why-section { padding: 100px 0; border-top: 1px solid var(--border); }
  .landing .why-grid { display: flex; flex-direction: column; gap: 64px; margin-top: 48px; }
  .landing .why-item { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: start; }
  .landing .why-item:nth-child(even) { direction: rtl; }
  .landing .why-item:nth-child(even) > * { direction: ltr; }
  .landing .why-item-text h3 { font-size: 22px; font-weight: 700; margin-bottom: 12px; }
  .landing .why-item-text p { font-size: 14px; color: var(--text-muted); line-height: 1.7; margin-bottom: 16px; }
  .landing .why-item-text ul { list-style: none; padding: 0; }
  .landing .why-item-text li { font-size: 13px; color: var(--text-muted); padding: 6px 0; padding-left: 20px; position: relative; line-height: 1.6; }
  .landing .why-item-text li::before { content: '→'; position: absolute; left: 0; color: var(--accent); }
  .landing .why-item-text code { background: var(--bg-subtle); padding: 2px 6px; font-size: 12px; border: 1px solid var(--border); }
  .landing .why-link { display: inline-block; margin-top: 12px; font-size: 13px; color: var(--text); text-decoration: none; font-weight: 500; transition: color 0.2s; }
  .landing .why-link:hover { color: var(--accent-bright); }
  .landing .why-code { background: var(--bg-subtle); border: 1px solid var(--border); overflow: hidden; }
  .landing .why-code .code-header { display: flex; align-items: center; gap: 6px; padding: 10px 16px; border-bottom: 1px solid var(--border); font-size: 12px; color: var(--text-muted); }
  .landing .why-code pre { padding: 20px; font-size: 13px; line-height: 1.7; overflow-x: auto; white-space: pre; }
  .landing .why-code .keyword { color: #d6a4f1; }
  .landing .why-code .string { color: #98e087; }
  .landing .why-code .type { color: #f0c96e; }
  .landing .why-code .func { color: #6dc0ff; }
  .landing .why-code .comment { color: #5c5c5c; font-style: italic; }

  /* Visual cards (non-code why-item panels) */
  .landing .why-visual { background: var(--bg-subtle); border: 1px solid var(--border); border-radius: 8px; padding: 28px; }
  .landing .visual-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text-muted); margin-bottom: 20px; }
  .landing .visual-sublabel { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text-muted); margin-bottom: 10px; }
  .landing .visual-divider { height: 1px; background: var(--border); margin: 20px 0; }
  .landing .visual-footnote { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-muted); font-style: italic; }

  /* Merge visual (execution model) */
  .landing .merge-entries { display: flex; flex-direction: column; gap: 12px; }
  .landing .merge-entry { display: flex; align-items: baseline; gap: 16px; font-family: var(--font-mono); font-size: 13px; }
  .landing .merge-key { color: var(--accent-bright); min-width: 110px; font-weight: 500; }
  .landing .merge-val { color: var(--text-muted); }
  .landing .merge-template code { display: block; background: var(--bg-card); border: 1px solid var(--border); padding: 12px 16px; border-radius: 6px; font-size: 13px; line-height: 1.6; color: var(--text); }

  /* Timeline visual (batch processing) */
  .landing .timeline { display: flex; flex-direction: column; }
  .landing .timeline-step { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; font-size: 14px; line-height: 1.4; color: var(--text); border-left: 2px solid var(--border); padding-left: 20px; position: relative; }
  .landing .timeline-step::before { content: ''; position: absolute; left: -5px; top: 17px; width: 8px; height: 8px; border-radius: 50%; background: var(--border); }
  .landing .timeline-step.is-done::before { background: var(--accent); }
  .landing .timeline-step.is-paused { color: #f0c96e; }
  .landing .timeline-step.is-paused::before { background: #f0c96e; }
  .landing .tl-icon { flex-shrink: 0; width: 16px; height: 16px; margin-top: 2.5px; }
  .landing .tl-detail { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; font-size: 12px; color: var(--text-muted); }

  /* Comparison visual (deploy anywhere) */
  .landing .compare-group { margin-bottom: 20px; }
  .landing .compare-group:last-child { margin-bottom: 0; }
  .landing .compare-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text-muted); margin-bottom: 8px; }
  .landing .compare-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: var(--text); border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent); }
  .landing .compare-cost { color: var(--text-muted); font-size: 12px; }
  .landing .compare-group.is-invect { background: color-mix(in srgb, var(--accent) 8%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); border-radius: 8px; padding: 16px; }
  .landing .compare-group.is-invect .compare-label { color: var(--accent-bright); }
  .landing .compare-invect code { display: block; font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
  .landing .compare-invect p { font-size: 13px; color: var(--text-muted); line-height: 1.5; margin: 0; }

  /* Frameworks */
  .landing .frameworks { padding: 80px 0; text-align: center; border-top: 1px solid var(--border); }
  .landing .framework-logos { display: flex; justify-content: center; gap: 48px; margin-top: 32px; flex-wrap: wrap; }
  .landing .framework-item { display: flex; flex-direction: column; align-items: center; gap: 10px; font-size: 13px; color: var(--text-muted); text-decoration: none; transition: color 0.2s; }
  .landing .framework-item:hover { color: var(--text); }
  .landing .framework-icon { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; background: var(--bg-subtle); border: 1px solid var(--border); border-radius: var(--radius); transition: border-color 0.2s; }
  .landing .framework-item:hover .framework-icon { border-color: var(--accent); }

  /* CTA */
  .landing .cta { padding: 100px 0; }
  .landing .cta-box { background: var(--bg-subtle); border: 1px solid var(--border); padding: 64px; text-align: center; }
  .landing .cta-box h2 { font-size: 32px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 12px; }
  .landing .cta-box p { font-size: 15px; color: var(--text-muted); margin-bottom: 32px; }
  .landing .cta-buttons { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }

  /* Footer */
  .landing footer { border-top: 1px solid var(--border); padding: 32px 0; }
  .landing footer .container { display: flex; justify-content: space-between; align-items: center; }
  .landing footer p { font-size: 13px; color: var(--text-muted); }
  .landing .footer-links { display: flex; gap: 24px; list-style: none; }
  .landing .footer-links a { color: var(--text-muted); text-decoration: none; font-size: 13px; transition: color 0.2s; }
  .landing .footer-links a:hover { color: var(--text); }

  /* Mobile */
  @media (max-width: 900px) {
    .landing .hero > .container { display: block; text-align: center; }
    .landing .hero-text { text-align: center; }
    .landing .hero h1 { font-size: 32px; }
    .landing .hero p { margin-left: auto; margin-right: auto; }
    .landing .hero-actions { justify-content: center; }
    .landing .install-bar { margin: 0 auto; }
    .landing .hero-canvas-wrap { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0.15; aspect-ratio: auto; max-height: none; }
    .landing .features-grid { grid-template-columns: 1fr; }
    .landing .code-section > .container { grid-template-columns: 1fr; }
    .landing .code-block { overflow-x: auto; }
    .landing .section-title { font-size: clamp(24px, 6vw, 40px); word-break: break-word; }
    .landing .section-desc { max-width: 100%; }
    .landing .why-item { grid-template-columns: 1fr; }
    .landing .why-item:nth-child(even) { direction: ltr; }
    .landing .nav-links { gap: 16px; }
    .landing .nav-links a:not(.btn-nav) { display: none; }
    .landing .cta-box { padding: 40px 24px; }
  }
`;
