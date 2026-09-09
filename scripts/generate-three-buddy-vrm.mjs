import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* eslint-disable @typescript-eslint/explicit-function-return-type -- This reproducible asset generator runs directly as plain JavaScript. */

const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL('../resources/character-packs/three-buddy/models/three-buddy.vrm', import.meta.url));

const positions = [];
const normals = [];
const indices = [];
const faces = [
  {
    normal: [0, 0, 1],
    corners: [
      [-0.5, -0.5, 0.5],
      [0.5, -0.5, 0.5],
      [0.5, 0.5, 0.5],
      [-0.5, 0.5, 0.5]
    ]
  },
  {
    normal: [0, 0, -1],
    corners: [
      [0.5, -0.5, -0.5],
      [-0.5, -0.5, -0.5],
      [-0.5, 0.5, -0.5],
      [0.5, 0.5, -0.5]
    ]
  },
  {
    normal: [1, 0, 0],
    corners: [
      [0.5, -0.5, 0.5],
      [0.5, -0.5, -0.5],
      [0.5, 0.5, -0.5],
      [0.5, 0.5, 0.5]
    ]
  },
  {
    normal: [-1, 0, 0],
    corners: [
      [-0.5, -0.5, -0.5],
      [-0.5, -0.5, 0.5],
      [-0.5, 0.5, 0.5],
      [-0.5, 0.5, -0.5]
    ]
  },
  {
    normal: [0, 1, 0],
    corners: [
      [-0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5],
      [0.5, 0.5, -0.5],
      [-0.5, 0.5, -0.5]
    ]
  },
  {
    normal: [0, -1, 0],
    corners: [
      [-0.5, -0.5, -0.5],
      [0.5, -0.5, -0.5],
      [0.5, -0.5, 0.5],
      [-0.5, -0.5, 0.5]
    ]
  }
];

for (const face of faces) {
  const offset = positions.length / 3;
  for (const corner of face.corners) {
    positions.push(...corner);
    normals.push(...face.normal);
  }
  indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
}

function floatBuffer(values) {
  const result = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => result.writeFloatLE(value, index * 4));
  return result;
}

function uint16Buffer(values) {
  const result = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => result.writeUInt16LE(value, index * 2));
  return result;
}

const positionBuffer = floatBuffer(positions);
const normalBuffer = floatBuffer(normals);
const indexBuffer = uint16Buffer(indices);
const blinkBuffer = floatBuffer(positions.map((value, index) => (index % 3 === 1 ? -value * 0.9 : 0)));
const mouthOpenBuffer = floatBuffer(positions.map((value, index) => (index % 3 === 1 ? value * 1.8 : 0)));
const smileBuffer = floatBuffer(
  positions.map((value, index) => {
    if (index % 3 === 0) return Math.sign(value) * 0.12;
    if (index % 3 === 1) return Math.abs(value) * 0.35;
    return 0;
  })
);
const frownBuffer = floatBuffer(
  positions.map((value, index) => {
    if (index % 3 === 0) return Math.sign(value) * 0.08;
    if (index % 3 === 1) return -Math.abs(value) * 0.3;
    return 0;
  })
);
const binaryBuffer = Buffer.concat([positionBuffer, normalBuffer, indexBuffer, blinkBuffer, mouthOpenBuffer, smileBuffer, frownBuffer]);

const materials = [
  { name: 'Body Coral', pbrMetallicRoughness: { baseColorFactor: [0.92, 0.25, 0.22, 1], metallicFactor: 0.05, roughnessFactor: 0.72 } },
  { name: 'Suit Teal', pbrMetallicRoughness: { baseColorFactor: [0.08, 0.55, 0.57, 1], metallicFactor: 0.15, roughnessFactor: 0.62 } },
  { name: 'Hair Charcoal', pbrMetallicRoughness: { baseColorFactor: [0.055, 0.07, 0.09, 1], metallicFactor: 0.05, roughnessFactor: 0.82 } },
  { name: 'Face Warm', pbrMetallicRoughness: { baseColorFactor: [1, 0.72, 0.55, 1], metallicFactor: 0, roughnessFactor: 0.88 } },
  { name: 'Eye White', pbrMetallicRoughness: { baseColorFactor: [0.96, 0.98, 1, 1], metallicFactor: 0, roughnessFactor: 0.5 } },
  { name: 'Eye Dark', pbrMetallicRoughness: { baseColorFactor: [0.02, 0.025, 0.035, 1], metallicFactor: 0.1, roughnessFactor: 0.42 } },
  { name: 'Accent Gold', pbrMetallicRoughness: { baseColorFactor: [1, 0.72, 0.12, 1], metallicFactor: 0.35, roughnessFactor: 0.42 } }
].map((material) => ({ ...material, doubleSided: true }));

