# Window Animation System

## Goal

Window animation is split into two layers:

- `@aim-packages/window-manager` owns playback. It receives a timeline JSON and drives Electron `BrowserWindow` bounds/opacity on the desktop.
- `chobits` owns authoring. It provides an editor for keyframes, path controls, sprite/video selection, and preview.

This keeps the window manager generic and prevents sprite-specific concepts from leaking into the reusable package.

## Manager Timeline Schema

```ts
type WindowAnimationTimeline = {
  id?: string;
  keyframes: WindowAnimationKeyframe[];
  coordinateSpace?: WindowAnimationCoordinateSpace;
  positionAnchor?: WindowAnimationPlacement['anchor'];
  variants?: Partial<Record<'landscape' | 'portrait', WindowAnimationTimelineVariant>>;
  createIfMissing?: boolean;
  showBeforePlay?: boolean;
  clampToWorkArea?: boolean;
  suspendFollowMainDuringPlay?: boolean;
  refreshFollowerAfterPlay?: boolean;
};

type WindowAnimationKeyframe = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  placement?: WindowAnimationPlacement;
  opacity?: number;
  duration?: number;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'ease-in-quad' | 'ease-out-quad' | 'ease-in-out-quad' | 'ease-in-cubic' | 'ease-out-cubic' | 'ease-in-out-cubic';
  curve?: 'line' | 'quadratic' | 'cubic';
  control1?: { x: number; y: number };
  control2?: { x: number; y: number };
};

type WindowAnimationCoordinateSpace = {
  type?: 'absolute' | 'design-area';
  designArea?: { width: number; height: number };
  display?: 'primary' | 'current' | 'main';
  useWorkArea?: boolean;
  fitMode?: 'contain' | 'cover' | 'stretch';
  sizeMode?: 'absolute' | 'scale-with-area';
};

type WindowAnimationTimelineVariant = {
  keyframes?: WindowAnimationKeyframe[];
  coordinateSpace?: WindowAnimationCoordinateSpace;
  positionAnchor?: WindowAnimationPlacement['anchor'];
};

type WindowAnimationPlacement = {
  anchor: 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';
  display?: 'primary' | 'current' | 'main';
  useWorkArea?: boolean;
  margin?: number | { x?: number; y?: number; top?: number; right?: number; bottom?: number; left?: number };
  offset?: { x?: number; y?: number };
};
```

Rules:

- Without `coordinateSpace`, coordinates remain absolute desktop pixels.
- With `coordinateSpace.type: 'design-area'`, ordinary `x/y` points and `control1/control2` are authored in the design canvas and mapped to the target display/work area at playback time.
- `positionAnchor` controls which local point of the window follows the authored path. The default is `top-left` for compatibility. `center` means `x/y` and Bezier control points describe the window center, so editor lines connect through the visual center instead of the top-left corner.
- `fitMode: 'contain'` preserves the design aspect ratio inside the target area. `cover` fills the target area and may crop the design canvas. `stretch` maps X/Y independently and may distort paths.
- `sizeMode` defaults to `absolute`, so window `width/height` stay in pixels. Use `scale-with-area` only when the window should resize with the mapped design canvas.
- `variants.landscape` and `variants.portrait` can provide orientation-specific keyframes. The manager chooses by the resolved target area shape and falls back to base `keyframes`.
- The Chobits editor intentionally exposes screen adaptation as one "adapt to different screens" switch. When enabled it writes `design-area + stretch + scale-with-area + current workArea` from the fixed editor canvas, so authors do not need to tune low-level mapping fields.
- The Chobits editor defaults `positionAnchor` to `center`, because the path editor is meant to connect through the preview window center. Authors can change this under advanced parameters when they need top-left or edge-anchored motion.
- A keyframe can use `placement` instead of relying on fixed `x/y`. The manager resolves it to actual desktop coordinates at playback time.
- When `placement` is present, it overrides `x/y`, while `width`, `height`, `opacity`, `duration`, and curve settings keep their normal behavior.
- `anchor: 'left'` means left edge plus vertical center. `right`, `top`, and `bottom` follow the same axis-centering rule.
- `top-left`, `top-right`, `bottom-left`, and `bottom-right` snap the window to the corresponding corner.
- `display: 'current'` resolves against the display nearest to the previous/current keyframe. `main` resolves against the display containing the manager main window. `primary` resolves against the OS primary display.
- `useWorkArea` defaults to `true`, so Dock/taskbar/menu-bar safe area is preferred unless explicitly disabled.
- The first keyframe is applied immediately. Its `duration` is ignored.
- Every following keyframe describes the segment from the previous keyframe to itself.
- `duration` is the segment duration in milliseconds.
- `curve` affects position only. `width`, `height`, and `opacity` are interpolated linearly after easing.
- `control1` and `control2` are absolute desktop coordinates, matching SVG path semantics.

