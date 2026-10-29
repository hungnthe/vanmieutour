import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Keep the original SketchUp export intact. The public scene uses only the
// three groups drawn inside the Văn Miếu model; the TPX groups cover ~1 km².
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelDir = path.join(root, 'data', 'model');
const source = fs.readFileSync(path.join(modelDir, 'model_2.glb'));
const manifest = JSON.parse(fs.readFileSync(path.join(modelDir, 'manifest.json'), 'utf8'));
const includedGroups = ['noithat', 'nha_khoi', 'timngo'];

assert.equal(source.readUInt32LE(0), 0x46546c67, 'Source must be a GLB');
assert.equal(source.readUInt32LE(4), 2, 'Only GLB version 2 is supported');
assert.equal(source.readUInt32LE(8), source.length, 'Source GLB length mismatch');

let json, binary;
for (let offset = 12; offset < source.length;) {
  const length = source.readUInt32LE(offset);
  const type = source.readUInt32LE(offset + 4);
  const bytes = source.subarray(offset + 8, offset + 8 + length);
  if (type === 0x4e4f534a) json = JSON.parse(bytes.toString('utf8'));
  if (type === 0x004e4942) binary = bytes;
  offset += length + 8;
}
assert(json && binary, 'Source GLB requires JSON and BIN chunks');
assert.equal(json.buffers.length, 1, 'Only one embedded buffer is supported');
assert.equal(json.images?.length || 0, 0, 'Source textures require explicit handling');
assert.equal(json.animations?.length || 0, 0, 'Source animations require explicit handling');

const sourceRoot = json.scenes[json.scene ?? 0].nodes[0];
const rootNode = json.nodes[sourceRoot];
const chosenRoots = rootNode.children.filter(index => includedGroups.includes(json.nodes[index].name));
assert.deepEqual(chosenRoots.map(index => json.nodes[index].name).sort(), [...includedGroups].sort());

const nodeIds = new Set([sourceRoot]);
function includeNode(index) {
  if (nodeIds.has(index)) return;
  nodeIds.add(index);
  for (const child of json.nodes[index].children || []) includeNode(child);
}
chosenRoots.forEach(includeNode);

const ordered = set => [...set].sort((a, b) => a - b);
const indexMap = ids => new Map(ids.map((id, index) => [id, index]));
const nodes = ordered(nodeIds);
const nodeMap = indexMap(nodes);
const meshIds = ordered(new Set(nodes.map(id => json.nodes[id].mesh).filter(Number.isInteger)));
const meshMap = indexMap(meshIds);
const meshes = meshIds.map(id => structuredClone(json.meshes[id]));

const materialIds = new Set();
const accessorIds = new Set();
for (const mesh of meshes) for (const primitive of mesh.primitives) {
  if (Number.isInteger(primitive.material)) materialIds.add(primitive.material);
  if (Number.isInteger(primitive.indices)) accessorIds.add(primitive.indices);
  for (const id of Object.values(primitive.attributes)) accessorIds.add(id);
  for (const target of primitive.targets || []) for (const id of Object.values(target)) accessorIds.add(id);
}
const materials = ordered(materialIds);
const accessors = ordered(accessorIds);
const materialMap = indexMap(materials);
const accessorMap = indexMap(accessors);
const viewIds = new Set();
for (const id of accessors) {
  const accessor = json.accessors[id];
  if (Number.isInteger(accessor.bufferView)) viewIds.add(accessor.bufferView);
  if (accessor.sparse) {
    viewIds.add(accessor.sparse.indices.bufferView);
    viewIds.add(accessor.sparse.values.bufferView);
  }
}
const views = ordered(viewIds);
const viewMap = indexMap(views);

