three.js r169 (MIT), https://cdn.jsdelivr.net/npm/three@0.169.0

- three.module.min.js: build/three.module.min.js, değiştirilmedi.
- addons/GLTFLoader.js, addons/BufferGeometryUtils.js, addons/RoomEnvironment.js: examples/jsm altından.
  Yalnız import yolları değişti: 'three' → '../three.module.min.js',
  '../utils/BufferGeometryUtils.js' → './BufferGeometryUtils.js'.
  Böylece import map gerekmez.