Example:

```json
{
  "coordinateSpace": {
    "type": "design-area",
    "designArea": { "width": 1440, "height": 900 },
    "display": "current",
    "useWorkArea": true,
    "fitMode": "stretch",
    "sizeMode": "scale-with-area"
  },
  "positionAnchor": "center",
  "keyframes": [
    { "x": 530, "y": 630, "width": 220, "height": 220 },
    {
      "width": 220,
      "height": 220,
      "placement": { "anchor": "right", "display": "current", "useWorkArea": true, "margin": 16 },
      "duration": 600,
      "easing": "ease-in-out"
    }
  ],
  "variants": {
    "portrait": {
      "keyframes": [
        { "x": 340, "y": 760, "width": 220, "height": 220 },
        { "placement": { "anchor": "bottom", "margin": 16 }, "duration": 600 }
      ]
    }
  }
}
```

## Manager API

Renderer IPC:

- `window:animation:play(windowKey, timeline)`
- `window:animation:stop(windowKey, { complete?: boolean })`
- `window:animation:state(windowKey?)`

Main-process API:

- `windowManager.playWindowAnimation(windowKey, timeline)`
- `windowManager.stopWindowAnimation(windowKey, options)`
- `windowManager.getWindowAnimationState(windowKey?)`

Playback is isolated from existing positioning features:

- Existing `followMain` behavior remains unchanged when no animation is playing.
- If a followed window is animated, manager temporarily skips follower repositioning for that window.
- After playback or stop, follower tracking is restored.

## Chobits Editor

The first editor lives at:

- route: `#/window-animation-editor`
- window key: `windowAnimationEditor`
- entry: Settings -> 机能扩展 -> 窗口动画编排

The editor currently supports:

- target window selection
- keyframe creation/removal
- PPT-like preset generation for supported effects:
  - entrance: fly in, fade in, zoom in
  - exit: fly out, fade out, zoom out
  - emphasis: pulse, shake
- desktop canvas point dragging
- quick semantic placement buttons for corners, edges, and center
- one-click screen adaptation using design-area stretch mapping and size scaling
- line/quadratic/cubic path segments
- segment duration and easing
- width/height/opacity keyframes
- JSON preview
- direct playback/stop through manager IPC

Preset generation lives in Chobits, not in the manager. A preset is a pure factory that reads a base frame and writes ordinary manager keyframes. This means presets can use all existing playback features, including `positionAnchor`, `placement`, opacity, size interpolation, easing, and screen adaptation, while the manager remains a generic timeline player.

The settings page exposes the supported presets as an external list. Clicking a preset opens `windowAnimationEditor` with `{ presetId }`, and the editor immediately loads that preset onto the canvas. Inside the editor, changing the preset dropdown, direction, or duration also regenerates the timeline immediately. Any manual keyframe edit switches the editor back to custom keyframe mode.

The first supported preset batch intentionally covers effects that can be expressed through native window bounds and opacity:

