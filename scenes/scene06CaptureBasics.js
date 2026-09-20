import { createCaptureScene } from './captureScene.js?v=2026-09-20.capture-native1';
import { CAPTURE_SCENARIOS } from './captureNativePolicy.js?v=2026-09-20.capture-native1';

// Keep the existing entry ID so saved progress and links remain valid.
export const scene06CaptureBasics = createCaptureScene({ id: 'scene-06-capture-basics', scenario: CAPTURE_SCENARIOS[0] });
export const scene06CaptureEdge = createCaptureScene({ id: 'scene-06-capture-edge', scenario: CAPTURE_SCENARIOS[1] });
export const scene06CaptureGroup = createCaptureScene({ id: 'scene-06-capture-group', scenario: CAPTURE_SCENARIOS[2] });
