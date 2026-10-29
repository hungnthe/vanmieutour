import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// A MapLibre custom layer shares the map's WebGL context and camera.
// GLB axes: X = source X, Y = source Z, Z = -source Y, all in metres.
class SketchUpLayer {
  id = 'sketchup-model';
  type = 'custom';
  renderingMode = '3d';
  visible = true;
  removed = false;
  constructor(config, scene) {
    this.config = config;
    this.scene = scene;
    for (const [name,visible] of Object.entries(config.sketchup_layer_defaults || {})) {
      const object = scene.getObjectByName(name);
      if (object) object.visible = visible;
    }
    this.camera = new THREE.Camera();
    this.scene.traverse(object => { if (object.isMesh) object.frustumCulled = false; });
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xa6a297, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(-300, 700, 200);
    this.scene.add(sun);
  }
  onAdd(map, gl) {
    this.map = map;
    const anchor = maplibregl.MercatorCoordinate.fromLngLat(this.config.origin, 0);
    const k = anchor.meterInMercatorCoordinateUnits();
    const [[a,b],[c,d]] = this.config.matrix;
    this.modelMatrix = new THREE.Matrix4().set(
      k*a, 0, -k*c, anchor.x,
      -k*b, 0, k*d, anchor.y,
      0, k, 0, k*this.config.vertical_offset_m,
      0, 0, 0, 1
    );
    this.renderer = new THREE.WebGLRenderer({canvas:map.getCanvas(),context:gl,antialias:true});
    this.renderer.autoClear = false;
  }
  render(gl, args) {
    if (!this.visible || this.removed) return;
    this.camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix).multiply(this.modelMatrix);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }
  setVisible(value) { this.visible = value; this.map?.triggerRepaint(); }
  setGroupVisible(name,value) {
    const object=this.scene.getObjectByName(name);
    if (object) object.visible=Boolean(value);
    this.map?.triggerRepaint();
  }
  dispose() {
    if (this.removed) return;
    this.removed = true;
    this.scene.traverse(object => {
      object.geometry?.dispose();
      for (const material of [object.material].flat().filter(Boolean)) material.dispose();
    });
    // dispose frees Three resources; never forceContextLoss on MapLibre's shared GL.
    this.renderer?.dispose();
  }
  onRemove() { this.dispose(); }
}

window.HeritageSketchUp = {
  async load(signal) {
    const inline = window.HERITAGE_SKETCHUP_DATA;
    const read = async (url, type) => {
      const response = await fetch(url, {signal});
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return response[type]();
    };
    const [placement, campus] = await Promise.all([
      inline?.config || read('data/model/manifest.json', 'json'),
      inline?.campus || read('data/model/campus-scene.json', 'json')
    ]);
    const buffer = inline
      ? Uint8Array.from(atob(inline.glb), c => c.charCodeAt(0)).buffer
      : await read(campus.url, 'arrayBuffer');
    if (signal.aborted) throw new DOMException('Aborted','AbortError');
    if (!Array.isArray(placement.origin) || placement.origin.length !== 2 || !placement.matrix?.flat().every(Number.isFinite)) throw new Error('Invalid model placement');
    if (!Array.isArray(campus.focus_bounds_m) || campus.source_groups?.length !== 3) throw new Error('Invalid campus scene');
    const config = {...placement, campus, sketchup_layer_defaults:Object.fromEntries(campus.source_groups.map(name => [name,true]))};
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    const layer = new SketchUpLayer(config, gltf.scene);
    if (signal.aborted) { layer.dispose(); throw new DOMException('Aborted','AbortError'); }
    return layer;
  }
};