- Fly in/out moves the window between the selected base frame and an offscreen point on the chosen side.
- Fade in/out changes opacity while preserving the base frame position and size.
- Zoom in/out changes width and height around the selected `positionAnchor`.
- Pulse briefly scales up, then returns to the base frame.
- Shake creates a short multi-keyframe offset motion and returns to the base frame.

Effects such as rotate, wipe, blur, glow, or content morphing should be authored as content-layer sprite/video/CSS tracks in Chobits and synchronized with the manager timeline, because Electron `BrowserWindow` itself does not provide those transforms as first-class cross-platform window operations.

## Optional Advanced PPT-Style Effects

Electron can reliably animate native window bounds and opacity, but it cannot rotate, skew, flip, wipe, blur, or morph the native `BrowserWindow` itself in a cross-platform way. Those effects should be implemented as a Chobits content-animation layer inside the transparent/normal window while the manager continues to move and resize the actual desktop window.

This section is an optional implementation blueprint, not a required roadmap. The current window-animation system does not depend on these advanced effects. If a future feature needs PPT-style rotate/reveal/filter effects, prefer implementing them in Chobits first and keep `@aim-packages/window-manager` unchanged unless a concrete synchronization requirement appears.

### Responsibility Split

- Manager remains the generic desktop-window playback layer.
  - Owns `x/y/width/height/opacity/path/placement`.
  - Owns follow-main suspension and restoration during playback.
  - Does not know about sprite assets, CSS effects, masks, or visual presets.
- Chobits owns PPT-style authoring and content rendering.
  - Builds preset factories that combine a manager `WindowAnimationTimeline` with Chobits-only content tracks.
  - Sends the manager timeline through `window:animation:play`.
  - Sends content effects to the target renderer window through a Chobits IPC/BroadcastChannel/custom event.
  - Uses CSS/Web Animations API, Canvas, WebGL, or sprite/video track state to render rotate, flip, wipe, blur, glow, and morph effects.

### Chobits Data Model

If advanced effects are needed, add a Chobits-side composed animation model:

```ts
type ChobitsWindowAnimationEffectPreset = {
  id: string;
  name: string;
  category: 'entrance' | 'exit' | 'emphasis' | 'motion-path' | 'content';
  targetWindow: string;
  windowTimeline: WindowAnimationTimeline;
  contentTracks?: ChobitsWindowContentTrack[];
};

type ChobitsWindowContentTrack = {
  target: 'window-root' | 'sprite-layer' | 'bubble-layer' | 'effect-layer';
  startMs?: number;
  duration: number;
  easing?: WindowAnimationTimeline['keyframes'][number]['easing'];
  keyframes: ChobitsWindowContentKeyframe[];
  fill?: 'none' | 'forwards' | 'backwards' | 'both';
};

type ChobitsWindowContentKeyframe = {
  offset: number;
  opacity?: number;
  transform?: {
    translateX?: number;
    translateY?: number;
    scale?: number;
    scaleX?: number;
    scaleY?: number;
    rotate?: number;
    skewX?: number;
    skewY?: number;
  };
  filter?: {
    blur?: number;
    brightness?: number;
    contrast?: number;
    dropShadow?: string;
  };
  clipPath?: string;
  maskImage?: string;
};
```

The existing `WindowAnimationTimeline` JSON stays manager-compatible. `contentTracks` are Chobits-only and should not be passed to `@aim-packages/window-manager`.

### Runtime Playback Design

When a composed effect is used, playback can follow this flow:

1. Chobits resolves the effect into:
   - `windowTimeline` for manager playback;
   - `contentTracks` for renderer playback.
2. Chobits opens/prepares the target window.
3. Chobits sends `contentTracks` to the target renderer.
4. Chobits starts content playback and calls `window:animation:play` in the same user action.
5. The target renderer applies content tracks with the Web Animations API when possible.
6. On stop/cancel, Chobits stops the manager animation and sends a content-track cancel/reset message.

The initial implementation can use two clocks:

- manager clock for native window movement;
- renderer clock for content transforms.