const meshes = materials.map((material, materialIndex) => {
  const targets = materialIndex === 0 ? [{ POSITION: 4 }, { POSITION: 5 }, { POSITION: 6 }] : materialIndex === 4 || materialIndex === 5 ? [{ POSITION: 3 }] : undefined;
  return {
    name: material.name,
    primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: materialIndex, ...(targets ? { targets } : {}) }],
    ...(targets ? { weights: targets.map(() => 0) } : {})
  };
});

const nodes = [];
function addNode(name, options = {}) {
  nodes.push({ name, ...options });
  return nodes.length - 1;
}
function addChild(parent, child) {
  nodes[parent].children ??= [];
  nodes[parent].children.push(child);
}
function addVisual(parent, name, mesh, translation, scale) {
  const visual = addNode(name, { mesh, translation, scale });
  addChild(parent, visual);
  return visual;
}

const avatarRoot = addNode('ThreeBuddyRoot');
const hips = addNode('hips', { translation: [0, 0.98, 0] });
const spine = addNode('spine', { translation: [0, 0.24, 0] });
const chest = addNode('chest', { translation: [0, 0.24, 0] });
const neck = addNode('neck', { translation: [0, 0.22, 0] });
const head = addNode('head', { translation: [0, 0.17, 0] });
addChild(avatarRoot, hips);
addChild(hips, spine);
addChild(spine, chest);
addChild(chest, neck);
addChild(neck, head);

const leftUpperLeg = addNode('leftUpperLeg', { translation: [-0.13, -0.12, 0] });
const leftLowerLeg = addNode('leftLowerLeg', { translation: [0, -0.36, 0] });
const leftFoot = addNode('leftFoot', { translation: [0, -0.34, 0.06] });
const rightUpperLeg = addNode('rightUpperLeg', { translation: [0.13, -0.12, 0] });
const rightLowerLeg = addNode('rightLowerLeg', { translation: [0, -0.36, 0] });
const rightFoot = addNode('rightFoot', { translation: [0, -0.34, 0.06] });
addChild(hips, leftUpperLeg);
addChild(leftUpperLeg, leftLowerLeg);
addChild(leftLowerLeg, leftFoot);
addChild(hips, rightUpperLeg);
addChild(rightUpperLeg, rightLowerLeg);
addChild(rightLowerLeg, rightFoot);

const leftShoulder = addNode('leftShoulder', { translation: [-0.27, 0.14, 0] });
const leftUpperArm = addNode('leftUpperArm', { translation: [-0.09, 0, 0] });
const leftLowerArm = addNode('leftLowerArm', { translation: [-0.3, -0.02, 0] });
const leftHand = addNode('leftHand', { translation: [-0.27, 0, 0] });
const rightShoulder = addNode('rightShoulder', { translation: [0.27, 0.14, 0] });
const rightUpperArm = addNode('rightUpperArm', { translation: [0.09, 0, 0] });
const rightLowerArm = addNode('rightLowerArm', { translation: [0.3, -0.02, 0] });
const rightHand = addNode('rightHand', { translation: [0.27, 0, 0] });
addChild(chest, leftShoulder);
addChild(leftShoulder, leftUpperArm);
addChild(leftUpperArm, leftLowerArm);
addChild(leftLowerArm, leftHand);
addChild(chest, rightShoulder);
addChild(rightShoulder, rightUpperArm);
addChild(rightUpperArm, rightLowerArm);
addChild(rightLowerArm, rightHand);

