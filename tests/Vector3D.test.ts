import { describe, it, expect } from 'vitest';
import { Vector3D } from '../src/core/Vector3D';

describe('Vector3D', () => {
  it('should create a vector with default values', () => {
    const v = new Vector3D();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
  });

  it('should create a vector with specified values', () => {
    const v = new Vector3D(1, 2, 3);
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
    expect(v.z).toBe(3);
  });

  it('should clone a vector', () => {
    const v1 = new Vector3D(1, 2, 3);
    const v2 = v1.clone();
    expect(v2.x).toBe(1);
    expect(v2.y).toBe(2);
    expect(v2.z).toBe(3);
    expect(v1).not.toBe(v2);
  });

  it('should add two vectors', () => {
    const v1 = new Vector3D(1, 2, 3);
    const v2 = new Vector3D(4, 5, 6);
    const result = v1.add(v2);
    expect(result.x).toBe(5);
    expect(result.y).toBe(7);
    expect(result.z).toBe(9);
  });

  it('should subtract two vectors', () => {
    const v1 = new Vector3D(5, 7, 9);
    const v2 = new Vector3D(1, 2, 3);
    const result = v1.subtract(v2);
    expect(result.x).toBe(4);
    expect(result.y).toBe(5);
    expect(result.z).toBe(6);
  });

  it('should scale a vector', () => {
    const v = new Vector3D(2, 3, 4);
    const scaled = v.scale(2);
    expect(scaled.x).toBe(4);
    expect(scaled.y).toBe(6);
    expect(scaled.z).toBe(8);
  });

  it('should calculate vector length', () => {
    const v = new Vector3D(3, 4, 0);
    expect(v.length()).toBe(5); // 3-4-5 triangle
  });

  it('should calculate distance between two points', () => {
    const v1 = new Vector3D(0, 0, 0);
    const v2 = new Vector3D(3, 4, 0);
    expect(v1.distanceTo(v2)).toBe(5);
  });

  it('should calculate dot product', () => {
    const v1 = new Vector3D(1, 2, 3);
    const v2 = new Vector3D(4, 5, 6);
    expect(v1.dot(v2)).toBe(1 * 4 + 2 * 5 + 3 * 6); // 32
  });

  it('should calculate cross product', () => {
    const v1 = new Vector3D(1, 0, 0);
    const v2 = new Vector3D(0, 1, 0);
    const result = v1.cross(v2);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.z).toBe(1);
  });

  it('should normalize a vector', () => {
    const v = new Vector3D(3, 4, 0);
    const normalized = v.normalize();
    expect(normalized.length()).toBeCloseTo(1, 10);
    expect(normalized.x).toBeCloseTo(0.6, 10);
    expect(normalized.y).toBeCloseTo(0.8, 10);
  });

  it('should normalize zero vector to zero', () => {
    const v = new Vector3D(0, 0, 0);
    const normalized = v.normalize();
    expect(normalized.x).toBe(0);
    expect(normalized.y).toBe(0);
    expect(normalized.z).toBe(0);
  });

  it('should check equality', () => {
    const v1 = new Vector3D(1, 2, 3);
    const v2 = new Vector3D(1, 2, 3);
    const v3 = new Vector3D(1, 2, 4);
    expect(v1.equals(v2)).toBe(true);
    expect(v1.equals(v3)).toBe(false);
  });

  it('should check equality with epsilon tolerance', () => {
    const v1 = new Vector3D(1, 2, 3);
    const v2 = new Vector3D(1.0000001, 2.0000001, 3.0000001);
    expect(v1.equals(v2, 1e-6)).toBe(true);
    expect(v1.equals(v2, 1e-8)).toBe(false);
  });

  it('should serialize to JSON', () => {
    const v = new Vector3D(1, 2, 3);
    const json = v.toJSON();
    expect(json).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('should deserialize from JSON', () => {
    const json = { x: 1, y: 2, z: 3 };
    const v = Vector3D.fromJSON(json);
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
    expect(v.z).toBe(3);
  });
});