This is usually good enough for visual preset playback because both start from the same user action and use the same durations/easing. If drift becomes visible later, add a Chobits-level playback coordinator before changing the manager.

### Optional Effect Catalog

The following effects are examples that could be implemented with the composed model. They are not required for the current editor.

1. Window-only effects already supported:
   - fly in/out
   - fade in/out
   - zoom in/out
   - pulse
   - shake
2. Content-transform presets:
   - rotate in/out
   - spin
   - flip horizontal/vertical
   - grow/shrink around the content center
   - swing
3. Reveal/mask presets:
   - wipe left/right/up/down
   - iris/circle reveal
   - split reveal
   - blinds/stripes
4. Visual emphasis presets:
   - glow
   - blur in/out
   - flash
   - color/brightness pulse
5. Combined presets:
   - rotate fly in
   - flip and zoom
   - blur fade in
   - wipe while moving along a path

If combined effects are added, they should be normal factory output: one manager timeline plus one or more content tracks.

### Optional Editor Integration

If content effects are added later, enhance `WindowAnimationEditor` without crowding the canvas:

1. Keep the external preset list in settings as the fast entry point.
2. Keep the editor preset dropdown as "select to load".
3. Add a collapsed "content effects" panel under advanced controls.
4. Show only high-level controls first:
   - effect type
   - duration
   - direction
   - intensity
   - pivot/origin
   - fill mode
5. Add a visual preview overlay in the SVG editor for window bounds, while content effects preview inside a small renderer preview layer or the target window.
6. Treat manual edits to window keyframes as custom window motion, but keep content tracks editable independently.

The editor should avoid exposing low-level CSS fields by default. Advanced CSS fields can remain collapsed for power users.

### Renderer Adapter Plan

Each target window that opts into advanced effects can expose a small content-animation adapter:

```ts
type ChobitsWindowContentAnimationMessage =
  | { type: 'window-content-animation:play'; animationId: string; tracks: ChobitsWindowContentTrack[] }
  | { type: 'window-content-animation:stop'; animationId?: string; reset?: boolean };
```

The adapter responsibilities:

- find the target DOM layer;
- convert Chobits keyframes to Web Animations API keyframes;
- apply transform/filter/clip-path/mask;
- reset styles when requested;
- avoid stealing focus from text input windows;
- ignore unknown track targets gracefully.

Sprite/effect/bubble windows are good initial candidates because they already render visual content. Other windows can opt in later if a feature actually needs it.

### Manager Impact Decision

No manager changes are needed for the optional advanced-effects design as described above.

Keep the manager untouched when:

- the effect can be expressed as CSS/Web Animations inside the window;
- Chobits can start the content track and manager timeline together;
- the manager timeline only needs bounds/opacity/path/placement;
- preset authoring stays Chobits-specific.

Consider a future manager change only if one of these becomes necessary:

- manager needs to emit high-frequency animation progress events for exact sync;
- multiple independent renderer windows need a shared manager-owned playback clock;
- stop/pause/resume/seek must be atomic across window bounds and content effects;
- non-Chobits consumers need the same composed animation protocol.

If that future point arrives, prefer additive manager APIs such as progress events or generic timeline lifecycle hooks. Do not put Chobits-specific CSS/effect schemas into the manager package.

## Future Sprite/Video Composition

The manager should stay unaware of sprite assets. Chobits can extend saved animation presets with a composition layer:

```ts
type ChobitsWindowAnimationPreset = {
  id: string;
  name: string;
  targetWindow: string;
  timeline: WindowAnimationTimeline;
  spriteTracks?: Array<{
    animationId: string;
    startMs: number;
    endMs?: number;
    scale?: number;
  }>;
};
```

At playback time Chobits should:

1. open or prepare the target sprite/effect window;
2. start the sprite/video track;
3. call `window:animation:play`;
4. stop or transition sprite/video tracks when the timeline completes.

This lets window motion, window size, and sprite content evolve independently while sharing the same timeline.
