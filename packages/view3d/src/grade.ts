import { Vector3 } from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

/** A sector's colour grade, as the content describes it (docs/ART_BIBLE.md). */
export interface Grade {
  lift: [number, number, number];
  gain: [number, number, number];
  saturation: number;
  contrast: number;
  vignette: number;
}

/** No change but a light vignette: what a sector without its own grade gets. */
export const NEUTRAL_GRADE: Grade = {
  lift: [0, 0, 0],
  gain: [1, 1, 1],
  saturation: 1,
  contrast: 1,
  vignette: 0.25,
};

/**
 * The last pass, on the tone-mapped image: lift, gain, saturation and contrast give each
 * sector its mood without touching a material, and the vignette pulls the eye to the ship.
 */
export function createGradePass(grade: Grade = NEUTRAL_GRADE): ShaderPass {
  return new ShaderPass({
    name: "GradeShader",
    uniforms: {
      tDiffuse: { value: null },
      lift: { value: new Vector3(...grade.lift) },
      gain: { value: new Vector3(...grade.gain) },
      saturation: { value: grade.saturation },
      contrast: { value: grade.contrast },
      vignette: { value: grade.vignette },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec3 lift;
      uniform vec3 gain;
      uniform float saturation;
      uniform float contrast;
      uniform float vignette;
      varying vec2 vUv;
      void main() {
        vec4 source = texture2D(tDiffuse, vUv);
        vec3 c = source.rgb;
        c = c * gain + lift * (1.0 - c);
        float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(luma), c, saturation);
        c = (c - 0.5) * contrast + 0.5;
        vec2 d = vUv - 0.5;
        c *= 1.0 - vignette * smoothstep(0.35, 0.85, length(d * vec2(1.25, 1.0)));
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), source.a);
      }`,
  });
}