addVisual(hips, 'Pelvis', 1, [0, 0.01, 0], [0.36, 0.2, 0.24]);
addVisual(spine, 'Torso', 1, [0, 0.2, 0], [0.5, 0.47, 0.25]);
addVisual(spine, 'Chest Accent', 6, [0, 0.21, 0.132], [0.16, 0.15, 0.02]);
addVisual(neck, 'Neck', 3, [0, 0.04, 0], [0.13, 0.13, 0.13]);
addVisual(head, 'Head', 3, [0, 0.14, 0], [0.38, 0.35, 0.3]);
addVisual(head, 'Hair', 2, [0, 0.31, -0.015], [0.41, 0.11, 0.32]);
const leftEyeWhite = addVisual(head, 'Left Eye White', 4, [-0.1, 0.17, 0.156], [0.1, 0.085, 0.022]);
const rightEyeWhite = addVisual(head, 'Right Eye White', 4, [0.1, 0.17, 0.156], [0.1, 0.085, 0.022]);
const leftPupil = addVisual(head, 'Left Pupil', 5, [-0.1, 0.17, 0.171], [0.038, 0.052, 0.018]);
const rightPupil = addVisual(head, 'Right Pupil', 5, [0.1, 0.17, 0.171], [0.038, 0.052, 0.018]);
const mouth = addVisual(head, 'Mouth', 0, [0, 0.065, 0.163], [0.12, 0.025, 0.018]);
addVisual(leftUpperArm, 'Left Upper Arm Mesh', 0, [-0.15, 0, 0], [0.31, 0.12, 0.13]);
addVisual(leftLowerArm, 'Left Lower Arm Mesh', 3, [-0.14, 0, 0], [0.28, 0.105, 0.115]);
addVisual(leftHand, 'Left Hand Mesh', 6, [-0.055, 0, 0], [0.12, 0.13, 0.14]);
addVisual(rightUpperArm, 'Right Upper Arm Mesh', 0, [0.15, 0, 0], [0.31, 0.12, 0.13]);
addVisual(rightLowerArm, 'Right Lower Arm Mesh', 3, [0.14, 0, 0], [0.28, 0.105, 0.115]);
addVisual(rightHand, 'Right Hand Mesh', 6, [0.055, 0, 0], [0.12, 0.13, 0.14]);
addVisual(leftUpperLeg, 'Left Upper Leg Mesh', 2, [0, -0.17, 0], [0.17, 0.35, 0.19]);
addVisual(leftLowerLeg, 'Left Lower Leg Mesh', 1, [0, -0.17, 0], [0.15, 0.34, 0.17]);
addVisual(leftFoot, 'Left Foot Mesh', 6, [0, -0.06, 0.05], [0.18, 0.14, 0.3]);
addVisual(rightUpperLeg, 'Right Upper Leg Mesh', 2, [0, -0.17, 0], [0.17, 0.35, 0.19]);
addVisual(rightLowerLeg, 'Right Lower Leg Mesh', 1, [0, -0.17, 0], [0.15, 0.34, 0.17]);
addVisual(rightFoot, 'Right Foot Mesh', 6, [0, -0.06, 0.05], [0.18, 0.14, 0.3]);

const humanBones = {
  hips: { node: hips },
  spine: { node: spine },
  chest: { node: chest },
  neck: { node: neck },
  head: { node: head },
  leftShoulder: { node: leftShoulder },
  leftUpperArm: { node: leftUpperArm },
  leftLowerArm: { node: leftLowerArm },
  leftHand: { node: leftHand },
  rightShoulder: { node: rightShoulder },
  rightUpperArm: { node: rightUpperArm },
  rightLowerArm: { node: rightLowerArm },
  rightHand: { node: rightHand },
  leftUpperLeg: { node: leftUpperLeg },
  leftLowerLeg: { node: leftLowerLeg },
  leftFoot: { node: leftFoot },
  rightUpperLeg: { node: rightUpperLeg },
  rightLowerLeg: { node: rightLowerLeg },
  rightFoot: { node: rightFoot }
};

