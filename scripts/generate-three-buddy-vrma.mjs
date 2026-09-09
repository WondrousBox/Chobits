import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Euler, MathUtils, Quaternion } from 'three';

/* eslint-disable @typescript-eslint/explicit-function-return-type -- This reproducible asset generator runs directly as plain JavaScript. */

const outputDir = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL('../resources/character-packs/three-buddy/motions/', import.meta.url));

function quaternion(xDegrees = 0, yDegrees = 0, zDegrees = 0) {
  return new Quaternion().setFromEuler(new Euler(MathUtils.degToRad(xDegrees), MathUtils.degToRad(yDegrees), MathUtils.degToRad(zDegrees), 'XYZ')).toArray();
}

function floatBuffer(values) {
  const result = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => result.writeFloatLE(value, index * 4));
  return result;
}

function padChunk(buffer, fill = 0) {
  const padding = (4 - (buffer.length % 4)) % 4;
  return padding ? Buffer.concat([buffer, Buffer.alloc(padding, fill)]) : buffer;
}

function createRig() {
  const nodes = [];
  const bones = {};
  const addNode = (name, options = {}) => {
    nodes.push({ name, ...options });
    return nodes.length - 1;
  };
  const addBone = (name, translation) => {
    const node = addNode(name, { translation });
    bones[name] = node;
    return node;
  };
  const addChild = (parent, child) => {
    nodes[parent].children ??= [];
    nodes[parent].children.push(child);
  };

  const root = addNode('ThreeBuddyAnimationRoot');
  const hips = addBone('hips', [0, 0.98, 0]);
  const spine = addBone('spine', [0, 0.24, 0]);
  const chest = addBone('chest', [0, 0.24, 0]);
  const neck = addBone('neck', [0, 0.22, 0]);
  const head = addBone('head', [0, 0.17, 0]);
  addChild(root, hips);
  addChild(hips, spine);
  addChild(spine, chest);
  addChild(chest, neck);
  addChild(neck, head);

  for (const side of ['left', 'right']) {
    const sign = side === 'left' ? -1 : 1;
    const upperLeg = addBone(`${side}UpperLeg`, [0.13 * sign, -0.12, 0]);
    const lowerLeg = addBone(`${side}LowerLeg`, [0, -0.36, 0]);
    const foot = addBone(`${side}Foot`, [0, -0.34, 0.06]);
    addChild(hips, upperLeg);
    addChild(upperLeg, lowerLeg);
    addChild(lowerLeg, foot);

    const shoulder = addBone(`${side}Shoulder`, [0.27 * sign, 0.14, 0]);
    const upperArm = addBone(`${side}UpperArm`, [0.09 * sign, 0, 0]);
    const lowerArm = addBone(`${side}LowerArm`, [0.3 * sign, -0.02, 0]);
    const hand = addBone(`${side}Hand`, [0.27 * sign, 0, 0]);
    addChild(chest, shoulder);
    addChild(shoulder, upperArm);
    addChild(upperArm, lowerArm);
    addChild(lowerArm, hand);
  }

  return { nodes, bones, root, addNode };
}

function generateMotion(definition) {
  const { nodes, bones, root, addNode } = createRig();
  const sceneNodes = [root];
  const expressions = {};
  for (const expression of definition.expressions ?? []) {
    const node = addNode(`Expression_${expression.name}`, { translation: [0, 0, 0] });
    sceneNodes.push(node);
    expressions[expression.name] = { node };
    expression.node = node;
  }
  let lookAtNode;
  if (definition.lookAt) {
    lookAtNode = addNode('LookAt', { rotation: quaternion() });
    sceneNodes.push(lookAtNode);
  }

  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  let byteOffset = 0;
  const addAccessor = (values, type, itemSize, includeRange = false) => {
    const buffer = floatBuffer(values);
    const padded = padChunk(buffer);
    const bufferView = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: buffer.length });
    chunks.push(padded);
    byteOffset += padded.length;
    const accessor = {
      bufferView,
      componentType: 5126,
      count: values.length / itemSize,
      type
    };
    if (includeRange) {
      accessor.min = [Math.min(...values)];
      accessor.max = [Math.max(...values)];
    }
    accessors.push(accessor);
    return accessors.length - 1;
  };

  const samplers = [];
  const channels = [];
  const addTrack = (node, pathName, times, values, type, itemSize) => {
    const input = addAccessor(times, 'SCALAR', 1, true);
    const output = addAccessor(values, type, itemSize);
    samplers.push({ input, output, interpolation: 'LINEAR' });
    channels.push({ sampler: samplers.length - 1, target: { node, path: pathName } });
  };

  for (const track of definition.tracks(bones)) {
    addTrack(track.node, track.path, track.times, track.values, track.type, track.itemSize);
  }
  for (const expression of definition.expressions ?? []) {
    addTrack(
      expression.node,
      'translation',
      expression.times,
      expression.weights.flatMap((weight) => [weight, 0, 0]),
      'VEC3',
      3
    );
  }
  if (definition.lookAt && lookAtNode !== undefined) {
    addTrack(lookAtNode, 'rotation', definition.lookAt.times, definition.lookAt.rotations.flat(), 'VEC4', 4);
  }

  const extension = {
    specVersion: '1.0',
    humanoid: {
      humanBones: Object.fromEntries(Object.entries(bones).map(([name, node]) => [name, { node }]))
    },
    ...(Object.keys(expressions).length > 0 ? { expressions: { preset: expressions } } : {}),
    ...(lookAtNode !== undefined ? { lookAt: { node: lookAtNode } } : {})
  };
  const binaryBuffer = Buffer.concat(chunks);
  const gltf = {
    asset: { version: '2.0', generator: 'Chobits Three Buddy VRMA generator' },
    extensionsUsed: ['VRMC_vrm_animation'],
    extensions: { VRMC_vrm_animation: extension },
    scene: 0,
    scenes: [{ name: definition.name, nodes: sceneNodes }],
    nodes,
    animations: [{ name: definition.name, samplers, channels }],
    buffers: [{ byteLength: binaryBuffer.length }],
    bufferViews,
    accessors
  };

  const jsonChunk = padChunk(Buffer.from(JSON.stringify(gltf)), 0x20);
  const binChunk = padChunk(binaryBuffer);
  const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const output = Buffer.alloc(totalLength);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(jsonChunk.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(output, 20);
  const binHeaderOffset = 20 + jsonChunk.length;
  output.writeUInt32LE(binChunk.length, binHeaderOffset);
  output.writeUInt32LE(0x004e4942, binHeaderOffset + 4);
  binChunk.copy(output, binHeaderOffset + 8);

  const outputPath = path.join(outputDir, `${definition.id}.vrma`);
  writeFileSync(outputPath, output);
  console.log(`Generated ${path.relative(process.cwd(), outputPath)} (${output.length} bytes)`);
}

