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
- Keyframes may be sparse. Missing `width`/`height` inherit from the previously resolved window bounds, and the first keyframe inherits from the real window size at playback start. This is the correct way to keep the original window size for effects such as fly-in, fly-out, fade, and shake.
- In the Chobits editor, the size mode controls whether manually authored keyframes write `width`/`height`. `Edit width/height` shows the window rectangle, resize handles, and serializes explicit size fields. `Keep original size` omits `width`/`height` from playback keyframes and the canvas only shows the keyframe anchor points and path.
- In the current manager, missing `x`/`y` preserve the previous top-left corner even when `positionAnchor` is `center`. This keeps compatibility, but it means size-changing presets still need explicit `x/y` if they want center-based scaling. See the sparse preset optimization plan below for the planned anchor-inheritance improvement.
- Presets should omit fields they do not own. For example, a fade preset should only write `opacity` and timing fields, while a fly preset should write position and `opacity` but not `width`/`height`.

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
- size mode selection: edit explicit width/height or keep the target window's original size by omitting size fields
- JSON preview
- direct playback/stop through manager IPC

Preset generation lives in Chobits, not in the manager. A preset is a pure factory that reads a base frame and writes ordinary manager keyframes. This means presets can use all existing playback features, including `positionAnchor`, `placement`, opacity, size interpolation, easing, and screen adaptation, while the manager remains a generic timeline player. Preset playback keyframes should be sparse: the generated timeline should only include the properties controlled by that preset.

The settings page exposes the supported presets as direct playback actions. Clicking a preset reads the current main-window bounds, builds a sparse preset timeline for `main`, and immediately calls `window:animation:play`. Presets are not editable keyframe documents. The `windowAnimationEditor` remains a custom authoring surface for manually edited timelines.

The first supported preset batch intentionally covers effects that can be expressed through native window bounds and opacity:

- Fly in/out moves the window between the selected base frame and an offscreen point on the chosen side.
- Fade in/out changes opacity while preserving the base frame position and size.
- Zoom in/out changes width and height around the selected `positionAnchor`.
- Pulse briefly scales up, then returns to the base frame.
- Shake creates a short multi-keyframe offset motion and returns to the base frame.

Effects such as rotate, wipe, blur, glow, or content morphing should be authored as content-layer sprite/video/CSS tracks in Chobits and synchronized with the manager timeline, because Electron `BrowserWindow` itself does not provide those transforms as first-class cross-platform window operations.

### Sprite Animation Integration

Sprite video animations can trigger these same non-editable window presets as a playback side effect. This is modeled as the third `SpriteMovementConfig.mode`, `windowAnimation`, because the existing `movement` field already represents the extra window action attached to a sprite animation.

The integration follows these boundaries:

- Renderer editors only persist intent: preset id, optional direction, optional duration, optional play position, and `trigger: 'animation'`.
- `sprite-core` remains independent of `@aim-packages/window-manager`; it calls an injected `windowAnimationAdapter`.
- Electron main owns the concrete playback: it resolves `windowAnimationTarget` with `main` as the default, optionally places that target window, reads the resulting bounds and work area, builds the sparse preset timeline, then calls `windowManager.playWindowAnimation(target, timeline)`.
- Window animation presets triggered from sprite playback are direct actions, not editable timeline documents.
- Window animation mode must not emit walking state or start `WindowController` auto-move. The sprite video can keep playing in place while the main window performs the preset.

`SpriteMovementConfig.windowAnimationPlayPosition` controls the optional placement step before preset playback:

- When `windowAnimationPlayPosition` is omitted, playback is identical to the old behavior: the preset uses the target window's current bounds as its base frame.
- `mode: 'placement'` stores a semantic anchor such as `top-left`, `right`, `bottom`, or `center`, plus display/work-area/margin options. Electron main resolves it against the selected display and calls `BrowserWindow.setBounds()` before building the preset timeline.
- `mode: 'point'` stores a manually dragged design-area point, a `positionAnchor`, and coordinate-space mapping options. The point is mapped with the same `design-area` fit modes used by window animation authoring, then converted to a top-left window bound by subtracting the selected local anchor offset.
- The placement step changes only the starting desktop bounds used by the native window animation. It does not write `x/y/width/height` into the sprite animation itself, does not resize the sprite window, and does not change `SpriteState`.
- The shared UI component for this setting mirrors the window animation editor: enable/disable switch, quick corner/edge/center buttons, display selection, work-area toggle, margin field, and a manual drag canvas with `stretch`/`contain`/`cover` mapping.

This keeps one source of truth for preset geometry and sparse serialization. Settings-page direct playback, sprite-animation playback, and tests all use the same preset factory.

## Sparse Preset Timeline Optimization Plan

This improvement fixes an over-specific authoring problem in the first preset implementation. The current editor stores every preview frame as a complete rectangle (`x/y/width/height/opacity/duration/easing/curve`) and serializes the same complete shape into the manager timeline. That is convenient for canvas preview, but it makes PPT-style presets write properties they do not actually control. For example, fly-in should control position and opacity only; writing `width` and `height` accidentally freezes the target window size.

The design rule is:

- editor preview frames may remain complete, because the canvas needs rectangles, resize handles, and size labels;
- manager playback frames should be sparse, because missing fields intentionally inherit from the real window state or the previous resolved frame;
- manual/custom keyframes keep full size serialization in `Edit width/height` mode, but may intentionally omit `width/height` through the editor's `Keep original size` mode.