const output = structuredClone(json);
output.nodes = nodes.map(id => {
  const node = structuredClone(json.nodes[id]);
  if (id === sourceRoot) node.children = chosenRoots.map(child => nodeMap.get(child));
  else if (node.children) node.children = node.children.map(child => nodeMap.get(child));
  if (Number.isInteger(node.mesh)) node.mesh = meshMap.get(node.mesh);
  return node;
});
output.scenes = [{...structuredClone(json.scenes[json.scene ?? 0]), nodes: [nodeMap.get(sourceRoot)]}];
output.scene = 0;
output.meshes = meshes.map(mesh => {
  for (const primitive of mesh.primitives) {
    if (Number.isInteger(primitive.material)) primitive.material = materialMap.get(primitive.material);
    if (Number.isInteger(primitive.indices)) primitive.indices = accessorMap.get(primitive.indices);
    for (const key of Object.keys(primitive.attributes)) primitive.attributes[key] = accessorMap.get(primitive.attributes[key]);
    for (const target of primitive.targets || []) for (const key of Object.keys(target)) target[key] = accessorMap.get(target[key]);
  }
  return mesh;
});
output.materials = materials.map(id => structuredClone(json.materials[id]));
output.accessors = accessors.map(id => {
  const accessor = structuredClone(json.accessors[id]);
  if (Number.isInteger(accessor.bufferView)) accessor.bufferView = viewMap.get(accessor.bufferView);
  if (accessor.sparse) {
    accessor.sparse.indices.bufferView = viewMap.get(accessor.sparse.indices.bufferView);
    accessor.sparse.values.bufferView = viewMap.get(accessor.sparse.values.bufferView);
  }
  return accessor;
});

const parts = [];
let binaryLength = 0;
output.bufferViews = views.map(id => {
  const view = structuredClone(json.bufferViews[id]);
  assert.equal(view.buffer, 0);
  const data = binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
  assert.equal(data.length, view.byteLength);
  view.byteOffset = binaryLength;
  parts.push(data);
  binaryLength += data.length;
  const padding = (4 - binaryLength % 4) % 4;
  if (padding) { parts.push(Buffer.alloc(padding)); binaryLength += padding; }
  return view;
});
output.buffers = [{byteLength: binaryLength}];
output.asset = {...output.asset, generator: 'build_campus_model.mjs (Văn Miếu groups from model_2.skp)'};

const jsonBytes = Buffer.from(JSON.stringify(output));
const jsonPadding = (4 - jsonBytes.length % 4) % 4;
const paddedJson = Buffer.concat([jsonBytes, Buffer.alloc(jsonPadding, 0x20)]);
const outputBinary = Buffer.concat(parts, binaryLength);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + paddedJson.length + 8 + outputBinary.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(paddedJson.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binaryHeader = Buffer.alloc(8);
binaryHeader.writeUInt32LE(outputBinary.length, 0);
binaryHeader.writeUInt32LE(0x004e4942, 4);
const campusGlb = Buffer.concat([header, jsonHeader, paddedJson, binaryHeader, outputBinary]);

const sceneBounds = includedGroups.map(name => manifest.source_layer_summary[name].bounds_m);
const bounds = [
  [Math.min(...sceneBounds.map(item => item[0][0])), Math.min(...sceneBounds.map(item => item[0][1]))],
  [Math.max(...sceneBounds.map(item => item[1][0])), Math.max(...sceneBounds.map(item => item[1][1]))]
];
const triangleCount = output.meshes.flatMap(mesh => mesh.primitives)
  .reduce((sum, primitive) => sum + output.accessors[primitive.indices].count / 3, 0);
const scene = {
  id: 'van-mieu',
  title: 'Văn Miếu – Quốc Tử Giám',
  url: 'data/model/van-mieu-campus.glb',
  glb_sha256: crypto.createHash('sha256').update(campusGlb).digest('hex'),
  source_glb_sha256: crypto.createHash('sha256').update(source).digest('hex'),
  source_groups: includedGroups,
  excluded_source_groups: rootNode.children.map(index => json.nodes[index].name).filter(name => !includedGroups.includes(name)),
  focus_bounds_m: bounds,
  triangles: triangleCount,
  placement_status: manifest.placement_status,
  individual_building_anchors: 'not_identified_in_source_model',
  architecture_reference: 'https://vanmieu.gov.vn/vi/visit/architecture'
};
fs.writeFileSync(path.join(modelDir, 'van-mieu-campus.glb'), campusGlb);
fs.writeFileSync(path.join(modelDir, 'campus-scene.json'), JSON.stringify(scene, null, 2) + '\n');
console.log(`Wrote ${scene.url}: ${triangleCount} triangles, ${(campusGlb.length / 1048576).toFixed(2)} MiB`);
