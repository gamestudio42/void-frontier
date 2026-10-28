import type { Vec2 } from '@void-frontier/kernel';
import { Vector3 } from 'three';

/** The simulation plane is X right, Y up; in three.js it lies on XZ with sim Y = -Z. */
export const toScene = (v: Vec2, height = 0, out = new Vector3()): Vector3 => out.set(v.x, height, -v.y);
export const fromScene = (v: Vector3): Vec2 => ({ x: v.x, y: -v.z });