### Phase 1: Sparse Serialization in Chobits

Do not change `@aim-packages/window-manager` for this phase. The manager already preserves the original size when `width` and `height` are omitted.

Implementation steps:

1. Keep the existing full `EditableKeyframe` model for `WindowAnimationEditor` custom preview and JSON.
2. Add a preset playback serializer, separate from the preview frame factory. It should convert full preset preview frames into sparse `WindowAnimationKeyframe[]`.
3. Treat presets as non-editable actions. The settings page should generate a sparse timeline from the current main-window bounds and play it directly, instead of opening `windowAnimationEditor`.
4. Keep custom editor serialization complete so user-authored values remain explicit.
5. Omit default noise where possible in preset playback: the first keyframe does not need `duration`; `curve: 'line'` does not need to be written; `easing` only matters on the segment target frame.

Preset-controlled fields:

| Preset | Controlled fields in playback timeline | Fields to omit |
| --- | --- | --- |
| `fly-in` | `x/y` or `placement` for path endpoints, `opacity`, segment `duration/easing` | `width/height`; omit `curve` when line |
| `fly-out` | `x/y` or `placement` for path endpoints, `opacity`, segment `duration/easing` | `width/height`; omit `curve` when line |
| `fade-in` | `opacity`, segment `duration/easing` | `x/y/width/height/placement/curve` |
| `fade-out` | `opacity`, segment `duration/easing` | `x/y/width/height/placement/curve` |
| `shake` | `x/y`, segment `duration/easing` | `width/height/opacity`; omit `curve` when line |
| `zoom-in` | Phase 1: `x/y`, `width/height`, `opacity`, segment `duration/easing` | No unrelated `placement`; omit `curve` when line |
| `zoom-out` | Phase 1: `x/y`, `width/height`, `opacity`, segment `duration/easing` | No unrelated `placement`; omit `curve` when line |
| `pulse` | Phase 1: `x/y`, `width/height`, segment `duration/easing` | `opacity` unless the base opacity is intentionally changed; omit `curve` when line |

The size-changing presets keep `x/y` in Phase 1 because the current manager preserves the previous top-left corner when `x/y` is omitted. Without the Phase 2 manager change, omitting `x/y` from `zoom-in`, `zoom-out`, or `pulse` would make center-based scaling drift.

Example sparse fly-in output:

```json
{
  "id": "chobits-window-main",
  "keyframes": [
    { "x": -158, "y": 630, "opacity": 0 },
    { "x": 530, "y": 630, "opacity": 1, "duration": 650, "easing": "ease-out-cubic" }
  ],
  "coordinateSpace": {
    "type": "design-area",
    "designArea": { "width": 1440, "height": 900 },
    "display": "current",
    "useWorkArea": true,
    "fitMode": "stretch",
    "sizeMode": "scale-with-area"
  },
  "positionAnchor": "center",
  "createIfMissing": false,
  "showBeforePlay": true,
  "clampToWorkArea": false,
  "suspendFollowMainDuringPlay": true,
  "refreshFollowerAfterPlay": false
}
```

Verification:

- Add Chobits unit tests asserting that sparse preset serialization omits uncontrolled fields.
- Keep existing preset geometry tests for full preview frames so the editor canvas behavior remains stable.
- Add Chobits unit coverage for fly-in/fade/shake proving that omitted size fields follow the manager inheritance contract and keep the target window's current size.

### Phase 2: Anchor-Based Missing Position in Window Manager

This phase improves `@aim-packages/window-manager` so size-only keyframes can scale around `positionAnchor` without writing explicit `x/y`.

Current behavior:

- Missing `width`/`height` inherit previous size.
- Missing `x`/`y` preserve the previous top-left corner, even when `positionAnchor` is `center`.

Desired PPT-style behavior for size-changing presets:

- When `positionAnchor` is `center` and a keyframe changes only `width`/`height`, the previous center should remain fixed.
- The same rule should work for all anchors: missing position preserves the previous anchor point, then computes the new top-left from the new size.

Compatibility plan:

1. Add an additive manager timeline option such as:

```ts
type WindowAnimationMissingPositionMode = 'top-left' | 'position-anchor';

type WindowAnimationTimeline = {
  missingPositionMode?: WindowAnimationMissingPositionMode;
};
```

2. Keep `top-left` as the default for compatibility.
3. When `missingPositionMode: 'position-anchor'`, resolve missing `x` and/or `y` from the previous bounds' `positionAnchor` point instead of the previous top-left corner.
4. Keep `placement` as an explicit semantic position override. If a frame has `placement`, it still overrides `x/y` inheritance.
5. Chobits should set `missingPositionMode: 'position-anchor'` for PPT preset timelines after the manager version with this option is available.
6. Then update sparse serialization for `zoom-in`, `zoom-out`, and `pulse` so they can omit `x/y` and describe only size, opacity when relevant, and timing.

Manager verification:

- Missing `width`/`height` keeps the real starting window size.
- Default missing `x`/`y` behavior remains top-left compatible.
- With `missingPositionMode: 'position-anchor'` and `positionAnchor: 'center'`, a width/height-only segment keeps the center fixed.
- Partial inheritance works per axis: if only `x` is missing, inherit the previous anchor X while using the explicit Y, and vice versa.
- `placement` continues to override inherited position.

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