const q = (angles) => angles.map(([x, y, z]) => quaternion(x, y, z)).flat();
const motions = [
  {
    id: 'idle',
    name: 'Three Buddy Idle',
    tracks: (bones) => [
      { node: bones.hips, path: 'translation', times: [0, 1, 2], values: [0, 0.98, 0, 0, 1, 0, 0, 0.98, 0], type: 'VEC3', itemSize: 3 },
      { node: bones.chest, path: 'rotation', times: [0, 1, 2], values: q([[0, 0, -1.5], [0, 0, 1.5], [0, 0, -1.5]]), type: 'VEC4', itemSize: 4 }
    ]
  },
  {
    id: 'walk',
    name: 'Three Buddy Walk',
    tracks: (bones) => [
      { node: bones.hips, path: 'translation', times: [0, 0.25, 0.5, 0.75, 1], values: [0, 0.98, 0, 0, 1.02, 0, 0, 0.98, 0, 0, 1.02, 0, 0, 0.98, 0], type: 'VEC3', itemSize: 3 },
      { node: bones.leftUpperLeg, path: 'rotation', times: [0, 0.5, 1], values: q([[25, 0, 0], [-25, 0, 0], [25, 0, 0]]), type: 'VEC4', itemSize: 4 },
      { node: bones.rightUpperLeg, path: 'rotation', times: [0, 0.5, 1], values: q([[-25, 0, 0], [25, 0, 0], [-25, 0, 0]]), type: 'VEC4', itemSize: 4 },
      { node: bones.leftUpperArm, path: 'rotation', times: [0, 0.5, 1], values: q([[-20, 0, 0], [20, 0, 0], [-20, 0, 0]]), type: 'VEC4', itemSize: 4 },
      { node: bones.rightUpperArm, path: 'rotation', times: [0, 0.5, 1], values: q([[20, 0, 0], [-20, 0, 0], [20, 0, 0]]), type: 'VEC4', itemSize: 4 }
    ]
  },
  {
    id: 'welcome',
    name: 'Three Buddy Welcome',
    tracks: (bones) => [
      { node: bones.rightUpperArm, path: 'rotation', times: [0, 0.35, 0.7, 1.05, 1.4], values: q([[0, 0, 0], [0, 0, 65], [0, 0, 42], [0, 0, 65], [0, 0, 0]]), type: 'VEC4', itemSize: 4 },
      { node: bones.rightLowerArm, path: 'rotation', times: [0, 0.35, 0.7, 1.05, 1.4], values: q([[0, 0, 0], [0, 0, 70], [0, 0, 45], [0, 0, 70], [0, 0, 0]]), type: 'VEC4', itemSize: 4 },
      { node: bones.head, path: 'rotation', times: [0, 0.7, 1.4], values: q([[0, 0, 0], [0, -8, 3], [0, 0, 0]]), type: 'VEC4', itemSize: 4 }
    ],
    expressions: [{ name: 'happy', times: [0, 0.3, 1.1, 1.4], weights: [0, 1, 0.7, 0] }],
    lookAt: { times: [0, 0.7, 1.4], rotations: [quaternion(), quaternion(-3, -10, 0), quaternion()] }
  },
  {
    id: 'thinking',
    name: 'Three Buddy Thinking',
    tracks: (bones) => [
      { node: bones.head, path: 'rotation', times: [0, 0.5, 1.5, 2], values: q([[0, 0, 0], [0, 10, -5], [0, 10, -5], [0, 0, 0]]), type: 'VEC4', itemSize: 4 },
      { node: bones.rightUpperArm, path: 'rotation', times: [0, 0.5, 1.5, 2], values: q([[0, 0, 0], [0, 0, 42], [0, 0, 42], [0, 0, 0]]), type: 'VEC4', itemSize: 4 },
      { node: bones.rightLowerArm, path: 'rotation', times: [0, 0.5, 1.5, 2], values: q([[0, 0, 0], [0, 0, 78], [0, 0, 78], [0, 0, 0]]), type: 'VEC4', itemSize: 4 }
    ],
    expressions: [{ name: 'relaxed', times: [0, 0.5, 1.5, 2], weights: [0, 0.65, 0.65, 0] }]
  }
];

mkdirSync(outputDir, { recursive: true });
for (const motion of motions) generateMotion(motion);