const gltf = {
  asset: { version: '2.0', generator: 'Chobits Three Buddy generator' },
  extensionsUsed: ['VRMC_vrm'],
  extensions: {
    VRMC_vrm: {
      specVersion: '1.0',
      meta: {
        name: 'Three Buddy',
        version: '1.0.0',
        authors: ['Chobits contributors'],
        copyrightInformation: 'Copyright (c) Chobits contributors',
        licenseUrl: 'https://vrm.dev/licenses/1.0/',
        avatarPermission: 'everyone',
        allowExcessivelyViolentUsage: false,
        allowExcessivelySexualUsage: false,
        commercialUsage: 'corporation',
        allowPoliticalOrReligiousUsage: false,
        allowAntisocialOrHateUsage: false,
        creditNotation: 'unnecessary',
        allowRedistribution: true,
        modification: 'allowModificationRedistribution',
        otherLicenseUrl: 'https://opensource.org/license/mit'
      },
      humanoid: { humanBones },
      expressions: {
        preset: {
          aa: {
            morphTargetBinds: [{ node: mouth, index: 0, weight: 1 }]
          },
          blink: {
            morphTargetBinds: [leftEyeWhite, rightEyeWhite, leftPupil, rightPupil].map((node) => ({ node, index: 0, weight: 1 }))
          },
          happy: {
            morphTargetBinds: [{ node: mouth, index: 1, weight: 1 }]
          },
          angry: {
            materialColorBinds: [{ material: 3, type: 'color', targetValue: [1, 0.48, 0.42, 1] }]
          },
          sad: {
            morphTargetBinds: [{ node: mouth, index: 2, weight: 1 }],
            materialColorBinds: [{ material: 3, type: 'color', targetValue: [0.62, 0.72, 0.92, 1] }]
          },
          relaxed: {
            materialColorBinds: [{ material: 1, type: 'color', targetValue: [0.08, 0.7, 0.55, 1] }]
          },
          surprised: {
            morphTargetBinds: [{ node: mouth, index: 0, weight: 0.85 }]
          }
        }
      },
      lookAt: {
        offsetFromHeadBone: [0, 0.14, 0.08],
        type: 'bone',
        rangeMapHorizontalInner: { inputMaxValue: 20, outputScale: 8 },
        rangeMapHorizontalOuter: { inputMaxValue: 20, outputScale: 8 },
        rangeMapVerticalDown: { inputMaxValue: 14, outputScale: 6 },
        rangeMapVerticalUp: { inputMaxValue: 14, outputScale: 6 }
      }
    }
  },
  scene: 0,
  scenes: [{ name: 'Three Buddy', nodes: [avatarRoot] }],
  nodes,
  meshes,
  materials,
  buffers: [{ byteLength: binaryBuffer.length }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: positionBuffer.length, target: 34962 },
    { buffer: 0, byteOffset: positionBuffer.length, byteLength: normalBuffer.length, target: 34962 },
    { buffer: 0, byteOffset: positionBuffer.length + normalBuffer.length, byteLength: indexBuffer.length, target: 34963 },
    { buffer: 0, byteOffset: positionBuffer.length + normalBuffer.length + indexBuffer.length, byteLength: blinkBuffer.length, target: 34962 },
    { buffer: 0, byteOffset: positionBuffer.length + normalBuffer.length + indexBuffer.length + blinkBuffer.length, byteLength: mouthOpenBuffer.length, target: 34962 },
    { buffer: 0, byteOffset: positionBuffer.length + normalBuffer.length + indexBuffer.length + blinkBuffer.length + mouthOpenBuffer.length, byteLength: smileBuffer.length, target: 34962 },
    {
      buffer: 0,
      byteOffset: positionBuffer.length + normalBuffer.length + indexBuffer.length + blinkBuffer.length + mouthOpenBuffer.length + smileBuffer.length,
      byteLength: frownBuffer.length,
      target: 34962
    }
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
    { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
    { bufferView: 2, componentType: 5123, count: indices.length, type: 'SCALAR' },
    { bufferView: 3, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: [0, -0.45, 0], max: [0, 0.45, 0] },
    { bufferView: 4, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: [0, -0.9, 0], max: [0, 0.9, 0] },
    { bufferView: 5, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: [-0.12, 0.175, 0], max: [0.12, 0.175, 0] },
    { bufferView: 6, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: [-0.08, -0.15, 0], max: [0.08, -0.15, 0] }
  ]
};

function padChunk(buffer, fill = 0) {
  const padding = (4 - (buffer.length % 4)) % 4;
  return padding ? Buffer.concat([buffer, Buffer.alloc(padding, fill)]) : buffer;
}

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

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, output);
console.log(`Generated ${path.relative(process.cwd(), outputPath)} (${output.length} bytes)`);
